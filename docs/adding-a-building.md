# Adding a building

[← Repository](../README.md) · [Handbook](reconstruction-handbook.md) · [Conventions](conventions.md) · [Viewer guide](viewer-guide.md) · [Model handoff](model-handoff.md)

Every Blender-authored reconstruction uses the shared viewer in `viewer/` and the pipeline in `tools/model-pipeline/`. A new building adds data only: no copied JavaScript, CSS or vendor files. How the work itself proceeds is in the [handbook](reconstruction-handbook.md); an agent starts from the [brief template](agent-brief-template.md).

## Folder layout

```text
reconstructions/<id>/
  index.html     thin entry page (from templates/reconstruction/index.html)
  README.md
  public/        committed and published on GitHub Pages
    building.json  about.html  models/  profiles/  previews/  docs/
  work/          gitignored, never published; tracked in a private repository
    README.md  AGENTS.md  STATUS.md  HISTORY.md  project.json
    references/  research/  build/  releases/  archive/
```

`public/` holds only what may be published. `work/` holds evidence (plans, photos, tour downloads, geodata), research, the living build and frozen releases; its layout is fixed in [conventions](conventions.md#work-folder). Check with `git check-ignore -v reconstructions/<id>/work/x` before putting anything there.

## Steps

1. Copy `templates/reconstruction/` to `reconstructions/<id>/` (`<id>` is a lowercase slug, e.g. `landgut-lohn`). Replace `BUILDING-NAME` and `replace-building-id` in `index.html` and `public/`.
2. Set up the private work repository (once per building, from the repository root):

   ```powershell
   cd reconstructions/<id>/work
   git init -b main
   git add -A
   git commit -m "Workspace skeleton"
   gh repo create bbl-dres/reconstruction-work-<id> --private --source . --push
   ```

   `.gitignore` keeps binaries (`.blend`, GLB, images, PDF, LiDAR, video) out; releases list them with SHA-256. To version them too, install Git LFS (`git lfs install --local`; `.gitattributes` already routes those types) and remove the binary lines from `.gitignore`.
3. Research and model in `work/` as described in the [handbook](reconstruction-handbook.md), `work/README.md` and `work/AGENTS.md`. Reference catalog commands (repository root): `python tools/reference-catalog/references.py --workspace reconstructions/<id>/work --validate` and `python tools/reference-catalog/build.py reconstructions/<id>/work`.
4. Author every exported object to the [model handoff](model-handoff.md): stable `viewer_id`, `viewer_role`, `viewer_cutaway_role`, `viewer_floor_ids`. The default policy (`viewer/js/policy-default.js`) relies on these properties alone; only legacy geometry needs a building policy module (`public/policy/`, mapped as `building-policy` in the page's import map).
5. Fill `public/building.json` ([schema](building.schema.json)): name, place, links, `walkStarts`, and `pipeline` with export profiles and the floor `levels` (id, label, elevation, slice min/max in glTF metres).
6. Run the model checks (`tools/model-checks/`, see its README) and freeze a release in `work/releases/vNNN/` with exactly one `.blend` in `model/`, then import it:

   ```powershell
   python tools/model-pipeline/import_versions.py reconstructions/<id>/work/releases --building <id> --only v001 --keep-latest
   ```

   This writes `public/models/catalog.json` and the versioned assets; `--keep-latest` moves older published versions to `work/archive/models/`. For IFC: `python tools/model-pipeline/export_ifc.py <glb> <bim.json> <output.ifc> --scope registered --name "<ifcName>"`.
7. Add a preview image to `gallery/assets/` and an entry to `gallery/data/reconstructions.json` (location from the swisstopo SearchServer, as for the existing entries).
8. Check: `python tools/serve.py --building <id>` and inspect all four modes and every floor; run the test suite (see the [viewer guide](viewer-guide.md#verify-changes)); `tests/building-config.test.mjs` validates every page's `building.json`. Run `git status` and confirm that nothing from `work/` appears.
