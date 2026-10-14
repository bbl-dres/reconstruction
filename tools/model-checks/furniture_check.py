"""Furniture against walls, room floors and facing (Bundeshaus lesson: furniture facing). First written for Landgut Lohn (v55).

    blender --background <model.blend> --python tools/model-checks/furniture_check.py -- --out <json> [--facing-free-prop my_facing_free]

For every placed furniture product (viewer_category furniture / chair / table / cabinet):
- wallPenetration: the share of the product's footprint (convex hull of its vertices, XY) that lies inside the
  footprint of any wall or wall finish of the same building and floor. Pieces standing with their back against a
  wall touch it; more than 2 % or 3 cm depth is flagged.
- outsideRoom: the share of the footprint outside the floor finish of its room.
- suggestedShiftM: the smallest XY move [dx, dy] that clears the walls (used to correct research/furnishing.json).
- Curtains hang in the window reveals and are reported but not flagged.
- facing (chairs only): the chair front (type-local +Y) must point to within 75 degrees of the nearest point of the nearest dining or side table (console tables excluded);
  chairs with their back to a wall and no table within 0.6 m are wall chairs and exempt, and so are chairs carrying
  viewer_facing_free (or the building property named by --facing-free-prop).
Walls are viewer_category exterior-wall / interior-wall / wall-finish (objects named *-opening-head-* excluded: heads
over openings start above head height); room floors are floor-finish objects with viewer_room_ids.
"""
import json
import math
import os
import sys

import bpy
from mathutils import Vector

import sys as _sys, os as _os
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
import checkargs
A = checkargs.parse(("Types", "Reference"))
OUT = A.out

try:
    from shapely.geometry import MultiPoint, Polygon
    from shapely.ops import unary_union
except ImportError:  # Blender's bundled Python has no shapely: fall back to the cloud/VM bpy module
    raise SystemExit("v55 needs shapely (run with the bpy module in a Python that has shapely)")

FURN = {"furniture", "chair", "table", "cabinet"}
WALLS = {"exterior-wall", "interior-wall"}


def hull(ob):
    m = ob.matrix_world
    pts = [(m @ v.co).to_tuple()[:2] for v in ob.data.vertices]
    return MultiPoint(pts).convex_hull if len(pts) > 2 else None


def mesh_footprint(ob):
    """Union of the object's faces projected to XY (walls are prisms, so the footprint is their plan polygon)."""
    m = ob.matrix_world
    polys = []
    for f in ob.data.polygons:
        if abs(f.normal.z) < 0.5:
            continue
        pts = [(m @ ob.data.vertices[i].co).to_tuple()[:2] for i in f.vertices]
        if len(pts) >= 3:
            p = Polygon(pts).buffer(0)
            if p.area > 1e-6:
                polys.append(p)
    return unary_union(polys) if polys else None


objs = [o for o in bpy.data.objects if o.type == "MESH" and o.users_collection and checkargs.collection_of(o) not in A.skip]
products = {}
for o in objs:
    if o.get("viewer_category") in FURN:
        products.setdefault(o.get("viewer_element_id") or o.name, []).append(o)
walls, floors = {}, {}
for o in objs:
    cat = o.get("viewer_category")
    fl = tuple(o.get("viewer_floor_ids", []) or [])
    key = (o.get("viewer_building_id"), fl[0] if fl else None)
    if (cat in WALLS or cat == "wall-finish") and "-opening-head-" not in o.name:  # v006: heads over openings start at 2.4-3.0 m
        fp = mesh_footprint(o)
        if fp is not None:
            walls.setdefault(key, []).append(fp)
    if cat == "floor-finish":
        for r in o.get("viewer_room_ids", []) or []:
            fp = mesh_footprint(o)
            if fp is not None:
                k_ = (o.get("viewer_building_id"), r)
                floors[k_] = fp if k_ not in floors else unary_union([floors[k_], fp])
walls = {k: unary_union(v) for k, v in walls.items()}

rows, flagged = [], []
tables = []
for pid, parts in products.items():
    o = parts[0]
    hp = unary_union([h for h in (hull(p) for p in parts) if h is not None])
    fl = tuple(o.get("viewer_floor_ids", []) or [])
    key = (o.get("viewer_building_id"), fl[0] if fl else None)
    w = walls.get(key)
    inter = hp.intersection(w) if w is not None else None
    pen = inter.area / hp.area if inter is not None and hp.area > 0 else 0.0
    depth = 0.0
    if inter is not None and not inter.is_empty:
        depth = max(min(b[2] - b[0], b[3] - b[1]) for b in [g.bounds for g in getattr(inter, "geoms", [inter])])
    rooms = list(o.get("viewer_room_ids", []) or [])
    fr = floors.get((o.get("viewer_building_id"), rooms[0])) if rooms else None
    outside = hp.difference(fr.buffer(0.03)).area / hp.area if fr is not None and hp.area > 0 else None
    row = {"product": pid, "category": o.get("viewer_category"), "room": rooms[0] if rooms else None,
           "wallPenetration": round(pen, 3), "penetrationDepthM": round(depth, 3),
           "outsideRoom": None if outside is None else round(outside, 3)}
    if pen > 0.005 and w is not None:  # smallest XY move that clears the walls (2 cm grid up to 0.40 m)
        from shapely import affinity
        cands = sorted(((dx * 0.02, dy * 0.02) for dx in range(-20, 21) for dy in range(-20, 21)), key=lambda t: math.hypot(*t))
        for dx, dy in cands[1:]:
            if affinity.translate(hp, dx, dy).intersection(w).area < 0.002 * hp.area:
                row["suggestedShiftM"] = [round(dx, 2), round(dy, 2)]
                break
    if o.get("viewer_category") == "table" and "console" not in pid:
        tables.append((pid, hp, rooms[0] if rooms else None))
    rows.append((row, parts))
for row, parts in rows:
    if row["category"] == "chair":
        o = parts[0]
        c = unary_union([hull(p) for p in parts]).centroid
        cand = [t for t in tables if t[2] == row["room"]] or tables
        t = min(cand, key=lambda t: t[1].distance(c))
        fwd = (o.matrix_world.to_3x3() @ Vector((0, 1, 0)))
        from shapely.ops import nearest_points
        q = nearest_points(t[1], c)[0] if not t[1].contains(c) else t[1].centroid
        to = Vector((q.x - c.x, q.y - c.y, 0))
        ang = math.degrees(fwd.to_2d().angle_signed(to.to_2d())) if to.length > 1e-6 else 0.0
        row["facingTable"] = t[0]
        row["facingErrorDeg"] = round(abs(ang), 1)
        # v006: a chair standing with its back to a wall, away from any table, is a wall chair (as in the tour
        # panoramas) - the facing rule applies to chairs at tables only
        from shapely.geometry import Point as _Pt
        wk = (o.get("viewer_building_id"), (o.get("viewer_floor_ids") or [None])[0])
        back = _Pt(c.x - fwd.x * 0.35, c.y - fwd.y * 0.35)
        if o.get("viewer_facing_free") or (A.facing_free_prop and o.get(A.facing_free_prop)) or (walls.get(wk) is not None and walls[wk].distance(back) < 0.15 and t[1].distance(c) > 0.6):
            row["wallChair"] = True
            row.pop("facingErrorDeg")
    curtain = "curtains" in row["product"]
    bad = not curtain and ((row["wallPenetration"] > 0.02 and row["penetrationDepthM"] > 0.03) or (row["outsideRoom"] or 0) > 0.02
                           or row.get("facingErrorDeg", 0) > 75)
    row["flag"] = bool(bad)
    if bad:
        flagged.append(row["product"])
res = {"schemaVersion": 1, "products": len(rows), "flagged": flagged, "rows": [r for r, _ in rows]}
with open(OUT, "w", encoding="utf-8") as f:
    json.dump(res, f, indent=1)
print("FURNITURE", len(rows), "flagged", flagged)
