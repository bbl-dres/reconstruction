# Third-party content

Everything committed here is published on GitHub Pages. Project code is [MIT](LICENSE); third-party software and data keep their own terms.

## Software

| Component | Used for | Terms |
|---|---|---|
| [three.js](https://threejs.org/) 0.185.1, [SunCalc](https://github.com/mourner/suncalc) 2.0.2, [meshoptimizer](https://github.com/zeux/meshoptimizer) 1.2.0 decoder | Building viewer (`viewer/vendor/`) | See [viewer/THIRD_PARTY.md](viewer/THIRD_PARTY.md) |
| [meshoptimizer](https://github.com/zeux/meshoptimizer) 1.2 encoder | Model compression (`tools/model-pipeline/vendor/`) | MIT |
| [MapLibre GL JS](https://maplibre.org/) 6.11.2 | Gallery map (`gallery/vendor/`) | BSD-3-Clause |
| [PlayCanvas Engine](https://github.com/playcanvas/engine) 2.13.6 and [SuperSplat Viewer](https://github.com/playcanvas/supersplat-viewer), exported by [LichtFeld Studio](https://lichtfeld.io/) | Splat viewers of the Beatrice von Wattenwyl-Haus | MIT, © PlayCanvas Ltd.; notice in each page |
| [CARTO basemaps](https://carto.com/basemaps), loaded at runtime | Gallery map tiles, fonts and icons | © CARTO; check CARTO's basemap terms for the intended use |

## Data

| Source | Used for | Terms |
|---|---|---|
| swisstopo: swissALTI3D, swissSURFACE3D, swissBUILDINGS3D, SWISSIMAGE, search API | Terrain, roof and tree heights, neighbouring buildings and colours of the Swiss sites; gallery coordinates | © swisstopo, open government data |
| Swiss cadastral survey (Amtliche Vermessung) | Land cover, walls and basins | Open data |
| BBL green inventory (Bundesgärtnerei) | Gardens, hedges and trees of Landgut Lohn | BBL |
| [OpenStreetMap](https://www.openstreetmap.org/copyright) | Roads, footprints and heights around Villa Maraini; gallery basemap | © OpenStreetMap contributors, ODbL |
| Regione Lazio (CTRN 2002, AGEA 2020 orthophoto) and the Roma Capitale geoportal | Terrain, roads and registration of Villa Maraini | CC BY 4.0 |
| [GlobalBuildingAtlas](https://doi.org/10.5194/essd-17-6647-2025) (Zhu et al., 2025) | Neighbouring heights around Villa Maraini | CC BY-NC 4.0: commercial reuse not cleared |
| Matterport tour of the Beatrice von Wattenwyl-Haus | Source of its splats | Capture commissioned by BBL from an external provider |

Data is clipped, transformed and partly inferred; the providers do not endorse the reconstructions. Non-public plans, photographs and tours used as evidence are not redistributed, only the models made from them.
