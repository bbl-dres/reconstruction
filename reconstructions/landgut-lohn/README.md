# Landgut Lohn

The Federal Council's country residence in Kehrsatz, built 1782/83, with the Dependance and the Peristyl of 1959/60, as it stood before the 2026–2029 renovation. Reconstructed in Blender from floor plans, swisstopo LiDAR and a 360° tour, with furnished interiors and 500 × 500 m of surroundings, and shown in the shared 3D viewer.

**Viewer:** [bbl-dres.github.io/reconstruction/reconstructions/landgut-lohn](https://bbl-dres.github.io/reconstruction/reconstructions/landgut-lohn/) · **Run locally:** `python tools/serve.py --building landgut-lohn` from the repository root

> [!NOTE]
> An experimental reconstruction: dimensions, unseen spaces and some properties are inferred. The plans, tour and photographs it is based on are not redistributed, only the model and renders of it.

## Contents

| Path | Content |
|---|---|
| `index.html` | Entry page for the shared viewer in [`viewer/`](../../viewer), with the default viewer policy |
| `public/` | Published: configuration, the current model v008 (GLB, BIM registry, IFCZIP), export profiles and previews ([published files](public/README.md)) |
| `work/` | Authoring workspace, gitignored and tracked in a private repository; never published |

## More

- [Model status](public/docs/model-status.md): what the model contains, its sources and accuracy figures
- [Adding a building](../../docs/adding-a-building.md): the workflow this reconstruction follows
