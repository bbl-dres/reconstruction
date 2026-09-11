# Public viewer assets

Original models can be downloaded here. The viewer has no separate IFC download button.

## Full-building IFC

[Download v027 IFCZIP](models/bundeshaus-v027/reference-0d94f87438470c0d.ifczip) (about 45 MB). Unzip it to obtain `bundeshaus-v027.ifc` (about 300 MB); rename `.ifczip` to `.zip` if your extraction tool needs that extension. The large plain IFC stays outside this repository.

The export covers all **10,768 modeled building components**: 1,795 reviewed products and 2,858 explicitly unclassified reference components. All 4,653 represented objects passed the web-ifc geometry check. Unclassified reference components are not additional reviewed physical-product counts. See [IFC validation](models/bundeshaus-v027/reference-0d94f87438470c0d.report.json).

## Retained viewer milestones

| Version | Milestone |
|---|---|
| v001 | First reconstruction |
| v003 | Early detailed baseline |
| v010 | South public entrance |
| v020 | Sculpture and artwork update |
| v027 | Latest reconstruction and full-building IFC reference |

IFCZIP is a ZIP archive containing an IFC4 file. IFC carries material colors and transparency; PBR textures remain in the GLB. Datums and reconstructed details remain provisional. None of these exports is a surveyed as-built model.

Keep at most five viewer milestones: the first release, the latest validated release and three representative intermediate versions. Publish the full-building IFC download with the latest release. When retiring an iteration, remove its catalog entry and files after relocating any assets still used by retained versions. Update the compression summary with the retained catalog.

`models/` contains versioned runtime assets and the catalog. Models do not belong in review folders. Editable source models and supporting material stay in the local authoring workspace. The canonical viewer/export documentation is in [../docs](../docs).
