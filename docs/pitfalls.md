# Pitfalls

[← Repository](../README.md) · [Handbook](reconstruction-handbook.md) · [Conventions](conventions.md)

Mistakes that cost a release in the Bundeshaus and Landgut Lohn reconstructions, with the check that now catches each one. Read this before modelling; add to it when a review finds something new.

## Evidence and frames

| Pitfall | What happened | Prevention |
|---|---|---|
| Printed plan scale trusted | Plans delivered as A4 instead of the drawn sheet size | Calibrate every sheet from dimension strings and the scale bar; report residuals (`s01_plan_calibration.py`) |
| Schematic north arrow used | Plan arrow ~31°, cadastral fit 34.85° (LL-D002) | Rotate from a footprint fit against the cadastral survey; record the decision |
| Hairline spikes from plan tracing | Wall and room outlines kept slivers from vector joints; they showed as rods and teeth in Dollhouse | Despike outlines (morphological opening, 4 cm); look at plan overlays per floor (`v40_plan_overlay.py`) |
| A plan line read as a wall | The stove front in the Churchill-Zimmer was built as a wall | Drop walls inside stove and fixture outlines; check against the panoramas |
| Dashed lines ignored | Walls over hall openings drawn dashed were missing; portières and sconces hung in front of nothing | Model heads over openings (`hallOpeningHeads`); run the Dollhouse audit |
| Camera height assumed | Panorama measurements at 7 nodes use the 1.55 m default | Mark those pieces *inferred*; solve the height from a known floor feature where possible |
| Provisional room names presented as final | Tour names differ from plan names | Map nodes to rooms from geometry, with confidence |

## Geometry

| Pitfall | What happened | Prevention |
|---|---|---|
| Coplanar faces | Carpets on floors, panel strips on walls, rings and fields of carpets z-fight and render as black bands | Offset applied pieces (3–6 mm); build borders as rings with holes; run `tools/model-checks/coplanar.py` and watch the total area |
| Furniture facing the wall | Bundeshaus chairs backwards; Landgut chairs at tables | `tools/model-checks/furniture_check.py` (facing, wall penetration, outside room); exempt wall chairs explicitly |
| Pieces floating in Dollhouse | Trims, mirrors, pictures and closures on exterior walls stayed when the facade was removed; ceiling medallions floated | Split trims by the exterior-wall zone; tag wall-hung pieces on exterior walls `enclosure`, ceiling pieces `overhead`; run `tools/model-checks/dollhouse_audit.py` on every floor before each release |
| Floor tabs in window reveals | Floor polygons reached into the reveals and stayed in Dollhouse | Split the reveal part of the floor off and tag it `enclosure` |
| No walk collision on the grounds | Viewer Walk mode builds collision from building meshes only; visitors fell through the terrain | Add hidden `viewer_role: collision` ground and obstacle meshes (decimated) in the building export |
| Walls crossing floor bands | Bundeshaus walls ran through two levels | Split by level; check rooms and bands (`v50_rooms_and_bands.py`) |
| Windows inferred across open courts or roofs | Bundeshaus string courses and windows crossed an open courtyard | Only model openings seen in evidence |
| Stairs not reaching landings | Bundeshaus flights stopped short | Count risers from plans and panoramas; check riser heights (`s10_stair_risers.py`) |
| Doors without openings | Leaves placed in solid walls | Openings first, then leaves; hinge side from the evidence (`doorHands`) |
| Duplicated trim | Overlapping cornice and cupola-base boxes | Coplanar check; one product per physical piece |
| Too many unique meshes | Every chair a separate mesh | One parameter set = one type; snap sizes (5 cm) so equal pieces share a type |
| `.001` object names | Re-created objects collided with the ones they replaced | Remove the old object and mesh before creating the new one; the hygiene check flags duplicate `viewer_id`s |
| Collision GLB too large | Full-resolution terrain copied into the building export (18 MB) | Decimate collision meshes; watch the building GLB size in the release report |

## Process

| Pitfall | What happened | Prevention |
|---|---|---|
| A frozen release edited | Tempting for small fixes | Fix in `build/`, freeze the next release |
| A release frozen before the review | Landgut v006 and v007 were re-frozen after the review found a misplaced table and floor tabs | Run all checks and look at the camera-match sheets and the Dollhouse floors before freezing |
| Parallel stage copies | Bundeshaus: 43 stages and 33 release folders; it was hard to tell which script was current | One living `build/` folder; history in git and `HISTORY.md` |
| Old public versions left in the catalog | Several versions published at once | `import_versions.py --keep-latest`; `tests/catalog-assets.test.mjs` |
| Private evidence near the public tree | Plans, tour tiles or traces could end up in `public/` | Keep them in `work/`; `git status` must show nothing from `work/` |
| Screenshots in `references/` | Mixed model output with evidence | `references.py --validate` fails on unregistered files; screenshots go to `build/review/` |
| Workbench renders white or black in background mode | No display | Use Cycles with few samples for review renders |
| A long Blender call timed out over MCP | Large operations in one call | Small idempotent script steps; save after each; heavy work in background Blender |
| Killing processes by pattern | `pkill -f` stopped unrelated processes | Kill by PID |
| A camera moved between comparisons | Scores no longer comparable | Fix comparison cameras once solved; record them with the release |
| A metric read as quality | Edge precision drops when a furnished room meets a patterned photograph | Read the sheets, not only the score; use the edge F-score above the floor band for interiors |
