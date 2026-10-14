# Revit toolkit

Shared code and operating guide for reconstructions modelled in Revit through the pyRevit MCP. The [handbook](../../docs/handbook.md) says what a model must be (structure, evidence, checks, release); this page says how to do it in Revit. The Villa Maraini workspace (`reconstructions/villa-maraini/work/build/`, private) is the reference implementation these files were generalised from on 2026-10-12; new buildings start here.

## Build loop

```text
specification in references/research  →  stage in build/revit_ws/stages (dry run, read the change set and warnings)
  →  commit (one agent)  →  capture + log entry  →  owner saves  →  provenance stage last  →  checks  →  export chain  →  viewer check
```

Environment: see [below](#environment). Shared code: the [files](#files) on this page.

1. **Start a session.** `get_context` (version, document, policy, engine), then `get_skill("revit-scripting")`. Under policy `auto`, a `run_modify` without `dry_run` commits at once; `run_query` rolls everything back. Keep one Revit call in flight: parallel calls report `revit_busy`, and a `revit_busy` that names a modal window is a dialog for the owner.
2. **Set up the workspace once** (`work/build/revit_ws/`): copy `tools/revit/rvt_base.py` and `provenance_params.py`, generate the shared-parameter file (`python tools/revit/shared_parameters.py --prefix XX --out work/build/revit_ws`), write `provenance.json`, copy `provenance_stage.py` as the last stage, create `stages/MANIFEST.json` and `specs/` for the inputs the stages read. Write `build/export/export_config.json` for the [export chain](#export-chain).
3. **Write a stage** from `tools/revit/stage_template.py`: numbered, with parts, idempotent by tag and Mark, inputs from a specification file, registries written through `save_registry` (backups), every created element tagged with `tag_string(...)` and marked with its product id. `MANIFEST.json` records run order, requirements and what a stage invalidates.
4. **Run it** through the exec wrapper, dry run first, and read the change set and the warnings before committing:

   ```python
   import io
   exec(compile(io.open(r'<work>\build\revit_ws\stages\s12_openings.py', encoding='utf-8').read(), 's12_openings.py', 'exec'), globals())
   ```

   `run_modify` with `workspace=<work>\build\revit_ws`, `inputs={'part': 'all'}`, `dry_run=true`, then the same call with `dry_run=false`. Record the committed run id in the stage header and the MANIFEST (`manifest_record`), capture the affected area (`capture_view` with `elements=[...]`), log the step and ask the owner to save. Nobody but the owner saves: the agent runtime blocks saving and a save dialog blocks the API. Keep no more than one committed package unsaved.
5. **Keep the records in the repository.** `python tools/revit/save_run_record.py --round work/reviews/<round> --run <id>` copies the run record and captures out of the pyRevit profile.
6. **Check** before every export and in every round (the handbook's [quality checks](../../docs/handbook.md#quality-checks)): free wall ends, rooms without floor, stairs not arriving, slab openings against flights, furniture facing, overlap and support, elements outside rooms, duplicate marks, warning count delta, open to sky, through roof. `checks.py` (`run_query`, inputs `{'prefix': 'XX', 'tag': 'agent:xx'}`) covers the shared ones; a building adds the rest in `build/scripts/`. Copy the results into the round folder.
7. **Provenance last.** Run the provenance stage after every geometry package; coverage must be complete.
8. **Export and publish** with the [export chain](#export-chain): the export views with filters, geometry and metadata through `run_query`, GLB and BIM registry in CPython, `viewer.json`, `x20_publish.py`, `validate.mjs`, a local preview, then `publish_catalog.py` for the single published version. Run the repository tests and check the viewer: Exterior, Dollhouse per floor, floor filters, Walk, inspection cards, element counts.

The building's `work/ORCHESTRATOR.md` (from the [template](../../reconstructions/_template/work/ORCHESTRATOR.md)) adds the team rules for one Revit session shared by several agents and the Revit 2027 behaviours found in the Römerholz probes.

## Files

| File | Runs in | Use |
|---|---|---|
| `rvt_base.py` | Revit (IronPython 2.7) | Copy into `work/build/revit_ws/`; `configure(tag, prefix)`; units (`ft`, `m`), transactions with the warning preprocessor (`start`, `wrap`), tags (`tag_string`, `parse_tag`, `tagged`), marks, levels, rooms, registries with backups, `manifest_record` |
| `provenance_params.py` | both | The provenance parameter set (suffixes, specs, bindings, descriptions); copy next to `rvt_base.py` |
| `shared_parameters.py` | CPython | `--prefix RH --out work/build/revit_ws`: writes `RH_Provenance_SharedParameters.txt` with fresh GUIDs (once per building) |
| `provenance_stage.py` | Revit | Copy as `stages/s99_provenance.py`; binds the parameters and fills them from the stage tags; runs last; `provenance.json` configures prefix, tag prefix, building codes per package and defaults |
| `checks.py` | Revit (`run_query`) | Model checks: duplicate marks, untagged elements, missing method, free wall ends, stairs not arriving, rooms without area, furniture outside rooms or overlapping, warnings, open to sky, through roof; `inputs {'prefix': 'RH', 'tag': 'agent:rh'}` |
| `stage_template.py` | Revit | Skeleton of a stage with parts, tags and the verify block |
| `save_run_record.py` | CPython | Copies pyRevit run records (`%APPDATA%/pyRevit/agent/runs`) and captures into `work/reviews/<round>/` |
| `export/` | see below | The Revit → GLB → viewer chain, configured by `export_config.json` |

## Export chain

Copy `export/export_config.example.json` to `work/build/export/export_config.json` and fill it (building id, model id, prefix, views, building codes and their sets, storeys with viewer bands, location, georeference, notes). Then, from the repository root:

```text
x01_export_views.py        run_modify (dry run, then commit): the two export views and filters   inputs {'config': <path>}
x02_export_geometry.py     run_query per set: inputs {'config', 'view', 'set', 'out': <export>/raw, 'lod': 6}
x03_export_metadata.py     run_query per set: inputs {'config', 'set', 'out': <export>/raw}
python tools/revit/export/x10_build_glb.py        --config <export>/export_config.json
python tools/revit/export/x11_build_bim.py        --config ...
python tools/revit/export/x12_metadata_files.py   --config ...
python tools/revit/export/x20_publish.py          --config ...        release folder, catalog entry, preview catalog, content check
node   tools/revit/export/validate.mjs <id> <export>/stage
python tools/revit/export/serve_preview.py --building <id> --stage <export>/stage     local preview without touching the catalog
python tools/revit/export/publish_catalog.py --config ...   [--dry]   one published version: catalog swapped, superseded assets removed, older versions retired
```

The Revit scripts run through the exec wrapper of the pyRevit MCP (`exec(compile(io.open(path, encoding='utf-8').read(), name, 'exec'), globals())`) with the building's workspace as `workspace`; send one Revit call at a time. After publishing, run the repository tests (`node --test tests/*.test.mjs`) and check the viewer (Exterior, Dollhouse per floor, floor filters, Walk, inspection cards).

## Environment

Revit 2027 with pyRevit 7 and its agent host enabled (`pyrevit configs agent enable`, or `[agent] enabled = true`; the MCP reports `no_revit` otherwise), the model open in that session; policy `auto` commits a `run_modify` without `dry_run`. Python 3.14 with numpy (the export) and Pillow (previews); Node for the validator and the tests. The agent runtime cannot save the Revit file: the owner saves after every committed package.

Units: metres in records and registries, millimetres for element dimensions, feet inside the Revit API. `rvt_base.py` holds the one conversion (`FT = 1/0.3048`, `ft(m) = m*FT`); never convert elsewhere.

## Revit against the engine requirements

How Revit 2027 through the pyRevit MCP met the handbook's [engine requirements](../../docs/handbook.md#what-any-modelling-engine-must-provide) in the Römerholz run (about 1,800 elements).

| Requirement | Level | Revit 2027 + pyRevit MCP |
|---|---|---|
| Scriptable without a GUI in Python 3, from a command line or service | must | Partly: scripts run inside the open session (IronPython 2.7, or CPython through pythonnet) |
| Dry run with rollback and a change report by category | must | Yes; the backbone of the workflow |
| Read-only queries | must | Yes (`run_query`) |
| Save, save-as and backups from the API | must | **No**: the host blocks saving; the owner saves by hand after every package |
| No modal dialogs; errors and warnings as data with element ids | must | Mostly; the save reminder and some errors still open dialogs |
| Structured, Unicode-safe results | must | Partly; results had to be ASCII-escaped |
| Stable element ids across runs: our own key plus a native id | must | Partly; Marks are ours, native ids change when an element is recreated |
| Georeference: projected CRS, origin, rotation to true north, height datum | must | Yes, with base points and shared coordinates |
| Levels, including part levels and levels that are not storeys | must | Yes; rooms on part levels are fragile |
| Building parts as containers or attributes, for filters and export sets | must | A shared parameter plus view filters |
| Rooms placed by point, areas from bounding elements, a report of unenclosed rooms | must | 51 of 116 rooms unenclosed because of small wall gaps |
| About 25 provenance properties per element, on every category including terrain and rooms | must | Shared parameters; categories missing from the binding silently get nothing |
| Types created from data (wall, opening, stair types) | must | System types yes; families scripted from templates, slow and fragile |
| Geometry access: bounds, solids, rays with an element filter, clashes, coincident faces | must | Yes |
| GLB with element identity and shared meshes; subset export; open formats for everything published | must | Own exporter (`export/`); view filters for subsets |
| Rebuild from stages, so a crash loses only unsaved work | must | Yes, through `MANIFEST.json` |
| Parallel work, or at least non-blocking reads | should | No; one call at a time (`revit_busy`) |
| Fast round trips: a query under a second, a stage in seconds | should | Mixed; queries about 1 s, family stages 30–90 s |
| IFC4 Reference View with provenance property sets and map conversion | should | Not yet; IfcOpenShell is the fallback |
| Licence cost suited to occasional reconstruction work | should | No; a subscription for every machine that builds |

| Element | Needs | Revit experience |
|---|---|---|
| Walls | type, base and top by level + offset, profiled tops, end joins on or off, opening hosts | Good, but joins moved ends by up to 0.4 m; some top attachments to roofs refused |
| Slabs | outline with holes, sloped, edited in place | Good; a sloped slab gets a sloped underside that cuts flat ceilings below |
| Roofs | per-edge slope, exact pyramids, plate heights, trimming, dormers | Hardest group: exact pyramids fail, per-edge offsets fail on hips, plate = base + t / cos(slope) |
| Openings | types from width, height and sill; cased openings; host cut | Works, but each size class is a family or type |
| Stairs | per-flight riser and going, landings, winders, arrival on floors | Weak: one riser and going per stair (so stairs are split), winders only with a stepped underside |
| Railings | along a path or stair edge, continuous around curves | Break at rounded well ends |
| Ceilings, vaults | flat by outline; barrel, groin, cove | Flat ones fine; vaults as authored generic families |
| Terrain | TIN with holes, zones with exact shared edges, excavation | Sub-divisions do not cut the host; stairs do not excavate; zones rebuilt as separate toposolids |
| Furniture, profiles, vegetation | parametric boxes and sweeps, trees by height and crown, shared types | Slow family authoring (30–90 s per stage); wall sweeps vanish in Dollhouse; 285 individually sized trees made a 15 MB GLB |
| Context masses | low-detail meshes | Conceptual masses with a known warning each |

## Pitfalls

Revit and pyRevit traps that cost a round, with the prevention that now applies. The engine-neutral pitfalls are in the [handbook](../../docs/handbook.md#pitfalls).

| Pitfall | What happened | Prevention |
|---|---|---|
| Feet and metres mixed | A query divided internal feet by 0.3048 instead of multiplying; every distance came out 10.8× too large and clearance tests reported nothing | One unit convention in the helper module (`FT = 1/0.3048`, `ft(m) = m*FT`), never a conversion elsewhere |
| A run rolled back as a whole | One failing transaction (a join Revit cannot keep) rolled back the entire stage | Small parts, each in its own transaction; the struct part of the provenance stage is skipped and reported instead of breaking the run |
| Changing a stair type reset its riser count | `ChangeTypeId` on a stair recomputed the risers from the type's maximum riser height | Read the count before, restore it after, verify in the stage report |
| Baluster pattern refused every family | A duplicated pattern slot rejected all family ids in Revit 2027 | Build the pattern on a scratch type first; fall back to one baluster per tread |
| DirectShapes crashed the exporter | The geometry export's material lookup fails on DirectShapes with a subcategory style | Loadable Generic Model families built from world geometry with a `Material` parameter |
| Family loaded inside a transaction | `LoadFamily` and `doc.Regenerate()` right after it fail inside an open project transaction | Load families outside the stage transaction; no regenerate after a load |
| Placed family at the wrong height | `NewFamilyInstance` takes the point z as an offset from the level | Pass z − level elevation |
| Doorway without a leaf left rooms open | A gap in a wall does not bound a room | A cased opening (door family without leaf) so rooms stay bounded |
| Ceilings exported as decoration | Stucco ceilings and vaults hid the rooms in a floor filter | Tag ceilings and vaults `:ceiling` / `:vault`; the export marks them overhead |
| Catalog not updated by the publish script | The viewer kept loading the previous assets | Run `publish_catalog.py`, which swaps the entry and removes superseded assets (before it existed: copy the stage catalog entry into `public/models/catalog.json` by hand and delete superseded assets); check the viewer title and counts |
| Parallel Revit calls | Several MCP calls at once report `revit_busy`; a named modal window is a real dialog | Send modifying and exporting calls one at a time; a dialog is reported to the owner, never clicked around |
