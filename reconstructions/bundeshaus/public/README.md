# Public viewer assets

Original models can be downloaded here. The viewer has no separate IFC download button.

## Full-building IFC

[Download v027 IFCZIP](models/bundeshaus-v027/reference-5ac65c0b87a25885.ifczip) (about 45 MB). Unzip it to obtain `bundeshaus-v027.ifc` (about 300 MB); rename `.ifczip` to `.zip` if your extraction tool needs that extension. The large plain IFC stays outside this repository.

The export covers all **10,768 modeled building components**: 1,795 reviewed products and 2,858 explicitly unclassified reference components. All 4,653 represented objects passed the web-ifc geometry check. Unclassified reference components are not additional reviewed physical-product counts. See [IFC validation](models/bundeshaus-v027/reference-0d94f87438470c0d.report.json).

## Published version

Only the latest version is published: **v027**, the latest reconstruction with the full-building IFC reference. Earlier milestones (v001 first reconstruction, v003 early detailed baseline, v010 south public entrance, v020 sculpture and artwork update) are kept locally in `../archive/models/` with their own catalog and compression rows. That folder is gitignored; older commits still contain them. The geometry tests in `../tests/viewer.test.mjs` read the archived versions from there and are skipped without it.

IFCZIP is a ZIP archive containing an IFC4 file. IFC carries material colors and transparency; PBR textures remain in the GLB. Datums and reconstructed details remain provisional. None of these exports is a surveyed as-built model.

To publish a new version: import it (`scripts/import_versions.py --only vNNN`), then move the previous version's folder from `models/` to `../archive/models/`, move its entry from `models/catalog.json` to `../archive/models/catalog.json` and its row from `models/compression.json` to the archive's, and set the catalog's `default` to the new ID. `../tests/catalog-assets.test.mjs` checks that exactly one version is published. Publish the full-building IFC download with it.

`models/` contains versioned runtime assets and the catalog. Models do not belong in review folders. Editable source models and supporting material stay in the local authoring workspace. The canonical viewer/export documentation is in [../docs](../docs).
