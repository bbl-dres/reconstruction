# Gap analysis: the repository's IFC models against the guide

[← Research](README.md) · [BIM modelling guide](../README.md)

On 2026-10-09 the three published IFC models were audited with [`tools/model-checks/ifc_audit.py`](../../../tools/model-checks/ifc_audit.py) and the [building IDS](../ids/building.ids), next to reference samples and the [golden example](../examples/golden/). IfcOpenShell 0.8.5 and 0.9.0, ifctester 0.9.0. The storey-band check (`--geometry`) was not run on the Bundeshaus file (312 MB unzipped; it exceeded the time limit).

## Results

| | Bundeshaus v027 | Landgut Lohn v008 | Villa Maraini v011 | Duplex (Revit, IFC2X3) | Gymzaal (Revit, IFC4) | Golden example |
|---|---:|---:|---:|---:|---:|---:|
| Products | 4,824 | 922 | 2,805 | 218 | 492 | 32 |
| Storeys / rooms (`IfcSpace`) | 6 / 0 | 3 / 0 | 10 / 0 | 4 / 21 | 3 / 48 | 2 / 3 |
| `IfcBuildingElementProxy` share | 64 % | 42 % | 41 % | 0 % | 3 % | 0 % |
| Products contained outside a storey | 3,030 (in the building) | 0 | 0 | 0 | 0 | 0 |
| Untyped products | 63 % | 0 % | 0 % | 50 % | 0 % | 0 % |
| Types / mean placements per type / single-use types | 670 / 2.7 / 527 | 698 / 1.3 / 617 | 2,018 / 1.4 / 1,964 | 37 / 2.7 / 11 | 221 / 2.2 / 160 | 12 / 2.3 / 6 |
| Body representation | mapped meshes | mapped meshes | mapped meshes | extrusions + mapped | mapped + extrusions + meshes | extrusions + mapped |
| Doors and windows filling an opening | 5 of 419 | 0 of 129 | 88 of 174 | 38 of 38 | 0 of 90 | 6 of 6 |
| Stairs decomposed into flights | 0 of 16 | 0 of 7 | 0 of 184 | 2 of 2 | – | 1 of 1 |
| Products without a material | 100 % | 100 % | 100 % | 55 % | 8 % | 0 % |
| Walls with `IsExternal` | 0 of 25 | 0 of 93 | 0 of 412 | 57 of 57 | 78 of 78 | 9 of 9 |
| Products crossing a storey band | not measured | 38 | 402 | 2 | 9 | 0 |
| `IfcMapConversion` | no | no | no | (IFC2X3) | yes | yes (example values) |

Building IDS ([building.ids](../ids/building.ids)): the three repository models pass the storey, site and (except Bundeshaus) containment and evidence specifications. They fail the opening, `IsExternal`, material, slab type, rooms and evidence-class specifications. The golden example passes all of them.

## What the numbers mean

**Common to all three (pipeline causes)**

1. **Ten IFC classes only.** `tools/model-pipeline/bim_registry.py` accepts `IfcFurniture`, `IfcWindow`, `IfcDoor`, `IfcColumn`, `IfcWall`, `IfcStair`, `IfcSlab`, `IfcRamp`, `IfcRailing` and `IfcBuildingElementProxy`. Roofs, ceilings, floor and wall finishes, beams, chimneys, shading devices, luminaires and terrain therefore become proxies. In Landgut Lohn the 385 proxies are wall finishes (132), floor finishes (68), ceilings (62), shading devices (54), light fixtures (32), equipment (11), roofs (10), chimneys (6) and others.
2. **Types are keyed on geometry.** Every distinct mesh gets its own type (`type:lohn-dormer-gabled-c3c4ca5b--exterior-wall`), so walls of the same construction but different length are different types (Landgut Lohn: 91 wall types for 93 walls). The guide's rule is the opposite for walls and slabs: type = thickness + material, geometry on the occurrence. This needs occurrence-owned geometry in the exporter.
3. **No materials and no standard property sets.** The exporter writes colours (surface styles) but no `IfcMaterial` and no `Pset_*Common`; `IsExternal` is available from `viewer_environment` but not written.
4. **No rooms.** `IfcSpace` is not produced; the guide makes rooms a core CAFM requirement.
5. **Evidence vocabulary differs per building.** `ClassificationBasis` is `authored`/`inferred` in the IFC; the geometry evidence class exists only in building-specific properties (`lohn_basis`: measured / inferred / placeholder) or not at all. Bundeshaus marks every product `medium`, Villa Maraini every product `inferred`/`low`.

**Per building (modelling causes)**

- **Bundeshaus:** 3,030 unregistered components are exported as "Unclassified geometry" proxies contained in the building, not in a storey (this was a deliberate, documented fallback). Only 25 walls are registered products; 5 of 419 doors and windows (three windows, two double doors) have an opening relation.
- **Landgut Lohn:** the walk-collision helpers ("Walk collision ground", "Walk collision garden walls and hedges") are in the building IFC as proxies; site terrain and paving are in the building model; 38 products cross a storey band (roofs as proxies, a door from 4.00 to 6.00 m, a ground-floor wall starting at −2.10 m).
- **Villa Maraini:** every stair **tread** is its own `IfcStair` (184 treads of 24 flights) and every **baluster** its own `IfcRailing` (806); 1,964 of 2,018 types are used once; 402 products cross a storey band, mostly façade ornament (rustication, quoins, pediments) placed on the storey of the façade.

**Reference samples.** Professional exports are not perfect either: the Gymzaal's walls run 20 cm into the storey above and its doors fill no openings; the Duplex has no wall types. The audit is a measuring tool, not a verdict; read the numbers against the guide's intent.

## Recommended pipeline changes

In order of benefit for the guide's target. None is implemented; each affects every building and needs the tests of the [viewer guide](../../viewer-guide.md#verify-changes).

| # | Change | Where | Effect |
|---|---|---|---|
| 1 | Accept the full class list of the [element rules](../element-rules.md#category-to-ifc-class) (`IfcRoof`, `IfcCovering`, `IfcBeam`, `IfcMember`, `IfcPlate`, `IfcStairFlight`, `IfcRampFlight`, `IfcChimney`, `IfcShadingDevice`, `IfcCurtainWall`, `IfcLightFixture`, `IfcGeographicElement`) with predefined types | `bim_registry.py`, `bim-registry.schema.json`, `export_ifc.py` | Proxy share from about 40 % to under 10 % |
| 2 | Assemblies for stairs (flights, landings, railings) and railings (balusters as parts) | registry `parentId`, exporter `IfcRelAggregates` | Correct counts; IDS RB-06 |
| 3 | Write `IfcMaterial` per type and `Pset_*Common.IsExternal` from `viewer_environment` | `export_ifc.py` | IDS RB-07–10 |
| 4 | One evidence vocabulary: `viewer_evidence_basis` / `_source` / `_confidence` → `ReconstructionEvidence.EvidenceBasis` | handoff, `hygiene.py --require`, exporter | IDS RB-13; comparable buildings |
| 5 | Wall and slab types by construction; geometry on the occurrence (optionally as `IfcExtrudedAreaSolid` for straight walls, slabs, columns and beams, so CDEs compute quantities) | registry types, exporter | Meaningful types; quantities |
| 6 | `IfcSpace` from room outlines with `Qto_SpaceBaseQuantities.NetFloorArea` | room data in the registry, exporter | CAFM; IDS RB-12 |
| 7 | Opening relations for every door and window from `viewer_host_id` | registry openings | IDS RB-05 |
| 8 | Exclude helper geometry (collision, cameras) from the IFC; export site and surroundings as their own IFC files with the shared site and map conversion | profiles, exporter | [Federated models](../federated-models.md) |
| 9 | Run `ifc_audit.py` and the IDS files in the release checks and record them in the release report | handbook checklist | Visible progress per release |
