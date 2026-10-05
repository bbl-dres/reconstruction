# Adding a building

[← Repository](../README.md) · [Viewer guide](viewer-guide.md) · [Model handoff](model-handoff.md)

Every Blender-authored reconstruction uses the shared viewer in `viewer/` and the pipeline in `tools/model-pipeline/`. A new building adds data only: no copied JavaScript, CSS or vendor files.

## Folder layout

```text
reconstructions/<id>/
  index.html     thin entry page (from templates/reconstruction/index.html)
  README.md
  public/        committed and published on GitHub Pages
    building.json  about.html  models/  profiles/  previews/  docs/
  work/          gitignored, never published; tracked in a private repository
    AGENTS.md  STATUS.md  PROJECT.md  project.json  references/  research/  scripts/  stages/  versions/  catalog/  archive/
```

`public/` holds only what may be published. `work/` holds evidence (plans, photos, tour downloads, geodata), research, native `.blend` files and frozen releases. Check with `git check-ignore -v reconstructions/<id>/work/x` before putting anything there.

## Steps

1. Copy `templates/reconstruction/` to `reconstructions/<id>/` (`<id>` is a lowercase slug, e.g. `landgut-lohn`). Replace `BUILDING-NAME` and `replace-building-id` in `index.html` and `public/`.
2. Set up the private work repository (once per building, from the repository root):

   ```powershell
   cd reconstructions/<id>/work
   git init -b main
   git lfs install --local
   git add -A
   git commit -m "Workspace skeleton"
   gh repo create bbl-dres/reconstruction-work-<id> --private --source . --push
   ```

   `.gitattributes` routes `.blend`, images, PDFs, GLB and IFC through Git LFS. The public repository ignores the whole folder.
3. Research and model in `work/` as described in `work/README.md` and `work/AGENTS.md`. Reference catalog commands (repository root): `python tools/reference-catalog/references.py --workspace reconstructions/<id>/work --validate` and `python tools/reference-catalog/build.py reconstructions/<id>/work`.
4. Author every exported object to the [model handoff](model-handoff.md): stable `viewer_id`, `viewer_role`, `viewer_cutaway_role`, `viewer_floor_ids`. The default policy (`viewer/js/policy-default.js`) relies on these properties alone; only legacy geometry needs a building policy module (`public/policy/`, mapped as `building-policy` in the page's import map).
5. Fill `public/building.json` ([schema](building.schema.json)): name, place, links, `walkStarts`, and `pipeline` with export profiles and the floor `levels` (id, label, elevation, slice min/max in glTF metres).
6. Freeze a version in `work/versions/vNNN/` with exactly one `.blend` in `model/`, then import it:

   ```powershell
   python tools/model-pipeline/import_versions.py reconstructions/<id>/work/versions --building <id> --only v001
   ```

   This writes `public/models/catalog.json` and the versioned assets. For IFC: `python tools/model-pipeline/export_ifc.py <glb> <bim.json> <output.ifc> --scope registered --name "<ifcName>"`.
7. Add a preview image to `gallery/assets/` and an entry to `gallery/data/reconstructions.json` (location from the swisstopo SearchServer, as for the existing entries).
8. Check: `python tools/serve.py --building <id>` and inspect all four modes and every floor; run the test suite (see the [viewer guide](viewer-guide.md#verify-changes)); `tests/building-config.test.mjs` validates every page's `building.json`. Run `git status` and confirm that nothing from `work/` appears.
