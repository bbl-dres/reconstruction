# BUILDING-NAME – model files

[← BUILDING-NAME](../README.md)

> [!WARNING]
> **Experiment – for viewing only.** Built from publicly available data. Not survey-grade and not accurate: do not use it for measurements, planning or any other purpose.

The current version is the one folder in `models/` (`<id>-vNNN`), written by the export chain:

| File | Content |
|---|---|
| `reference-*.ifczip` | IFC4 reference model, zipped (rename to `.zip` if your tool needs it) |
| `building-*.glb`, `surroundings-*.glb` | Building and surroundings as glTF, Meshopt-compressed (`.gz`: the same, gzipped) |
| `bim-*.json` | Product registry: products, types and storeys |
| `viewer.json` | Saved views and object notes |
| `model_georeference.json` | Geographic reference |
| `*.report.json`, `*.validation.json` | Export and validation records |

`building.json`, `about.html` and `profiles/` configure the viewer and the export. Keep only the rows that exist and credit third-party data in [THIRD_PARTY.md](../../../THIRD_PARTY.md).

Everything in `public/` is published; evidence and source files stay in `../work/`.
