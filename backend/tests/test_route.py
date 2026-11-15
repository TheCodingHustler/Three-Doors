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

    def test_invisible_boundaries_do_not_block_connections(self):
        model = {
            "floors": [{"id": "floor", "vertices": [
                {"id": "c", "position": {"x": 1, "y": -2}},
                {"id": "d", "position": {"x": 1, "y": 2}},
                {"id": "e", "position": {"x": 0, "y": -2}},
            ], "edges": [
                {"type": "invisible", "vertices": [{"id": "c"}, {"id": "d"}]},
                {"type": "wall", "vertices": [{"id": "c"}, {"id": "e"}]},
            ]}],
            "panoLocations": [{"id": "a", "position": {"x": 0, "y": 0}},
                              {"id": "b", "position": {"x": 2, "y": 0}}],
        }
        result = route.candidate_between(route.floor_geometry(model), "a", "b")
        self.assertEqual(result["scan_ids"], ["a", "b"])

    def test_multiple_floors_are_not_joined(self):
        geometry = route.floor_geometry({"floors": [{}, {}], "panoLocations": [{"id": "scan"}]})
        self.assertEqual(geometry["scans"], [])
        self.assertIn("unavailable", geometry["status"])

    def test_floor_geometry_uses_only_walls_and_scan_points(self):
        model = {
            "floors": [{"id": "floor-1", "label": "Ground", "vertices": [], "edges": []}],
            "rooms": [{
                "id": "room-1",
                "floor": {"id": "floor-1"},
                "classifications": [{"label": "Corridor"}],
                "dimensions": {"areaFloor": 6.42, "width": 1.2, "depth": 5.35, "height": 2.7},
            }],
            "panoLocations": [{"id": "scan-1", "position": {"x": 1, "y": 2}}],
        }
        geometry = route.floor_geometry(model)
        self.assertEqual(geometry["walls"], [])
        self.assertEqual(geometry["scans"], [{"id": "scan-1", "label": "scan-1", "xy": [1.0, 2.0]}])
        self.assertNotIn("rooms", geometry)


if __name__ == "__main__":
    unittest.main()