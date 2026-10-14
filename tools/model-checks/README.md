# Model checks and the Blender route

Blender checks for any reconstruction that follows the [model contract](../../docs/viewer.md#model-contract), and the operating notes for the legacy Blender route (Bundeshaus, Landgut Lohn). The [handbook](../../docs/handbook.md) says what a model must be; this page says how the Blender builds did it. Conversion, import and compression are in the viewer's [asset pipeline](../../docs/viewer.md#asset-pipeline) (`tools/model-pipeline/`).

## Checks

Run them on the working model before every release and copy the results into the release's `validation/`. They were written for Landgut Lohn (v30, v35, v55, v56) and give identical results there.

```bash
blender --background <model.blend> --python tools/model-checks/<check>.py -- --out <report.json> [options]
```

| Check | Finds | Options |
|---|---|---|
| `hygiene.py` | missing viewer/BIM properties, duplicate `viewer_id`, non-unit scale, missing materials, degenerate faces, loose vertices, inverted closed meshes; triangle, mesh-reuse and material statistics | `--collections` exported collection prefixes (default: all except `--skip-collections`), `--require` extra properties (e.g. the building's basis and source tags) |
| `coplanar.py` | same-facing coplanar faces of different objects that overlap (z-fighting, dark bands in Cycles) | `--skip-collections` (default `Types,Reference,Context`) |
| `furniture_check.py` | furniture in walls, outside its room floor, chairs not facing their table | `--facing-free-prop` building property that exempts a chair (`viewer_facing_free` always does) |
| `dollhouse_audit.py` | products left floating once Dollhouse removes enclosure, roofs and ceilings, per floor | `--levels` (default: every `viewer_floor_ids` value), `--skip-collections` (default `Types,Reference,Context,Site`) |

`coplanar.py` and `furniture_check.py` need shapely in Blender's Python (or a bpy module in a Python that has it). `dollhouse_audit.py` mirrors `viewer/js/policy-default.js`; keep them in step. Options are shared through `checkargs.py`.

A building wraps its arguments in one script, e.g. `reconstructions/landgut-lohn/work/build/scripts/checks.sh`.

## Blender build loop (legacy)

```text
edit references/research or build/scripts  →  rebuild build/model  →  checks into reviews/<round>  →  look  →  release
```

Rebuild the spec and the scene in background Blender; run the checks above (hygiene, coplanar, furniture, Dollhouse audit) and the building's own checks; look at the camera-match sheets and every Dollhouse floor; fix and repeat. Objects carry the provenance set as building-prefixed custom properties. Import and compression are in the [asset pipeline](../../docs/viewer.md#asset-pipeline).

Environment: Blender 5.2 (tested with 5.2.1 LTS), Python 3.11 or later for the pipeline, Node.js 24 or later for compression and the tests.

The handbook's engine-neutral pitfalls name a check for each trap; in the Blender builds these were:

| Handbook pitfall | Blender check or build step |
|---|---|
| Printed plan scale trusted | `s01_plan_calibration.py` (building script) |
| Hairline spikes from plan tracing | `v40_plan_overlay.py` (building script) |
| Dashed lines ignored | `hallOpeningHeads` in the building spec; `dollhouse_audit.py` |
| Coplanar faces, duplicated trim | `coplanar.py` |
| Furniture facing the wall | `furniture_check.py` |
| Pieces floating in Dollhouse | `dollhouse_audit.py` on every floor |
| Walls crossing floor bands | `v50_rooms_and_bands.py` (building script) |
| Stairs not reaching landings | `s10_stair_risers.py` (building script) |
| Doors without openings | `doorHands` in the building spec |

## Blender pitfalls

| Pitfall | What happened | Prevention |
|---|---|---|
| `.001` object names | Re-created objects collided with the ones they replaced | Remove the old object and mesh before creating the new one; `hygiene.py` flags duplicate `viewer_id`s |
| Workbench renders white or black in background mode | No display | Use Cycles with few samples for review renders |
| A long Blender call timed out over MCP | Large operations in one call | Small idempotent script steps; save after each; heavy work in background Blender |
