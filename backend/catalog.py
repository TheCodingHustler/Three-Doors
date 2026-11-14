"""Load the local Matterport model index and CoStar property cross-reference."""
import csv
import os
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEMO_ID = "x37LjPx62VA"
DEMO_RECORD = {
    "id": DEMO_ID,
    "name": "Medical Office · Houston",
    "address": "7440 Cypress Creek Pky",
    "city": "Houston",
    "state": "TX",
    "lat": 29.9666445,
    "lon": -95.5394043,
    "property_id": 5615020,
    "model_address": "7400 FM-1960 W, Houston, TX, 77070, US",
    "source": "Reference record",
    "property_source": "Reference record",
}
ELIGIBLE_CITIES = {"Houston", "Los Angeles"}


def configured_path(value, default):
    path = Path(value or default).expanduser()
    return path if path.is_absolute() else ROOT / path


def load_catalog(index_path=None, properties_path=None):
    index = configured_path(index_path or os.environ.get("MATTERPORT_INDEX"), "~/Downloads/models_index.csv")
    properties = configured_path(
        properties_path or os.environ.get("COSTAR_DATA_DIR"),
        "~/Downloads/costar-hackathon-kit/commercial-properties.csv",
    )
    if properties.is_dir():
        properties = properties / "commercial-properties.csv"
    buildings = {DEMO_ID: dict(DEMO_RECORD)}
    if not index.is_file() or not properties.is_file():
        return buildings
    try:
        with properties.open(encoding="utf-8-sig", newline="") as source:
            property_rows = {
                row.get("MatterportModelId", ""): row
                for row in csv.DictReader(source)
                if row.get("MatterportModelId")
            }
        with index.open(encoding="utf-8-sig", newline="") as source:
            for row in csv.DictReader(source):
                model_id = row.get("sid", "")
                property_row = property_rows.get(model_id)
                if (not property_row or property_row.get("City") not in ELIGIBLE_CITIES
                        or not re.fullmatch(r"[A-Za-z0-9]{11}", model_id)):
                    continue
                try:
                    latitude, longitude = float(row["lat"]), float(row["lon"])
                    property_id = int(property_row["PropertyId"])
                except (KeyError, TypeError, ValueError):
                    continue
                if not (-90 < latitude < 90 and -180 <= longitude <= 180):
                    continue
                buildings[model_id] = {
                    "id": model_id,
                    "name": row.get("name") or property_row.get("Address", "Medical office"),
                    "address": property_row.get("Address", ""),
                    "city": property_row["City"],
                    "state": property_row.get("State", ""),
                    "lat": latitude,
                    "lon": longitude,
                    "property_id": property_id,
                    "model_address": row.get("address", ""),
                    "source": "Matterport model index",
                    "property_source": "CoStar commercial-property export",
                }
    except (OSError, csv.Error, UnicodeError):
        return buildings
    return buildings


def search_catalog(buildings, query="", limit=24):
    featured = buildings.get(DEMO_ID, dict(DEMO_RECORD))
    normalized = query.strip().casefold()[:100]
    records = [item for key, item in buildings.items() if key != DEMO_ID]
    records.sort(key=lambda item: (item["city"], item["address"], item["name"]))
    if normalized:
        records = [
            item for item in records
            if normalized in " ".join((item["name"], item["address"], item["city"], item["state"])).casefold()
        ]
    return {"featured": featured, "matches": records[:limit], "total": len(records)}