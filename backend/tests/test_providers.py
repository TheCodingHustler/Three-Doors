import json
import os
import unittest
from contextlib import contextmanager
from unittest.mock import patch

from backend import providers


JPEG = b"\xff\xd8\xff" + b"image-data"


class Response:
    def __init__(self, body):
        self.body = body

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False

    def read(self, _limit=-1):
        return self.body


class ProviderTests(unittest.TestCase):
    def test_matterport_fetches_geometry_and_limited_scan_images(self):
        def graph_response(request, timeout):
            self.assertEqual(request.full_url, providers.MATTERPORT_API)
            self.assertTrue(request.get_header("Authorization").startswith("Basic "))
            query = json.loads(request.data)
            self.assertEqual(query["variables"]["id"], "x37LjPx62VA")
            if "query Panos" in query["query"]:
                model = {"panoLocations": [{
                    "id": "scan-1", "label": "Lobby",
                    "skybox": {"children": ["https://cdn.example/face"] * 6},
                }]}
            else:
                self.assertIn("floors", query["query"])
                self.assertNotIn("rooms", query["query"])
                model = {"floors": [{"id": "floor-1"}], "panoLocations": [{"id": "scan-1"}]}
            return Response(json.dumps({"data": {"model": model}}).encode())

        with patch.dict(os.environ, {"MATTERPORT_API_KEY": "test-key", "MATTERPORT_API_TOKEN": "test-token"}):
            with patch.object(providers, "open_without_redirect", side_effect=graph_response):
                with patch.object(providers, "urlopen", return_value=Response(JPEG)):
                    model, images, status = providers.matterport("x37LjPx62VA")
        self.assertEqual(model["floors"][0]["id"], "floor-1")
        self.assertEqual(model["scan_previews"], {"scan-1": "https://cdn.example/face"})
        self.assertEqual(images["interior-1-face-1"][3], "scan-1")
        self.assertEqual(images["interior-1-face-1"][2], "image/jpeg")
        self.assertEqual(len(images), 6)
        self.assertEqual(status, "Geometry and scan imagery loaded")

    def test_geometry_query_does_not_request_room_dimensions(self):
        queries = []
        def graph_response(request, timeout):
            query = json.loads(request.data)["query"]
            queries.append(query)
            model = {"floors": [], "rooms": [], "panoLocations": []}
            return Response(json.dumps({"data": {"model": model}}).encode())
        with patch.dict(os.environ, {"MATTERPORT_API_KEY": "key", "MATTERPORT_API_TOKEN": "token"}):
            with patch.object(providers, "open_without_redirect", side_effect=graph_response):
                model, images, status = providers.matterport("model-id")
        self.assertIsNotNone(model)
        self.assertEqual(images, {})
        self.assertIn("Geometry loaded", status)
        self.assertEqual(queries[0], providers.GEOMETRY_QUERY)
        self.assertNotIn("rooms", queries[0])

    def test_vexcel_uses_configured_key_and_bounded_area(self):
        def image_response(request, timeout):
            self.assertEqual(request.full_url, providers.VEXCEL_API)
            self.assertEqual(request.get_header("X-api-key"), "test-vexcel")
            payload = json.loads(request.data)
            self.assertEqual(payload["srid"], 4326)
            self.assertEqual(payload["crop"], "bounding_box")
            self.assertEqual(payload["image-format"], "jpeg")
            return Response(JPEG)

        building = {"lat": 29.96, "lon": -95.53}
        with patch.dict(os.environ, {"VEXCEL_API_KEY": "test-vexcel"}):
            with patch.object(providers, "open_without_redirect", side_effect=image_response):
                images, status = providers.vexcel(building)
        self.assertIn("aerial", images)
        self.assertEqual(images["aerial"][2], "image/jpeg")
        self.assertEqual(status, "Aerial imagery loaded")

    def test_missing_matterport_credentials_report_missing_status(self):
        with patch.dict(os.environ, {}, clear=True):
            model, images, status = providers.matterport("x37LjPx62VA")
        self.assertIsNone(model)
        self.assertEqual(images, {})
        self.assertEqual(status, "Credentials missing")


if __name__ == "__main__":
    unittest.main()