# BIM modelling guide

[← Repository](../../README.md) · [Handbook](../reconstruction-handbook.md) · [Conventions](../conventions.md) · [Pitfalls](../pitfalls.md) · [Model handoff](../model-handoff.md)

How to model a reconstruction so that every building in this repository has the same clean, accurate and consistent geometry and information. It is written for agents and people who are **not** CAD or BIM specialists. It sets the target; the [handbook](../reconstruction-handbook.md) describes the work process and the [model handoff](../model-handoff.md) the delivery contract of the viewer and pipeline.

The rules consolidate public modelling guidelines from Switzerland, Germany, Austria and international sources (buildingSMART, BIMForum, COBIM, Statsbygg, BIM basis ILS, NBS, Historic England and others) and are adapted to this project. Sources, quotes and how far each was verified are in [research/](research/README.md).

| Read | When |
|---|---|
| This page | Before modelling anything, and when a review finds a mistake |
| [Element rules](element-rules.md) | While modelling an element: what it is, LOD 200 and 300, how to build it, typical mistakes |
| [Federated models](federated-models.md) | Before splitting work between teams: building, site and surroundings |
| [Working in Blender](blender-workflow.md) | Before working in Blender, through background scripts or live through MCP |
| [Mistakes and checks](mistakes-and-checks.md) | Before every release: the mistakes agents make most and the check that finds each |
| [Examples](examples/README.md) | To see what correct looks like: a golden example, Blender script, buildingSMART samples, IDS files, agent skills |
| [IDS files](ids/README.md) | To check an IFC export against the information requirements |
| [Research](research/README.md) | To see where a rule comes from |

---

## 1. What we build

**A light architectural as-built (survey) model for viewing and facility management (CAFM).** It is an evidence-based reconstruction of an existing building, delivered twice from the same source:

- a **GLB** for the shared three.js viewer (textured, light, one selectable object per product);
- an **IFC 4** file (ISO 16739-1, IFC4 ADD2 TC1) for a common data environment (CDE): classified products in a spatial structure, with types, rooms and a small set of properties.

| In scope | Out of scope |
|---|---|
| Walls, slabs, roofs, visible columns and beams, stairs, ramps, railings, openings, doors, windows, ceilings and finishes where visible, built-in fittings, furniture, chimneys and stoves, sculpture and ornament as objects | Building services of every kind (heating, ventilation, plumbing, electrical, fire safety systems, lifts as machinery), systems and connections |
| Rooms (`IfcSpace`) with number, name and net floor area | Structural analysis, reinforcement, connections, foundations below ground unless visible |
| Storeys, site (parcel) and surroundings | Multi-layer constructions (insulation, screed, plaster as separate layers), simulation data (thermal, acoustic, fire ratings) |
| Evidence class, source and confidence of every product | Costs, schedules, manufacturer data |

Visible decorative luminaires (chandeliers, wall lights) may be modelled as furnishing objects because they shape the interior; they carry no electrical data.

A reconstruction has **three models**, built and released separately so that teams can work in parallel: the **building**, the **building site** (the parcel up to its boundary) and the **surroundings** (everything outside the parcel). They share one origin and one set of control data. See [Federated models](federated-models.md).

## 2. Level of geometry: LOD 200 and LOD 300

"LOD" here means *level of development* in the sense of the BIMForum specification: how specific and how reliable the geometry of an element is. It says nothing about survey accuracy; that is the evidence class (§3). The same element can be modelled to LOD 300 and still be *inferred*.

| | LOD 200: generic | LOD 300: specific |
|---|---|---|
| Meaning | The element is there, recognisable as what it is, with approximate size, shape, position and orientation. | The element has its specific size, shape, position, orientation and count; every dimension can be measured from the model. |
| Shape | Simplified, but the surfaces must still **enclose the real element** (a generic wall is not thinner than the real wall). | Specific: the real profile at the scale of a 1:50 drawing. |
| Position and size (this project) | within about ±25 cm of the evidence | within about ±5 cm of the evidence, or the evidence's own accuracy if worse |
| Openings | large openings only | every opening wider than about 15 cm |
| Detail below about 5 cm | omitted | as texture or normal map, not geometry (except silhouettes that matter, e.g. a cornice profile) |
| Type | generic type ("Door, single, 1.00 × 2.10") | specific type per evidenced design ("Door, oak, two panels, 1.00 × 2.10") |

**Target per element group**

| Group | Target | Notes |
|---|---|---|
| Envelope: exterior walls, roofs, facade openings, doors, windows, balconies | **300** where seen in plans, photographs, LiDAR or a tour; otherwise 200 and *inferred* | Facade rhythm, sill and head heights, eaves and ridge against LiDAR |
| Interior structure: interior walls, slabs, visible columns and beams, stairs, ramps, railings | **300** where seen; 200 for hidden or undocumented parts | Stairs: riser count and height, landings and flights must be right at 300 |
| Rooms (`IfcSpace`) | same LOD as their bounding walls, never higher | A room cannot be more specific than the walls around it |
| Ceilings, finishes, built-in fittings | **200**, 300 where photographed and relevant | Finishes as thin separate elements only where they are visible and needed |
| Furniture and decoration | **200**: correct footprint, height, position and facing; simplified period shape | Shared types; no artwork reproduced |
| Building site (parcel) | **200**; 300 for paths, steps and walls next to the building | Terrain from the terrain model, not sculpted |
| Surroundings | **100–200**: terrain, neighbouring buildings as massing with roof shape where available | Never more detailed than the source data |

An element modelled at LOD 300 from evidence that does not support it is worse than an honest LOD 200 element: it looks certain and is not.

## 3. Level of information (LOI): the minimum, always complete

Basic, but the same in every building and on every product. Nothing is invented: an unknown value is left out (or marked `unknown`), never filled with a guess, a zero or `false`.

| Information | Where in Blender (object custom property) | Where in IFC | Required for |
|---|---|---|---|
| Stable id | `viewer_id` | `GlobalId` (derived from the id), `ReconstructionEvidence.ProductId` | every product |
| Name | object name, readable (`Saal chair 3`, not `Cube.034`) | `Name` | every product |
| Category | `viewer_category` ([list](element-rules.md#category-to-ifc-class)) | IFC class + `PredefinedType`, `ReconstructionEvidence.Category` | every product |
| Family and type | `viewer_family_id`, `viewer_type_id` | `Ifc…Type`, type name | every product |
| Storey | `viewer_floor_ids` | contained in exactly one `IfcBuildingStorey` | every building product |
| Room | `viewer_room_ids` where known | `IfcSpace` (rooms) and room ids | furniture, doors (where known) |
| Material | one material per type (`sandstone`, `oak`, `plastered brick`, `unknown`) | `IfcMaterial` on the type | walls, slabs, roofs, columns, beams, stairs, doors, windows |
| Inside or outside | `viewer_environment` (`interior`, `exterior`, `boundary`) | `Pset_WallCommon` / `Pset_DoorCommon` / `Pset_WindowCommon` `.IsExternal` | walls, doors, windows |
| Opening host | `viewer_host_id` = id of the wall | `IfcOpeningElement` voiding the wall, filled by the door or window | doors, windows |
| Evidence class | `viewer_evidence_basis`: `measured`, `inferred` or `unknown` *(proposed shared name, replacing per-building names such as `lohn_basis`)* | `ReconstructionEvidence.EvidenceBasis` | every product |
| Evidence source | `viewer_evidence_source`: reference id, plan sheet, panorama node, LiDAR | `ReconstructionEvidence.Source` | every product |
| Confidence | `viewer_classification_confidence`: `low`, `medium`, `high` | `ReconstructionEvidence.Confidence` | every product |
| Room number, name, area | room record (see [rooms](element-rules.md#rooms-ifcspace)) | `IfcSpace.Name`, `LongName`, `Qto_SpaceBaseQuantities.NetFloorArea` | every room |

**Do not write** load-bearing status, fire rating, thermal values, U-values, acoustic ratings, manufacturer, cost or installation dates unless a registered source states them. Material species ("oak") only when evidenced; otherwise the visible material class ("timber") or `unknown`.

The evidence classes are those of the [conventions](../conventions.md#evidence-classes): **measured** (plan dimension, LiDAR, calibrated photograph), **inferred** (proportion, symmetry, typical construction; basis written in the source), **unknown** (marked placeholder). The machine-readable version of this table is in [ids/](ids/README.md).

## 4. The golden rules

The fifteen rules that prevent most mistakes. Each links to the element rules and to the check that catches a violation.

1. **Evidence before geometry.** Build from calibrated plans, LiDAR, photographs and tours through scripts. Never invent geometry to close a gap; model a marked placeholder (`unknown`) and log it.
2. **One object per physical product.** A wall segment, a door, a chair, a stair flight: each is its own object with its own id. Never merge a room, a floor, a facade or a row of chairs into one mesh. Never split one product into unrelated pieces without an assembly root.
3. **The right class for every object.** A column is a column, not a thin wall; a roof is a roof, not a proxy; a floor finish is a covering, not a thicker slab. `IfcBuildingElementProxy` is a named, recorded last resort (target: under 10 % of products, and never for walls, slabs, roofs, stairs, doors or windows).
4. **Model per storey.** Every element belongs to exactly one storey: the storey it stands on. Walls and columns stop at the underside of the slab above. Only stairs, ramps, shafts, multi-storey spaces and facade elements that are physically continuous span storeys, and they are contained in their lowest storey.
5. **Walls are straight segments.** One extruded rectangle per straight wall run between corners, junctions or storey levels, with constant thickness. Curved walls are faceted into straight segments; irregular historic walls get a mean plane per segment. No free-form wall meshes.
6. **Elements meet and do not overlap.** Walls stand on slabs and touch the slab above; slabs reach the outer face of the exterior walls; wall ends butt against each other at corners. No gaps, no double volume, no coplanar faces.
7. **Openings before fillings.** First the opening in the host wall, then the door or window type placed in it. A door is never a box in a solid wall, and an opening is never only a visual hole.
8. **Types for everything that repeats.** Doors, windows, columns, chairs, tables, balusters: one type, many placements (linked duplicates in Blender, one shared mesh in the GLB, one representation map in IFC). Equal pieces share a type; snap sizes (5 cm) so that they do.
9. **Do not skip elements.** Columns, beams, stairs, railings, landings, chimneys, thresholds and ceilings that the evidence shows are modelled; their absence is recorded.
10. **Stairs are assemblies.** One stair = flights + landings + railings, aggregated under one stair object. Never one mesh for the whole stair, and never one stair object per tread.
11. **One origin, metres, Z up.** Local origin near the building, 1 unit = 1 m, scale 1 on every object, no mirrored transforms. Map coordinates (LV95, LN02) live in the georeference record and `IfcMapConversion`, never in vertices.
12. **Rooms are data, not decoration.** Every room of the floor plan is an `IfcSpace` with number, name and measured net floor area, bounded by the inner wall faces.
13. **Light geometry.** Model what the viewer and the CDE need at LOD 200–300; detail below 5 cm goes into textures or normal maps. Reuse meshes; respect the triangle and texture budgets.
14. **Names and ids are stable.** Ids follow [conventions](../conventions.md#names) and never change for the same product; delete an old object and its mesh before re-creating it (no `.001`).
15. **Check, then look.** Run the automated checks and then look at every storey, the dollhouse and the federated view. A model that passes every check can still have a stair standing 20 cm away from its wall.

![What correct looks like: the ground floor of the golden example. Walls stand on the slab and stop at the slab above, doors and windows sit in openings, the stair has two flights, a landing and a railing and runs against its wall, the hall has two columns under a beam](images/golden-building-eg.jpg)

## 5. Modelling order

Work from the outside in and from the structure to the content. Each step is a script in `work/build/scripts/` (see [conventions](../conventions.md#script-prefixes-in-buildscripts)) that reads evidence-derived data and writes Blender objects. Live work in Blender through MCP is fine for inspecting and drafting; every edit then moves into the script ([Working in Blender](blender-workflow.md)).

| Step | Model | Output | Exit check |
|---|---|---|---|
| 0 Control | Origin, georeference, parcel boundary, building footprint, storey levels ([shared control package](federated-models.md#the-shared-control-package)) | `research/derived/*.json`, `building.json` levels | Residuals reported; every team uses the same files |
| 1 Storeys and grid | Storey elevations (finished floor level), plan calibration per sheet, wall axis lines | Level list, calibrated wall lines | Storey heights match sections; plan overlays per floor |
| 2 Slabs | One floor slab per storey over the footprint, with voids for stairs and shafts | `IfcSlab` FLOOR | Slab edges meet the outer wall faces |
| 3 Walls | Exterior then interior wall segments per storey from the wall lines | `IfcWall` | No gaps or overlaps at corners; walls stop at the slab above |
| 4 Columns and beams | Visible columns per storey, beams under slabs | `IfcColumn`, `IfcBeam` | Columns stand on the slab and reach the beam or slab |
| 5 Openings | Openings in the host walls, then door and window types placed in them | openings, `IfcDoor`, `IfcWindow` | Every door and window has a host; hands and sill heights from evidence |
| 6 Roof | Roof planes, dormers, chimneys | `IfcRoof` + roof slabs | Eaves and ridge against LiDAR |
| 7 Stairs and railings | Flights, landings, railings per stair | `IfcStair` assembly | Riser count and height; flights reach landings and slab edges |
| 8 Rooms | Room outlines from the inner wall faces | `IfcSpace` | Room areas vs plan labels (flag > 3 %) |
| 9 Ceilings and finishes | Ceilings, visible finishes, skirting, panelling | `IfcCovering` | Offsets 3–6 mm, no coplanar faces |
| 10 Furniture and decoration | Typed furniture from the inventory | `IfcFurniture` | Facing, on the floor, not in walls |
| 11 Checks and look | All checks of [Mistakes and checks](mistakes-and-checks.md#release-checks) | reports in `build/review/` | Nothing unexplained |

The site and surroundings teams follow the same order for their elements; see [Federated models](federated-models.md).

## 6. Units, coordinates and storeys

- **Units:** metres, 1 Blender unit = 1 m, Z up, unit scale 1.0. glTF conversion `(x, y, z) → (x, z, −y)` is done by the exporter.
- **Origin:** one local origin per reconstruction, near the building (for example the south-west corner of the main building at ground-floor level), shared by all three models. The transform to the national grid is recorded once in `research/derived/model_georeference.json` ([conventions](../conventions.md#frames-and-units)). In IFC it becomes one `IfcMapConversion` with `IfcProjectedCRS` (Switzerland: EPSG:2056 LV95, heights EPSG:5728 LN02) and is **identical in all three models**. Never write an unverified georeference; a local study frame without a map conversion is acceptable.
- **Storey elevation:** the finished floor level (FFL) of the storey's main floor area, as in the viewer's level list. Slabs are modelled with their total thickness up to the FFL, because floor build-ups are not modelled as layers. Where a separate floor covering is modelled, the slab top is lowered by the covering thickness.
- **Storey names:** short, sortable and from one scheme per building, as in `building.json` (`EG`, `1. OG`, `DG`; or the owner's scheme such as `E00`, `O01`, `U01`). `IfcBuildingStorey.Name` = the short code, `LongName` = the full name ("Erdgeschoss"). Every storey exists once; no empty storeys. Split levels are separate storeys or `PARTIAL` storeys, recorded in a decision.
- **Contained vs referenced:** an element is contained in one storey (where it stands). A stair or a multi-storey hall is contained in its lowest storey and *referenced* in the others (`viewer_floor_ids` lists all of them).

## 7. Types, families and instances

The single most important habit for a light and consistent model.

| Concept | Meaning | Blender | GLB | IFC |
|---|---|---|---|---|
| Family | A kind of product with shared logic ("panel door", "Biedermeier chair") | `viewer_family_id` | node extras | custom property |
| Type | One fixed geometry, size and material configuration of a family ("panel door, oak, 1.00 × 2.10") | one prototype object in the hidden `Types` collection, its mesh is the type geometry | one glTF mesh | `IfcDoorType` etc. with a representation map |
| Instance | A placement of a type: position, rotation, storey, room, host, id | linked duplicate (`Alt+D`, `obj.copy()` keeping `.data`) | a node referencing the shared mesh | `IfcDoor` with a mapped item |

Rules:

- A different size, profile, material or handing is a different type. A different location is not.
- Walls and slabs are the exception: their type fixes thickness and material, and every occurrence has its own length or outline (its own extrusion).
- No modifiers on instances. Bake bevels, arrays and solidify on the type prototype; a modifier on a linked duplicate gives every instance its own mesh in the GLB.
- Assign materials on the mesh data of the prototype, not per object. Changing a material on one instance silently breaks the reuse.
- Mirrored handing (left/right doors) is a separate type or the door's operation type, never a negative scale.
- Origins: walls at the start of the face line, +X along the wall; doors and windows at the bottom-left corner of the opening on the wall face; furniture at the centre of its footprint on the floor, **front facing −Y** (Blender's front view); columns at the base centre.

## 8. Light geometry for three.js

The viewer loads the whole building into a browser, including phones. Starting budgets (proposal, subject to measurement on target devices):

| Item | Budget |
|---|---|
| Wall segment | 12–200 triangles (more only for openings and reveals) |
| Door or window type | ≤ 2,000 triangles |
| Chair or small furniture type | ≤ 1,500 triangles; large furniture ≤ 5,000 |
| Ornament, sculpture | named exceptions with a comparison image ([handoff](../model-handoff.md#geometry-materials-and-performance)) |
| Building GLB | aim for under 1.5 million placed triangles; report placed and unique triangles |
| Textures | 512–1024 px for repeated objects, ≤ 2048 px for large surfaces; estimated image memory under 256 MiB |
| Materials | one to three per type; consolidate equivalent materials |

Do not ship high- and low-detail copies of the same object, do not use `EXT_mesh_gpu_instancing` (it drops the per-object ids), and do not merge objects to save draw calls; the viewer batches by itself.

## 9. Checks

Before a release, run the checks of [Mistakes and checks](mistakes-and-checks.md#release-checks):

- Blender: `tools/model-checks/hygiene.py`, `coplanar.py`, `furniture_check.py`, `dollhouse_audit.py`;
- IFC: `tools/model-checks/ifc_audit.py --model-type building|site|surroundings` and `ifctester` with the [IDS file](ids/README.md) of the model type;
- look: every storey from above, the dollhouse, the federated view of all three models, and the camera-match sheets.

The [golden example](examples/golden/) passes all of them with no warnings. While it already passed schema validation, the audit and the IDS files, it still needed six geometry corrections, found only by listing element bounds and rendering it: stair flights mirrored into the wall, a missing top riser, a railing through the slab, chairs facing away from the table, a stair 20 cm from its wall, and a path running through the garden wall. Look.

## 10. Where the repository stands

The three published IFC models (Bundeshaus v027, Landgut Lohn v008, Villa Maraini v011) were audited against this guide on 2026-10-09. They pass the basics (storeys, containment, names, evidence on every product) but miss most of the target:

| Finding | Bundeshaus | Landgut Lohn | Villa Maraini |
|---|---:|---:|---:|
| Products | 4,824 | 922 | 2,805 |
| `IfcBuildingElementProxy` share | 64 % | 42 % | 41 % |
| Doors and windows in an opening | 5 of 419 | 0 of 129 | 88 of 174 |
| Stairs as flights + landings | no (16 stairs) | no (7 stairs) | no: 184 `IfcStair` = one per tread |
| Rooms (`IfcSpace`) | 0 | 0 | 0 |
| Materials, `IsExternal` | none | none | none |
| Mean placements per type | 2.7 | 1.3 | 1.4 |
| Elements crossing a storey band | not measured | 38 | 402 |

Several causes are in the shared pipeline, not in the models: the registry accepts only ten IFC classes (no roof, covering, beam, member, stair flight, space), types are keyed on geometry, and materials and standard property sets are not written. The full analysis and the recommended pipeline changes are in [research/repo-gap-analysis.md](research/repo-gap-analysis.md).
