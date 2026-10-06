# Third-party content

This repository is published on GitHub Pages: everything committed is public. Project code is [MIT](LICENSE); third-party components, data and material keep their own terms. Downloads, tools, datasets and trained splats are gitignored and stay local.

## In the repository

| Path | Content | Terms |
|---|---|---|
| `gallery/vendor/maplibre-gl/` | [MapLibre GL JS](https://maplibre.org/) 6.11.2 (map in the gallery) | BSD-3-Clause, `gallery/vendor/maplibre-gl/LICENSE.txt`; source and checksum in `VERSION.json` |
| `viewer/vendor/` | three.js 0.185.1, SunCalc 2.0.2, meshoptimizer 1.2.0 decoder (shared building viewer) | See [viewer/THIRD_PARTY.md](viewer/THIRD_PARTY.md) |
| `tools/model-pipeline/vendor/meshoptimizer/` | [meshoptimizer](https://github.com/zeux/meshoptimizer) 1.2 encoder, used to compress published models | MIT, `tools/model-pipeline/vendor/meshoptimizer/LICENSE.md` |
| `gallery/data/reconstructions.json` (`location`) | Coordinates of building address points from the [swisstopo search API](https://api3.geo.admin.ch/services/sdiservices.html#search) | Federal Office of Topography swisstopo, open government data; source recorded per entry |
| `reconstructions/*/public/models/` (building models, BIM registries, IFC) | This project's reconstructions. Evidence is listed in each building's model status; non-public plans, tours and photographs are not redistributed | Project content |
| `reconstructions/landgut-lohn/public/models/*/surroundings-*` | Surroundings of Landgut Lohn: terrain and land cover from swissALTI3D 2025, tree and roof heights from swissSURFACE3D 2023, neighbouring buildings from swissBUILDINGS3D 3.0, colours from SWISSIMAGE 2024; land cover, walls and basins from the cadastral survey; garden areas, hedges and trees from the BBL green inventory | © swisstopo, open government data; cadastral survey (Amtliche Vermessung), open data; BBL green inventory (Bundesgärtnerei) |
| `reconstructions/bundeshaus/public/models/*/surroundings-*` | Surroundings of the Bundeshaus: terrain from swissALTI3D 2025 (2 m grid) with a site orthophoto, neighbouring buildings from swissBUILDINGS3D 3.0, and modelled public realm | © swisstopo, open government data; image and geometry sources recorded in the authoring source register (local) |
| `gallery/assets/bundeshaus.jpg`, `gallery/assets/landgut-lohn.jpg`, `reconstructions/*/public/previews/` | Captures of this project's own viewers; the surroundings in them are derived from the data above | Project content; surroundings as above |
| `gallery/assets/hero.jpg`, `gallery/assets/hero.png` | README cover artwork, made with an image generation tool from `gallery/assets/hero-prompt.txt` | Project content |
| `gallery/assets/von-wattenwyl-haus.svg` | Drawing used as the Beatrice von Wattenwyl-Haus preview | Project content |
| `reconstructions/von-wattenwyl-haus/viewer/output/` | Splat viewers, and the streamed levels of detail in `lichtfeld/` and `lichtfeld-loma/`. The splats are derived from the Matterport tour of the Beatrice von Wattenwyl-Haus; the pages are exported by [LichtFeld Studio](https://lichtfeld.io/) and bundle the [PlayCanvas Engine](https://github.com/playcanvas/engine) 2.13.6 and [SuperSplat Viewer](https://github.com/playcanvas/supersplat-viewer) | Splats: capture commissioned by BBL from an external provider. Viewer code: MIT, © PlayCanvas Ltd.; the license notice is included in each page |
| `gallery/assets/von-wattenwyl-haus.jpg` | Gallery preview rendered from the splat viewer | Derived from the tour, as above |

## Loaded at runtime

| Service | Used for | Terms |
|---|---|---|
| [CARTO basemaps](https://carto.com/basemaps) (Dark Matter vector style, tiles, fonts, icons) | Gallery map | © CARTO, map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors (ODbL); check CARTO's basemap terms for the intended use |

## Local only (gitignored)

| Path | Content | Terms |
|---|---|---|
| `reconstructions/bundeshaus/work/archive/models/bundeshaus-v020/research/` | Art register: identification sources as links and credits, no third-party images | Each source keeps its own terms; see `ART_SOURCES.md` there |
| `reconstructions/*/work/` | Each reconstruction's authoring workspace: reference photographs, plans, tour downloads, geodata, native models; tracked in private repositories | Each source keeps its own terms, recorded in the workspace's `references/manifest.json` |
| `reconstructions/von-wattenwyl-haus/matterport/output/` | Archive of the public Matterport tour of the Beatrice von Wattenwyl-Haus | Capture commissioned by BBL from an external provider; usage rights to be confirmed |
| `reconstructions/von-wattenwyl-haus/{dataset,brush,lichtfeld}/output/` | Datasets and trained splats derived from the tour | Derived from the tour |
| `reconstructions/von-wattenwyl-haus/matterport/tools/matterport-dl/` | [matterport-dl](https://github.com/rebane2001/matterport-dl), patched | Unlicense (public domain) |
| `reconstructions/von-wattenwyl-haus/brush/bin/` | [Brush](https://github.com/ArthurBrussee/brush) v0.3.0 | Apache-2.0 |
| Outside the repository (path passed to the scripts) | [LichtFeld Studio](https://lichtfeld.io/) v0.5.3 | GPLv3; Windows builds through the LichtFeld portal |
| npm cache, fetched by `npx` when building a streamed viewer | [PlayCanvas splat-transform](https://github.com/playcanvas/splat-transform) 3.9.0 | MIT |
| `reconstructions/von-wattenwyl-haus/alignment/tools/colmap/` | [COLMAP](https://github.com/colmap/colmap) 4.2.1, Windows CUDA build, with ONNX Runtime | BSD-3-Clause (COLMAP); MIT (ONNX Runtime) |
| Downloaded by COLMAP on first use | Learned feature models: [LoMa](https://github.com/davnords/LoMa), [ALIKED](https://github.com/Shiaoming/ALIKED), [LightGlue](https://github.com/cvg/LightGlue) | MIT; BSD-3-Clause; Apache-2.0 |
| `reconstructions/von-wattenwyl-haus/alignment/tools/cuda12/` | NVIDIA CUDA 12.9 runtime, cuBLAS, cuFFT, cuRAND, NVRTC and cuDNN 9.27 (pip packages) | NVIDIA software licence; not redistributed |
