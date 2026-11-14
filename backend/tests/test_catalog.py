import tempfile
import unittest
from pathlib import Path

from backend.catalog import DEMO_ID, load_catalog, search_catalog


class CatalogTests(unittest.TestCase):
    def test_joins_model_index_to_eligible_costar_property(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            index = root / "models.csv"
            properties = root / "properties.csv"
            index.write_text(
                "sid,name,lat,lon,address\nabc12345678,West Clinic,34.1,-118.2,Model address\n",
                encoding="utf-8",
            )
            properties.write_text(
                "PropertyId,MatterportModelId,Address,City,State\n77,abc12345678,1 Main St,Los Angeles,CA\n",
                encoding="utf-8",
            )
            buildings = load_catalog(index, properties)
        self.assertIn(DEMO_ID, buildings)
        self.assertEqual(buildings["abc12345678"]["property_id"], 77)
        self.assertEqual(buildings["abc12345678"]["property_source"], "CoStar commercial-property export")

    def test_search_filters_name_address_and_city(self):
        buildings = {
            DEMO_ID: {"id": DEMO_ID, "name": "Featured", "address": "1 Oak", "city": "Houston"},
            "abc12345678": {"id": "abc12345678", "name": "West Clinic", "address": "1 Main St", "city": "Los Angeles", "state": "CA"},
        }
        result = search_catalog(buildings, "main st")
        self.assertEqual([item["id"] for item in result["matches"]], ["abc12345678"])
        self.assertEqual(result["featured"]["id"], DEMO_ID)


if __name__ == "__main__":
    unittest.main()