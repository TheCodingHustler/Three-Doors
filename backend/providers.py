"""Bounded server-side access to Matterport and Vexcel evidence."""
import base64
import json
import math
import os
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener, urlopen

MATTERPORT_API = "https://api.matterport.com/api/models/graph"
VEXCEL_API = "https://api.vexcelgroup.com/v2/ortho/extract"
MAX_IMAGE_BYTES = 12_000_000
MAX_WALKTHROUGH_BYTES = 10_000_000
GEOMETRY_QUERY = """query Geometry($id: ID!) { model(id: $id) {
    floors { id label vertices { id position { x y } } edges { id type thickness vertices { id } } }
  panoLocations { id label position { x y z } }
} }"""
PANOS_QUERY = """query Panos($id: ID!) { model(id: $id) {
  panoLocations { id label skybox(resolution: \"2k\") { status children } }
} }"""


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, file_pointer, code, message, headers, new_url):
        return None


def open_without_redirect(request, timeout):
    return build_opener(NoRedirect()).open(request, timeout=timeout)


def image_type(data):
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


def read_image(request, *, timeout=15, allow_redirects=False, max_bytes=MAX_IMAGE_BYTES):
    opener = urlopen if allow_redirects else open_without_redirect
    with opener(request, timeout=timeout) as response:
        data = response.read(max_bytes + 1)
    if not data or len(data) > max_bytes:
        raise ValueError("Provider image is empty or too large.")
    mime_type = image_type(data)
    if not mime_type:
        raise ValueError("Provider returned an unsupported image.")
    return data, mime_type


def scan_image_url(url):
    parsed = urlsplit(url) if isinstance(url, str) else None
    if parsed and parsed.scheme == "https" and parsed.hostname and not (parsed.username or parsed.password):
        return url
    return None


def matterport(model_id):
    key, token = os.environ.get("MATTERPORT_API_KEY"), os.environ.get("MATTERPORT_API_TOKEN")
    if not key or not token:
        return None, {}, "Credentials missing"

    credentials = base64.b64encode((key + ":" + token).encode("utf-8")).decode("ascii")

    def graph(query):
        request = Request(
            MATTERPORT_API,
            data=json.dumps({"query": query, "variables": {"id": model_id}}).encode("utf-8"),
            headers={"Content-Type": "application/json", "Authorization": "Basic " + credentials},
            method="POST",
        )
        with open_without_redirect(request, timeout=12) as response:
            result = json.loads(response.read(2_000_001).decode("utf-8"))
        if result.get("errors") or not (result.get("data") or {}).get("model"):
            raise ValueError("Matterport model query unavailable")
        return result["data"]["model"]

    try:
        model = graph(GEOMETRY_QUERY)
    except (HTTPError, URLError, OSError, ValueError, KeyError, TypeError, json.JSONDecodeError):
        return None, {}, "Model query unavailable"

    images = {}
    try:
        locations = graph(PANOS_QUERY).get("panoLocations") or []
        available = [
            item for item in locations
            if len(((item.get("skybox") or {}).get("children") or [])) >= 5
        ]
        model["scan_previews"] = {}
        for item in available:
            children = item["skybox"]["children"]
            url = next((valid for index in (2, 1, 3, 4) if (valid := scan_image_url(children[index]))), None)
            if item.get("id") and url:
                model["scan_previews"][item["id"]] = url
        if len(available) <= 3:
            sampled = available
        else:
            sampled = [available[round(index * (len(available) - 1) / 2)] for index in range(3)]
        total_bytes = 0
        face_order = [1, 2, 3, 4, 5, 0]
        for face_index in face_order:
            for scan_index, item in enumerate(sampled, start=1):
                children = (item.get("skybox") or {}).get("children") or []
                if face_index >= len(children) or total_bytes >= MAX_WALKTHROUGH_BYTES:
                    continue
                url = scan_image_url(children[face_index])
                if not url:
                    continue
                remaining = MAX_WALKTHROUGH_BYTES - total_bytes
                try:
                    data, mime_type = read_image(
                        Request(url), allow_redirects=True,
                        max_bytes=min(MAX_IMAGE_BYTES, remaining),
                    )
                except (HTTPError, URLError, OSError, ValueError):
                    continue
                total_bytes += len(data)
                evidence_id = "interior-" + str(scan_index) + "-face-" + str(face_index)
                images[evidence_id] = (
                    "Matterport scan " + str(item.get("label", "unnamed")) + " · view " + str(face_index),
                    data,
                    mime_type,
                    item.get("id"),
                )
    except (HTTPError, URLError, OSError, ValueError, KeyError, TypeError, json.JSONDecodeError):
        pass
    status = "Geometry and scan imagery loaded" if images else "Geometry loaded · scan imagery unavailable"
    return model, images, status


def vexcel(building):
    key = os.environ.get("VEXCEL_API_KEY")
    if not key:
        return {}, "Credentials missing"
    try:
        latitude, longitude = float(building["lat"]), float(building["lon"])
        if not (-90 < latitude < 90 and -180 <= longitude <= 180):
            raise ValueError("Invalid building coordinates")
        lat_delta = 65 / 111_320
        lon_delta = lat_delta / max(math.cos(math.radians(latitude)), 0.01)
        corners = [
            (longitude - lon_delta, latitude - lat_delta),
            (longitude + lon_delta, latitude - lat_delta),
            (longitude + lon_delta, latitude + lat_delta),
            (longitude - lon_delta, latitude + lat_delta),
        ]
        polygon = ", ".join("{:.7f} {:.7f}".format(lon, lat) for lon, lat in corners + [corners[0]])
        payload = {
            "wkt": "POLYGON((" + polygon + "))",
            "srid": 4326,
            "layer": "urban,urban-r,wide-area,urban-g",
            "crop": "bounding_box",
            "image-format": "jpeg",
        }
        request = Request(
            VEXCEL_API,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json", "X-API-KEY": key},
            method="POST",
        )
        data, mime_type = read_image(request, timeout=20)
        return {"aerial": ("Vexcel overhead imagery · 130 m area around model coordinates", data, mime_type, None)}, "Aerial imagery loaded"
    except (HTTPError, URLError, OSError, ValueError, KeyError, TypeError):
        return {}, "Aerial imagery unavailable"