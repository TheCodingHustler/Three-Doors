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


if __name__ == "__main__":
    unittest.main()