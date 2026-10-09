"""Inspect Blender objects before and after an edit: one JSON line of facts per object.

Paste into a Blender MCP code call (or run with blender --python) with the objects of interest selected; without a
selection it reports a collection. Read the facts instead of guessing from a screenshot:
- id, category and floors as tagged (viewer_* properties of docs/model-handoff.md);
- z range and height above the storey's finished floor level (0.0 = stands on the floor; negative = sunk in);
- scale 1, not mirrored, no open edges, no n-gons, normals outward;
- which mesh it uses and how many objects share it (an instance of a type shows mesh_users > 1);
- modifiers still on the object (bake them on the type prototype instead).
Set `levels` from building.json pipeline.levels and `collection` to the storey collection.
"""
import json

import bpy
import bmesh
from mathutils import Vector

def report(objects, levels):
    """One line of facts per object: id, category, storey band, ground contact, health, mesh sharing."""
    rows = []
    for ob in objects:
        if ob.type != "MESH":
            continue
        bb = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
        zmin, zmax = min(v.z for v in bb), max(v.z for v in bb)
        floor = max((z for z in levels.values() if z <= zmin + 0.05), default=None)
        bm = bmesh.new(); bm.from_mesh(ob.data)
        open_edges = sum(1 for e in bm.edges if not e.is_manifold)
        ngons = sum(1 for f in bm.faces if len(f.verts) > 4)
        vol = bm.calc_volume(signed=True) if not open_edges else None
        bm.free()
        rows.append(dict(name=ob.name, id=ob.get("viewer_id"), category=ob.get("viewer_category"), floors=list(ob.get("viewer_floor_ids", [])),
                         z=[round(zmin, 3), round(zmax, 3)], above_floor=None if floor is None else round(zmin - floor, 3),
                         scale_ok=all(abs(s - 1) < 1e-6 for s in ob.scale), mirrored=ob.matrix_world.determinant() < 0,
                         open_edges=open_edges, ngons=ngons, inverted=vol is not None and vol < 0,
                         mesh=ob.data.name, mesh_users=ob.data.users, modifiers=[m.type for m in ob.modifiers]))
    return rows

levels = {"eg": 0.0, "og1": 3.20}          # from building.json pipeline.levels (example values)
collection = "Main_EG"
sel = bpy.context.selected_objects or bpy.data.collections[collection].objects
for r in report(sel, levels):
    print(json.dumps(r))
