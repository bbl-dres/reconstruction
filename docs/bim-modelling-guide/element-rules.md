# Element rules

[← BIM modelling guide](README.md) · [Federated models](federated-models.md) · [Mistakes and checks](mistakes-and-checks.md)

What each element is, what LOD 200 and LOD 300 mean for it, how to build it in Blender, how it appears in IFC, and the mistakes to avoid. Read the [guide](README.md) first: its golden rules apply to every element here.

Conventions on this page:

- *Storey band*: from a storey's finished floor level (FFL) to the FFL of the storey above.
- *Face line*: the line of a wall's outer (or reference) face in the calibrated plan.
- Blender properties are the `viewer_*` object properties of the [model handoff](../model-handoff.md#bim-categories-and-object-properties); the [guide](README.md#3-level-of-information-loi-the-minimum-always-complete) lists the required ones.

## Category to IFC class

Choose the category by what the object **is**, not by how it looks or how the viewer hides it. "Pipeline" says whether `tools/model-pipeline/bim_registry.py` accepts the class today; classes marked *extension* need the pipeline change described in the [gap analysis](research/repo-gap-analysis.md#recommended-pipeline-changes). Until then the registry writes them as `IfcBuildingElementProxy` with the category kept, which is acceptable only for those categories.

| `viewer_category` | IFC class | `PredefinedType` (type or occurrence) | Model | Pipeline |
|---|---|---|---|---|
| `exterior-wall`, `interior-wall`, `wall` | `IfcWall` | `SOLIDWALL`, `PARTITIONING` (light partitions), `PARAPET` | building | yes |
| `retaining-wall`, `boundary-wall` | `IfcWall` | `SOLIDWALL` (IFC 4.3: `RETAININGWALL`) | site | yes |
| `slab`, `floor` | `IfcSlab` | `FLOOR`, `BASESLAB` (ground-bearing) | building | yes |
| `landing` | `IfcSlab` (part of the stair) | `LANDING` | building | yes (as part: *extension*) |
| `roof` | `IfcRoof` aggregating roof slabs / members | `FLAT_ROOF`, `GABLE_ROOF`, `HIP_ROOF`, `MANSARD_ROOF`… | building | *extension* |
| roof plane | `IfcSlab` | `ROOF` | building | yes |
| `roof-covering`, `floor-finish`, `ceiling`, `wall-finish`, `skirting`, `cornice` | `IfcCovering` | `ROOFING`, `FLOORING`, `CEILING`, `CLADDING`, `SKIRTINGBOARD`, `MOLDING` | building | *extension* |
| `column`, pilaster | `IfcColumn` | `COLUMN`, `PILASTER` | building | yes |
| `beam`, exposed rafter, lintel | `IfcBeam` | `BEAM`, `JOIST`, `LINTEL` | building | *extension* |
| truss member, post, mullion | `IfcMember` | `POST`, `MULLION`, `RAFTER`, `PURLIN`, `STRUT` | building | *extension* |
| `stair` | `IfcStair` (assembly, no own body) | `STRAIGHT_RUN_STAIR`, `TWO_STRAIGHT_RUN_STAIR`, `HALF_TURN_STAIR`, `SPIRAL_STAIR`… | building, site | yes |
| flight | `IfcStairFlight` (part of the stair) | `STRAIGHT`, `WINDER`, `SPIRAL`, `CURVED` | building, site | *extension* |
| `ramp` | `IfcRamp` + `IfcRampFlight` | `STRAIGHT_RUN_RAMP`… | building, site | yes (flights: *extension*) |
| `railing`, `handrail`, `balustrade`, `guardrail` | `IfcRailing` | `HANDRAIL`, `GUARDRAIL`, `BALUSTRADE` | building, site | yes |
| `door`, `gate` | `IfcDoor` in an `IfcOpeningElement` (gates: free-standing) | `DOOR`, `GATE`, `TRAPDOOR` | building, site | yes |
| `window`, `skylight` | `IfcWindow` in an `IfcOpeningElement` | `WINDOW`, `SKYLIGHT` | building | yes |
| `opening` (without door or window) | `IfcOpeningElement` | `OPENING`, `RECESS` (niche) | building | yes (as relation) |
| `curtain-wall`, glazed gallery | `IfcCurtainWall` aggregating `IfcMember` + `IfcPlate` | — | building | *extension* |
| `chimney`, stove flue | `IfcChimney` | — | building | *extension* |
| `shading-device`, shutter, awning | `IfcShadingDevice` | `SHUTTER`, `AWNING`, `JALOUSIE` | building | *extension* |
| `canopy`, `balcony` | `IfcSlab` (balcony floor) + `IfcRailing`; canopy `IfcRoof` or `IfcSlab` | — | building | yes / *extension* |
| `furniture`, `chair`, `table`, `desk`, `bench`, `cabinet`, `shelving`, `bed` | `IfcFurniture` | `CHAIR`, `TABLE`, `DESK`, `SOFA`, `BED`, `SHELF`, `FILECABINET` | building | yes |
| built-in fitting, stove, fireplace | `IfcFurniture` (built-in) or `IfcBuildingElementProxy` named `stove` | `USERDEFINED` + `ObjectType` | building | yes |
| `light-fixture` (decorative, visible) | `IfcLightFixture` without system data, or `IfcFurniture` | `DIRECTIONSOURCE`, `POINTSOURCE` | building | *extension* |
| `curtain` (textile) | `IfcFurniture` | `USERDEFINED` + `ObjectType` "CURTAIN" | building | yes |
| `sculpture`, `ornament`, `decorative-panel` | `IfcBuildingElementProxy` (IFC 4 has no better class) | `USERDEFINED` + `ObjectType` | building | yes |
| room | `IfcSpace` | `SPACE`, `PARKING`, `EXTERNAL` | building | *extension* |
| `terrain` | `IfcGeographicElement` | `TERRAIN` | site, surroundings | *extension* |
| `plant`, tree, hedge | `IfcGeographicElement` | `USERDEFINED` + `ObjectType` "TREE", "HEDGE" | site, surroundings | *extension* |
| `paving`, path | `IfcSlab` (IFC 4.3: `IfcPavement`) | `USERDEFINED` + `ObjectType` "PAVING" | site | yes |
| neighbouring building | `IfcBuilding` with an `IfcBuildingElementProxy` massing | `USERDEFINED` + `ObjectType` "MASSING" | surroundings | *extension* |
| helper geometry (collision, cameras, reference planes) | **not exported to IFC** | — | — | — |

`USERDEFINED` always needs an `ObjectType` (on the occurrence) or `ElementType` (on the type). When a type has a predefined type, leave the occurrence's empty; it inherits.

---

## Walls

**What:** a vertical planar element of constant thickness between two ends, standing on one storey. Exterior and interior walls, partitions, parapets, garden walls (site).

| | LOD 200 | LOD 300 |
|---|---|---|
| Geometry | Straight segments, approximate overall thickness as one solid, approximate height | Measured mean thickness, face line within ±5 cm, base and top exact, all openings > 15 cm |
| Joins | Segments touch | Clean butt joins, no gaps, no overlaps |
| Information | Category, type (thickness + material), storey, `IsExternal` | as 200 |

**Build it**

1. One object per straight wall run between corners, T-junctions, changes of thickness and storey levels.
2. Build it as an extruded rectangle from the face line (`wall_mesh` in the [Blender example](examples/blender/build_walls_from_plan.py)): origin at the start of the face line, local +X along the wall, local +Y into the wall, scale 1.
3. Base at the storey's finished floor level; top at the **underside of the slab above** (or of the roof). Never run a wall through two storeys.
4. At an L-corner one wall runs through to the outer corner and the other butts against its inner face. At a T-junction the joining wall stops at the face of the through wall. No mitres needed; no overlaps allowed.
5. Openings are holes in the wall mesh made of quads around the hole (reveals included). No boolean modifier left on the object, no n-gon with a hole.
6. Wall type = thickness + material (`wall-ext-40` "Exterior wall 40 cm, sandstone"). The occurrence owns its length and holes.
7. Finishes are not wall layers. Plaster colour is the wall's material colour. A separately visible finish (panelling, tiles) is an `IfcCovering` offset 3–6 mm from the wall face.

**Historic and irregular walls**

- Fit a straight mean plane per wall run on the evidence (plan, LiDAR, point cloud). Split the run into a further straight segment where the real face deviates from the plane by more than 5 cm (LOD 300) or 15 cm (LOD 200).
- Use the mean thickness; the solid must still enclose the real wall over most of its length (LOD envelope rule).
- Battered or leaning walls: a straight segment with an inclined face, still one solid per segment.
- Curved walls: straight facets with a chord deviation under 2 cm (LOD 300) or 5 cm (LOD 200).
- Truly sculptural parts (rusticated quoins, carved surrounds) are separate decoration objects attached to the wall, not a remodelled wall.

**Mistakes:** one mesh for a whole facade or floor outline; walls floating above the slab or ending below the ceiling; walls running through two storeys; overlapping boxes at corners (z-fighting, double volume); free-form wall blobs; zero-thickness walls (surfaces only); a column modelled as a short wall; finishes modelled as extra wall layers.

## Slabs and floors

**What:** the horizontal structure of a storey: one floor slab per storey (and per building part), ground-bearing base slabs, balcony slabs, landings (as stair parts).

| | LOD 200 | LOD 300 |
|---|---|---|
| Geometry | Generic slab with approximate thickness over the footprint | Measured outline and thickness, voids for stairs and shafts, steps in level |
| Information | `PredefinedType`, storey, material | as 200 |

**Build it**

1. One slab per storey, outline = outer face of the exterior walls; top = the storey's finished floor level; thickness = total floor thickness (structure and build-up together).
2. Walls of the storey below stop at the slab's underside; walls of the storey above stand on its top.
3. Voids (stairwells, shafts, light wells) are holes in the slab outline (`inner` polygons), positioned so that the stair arrives at the slab edge.
4. Level changes within a storey are separate slabs, with the step face as part of the higher slab.
5. Floor finishes stay in the slab unless a separate covering is needed (visible pattern, different material per room); then the covering is an `IfcCovering` FLOORING and the slab top is lowered by its thickness.

**Mistakes:** no slab at all (walls standing on nothing); a slab per room instead of per storey; slabs inside the walls' volume; finishes or ceilings merged into a thicker slab; a stairwell without a void, or a void that does not match the stair.

## Roofs

**What:** the roof as an assembly (`IfcRoof`) of roof planes (`IfcSlab` ROOF), with dormers, chimneys and visible rafters as their own elements.

| | LOD 200 | LOD 300 |
|---|---|---|
| Geometry | Roof planes with approximate pitch and thickness | Planes with measured pitch, eaves, ridge, hips, overhangs; dormers and roof openings |
| Information | Roof type, material of the covering | as 200 |

**Build it**

1. One roof plane per plane (not one closed roof volume), thickness = total roof thickness, fitted to LiDAR (eaves and ridge within the LOD tolerance).
2. The roof sits on the top of the walls of the top storey; gable walls run up to the roof's underside.
3. Dormers: their own walls, roof planes and windows; the main roof plane gets an opening.
4. Chimneys: `IfcChimney` per chimney, from the roof (or from the stove below) to the cap.
5. Roof covering (tiles, copper) is the plane's material; a separate `IfcCovering` ROOFING only where needed.

**Mistakes:** the roof as a proxy; a closed roof "blob" merged with gable walls; walls poking through the roof; a roof floating above the wall tops.

## Columns and beams

**What:** visible vertical (columns, pilasters, piers) and horizontal (beams, lintels, exposed rafters) members, as architectural elements. No structural detailing.

| | LOD 200 | LOD 300 |
|---|---|---|
| Geometry | Approximate section and position | Measured section (rectangular, round, simple profile), position, base and top; base and capital as simple solids |
| Information | Type (section + material), storey | as 200 |

**Build it**

1. One object per column per storey: from the slab top to the underside of the beam or slab above. A colonnade is many instances of one type.
2. Base and capital belong to the column (one assembly) or are separate decoration objects; not part of the wall.
3. Engaged columns and pilasters are `IfcColumn` PILASTER standing in front of the wall face, not bumps in the wall mesh.
4. Beams span between supports and stop at their faces; they are not part of the slab mesh.
5. Exposed historic timber beams are modelled individually (simple solids) only where visible.

**Mistakes:** columns skipped; columns modelled as short walls; columns hanging in the air or running through the slab; beams merged into the slab; every column a unique mesh.

## Stairs and ramps

**What:** a stair is an assembly: one `IfcStair` (no own body) aggregating its flights (`IfcStairFlight`), landings (`IfcSlab` LANDING) and railings (`IfcRailing`).

| | LOD 200 | LOD 300 |
|---|---|---|
| Geometry | Correct number and arrangement of flights and landings; flights as sloping solids | Riser count, riser height, going, width, landings, nosing line, stringer where visible, railing envelope |
| Information | Stair type, storeys served | as 200; riser count and height on the flight |

**Build it**

1. Count risers from the plan or the tour; riser height = storey height / riser count. Check it (repo script `s10_stair_risers.py`).
2. One flight per straight run between landings. A flight with *n* risers has *n* treads when it arrives at a landing or slab edge; the landing or slab edge is the next step.
3. Landings: their own slabs at their own stored elevation; the arriving flight's top tread meets the landing edge, the departing flight starts at its edge.
4. The top flight arrives exactly at the edge of the void in the slab above. Check every flight-to-landing and flight-to-slab junction on the built geometry.
5. The stair stands against its wall without a gap (the wall's face is the stair's edge).
6. Railings follow the pitch line: handrail 0.90 m above the nosings (or as evidenced), posts on the treads, inside the void.
7. Contain the stair in its lowest storey; list every storey it serves in `viewer_floor_ids`.

**Mistakes:** the whole stair as one mesh; one `IfcStair` per tread; flights stopping short of the landing or slab; a landing at the next flight's height; a stair standing away from its wall; a horizontal railing through which the stair rises; a stair copied per floor.

## Railings

**What:** handrails, guardrails and balustrades as their own elements: in a stair assembly, on a balcony, on a roof terrace.

- LOD 200: an envelope of the right height and length. LOD 300: height, posts or balusters at representative spacing, handrail profile.
- A balustrade is **one railing** with repeated balusters as a type inside it (assembly), not one railing object per baluster.
- Railings stand on their slab or tread and stop at walls; they never float.

## Openings, doors and windows

**What:** an opening is a hole through a host (wall, slab, roof). A door or window is a typed product placed in an opening.

| | LOD 200 | LOD 300 |
|---|---|---|
| Geometry | Opening of approximate size and position; generic door/window type | Measured opening, sill and head heights, door hand, frame, leaves, mullions and transoms, glazing |
| Information | Type, host, `IsExternal` | as 200; width and height of the opening |

**Build it**

1. Openings first: cut the hole into the wall mesh at the measured position (`OPENINGS` in the [Blender example](examples/blender/build_walls_from_plan.py)).
2. Then place a linked duplicate of the door or window type in it. Its origin is at the bottom-left corner of the opening on the wall face; local +X along the wall.
3. Set `viewer_host_id` to the host wall's `viewer_id`; the BIM registry builds wall → opening → door from it.
4. Door hand and swing from the evidence (`doorHands` in the build data); a mirrored door is a different type, not a negative scale.
5. Glass is a thin solid or a single surface in the window type, inside the frame; one pane per opening, no duplicates.
6. One type per evidenced design and size; equal windows on a facade are one type.
7. Do not model windows across open courts, roofs or where no evidence shows them.

**Mistakes:** a door box inside a solid wall (no opening); a hole in the wall with no door or window and no reason; windows as holes only, or as glass panes only; every window a unique mesh; doors facing the wrong way; door leaves overlapping the wall.

## Ceilings and finishes

**What:** suspended or visible ceilings, vault surfaces, floor finishes, wall panelling, skirting, cornices, as `IfcCovering`.

- LOD 200: omitted, or a ceiling plane at the right height. LOD 300: ceilings at measured heights, bulkheads, simple vault surfaces; finishes only where visible and needed (FM, appearance).
- A finish is a thin separate element offset 3–6 mm from the surface it covers, never a thicker wall or slab and never coplanar with it.
- Borders and fields of carpets and panelling are rings with holes, not stacked coplanar faces.
- Tag ceiling elements `viewer_cutaway_role: overhead` and pieces on exterior walls `enclosure`, so the Dollhouse view removes them correctly ([pitfalls](../pitfalls.md#geometry)).

## Rooms (IfcSpace)

**What:** the CAFM core: one space per room of the floor plan, with number, name and area.

| | LOD 200 | LOD 300 |
|---|---|---|
| Geometry | Closed room volume bounded by LOD 200 walls | Net boundary along the inner wall faces, from FFL to the underside of the slab or ceiling |
| Information | Number, name | Number, name, net floor area, height, usage category where known |

**Build it**

1. Derive room outlines from the inner wall faces of the built walls (not from bounding boxes, not by hand).
2. Straight segments only; columns stay inside the room outline (SIA 416 / DIN 277 practice); rooms never overlap and touch their bounding walls.
3. Height: from the finished floor level to the underside of the slab (or a ceiling). A room spanning several storeys belongs to its lowest storey.
4. Name = room number, unique per building, derived from the storey code (`EG.07` or the owner's scheme); LongName = room name from the plan ("Salon"). Keep a crosswalk where the tour's names differ from the plan's.
5. `NetFloorArea` is computed from the outline, never copied from a plan label; compare both and flag differences over 3 %.
6. Rooms are data. In Blender they live in a hidden `Spaces` collection excluded from the GLB (or in a data file); they are not drawn in the viewer.

**Mistakes:** no rooms; rooms from bounding boxes; rooms overlapping walls or each other; hand-typed areas; room numbers that change between releases.

## Furniture and decoration

**What:** furniture from the measured inventory, decorative luminaires, curtains, pictures (frames with a neutral canvas), sculpture and ornament.

- LOD 200: correct footprint, height, position and facing; simplified period shape. LOD 300 only for objects that matter and are well documented.
- One type per kind and size (snap sizes to 5 cm so that similar pieces share a type); all placements are linked duplicates.
- Type origin at the centre of the footprint on the floor, front facing −Y. Place on the floor (not floating, not sunk), against walls with a 4–6 mm gap, never inside a wall, facing the table or the room as photographed.
- A seating station is a chair and a desk: two products. A chair is one product even if it has frame, upholstery and cane as separate material components (assembly root).
- No artwork, carpets' patterns or third-party imagery reproduced in textures.

**Mistakes:** every chair a unique mesh; chairs facing away from the table; furniture in walls or floating; a whole furniture row merged into one object.

## Site elements

Belong to the [site model](federated-models.md): terrain (open under the building footprint), paths and paving, steps and ramps not attached to the building, garden walls, fences, gates, basins, planters, trees and hedges, site furniture.

- Terrain from the terrain model (swissALTI3D or the national equivalent), never sculpted; it meets the building's plinth line without a gap and without running into the building.
- Trees and hedges: typed (species and size class), sized from the canopy model; LOD 100–200 shapes.
- A path through a wall needs a gap with a gate, not a wall across the path.

## Surroundings

Belong to the [surroundings model](federated-models.md): terrain outside the parcel, neighbouring buildings, streets, context trees.

- Neighbouring buildings as massing (LOD2 roof shapes where the source has them, e.g. swissBUILDINGS3D), one context `IfcBuilding` per building with its source feature id.
- Never more detailed than the source; record the source per object and the inference rule for heights.
- No duplicate of the reconstructed building (remove its own footprint from the context data).
