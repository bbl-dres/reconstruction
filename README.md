# Reconstructions

<p align="center">
  <a href="https://bbl-dres.github.io/reconstruction/">
    <img src="gallery/assets/hero.jpg" width="100%" alt="Abstract architectural painting of the Bundeshaus emerging from architectural fragments, stone layers and copper-green washes">
  </a>
</p>

[![Gallery](https://img.shields.io/badge/gallery-open-2ea44f)](https://bbl-dres.github.io/reconstruction/)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Experimental 3D reconstructions of Swiss federal buildings, made from publicly available data.

The [gallery](https://bbl-dres.github.io/reconstruction/) links to each reconstruction and shows them as cards or on a map (`#map`). Every reconstruction lives in its own folder under `reconstructions/`. Blender-authored buildings share one viewer and one model pipeline; each building only adds data.

| Reconstruction | What it is |
|---|---|
| [Bundeshaus](reconstructions/bundeshaus/) | The Swiss Parliament Building in Bern. No-build Three.js viewer with exterior, dollhouse, floor-plan and walk modes, building inventory and IFC download. [Live viewer](https://bbl-dres.github.io/reconstruction/reconstructions/bundeshaus/). |
| [Beatrice von Wattenwyl-Haus](reconstructions/von-wattenwyl-haus/) | Archive of the public Matterport tour and an experiment turning its panoramas into a Gaussian splat. The downloaded tour stays local; the splat viewer is published. |

## Repository layout

| Path | Content |
|---|---|
| `index.html` | Gallery page with a Gallery / Map toggle |
| `gallery/` | Gallery code (`js/`), data (`data/reconstructions.json`: title, place, summary, link, preview, tags and WGS84 location with its source), preview images and README artwork (`assets/`), [MapLibre GL JS](https://maplibre.org/) 6.11.2 (`vendor/maplibre-gl/`, BSD-3-Clause, checksum in `VERSION.json`) |
| `viewer/` | Shared Three.js building viewer: `shell.html`, `js/`, `css/`, pinned `vendor/` libraries ([THIRD_PARTY.md](viewer/THIRD_PARTY.md)) |
| `tools/model-pipeline/` | Blender → GLB export, Meshopt compression, catalog import, BIM registry, IFC export, audit |
| `tools/model-checks/` | Blender checks for any building: hygiene, coplanar faces, furniture, Dollhouse audit |
| `tools/reference-catalog/` | Evidence library intake, validation and offline catalog for a building's `work/` |
| `tools/serve.py` | Local server for the gallery and all viewers |
| `docs/` | [Reconstruction handbook](docs/reconstruction-handbook.md), [conventions](docs/conventions.md), [pitfalls](docs/pitfalls.md), [agent brief template](docs/agent-brief-template.md); shared contracts: [viewer guide](docs/viewer-guide.md), [model handoff](docs/model-handoff.md), [adding a building](docs/adding-a-building.md), JSON schemas |
| `templates/reconstruction/` | Starter for a new building |
| `tests/` | Viewer, pipeline and configuration tests |
| `reconstructions/<id>/` | One folder per building: thin `index.html`, `README.md`, committed `public/` and gitignored `work/` |

Each Blender reconstruction has a **`public/`** folder (committed and published: building configuration, models, previews, docs) and a **`work/`** folder (gitignored: `references/`, `research/`, the living `build/`, frozen `releases/`, `archive/`; layout in [conventions](docs/conventions.md#work-folder)). `work/` is tracked in a private repository per building. See [Contributing](CONTRIBUTING.md) and [Adding a building](docs/adding-a-building.md).

## Run locally

```sh
python tools/serve.py
```

Open [localhost:8000](http://localhost:8000/) for the gallery or `/reconstructions/<id>/` for a viewer (`--building <id>` prints the link). The pages load data with `fetch`, so they need a web server. The map uses CARTO's Dark Matter vector basemap, loaded from CARTO at runtime. Check that [CARTO's basemap terms](https://carto.com/basemaps) fit the intended use before relying on it for a public site.

To add a reconstruction, follow [Adding a building](docs/adding-a-building.md): copy the template, add a preview image to `gallery/assets/` and an entry to `gallery/data/reconstructions.json`. Locations come from the [swisstopo search API](https://api3.geo.admin.ch/services/sdiservices.html#search) (`SearchServer`, `type=locations`, `sr=4326`) for the building's address.

Viewer links shared before this layout (`…/reconstruction/?version=…&view=…`) are forwarded to the Bundeshaus viewer. For that reason the map view uses `#map`, not a `view` parameter.

## License

Project code: [MIT](LICENSE). Bundled dependencies and third-party material retain their respective licenses and terms; [THIRD_PARTY.md](THIRD_PARTY.md) lists what is committed, what loads at runtime and what stays local. Map data © OpenStreetMap contributors, basemap © CARTO.

Everything committed is published on GitHub Pages. Each reconstruction's `work/` folder, local outputs, downloaded tools, large derived formats (splats, point clouds, plain IFC, archives) and raw third-party downloads are gitignored. The exception is the von Wattenwyl-Haus splat viewers in `reconstructions/von-wattenwyl-haus/viewer/output/`, published with the site. Check `git status` before committing new kinds of files.
