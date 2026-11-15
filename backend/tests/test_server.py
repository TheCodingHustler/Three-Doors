import base64
import json
import os
import urllib.error
import urllib.request
import unittest
from http.server import ThreadingHTTPServer
from threading import Thread
from unittest.mock import patch

from backend.server import AuditStore, Handler, GeminiServiceError, decode_image, gemini_request, gemini_review, location_report, parse_gemini_response, validate_submission


class ImageValidationTests(unittest.TestCase):
    def test_accepts_matching_png_signature(self):
        raw = b"\x89PNG\r\n\x1a\n" + b"sample"
        self.assertEqual(decode_image("image/png", base64.b64encode(raw).decode("ascii")), raw)

    def test_rejects_mime_type_mismatch(self):
        raw = b"\x89PNG\r\n\x1a\n" + b"sample"
        encoded = base64.b64encode(raw).decode("ascii")
        with self.assertRaisesRegex(ValueError, "does not match"):
            decode_image("image/jpeg", encoded)

    def test_rejects_unsupported_mime_type(self):
        with self.assertRaisesRegex(ValueError, "JPG, PNG, or WebP"):
            decode_image("image/gif", "Z2lm")

    def test_rejects_non_string_profile(self):
        with self.assertRaisesRegex(ValueError, "valid venue label"):
            validate_submission({"building": "Clinic", "profile": [], "mimeType": "image/png"})


class GeminiResponseTests(unittest.TestCase):
    def test_parses_structured_response_and_limits_observations(self):
        model_text = json.dumps({
            "summary": "A visible entrance is shown.",
            "observations": [{"title": "Door", "detail": "Width is unknown.",
                              "impact": "A tight doorway could make wheelchair entry harder."}],
            "confirmations": ["Ask staff to confirm clearance."],
            "limitations": "One photo only.",
        })
        body = json.dumps({"candidates": [{"content": {"parts": [{"text": model_text}]}}]}).encode()
        result = parse_gemini_response(body)
        self.assertEqual(result["source"], "Gemini photo review")
        self.assertEqual(result["observations"][0]["title"], "Door")
        self.assertEqual(result["observations"][0]["impact"],
                         "A tight doorway could make wheelchair entry harder.")

    def test_validates_barrier_boxes_without_losing_text_findings(self):
        boxes = [[100, 200, 300, 400], [], [300, 200, 100, 400],
                 [-1, 0, 300, 400], [0, 0, 1001, 400], [True, 0, 300, 400],
                 [0, 0, float("nan"), 400], "100,200,300,400"]
        report = {"summary": "Review", "limitations": "Sampled views",
                  "confirmations": [], "observations": [
                      {"title": "Threshold", "detail": "Possible obstacle",
                       "evidence": "interior-1", "box_2d": box} for box in boxes]}
        body = json.dumps({"candidates": [{"content": {"parts": [
            {"text": json.dumps(report)}]}}]}).encode()
        observations = parse_gemini_response(body)["observations"]
        self.assertEqual(observations[0]["box_2d"], boxes[0])
        self.assertEqual(len(observations), len(boxes))
        self.assertTrue(all("box_2d" not in item for item in observations[1:]))

    def test_surface_anchor_must_be_inside_its_evidence_box(self):
        report = {"summary": "Review", "limitations": "One view", "confirmations": [],
                  "observations": [{"title": "Door", "detail": "Possible obstacle",
                                    "box_2d": [100, 200, 900, 800], "anchor_2d": point}
                                   for point in ([800, 220], [0, 0], [True, 220])]}
        body = json.dumps({"candidates": [{"content": {"parts": [{"text": json.dumps(report)}]}}]}).encode()
        observations = parse_gemini_response(body)["observations"]
        self.assertEqual(observations[0]["anchor_2d"], [800, 220])
        self.assertNotIn("anchor_2d", observations[1])
        self.assertNotIn("anchor_2d", observations[2])

    def test_compact_frame_review_requires_findings_but_no_full_report(self):
        def response(report):
            return json.dumps({"candidates": [{"content": {"parts": [{"text": json.dumps(report)}]}}]}).encode()
        body = response({"observations": [{"title": "Door handle", "detail": "May require twisting.",
                                          "box_2d": [100, 200, 400, 500], "anchor_2d": [250, 350]}]})
        result = parse_gemini_response(body, compact=True)
        self.assertEqual(result["observations"][0]["anchor_2d"], [250, 350])
        with self.assertRaises(GeminiServiceError):
            parse_gemini_response(response({}), compact=True)
        with self.assertRaises(GeminiServiceError):
            parse_gemini_response(body)

    def test_rejects_unstructured_response(self):
        body = json.dumps({"candidates": [{"content": {"parts": [{"text": "not json"}]}}]}).encode()
        with self.assertRaises(GeminiServiceError):
            parse_gemini_response(body)

    def test_temporary_gemini_outage_has_retry_guidance(self):
        error = urllib.error.HTTPError("https://example.test", 503, "Unavailable", {}, None)
        with patch.dict(os.environ, {"GEMINI_API_KEY": "test-key"}):
            with patch("backend.server.urlopen", side_effect=error):
                with self.assertRaisesRegex(GeminiServiceError, "high demand.*Try again shortly"):
                    gemini_request({})

    def test_location_report_does_not_require_photo(self):
        record = {
            "id": "abc12345678", "name": "West Clinic", "address": "1 Main St", "city": "Los Angeles",
            "property_source": "CoStar commercial-property export",
        }
        report = location_report(
            {"building": record["id"], "profile": "low-vision"}, {record["id"]: record}
        )
        self.assertEqual(report["profile"], "low-vision")
        self.assertEqual(report["sources"]["CoStar"], "CoStar commercial-property export")
        route_evidence = next(item for item in report["observations"] if item["title"] == "Indoor scan evidence")
        self.assertIn("No route can be estimated", route_evidence["detail"])

    def test_review_targets_each_provider_and_links_its_evidence(self):
        images = {
            "interior-1": ("Matterport scan Lobby", b"jpeg", "image/jpeg", "scan-1"),
            "aerial": ("Vexcel overhead imagery", b"aerial", "image/jpeg", None),
        }
        response = {
            "source": "Gemini photo review",
            "summary": "A sampled viewpoint shows a possible barrier.",
            "observations": [
                {"title": "Threshold", "detail": "A raised threshold is visible.", "evidence": "interior-1"},
                {"title": "Narrow room", "detail": "Room width warrants an on-site check.", "evidence": "room-1"},
                {"title": "Unsupported", "detail": "No evidence for this finding.", "evidence": "aerial"},
            ],
            "confirmations": ["Ask staff whether an alternate entrance is available."],
            "limitations": "A still view cannot establish route continuity.",
        }
        aerial_response = {
            "summary": "Parking area is visible.",
            "observations": [{"title": "Arrival", "detail": "Marked crossing in the image."}],
            "confirmations": ["Ask staff about the crossing."],
            "limitations": "Overhead view only.",
        }
        def provider_response(payload):
            schema = payload["generationConfig"]["responseSchema"]
            return response if "evidence" in schema["properties"]["observations"]["items"]["required"] else aerial_response
        with patch.dict(os.environ, {"GEMINI_API_KEY": "test-key"}):
            with patch("backend.server.gemini_request", side_effect=provider_response) as gemini:
                result = gemini_review({"name": "West Clinic"}, "step-free", images)
        self.assertEqual(gemini.call_count, 2)
        payloads = [call.args[0] for call in gemini.call_args_list]
        payload = next(item for item in payloads if "Vexcel overhead image" not in item["contents"][0]["parts"][0]["text"])
        aerial_payload = next(item for item in payloads if item is not payload)
        self.assertIn("Vexcel overhead image", aerial_payload["contents"][0]["parts"][0]["text"])
        self.assertEqual(aerial_payload["contents"][0]["parts"][1]["inline_data"]["data"], "YWVyaWFs")
        self.assertIn("Ask staff about the crossing.", result["confirmations"])
        self.assertIn("Matterport and Vexcel", result["status"])
        text_parts = [part["text"] for part in payload["contents"][0]["parts"] if "text" in part]
        prompt = " ".join(text_parts)
        self.assertIn("wheelchair users", prompt)
        self.assertIn("doorway clearance", prompt)
        self.assertIn("curb ramps, nearby parking", aerial_payload["contents"][0]["parts"][0]["text"])
        self.assertEqual(len([part for part in payload["contents"][0]["parts"] if "inline_data" in part]), 1)
        self.assertEqual([item["evidence"] for item in result["observations"]], ["interior-1", "aerial"])
        self.assertEqual(result["reviewed"], ["Matterport", "Vexcel"])
        self.assertIn("Live", result["status"])

    def test_aerial_only_review_and_partial_fallback(self):
        aerial = {"aerial": ("Arrival area", b"jpg", "image/jpeg", None)}
        indoor = {"interior-1": ("Interior view", b"jpg", "image/jpeg", "scan-1")}
        response = {"summary": "Crossing visible", "observations": [{"title": "Crossing", "detail": "Paint is visible"}],
                    "confirmations": [], "limitations": "Overhead view only"}
        with patch.dict(os.environ, {"GEMINI_API_KEY": "test-key"}):
            with patch("backend.server.gemini_request", return_value=response) as gemini:
                result = gemini_review({"name": "Clinic"}, "low-vision", aerial)
                self.assertEqual(gemini.call_count, 1)
                self.assertEqual(result["status"], "Live · Vexcel review")
                self.assertEqual(result["observations"][0]["evidence"], "aerial")
                self.assertEqual(result["reviewed"], ["Vexcel"])
            with patch("backend.server.review_walkthrough", side_effect=GeminiServiceError("Unavailable")):
                with patch("backend.server.gemini_request", return_value=response):
                    partial = gemini_review({"name": "Clinic"}, "low-vision", {**indoor, **aerial})
        self.assertEqual(partial["status"], "Partial · Vexcel reviewed")
        self.assertIn("Matterport review unavailable", partial["limitations"])
        self.assertEqual(partial["observations"][0]["evidence"], "aerial")

    def test_failed_walkthrough_preserves_provider_evidence(self):
        record = {"id": "abc12345678", "name": "Clinic", "address": "1 Main St", "city": "Houston"}
        images = {"interior-1": ("Entrance view", b"test", "image/jpeg", "scan-1")}
        with patch.dict(os.environ, {"GEMINI_API_KEY": "test-key"}):
            with patch("backend.server.providers.matterport", return_value=({}, images, "Loaded")):
                with patch("backend.server.providers.vexcel", return_value=({}, "Unavailable")):
                    with patch("backend.server.gemini_request", side_effect=GeminiServiceError("Incomplete review")):
                        report = location_report({"building": record["id"], "profile": "step-free"},
                                                 {record["id"]: record}, AuditStore())
        self.assertIn("Fallback", report["ai"]["status"])
        self.assertEqual(report["evidence"][0]["scanId"], "scan-1")

    def test_location_report_returns_matterport_viewer_without_images(self):
        record = {"id": "abc12345678", "name": "West Clinic", "address": "1 Main St", "city": "Los Angeles"}
        with patch("backend.server.providers.matterport", return_value=(None, {}, "Credentials missing")):
            with patch("backend.server.providers.vexcel", return_value=({}, "Credentials missing")):
                report = location_report({"building": record["id"], "profile": "step-free"}, {record["id"]: record})
        self.assertEqual(report["matterport"]["modelId"], record["id"])
        self.assertIn(record["id"], report["matterport"]["viewerUrl"])
        self.assertNotIn("images", report)


class ProxyHttpTests(unittest.TestCase):
    def setUp(self):
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.server.audits = AuditStore()
        self.server.catalog_records = {
            "x37LjPx62VA": {"id": "x37LjPx62VA", "name": "Medical Office", "address": "7440 Cypress Creek Pky", "city": "Houston"},
            "abc12345678": {"id": "abc12345678", "name": "West Clinic", "address": "1 Main St", "city": "Los Angeles", "state": "CA"},
        }
        self.worker = Thread(target=self.server.serve_forever, daemon=True)
        self.worker.start()
        self.url = "http://127.0.0.1:" + str(self.server.server_port) + "/api/audit"

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.worker.join()

    def post(self, origin):
        image = b"\x89PNG\r\n\x1a\n" + b"sample"
        payload = {
            "building": "Clinic",
            "profile": "step-free",
            "mimeType": "image/png",
            "imageData": base64.b64encode(image).decode("ascii"),
        }
        request = urllib.request.Request(
            self.url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json", "Origin": origin},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=3) as response:
                return response.status, json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as error:
            return error.code, json.loads(error.read().decode("utf-8"))

    def test_walkthrough_config_exposes_only_public_sdk_key(self):
        from tempfile import TemporaryDirectory
        from pathlib import Path
        with TemporaryDirectory() as directory:
            Path(directory, ".env").write_text("MATTERPORT_SDK_KEY=public-sdk\nMATTERPORT_API_TOKEN=private-token\n")
            with patch("backend.server.ROOT", Path(directory)):
                with urllib.request.urlopen(self.url.replace("/api/audit", "/api/walkthrough-config")) as response:
                    self.assertEqual(json.loads(response.read()), {"sdkKey": "public-sdk"})

    def test_walkthrough_review_uses_the_compact_review_path(self):
        payload = {"building": "Clinic", "profile": "step-free", "mimeType": "image/jpeg",
                   "imageData": base64.b64encode(b"\xff\xd8\xffimage").decode()}
        request = urllib.request.Request(self.url.replace("/api/audit", "/api/walkthrough-review"),
                                         data=json.dumps(payload).encode(), headers={"Content-Type": "application/json"})
        with patch("backend.server.review_walkthrough_frame", return_value={"observations": []}) as review:
            with urllib.request.urlopen(request) as response:
                self.assertEqual(json.loads(response.read()), {"observations": []})
            review.assert_called_once_with("step-free", "image/jpeg", payload["imageData"])

    def test_selected_step_free_candidate_avoids_marked_segment(self):
        def post(path, body):
            request = urllib.request.Request(self.url.replace("/api/audit", path),
                data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(request, timeout=3) as response:
                return json.load(response)
        report = post("/api/plan", {"building": "x37LjPx62VA", "profile": "step-free", "demo": True})
        self.assertEqual(report["candidate"]["metres"], 10.5)
        selection = {"auditId": report["auditId"], "start": "0", "end": "4", "stepped": [["1", "2"]]}
        self.assertIsNone(post("/api/route", selection)["candidate"])
        selection["stepped"] = []
        self.assertEqual(post("/api/route", selection)["candidate"]["metres"], 10.5)

    def test_evidence_get_returns_image_bytes(self):
        image = b"test-image"
        audit_id = self.server.audits.add({}, {"aerial": ("Arrival", image, "image/jpeg", None)}, "step-free")
        url = self.url.replace("/api/audit", "/api/evidence/" + audit_id + "/aerial")
        with urllib.request.urlopen(url, timeout=3) as response:
            self.assertEqual(response.headers.get_content_type(), "image/jpeg")
            self.assertEqual(response.read(), image)

    def test_viewpoint_serves_photo_for_requested_scan(self):
        images = {"interior-1": ("Start", b"first-scan", "image/jpeg", "scan-1")}
        previews = {"scan-2": "https://cdn.example/view"}
        audit_id = self.server.audits.add({}, images, "step-free", previews)
        base = self.url.replace("/api/audit", "/api/viewpoint/" + audit_id + "/")
        with urllib.request.urlopen(base + "scan-1", timeout=3) as response:
            self.assertEqual(response.read(), b"first-scan")
        with patch("backend.server.providers.read_image", return_value=(b"second-scan", "image/jpeg")) as fetch:
            with urllib.request.urlopen(base + "scan-2", timeout=3) as response:
                self.assertEqual(response.read(), b"second-scan")
            self.assertEqual(fetch.call_args.args[0].full_url, previews["scan-2"])

    def test_missing_key_returns_actionable_configuration_error(self):
        with patch.dict(os.environ, {"GEMINI_API_KEY": ""}):
            status, body = self.post("http://127.0.0.1:5173")
        self.assertEqual(status, 503)
        self.assertIn("GEMINI_API_KEY", body["error"])

    def test_rejects_non_local_origin(self):
        status, body = self.post("https://example.com")
        self.assertEqual(status, 403)
        self.assertIn("local app", body["error"])

    def test_building_search_returns_featured_and_matches(self):
        request = urllib.request.Request(self.url.replace("/api/audit", "/api/buildings?q=Main"))
        with urllib.request.urlopen(request, timeout=3) as response:
            body = json.loads(response.read().decode("utf-8"))
        self.assertEqual(body["featured"]["id"], "x37LjPx62VA")
        self.assertEqual([item["id"] for item in body["matches"]], ["abc12345678"])


if __name__ == "__main__":
    unittest.main()
