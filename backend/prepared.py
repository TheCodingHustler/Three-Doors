"""Durable, versioned SDK preprocessing results. Publishing never overwrites a good run."""
import json
from contextlib import contextmanager
import math
import re
import sqlite3
import time
from pathlib import Path
from uuid import uuid4

PIPELINE_VERSION = "surface-pins-1"
TTL_SECONDS = 24 * 60 * 60
DEFAULT_PATH = Path(__file__).resolve().parent.parent / ".data" / "walkthroughs.sqlite3"


def vector(value):
    return (isinstance(value, dict) and all(type(value.get(axis)) in (int, float)
            and math.isfinite(value[axis]) for axis in ("x", "y", "z")))


def clean_findings(items, localized):
    if not isinstance(items, list) or len(items) > 8:
        raise ValueError("Invalid prepared findings")
    result = []
    for item in items:
        if not isinstance(item, dict) or not all(isinstance(item.get(key), str) for key in ("title", "detail")):
            raise ValueError("Invalid finding text")
        clean = {"title": item["title"][:100], "detail": item["detail"][:600]}
        box = item.get("box_2d")
        if (isinstance(box, list) and len(box) == 4
                and all(type(v) in (int, float) and math.isfinite(v) and 0 <= v <= 1000 for v in box)
                and box[0] < box[2] and box[1] < box[3]):
            clean["box_2d"] = box
        if localized:
            anchor = item.get("anchor") or {}
            if not isinstance(anchor, dict):
                raise ValueError("Invalid prepared anchor")
            rotation = anchor.get("rotation") or {}
            if not isinstance(rotation, dict):
                raise ValueError("Invalid camera rotation")
            if (not vector(anchor.get("position")) or not vector(anchor.get("cameraPosition"))
                    or not isinstance(anchor.get("scanId"), str)
                    or not all(type(rotation.get(axis)) in (int, float) and math.isfinite(rotation[axis]) for axis in ("x", "y"))
                    or type(anchor.get("zoom")) not in (int, float) or not 0 < anchor["zoom"] <= 100):
                raise ValueError("Invalid prepared anchor")
            clean["anchor"] = {key: anchor[key] for key in ("position", "cameraPosition", "scanId", "rotation", "zoom")}
        else:
            clean["placementReason"] = str(item.get("placementReason", "No reliable surface position"))[:300]
        result.append(clean)
    return result


class PreparedStore:
    def __init__(self, path=DEFAULT_PATH):
        self.path = Path(path)

    @contextmanager
    def connect(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(self.path, timeout=15)
        connection.row_factory = sqlite3.Row
        connection.executescript("""
          CREATE TABLE IF NOT EXISTS jobs (
            id TEXT PRIMARY KEY, model_id TEXT, profile TEXT, pipeline TEXT,
            status TEXT, created REAL, published REAL, expires REAL, payload TEXT);
          CREATE TABLE IF NOT EXISTS views (
            job_id TEXT, view_id TEXT, payload TEXT, mime TEXT, image BLOB,
            PRIMARY KEY (job_id, view_id));
        """)
        try:
            with connection:
                yield connection
        finally:
            connection.close()

    def start(self, model_id, profile, fingerprint, plan, geometry, source):
        if not isinstance(fingerprint, str) or not re.fullmatch(r"[a-f0-9]{64}", fingerprint):
            raise ValueError("Invalid model fingerprint")
        if not isinstance(plan, list) or not 1 <= len(plan) <= 24:
            raise ValueError("Prepare between one and 24 views")
        for view in plan:
            if not isinstance(view, dict):
                raise ValueError("Invalid capture plan")
            if "scanUuid" in view and not isinstance(view["scanUuid"], str):
                raise ValueError("Invalid scan UUID")
            rotation = view.get("rotation", {})
            if not isinstance(rotation, dict):
                raise ValueError("Invalid capture rotation")
            if (not isinstance(view.get("scanId"), str) or not view["scanId"]
                    or not all(type(rotation.get(a)) in (int, float) and math.isfinite(rotation[a]) for a in ("x", "y"))):
                raise ValueError("Invalid capture plan")
        job_id = uuid4().hex
        payload = {"fingerprint": fingerprint, "plan": plan, "geometry": geometry, "source": source}
        with self.connect() as db:
            previous = db.execute("SELECT * FROM jobs WHERE model_id=? AND profile=? AND pipeline=? AND status='preparing' ORDER BY created DESC LIMIT 1",
                                  (model_id, profile, PIPELINE_VERSION)).fetchone()
            if previous:
                saved_payload = json.loads(previous["payload"])
                if saved_payload["fingerprint"] == fingerprint and saved_payload["plan"] == plan:
                    views = db.execute("SELECT view_id,payload FROM views WHERE job_id=?", (previous["id"],)).fetchall()
                    return {"jobId": previous["id"], "plannedViews": len(plan),
                            "completedViews": [int(row["view_id"]) for row in views],
                            "localizedCount": sum(len(json.loads(row["payload"])["localized"]) for row in views)}
            db.execute("INSERT INTO jobs VALUES (?,?,?,?,?,?,?,?,?)", (job_id, model_id, profile, PIPELINE_VERSION,
                       "preparing", time.time(), None, None, json.dumps(payload, allow_nan=False)))
        return {"jobId": job_id, "plannedViews": len(plan)}

    def save_view(self, job_id, view_id, localized, unplaced, mime, image):
        if not isinstance(job_id, str):
            raise ValueError("Invalid preparation job")
        localized = clean_findings(localized, True)
        unplaced = clean_findings(unplaced, False)
        with self.connect() as db:
            job = db.execute("SELECT * FROM jobs WHERE id=?", (job_id,)).fetchone()
            if not job or job["status"] != "preparing":
                raise ValueError("This preparation job is not active")
            plan = json.loads(job["payload"])["plan"]
            if type(view_id) is not int or not 0 <= view_id < len(plan):
                raise ValueError("Invalid prepared view")
            expected = plan[view_id]
            for finding in localized:
                if finding["anchor"]["scanId"] != expected["scanId"]:
                    raise ValueError("Finding does not belong to the planned scan")
            db.execute("INSERT OR REPLACE INTO views VALUES (?,?,?,?,?)", (job_id, str(view_id),
                       json.dumps({"localized": localized, "unplaced": unplaced, "scanId": expected["scanId"], "scanUuid": expected.get("scanUuid", "")}, allow_nan=False), mime, image))
        return {"saved": True}

    def publish(self, job_id):
        if not isinstance(job_id, str):
            raise ValueError("Invalid preparation job")
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            job = db.execute("SELECT * FROM jobs WHERE id=?", (job_id,)).fetchone()
            if not job or job["status"] != "preparing":
                raise ValueError("This preparation job is not active")
            count = db.execute("SELECT COUNT(*) FROM views WHERE job_id=?", (job_id,)).fetchone()[0]
            if count != len(json.loads(job["payload"])["plan"]):
                raise ValueError("Every planned view must finish before publishing. Previous results remain available.")
            now = time.time()
            db.execute("UPDATE jobs SET status='published', published=?, expires=? WHERE id=?", (now, now + TTL_SECONDS, job_id))
        return {"published": True, "versionId": job_id, "reviewedViews": count}

    def progress(self, model_id, profile):
        if not self.path.exists():
            return None
        with self.connect() as db:
            job = db.execute("SELECT * FROM jobs WHERE model_id=? AND profile=? ORDER BY created DESC LIMIT 1", (model_id, profile)).fetchone()
            if not job:
                return None
            count = db.execute("SELECT COUNT(*) FROM views WHERE job_id=?", (job["id"],)).fetchone()[0]
        payload = json.loads(job["payload"])
        return {"status": job["status"], "savedViews": count, "plannedViews": len(payload["plan"]),
                "fingerprint": payload["fingerprint"], "plan": payload["plan"]}

    def load(self, model_id, profile, *, images=False):
        if not self.path.exists():
            return None
        with self.connect() as db:
            job = db.execute("SELECT * FROM jobs WHERE model_id=? AND profile=? AND pipeline=? AND status='published' AND expires>? ORDER BY published DESC LIMIT 1",
                             (model_id, profile, PIPELINE_VERSION, time.time())).fetchone()
            if not job:
                return None
            payload = json.loads(job["payload"])
            views = db.execute("SELECT * FROM views WHERE job_id=? ORDER BY CAST(view_id AS INTEGER)", (job["id"],)).fetchall()
        findings, evidence, scan_evidence = [], {}, {}
        for view in views:
            data = json.loads(view["payload"])
            evidence_id = "prepared-" + view["view_id"]
            scan_evidence[data["scanId"]] = evidence_id
            if data.get("scanUuid"):
                scan_evidence[data["scanUuid"]] = evidence_id
            if images:
                evidence[evidence_id] = ("Prepared walkthrough view " + str(int(view["view_id"]) + 1), bytes(view["image"]), view["mime"], data["scanId"])
            for index, item in enumerate(data["localized"] + data["unplaced"]):
                finding = {**item, "evidence": evidence_id}
                if item.get("anchor"):
                    finding["preparedMarkerId"] = view["view_id"] + "-" + str(index)
                findings.append(finding)
        deduplicated = []
        for finding in findings:
            anchor = finding.get("anchor")
            if anchor and any(other.get("anchor") and other["title"].casefold() == finding["title"].casefold()
                              and math.dist([anchor["position"][axis] for axis in ("x", "y", "z")],
                                            [other["anchor"]["position"][axis] for axis in ("x", "y", "z")]) < 0.4
                              for other in deduplicated):
                continue
            deduplicated.append(finding)
        return {"versionId": job["id"], "modelId": model_id, "profile": profile,
                "pipelineVersion": job["pipeline"], "preparedAt": job["published"], "expiresAt": job["expires"],
                "modelFingerprint": payload["fingerprint"], "reviewedViews": len(views),
                "findings": deduplicated, "scanEvidence": scan_evidence, "geometry": payload["geometry"], "source": payload["source"], "images": evidence}
