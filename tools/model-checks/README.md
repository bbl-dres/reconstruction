# Model checks

Blender checks for any reconstruction that follows the [model handoff](../../docs/model-handoff.md). Run them on the working model before every release and copy the results into the release's `validation/`. They were written for Landgut Lohn (v30, v35, v55, v56) and give identical results there.

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

## IFC audit

`ifc_audit.py` checks an exported IFC or IFCZIP against the [BIM modelling guide](../../docs/bim-modelling-guide/README.md). It runs in the BIM Python environment ([requirements-bim.txt](../model-pipeline/requirements-bim.txt)), not in Blender:

```bash
python tools/model-checks/ifc_audit.py <model.ifc|model.ifczip> --out <report.json> --model-type building|site|surroundings [--geometry]
```

It reports storeys and spatial containment, `IfcBuildingElementProxy` share, type assignment and reuse, representation kinds, wall → opening → door/window relations, stairs decomposed into flights, materials, standard property sets, names and duplicate GlobalIds; `--geometry` adds elements that cross a storey band (slow on very large files). Rules differ per model type (a site has no storeys; surroundings may be massing proxies). Exit code 1 only on errors (no spatial structure, uncontained elements, duplicate GlobalIds); warnings are findings to read. Use it with the [IDS files](../../docs/bim-modelling-guide/ids/README.md) and `ifctester`; `tests/ifc_audit_test.py` covers it.
