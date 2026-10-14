# Sammlung Oskar Reinhart «Am Römerholz» – model files

[← Sammlung Oskar Reinhart «Am Römerholz»](../README.md)

> [!WARNING]
> **Experiment – for viewing only.** Built from publicly available data. Not survey-grade and not accurate: do not use it for measurements, planning or any other purpose.

The current version is the one folder in `models/`:

| File | Content |
|---|---|
| `building-*.glb`, `surroundings-*.glb` | Building and surroundings as glTF, Meshopt-compressed (`.gz`: the same, gzipped) |
| `bim-*.json` | Product registry: products, types and storeys |
| `viewer.json` | Saved views and object notes |
| `model_georeference.json` | Geographic reference |
| `*.report.json`, `*.validation.json` | Export and validation records |

`building.json`, `about.html` and `profiles/` configure the viewer and the export. Surroundings data: © swisstopo, see [THIRD_PARTY.md](../../../THIRD_PARTY.md).

Everything in `public/` is published; evidence and source files stay in `../work/`.
