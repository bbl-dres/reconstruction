"""Model hygiene, identity and performance statistics of a built .blend (first written for Landgut Lohn, v30).

    blender --background <model.blend> --python tools/model-checks/hygiene.py -- --out <json> [--collections Site,Main_House] [--require my_basis]

Checks every mesh object of the exported collections (--collections: name prefixes; default every collection except
--skip-collections, default Types,Reference):
required viewer/BIM properties, unique viewer_id, unit scale, material slots, degenerate faces, loose vertices,
non-manifold edges (reported, thin/open decorative surfaces are allowed), signed volume of closed meshes
(negative = inverted normals), linked-mesh reuse, triangle and material counts, image count.
"""
import json
import os
import sys
from collections import Counter

import bmesh
import bpy

import sys as _sys, os as _os
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
import checkargs
A = checkargs.parse(("Types", "Reference"))
OUT = A.out
REQ = ["viewer_id", "viewer_role", "viewer_cutaway_role", "viewer_floor_ids", "viewer_category", "viewer_type_id", "viewer_family_id",
       "viewer_building_id"] + list(A.require)

ids = Counter()
issues = []
stats = Counter()
per_coll = Counter()
tris_by_cat = Counter()
mesh_users = Counter()
inverted = []
nonmanifold = Counter()
for ob in bpy.data.objects:
    if ob.type != "MESH":
        continue
    coll = checkargs.collection_of(ob)
    if (A.collections and not coll.startswith(A.collections)) or (not A.collections and coll in A.skip):
        continue
    per_coll[coll] += 1
    stats["objects"] += 1
    for k in REQ:
        if k not in ob.keys():
            issues.append({"object": ob.name, "issue": f"missing {k}"})
    ids[ob.get("viewer_id", "")] += 1
    if any(abs(s - 1.0) > 1e-6 for s in ob.scale):
        issues.append({"object": ob.name, "issue": "non-unit scale"})
    if not ob.data.materials or any(m is None for m in ob.data.materials):
        issues.append({"object": ob.name, "issue": "missing material"})
    mesh_users[ob.data.name] += 1
    me = ob.data
    tri = sum(len(p.vertices) - 2 for p in me.polygons)
    stats["placedTriangles"] += tri
    tris_by_cat[ob.get("viewer_category", "?")] += tri
    if mesh_users[ob.data.name] == 1:
        stats["uniqueTriangles"] += tri
        bm = bmesh.new()
        bm.from_mesh(me)
        degenerate = sum(1 for f in bm.faces if f.calc_area() < 1e-8)
        loose = sum(1 for v in bm.verts if not v.link_edges)
        nm = sum(1 for e in bm.edges if not e.is_manifold)
        if degenerate:
            issues.append({"object": ob.name, "issue": f"{degenerate} degenerate faces"})
        if loose:
            issues.append({"object": ob.name, "issue": f"{loose} loose vertices"})
        if nm:
            nonmanifold[ob.get("viewer_category", "?")] += 1
        elif bm.faces:
            vol = bm.calc_volume(signed=True)
            if vol < -1e-6:
                inverted.append(ob.name)
        bm.free()
dups = [k for k, v in ids.items() if v > 1 or not k]
for k in dups:
    issues.append({"viewer_id": k, "issue": "duplicate or empty viewer_id"})
for name in inverted:
    issues.append({"object": name, "issue": "closed mesh with negative volume (inverted normals)"})
reuse = {k: v for k, v in mesh_users.items() if v > 1}
report = {
    "schemaVersion": 1, "file": bpy.data.filepath, "blender": bpy.app.version_string,
    "objects": stats["objects"], "perCollection": dict(sorted(per_coll.items())),
    "placedTriangles": stats["placedTriangles"], "uniqueTriangles": stats["uniqueTriangles"],
    "uniqueMeshes": len(mesh_users), "linkedMeshesReused": len(reuse), "maxInstancesOfOneMesh": max(reuse.values()) if reuse else 1,
    "materials": len([m for m in bpy.data.materials if m.users]), "images": len([i for i in bpy.data.images if i.users]),
    "trianglesByCategory": dict(tris_by_cat.most_common()),
    "objectsWithOpenEdgesByCategory": dict(nonmanifold),
    "issues": issues, "issueCount": len(issues),
}
os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump(report, open(OUT, "w"), indent=1)
print("HYGIENE", json.dumps({k: report[k] for k in ("objects", "placedTriangles", "uniqueTriangles", "uniqueMeshes", "linkedMeshesReused", "materials", "issueCount")}))
for i in issues[:25]:
    print("  ", i)
