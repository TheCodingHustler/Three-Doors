import base64
import json
import os
import urllib.error
import urllib.request
import unittest
from http.server import ThreadingHTTPServer
from threading import Thread
from unittest.mock import patch

from backend.server import Handler, GeminiServiceError, decode_image, gemini_request, gemini_review, location_report, parse_gemini_response, validate_submission


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
            "observations": [{"title": "Door", "detail": "Width is unknown."}],
            "confirmations": ["Ask staff to confirm clearance."],
            "limitations": "One photo only.",
        })
        body = json.dumps({"candidates": [{"content": {"parts": [{"text": model_text}]}}]}).encode()
        result = parse_gemini_response(body)
        self.assertEqual(result["source"], "Gemini photo review")
        self.assertEqual(result["observations"][0]["title"], "Door")

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

    def test_walkthrough_review_targets_selected_profile_and_matterport_evidence(self):
        images = {
            "interior-1": ("Matterport scan Lobby", b"jpeg", "image/jpeg", "scan-1"),
            "aerial": ("Vexcel overhead imagery", b"jpeg", "image/jpeg", None),
        }
        response = {
            "source": "Gemini photo review",
            "summary": "A sampled viewpoint shows a possible barrier.",
            "measurementReview": "Room-1 is 1.1 m wide; that is not doorway clearance.",
            "observations": [
                {"title": "Threshold", "detail": "A raised threshold is visible.", "evidence": "interior-1"},
                {"title": "Narrow room", "detail": "Room width warrants an on-site check.", "evidence": "room-1"},
                {"title": "Unsupported", "detail": "No evidence for this finding.", "evidence": "aerial"},
            ],
            "confirmations": ["Ask staff whether an alternate entrance is available."],
            "limitations": "A still view cannot establish route continuity.",
        }
        geometry = {"rooms": [{"evidence_id": "room-1", "label": "Corridor", "width_m": 1.1, "area_m2": 8.5}]}
        with patch.dict(os.environ, {"GEMINI_API_KEY": "test-key"}):
            with patch("backend.server.gemini_request", return_value=response) as gemini:
                result = gemini_review({"name": "West Clinic"}, "step-free", images, geometry, None)
        payload = gemini.call_args.args[0]
        text_parts = [part["text"] for part in payload["contents"][0]["parts"] if "text" in part]
        prompt = " ".join(text_parts)
        self.assertIn("step-free access", prompt)
        self.assertIn('"width_m": 1.1', prompt)
        self.assertIn("not doorway clear widths", prompt)
        self.assertIn("explicitly assess these measurements", prompt)
        self.assertEqual(len([part for part in payload["contents"][0]["parts"] if "inline_data" in part]), 1)
        self.assertEqual([item["evidence"] for item in result["observations"]], ["interior-1", "room-1"])
        self.assertIn("1.1 m wide", result["measurementReview"])
        self.assertIn("Live", result["status"])

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