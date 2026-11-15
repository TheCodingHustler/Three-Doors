import tempfile
import os
import unittest
from pathlib import Path
from unittest.mock import patch

from backend import prepared
from backend.server import AuditStore, location_report


GEOMETRY = {"walls": [], "scans": [], "rooms": [], "status": "Saved geometry"}
FINDING = {"title": "Door hardware", "detail": "A knob may require twisting.", "box_2d": [100, 100, 400, 400],
           "anchor": {"position": {"x": 1, "y": 1, "z": 1}, "cameraPosition": {"x": 1, "y": 1, "z": 0},
                      "scanId": "scan", "rotation": {"x": 0, "y": 90}, "zoom": 1}}


class PreparedTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.store = prepared.PreparedStore(Path(self.temp.name) / "cache.sqlite3")

    def tearDown(self):
        self.temp.cleanup()

    def job(self, model="clinic", count=1):
        return self.store.start(model, "step-free", "a" * 64,
                                [{"scanId": "scan", "rotation": {"x": 0, "y": 90}}] * count,
                                GEOMETRY, "Matterport geometry")["jobId"]

    def save(self, job, index=0, findings=None):
        self.store.save_view(job, index, [FINDING] if findings is None else findings, [], "image/jpeg", b"\xff\xd8\xffevidence")

    def test_persists_across_restarts_with_profile_and_model_isolation(self):
        job = self.job(); self.save(job); self.store.publish(job)
        reloaded = prepared.PreparedStore(self.store.path).load("clinic", "step-free", images=True)
        self.assertEqual(reloaded["findings"][0]["anchor"], FINDING["anchor"])
        self.assertEqual(reloaded["images"]["prepared-0"][1], b"\xff\xd8\xffevidence")
        self.assertIsNone(self.store.load("other-clinic", "step-free"))
        self.assertIsNone(self.store.load("clinic", "low-vision"))

    def test_partial_refresh_does_not_replace_last_success(self):
        old = self.job(); self.save(old); self.store.publish(old)
        refresh = self.job(count=2); self.save(refresh)
        with self.assertRaisesRegex(ValueError, "Every planned view"):
            self.store.publish(refresh)
        self.assertEqual(self.store.load("clinic", "step-free")["versionId"], old)
        self.save(refresh, 1); self.store.publish(refresh)
        self.assertEqual(self.store.load("clinic", "step-free")["versionId"], refresh)
        self.assertEqual(len(self.store.load("clinic", "step-free")["findings"]), 1)

    def test_version_and_age_invalidate_cached_results(self):
        job = self.job(); self.save(job); self.store.publish(job)
        with patch("backend.prepared.PIPELINE_VERSION", "next-version"):
            self.assertIsNone(self.store.load("clinic", "step-free"))
        with patch("backend.prepared.time.time", return_value=10**12):
            self.assertIsNone(self.store.load("clinic", "step-free"))

    def test_interrupted_job_resumes_without_losing_completed_views(self):
        job = self.job(count=2); self.save(job)
        resumed = self.store.start("clinic", "step-free", "a" * 64,
                                   [{"scanId": "scan", "rotation": {"x": 0, "y": 90}}] * 2,
                                   GEOMETRY, "Matterport geometry")
        self.assertEqual(resumed["jobId"], job)
        self.assertEqual(resumed["completedViews"], [0])
        self.assertEqual(resumed["localizedCount"], 1)

    def test_zero_findings_is_a_valid_completed_review(self):
        job = self.job(); self.save(job, findings=[]); self.store.publish(job)
        self.assertEqual(self.store.load("clinic", "step-free")["findings"], [])

    def test_rejects_wrong_scan_and_invalid_coordinates(self):
        job = self.job()
        wrong = {**FINDING, "anchor": {**FINDING["anchor"], "scanId": "other"}}
        with self.assertRaisesRegex(ValueError, "planned scan"):
            self.save(job, findings=[wrong])
        bad = {**FINDING, "anchor": {**FINDING["anchor"], "position": {"x": float("nan"), "y": 0, "z": 0}}}
        with self.assertRaisesRegex(ValueError, "anchor"):
            self.save(job, findings=[bad])

    def test_cached_report_preserves_indoor_review_when_arrival_is_unavailable(self):
        job = self.job(); self.save(job); self.store.publish(job)
        record = {"id": "clinic", "name": "Clinic", "address": "7440 Cypress Creek Pky", "city": "Houston"}
        with patch("backend.server.providers.matterport") as matterport, patch("backend.server.providers.vexcel", return_value=({}, "Unavailable")) as vexcel, patch("backend.server.gemini_request") as gemini:
            report = location_report({"building": "clinic", "profile": "step-free"}, {"clinic": record}, AuditStore(), self.store)
        matterport.assert_not_called(); vexcel.assert_called_once_with(record); gemini.assert_not_called()
        self.assertEqual(report["ai"]["reviewed"], ["Matterport"])
        self.assertIn("arrival review unavailable", report["ai"]["status"])
        self.assertEqual(report["evidence"][0]["id"], report["ai"]["observations"][0]["evidence"])
        self.assertEqual(report["preparedWalkthrough"]["versionId"], job)
        self.assertNotIn("images", report["preparedWalkthrough"])

    def test_cached_report_restores_aerial_image_and_gemini_circle_coordinates(self):
        job = self.job(); self.save(job); self.store.publish(job)
        record = {"id": "clinic", "name": "Clinic", "address": "1 Main St", "city": "Houston"}
        aerial = {"aerial": ("Vexcel overhead imagery", b"aerial", "image/jpeg", None)}
        box = [100, 200, 300, 400]
        review = {"observations": [{"title": "Crossing", "detail": "Painted crossing near parking.", "box_2d": box}],
                  "confirmations": ["Ask staff which entrance the crossing leads to."], "limitations": "Overhead view only."}
        audits = AuditStore()
        with patch.dict(os.environ, {"GEMINI_API_KEY": "test-key"}), \
                patch("backend.server.providers.matterport") as matterport, \
                patch("backend.server.providers.vexcel", return_value=(aerial, "Aerial imagery loaded")), \
                patch("backend.server.gemini_request", return_value=review) as gemini:
            report = location_report({"building": "clinic", "profile": "step-free"}, {"clinic": record}, audits, self.store)
        matterport.assert_not_called()
        gemini.assert_called_once()
        parts = gemini.call_args.args[0]["contents"][0]["parts"]
        self.assertIn("Vexcel overhead image", parts[0]["text"])
        self.assertEqual(parts[1]["inline_data"]["data"], "YWVyaWFs")
        self.assertEqual(report["ai"]["reviewed"], ["Matterport", "Vexcel"])
        self.assertEqual(report["ai"]["observations"][0]["anchor"], FINDING["anchor"])
        self.assertEqual(report["ai"]["observations"][-1]["evidence"], "aerial")
        self.assertEqual(report["ai"]["observations"][-1]["box_2d"], box)
        self.assertIn(review["confirmations"][0], report["ai"]["confirmations"])
        evidence = next(item for item in report["evidence"] if item["id"] == "aerial")
        self.assertEqual(evidence["url"], f'/api/evidence/{report["auditId"]}/aerial')
        self.assertEqual(audits.get(report["auditId"])[1]["aerial"][1], b"aerial")
