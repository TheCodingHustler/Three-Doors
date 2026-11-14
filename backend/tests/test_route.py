import unittest

from backend import route


class RouteTests(unittest.TestCase):
    def test_guided_example_has_a_scan_candidate(self):
        candidate = route.example_candidate(route.sample_geometry())
        self.assertIsNotNone(candidate)
        self.assertGreaterEqual(len(candidate["scan_ids"]), 3)

    def test_wall_blocks_scan_connection(self):
        geometry = {
            "scans": [{"id": "a", "xy": [0, 0]}, {"id": "b", "xy": [2, 0]}],
            "walls": [[[1, -2], [1, 2]]],
        }
        scans, nearby = route.connections(geometry)
        self.assertEqual(set(scans), {"a", "b"})
        self.assertEqual(nearby, {"a": [], "b": []})

    def test_multiple_floors_are_not_joined(self):
        geometry = route.floor_geometry({"floors": [{}, {}], "panoLocations": [{"id": "scan"}]})
        self.assertEqual(geometry["scans"], [])
        self.assertIn("unavailable", geometry["status"])

    def test_floor_geometry_includes_metric_room_measurements(self):
        model = {
            "floors": [{"id": "floor-1", "label": "Ground"}],
            "rooms": [{
                "id": "room-1",
                "floor": {"id": "floor-1"},
                "classifications": [{"label": "Corridor"}],
                "dimensions": {"areaFloor": 6.42, "width": 1.2, "depth": 5.35, "height": 2.7},
            }],
        }
        geometry = route.floor_geometry(model)
        self.assertEqual(geometry["rooms"][0]["label"], "Corridor")
        self.assertEqual(geometry["rooms"][0]["width_m"], 1.2)
        self.assertEqual(geometry["rooms"][0]["area_m2"], 6.42)


if __name__ == "__main__":
    unittest.main()