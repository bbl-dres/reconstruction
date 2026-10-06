"""Dollhouse audit: what floats once the viewer's Dollhouse mode removes the enclosure. First written for Landgut Lohn
(v56, decision LL-D032); run it before every release.

    blender --background <model.blend> --python tools/model-checks/dollhouse_audit.py -- --out <json> [--levels eg,og1] [--skip-collections ...]

Applies the shared viewer's default presentation policy (viewer/js/policy-default.js: cutaway 'enclosure' and
'overhead' hidden, roofs and ceilings hidden unless 'interior', floor filter by viewer_floor_ids) for each floor and
lists visible products that float: no visible wall, wall finish, floor, stair or other product within 8 cm.
Chandeliers are exempt (pendant fixtures stay in Dollhouse). Levels default to every viewer_floor_ids value; collections
skipped by default: Types, Reference, Context, Site. Keep visible() in step with viewer/js/policy-default.js."""
import bpy, bmesh, json, sys
from mathutils import Vector
from mathutils.bvhtree import BVHTree
import os
import sys as _sys, os as _os
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
import checkargs
A = checkargs.parse(("Types", "Reference", "Context", "Site"))
OUT = A.out
dg = bpy.context.evaluated_depsgraph_get()
def visible(ob, level):
    if ob.get("viewer_role") == "collision": return False
    cut = ob.get("viewer_cutaway_role")
    if cut in ("enclosure", "overhead"): return False
    if cut != "interior" and (ob.get("viewer_dollhouse_hidden") or ob.get("viewer_role") in ("roof", "ceiling")): return False
    fl = list(ob.get("viewer_floor_ids", []) or [])
    if level != "all" and fl and level not in fl: return False
    return True
obs = [o for o in bpy.data.objects if o.type == "MESH" and o.users_collection and checkargs.collection_of(o) not in A.skip]
LEVELS = A.levels or tuple(sorted({f for o in obs for f in (o.get("viewer_floor_ids") or [])}))
res = {}
for level in ("all",) + LEVELS:
    vis = [o for o in obs if visible(o, level)]
    sup = [o for o in vis if o.get("viewer_role") in ("interior-wall", "exterior-wall", "floor", "door") or o.get("viewer_category") in ("wall-finish", "column", "equipment", "stair", "slab", "floor-finish")]
    bm = bmesh.new()
    for o in sup:
        b2 = bmesh.new(); b2.from_object(o, dg); b2.transform(o.matrix_world)
        me = bpy.data.meshes.new("tmp"); b2.to_mesh(me); bm.from_mesh(me); bpy.data.meshes.remove(me); b2.free()
    tree = BVHTree.FromBMesh(bm)
    floating = []
    groups = {}
    for o in vis:
        groups.setdefault(o.get("viewer_element_id") or o.name, []).append(o)
    # every product is tested against the walls/floors plus all other visible products (lamps on tables, clocks on brackets)
    allbm = bmesh.new()
    owner = []
    for eid, parts in groups.items():
        for o in parts:
            b2 = bmesh.new(); b2.from_object(o, dg); b2.transform(o.matrix_world)
            me = bpy.data.meshes.new("tmp"); b2.to_mesh(me); n0 = len(allbm.faces); allbm.from_mesh(me); bpy.data.meshes.remove(me); b2.free()
            owner += [eid] * (len(allbm.faces) - n0)
    allbm.faces.ensure_lookup_table()
    alltree = BVHTree.FromBMesh(allbm)
    for eid, parts in groups.items():
        if parts[0] in sup or "chandelier" in eid or "furn-chandelier" in eid:
            continue
        pts = []
        for o in parts:
            me = o.evaluated_get(dg).to_mesh()
            pts += [o.matrix_world @ v.co for v in me.vertices][::max(1, len(me.vertices) // 200)]
        d = min((tree.find_nearest(p)[3] or 99) for p in pts)
        if d > 0.08:
            # touching another product?
            d2 = 99
            for p in pts:
                for loc, nrm, idx, dist in alltree.find_nearest_range(p, 0.08):
                    if owner[idx] != eid:
                        d2 = min(d2, dist)
            if d2 > 0.08:
                floating.append({"id": eid, "category": parts[0].get("viewer_category"), "cutaway": parts[0].get("viewer_cutaway_role"), "gapM": round(d, 2)})
    res[level] = {"visible": len(vis), "floating": floating}
    print("DOLL", level, len(vis), len(floating))
    for f in floating[:40]: print("DOLL  ", f)
json.dump(res, open(OUT, "w"), indent=1)
