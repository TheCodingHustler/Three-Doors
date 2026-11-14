"""Estimate an indoor scan-to-scan candidate from one floor and wall barriers."""
import heapq
import math
from itertools import combinations


def point(position):
    coordinates = [float(position["x"]), float(position["y"])]
    if not all(map(math.isfinite, coordinates)):
        raise ValueError("Invalid coordinate")
    return coordinates


def room_measurements(model, floor_id=None):
    floors = {floor.get("id"): floor.get("label") for floor in model.get("floors") or []}
    measurements = []
    for room in model.get("rooms") or []:
        room_floor = room.get("floor") or {}
        if floor_id is not None and room_floor.get("id") != floor_id:
            continue
        dimensions = room.get("dimensions") or {}
        measured = {}
        for source, target in (
            ("areaFloor", "area_m2"), ("width", "width_m"),
            ("depth", "depth_m"), ("height", "height_m"),
        ):
            value = dimensions.get(source)
            if isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and value > 0:
                measured[target] = round(float(value), 2)
        if measured:
            labels = room.get("classifications") or []
            measurements.append({
                "evidence_id": "room-" + str(len(measurements) + 1),
                "label": (labels[0].get("label") if labels else None) or "Unclassified room",
                "floor": floors.get(room_floor.get("id")) or "Floor not specified",
                **measured,
            })
    return measurements


def floor_geometry(model):
    floors = model.get("floors") or []
    if len(floors) != 1:
        return {
            "walls": [], "scans": [], "rooms": room_measurements(model),
            "status": "Single-floor geometry is unavailable.",
        }
    floor = floors[0]
    vertices = {vertex["id"]: point(vertex["position"]) for vertex in (floor.get("vertices") or [])}
    walls = []
    for edge in floor.get("edges") or []:
        ids = [vertex["id"] for vertex in edge.get("vertices") or []]
        if len(ids) == 2 and all(identifier in vertices for identifier in ids):
            walls.append([vertices[ids[0]], vertices[ids[1]]])
    scans = [
        {"id": item["id"], "label": item.get("label", item["id"]), "xy": point(item["position"])}
        for item in model.get("panoLocations") or []
        if item.get("position") and item.get("id")
    ]
    return {
        "walls": walls,
        "scans": scans,
        "rooms": room_measurements(model, floor.get("id")),
        "status": "Single captured floor · metres in Matterport model coordinates",
    }


def crosses(a, b, c, d):
    def orient(p, q, r):
        return (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])

    tolerance = 1e-7
    if any(max(a[index], b[index]) + tolerance < min(c[index], d[index])
           or max(c[index], d[index]) + tolerance < min(a[index], b[index]) for index in range(2)):
        return False
    values = (orient(a, b, c), orient(a, b, d), orient(c, d, a), orient(c, d, b))
    return min(values[:2]) <= tolerance and max(values[:2]) >= -tolerance and min(values[2:]) <= tolerance and max(values[2:]) >= -tolerance


def connections(geometry):
    scans = {item["id"]: item["xy"] for item in geometry["scans"]}
    walls = geometry["walls"]
    if not walls:
        return scans, {}
    nearby = {identifier: [] for identifier in scans}
    for left, right in combinations(scans, 2):
        start, end = scans[left], scans[right]
        distance = math.dist(start, end)
        if 0 < distance <= 4 and all(not crosses(start, end, wall[0], wall[1]) for wall in walls):
            nearby[left].append((right, distance))
            nearby[right].append((left, distance))
    return scans, nearby


def shortest_path(scans, nearby, start, end):
    queue = [(0, start, [start])]
    best = {start: 0}
    while queue:
        distance, scan, path = heapq.heappop(queue)
        if distance != best[scan]:
            continue
        if scan == end:
            return {"scan_ids": path, "points": [scans[item] for item in path], "metres": round(distance, 1)}
        for neighbor, length in nearby[scan]:
            cost = distance + length
            if cost < best.get(neighbor, math.inf):
                best[neighbor] = cost
                heapq.heappush(queue, (cost, neighbor, path + [neighbor]))
    return None


def example_candidate(geometry):
    scans, nearby = connections(geometry)
    if not nearby:
        return None
    for start in nearby:
        if not nearby[start]:
            continue
        ends = sorted(nearby, key=lambda identifier: math.dist(scans[start], scans[identifier]), reverse=True)
        for end in ends:
            if start != end:
                result = shortest_path(scans, nearby, start, end)
                if result and len(result["scan_ids"]) >= 3:
                    return result
    return None


def sample_geometry():
    labels = [
        ("Example lobby", [1, 2]),
        ("Example corridor A", [2.7, 3.75]),
        ("Example corridor B", [5.5, 3.75]),
        ("Example corridor C", [8.5, 3.75]),
        ("Example check-in", [10, 5.5]),
    ]
    return {
        "status": "Simulated floor plan · unrelated to the selected building",
        "walls": [[[0, 0], [11, 0]], [[11, 0], [11, 7]], [[11, 7], [0, 7]], [[0, 7], [0, 0]],
                  [[4, 0], [4, 3]], [[4, 4.5], [4, 7]], [[8, 0], [8, 3]], [[8, 4.5], [8, 7]]],
        "scans": [{"id": str(index), "label": label, "xy": coordinates}
                  for index, (label, coordinates) in enumerate(labels)],
        "rooms": [],
    }