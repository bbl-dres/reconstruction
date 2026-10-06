# Bundeshaus

The Swiss Parliament Building in Bern, reconstructed in Blender by a large language model from publicly available sources. The shared 3D viewer shows it as an exterior, a dollhouse, floor plans and on foot, with a building inventory and a full-building IFC download.

**Viewer:** [bbl-dres.github.io/reconstruction/reconstructions/bundeshaus](https://bbl-dres.github.io/reconstruction/reconstructions/bundeshaus/) · **Run locally:** `python tools/serve.py --building bundeshaus` from the repository root

> [!NOTE]
> An experimental reconstruction from public data: dimensions, unseen spaces and some properties are inferred. It is not a surveyed BIM model.

## Contents

| Path | Content |
|---|---|
| `index.html` | Entry page for the shared viewer in [`viewer/`](../../viewer) |
| `public/` | Published: configuration, the current model v027 (GLB, BIM registry, [IFCZIP download](public/README.md)), the Bundeshaus viewer policy, export profiles and previews |
| `work/` | Authoring workspace, gitignored and tracked in a private repository; never published |

## More

- [Model status](public/docs/model-status.md): the current version, review findings and floor schedules
- [Viewer guide](../../docs/viewer-guide.md) and [model handoff](../../docs/model-handoff.md): the shared viewer and model contract
