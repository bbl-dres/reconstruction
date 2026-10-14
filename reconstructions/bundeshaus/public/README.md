# Bundeshaus – model files

[← Bundeshaus](../README.md)

> [!WARNING]
> **Experiment – for viewing only.** Built from publicly available data. Not survey-grade and not accurate: do not use it for measurements, planning or any other purpose.

The current version is the one folder in `models/`:

| File | Content |
|---|---|
| `reference-*.ifczip` | IFC4 reference model, zipped (rename to `.zip` if your tool needs it) |
| `building-*.glb.gz`, `surroundings-*.glb.gz` | Building and surroundings as glTF, Meshopt-compressed and gzipped |
| `bim-*.json` | Product registry: products, types and storeys |
| `viewer.json` | Saved views and object notes |
| `*.report.json` | Export records |

`building.json`, `about.html`, `profiles/` and `policy/` (the Bundeshaus viewer rules) configure the viewer and the export; `models/compression.json` records delivery sizes. Surroundings data: © swisstopo, see [THIRD_PARTY.md](../../../THIRD_PARTY.md).

Everything in `public/` is published; evidence and source files stay in `../work/`.
