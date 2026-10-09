# Pitfalls

[← Repository](../README.md) · [Handbook](reconstruction-handbook.md) · [BIM modelling guide](bim-modelling-guide/README.md) · [Conventions](conventions.md)

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
| Swiss assumptions carried into a foreign site | An international project can inherit LV95/LN02, floor naming or an unrelated printed height | Verify the site's CRS/datum and source floor labels; use a declared local frame when unresolved. Visitor pins and schematic north arrows are not survey control |
| Recent filename mistaken for a measured as-built survey | A 2024 close-out set can retain visually prepared room drawings, older initial dates and a later PDF export date | Read title/revision tables and measurement qualifications separately; cross-check executed conditions and dimensions |
| Drawing index direction copied without checking the sheet | Two Villa Maraini east/west elevation labels in an initial index were reversed | Verify printed title blocks; keep historical facade labels separate from surveyed true north |
| Same photo mistaken for a distinct view | A enlarged or cropped download has a different file hash | Use geometric image matching and visual confirmation; retain the best coverage/resolution and preserve removed source identities. A shared wall or painting alone does not prove duplication |
| Archive discovery mistaken for automated access | Publicly requestable BAR dossiers can still need eIAM/AGOV login and human delivery | Prepare dossier-specific leads; let a human retrieve them, then preserve filenames, hashes and dossier provenance |
| TIFF first frame mistaken for the entire file | One archive TIFF can contain several sheets or a very long continuous strip | Inventory every frame and image dimensions; render all frames and tile long strips with recorded crop bounds |

## Geometry

| Pitfall | What happened | Prevention |
|---|---|---|
| Coplanar faces | Carpets on floors, panel strips on walls, rings and fields of carpets z-fight and render as black bands | Offset applied pieces (3–6 mm); build borders as rings with holes; run `tools/model-checks/coplanar.py` and watch the total area |
| Furniture facing the wall | Bundeshaus chairs backwards; Landgut chairs at tables | `tools/model-checks/furniture_check.py` (facing, wall penetration, outside room); exempt wall chairs explicitly |
| Pieces floating in Dollhouse | Trims, mirrors, pictures and closures on exterior walls stayed when the facade was removed; ceiling medallions floated | Split trims by the exterior-wall zone; tag wall-hung pieces on exterior walls `enclosure`, ceiling pieces `overhead`; run `tools/model-checks/dollhouse_audit.py` on every floor before each release |
| A guard passes a generic audit but misses the stair | Villa Maraini's first rear-curb draft ended 23 mm before its supporting treads | Check actual curb-to-tread overlap and ring/rail attachment; a semantic balustrade exemption is not evidence of physical support |
| Decorative supports pass contact checks but are hidden or mounted on glazing | Villa Maraini tower brackets were buried behind cornice bands; canopy brackets initially aligned with side-light gaps | Compare actual visible silhouettes with photos and check attachment against host masonry. Test exposed faces as well as geometric contact |
| Floor tabs in window reveals | Floor polygons reached into the reveals and stayed in Dollhouse | Split the reveal part of the floor off and tag it `enclosure` |
| No walk collision on the grounds | Ground meshes may be excluded by the active building policy or missing from the loaded collision world | Inspect the current viewer: it supports a separate surroundings-terrain world for `viewer_role: terrain`. Use that for exported terrain; add bounded building collision proxies only where necessary. Verify actual Walk support instead of duplicating the full regional terrain |
| Walls crossing floor bands | Bundeshaus walls ran through two levels | Split by level; check rooms and bands (`v50_rooms_and_bands.py`) |
| Annex floors disappear in the viewer | Villa Maraini's Portineria overlaps the villa's height bands; a fallback tree ignored its authored floor IDs and assigned its meshes to villa storeys | Keep the BIM registry in candidate previews. Without a valid primary storey, choose a height band only among valid authored floor IDs; test each building's floors in the actual viewer |
| Windows inferred across open courts or roofs | Bundeshaus string courses and windows crossed an open courtyard | Only model openings seen in evidence |
| Stairs not reaching landings | Bundeshaus flights stopped short | Count risers from plans and panoramas; check riser heights (`s10_stair_risers.py`) |
| One stair per tread, one railing per baluster | Villa Maraini v011 registered 184 treads as `IfcStair` and 806 balusters as `IfcRailing` | One stair assembly of flights, landings and railings ([element rules](bim-modelling-guide/element-rules.md#stairs-and-ramps)); `ifc_audit.py` stair and class counts |
| A model passes every check and is still wrong | The golden example passed validation, audit and IDS with mirrored stair flights, a stair 20 cm from its wall and a path through a wall | List element bounds and render every storey and the federated view before freezing |
| Landing inherits the next flight's height | A sequential builder assigned a return landing the arrival-floor height | Store landing elevations explicitly; check every flight-to-landing junction on the built mesh, then inspect the route in section and perspective |
| A stair trim leaves full-height wall blades beside the treads | Restricting a correction to the exact walking footprint retained unsupported tall wall strips next to the guard | Compare the complete stair opening from the reference camera. Where photographs justify it, cap only identified remnants to a documented support/guard profile and preserve the lower fabric; passing route clearance alone does not establish architectural fidelity |
| Doors without openings | Leaves placed in solid walls | Openings first, then leaves; hinge side from the evidence (`doorHands`) |
| Tall glazing crosses a generic storey slab | Villa Maraini's continuous stair-hall window overlapped a slab strip between two levels | Check the complete aperture against walls, bands and slabs. If sources justify a correction, record a bounded exception, preserve piers and levels, and independently compare actual before/after geometry outside the mask |
| Opaque glass hides new joinery | A window's proxy pane overlapped its curved transom and obscured it from outdoors | Split proxy panes around the joinery silhouette and inspect from both sides; a readable interior view alone is insufficient |
| Duplicated trim | Overlapping cornice and cupola-base boxes | Coplanar check; one product per physical piece |
| Too many unique meshes | Every chair a separate mesh | One parameter set = one type; snap sizes (5 cm) so equal pieces share a type |
| Types keyed on geometry | Landgut Lohn v008: 91 wall types for 93 walls; 1.3 placements per type | Wall and slab types = thickness + material; product types = design + size ([guide](bim-modelling-guide/README.md#7-types-families-and-instances)) |
| Helper geometry in the IFC | Landgut Lohn v008 exported its walk-collision ground and garden walls as building proxies | Collision, cameras and reference planes never go into the IFC |
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
| A later review starts before the current model is settled | Findings can refer to different source geometry during parallel changes | Close each requested round against one source hash, preserve its release, and begin the next review from that frozen baseline; parallel reviewers own disjoint components |
| A metric read as quality | Edge precision drops when a furnished room meets a patterned photograph | Read the sheets, not only the score; use the edge F-score above the floor band for interiors |
