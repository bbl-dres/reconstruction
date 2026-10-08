# Terrain and surroundings in Blender

[New reconstruction](adding-a-building.md) · [Elevation datasets](elevation-sources.md) · [Model handoff](model-handoff.md)

Checked 8 October 2026 during the Villa Maraini site study. Separate the data source, geographic registration and Blender importer: installing an add-on does not establish survey accuracy or data reuse rights.

## Import options

| Option | Useful capabilities | Limits and access |
|---|---|---|
| [BlenderGIS](https://github.com/domlysz/BlenderGIS) | GeoTIFF DEM, shapefile, OSM XML; geographic scene metadata and terrain tools | Open source. Its OpenTopography elevation service needs an API key. Official [releases](https://github.com/domlysz/BlenderGIS/releases) include Blender 5 fixes; compatibility with the project's exact Blender build still needs testing. |
| [Blosm](https://github.com/vvoovv/blosm) | Free base version imports OSM buildings, roads, polygons and roughly 30 m terrain; buildings can be placed on terrain | Base download is offered through Gumroad; Pro adds appearance/content features. Check actual OSM height coverage. Add-on availability is separate from permissions for each external data service. |
| Scripted GIS → Blender | Clip/reproject with PyProj/Rasterio, inspect DXF/shapefiles, construct tagged context meshes with Blender Python | Best fit for this repository's reproducible build and release process. Requires explicit source snapshots, transforms, data checks and authoring scripts. No add-on is required for this route. |

Use the official repositories/distributions. Preserve the chosen version and test in a project environment before changing a user's normal Blender setup. Prefer open terrain/vector sources for redistributable context; imagery/3D tile access has its own terms.

Google's [Map Tiles policies](https://developers.google.com/maps/documentation/tile/policies) restrict extraction/offline reuse even where an add-on supports import. Treat this as a streamed presentation option, not a source for reusable terrain geometry. For estimated building context, see [GlobalBuildingAtlas](global-building-atlas.md).

## Evidence and placement

1. Discover a small area from the building identity, then verify the footprint. A visitor address pin can be tens of metres from the actual building. Record source feature IDs and acquisition date.
2. Prefer a ground **DTM** for terrain. A DSM includes buildings/vegetation. Preserve native resolution; a denser mesh made by interpolation is not finer source data.
3. Store raw terrain/vector data, licences, metadata and hashes in private `work/research/geodata/`. Keep reference photographs/drawings in their existing architectural library.
4. Record the exact projected CRS/transform, including any supplied datum parameters. Subtract a local origin before creating Blender vertices. Document ENU/grid-north convergence and model rotation; do not apply north twice.
5. Fit at least three recognizable, non-collinear controls and check independent residuals. A whole-outline fit to OSM is approximate map registration, not a cadastral or surveyed fit. Preserve architectural scale unless evidence supports changing it.
6. Establish the vertical tie separately: DEM height, local floor zero and drawing datum are different quantities. Keep missing datum/control unresolved. A provisional display offset must be labelled as such and must not become a measured absolute floor elevation.
7. OSM `height` and `building:levels` coverage varies. Store the actual tag and inference rule per context object. Levels multiplied by an assumed storey height are inferred context. With no height evidence, show footprint markings and leave height unknown unless the owner requests a display default. Villa Maraini's owner requested 10 m: record `default10m` per object, preserve unknown actual height, and disclose the assumption in the viewer. Avoid duplicating the reconstructed building with its OSM block.
8. Check data dates and differences around retaining walls, gardens, ramps and basements. A coarse grid cannot resolve the architectural site junction. Do not sculpt a plausible hill and label it as measured terrain.

## Model and release checks

Use separate context collections and the building's context export profile. Terrain gets the documented `terrain` role; neighbouring buildings are context. Preserve stable building geometry/IDs when adding the site. Include source attribution in the viewer's public About/status and distinguish context from reconstructed architecture.

Review terrain coverage/nodata, mesh normals, neighbouring footprint placement, inferred heights, duplicate footprints, and the ground/building junction. Check walking collision separately from appearance. Re-run source-bound GLB/BIM/IFC validation after saving a changed native scene, even when only context changed. Freeze a new version; never modify the old release.

## Villa Maraini acquisition lessons

- Lazio's 2002 Rome DTM resource links to a File Browser application. A plain request to its directory returns HTML, not an archive. Select the tile using the supplied Gauss–Boaga index; tile **374062** covers the villa. The browser's Download link succeeded while a direct unauthenticated raw request returned HTTP 401. Do not copy session credentials into scripts.
- INGV's [TINITALY WCS](https://tinitaly.pi.ingv.it/wcs_service.html) supports a small numeric GeoTIFF subset, avoiding a full regional download. `DescribeCoverage` identifies the 10 m EPSG:32632 grid. Check dataset documentation as well as service metadata: the generic range-unit label in the observed service response was inconsistent with an elevation product.
- OSM way [200170131](https://www.openstreetmap.org/way/200170131) identifies Villa Maraini. The visitor pin used during initial discovery was north of the building; it was never model control.
- Compare competing DEMs before choosing by resolution. Here Lazio and TINITALY differed by about 19 m at the villa. The regional technical map marks 65.4 m in the grounds and approximately 54–56 m on nearby streets, corroborating Lazio's hill. Same-family cartography is a consistency check, not independent survey validation; the TINITALY disagreement's cause remains unproven.
- Run architectural Dollhouse/furniture checks on the reconstructed building. Neighbouring context buildings have no villa floor membership and otherwise produce meaningless distance-to-villa-floor warnings. Include all context in hygiene and coplanar checks, and inspect context separately.

For data terms and credit, start from [OpenStreetMap copyright](https://www.openstreetmap.org/copyright), the selected Lazio resource and the [TINITALY dataset citation](https://tinitaly.pi.ingv.it/Download_Area1_1.html). Record what was actually acquired and used, not merely a list of potential providers.
