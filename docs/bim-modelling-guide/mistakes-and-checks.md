# Mistakes and checks

[← BIM modelling guide](README.md) · [Element rules](element-rules.md) · [Federated models](federated-models.md) · [Pitfalls](../pitfalls.md)

The mistakes agents make most often when modelling buildings, why each matters, how to fix it and which check finds it. Building-specific incidents with their history are in [pitfalls](../pitfalls.md); this page is the general list. Add to it when a review finds something new.

## Mistakes

### Structure and topology

| Mistake | Why it matters | Fix | Found by |
|---|---|---|---|
| Walls not connected to floors or ceilings (floating, or stopping short) | Gaps show in the viewer and section; rooms are not closed; CDE quantities wrong | Base at the storey FFL, top at the slab underside ([walls](element-rules.md#walls)) | look at sections; `ifcclash` wall vs slab with `allow_touching`; rooms check |
| Walls running through two storeys | Floor filters and Dollhouse fail; IFC containment wrong | Split per storey | `ifc_audit.py --geometry` (storey bands); `v50_rooms_and_bands.py` |
| One mesh for a whole facade, floor outline or room | No per-wall identity, no openings as products, huge n-gons | One object per straight segment | `hygiene.py` triangle stats; look; IFC wall count vs plan |
| Free-form or sculpted walls | Not a wall in any CDE; heavy; z-fighting | Straight mean-plane segments ([historic walls](element-rules.md#walls)) | look; triangles per wall |
| Overlapping wall boxes at corners | Z-fighting, double volume | Butt joins | `coplanar.py`; `ifcclash` wall vs wall |
| Columns modelled as short walls, foundations as small slabs | Wrong class, wrong quantities | `IfcColumn`, `IfcFooting` | `ifc_audit.py` byClass; look |
| Columns, beams, landings, railings, chimneys skipped | Model incomplete; viewer shows floating slabs and stairs | Model every element the evidence shows ([golden rule 9](README.md#4-the-golden-rules)) | coverage matrix; look at every storey |
| Slab missing, or one slab per room | Walls stand on nothing; floor filters break | One slab per storey over the footprint | `ifc_audit.py`; look from below |
| Finishes or ceilings merged into a thicker slab or wall | Wrong storey heights and room heights | `IfcCovering`, offset 3–6 mm | look at sections |
| Element in two models (site wall also in the building) | Duplicates in the CDE | One owner per element ([boundary rules](federated-models.md#the-three-models)) | federated `ifcclash` |

### Openings, stairs and assemblies

| Mistake | Why it matters | Fix | Found by |
|---|---|---|---|
| Door or window as a box inside a solid wall | No opening; the wall's area and the door schedule are wrong | Opening first, then the typed filling with `viewer_host_id` | `ifc_audit.py` openings; IDS RB-05 |
| A visual hole without an opening record | IFC has no wall → opening → door relation | Record the host | IDS RB-05 |
| Stair as one mesh | No flights, landings or railings; no riser data | `IfcStair` assembly ([stairs](element-rules.md#stairs-and-ramps)) | `ifc_audit.py` stairs; IDS RB-06 |
| One stair object per tread, one railing per baluster | Thousands of "stairs"; counts and selection meaningless | One stair per stair, one railing per railing, balusters as typed parts | `ifc_audit.py` byClass (stair count vs plan) |
| Flights stopping short of the landing or slab; landing at the next flight's height | Walk mode falls; section wrong | Store landing elevations; check every junction | `s10_stair_risers.py`; look in section |
| Stair standing away from its wall | Visible gap; collision wrong | Wall face = stair edge | look; distance check |
| Railing not following the pitch, or through the slab | Stair rises through the rail | Rail along the nosing line, inside the void | look |

### Types, identity and classes

| Mistake | Why it matters | Fix | Found by |
|---|---|---|---|
| Every door, window or chair a unique mesh (Shift+D copies) | Heavy GLB and IFC; edits not consistent | Linked duplicates of a type prototype | `hygiene.py` (linked meshes); GLB nodes vs meshes; `ifc_audit.py` occurrences per type |
| Modifiers on linked duplicates | Each instance becomes a unique mesh on export | Bake on the prototype | GLB meshes vs nodes |
| Types keyed on geometry (every wall its own type) | Types mean nothing; no schedules | Wall/slab types = thickness + material; product types = design + size | `ifc_audit.py` mean occurrences per type |
| `IfcBuildingElementProxy` for roofs, finishes, beams | CDE cannot filter, count or quantify | Map the category to its class ([table](element-rules.md#category-to-ifc-class)) | `ifc_audit.py` proxy share |
| Mirrored (negative scale) instances | Inverted normals; IFC cannot place it | Separate handed type | `hygiene.py` (inverted), Blender determinant check |
| `.001` names, re-created objects with new ids | Ids change between releases; CDE sees deletions | Delete old object and mesh first; keep ids | `hygiene.py` duplicate ids; GlobalId comparison between releases |
| Random GlobalIds for relationships and property sets | CDE revision compare shows changes everywhere | Derive every GlobalId from stable ids ([golden example](examples/golden/build_golden_example.py)) | rebuild and compare GlobalIds |
| Helper geometry (collision, cameras, planes) in the IFC | Phantom "terrain" and "walls" in the CDE | Exclude from the IFC | `ifc_audit.py` names and classes; look in an IFC viewer |

### Information

| Mistake | Why it matters | Fix | Found by |
|---|---|---|---|
| Invented properties (load-bearing, fire rating, species, dates) | False certainty in a CDE | Leave unknowns out | review; IDS lists only the allowed set |
| Evidence class missing or in a building-specific property | Cannot compare buildings | `viewer_evidence_basis` measured / inferred / unknown | IDS RB-13 |
| Rooms missing, from bounding boxes, or with hand-typed areas | CAFM unusable | `IfcSpace` from inner wall faces, computed area | IDS RB-12; area vs plan labels |
| Storey names that differ between models or releases | Federation and filters fail | One scheme, from `building.json` | IDS RB-01; compare models |
| Elements contained in the building or the site instead of a storey | Missing from storey filters | Contain building elements in their storey | `ifc_audit.py` containment rule |

### Geometry hygiene

| Mistake | Fix | Found by |
|---|---|---|
| Object scale ≠ 1, unapplied rotations in type meshes | Apply scale; keep rotation in the placement | `hygiene.py` |
| Inverted normals, open edges on solids, loose vertices, degenerate faces | Recalculate normals, merge by distance (0.1 mm), rebuild as closed solids | `hygiene.py` |
| N-gons with holes, non-planar faces | Quads around openings; triangulate deliberately | Blender 3D-Print Toolbox; [Blender example](examples/blender/build_walls_from_plan.py) asserts |
| Coplanar faces (carpets, panels, overlapping walls) | Offsets 3–6 mm; rings with holes | `coplanar.py` |
| Large map coordinates in vertices | Local origin + georeference record | review `model_georeference.json`; bounds near the origin |
| Detail far below LOD 300 (screws, 2 mm mouldings) as geometry | Texture or normal map | triangle budget in `hygiene.py` report |

## Release checks

Run in this order; read every report. Copy results to `releases/vNNN/validation/`.

**1. Blender (each master)** — see [model checks](../../tools/model-checks/README.md). `--require` names the evidence property (today building-specific such as `lohn_basis`; `viewer_evidence_basis` once the shared name is adopted):

```bash
blender --background <model.blend> --python tools/model-checks/hygiene.py -- --out build/review/hygiene.json --require <evidence property>
blender --background <model.blend> --python tools/model-checks/coplanar.py -- --out build/review/coplanar.json
blender --background <model.blend> --python tools/model-checks/furniture_check.py -- --out build/review/furniture.json
blender --background <model.blend> --python tools/model-checks/dollhouse_audit.py -- --out build/review/dollhouse.json
```

**2. GLB** — Khronos glTF Validator on the prepared, uncompressed GLB; nodes vs meshes (instances share meshes); `viewer_*` extras on every node; no `EXT_mesh_gpu_instancing` ([handoff](../model-handoff.md#source-model-conversion-and-version-imports)).

**3. IFC** — in the BIM Python environment (`pip install -r tools/model-pipeline/requirements-bim.txt`):

```bash
python -m ifcopenshell.validate --rules building.ifc
python tools/model-checks/ifc_audit.py building.ifc --out build/review/ifc-audit-building.json --geometry --model-type building
python -m ifctester docs/bim-modelling-guide/ids/building.ids building.ifc -r Console
# the same for site.ifc and surroundings.ifc with their model type and IDS
```

`ifc_audit.py` reports storeys and containment, proxy share, types and reuse, representation kinds, openings, stairs, materials, property sets, names, GlobalIds and (with `--geometry`) elements crossing storey bands. `ifctester` checks the [IDS files](ids/README.md). Specifications marked `[target]` are the agreed target that the current exporter does not yet write; report them, do not hide them.

**4. Clashes** — `ifcclash` (pip) with a clash set per pair: walls vs slabs, walls vs walls, columns vs slabs, furniture vs walls, and across the three federated models.

**5. Look** — the step no check replaces:

- every storey from above (plan view) against the calibrated plan;
- the Dollhouse view of every storey and all storeys;
- sections through stairs and level changes;
- the federated view of building, site and surroundings;
- camera-match sheets of the affected panorama and photograph poses;
- the IFC in a second viewer (BIMcollab Zoom, a That Open or xeokit web viewer), with colour by class.

The [golden example](examples/golden/) passed schema validation, the audit and the IDS files while it still had six geometry errors; they were found by listing element bounds and by rendering it ([guide §9](README.md#9-checks)).
