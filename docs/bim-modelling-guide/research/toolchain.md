# Toolchain guidance: clean BIM-like Blender models → GLB (three.js) + IFC4 (CDE)

[← Research](README.md) · [BIM modelling guide](../README.md)

Research note for AI agents who are not CAD/BIM specialists. Target: **LOD 200–300 geometry, basic LOI** (class, type, storey, material, a few typed properties, provenance). Written to fit this repository's existing pipeline: `.blend` → `tools/model-pipeline/export_model.py` (GLB, extras, meshopt) → `bim.json` registry → `tools/model-pipeline/export_ifc.py` (IfcOpenShell, tessellated IFC4 with representation maps) → `tools/model-checks/*.py`. Read with `docs/model-handoff.md`, `docs/conventions.md`, `docs/pitfalls.md`.

Researched 2026-10-09. Snippets were executed with **ifcopenshell 0.9.0** (main run) and re-run with **0.8.5** (the version pinned in `tools/model-pipeline/requirements-bim.txt`), ifctester 0.9.0, ifcclash 0.9.0, ifc5d 0.9.0, and the `bpy` 5.0.1 PyPI module (headless Blender). The snippets were run in a temporary working folder; the repository keeps the reviewed results instead: the [golden example](../examples/golden/build_golden_example.py) (IfcOpenShell) and the [Blender example](../examples/blender/build_walls_from_plan.py). Note: the Blender snippet in §2.2 places door boxes in solid walls without openings and uses another building's id prefix; the Blender example corrects both.

Note on sources: docs.bonsaibim.org, docs.blender.org and standards.buildingsmart.org could not be fetched directly from this sandbox because DNS resolution failed. Bonsai documentation was read from its source (`IfcOpenShell/src/bonsai/docs/*.rst` on GitHub). Blender glTF exporter documentation came from `KhronosGroup/glTF-Blender-IO/docs/blender_docs/scene_gltf2.rst`, and the glTF specification from `KhronosGroup/glTF`. IFC specification statements come from search excerpts of the official pages, which are cited.

---

## 0. Summary of the recommended architecture (TL;DR)

1. **Model in plain Blender, but model like BIM.** Each physical product is one object (or one assembly root with components). Walls are extruded rectangles, one per straight segment and per storey. Repeated products are linked duplicates of a prototype in the hidden `Types` collection. All objects carry the `viewer_*` properties. This is what the repo already assumes.
2. **Two exports from the same frozen source.** The GLB comes from the evaluated Blender scene. The IFC comes from `bim.json` plus the GLB geometry through IfcOpenShell. Do not make the GLB from the IFC or the IFC from a Bonsai session unless a recipient needs native parametric IFC.
3. **Upgrade the IFC path for LOD 300 where it pays off.** For the few classes whose geometry is a simple extrusion (walls, slabs, columns, beams, simple openings), emit `IfcExtrudedAreaSolid` (`SweptSolid`) plus a material layer set or profile set instead of `IfcTriangulatedFaceSet`. CDEs then compute `Qto_*BaseQuantities` (length, net side area, net volume) and show layer build-ups. Everything else stays tessellated with `IfcRepresentationMap` reuse, as now.
4. **Check both outputs.** Run the Blender hygiene checks, `gltf-validator` and the viewer audit on the GLB. On the IFC run `ifcopenshell.validate --rules`, ifctester with a project IDS, ifcclash, a geometry round-trip, and a visual check in a second viewer (BIMcollab Zoom free, or a That Open / xeokit viewer).

---

## 1. Bonsai (formerly BlenderBIM): the native-IFC modelling workflow

Bonsai is the Blender add-on in which the `.ifc` file, not the `.blend`, is the source of truth. The repo does **not** author in Bonsai, but Bonsai's way of building elements is the reference for what a "clean" IFC element looks like. Use it to inspect your exported IFC, or for a small native-IFC sample.

### 1.1 Project and spatial setup
- Use *File → New IFC Project → New Metric (m) Project*, or the wizard to choose schema (IFC4), units and template. This creates `IfcProject > IfcSite > IfcBuilding > IfcBuildingStorey`. Saving with Ctrl+S writes **only the `.ifc`**. The `.blend` is saved separately and is just a cache. ([Bonsai docs: starting a new project](https://github.com/IfcOpenShell/IfcOpenShell/blob/v0.9.0/src/bonsai/docs/guides/authoring/starting_new_project.rst), [OSArch wiki: Bonsai Setting up a BIM Project](https://wiki.osarch.org/bonsai-setting-up-a-bim-project/))
- All IFC exports need a valid spatial tree (OSArch wiki). Spatial hierarchy uses `IfcRelAggregates`. Products are placed in it with `IfcRelContainedInSpatialStructure`. An element can be contained in **only one** spatial structure element. Use `IfcRelReferencedInSpatialStructure` for additional floors such as stairs or multi-storey windows. ([IFC4 IfcRelContainedInSpatialStructure](https://standards.buildingsmart.org/IFC/RELEASE/IFC4/FINAL/HTML/schema/ifcproductextension/lexical/ifcrelcontainedinspatialstructure.htm), [IFC4 ADD2 TC1 spatial structure template](https://standards.buildingsmart.org/IFC/RELEASE/IFC4/ADD2_TC1/HTML/schema/templates/spatial-structure.htm)). `IfcSpace` is **aggregated** into a storey, not contained.

### 1.2 Walls: `IfcWallType` + material layer set
- Workflow from the [Creating Walls guide](https://docs.bonsaibim.org/guides/authoring/basic_modeling/creating_walls.html) (source: `guides/authoring/basic_modeling/creating_walls.rst`):
  1. Activate the wall tool (Shift+Space, 6). On an empty project the header shows `[No IfcWallType Found] | Name [TYPEX] | + Add IfcWallType`. Name the type, for example `WALL100`, and add it.
  2. Shift+right-click to set the 3D cursor where the wall starts. Shift+A adds a segment. Type the *Length* and *Height* numerically.
  3. Move the 3D cursor with snapping on, Shift+A for the next segment, Shift+R to rotate 90°.
- Join and modify tools: **Extend** Shift+E (to another face), **Butt** Shift+T (end-to-end; this is an L or T join), **Mitre** Shift+Y (V/L mitre), **Merge** Shift+M (collinear segments), **Flip** Shift+F, **Split** Shift+K, **Regen** Shift+G, **Add Void** Shift+O. Alignment: exterior Shift+X, centreline Shift+C, interior Shift+V. *Calculate All Quantities*: Q. ([toolbar reference: wall](https://github.com/IfcOpenShell/IfcOpenShell/blob/v0.9.0/src/bonsai/docs/reference/toolbar/wall.rst))
- Newer builds add in-viewport parametric editing (pen icon), with gizmos for length, height, slope and the layer-offset baseline (Exterior → Centreline → Interior). A wall plus a slab selected offers *extend walls to underside* (`bim.extend_walls_to_underside`). Joins are stored as `IfcRelConnectsPathElements` (ATSTART/ATEND/ATPATH), and the wall bodies are trimmed with clippings.
- In Bonsai a wall body is a **layered extrusion**. An axis line plus the type's `IfcMaterialLayerSet` (occurrence gets an `IfcMaterialLayerSetUsage` with offset and direction) is extruded to the wall height. The *IFC classification* is purely for categorisation and does not drive geometry. *Types* carry shared material and geometry. If a type has geometry, all occurrences share it, like instancing. ([Geometry and representations](https://github.com/IfcOpenShell/IfcOpenShell/blob/v0.9.0/src/bonsai/docs/guides/authoring/understanding_ifc/geometry_and_representations.rst))
- Community advice ([OSArch](https://community.osarch.org/discussion/comment/25589/)): wall/slab layer intersection is hard. Keep the structural core in the wall or slab and model finishes or cladding as `IfcCovering`. This matches the repo rule of separating structural cores from decorative projections.
- `IfcWallStandardCase` is **deprecated in IFC4 ADD2 TC1**: write `IfcWall` with a layer set usage instead. ([IFC4 ADD2 TC1 change log 4.0.2.1](https://standards.buildingsmart.org/IFC/RELEASE/IFC4/ADD2_TC1/HTML/annex/annex-f/4021/index.htm))

### 1.3 Openings, voids and fillings (doors and windows)
- Select the **wall first**, then the Door or Window tool, then Shift+A. Bonsai then creates the `IfcOpeningElement`, `IfcRelVoidsElement` (opening cuts wall) and `IfcRelFillsElement` (door fills opening) automatically. If you forgot, select wall and door and use *Apply Void* (Shift+O) before editing the door. After moving a door, select the wall and **Regen (Shift+G)**. Moving it with Blender tools does not change the IFC until regenerated. Flip handing with Shift+F, and set `OperationType` such as `SINGLE_SWING_RIGHT`. ([Door guide](https://github.com/IfcOpenShell/IfcOpenShell/blob/v0.9.0/src/bonsai/docs/guides/authoring/basic_modeling/door.rst), [Opening guide](https://github.com/IfcOpenShell/IfcOpenShell/blob/v0.9.0/src/bonsai/docs/guides/authoring/basic_modeling/opening.rst))
- To make an opening without a filling, create a door or window and delete it and its type, or use *Add Void* in the wall tool.
- Doors and windows are **parametric types**. The type geometry is generated from `IfcDoorLiningProperties`/`IfcDoorPanelProperties` (the window equivalents for windows) as lining plus panel. Occurrences reuse it via `IfcRepresentationMap` → `IfcMappedItem`. Bonsai's door and window generators are coded in `bonsai/bim/module/model/door.py`/`window.py` ([OSArch "Families" thread](https://community.osarch.org/discussion/comment/26910/)). Custom families are meshes assigned to a type.

### 1.4 Stairs, columns, beams, slabs
- **Stairs:** Bonsai's stair generator creates an `IfcStairFlight` with `PredefinedType=STRAIGHT`. It writes `NumberOfRisers = treads + 1`, `RiserHeight = height / risers`, `TreadLength`, and a `Pset_StairFlightCommon` (NumberOfRiser, NumberOfTreads, RiserHeight, TreadLength, NosingLength). Source: `bonsai/bim/module/model/stair.py` in [IfcOpenShell](https://github.com/IfcOpenShell/IfcOpenShell/tree/v0.9.0/src/bonsai/bonsai/bim/module/model). Aggregate flights and landings (`IfcSlab` LANDING) under one `IfcStair`. Contain the `IfcStair` in the start storey and *reference* it in the others. This is consistent with the handoff rule against duplicating stairs per floor.
- **Columns/beams:** use an `IfcColumnType`/`IfcBeamType` with an `IfcMaterialProfileSet` holding a parameterised profile (`IfcRectangleProfileDef`, `IfcCircleProfileDef`, I-shapes...). Occurrences get `IfcMaterialProfileSetUsage` and a `SweptSolid` extrusion along the axis. Name profiles with standard codes. ([Material assignment guide](https://github.com/IfcOpenShell/IfcOpenShell/blob/v0.9.0/src/bonsai/docs/guides/authoring/advanced_modeling/material_assignment.rst))
- **Slabs:** a layered extrusion of a polyline, with depth usually going **down** from the top of the slab. Use `IfcSlab` FLOOR/ROOF/LANDING, and finishes as `IfcCovering`.
- **Representation types** Bonsai uses: `SweptSolid` (walls, columns, beams with simple profiles), `Tessellation` (complex or imported meshes), `Clipping` (half-space booleans), plus `Axis` `Curve2D`/`Curve3D` for wall and member axes. Converting to tessellation loses the parametric data. ([Working with representations](https://github.com/IfcOpenShell/IfcOpenShell/blob/v0.9.0/src/bonsai/docs/guides/authoring/understanding_ifc/working_with_representations.rst))
- **Large models** ([Dealing with large models](https://github.com/IfcOpenShell/IfcOpenShell/blob/v0.9.0/src/bonsai/docs/guides/viewing/dealing_with_large_models.rst)): use IFC4. Prefer solids and extrusions over faceted B-reps or tessellation, because the wrong choice "can easily double or triple your filesize". Objects over 100k polygons or more than 50,000 elements slow loading. Split exchanges by building, floor or discipline.

### 1.5 Do / don't (Bonsai-derived)
| Do | Don't |
|---|---|
| Create a **type first** (wall, door, window, column), then occurrences | Create one-off untyped occurrences for repeated things |
| Put materials on the **type** (layer set, profile set or constituent set) | Paint colours and call them materials; colour ≠ material |
| Select host wall before placing door or window, so the void and fill relations exist | Leave doors floating in walls with only a visual hole |
| Join walls (butt, mitre) so bodies don't overlap | Let wall boxes overlap at corners (double volume, coplanar faces) |
| Split walls per storey; contain each in exactly one storey | Run one wall through two storeys (also a repo pitfall) |
| Use `IfcCovering` for finishes and cladding | Add finish layers as separate walls |

---

## 2. Blender modelling hygiene for architecture

### 2.1 Rules
| # | Do | Don't / why |
|---|---|---|
| 1 | Use *Scene → Units*: Metric, Unit Scale 1.0, Length = metres. 1 BU = 1 m, Z up. glTF is also metres and the exporter converts to +Y up ([Khronos guidelines: "1 unit = 1 meter", real-world 1:1 scale](https://github.com/KhronosGroup/3DC-Asset-Creation/blob/main/asset-creation-guidelines/RealtimeAssetCreationGuidelines.md)) | Don't model in mm with scale 0.001; don't put LV95 coordinates in vertices (float32 jitter). Use a local origin plus `IfcMapConversion` |
| 2 | **Apply scale** (Ctrl+A → Scale) on every exported object so `scale == (1,1,1)`. `hygiene.py` already flags non-unit scale | Don't leave object scale ≠ 1. IFC placements carry no scale, so a scaled object's IFC geometry is wrong unless you bake it |
| 3 | **No negative scale or mirroring by transform.** If a mirrored type is needed, make a separate mirrored mesh (door handing = separate type or `OperationType`) | In glTF a negative determinant flips the winding order ([glTF 2.0 spec §3.7.4, "determinant of the node's global transform defines the winding order"](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html)). Many tools and IFC placements (orthonormal axes) cannot express it |
| 4 | Put the object origin where the IFC placement belongs. Wall: start of the axis at floor level, local +X along the wall. Door or window: bottom-centre of the opening on the wall axis. Furniture: floor contact, centre. Column: base centre | Don't apply rotation and location into the vertices of repeated types. The transform *is* the instance placement |
| 5 | Closed, manifold solids for walls, slabs, columns, stairs (`is_manifold` on every edge, positive signed volume). Thin decorative surfaces may be open, but document them (repo rule) | Holes, internal faces, duplicate faces, flipped normals. Use *Mesh → Clean Up → Merge by Distance* (≈0.1 mm) and *Normals → Recalculate Outside* (Shift+N) |
| 6 | Quads or triangles. glTF stores **triangles only**; the exporter triangulates ([Khronos guidelines](https://github.com/KhronosGroup/3DC-Asset-Creation/blob/main/asset-creation-guidelines/RealtimeAssetCreationGuidelines.md)) | **N-gons with holes** or non-planar n-gons triangulate unpredictably. Cut openings so that every face is a simple quad. The 3D-Print Toolbox "Distorted" check finds non-planar faces |
| 7 | Avoid coplanar overlapping faces: offset finishes 3–6 mm, build borders as rings with holes, butt-join walls instead of overlapping (`coplanar.py`) | Overlapping wall boxes at corners cause z-fighting in three.js and double quantities in IFC |
| 8 | **Linked duplicates** (Alt+D, or `obj.copy()` keeping `.data`) for every repeated product. Keep the prototype in the hidden `Types` collection. Assign materials on the **mesh data** (slot link = Data) so all occurrences share them | Shift+D (full copy) creates a new mesh per occurrence, which means unique glTF meshes and unique IFC geometry. "Make single user" during edits silently breaks reuse (handoff: "Copying each object's mesh to change glass materials can silently destroy linked geometry") |
| 9 | **No modifiers on linked occurrences** at export time. Bake modifiers (bevel, array, solidify, boolean) once on the type prototype's mesh. **Verified:** with a Bevel modifier on linked duplicates and *Apply Modifiers* on (the repo exporter uses `export_apply=True`), Blender 5.0.1 wrote **one glTF mesh per occurrence** (6 meshes instead of 5). Without the modifier the two doors shared one mesh | Don't rely on "it's linked in Blender" when a modifier stack exists. Inspect the GLB (`meshes` count vs `nodes`) |
| 10 | Collection instances (Shift+A → Collection Instance) are fine for *context* or authoring, but realise them before export if the pipeline expects one object per product with `viewer_*` props. Instance empties do not carry the per-product extras | Don't put product IDs on instance empties and expect them on meshes |
| 11 | Precision: snap to the grid or increment (5 mm for snapped type sizes, per the repo "snap sizes so equal pieces share a type"), use vertex/edge snapping with *Snap Base: Closest*, and type numbers during G/R/S (e.g. `G X 3.85 Enter`). Check dimensions with *Item* panel values | Don't eyeball. Measure-and-type, or script it from calibrated plan coordinates |
| 12 | Script walls from 2D plan lines (below): one straight segment = one 8-vertex box = one `IfcExtrudedAreaSolid` | Don't model walls by extruding a whole floor outline with holes (one huge n-gon mesh with no per-wall identity) |
| 13 | Split walls at storeys and at useful corners. One `viewer_id` per segment. Stable names; delete the old object and mesh before re-creating (pitfall: `.001` names) | Don't reuse IDs for different objects |

### 2.2 Verified Blender snippet: walls from plan lines, linked door type, hygiene asserts, GLB export
Executed headless with `bpy` 5.0.1. Result: 4 wall meshes plus **1 shared door mesh** used by 2 nodes; extras present (`viewer_floor_ids: ['eg']` exported as a JSON array); no `EXT_mesh_gpu_instancing`.

```python
"""Blender (bpy/bmesh) snippet: walls from 2D plan lines as clean extruded boxes, a door type in a hidden
Types collection placed as linked duplicates, repo-style custom properties, hygiene asserts, GLB export.
Run: blender --background --python blender_walls.py -- out.glb   (or with the `bpy` PyPI module)"""
import sys, math, json
import bpy, bmesh
from mathutils import Vector, Matrix

def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    s = bpy.context.scene
    s.unit_settings.system = "METRIC"; s.unit_settings.scale_length = 1.0; s.unit_settings.length_unit = "METERS"

def collection(name, parent=None, hidden=False):
    c = bpy.data.collections.get(name) or bpy.data.collections.new(name)
    if c.name not in (parent or bpy.context.scene.collection).children:
        (parent or bpy.context.scene.collection).children.link(c)
    c.hide_render = hidden; c.hide_viewport = hidden
    return c

def box_mesh(name, sx, sy, sz, ox=0.0, oy=0.0, oz=0.0):
    """Closed, manifold 8-vertex box in LOCAL coords [ox,ox+sx]x[oy,oy+sy]x[oz,oz+sz], outward normals."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(sx, sy, sz), verts=bm.verts)
    bmesh.ops.translate(bm, vec=(ox + sx / 2, oy + sy / 2, oz + sz / 2), verts=bm.verts)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    return me

def wall_from_line(p0, p1, thickness, height, base_z, justify="center"):
    """Wall = extruded rectangle. Object origin at p0 on the wall axis, local +X along the wall, Z up,
    scale 1 -> maps 1:1 to IfcExtrudedAreaSolid (length x thickness x height) + IfcLocalPlacement."""
    d = Vector(p1) - Vector(p0); length = d.length
    oy = {"center": -thickness / 2, "left": 0.0, "right": -thickness}[justify]
    me = box_mesh("wall", round(length, 4), thickness, height, oy=oy)
    ob = bpy.data.objects.new("wall", me)
    ob.matrix_world = Matrix.Translation((p0[0], p0[1], base_z)) @ Matrix.Rotation(math.atan2(d.y, d.x), 4, "Z")
    return ob

def tag(ob, **props):
    for k, v in props.items():
        ob[k] = v   # lists stay native lists (exported as JSON arrays in glTF extras); flags stay bool

reset_scene()
site = collection("Site"); eg = collection("Main_House_EG"); types = collection("Types", hidden=True)

mat_wall = bpy.data.materials.new("lime-plaster"); mat_wall.diffuse_color = (0.7, 0.68, 0.62, 1)
mat_wood = bpy.data.materials.new("oak"); mat_wood.diffuse_color = (0.35, 0.25, 0.15, 1)

# plan polyline (metres, already calibrated + rotated into the model frame); snap to 5 mm
plan = [(0, 0), (10, 0), (10, 8), (0, 8)]
snap = lambda p: (round(p[0] / 0.005) * 0.005, round(p[1] / 0.005) * 0.005)
plan = [snap(p) for p in plan]
T, H = 0.38, 3.2
for i, (a, b) in enumerate(zip(plan, plan[1:] + plan[:1]), 1):
    # butt joins: each wall runs to the outer corner, the next starts inside -> extend/shorten by T/2 along the axis
    d = (Vector(b) - Vector(a)).normalized()
    a2 = Vector(a) - d * (T / 2); b2 = Vector(b) - d * (T / 2)   # simple "pinwheel" butt join, no overlap
    ob = wall_from_line(a2, b2, T, H, 0.0, "center")
    ob.name = f"lohn-main-eg-wall-{i:03d}"; ob.data.name = ob.name
    ob.data.materials.append(mat_wall)
    eg.objects.link(ob)
    tag(ob, viewer_id=ob.name, viewer_category="exterior-wall", viewer_role="exterior-wall", viewer_cutaway_role="enclosure",
        viewer_family_id="wall-masonry", viewer_type_id="wall-ext-380", viewer_building_id="main", viewer_floor_ids=["eg"])

# door type prototype in hidden Types collection, origin = bottom-centre of the opening on the wall axis
proto_me = box_mesh("door-900x2100", 0.9, 0.05, 2.1, ox=-0.45, oy=-0.025)
proto_me.materials.append(mat_wood)
proto = bpy.data.objects.new("TYPE door-900x2100", proto_me); types.objects.link(proto)
for i, x in enumerate((3.0, 6.0), 1):
    occ = proto.copy()             # linked duplicate (Alt+D): shares proto.data, no new mesh datablock
    occ.name = f"lohn-main-eg-door-{i:03d}"
    occ.matrix_world = Matrix.Translation((x, 0, 0))
    eg.objects.link(occ)
    tag(occ, viewer_id=occ.name, viewer_category="door", viewer_role="door", viewer_cutaway_role="enclosure",
        viewer_family_id="door-panel", viewer_type_id="door-900x2100", viewer_building_id="main", viewer_floor_ids=["eg"])

# --- hygiene asserts (cheap versions of tools/model-checks/hygiene.py) ---
for ob in eg.objects:
    assert all(abs(s - 1) < 1e-6 for s in ob.scale), f"{ob.name}: apply scale (Ctrl+A) / no negative scale"
    assert ob.matrix_world.determinant() > 0, f"{ob.name}: mirrored transform flips winding"
    bm = bmesh.new(); bm.from_mesh(ob.data)
    assert all(e.is_manifold for e in bm.edges), f"{ob.name}: open edges"
    assert bm.calc_volume(signed=True) > 0, f"{ob.name}: inverted normals"
    assert all(len(f.verts) <= 4 for f in bm.faces), f"{ob.name}: n-gons"
    bm.free()
print("meshes:", len(bpy.data.meshes), "objects:", len(bpy.data.objects))

out = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else "walls.glb"
# hide Types from export by exporting only the building collections (repo exporter does its own selection)
for ob in bpy.data.objects: ob.select_set(ob.users_collection[0].name != "Types")
bpy.ops.export_scene.gltf(filepath=out, export_format="GLB", use_selection=True, export_extras=True, export_yup=True,
                          export_apply=False, export_gpu_instances=False, export_cameras=False, export_lights=False)
```

Notes:
- The "pinwheel" butt join (each segment starts T/2 before its corner and ends T/2 before the next) gives four non-overlapping boxes. The alternative is Bonsai-style: run one wall to the outer face and stop the other at the inner face.
- Openings: the extruded box stays an 8-vertex solid **if** you cut it into separate boxes (pier, lintel and parapet pieces) or keep the wall uncut and let IFC subtract the `IfcOpeningElement`. For GLB you need the visual hole. Make it with a **Boolean on an export copy**, or build the wall as a ring of quads around the opening. Never make an n-gon with a hole.
- Repo note: `export_model.py` already exports with `export_extras=True, export_yup=True, export_apply=True, export_gpu_instances=False, export_draco_mesh_compression_enable=False`, which fits these rules.

### 2.3 Useful checks inside Blender
- **3D-Print Toolbox** (bundled add-on up to 4.1; an extension on extensions.blender.org since 4.2): *Solid* (non-manifold), *Intersections*, *Degenerate*, *Distorted* (non-planar faces), *Thickness*, *Edge Sharp*, *Overhang*, *Check All*. *Make Manifold* fixes normals and holes. ([Blender manual 4.1: 3D Print Toolbox](https://docs.blender.org/manual/en/4.1/addons/mesh/3d_print_toolbox.html))
- `bmesh`: `e.is_manifold`, `bm.calc_volume(signed=True) > 0`, `f.calc_area() < 1e-8` (degenerate), `len(f.verts) > 4` (n-gon). `tools/model-checks/hygiene.py` already does most of this. Consider adding n-gon, negative-determinant and "has modifiers on a multi-user mesh" checks.

---

## 3. glTF / three.js asset guidelines

### 3.1 Blender glTF exporter facts (from [`scene_gltf2.rst`](https://github.com/KhronosGroup/glTF-Blender-IO/blob/main/docs/blender_docs/scene_gltf2.rst))
- **Custom properties → `extras`**: "exported from most objects if the *Include → Custom Properties* option is selected" (`export_extras=True`). Extras have no namespace. Object properties land on glTF **nodes**, mesh-data properties on glTF meshes. The repo uses object properties, which is correct for per-placement IDs.
- **GPU instances**: the *GPU Instances* option writes `EXT_mesh_gpu_instancing`. Limits: instances must be meshes without children, all children of the same object, detected as "objects sharing the same mesh data", and no material variation. Because it collapses many nodes into one node with attribute arrays, **per-node extras (`viewer_id`) are lost**. The repo forbids it ("Do not supply `EXT_mesh_gpu_instancing`"), and the viewer batches by itself.
- **Mesh reuse** without the extension: objects that share mesh data are written as one `mesh` referenced by several `nodes`. The [glTF spec](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html) allows any resource to be reused. The [Khronos guidelines](https://github.com/KhronosGroup/3DC-Asset-Creation/blob/main/asset-creation-guidelines/RealtimeAssetCreationGuidelines.md) note that "reusing a single mesh in multiple nodes is more efficient than duplicating mesh geometry for each node".
- *Apply Modifiers* exports the evaluated mesh, which breaks sharing when modifiers exist (verified above). *+Y Up* converts Blender Z-up: `(x, y, z) → (x, z, -y)`, as documented in the handoff. *Loose Edges/Points* are off by default and should stay off.
- Materials: Principled BSDF maps to glTF metallic-roughness PBR (base colour, metallic, roughness, normal map in tangent space +Y up, emissive, occlusion). Image textures for normal/ORM data must use the *Non-Color* colour space.
- Supported compression extensions: `KHR_draco_mesh_compression` and `EXT_meshopt_compression`/`KHR_meshopt_compression`. The repo does meshopt in a separate step (`meshopt_glb.mjs`).

### 3.2 Performance rules for a three.js BIM viewer
- **Draw calls dominate before triangles do.** Each mesh × material primitive is about one draw call. Options: `InstancedMesh` (same geometry and material, many transforms, one call); `BatchedMesh` (different geometries, same material, per-object visibility and culling, uses `WEBGL_multi_draw` with a fallback, [docs](https://threejs.org/docs/#api/en/objects/BatchedMesh)); `BufferGeometryUtils.mergeGeometries` (static and fastest, but loses per-object identity). For BIM viewers that need selection and cutaways, prefer instancing or batching keyed by `viewer_id` over merging. The handoff says: "Do not merge entire rooms, floors, furniture rows or different BIM objects to reduce draw calls."
- Fewer **materials** means fewer primitives. Consolidate equivalent materials on the type prototype, and keep material slots per mesh small (1–3).
- Instancing reduces CPU submission and storage, not the per-instance triangle cost. Spend triangles on silhouettes and use normal maps for relief (Khronos guidelines).
- Textures: power-of-two sizes are safest; 512–1024 px for small or repeated objects, ≤2048 px for large surfaces (repo budget, under 256 MiB estimated). Use KTX2/Basis only when the viewer integrates it (repo: future work).
- **Compression:** meshopt (`EXT_meshopt_compression`, via [gltfpack](https://github.com/zeux/meshoptimizer/tree/master/gltf) or [glTF-Transform](https://gltf-transform.dev/modules/extensions/classes/EXTMeshoptCompression)) decodes much faster than Draco and compresses well together with gzip or brotli. Draco usually gives smaller raw geometry but decodes more slowly in a Web Worker. In three.js call `GLTFLoader.setMeshoptDecoder(MeshoptDecoder)` or `setDRACOLoader(...)`. Neither speeds up rendering. Meshopt and Draco are lossy (quantisation), so keep the uncompressed GLB as the IFC exporter input (the repo's `bim_geometry.py` already rejects compressed input).
- Run the [Khronos glTF-Validator](https://github.com/KhronosGroup/glTF-Validator) (`npx gltf-validator model.glb` or the web drag-and-drop) on every release GLB, and treat errors as blockers.

---

## 4. IFC export from a mesh workflow: pitfalls and fixes

| Pitfall | Symptom in CDE / checker | Fix |
|---|---|---|
| **`IfcBuildingElementProxy` overuse** | Elements show as "generic", no quantities, no filtering, no standard psets. Proxy is meant for elements "without having a predefined meaning" or as a placeholder ([IFC4 IfcBuildingElementProxy](https://standards.buildingsmart.org/IFC/RELEASE/IFC4/FINAL/HTML/schema/ifcsharedbldgelements/lexical/ifcbuildingelementproxy.htm)) | Map every category to a real class: `IfcWall`, `IfcSlab`, `IfcRoof`, `IfcCovering`, `IfcBeam`, `IfcColumn`, `IfcMember`, `IfcPlate`, `IfcRailing`, `IfcStair`/`IfcStairFlight`, `IfcRamp`, `IfcDoor`, `IfcWindow`, `IfcFurniture`, `IfcLightFixture`, `IfcSanitaryTerminal`, `IfcFlowTerminal`... Keep the proxy for real unknowns. Add an IDS rule with "proxies prohibited" or "proxies ≤ N" |
| **Missing `IfcRelContainedInSpatialStructure`** | Objects missing from the storey tree, floor filters fail, IDS `partOf` fails | Every top-level product is contained in exactly one storey (or the site for external works). Components of an assembly are *aggregated* to their parent, not contained. Use spatial references for other floors |
| **Wrong units** | Building 1000× too large or small; areas in mm² | `ifcopenshell.api.unit.assign_unit(f, length={"is_metric": True, "raw": "METRE"})` gives METRE, SQUARE_METRE and CUBIC_METRE (verified). Declare angle units if you write angles |
| **Everything as `IfcTriangulatedFaceSet`** | Opens fine, but wall length, area and volume are not computable "by type". Layer build-ups invisible. Large files. CDEs show "Tessellation" | For walls, slabs, columns, beams and simple openings write `IfcExtrudedAreaSolid` (`RepresentationType='SweptSolid'`) plus layer or profile sets. **Verified:** `ifc5d` computed `Qto_WallBaseQuantities` (Length 10.0, GrossSideArea 32.0, NetSideArea 28.22 after two 0.9×2.1 doors, NetVolume 10.724 m³) from such a wall. Keep tessellation for ornament, furniture and sculpture (`Closed` flag only when actually watertight) |
| **No representation maps for types** | Every chair is unique geometry: large IFC, no type-level edits | Type → `IfcRepresentationMap`; occurrences → `IfcMappedItem`. With ifcopenshell, `assign_representation(type, rep)` creates the map and `assign_type(occurrence, type)` maps it (verified: 1 map, 2 mapped items). The repo already does this for tessellated types |
| **Unstable GlobalIds** | CDE revision compare shows everything deleted and re-added | Products: `guid.compress(uuid5(ns, logical_id).hex)` (repo does this). **Also stabilise relationships and psets.** API-created `IfcRel*` and `IfcPropertySet` get random GUIDs. The verified `stabilise_guids()` below makes two rebuilds byte-identical apart from the header timestamp |
| **Visual holes but no `IfcOpeningElement`** | Doors not "in" walls, opening schedules empty, wall net area wrong | Opening (`IfcOpeningElement`, PredefinedType OPENING) → `feature.add_feature` (`IfcRelVoidsElement`) → `feature.add_filling` (`IfcRelFillsElement`). If the wall tessellation already has the hole, the repo currently records voids without a subtractive body. For SweptSolid walls, let the opening body do the cut (verified: NetVolume subtracts) |
| **Spaces from bounding boxes** | Wrong room areas, rooms overlapping walls | Only create `IfcSpace` from real room outlines (polyline extrusion), aggregated into the storey. Otherwise omit (repo rule) |
| **Bad georeferencing** | Model lands in the ocean or rotated; CDE federation misaligned | IFC4: `IfcProjectedCRS` (Name `EPSG:2056` for LV95, VerticalDatum such as `EPSG:5728` LN02, only if verified) plus `IfcMapConversion` (Eastings, Northings, OrthogonalHeight of local 0,0,0; `XAxisAbscissa/Ordinate` = cos/sin of the angle from grid east to project +X; Scale ≈ 1). Large coordinates **without** a Projected CRS are "meaningless" ([Bonsai georeferencing guide](https://github.com/IfcOpenShell/IfcOpenShell/blob/v0.9.0/src/bonsai/docs/guides/authoring/advanced_modeling/georeferencing.rst)). Repo rule: don't emit it when the CRS or datum is unresolved, and never for non-Swiss sites with LV95 |
| **Writing deprecated entities** | Validation warnings | Avoid `IfcWallStandardCase`, `IfcSlabStandardCase` and other `*StandardCase` classes in IFC4 ADD2 TC1 (deprecated in 4.0.2.1; supertypes cover the function). Don't write IFC4.3-only entities into an IFC4 file |
| **Overlapping walls, slabs and columns** | Clash reports, double quantities | Walls stop at the slab underside (or the slab sits between walls). Check with ifcclash (§5). **Verified:** the sample's 3.2 m walls pierce the 0.25 m OG1 slab, and ifcclash reports `Wall E × Slab OG1, type pierce, distance 0.25` |

### 4.1 Verified IfcOpenShell snippet: LOD 300 core
Creates project, units, contexts (Body + Axis), Site/Building/2 storeys, an LV95 `IfcMapConversion`, a **wall type with a 3-layer set**, two walls with `SweptSolid` bodies and Axis curves (occurrences get `IfcMaterialLayerSetUsage` automatically via `assign_type`), a path connection, a slab, a **door type whose parametric representation becomes an `IfcRepresentationMap`**, two door occurrences in **openings with void and fill relations**, a column via **profile set**, an `IfcSpace`, a provenance pset, and stable GlobalIds. Works unchanged in ifcopenshell **0.8.5 and 0.9.0**.

```python
"""Minimal LOD 300 sample: parametric (extruded) wall with layer set, slab, door type with
representation map, opening + void + fill, column via profile set, storey containment,
stable GlobalIds and IfcMapConversion (LV95). Tested with ifcopenshell 0.8.x / 0.9.0."""
import sys, uuid
import numpy as np
import ifcopenshell, ifcopenshell.api as api, ifcopenshell.guid, ifcopenshell.util.placement
from ifcopenshell.api import root, unit, context, aggregate, spatial, geometry, material, type as type_api, feature, pset, georeference, profile

NS = uuid.UUID("6f1c2d3e-0000-4000-8000-000000000001")   # one persistent namespace per project
def gid(key):                                             # stable GlobalId from a logical id (e.g. viewer_id)
    return ifcopenshell.guid.compress(uuid.uuid5(NS, key).hex)
def make(f, cls, key, name=None, **kw):
    e = root.create_entity(f, ifc_class=cls, name=name, **kw)
    e.GlobalId = gid(key)
    return e
def place(f, product, x=0., y=0., z=0., rot_deg=0.):
    c, s = np.cos(np.radians(rot_deg)), np.sin(np.radians(rot_deg))
    m = np.array([[c, -s, 0, x], [s, c, 0, y], [0, 0, 1, z], [0, 0, 0, 1.]])
    geometry.edit_object_placement(f, product=product, matrix=m, is_si=True)

f = ifcopenshell.file(schema="IFC4")
project = make(f, "IfcProject", "project", "Demo")
unit.assign_unit(f, length={"is_metric": True, "raw": "METRE"})          # metres, m2, m3 SI units
model = context.add_context(f, context_type="Model")
body = context.add_context(f, context_type="Model", context_identifier="Body", target_view="MODEL_VIEW", parent=model)
axis_ctx = context.add_context(f, context_type="Model", context_identifier="Axis", target_view="GRAPH_VIEW", parent=model)

# --- georeferencing: local engineering coords -> LV95 (EPSG:2056), heights LN02 (EPSG:5728)
georeference.add_georeferencing(f, ifc_class="IfcMapConversion", name="EPSG:2056")
georeference.edit_georeferencing(f,
    projected_crs={"Name": "EPSG:2056", "Description": "CH1903+ / LV95", "VerticalDatum": "EPSG:5728"},
    coordinate_operation={"Eastings": 2600000.0, "Northings": 1200000.0, "OrthogonalHeight": 540.0,
                          # unit vector of local +X expressed in map axes: rotate local->grid by +7 deg
                          "XAxisAbscissa": float(np.cos(np.radians(7))), "XAxisOrdinate": float(np.sin(np.radians(7))),
                          "Scale": 1.0})

# --- spatial tree (aggregation) ---
site = make(f, "IfcSite", "site", "Site"); building = make(f, "IfcBuilding", "building", "Main House")
eg = make(f, "IfcBuildingStorey", "storey/eg", "EG"); og1 = make(f, "IfcBuildingStorey", "storey/og1", "OG1")
eg.Elevation, og1.Elevation = 0.0, 3.2
for p in (site, building, eg): place(f, p)
place(f, og1, z=3.2)
aggregate.assign_object(f, products=[site], relating_object=project)
aggregate.assign_object(f, products=[building], relating_object=site)
aggregate.assign_object(f, products=[eg, og1], relating_object=building)

# --- materials ---
brick = material.add_material(f, name="Brick", category="brick")
plaster = material.add_material(f, name="Lime plaster", category="plaster")
concrete = material.add_material(f, name="Concrete", category="concrete")
timber = material.add_material(f, name="Oak", category="wood")

# --- wall type with layer set (type carries material, occurrences get IfcMaterialLayerSetUsage) ---
wtype = make(f, "IfcWallType", "type/wall-ext-380", "EXT-380 brick+plaster", predefined_type="SOLIDWALL")
lset = material.add_material_set(f, name="EXT-380", set_type="IfcMaterialLayerSet")
for mat, t in [(plaster, 0.02), (brick, 0.34), (plaster, 0.02)]:
    layer = material.add_layer(f, layer_set=lset, material=mat)
    material.edit_layer(f, layer=layer, attributes={"LayerThickness": t})
material.assign_material(f, products=[wtype], type="IfcMaterialLayerSet", material=lset)
pset.edit_pset(f, pset=pset.add_pset(f, product=wtype, name="Pset_WallCommon"), properties={"IsExternal": True})

def wall(key, name, x, y, rot, length, height=3.2, storey=eg):
    w = make(f, "IfcWall", key, name, predefined_type="SOLIDWALL")
    type_api.assign_type(f, related_objects=[w], relating_type=wtype)         # -> IfcMaterialLayerSetUsage
    place(f, w, x, y, storey.Elevation, rot)
    rep = geometry.add_wall_representation(f, context=body, length=length, height=height, thickness=0.38)
    geometry.assign_representation(f, product=w, representation=rep)        # SweptSolid IfcExtrudedAreaSolid
    geometry.assign_representation(f, product=w, representation=geometry.add_axis_representation(f, context=axis_ctx, axis=[(0., 0.), (length, 0.)]))
    spatial.assign_container(f, products=[w], relating_structure=storey)   # IfcRelContainedInSpatialStructure
    return w
w1 = wall("lohn-main-eg-wall-001", "Wall S", 0, 0, 0, 10.0)
w2 = wall("lohn-main-eg-wall-002", "Wall E", 10.0, 0.38, 90, 7.62)  # butt join: starts at inner face of w1, no overlap
geometry.connect_path(f, relating_element=w1, related_element=w2, relating_connection="ATEND", related_connection="ATSTART")  # L-join

# --- slab: extruded polyline, depth downward from top of slab ---
slab = make(f, "IfcSlab", "lohn-main-og1-slab-001", "Slab OG1", predefined_type="FLOOR")
place(f, slab, z=og1.Elevation)
geometry.assign_representation(f, product=slab, representation=geometry.add_slab_representation(
    f, context=body, depth=0.25, direction_sense="NEGATIVE", polyline=[(0, 0), (10, 0), (10, 8), (0, 8)]))
material.assign_material(f, products=[slab], type="IfcMaterial", material=concrete)
spatial.assign_container(f, products=[slab], relating_structure=og1)

# --- door type with parametric representation -> IfcRepresentationMap, occurrences -> IfcMappedItem ---
dtype = make(f, "IfcDoorType", "type/door-900x2100", "D 900x2100 oak", predefined_type="DOOR")
dtype.OperationType = "SINGLE_SWING_LEFT"
drep = geometry.add_door_representation(f, context=body, overall_width=0.9, overall_height=2.1, operation_type="SINGLE_SWING_LEFT",
                                        lining_properties={"LiningDepth": 0.05, "LiningThickness": 0.05})
geometry.assign_representation(f, product=dtype, representation=drep)    # on a type this creates an IfcRepresentationMap
material.assign_material(f, products=[dtype], type="IfcMaterial", material=timber)

def door(key, host, x_along, sill=0.0):
    # 1) opening (IfcOpeningElement) as box through the whole wall thickness, in host-local coords
    op = make(f, "IfcOpeningElement", key + "/opening", "Opening", predefined_type="OPENING")
    hm = ifcopenshell.util.placement.get_local_placement(host.ObjectPlacement)
    local = np.eye(4); local[0, 3] = x_along; local[1, 3] = -0.05; local[2, 3] = sill
    geometry.edit_object_placement(f, product=op, matrix=hm @ local, is_si=True)
    geometry.assign_representation(f, product=op, representation=geometry.add_wall_representation(f, context=body, length=0.9, height=2.1, thickness=0.48))
    feature.add_feature(f, feature=op, element=host)       # IfcRelVoidsElement: wall is cut
    # 2) door occurrence of the type, placed at the opening, filling it
    d = make(f, "IfcDoor", key, "Door", predefined_type="DOOR")
    d.OverallWidth, d.OverallHeight = 0.9, 2.1
    local2 = np.eye(4); local2[0, 3] = x_along; local2[2, 3] = sill
    geometry.edit_object_placement(f, product=d, matrix=hm @ local2, is_si=True)
    type_api.assign_type(f, related_objects=[d], relating_type=dtype)   # maps type representation onto occurrence
    feature.add_filling(f, opening=op, element=d)            # IfcRelFillsElement
    spatial.assign_container(f, products=[d], relating_structure=eg)
    return d
d1 = door("lohn-main-eg-door-001", w1, 2.0)
d2 = door("lohn-main-eg-door-002", w1, 6.0)

# --- column type via profile set (IfcMaterialProfileSet + parameterised profile) ---
ctype = make(f, "IfcColumnType", "type/col-300", "C 300x300 concrete", predefined_type="COLUMN")
prof = profile.add_parameterized_profile(f, ifc_class="IfcRectangleProfileDef"); prof.ProfileName = "300x300"; prof.XDim = prof.YDim = 0.3
pset_ = material.add_material_set(f, name="C300", set_type="IfcMaterialProfileSet")
material.add_profile(f, profile_set=pset_, material=concrete, profile=prof)
material.assign_material(f, products=[ctype], type="IfcMaterialProfileSet", material=pset_)
col = make(f, "IfcColumn", "lohn-main-eg-column-001", "Column", predefined_type="COLUMN")
type_api.assign_type(f, related_objects=[col], relating_type=ctype)
place(f, col, 5.0, 4.0, 0.0)
geometry.assign_representation(f, product=col, representation=geometry.add_profile_representation(f, context=body, profile=prof, depth=2.95))
spatial.assign_container(f, products=[col], relating_structure=eg)

# --- space (only from a real room outline, not a bounding box) ---
sp = make(f, "IfcSpace", "lohn-main-eg-room-001", "Salon", predefined_type="INTERNAL")
place(f, sp, 0.19, 0.19, 0.0)
geometry.assign_representation(f, product=sp, representation=geometry.add_slab_representation(f, context=body, depth=2.95, polyline=[(0, 0), (9.62, 0), (9.62, 7.62), (0, 7.62)]))
aggregate.assign_object(f, products=[sp], relating_object=eg)   # spaces are aggregated, not contained

# --- project-specific evidence pset ---
pset.edit_pset(f, pset=pset.add_pset(f, product=w1, name="Reconstruction_Provenance"),
               properties={"ViewerId": "lohn-main-eg-wall-001", "Basis": "measured", "Source": "plan EG 1:100"})
# --- make API-created relationships/psets deterministic too (products already have stable ids) ---
def stabilise_guids(f):
    """Re-key every IfcRoot that was not given an explicit id: relationships and property sets get a GlobalId
    derived from their class, name and the stable GlobalIds they connect. Run once, just before writing."""
    def refs(e):
        out = []
        for v in e:  # attribute values
            for x in (v if isinstance(v, tuple) else (v,)):
                if isinstance(x, ifcopenshell.entity_instance) and x.is_a("IfcRoot"):
                    out.append(x.GlobalId)
        return out
    stable = {e.GlobalId for e in f.by_type("IfcObjectDefinition")}
    for e in f.by_type("IfcRelationship"):               # first relationships: they only reference stable objects/psets
        if not e.is_a("IfcRelDefinesByProperties"):
            e.GlobalId = gid(e.is_a() + "|" + "|".join(sorted(refs(e))))
    for r in f.by_type("IfcRelDefinesByProperties"):     # psets: owner ids + pset name
        owners = sorted(o.GlobalId for o in r.RelatedObjects)
        r.RelatingPropertyDefinition.GlobalId = gid("pset|" + r.RelatingPropertyDefinition.Name + "|" + "|".join(owners))
        r.GlobalId = gid("rel-pset|" + r.RelatingPropertyDefinition.GlobalId)
    for t in f.by_type("IfcTypeObject"):                  # psets held directly by types
        for ps in t.HasPropertySets or ():
            ps.GlobalId = gid("pset|" + ps.Name + "|" + t.GlobalId)
stabilise_guids(f)
out = sys.argv[1] if len(sys.argv) > 1 else "sample.ifc"
f.write(out); print("wrote", out, ifcopenshell.version)
```

Check output (0.9.0; same with 0.8.5):
```
validate issues: 0                                   # ifcopenshell.validate with express_rules=True
IfcColumn  reps=['SweptSolid']              vol=0.265  container=EG  mat=IfcMaterialProfileSetUsage
IfcDoor    reps=['MappedRepresentation']    vol=0.076  container=EG  type=D 900x2100 oak
IfcSlab    reps=['SweptSolid']              vol=20.000 container=OG1
IfcWall    reps=['SweptSolid','Curve2D']    vol=10.724 container=EG  type=EXT-380  mat=IfcMaterialLayerSetUsage   # 12.16 − 2 openings
IfcWall    reps=['SweptSolid','Curve2D']    vol=9.266  container=EG
RepresentationMaps: 1  MappedItems: 2  Voids: 2  Fills: 2  PathConnects: 1
MapConversion: 2600000.0 1200000.0 540.0 0.9925 0.1219 EPSG:2056
Units: METRE, SQUARE_METRE, CUBIC_METRE
```

Gotchas found while testing:
- `ifcopenshell.validate(..., express_rules=True)` needs **pytest** installed (`ModuleNotFoundError: _pytest` otherwise). The repo's requirements already pin pytest.
- `geometry.connect_path` only records the join (`IfcRelConnectsPathElements`). It does **not** trim bodies. Overlapping boxes stay overlapping, so shorten the lengths yourself (as in the sample) or add clippings.
- `add_wall_representation` extrudes the thickness towards local +Y from the placement. Choose the placement so the wall lies on the intended side of the plan line.
- `edit_object_placement(..., matrix)` expects SI (metres) with `is_si=True`. Placements are written relative to the container's placement if there is one.
- The IFC4 file is `ADD2 TC1` (`FILE_SCHEMA(('IFC4'))`). Keep the repo's "IFC4 ADD2 TC1 / 4.0.2.1" provenance label.

### 4.2 Base quantities (verified with `ifc5d`, `pip install ifc5d`)
```python
"""Compute IFC4 base quantities (Qto_*BaseQuantities) from SweptSolid geometry with ifc5d."""
import sys, ifcopenshell, ifc5d.qto, ifcopenshell.util.element as ue
f = ifcopenshell.open(sys.argv[1])
elements = set(f.by_type("IfcWall") + f.by_type("IfcSlab") + f.by_type("IfcColumn") + f.by_type("IfcDoor"))
results = ifc5d.qto.quantify(f, elements, ifc5d.qto.rules["IFC4QtoBaseQuantities"])
ifc5d.qto.edit_qtos(f, results)
for w in f.by_type("IfcWall"):
    q = ue.get_psets(w, qtos_only=True).get("Qto_WallBaseQuantities", {})
    print(w.Name, {k: round(v, 3) for k, v in q.items() if k != "id"})
f.write(sys.argv[2])
```
Output: `Wall S {'GrossFootprintArea': 3.8, 'GrossSideArea': 32.0, 'GrossVolume': 12.16, 'Height': 3.2, 'Length': 10.0, 'NetSideArea': 28.22, 'NetVolume': 10.724, 'Width': 0.38}`. Write computed quantities only for SweptSolid elements whose geometry is meaningful, label `MethodOfMeasurement`, and never present reconstruction quantities as surveyed (repo rule).

### 4.3 How to bring this into the repo's pipeline (suggestion, not implemented)
- Add optional parametric fields to `bim.json` elements: walls `{axisStart, axisEnd, thickness, height, baseZ, layerSetId}`; slabs `{polyline, depth, topZ}`; columns `{profile, height}`. These can be derived from the Blender objects when walls are built by the script above. `export_ifc.py` then emits `SweptSolid` for elements that have those fields and falls back to the current tessellation otherwise. Keep the GLB tessellation as a cross-check: compare bounds with the existing ≤0.001 m tolerance.
- Keep `IfcRepresentationMap` reuse for tessellated types (already implemented). Material layer and profile sets belong on the **type**.

---

## 5. Checking tools

| Tool | What it checks | How (verified where marked ✓) |
|---|---|---|
| **IfcOpenShell validate** ✓ | STEP syntax, schema types, cardinalities, inverse attributes, EXPRESS WHERE rules (`--rules`) | `python -m ifcopenshell.validate --rules model.ifc` (also `--json`, `--fields`). In Python: `ifcopenshell.validate.validate(f, json_logger(), express_rules=True)` (needs pytest) |
| **buildingSMART Validation Service** | Schema, normative rules (implementer agreements as Gherkin rules), non-normative warnings, bSDD references. Free web upload. Does **not** check project requirements | [validate.buildingsmart.org](https://validate.buildingsmart.org/), rules in [buildingSMART/ifc-gherkin-rules](https://github.com/buildingSMART/ifc-gherkin-rules), [service info](https://technical.buildingsmart.org/services/validation-service/) |
| **ifctester + IDS** ✓ | Project information requirements: classes present or prohibited, containment, properties with datatypes, materials, attributes, classifications | Snippet below. CLI: `python -m ifctester spec.ids model.ifc -r Html -o report.html` (also `Json`, `Bcf`). IDS 1.0 standard: [buildingSMART/IDS](https://github.com/buildingSMART/IDS) |
| **ifcclash** ✓ | Geometric clashes (intersection, collision, clearance) between selector groups, JSON or BCF output | `pip install ifcclash`; `python -m ifcclash clash.json -o out.json` (example below). Docs: [IfcOpenShell ifcclash](https://docs.ifcopenshell.org/ifcclash.html) |
| **ifcdiff / ifcpatch** | Revision comparison by GlobalId; scripted fixes (e.g. ResetAbsoluteCoordinates, ExtractElements) | `pip install ifcdiff ifcpatch` (0.9.0 wheels exist). Use ifcdiff to prove GUID stability between releases |
| **ifcopenshell.geom round trip** | Every product's geometry regenerates; bounds compare with the source | Already in `export_ifc.py` (`cgal-simple`) |
| **BIMcollab Zoom (free)** | Visual check in an independent IFC viewer; free Smart Views (colour or filter by property) for "Solibri-like" rule checking; clash rules and IDS checking need a licence | [BIMcollab Zoom free vs licensed](https://helpcenter.bimcollab.com/portal/en/kb/articles/what-added-features-does-bimcollab-zoom-offer-on-top-of-ifc-model-viewing) |
| **That Open Engine / xeokit** | Open-source web IFC viewers (web-ifc / xeokit-convert) for checking what a browser CDE will show | [That Open docs](https://docs.thatopen.com/), [xeokit SDK](https://xeokit.io/) |
| **"Solibri-like" rules with open tools** | IDS (information) + ifcclash (geometry) + small Python rules with `ifcopenshell.util.element` (e.g. every door's opening voids a wall of the same storey; stairs reach the next storey ±riser; no space without a boundary) | Wrap in one script and write a BCF or JSON report into `releases/vNNN/validation/` |
| **Blender 3D-Print Toolbox** | Manifold, intersections, distorted faces, thin walls | §2.3 |
| **glTF-Validator** | glTF/GLB spec conformance, accessor bounds, unused data | [KhronosGroup/glTF-Validator](https://github.com/KhronosGroup/glTF-Validator) |

### 5.1 Verified IDS snippet (ifctester 0.9.0)
```python
"""Build a small IDS (Information Delivery Specification) and check an IFC with ifctester."""
import sys
import ifcopenshell
from ifctester import ids, reporter
spec_set = ids.Ids(title="Reconstruction LOD300 basics", author="agent@example.org", version="0.1")

s1 = ids.Specification(name="Walls are contained in a storey, have IsExternal and a material", ifcVersion=["IFC4"])
s1.applicability.append(ids.Entity(name="IFCWALL"))
s1.requirements.append(ids.PartOf(name="IFCBUILDINGSTOREY", relation="IFCRELCONTAINEDINSPATIALSTRUCTURE"))
# NB: IDS 1.0 partOf only allows AGGREGATES / ASSIGNSTOGROUP / CONTAINEDINSPATIALSTRUCTURE / NESTS / "VOIDSELEMENT FILLSELEMENT"; type assignment is not a partOf relation.
s1.requirements.append(ids.Property(propertySet="Pset_WallCommon", baseName="IsExternal", dataType="IFCBOOLEAN"))  # inherited from type
s1.requirements.append(ids.Material(cardinality="required"))

s2 = ids.Specification(name="No proxies", ifcVersion=["IFC4"], minOccurs=0, maxOccurs=0)  # prohibited
s2.applicability.append(ids.Entity(name="IFCBUILDINGELEMENTPROXY"))

s3 = ids.Specification(name="Doors fill an opening in a wall", ifcVersion=["IFC4"])
s3.applicability.append(ids.Entity(name="IFCDOOR"))
s3.requirements.append(ids.PartOf(name="IFCWALL", relation="IFCRELVOIDSELEMENT IFCRELFILLSELEMENT"))
s3.requirements.append(ids.Attribute(name="OverallWidth"))

s4 = ids.Specification(name="Every product carries provenance id", ifcVersion=["IFC4"])
s4.applicability.append(ids.Entity(name="IFCWALL"))
s4.requirements.append(ids.Property(propertySet="Reconstruction_Provenance", baseName="ViewerId", dataType="IFCLABEL"))

spec_set.specifications += [s1, s2, s3, s4]
spec_set.to_xml("lod300.ids")
model = ifcopenshell.open(sys.argv[1])
spec_set.validate(model)
r = reporter.Console(spec_set); r.report()
j = reporter.Json(spec_set); j.report(); j.to_file("ids-report.json")
```
Result on the sample: specs 1–3 **PASS**. Spec 4 **FAIL** (deliberately, because only one wall carries `Reconstruction_Provenance.ViewerId`): `The required property set does not exist - #103=IfcWall(...'Wall E'...)`. Gotcha: IDS 1.0 `partOf` only allows `IFCRELAGGREGATES`, `IFCRELASSIGNSTOGROUP`, `IFCRELCONTAINEDINSPATIALSTRUCTURE`, `IFCRELNESTS` and `"IFCRELVOIDSELEMENT IFCRELFILLSELEMENT"`, so type assignment cannot be required via `partOf` (ifctester raises an XML schema error). Properties defined on the **type** are inherited and satisfy occurrence property requirements.

### 5.2 Verified ifcclash input
```json
[{"name": "Walls vs columns+slabs", "tolerance": 0.01, "mode": "intersection", "check_all": false, "allow_touching": false,
  "a": [{"file": "sample.ifc", "selector": "IfcWall", "mode": "i"}],
  "b": [{"file": "sample.ifc", "selector": "IfcColumn, IfcSlab", "mode": "i"}]}]
```
Found `IfcWall 'Wall E' × IfcSlab 'Slab OG1'  type=pierce distance=0.25`, the real modelling error in the sample (walls at full storey height under a slab whose top is at the storey level).

---

## 6. Checklist for an agent (copy into a build step)

**Blender source**
- [ ] Units metric, scale 1.0, Z-up; local origin near the building; no LV95 numbers in vertices.
- [ ] Every exported mesh object has scale (1,1,1), positive determinant, no unapplied modifiers on multi-user meshes.
- [ ] Walls: one straight segment per object and storey, built as an extruded box from plan lines, butt-joined without overlap, origin at the axis start, +X along the wall.
- [ ] Openings: host wall has a clean hole made of quads (export copy) **and** the opening is recorded in `bim.json` (host, filling, profile, depth).
- [ ] Repeated products are linked duplicates of `Types` prototypes; materials on mesh data; `linkedMeshesReused` in `hygiene.py` grows, not `uniqueMeshes`.
- [ ] `viewer_*` properties complete; arrays are lists; IDs unique and stable.
- [ ] `hygiene.py`, `coplanar.py`, `dollhouse_audit.py`, `furniture_check.py` pass or have recorded exceptions.

**GLB**
- [ ] `export_extras=True`, `export_yup=True`, `export_gpu_instances=False`. Meshopt in a later step only. Keep the uncompressed GLB for IFC.
- [ ] `gltf-validator` shows no errors; GLB mesh count ≈ unique types (not occurrences); extras present on nodes.
- [ ] Texture sizes in budget; one material per type where possible.

**IFC4**
- [ ] Classes mapped, proxies only for unknowns. Every product contained in exactly one storey, with references for other storeys. Spaces only from real outlines.
- [ ] Walls, slabs, columns as SweptSolid plus layer or profile sets where parameters exist; everything else tessellated with type representation maps.
- [ ] Units METRE; GlobalIds deterministic for products **and** relationships and psets (ifcdiff shows no churn).
- [ ] `IfcMapConversion` + `IfcProjectedCRS` only with verified CRS and datum; check control points.
- [ ] `ifcopenshell.validate --rules` clean; buildingSMART validation service; project IDS passes; ifcclash wall/slab/column clean; opened in BIMcollab Zoom or a web viewer.

---

## 7. Sources
- Bonsai docs (source rst, branch v0.9.0): [Creating walls](https://github.com/IfcOpenShell/IfcOpenShell/blob/v0.9.0/src/bonsai/docs/guides/authoring/basic_modeling/creating_walls.rst) · [Door](https://github.com/IfcOpenShell/IfcOpenShell/blob/v0.9.0/src/bonsai/docs/guides/authoring/basic_modeling/door.rst) · [Window](https://github.com/IfcOpenShell/IfcOpenShell/blob/v0.9.0/src/bonsai/docs/guides/authoring/basic_modeling/window.rst) · [Opening](https://github.com/IfcOpenShell/IfcOpenShell/blob/v0.9.0/src/bonsai/docs/guides/authoring/basic_modeling/opening.rst) · [Toolbar: wall](https://github.com/IfcOpenShell/IfcOpenShell/blob/v0.9.0/src/bonsai/docs/reference/toolbar/wall.rst) · [Geometry and representations](https://github.com/IfcOpenShell/IfcOpenShell/blob/v0.9.0/src/bonsai/docs/guides/authoring/understanding_ifc/geometry_and_representations.rst) · [Working with representations](https://github.com/IfcOpenShell/IfcOpenShell/blob/v0.9.0/src/bonsai/docs/guides/authoring/understanding_ifc/working_with_representations.rst) · [Material assignment](https://github.com/IfcOpenShell/IfcOpenShell/blob/v0.9.0/src/bonsai/docs/guides/authoring/advanced_modeling/material_assignment.rst) · [Georeferencing](https://github.com/IfcOpenShell/IfcOpenShell/blob/v0.9.0/src/bonsai/docs/guides/authoring/advanced_modeling/georeferencing.rst) · [Starting a new project](https://github.com/IfcOpenShell/IfcOpenShell/blob/v0.9.0/src/bonsai/docs/guides/authoring/starting_new_project.rst) · [Large models](https://github.com/IfcOpenShell/IfcOpenShell/blob/v0.9.0/src/bonsai/docs/guides/viewing/dealing_with_large_models.rst) · [stair.py generator](https://github.com/IfcOpenShell/IfcOpenShell/blob/v0.9.0/src/bonsai/bonsai/bim/module/model/stair.py). Published site: [docs.bonsaibim.org Creating Walls](https://docs.bonsaibim.org/guides/authoring/basic_modeling/creating_walls.html)
- OSArch: [Bonsai Setting up a BIM Project](https://wiki.osarch.org/bonsai-setting-up-a-bim-project/) · [Bonsai Features Guide](https://wiki.osarch.org/bonsai-features-guide/) · [Wall/slab layer intersection thread](https://community.osarch.org/discussion/comment/25589/) · [Bonsai "Families" thread](https://community.osarch.org/discussion/comment/26910/) · [Parametric doors and windows thread](https://community.osarch.org/discussion/comment/23441/)
- IfcOpenShell: [API docs](https://docs.ifcopenshell.org/autoapi/ifcopenshell/api/index.html) · [validation](https://docs.ifcopenshell.org/ifcopenshell-python/validation.html) · [ifctester](https://docs.ifcopenshell.org/ifctester.html) · [ifcclash](https://docs.ifcopenshell.org/ifcclash.html) · [GUID](https://docs.ifcopenshell.org/autoapi/ifcopenshell/guid/index.html) · PyPI: [ifcopenshell](https://pypi.org/project/ifcopenshell/), [ifctester](https://pypi.org/project/ifctester/), [ifcclash](https://pypi.org/project/ifcclash/), [ifc5d](https://pypi.org/project/ifc5d/)
- buildingSMART: [IFC4 ADD2 TC1](https://standards.buildingsmart.org/IFC/RELEASE/IFC4/ADD2_TC1/HTML/) · [IfcRelContainedInSpatialStructure](https://standards.buildingsmart.org/IFC/RELEASE/IFC4/FINAL/HTML/schema/ifcproductextension/lexical/ifcrelcontainedinspatialstructure.htm) · [Spatial structure template](https://standards.buildingsmart.org/IFC/RELEASE/IFC4/ADD2_TC1/HTML/schema/templates/spatial-structure.htm) · [IfcBuildingElementProxy](https://standards.buildingsmart.org/IFC/RELEASE/IFC4/FINAL/HTML/schema/ifcsharedbldgelements/lexical/ifcbuildingelementproxy.htm) · [4.0.2.1 change log (StandardCase deprecated)](https://standards.buildingsmart.org/IFC/RELEASE/IFC4/ADD2_TC1/HTML/annex/annex-f/4021/index.htm) · [IfcMapConversion](https://standards.buildingsmart.org/IFC/RELEASE/IFC4/ADD2_TC1/HTML/schema/ifcrepresentationresource/lexical/ifcmapconversion.htm) · [Project global positioning concept](https://standards.buildingsmart.org/IFC/DEV/IFC4_4/HTML/concepts/Project_Context/Project_Global_Positioning/content.html) · [Georeferencing user guide discussion](https://forums.buildingsmart.org/t/geolocation-standards-in-ifc2x3-and-ifc4/2329) · [IfcGref (TU Delft)](https://ifcgref.bk.tudelft.nl/) · [IDS](https://github.com/buildingSMART/IDS) · [Validation service](https://technical.buildingsmart.org/services/validation-service/) · [ifc-gherkin-rules](https://github.com/buildingSMART/ifc-gherkin-rules)
- IFC export mistakes: [bimcorner: 10 common IFC export mistakes](https://bimcorner.com/10-common-ifc-export-mistakes-to-avoid-part-1/)
- glTF/Blender: [Blender glTF exporter docs (source)](https://github.com/KhronosGroup/glTF-Blender-IO/blob/main/docs/blender_docs/scene_gltf2.rst) · [glTF 2.0 spec](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html) · [EXT_mesh_gpu_instancing](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Vendor/EXT_mesh_gpu_instancing) · [Khronos Asset Creation Guidelines 2.0](https://github.com/KhronosGroup/3DC-Asset-Creation/blob/main/asset-creation-guidelines/RealtimeAssetCreationGuidelines.md) ([announcement](https://www.khronos.org/blog/introducing-asset-creation-guidelines-2.0-siggraph-2025)) · [Khronos forum: instancing in glTF](https://community.khronos.org/t/instancing-in-gltf/106027) · [glTF-Validator](https://github.com/KhronosGroup/glTF-Validator) · [Blender 3D Print Toolbox](https://docs.blender.org/manual/en/4.1/addons/mesh/3d_print_toolbox.html)
- three.js and compression: [BatchedMesh](https://threejs.org/docs/#api/en/objects/BatchedMesh) · [InstancedMesh](https://threejs.org/docs/#api/en/objects/InstancedMesh) · [meshoptimizer / gltfpack](https://github.com/zeux/meshoptimizer) · [glTF-Transform EXTMeshoptCompression](https://gltf-transform.dev/modules/extensions/classes/EXTMeshoptCompression) · [EXT_meshopt_compression PR (vs Draco)](https://github.com/KhronosGroup/glTF/pull/1830) · [A-Frame gltf-model notes on Draco/meshopt](https://aframe.io/docs/1.6.0/components/gltf-model.html)
- Viewers: [BIMcollab Zoom free features](https://helpcenter.bimcollab.com/portal/en/kb/articles/what-added-features-does-bimcollab-zoom-offer-on-top-of-ifc-model-viewing) · [That Open](https://docs.thatopen.com/) · [xeokit](https://xeokit.io/)
