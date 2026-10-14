"""Coplanar same-facing faces of different objects (z-fighting; black bands in Cycles). First written for Landgut Lohn (v35).

    blender --background <model.blend> --python tools/model-checks/coplanar.py -- --out <json> [--skip-collections Types,Reference,Context]

Every exported mesh face is reduced to its plane (normal rounded to 1e-3, offset to 2 mm). Faces of two different
objects on the same plane AND facing the same way overlap visibly when their polygons intersect (> 20 cm2): the viewer
shows them flickering and Cycles renders them dark. Faces facing opposite ways (back to back inside a wall) are hidden
and ignored. Instances of linked meshes are evaluated in world space. Needs shapely (bpy module in a Python with it).
Terrain (viewer_category terrain) is skipped.
"""
import json
import os
import sys
from collections import defaultdict

import bpy
from mathutils import Vector
from shapely.geometry import Polygon

import sys as _sys, os as _os
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
import checkargs
A = checkargs.parse(("Types", "Reference", "Context"))
OUT = A.out
MIN_AREA = 0.002

planes = defaultdict(list)
for ob in bpy.data.objects:
    if ob.type != "MESH" or not ob.users_collection or checkargs.collection_of(ob) in A.skip:
        continue
    if ob.get("viewer_category") in ("terrain",):
        continue
    m = ob.matrix_world
    nm = m.to_3x3().inverted().transposed()
    me = ob.data
    for f in me.polygons:
        if f.area < 1e-5:
            continue
        n = (nm @ f.normal).normalized()
        pts = [m @ me.vertices[i].co for i in f.vertices]
        d = n.dot(pts[0])
        key = (round(n.x, 3), round(n.y, 3), round(n.z, 3), round(d / 0.002))
        planes[key].append((ob.name, pts, n))


def poly2d(pts, n):
    a = Vector((1, 0, 0)) if abs(n.x) < 0.9 else Vector((0, 1, 0))
    u = n.cross(a).normalized()
    v = n.cross(u)
    p = Polygon([(q.dot(u), q.dot(v)) for q in pts])
    return p if p.is_valid else p.buffer(0)


pairs = defaultdict(float)
for key, fs in planes.items():
    objs = {f[0] for f in fs}
    if len(objs) < 2:
        continue
    by = defaultdict(list)
    for name, pts, n in fs:
        by[name].append(poly2d(pts, n))
    names = sorted(by)
    for i, a in enumerate(names):
        for b in names[i + 1:]:
            for pa in by[a]:
                for pb in by[b]:
                    if pa.intersects(pb):
                        ar = pa.intersection(pb).area
                        if ar > 1e-6:
                            pairs[(a, b)] += ar
rows = sorted(({"a": a, "b": b, "areaM2": round(v, 4)} for (a, b), v in pairs.items() if v > MIN_AREA), key=lambda r: -r["areaM2"])
res = {"schemaVersion": 1, "minAreaM2": MIN_AREA, "pairs": len(rows), "totalAreaM2": round(sum(r["areaM2"] for r in rows), 3), "rows": rows}
with open(OUT, "w", encoding="utf-8") as fh:
    json.dump(res, fh, indent=1)
print("COPLANAR", len(rows), "pairs", res["totalAreaM2"], "m2")
for r in rows[:25]:
    print(" ", r)
