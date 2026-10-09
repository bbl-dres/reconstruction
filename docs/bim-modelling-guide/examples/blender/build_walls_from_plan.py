"""Blender example of the BIM modelling guide: walls from plan lines, with real openings, typed doors and windows.

    blender --background --python docs/bim-modelling-guide/examples/blender/build_walls_from_plan.py -- OUT.glb [OUT.blend]

Also runs with the `bpy` module from PyPI (tested with bpy 5.0.1). Builds one storey of the golden pavilion
(docs/bim-modelling-guide/examples/golden/) the way a building script in work/build/scripts/ should:

- one wall object per straight plan segment and storey; origin at the start of the wall's face line, local +X along
  the wall, +Y into the wall, Z up; scale 1; walls stand on the storey level and stop at the underside of the slab;
- openings are part of the wall mesh, built from quads around the hole (no boolean modifier, no n-gon with a hole),
  so the wall stays a closed, manifold solid;
- doors and windows are linked duplicates of prototypes in the hidden `Types` collection (one mesh per type);
  each occurrence names its host wall in `viewer_host_id`, which is what the BIM registry needs for the
  wall -> opening -> door relationship in IFC;
- every exported object carries the viewer_* properties of docs/model-handoff.md;
- hygiene asserts (scale, mirroring, manifold, inverted normals, n-gons, mesh reuse) run before the export, and the
  exported GLB is checked for shared meshes and extras.

The example is invented geometry and uses the namespace `golden-`. Never copy ids or coordinates into a building.
"""
import json
import math
import struct
import sys

import bpy  # first: the PyPI bpy module makes bmesh and mathutils importable
import bmesh
from mathutils import Matrix

NS = "golden"
EXT, INT = 0.40, 0.15
LEVEL, HEIGHT = 0.0, 2.95          # storey level and wall height (top of slab to underside of slab above)

# Plan input: calibrated wall face lines in model metres (start, end, thickness, kind). In a real build these come from
# research/derived/ (plan calibration and wall topology), never typed in by hand.
WALLS = [
    ("s", (0.0, 0.0), (10.0, 0.0), EXT, "exterior"),
    ("n", (10.0, 6.0), (0.0, 6.0), EXT, "exterior"),
    ("w", (0.0, 5.6), (0.0, 0.4), EXT, "exterior"),
    ("e", (10.0, 0.4), (10.0, 5.6), EXT, "exterior"),
    ("i1", (6.15, 0.4), (6.15, 5.6), INT, "interior"),
]
# Openings per wall: (kind, distance along the wall from its origin, sill height, width, height)
OPENINGS = {
    "s": [("door", 2.0, 0.0, 1.0, 2.1), ("window", 4.0, 0.9, 1.2, 1.4), ("window", 7.5, 0.9, 1.2, 1.4)],
    "i1": [("door", 1.0, 0.0, 1.0, 2.1)],
}
TYPES = {"door": ("door-oak-100x210", "door-oak", 1.0, 2.1, 0.06), "window": ("window-120x140", "window-timber", 1.2, 1.4, 0.08)}


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    u = bpy.context.scene.unit_settings
    u.system, u.scale_length, u.length_unit = "METRIC", 1.0, "METERS"


def collection(name, hidden=False):
    c = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(c)
    c.hide_render = c.hide_viewport = hidden
    return c


def material(name, rgb):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")  # by type, not by (localised) name
    bsdf.inputs["Base Color"].default_value = (*rgb, 1.0)
    return m


def wall_mesh(name, length, height, thickness, openings):
    """Closed quad mesh of a wall slab [0,length] x [0,thickness] x [0,height] with rectangular holes.

    The face of the wall is split into a grid at every opening edge; grid cells inside an opening are left out.
    Front/back faces are emitted for solid cells, side faces wherever a solid cell meets an empty cell or the
    outside. Coincident vertices are welded afterwards, which makes the result manifold with outward normals.
    """
    xs = sorted({0.0, length, *[o[1] for o in openings], *[o[1] + o[3] for o in openings]})
    zs = sorted({0.0, height, *[o[2] for o in openings], *[o[2] + o[4] for o in openings]})

    def solid(i, k):
        if i < 0 or k < 0 or i >= len(xs) - 1 or k >= len(zs) - 1:
            return False
        cx, cz = (xs[i] + xs[i + 1]) / 2, (zs[k] + zs[k + 1]) / 2
        return not any(o[1] < cx < o[1] + o[3] and o[2] < cz < o[2] + o[4] for o in openings)

    bm = bmesh.new()
    vcache = {}

    def v(x, y, z):
        key = (round(x, 6), round(y, 6), round(z, 6))
        if key not in vcache:
            vcache[key] = bm.verts.new(key)
        return vcache[key]

    def quad(*pts):
        bm.faces.new([v(*p) for p in pts])

    t = thickness
    for i in range(len(xs) - 1):
        for k in range(len(zs) - 1):
            if not solid(i, k):
                continue
            x0, x1, z0, z1 = xs[i], xs[i + 1], zs[k], zs[k + 1]
            quad((x0, 0, z0), (x1, 0, z0), (x1, 0, z1), (x0, 0, z1))          # front face (-Y)
            quad((x0, t, z0), (x0, t, z1), (x1, t, z1), (x1, t, z0))          # back face (+Y)
            if not solid(i - 1, k):
                quad((x0, 0, z0), (x0, 0, z1), (x0, t, z1), (x0, t, z0))      # -X side / reveal
            if not solid(i + 1, k):
                quad((x1, 0, z0), (x1, t, z0), (x1, t, z1), (x1, 0, z1))      # +X side / reveal
            if not solid(i, k - 1):
                quad((x0, 0, z0), (x0, t, z0), (x1, t, z0), (x1, 0, z0))      # bottom / sill
            if not solid(i, k + 1):
                quad((x0, 0, z1), (x1, 0, z1), (x1, t, z1), (x0, t, z1))      # top / head
    # Grid cells share edges with up to two neighbours in the same plane; dissolve nothing, the quads stay simple.
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return me


def box_mesh(name, sx, sy, sz, ox, oy, oz):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(sx, sy, sz), verts=bm.verts)
    bmesh.ops.translate(bm, vec=(ox + sx / 2, oy + sy / 2, oz + sz / 2), verts=bm.verts)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return me


def tag(ob, **props):
    for k, val in props.items():
        ob[k] = val  # lists stay lists (JSON arrays in glTF extras), booleans stay booleans


def placement(p0, p1, z):
    dx, dy = p1[0] - p0[0], p1[1] - p0[1]
    return Matrix.Translation((p0[0], p0[1], z)) @ Matrix.Rotation(math.atan2(dy, dx), 4, "Z"), math.hypot(dx, dy)


def build():
    reset()
    eg = collection("Main_EG")
    types = collection("Types", hidden=True)
    mats = {"exterior": material("sandstone", (0.42, 0.38, 0.30)), "interior": material("lime-plaster", (0.70, 0.68, 0.62)),
            "door": material("oak", (0.33, 0.24, 0.15)), "window": material("painted-timber", (0.80, 0.80, 0.78))}

    # Type prototypes: origin at the bottom-left corner of the opening on the wall's front face, +X along the wall.
    protos = {}
    for kind, (type_id, family_id, w, h, d) in TYPES.items():
        me = box_mesh(type_id, w, d, h, 0.0, 0.10 if kind == "window" else 0.0, 0.0)
        me.materials.append(mats[kind])
        ob = bpy.data.objects.new(f"TYPE {type_id}", me)
        types.objects.link(ob)
        protos[kind] = ob

    for wid, p0, p1, t, kind in WALLS:
        m, length = placement(p0, p1, LEVEL)
        ops = OPENINGS.get(wid, [])
        name = f"{NS}-main-eg-wall-{wid}"
        me = wall_mesh(name, length, HEIGHT, t, [(k, x, z, w, h) for k, x, z, w, h in ops])
        me.materials.append(mats[kind])
        ob = bpy.data.objects.new(name, me)
        ob.matrix_world = m
        eg.objects.link(ob)
        external = kind == "exterior"
        tag(ob, viewer_id=name, viewer_category=f"{kind}-wall", viewer_role=f"{kind}-wall",
            viewer_cutaway_role="enclosure" if external else "interior", viewer_floor_ids=["eg"],
            viewer_family_id="wall-masonry", viewer_type_id=f"wall-{'ext' if external else 'int'}-{int(t * 100)}",
            viewer_building_id=f"{NS}-main", viewer_environment="boundary" if external else "interior")
        for n, (okind, x, z, w, h) in enumerate(ops, 1):
            occ = protos[okind].copy()          # linked duplicate: shares the prototype's mesh datablock
            occ.name = f"{NS}-main-eg-{okind}-{wid}-{n:02d}"
            occ.matrix_world = m @ Matrix.Translation((x, 0.0, z))
            eg.objects.link(occ)
            type_id, family_id, *_ = TYPES[okind]
            tag(occ, viewer_id=occ.name, viewer_category=okind, viewer_role=okind,
                viewer_cutaway_role="enclosure" if external else "interior", viewer_floor_ids=["eg"],
                viewer_family_id=family_id, viewer_type_id=type_id, viewer_building_id=f"{NS}-main", viewer_host_id=name)


def hygiene():
    meshes = set()
    for ob in bpy.data.collections["Main_EG"].objects:
        assert all(abs(s - 1) < 1e-9 for s in ob.scale), f"{ob.name}: scale must be 1 (apply scale)"
        assert ob.matrix_world.determinant() > 0, f"{ob.name}: mirrored transform flips the winding"
        assert not ob.modifiers, f"{ob.name}: bake modifiers on the type prototype, not on occurrences"
        for k in ("viewer_id", "viewer_category", "viewer_type_id", "viewer_floor_ids", "viewer_cutaway_role"):
            assert k in ob.keys(), f"{ob.name}: missing {k}"
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        assert all(e.is_manifold for e in bm.edges), f"{ob.name}: open or non-manifold edges"
        assert bm.calc_volume(signed=True) > 0, f"{ob.name}: inverted normals"
        assert all(len(f.verts) == 4 for f in bm.faces), f"{ob.name}: only quads (no n-gons with holes)"
        bm.free()
        meshes.add(ob.data.name)
    n = len(bpy.data.collections["Main_EG"].objects)
    print(f"HYGIENE ok: {n} objects, {len(meshes)} meshes (doors and windows share their type mesh)")


def export(path):
    for ob in bpy.data.objects:
        ob.select_set(ob.users_collection[0].name != "Types")
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_extras=True, export_yup=True,
                              export_apply=True, export_gpu_instances=False, export_cameras=False, export_lights=False)
    with open(path, "rb") as fh:
        fh.read(12)
        length, _ = struct.unpack("<II", fh.read(8))
        doc = json.loads(fh.read(length))
    nodes = [n for n in doc["nodes"] if "mesh" in n]
    assert "EXT_mesh_gpu_instancing" not in doc.get("extensionsUsed", []), "GPU instancing drops per-node viewer_id"
    assert all("viewer_id" in n.get("extras", {}) for n in nodes), "every node carries viewer_* extras"
    print(f"GLB ok: {len(nodes)} nodes share {len(doc['meshes'])} meshes")


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    build()
    hygiene()
    export(args[0] if args else "golden-eg-walls.glb")
    if len(args) > 1:
        bpy.ops.wm.save_as_mainfile(filepath=args[1])
