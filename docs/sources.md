# Sources

[← Repository](../README.md) · [Handbook](handbook.md) · [Viewer](viewer.md) · [Candidates](candidates.md)

Where to look for evidence and geodata when researching a building, for agents and people. Each data category lists the sources to try, in one table format; copyable requests are under [Example requests](#example-requests). This page is the map, not the record: what a building actually acquired and used, with rights, goes into its `references/manifest.json` and `register.md` ([handbook](handbook.md#records)). Raw geodata and research notes stay private in `work/references/research/geodata/`. Checked on 14 October 2026.

## Start here

1. **Identify the building.** Switzerland: the EGID from the federal building register (GWR) and the cadastral footprint. Abroad: the owner department's location page (most buildings abroad are [EDA](https://www.eda.admin.ch/de/) embassies, consulates and residences), the official address, the national building or cadastral ID and the [OpenStreetMap](#openstreetmap) way or relation. A visitor map pin can be tens of metres off and is never control.
2. **Fix the frame.** Record the coordinate reference system, vertical datum, units and axis order before using any dataset ([handbook](handbook.md#frames-and-units), [Swiss frames](#frames-and-rights)).
3. **Follow the country route below,** then the category tables, smallest useful area first: terrain, aerial imagery, footprints and cadastre, then plans, photographs and history.
4. **Check before use:** coverage at the actual site (not the catalogue extent), dates, resolution versus accuracy, licence and whether derived 3D reuse is allowed. Discovery, login, download and redistribution rights are separate checks.
5. **Hand over what needs a person:** logins, archive orders, email requests, paid quotes, sites that need a browser. Prepare exact product names, identifiers and the area of interest. Never ask for credentials, work around authentication or bot checks, or ignore `robots.txt`.

## Country routes

- **Switzerland:** geo.admin `SearchServer` turns the address into coordinates and the GWR feature → GWR gives the EGID, parcel and category → `identify` on the cadastral survey gives parcel and EGRID, the geodienste.ch WFS layer `LCSF` the surveyed footprint → the STAC API gives swissALTI3D, swissSURFACE3D, SWISSIMAGE and swissBUILDINGS3D tiles → `swissimage-product` with `TIME=`, the historical maps and LUBIS aerial images date the changes → KGS, ISOS, the BAK monument list and the cantonal inventory give the history → BBL Bautendokumentationen, e-periodica and e-rara give plans and texts → BAR, gta Archiv, the National Library and building-permit files need a person.
- **France:** Nominatim gives the OSM way → BD TOPO `batiment` WFS gives heights and the RNB building ID → POP gives the heritage record → LiDAR HD metadata WFS leads to terrain, surface and point-cloud tiles → BD ORTHO for today, historical aerial frames (`pva:image`) for earlier states → Etalab cadastre per commune → archives by a person (Fondation Le Corbusier, EPFL ACM, Archives de Paris). Check Lambert-93 (EPSG:2154) with IGN69 heights, the acquisition date, masked restricted areas and the licence family (Etalab or ODbL).
- **Italy:** RNDT or data.europa.eu for the publisher → Agenzia delle Entrate WMS for the parcel → regional geoportal for technical maps, DTM and orthophotos → TINITALY as the national fallback → OSM and GlobalBuildingAtlas for neighbours.
- **Federal building abroad:** `https://www.eda.admin.ch/<city>` opens the representation page → the [directory of Swiss representations](https://www.eda.admin.ch/eda/en/fdfa/representations-and-travel-advice/schweizer-vertretungen-im-ausland.html) (PDF) gives the official address → OSM (`office=diplomatic` with `country=CH`) and Wikidata confirm the building and its coordinates → Dodis, Federal Council messages, BBL Bautendokumentationen and the BAR give its history → the Wayback Machine keeps building pages and brochures from before the EDA website relaunch.
- **South Korea:** identity from the embassy page, Wikidata and OSM → building register through the data.go.kr API and the NGII building layer → VWorld and NGII for imagery and maps → Korea Heritage Service API for nearby heritage. Keys and downloads need a person with a Korean-verified account. Public imagery is capped at 25 cm, sensitive sites are masked, and NGII maps and photographs may not leave Korea without permission: keep raw NGII data out of repositories hosted abroad and publish only derived geometry with attribution.
- **Elsewhere:** the national mapping agency and cadastre first, then data.europa.eu (Europe), then OpenStreetMap and the global sources below.

## Discovery portals

| Source | Coverage | Product and access | Limits | Comments |
|---|---|---|---|---|
| [docs.geo.admin.ch](https://docs.geo.admin.ch/) | Swiss federal geodata | REST API (`SearchServer`, `find`, `identify`, layer metadata, height and profile), WMS, WMTS, 3D Tiles and STAC, all without registration | Free under the [FSDI terms](https://www.geo.admin.ch/en/general-terms-of-use-fsdi), fair use; `find` and `identify` return at most 200 features | Start here for any Swiss site; data release notes under `/releases/` |
| [STAC API](https://data.geo.admin.ch/api/stac/v1/collections) ([browser](https://data.geo.admin.ch/browser/index.html)) | Every downloadable federal file, over 500 collections | `/api/stac/v1/search?collections=…&bbox=…&datetime=…`; assets are direct HTTPS files | Use v1 (v0.9 runs until at least the end of 2026); collections paginate (`rel=next`) | The asset's multihash equals the file's SHA-256: verify downloads with it |
| [geocat.ch](https://www.geocat.ch/datahub/news) | Federal, cantonal and municipal geometadata | GeoNetwork search API `POST /geonetwork/srv/api/search/records/_search` (Elasticsearch JSON with a `geo_shape` bbox); CSW at `/geonetwork/srv/eng/csw` | Metadata only; the datahub interface is a JavaScript app | Finds cantonal and municipal layers not on geo.admin.ch; `linkUrl` gives the download or service (a bbox with "Orthofoto" found the Stadt Bern orthophotos 1999–2023) |
| [opendata.swiss](https://opendata.swiss/de) | Federal, cantonal and municipal open data | CKAN API `https://ckan.opendata.swiss/api/3/action/package_search?q=…`; resources carry `download_url` or a service | Licence per dataset; returns 403 without an identifying User-Agent | Best route to cantonal orthophotos, LiDAR and 3D city models |
| [RNDT](https://geodati.gov.it/) | Italy | National geodata catalogue: finds the publisher and live service | Metadata only | Search by publisher, region, product type and the local bbox, not by broad keyword |
| [data.europa.eu](https://data.europa.eu/) | EU and harvested national catalogues (RNDT, IGN and others) | Takes over INSPIRE discovery since the INSPIRE Geoportal closed on 1 July 2026 ([announcement](https://knowledge-base.inspire.ec.europa.eu/news-and-publications/news/european-commission-transitioning-inspire-infrastructure-eu-horizontal-services-ensure-long-term-2026-07-01_en)). Anonymous [search API](https://data.europa.eu/api/hub/search/search) with `q`, `filter=dataset`, a country facet and a bbox; SPARQL at `/sparql` | Metadata only; extent rectangles are not coverage; old Geoportal links may break | A Rome bbox with `q=ortofoto` returned 71 datasets with WMS, WCS and TIFF links. The [INSPIRE Knowledge Base](https://knowledge-base.inspire.ec.europa.eu/) keeps specifications |
| [IGN Géoplateforme](https://data.geopf.fr/wfs/ows?SERVICE=WFS&REQUEST=GetCapabilities) | France | WFS `https://data.geopf.fr/wfs/ows`, WMTS `/wmts`, WMS `/wms-r`, downloads under `/telechargement/` | Anonymous; cartes.gouv.fr itself is a JavaScript app | Query the services directly; geoservices.ign.fr pages redirect to cartes.gouv.fr |
| [Lazio Geoportal](https://geoportale.regione.lazio.it/) | Lazio | GeoNode metadata, GeoServer WMS and WFS | HTTP 200 may carry an OGC error | The scoped WFS `/geoserver/geonode/wfs` worked when the global request failed; read layer names from capabilities |
| [Roma Capitale geoportal](https://geoportale.comune.roma.it/servizi/) | Rome | Municipal WMS and WFS services; STAC API `/stacapi/` for the 2022 flight | Layer names do not imply content | Announced acquisitions (October 2022 flight, [GeoRoma](https://www.comune.roma.it/web/it/progetti-pnrr-e-altri-fondi-straordinari-pn-metro-plus-21-27.page?contentId=PRG1163632)) are not published downloads |

## Terrain and elevation

| Source | Coverage | Product and access | Limits | Comments |
|---|---|---|---|---|
| [swissALTI3D](https://www.swisstopo.admin.ch/en/height-model-swissalti3d) | Switzerland and Liechtenstein; 0.5 m and 2 m ground model (DTM); six-year cycle | COG or XYZ in 1 km tiles; STAC `ch.swisstopo.swissalti3d` | OGD, credit "© swisstopo"; 1σ 0.3 m from new LiDAR, 0.5 m older, 1–3 m above 2000 m; interpolated under buildings | Several years can exist per tile: take the newest. The item year is a release label; the flight year is in the metadata |
| [swissSURFACE3D](https://www.swisstopo.admin.ch/en/height-model-swisssurface3d) | Classified LiDAR point cloud, all of Switzerland; re-flights 2024–2029 | LAS 1.2 zip (5–20 points/m², about 120 MB a tile) or, from 2024, COPC LAZ 1.4 (25–40 points/m²); STAC `ch.swisstopo.swisssurface3d` | OGD; ±20 cm in plan, ±10 cm in height | Roof planes, eaves and trees; does not resolve interiors |
| swissSURFACE3D Raster | Switzerland, 0.5 m surface model (DSM) | COG; STAC `ch.swisstopo.swisssurface3d-raster` | Includes buildings and vegetation; trees can hide roofs | Subtract swissALTI3D for heights above ground |
| [Height](https://docs.geo.admin.ch/access-data/get-point-height.html) and [profile](https://docs.geo.admin.ch/access-data/get-elevation-profile.html) services | Switzerland, points and lines | `/rest/services/height`, `profile.json` or `.csv` (up to 5000 vertices) | Model and datum not named in the docs | Quick check (543.0 m at the Bundeshaus); use the tiles for modelling |
| Cantonal LiDAR | Geneva (2005–2025), Solothurn (2014, 2018, 2019) and others | Point clouds and derived models through [opendata.swiss](https://opendata.swiss/de) | Terms vary | Check for a denser or newer cloud than swissSURFACE3D |
| [IGN LiDAR HD](https://www.data.gouv.fr/datasets/mnt-lidar-hd) | France, 1 km tiles | Classified COPC LAZ point clouds and 0.5 m terrain (MNT), surface (MNS) and height (MNH) models. The WFS layer `IGNF_LIDAR-HD_METADONNEE:metadata` returns the file links per tile | Licence Ouverte 2.0; Lambert-93 with IGN69 heights; restricted areas are nodata; tiles of 0.5–2 GB | Older tile-index layers (`IGNF_LIDAR-HD_TA:*`) no longer work |
| [Regione Lazio CTRN 2002](https://dati.lazio.it/dataset/carta-tecnica-regionale-2002-2003-5k-roma) | Rome | 5 m DTM in DXF; tiles chosen from the Gauss–Boaga index ([resource](https://dati.lazio.it/dataset/carta-tecnica-regionale-2002-2003-5k-roma/resource/df8dea52-9982-4429-883d-dafa0e361ab6)) | CC BY 4.0; 2002 state; vertical datum unknown | Tile 374062 covers Villa Maraini and gives its provisional floor tie (± 0.30 m). The browser download worked; a direct request returned 401 |
| [TINITALY 1.1, INGV](https://tinitaly.pi.ingv.it/) | Italy | 10 m bare-ground DTM, WGS84 / UTM 32; [download index](https://tinitaly.pi.ingv.it/Download_Area1_1.html) or a small subset through [WCS](https://tinitaly.pi.ingv.it/wcs_service.html) | CC BY 4.0 with dataset citation; January 2023 is the release, not a survey date | Differed by about 19 m from Lazio at Villa Maraini; the WCS range-unit label was inconsistent |
| [PST-A LiDAR (MASE)](https://data.europa.eu/data/datasets/m_amte-299fn3-b86e27e3-479d-4ec3-d17f-9883bd0495c2?locale=en) | Lazio river corridors (1 m), coastal strip ([2 m](https://data.europa.eu/data/datasets/m_amte-299fn3-6636776d-0c1e-4e48-c094-d0c256bafec8?locale=en)) | WMS layers `EL.LIDAR.LAZIO.1x1.DTM`, `EL.LIDAR.LAZIO.2x2.DTM` | 2008–2011 acquisition; a regional title is not full coverage | NoData at Villa Maraini; test a positive control elsewhere to tell a gap from a failing service |
| [Copernicus DEM](https://dataspace.copernicus.eu/explore-data/data-collections/copernicus-contributing-missions/collections-description/COP-DEM) | Global | GLO-30 and GLO-90 surface model, WGS84 / EGM2008 ([handbook](https://dataspace.copernicus.eu/sites/default/files/media/files/2024-06/geo1988-copernicusdem-spe-002_producthandbook_i5.0.pdf)); also anonymous COGs on [AWS Open Data](https://registry.opendata.aws/copernicus-dem/) | DSM with buildings and vegetation; CDSE needs registration | Distant context only; the [30 m view service changed in August 2026](https://dataspace.copernicus.eu/news/2026-8-25-copernicus-dem-30m-view-service-update) |
| [SRTM 1 arc-second](https://www.usgs.gov/centers/eros/science/usgs-eros-archive-digital-elevation-shuttle-radar-topography-mission-srtm) | Global | About 30 m radar elevation, February 2000, WGS84 / EGM96 | Account needs vary by route | Older fallback; do not mix EGM96 with EGM2008 or plan zero |
| [Maxar/Vantor Vivid Terrain](https://developers.maxar.com/docs/ordering/guides/3d-ordering) | Global | Finer paid DTM and DSM | Paid; about 10 km² minimum; anonymous Discovery returned 401 | A person requests a sample, date, datum, void mask, price and reuse rights |

Checks:

- Prefer a ground **DTM**; a DSM includes buildings and vegetation. Grid spacing is not vertical accuracy, and resampling adds no measured detail.
- Record publisher, product and version, acquisition and release dates, horizontal CRS, vertical datum or geoid, units, spacing, nodata, tile bounds and licence.
- Compare competing DEMs before choosing by resolution, and check known spot heights and streets.
- Fit at least three recognisable non-collinear controls and report residuals; a whole-outline fit to OSM is approximate registration, not a survey.
- Keep the vertical tie separate: DEM height, local floor zero and drawing datum are different quantities. A provisional display offset is labelled as such.
- Coarse terrain is context only. Steps, retaining walls, grottoes, floor levels and roof planes need survey or drawing evidence. Never sculpt a plausible hill and call it measured.

## Aerial imagery

| Source | Coverage | Product and access | Limits | Comments |
|---|---|---|---|---|
| [SWISSIMAGE 10 cm](https://www.swisstopo.admin.ch/de/orthobilder-swissimage-10-cm) | Switzerland: 10 cm in the plains, 25 cm in the Alps; three-year cycle | COG 1 km tiles (about 60 MB) at 0.1 m and 2 m, STAC `ch.swisstopo.swissimage-dop10`; WMS `ch.swisstopo.swissimage` (up to 10000 px) and WMTS | OGD, credit "© swisstopo"; ±15 cm | A WMS GetMap at a chosen metres-per-pixel gives a measurable image of footprints, roofs, trees and paving. A tile's year is the flight covering at least 70 % of it |
| SWISSIMAGE Journey through time | Switzerland, orthophoto mosaics 1926–2025 | WMS `ch.swisstopo.swissimage-product` with `&TIME=<year>`; WMTS with the same time values; tile-year metadata as `ch.swisstopo.swissimage-product.metadata` | View service only | The fastest way to date a building's changes |
| [SWISSIMAGE HIST 1946](https://www.swisstopo.admin.ch/en/orthoimage-swissimage-hist-1946) | Switzerland, 1 m national mosaic of 1946 | WMS and WMTS `ch.swisstopo.swissimage-product_1946` | Accuracy 5–10 m; download is a paid order | The free alternative is the LUBIS single images of 1946 |
| LUBIS aerial image archive | Switzerland: black and white 1921–2010, colour 1952–2010, infrared, **oblique 1927–2004**, terrestrial 1915–1961 | STAC `ch.swisstopo.lubis-luftbilder_schwarzweiss`, `_farbe`, `_infrarot`, `_schraegaufnahmen` and `lubis-terrestrische_aufnahmen`. Each item has the scan (about 120 MB), a single-image orthophoto, a quickview and a CSV with camera, focal length and orientation | OGD; raw scans are not orthorectified | The orientation data allows photogrammetry (85 colour images and two 1929 obliques around the Bundeshaus). The [LUBIS viewer](https://www.swisstopo.admin.ch/en/application-lubis-viewer) needs a browser |
| swisstopo special flights | Switzerland, patchy; 5–100 cm, 2009–2026 | STAC `ch.swisstopo.spezialbefliegungen` | Coverage varies | Check before ordering anything |
| Stadt Bern orthophotos | City of Bern, 1999–2023; 5 cm in 2023 | WMS and WMTS `map.bern.ch/arcgis/services/Geoportal/Orthofoto_2023/MapServer/WMSServer`; listed on opendata.swiss | Open | Sharper than SWISSIMAGE around the Bundeshaus |
| Kanton Zürich orthophotos | Canton of Zurich, yearly flights since 2020 | WMS `https://wms.zh.ch/OrthoZHWMS`, layers such as `ortho_s_2024`, `ortho_w_2021` | OGD; check the resolution of each year | For Winterthur and Römerholz |
| Geneva SITG orthophotos | Canton of Geneva, 4 cm, spring 2024 | One 209 GB COG (`ge.ch/sitg/geodata/SITG/COG-DATA/IMAGE_AERIENNE_ORTHO_2024_03.tif`) and an ArcGIS ImageServer | Open | Read windows with HTTP range requests (GDAL `/vsicurl/`); never download the whole file |
| IGN BD ORTHO / ORTHO HR | France; 20 cm since 2021 (Île-de-France 2021 at 15 cm) | WMTS `https://data.geopf.fr/wmts`, layers `HR.ORTHOIMAGERY.ORTHOPHOTOS` and `ORTHOIMAGERY.ORTHOPHOTOS`; JP2 downloads per département | Etalab 2.0: bulk and derived use allowed with credit | The WFS layers `ORTHOIMAGERY.ORTHOPHOTOS.GRAPHE.*` give the capture-date footprints |
| [BD ORTHO Historique](https://www.data.gouv.fr/datasets/bd-ortho-r-historique) | France; 1950–65 complete (greyscale), 1965–95 partial | WMTS layers `ORTHOIMAGERY.ORTHOPHOTOS.1950-1965`, `ORTHOIMAGERY.EDUGEO.PARIS1949`, `ORTHOIMAGERY.EDUGEO.PARIS1965` | Licence Ouverte 2.0 | Already rectified: the quickest dated site context |
| [IGN historical aerial photos](https://remonterletemps.ign.fr/) | France, 1919–2010 | WFS `pva:image` by bbox (EPSG:2154) returns frame and mission IDs, date and orientation; TIFF from `https://data.geopf.fr/telechargement/download/pva/{dataset_identifier}/{image_identifier}.tif` | Licence stated as open: confirm before publishing; 1000 dpi scans are a paid order; restricted sites blurred | Raw frames, not orthophotos: roof outlines and photogrammetry. 378 frames cover the Pavillon Suisse site, some from its construction in 1930–34 |
| [AGEA 2020 (Lazio)](https://geoportale.regione.lazio.it/catalogue/csw_to_extra_format/r_lazio%3A92b0f7e3-3b75-4feb-ac5e-2382/ortofoto-agea-v-2020.html) | Lazio | Orthophoto, 2020 flight, published 2023, EPSG:25833; Roma Capitale WMS layer `REGLAZ:2020_AGEA_25833_COG` at `/geoserver/ows` | Lazio applies CC BY 4.0 to regional cartography, but the layer states no licence and AGEA imagery is elsewhere "all rights reserved": a person confirms with Lazio before textures are published; a requested 0.30 m spacing is not native resolution | Save the GetMap bbox, CRS, size and a pixel-centre worldfile |
| Lazio AGEA 2023 | Lazio, 0.20 m, 2023; AGEA 2008–2020 on the same server | WMS `https://geoportale.regione.lazio.it/geoserver/ows`, layer `geonode:2023_AGEA_25833_COG`; WCS 2.0.1 `coverageId=geonode__2023_AGEA_25833_COG` returns GeoTIFF clips | Licence as for AGEA 2020: confirm before publishing | The newest free orthophoto at Villa Maraini; a 100 m clip worked without login |
| Roma Capitale 2022 flight | Rome, 14–20 October 2022: nadir about 5 cm and four oblique views (4–6 cm), georeferenced frames | STAC `https://geoportale.comune.roma.it/stacapi/`, missions `Roma_2022` and `Roma_2022_RF` | Free to browse, not to reuse: downloads need a Roma Capitale login and reuse needs the city's permission (a person) | The best Rome source for photogrammetry once permission exists |
| San Marino orthophotos | San Marino: 2002, 2007, 2014, 2018, 2023; 2024 contours at 1 m | ArcGIS REST `https://mappeonline.pa.sm/arcgis/rest/services/basemap/Ortofoto_2023/MapServer` (`/export` without token) | No licence stated, tile export disabled: view only; reuse by request to the cadastre office (a person) | Local Cassini/Bessel CRS |

| Lazio orthophoto series | Rome: 1994, 1998/99, 2002/03, 2005, 2008 and later | TIFF, WMS and WCS distributions, found through the data.europa.eu search API | Licence per dataset; not yet checked | Dates changes to a garden or site |
| Geoportale Nazionale (Italy) | Italy: orthophotos 1988–89, 1994–98, 2000, 2006 and 2012 (AGEA, 50 cm) | WMS `http://wms.pcn.minambiente.it/ogc?map=/ms_ogc/WMS_v1.3/raster/<file>.map` with files `ortofoto_bn_88`, `ortofoto_bn_94`, `ortofoto_colore_00`, `_06`, `_12` (use http) | View-only WMS of AGEA-owned imagery (CC BY 4.0 covers only the download service); at most 2048 px a request | Historical context where regional data is missing |
| [Aerofototeca Nazionale (ICCD)](https://afn.cultura.gov.it/webgis/) | Italy: historical aerial photographs, including Allied reconnaissance 1943–45 | WebGIS subset, photo indexes; requests through e-Foto registration | A person registers and requests; free for study and research, paid for commercial use; some collections owned by lenders | Earlier states of an Italian site |
| [IGM aerial photos](https://igmi.esercito.difesa.it/foto-aeree) | Italy, historical frames | Online shop: TIFF and photogrammetric scans | Paid (a person) | When ICCD has no coverage |
| NGII and VWorld (South Korea) | Korea: VWorld satellite background map; NGII orthophotos (12 cm in cities, restricted) and an aerial archive from the 1940s | VWorld WMTS with a key; NGII Open API with registration and key | Public imagery capped at 25 cm; keys need a Korean-verified account; export of NGII photographs needs permission; sensitive sites masked | Check the embassy tile visually for masking |
| European national orthophotos | Germany NRW 10 cm (`https://www.wms.nrw.de/geobasis/wms_nw_dop`), Netherlands 8 cm (PDOK `luchtfotorgb` WMTS), Spain PNOA 25–50 cm (`https://www.ign.es/wms-inspire/pnoa-ma`), Austria basemap.at 29 cm, Flanders | WMS and WMTS without login | NRW dl-de/zero-2-0, Spain and Austria CC BY 4.0, Netherlands CC BY; check each country's licence | Find others through data.europa.eu |
| [Sentinel-2](https://dataspace.copernicus.eu/) | Worldwide, 10 m, about every five days | Copernicus Data Space | Free, credit "Copernicus Sentinel data <year>" | Large-scale context only |
| [OpenAerialMap](https://openaerialmap.org/) | User uploads | STAC `https://api.imagery.hotosm.org/stac` (collection `openaerialmap`) without login | Labelled CC BY 4.0, but uploads can be re-shared commercial imagery; the Maxar/Vantor open data is CC BY-NC and covers disaster areas only | Check the uploader before use |
| Esri World Imagery, Bing, Mapbox Satellite | Worldwide, 15–30 cm in many cities | Tile services | Free to view, not to reuse: no bulk download, offline export or textures; Esri allows tracing vectors, Bing only inside OSM editors, Mapbox only for non-commercial or OSM tracing | Viewing aid, never evidence |
| [USGS EarthExplorer](https://earthexplorer.usgs.gov/), declassified | Worldwide: CORONA 1960–72 (about 2 m), KH-9 1971–84 | Free download of existing scans | Public domain; a free account (a person); not georeferenced | Historical context where nothing else exists |
| [Google Earth, Google Map Tiles](https://developers.google.com/maps/documentation/tile/policies) | Global | Streamed imagery and 3D tiles | Terms restrict extraction and offline reuse | Viewing aid only, never stored as evidence or published. Owner screenshots go to `research/geospatial-imagery/` with screenshot and imagery dates recorded separately; map-render distortion cannot give dimensions |

## Buildings and footprints

| Source | Coverage | Product and access | Limits | Comments |
|---|---|---|---|---|
| GWR building register | Every building in Switzerland, refreshed daily | api3 layer `ch.bfs.gebaeude_wohnungs_register` (`find` by EGID, or the feature by `<EGID>_0`); bulk extract `https://public.madd.bfs.admin.ch/<ch, be, zh, …>.zip` (CSV, SQLite, GeoJSON, field specification) | Free use with credit "BFS, Eidg. Gebäude- und Wohnungsregister"; points, not footprints; an administrative record | Fields such as construction year (`GBAUJ`), floors (`GASTW`), area and volume can be empty or implausible, notably for federal buildings |
| Cadastral survey footprints | Switzerland, surveyed polygons | geodienste.ch WFS layer `ms:LCSF` (`Art=Gebaeude`, with `GWR_EGID`) and `ms:SOSF` for single objects | Per-canton access ([Cadastre and parcels](#cadastre-and-parcels)) | Use this footprint, not OSM or swissTLM3D, for registration and the north fit |
| [swissBUILDINGS3D 3.0 Beta](https://www.swisstopo.admin.ch/en/landscape-model-swissbuildings3d-3-0-beta) | Switzerland and Liechtenstein: roofs with overhangs, as solids or roof, facade and footprint parts; updated every three years, published twice a year | DWG, GDB, CityGML; map-sheet tiles and a Switzerland-wide GDB of 14–15 GB; STAC `ch.swisstopo.swissbuildings3d_3_0` | ±0.3–0.5 m; dormers and small annexes not modelled; per-tile downloads only for the 2020 release | An envelope check for the reconstructed roof, not the architecture. EGID-linked in 19 cantons and the city of Zurich |
| swissBUILDINGS3D 2.0 | Switzerland, LoD 2.3, roof elements of 8 m and more | GDB or DXF; STAC `ch.swisstopo.swissbuildings3d_2` | No longer updated; DXF meshes carry no attributes | Fallback when no GDB reader is at hand; historic comparison |
| [OpenStreetMap](#openstreetmap) | Global | Footprints, `building:part`, levels and heights where mapped | ODbL | See its own section below |
| [GlobalBuildingAtlas](https://github.com/zhu-xlab/GlobalBuildingAtlas) | Global | LoD1 heights predicted from 3 m PlanetScope imagery (2019); [ODbL footprints](https://huggingface.co/datasets/zhu-xlab/GBA.ODbLPolygon), [LoD1 heights](https://huggingface.co/datasets/zhu-xlab/GBA.LoD1), [rasters](https://mediatum.ub.tum.de/1782307) | Footprints ODbL, heights CC BY-NC 4.0; European height RMSE 4.1 m; no automated WFS queries | Heights are inferred context. Polygons are EPSG:3857 even where files declare 4326 ([paper](https://essd.copernicus.org/articles/17/6647/2025/)) |
| [Microsoft Global ML Building Footprints](https://github.com/microsoft/GlobalMLBuildingFootprints) | Worldwide including France, Italy and Switzerland; not South Korea | Index `dataset-links.csv` (location, quadkey, URL) leading to `.csv.gz` files of line-delimited GeoJSON with `height` and confidence | CDLA Permissive 2.0 (the README; older listings say ODbL); imagery 2014–2025 | ML heights are estimates; -1 means none |
| [EUBUCCO](https://eubucco.com) | EU, Switzerland, Norway, UK: over 322 million buildings | GeoParquet per NUTS-2 region on anonymous S3 (`s3.eubucco.com`, for example `s3://eubucco/v0.2/buildings/parquet/nuts_id=CH02/CH02.parquet`); [docs](https://docs.eubucco.com/latest/) | ODbL (a few regions differ); EPSG:3035; most heights and floors are ML estimates | Filter `height_source != 'estimated'` before using a height as evidence; construction year filled for about 16 % |
| [Google Open Buildings](https://sites.research.google/gr/open-buildings/) | Africa, South and Southeast Asia, Latin America | Polygons and 2.5D height rasters | CC BY 4.0 or ODbL | No Europe or Korea: skip for current sites |
| IGN BD TOPO `batiment` | France | WFS layer `BDTOPO_V3:batiment` with `hauteur`, ground and roof altitudes, storeys, wall and roof materials, `date_d_apparition` and RNB IDs | Etalab 2.0; heights derived, footprints from the cadastre | `hauteur` is not roof maximum minus ground (5.8 m against 14.7 m on one Paris building): check the IGN definitions |
| [RNB](https://rnb.beta.gouv.fr/) | France | National building register; anonymous REST API `https://rnb-api.beta.gouv.fr/api/alpha/buildings/{id}/` with shape, addresses and linked IDs ([docs](https://rnb-fr.gitbook.io/documentation/api-et-outils/api-batiments)) | Etalab 2.0; 20 requests a second | France's counterpart of the EGID: record it as the building's identity |
| [Paris Volumes bâtis](https://opendata.paris.fr/explore/dataset/volumesbatisparis/) | Paris, yearly | Opendatasoft API, SHP, CSV, JSON with storey and height fields | ODbL (share-alike); no courtyard holes | Keep ODbL and Etalab layers apart |
| Rome `CostruzioniVolumiCTRN` | Rome | 2003 building outlines from the [municipal services](https://geoportale.comune.roma.it/servizi/) | 2D only despite the name | Good outlines, no heights |
| Lazio DBGT / DBT roof layers | Lazio | Roof elements and volume units through the regional WFS | Sparse: may omit whole buildings | Returned three nearby polygons, none over Villa Maraini |
| Building register, South Korea | Korea | 건축HUB building register API on data.go.kr (dataset 15134735, `BldRgstHubService`); NGII building layer GIS건물통합정보 as daily file and WMS/WFS (15052097, 15123970) | Free; keys need a Korean-verified account (a person); the Seoul open API answers rows 1–5 with the `sample` key | Use, structure, floors and area per building |

Checks:

- Match footprints in a local metric CRS before transferring heights (Villa Maraini v003 used IoU ≥ 0.85 and centroids ≤ 3 m; project choices, not dataset guarantees).
- Levels multiplied by an assumed storey height are inferred. With no height evidence, leave height unknown unless the owner asks for a display default, and record it per object.
- Exclude the reconstructed building from the context set so it is not duplicated. Parts of a 3D Tiles mesh are not buildings.

## OpenStreetMap

The default source for footprints, streets, paths and neighbours anywhere, and for a building's identity abroad. Every route below works without a login; send an identifying User-Agent with every request.

| Source | Coverage | Product and access | Limits | Comments |
|---|---|---|---|---|
| [Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API) | Worldwide, minutes behind the live map | POST to `https://overpass-api.de/api/interpreter`; select by `around:` or bbox; `out geom;` returns ways and relation members with coordinates | [Fair use](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html): under 10,000 queries and 1 GB a day for one-off use; no parallel scripts; on HTTP 429 or a 504 "too busy" wait and retry | **Default route** for one site: about 2 s for 300 m around Villa Maraini. `/api/status` shows free slots |
| [Nominatim](https://operations.osmfoundation.org/policies/nominatim/) | Worldwide | `/search?q=<address>&format=jsonv2` returns `osm_type` and `osm_id` | At most one request a second; identifying User-Agent (library defaults are refused); cache results; no bulk use | Identifies the building; never model control |
| [OSM API 0.6](https://operations.osmfoundation.org/policies/api/) | Worldwide | `/api/0.6/way/<id>/full.json` | Reserved for editing, not read-only projects | Avoid; use Overpass |
| [Geofabrik](https://download.geofabrik.de/) | Continents, countries, regions; updated daily | `.osm.pbf` extracts, read with osmium or pyosmium | ODbL; public files omit user metadata | Large areas, repeated work, or when Overpass is busy |
| [Overture Maps](https://docs.overturemaps.org/guides/buildings/) | Worldwide | Buildings and building parts as GeoParquet on S3 or Azure, with height, floors, roof shape and per-feature `sources`; `pip install overturemaps` then `overturemaps download --bbox=W,S,E,N -f geojson --type=building`, or DuckDB on the release path | ODbL, credit "© OpenStreetMap contributors, Overture Maps Foundation"; monthly releases kept about two months | Mixes OSM with Microsoft, Google, IGN Spain and others: read `sources` per feature and record the release (2026-09-23.1 on 14 October 2026) |
| [osmium export](https://osmcode.org/osmium-tool/), [GDAL OSM driver](https://gdal.org/en/stable/drivers/vector/osm.html), [osmnx](https://osmnx.readthedocs.io/) | Tools | Polygons with courtyard holes from multipolygon relations | osmium drops invalid relations unless run with `-e` and needs complete members (`(._;>;);out body;`); GDAL 3.11–3.12 were [reported](https://community.openstreetmap.org/t/gdal-ogr2ogr-shells-and-inner-rings-issues/139741) to lose outer rings | Check ring counts after any conversion |

Default request for one site (about 300 m around the building), tested on 14 October 2026:

```sh
curl -s -A "bbl-dres-reconstruction (https://github.com/bbl-dres/reconstruction)" \
  --data-urlencode 'data=[out:json][timeout:60];(nwr["building"](around:300,41.906773,12.487714);nwr["building:part"](around:300,41.906773,12.487714););out geom;' \
  https://overpass-api.de/api/interpreter -o work/references/research/geodata/osm-site.json
```

Relations come with their member ways, roles (`outer`, `inner`) and coordinates; assemble them into polygons with holes (for example with shapely) before use. Queries that also fetch complete members for osmium (`(._;>;);out body;`) are heavier and were refused as "too busy" at the same moment.

- Save the query text, the response, its hash and the `osm_base` timestamp; credit "© OpenStreetMap contributors" ([copyright](https://www.openstreetmap.org/copyright)).
- Assemble multipolygon relations with their courtyard holes and deduplicate member ways against their parent; a way-only importer lost 26 relation buildings and 32 courtyards at Villa Maraini.
- Where `building:part` carries different levels or heights, keep the shared footprint and the stepped envelope; one parent polygon is not one roof height.
- Store the actual `height` or `building:levels` tag and the inference rule per object. Compare footprints against an orthophoto or plan; OSM positions are good to a few metres and completeness varies by place and date.

## Cadastre and parcels

| Source | Coverage | Product and access | Limits | Comments |
|---|---|---|---|---|
| [geodienste.ch cadastral survey](https://www.geodienste.ch/services/av) | All cantons; model DM.01-AV-CH (version 24.0) | WMS and WFS `https://geodienste.ch/db/av_0/deu`; downloads as GPKG, SHP, DXF, INTERLIS and, in most cantons, IFC | Free in most cantons; approval or a contract in JU, LU, NE, NW, OW and VD; NE, TI and VS incomplete | An anonymous request to a closed canton can return 0 features without an error: test a positive control in an open one (BE and ZH worked). Arcs arrive as chords |
| Cadastral web map | Switzerland | api3 `identify` on `ch.swisstopo-vd.amtliche-vermessung` gives parcel number, EGRID and the cantonal geoportal link; WMTS `ch.kantone.cadastralwebmap-farbe` | Display service: rounded to 0.1 m, no official areas | Use it to find the parcel, then fetch geometry from the WFS |
| Cadastral model change (DMAV) | All cantons | DMAV in force since 1 January 2024; migration deadline 31 December 2027 | Both models coexist in 2026–27 | Check layer names per canton |
| Cantonal GIS | Swiss cantons | Cantonal geoportals with cadastre, plans and local layers, found through geocat.ch | Terms vary | Often sharper or newer local data than federal layers |
| [Etalab cadastre](https://cadastre.data.gouv.fr/) | France, every commune | GeoJSON per commune (buildings, parcels, sheets): `…/etalab-cadastre/latest/geojson/communes/<dep>/<commune>/` | Licence Ouverte; a fiscal drawing, not a survey | IGN Parcellaire Express WFS (`CADASTRALPARCELS.PARCELLAIRE_EXPRESS:parcelle`) answers bbox queries without a download |
| [Agenzia delle Entrate WMS](https://wms.cartografia.agenziaentrate.gov.it/inspire/wms/ows01.php?service=WMS&version=1.3.0&request=GetCapabilities) | Italy | Layers `CP.CadastralParcel`, `fabbricati`, `codice_plla`; GetFeatureInfo gives an identifier | CC BY 4.0; images, not vectors; a GML response may hold only a bbox | The [map-sheet service](https://unicat.agenziaentrate.gov.it/cgconsade/dist/img/Consultazione%20dei%20fogli%20di%20mappa%20catastale_Manuale_Utente_20251107.pdf) needs SPID, CIE or CNS: a person |

## Maps and landscape models

| Source | Coverage | Product and access | Limits | Comments |
|---|---|---|---|---|
| [swissTLM3D](https://www.swisstopo.admin.ch/en/landscape-model-swisstlm3d) | Switzerland: roads, transport, buildings, areas, land cover, water, single objects, names; yearly releases | GDB, SHP, GPKG or INTERLIS as Switzerland-wide zips; STAC `ch.swisstopo.swisstlm3d`; api3 `identify` for single features | 0.2–1.5 m for well-defined features, 1–3 m for forest edges | Paths, walls, water and vegetation around the site. Trees also come as 3D Tiles (`ch.swisstopo.vegetation.3d`) |
| [Other landscape models](https://www.swisstopo.admin.ch/en/landscape-models) | Switzerland | swissNAMES3D, swissBOUNDARIES3D, swissTLMRegio, swissTNE through STAC | Generalised or thematic | Names, boundaries and labels only |
| Historical maps | Switzerland: Siegfried map 1870–1949, Dufour map, Journey through time 1844–2021 | WMS and WMTS `ch.swisstopo.hiks-siegfried` (with time), `ch.swisstopo.hiks-dufour`, `ch.swisstopo.zeitreihen`; National Map 1:25,000 rasters 1984–2024 in STAC (`pixelkarte-farbe-pk25.noscale`) | View services; no download for Siegfried and Dufour | Dates the building, its extensions and the garden layout |
| [David Rumsey Map Collection](https://www.davidrumsey.com/) | Worldwide historical maps | Search API `luna/servlet/as/fetchMediaSearch?…&includeIiifManifest=true` returns IIIF manifests and image sizes | CC BY-NC-SA 3.0; display-only items have no download | Georeferencer overlays help date a site |
| [Old Maps Online](https://www.oldmapsonline.org/) | Aggregator of over 400,000 maps | Browser only (refuses scripts) | Licence of each source library | A person searches |
| Lazio CTRN technical map | Lazio | Elevated building and boundary polylines and spot-level symbols in the CTRN DXF | Text labels can sit tens of metres from their symbols | Sample heights at the symbols; a DXF named `_plt` can still be 3D |
| [Carta di Uso del Suolo](https://geoportale.regione.lazio.it/), CORINE | Lazio, EU | Land-cover classes | Minimum mapping area and date | Cannot place single trees or paving edges |

## Plans, drawings and archives

| Source | Coverage | Product and access | Limits | Comments |
|---|---|---|---|---|
| [BBL Bautendokumentationen](https://www.bbl.admin.ch/de/bautendokumentationen) | About 150 two-page project sheets for federal buildings (Bundeshaus 2006–2018, Landgut Lohn, Römerholz 2010, Prangins 2023 and more) | Server-rendered list page; PDFs at `https://www.bbl.admin.ch/dam/de/sd-web/{id}/{file}.pdf` with IDs that must be read from the list | Reproduction needs prior written consent; photographers named per sheet; old `/bbl/de/home/…` paths return 404 | Site plans, sections with scale bars and plan datums. One of the first places to look; check the date against today's building |
| BBL property documentation | Per building, supplied by the owner | Plans, sections, plan-archive scans and photographs into `references/incoming/` | Internal: never published; rights decided by the owner | Usually the richest source for a federal building. Key sheets by hash, not plan number |
| [e-periodica](https://www.e-periodica.ch/) | Swiss journals with published plans: Schweizerische Bauzeitung (1883–1978) and successors, Das Werk, werk bauen + wohnen, Bauen+Wohnen, INSA | Volumes by title code (`sbz-002`, `wbw-002`, `wbw-004`, `ins-001`, …); DOIs `10.5169/seals-N`; metadata through OAI-PMH at `/oai` | Free to read without login; private, educational and non-commercial use only; publishing images needs the rights holder; no systematic mirroring. `robots.txt` and a bot check blocked scripts in October 2026: a person opens the volume | Plans and sections of the original building and its alterations |
| [e-rara](https://www.e-rara.ch/), [e-manuscripta](https://www.e-manuscripta.ch/) | Rare prints and manuscripts | IIIF manifests `https://www.e-rara.ch/i3f/v20/{id}/manifest` (same pattern on e-manuscripta) and the IIIF Image API for full-resolution pages; OAI at `/oai` | The manifest gives attribution, not a licence | Works without a browser |
| [Swiss Federal Archives (BAR)](https://www.recherche.bar.admin.ch/recherche/) | Federal records, including building dossiers | Online catalogue; ordering; free digitisation on request with delivery by email ([search overview](https://www.bar.admin.ch/de/suchen)); Federal Council messages in the "Amtsdruckschriften" | Login through eIAM or AGOV ([user handbook](https://www.bar.admin.ch/dam/bar/en/dokumente/kundeninformation/Benutzerhandbuch-Webportal.pdf.download.pdf/User-Handbook-2024_02-12.pdf)); the search is a JavaScript app | An agent prepares dossier leads; a person orders and places files in `references/incoming/` |
| Swiss National Library (EAD) | 1.2 million documents since 1880: photographs, plans and reports on federally subsidised restorations | Helveticat and HelveticArchives in a browser | Free consultation; closed 30 October – 29 November 2026 while moving | A strong lead for restored federal buildings; a person requests |
| [gta Archiv ETH](https://archiv.gta.arch.ethz.ch/) | About 170 architects' estates | Online catalogue; requests by email | Reproduction terms per request | A person requests |
| [EPFL Archives de la construction moderne](https://morphe.epfl.ch/) | Swiss and related architects | Morphé catalogue online; consultation by appointment | Rights per document | Holds Pavillon Suisse material (dossier 0040) |
| [Dodis](https://dodis.ch/) | Diplomatic Documents of Switzerland: Federal Council and diplomatic records | Anonymous search; permalinks `dodis.ch/<nr>` with facsimile PDFs | Open data CC BY-SA; PDF links expire | Dates of purchases, donations and building credits abroad (Villa Maraini: acceptance 27 December 1946, conversion credit 1963) |
| [Amtsdruckschriften](https://www.amtsdruckschriften.bar.admin.ch/) | Federal Council messages and official prints | Federal Archives portal | Public documents; some contain security passages that are never published | Building credits with areas, volumes and site plans |
| Cantonal and municipal archives | Building permits (Bauakten) and state archives | On site or by request | A person | Older permit files can hold as-built drawings |
| [Fondation Le Corbusier](https://www.fondationlecorbusier.fr/collections/centre-de-ressources/) | Le Corbusier's work, about 450,000 digitised documents | Online database ([basecorbu](https://www.fondationlecorbusier.fr/collections/basecorbu/)); consultation by appointment (a person) | Rights managed with ADAGP (credit "© FLC / ADAGP", web images at most 800 px); in copyright until the end of 2035, possibly 2037 for joint works with Pierre Jeanneret | Prepare the list of drawings before the visit |
| [CCA](https://www.cca.qc.ca/en/search) | Architects' archives in Montreal (about 53,000 drawings and 50,000 photographs) | Search without login; visits with two weeks' notice | Rights per item | Includes the Pierre Jeanneret fonds |
| [Internet Archive](https://archive.org/), [HathiTrust](https://www.hathitrust.org/) | Digitised books and journals | `archive.org/advancedsearch.php?…&output=json`, metadata and IIIF manifests; HathiTrust catalogue API | Many books borrow-only; HathiTrust full view only for public-domain works | Check the uploader: AI-generated uploads exist |
| Archives de Paris | Paris building permits | Online topographic search; originals in the reading room | A visit (a person) | Older permit files can hold as-built drawings |

Searching the BAR:

1. Search the building name and its variants separately (`Villa Maraini`, `Villino Maraini`, `Istituto Svizzero Roma`, `Schweizerisches Institut Rom`), then the address, city, responsible federal office and property identifiers (`4978`, `4978 IA`).
2. Check each dossier's title, reference code, creating authority, date span and place in the hierarchy; a surname hit may concern a person.
3. Do not narrow to recent dates too early: modern work may rely on drawings in an older dossier.
4. Record the dossier permalink and reference code; a search-results URL is not provenance. Keep delivered filenames and hashes, and register a delivery as user-supplied archive material until its archival identity is known.

Distinguish sheet dates from revision, scan, PDF export and filename dates; title-block heights can be template values, and facade names can rotate between plan sets. Archive availability does not show that a drawing was executed or is a measured survey, and public access does not grant redistribution.

## Photographs

| Source | Coverage | Product and access | Limits | Comments |
|---|---|---|---|---|
| [BBL Mediendatenbank](https://www.bbl.admin.ch/de/mediendatenbank) | 67 object groups of federal buildings, including embassies | Image pages with originals up to about 5,000 × 8,000 px | © photographer; republishing needs prior written consent | Good reference photographs for the work folder |
| KGS photographs | Objects of the Swiss inventory of cultural property (22 photographs of the Bundeshaus) | `SearchServer` with `features=ch.babs.kulturgueter` returns `bild_url_list` with direct JPG links under `data.geo.admin.ch/ch.babs.kulturgueter/image/` | admin.ch terms, not OGD: view and reference only | No browser needed |
| [EDA representations](https://www.eda.admin.ch/de/die-schweiz-weltweit) | About 170 Swiss embassies, consulates and residences abroad | `https://www.eda.admin.ch/<city>` redirects to the representation page; the [directory PDF](https://www.eda.admin.ch/eda/en/fdfa/representations-and-travel-advice/schweizer-vertretungen-im-ausland.html) lists every address (no coordinates) | Reproduction needs prior written consent; on a 403, retry once with the default client and never spoof a browser | Start here for a site abroad. Building pages from before the relaunch survive in the Wayback Machine (for example the Seoul embassy brochure); other departments publish similar location overviews |
| [Wikimedia Commons](https://commons.wikimedia.org/) | Global | Action API: `generator=geosearch` with `ggsnamespace=6` and `ggsprimary=all` (camera and object positions), categories, `haswbstatement:P180=<Q>` and `nearcoord:` searches; `imageinfo` with `extmetadata` gives URL, author, licence and EXIF date | Licence per file; identifying User-Agent required; about 200 requests a minute, one at a time; obey `Retry-After`; only standard thumbnail widths (…, 1280, 1920, 3840) | The best route for an agent: metadata and original file in one request. Primary coordinates are the camera, secondary the object; strip HTML from `Artist` |
| [Wikidata](https://www.wikidata.org/) | Global | Anonymous API and SPARQL (`wikibase:around`): image (P18), Commons category (P373), coordinates (P625), heritage IDs | CC0; sparse for embassies | Identity and links (Seoul embassy `Q101164340`) |
| [Openverse](https://api.openverse.org/v1/) | Openly licensed images from many sources | Anonymous `GET /v1/images/?q=…&license_type=commercial` with creator, licence and attribution | About 200 requests a day without registration; no coordinates or dates | Second search after Commons |
| [Europeana](https://pro.europeana.eu/page/search) | European libraries, archives and museums | Search API with `qf=TYPE:IMAGE`, `reusability=open`; IIIF manifests | The `api2demo` key is for tests; a free personal key needs an account (a person); rights per item | Archival photographs of European sites |
| [Flickr](https://www.flickr.com/services/api/flickr.photos.search.html) | Global | `flickr.photos.search` by coordinates with licence filter `4,5,7,8,9,10,11,12` | API keys only for paid Pro accounts (a person); licences can change: record licence and date | Use when a person provides a key |
| [Mapillary](https://www.mapillary.com/developer/api-documentation) | Street-level images worldwide | Graph API by bbox (under 0.01 square degrees) with capture date, position and compass angle | Client token from a free account (a person); CC BY-SA 4.0; the terms restrict derivative works and scraping | Street positions and dates; check the terms before using images for geometry |
| Google Street View | Global | Viewer; metadata API with a key | The terms forbid scraping, bulk download and creating 3D models from the imagery | A person may look; never store, trace or use as photogrammetry input |
| [Gallica (BnF)](https://gallica.bnf.fr/) | French library images, including historical photographs | SRU search and IIIF | Blocks non-browser clients: do not spoof; non-commercial reuse with credit | Many Gallica photographs are copied on Commons: reach them there |

| [E-Pics ETH](https://e-pics3.ethz.ch/de/home/) | Image archive of ETH Library (over 1 million images) and the building-history archive (over 340,000) | JavaScript apps; no API or IIIF found | Licence per image (many CC BY-SA or public domain) | Search the ETH-Bibliothek uploads on Commons first; otherwise a person searches |
| [Memobase](https://memobase.ch/) | Swiss audiovisual and photo heritage | JSON-LD records at `https://api.memobase.ch/recordSet/{id}` with `Accept: application/ld+json`; media at media.memobase.ch | Rights per record; search needs a browser | Search in a browser, then fetch the record |
| Owner institution and other galleries | Per building | Website, press images, publications; take exact image URLs from the page HTML | Rights per file; a public page is not a licence; upload dates are not capture dates | Often the only interior photographs |

How an agent works with images:

1. **Find** through pages and APIs that list files with metadata; there is no visual image search. Order: Commons (geosearch, then categories, then Wikidata), Openverse, Europeana, Internet Archive and e-rara; Flickr and Mapillary once a person provides keys.
2. **Download** the original file from a fixed URL list, one folder per source, and register it with `references.py --intake <file> --source <URL>`, so the manifest holds hash, source and rights.
3. **Look** at it in crops and 2048 px page renders; large images are shrunk when viewed. Read EXIF for date, lens and position.
4. **Measure** only through calibration (scale bars, dimension strings, a printed ruler) or a solved camera pose and camera-match, never by eye. Find duplicates by geometric image matching: a crop or resize has a different hash.

For historical photographs, camera matching with [fSpy](https://fspy.io/) for single images and structure from motion with [COLMAP](https://colmap.github.io/) (with GLOMAP) or [Meshroom](https://alicevision.org/) for sets can solve poses; expect only part of an archival set to register, because the camera geometry is unknown.

## Heritage inventories and building history

| Source | Coverage | Product and access | Limits | Comments |
|---|---|---|---|---|
| KGS inventory | About 3,400 objects of national importance (2021 edition) | api3 layer `ch.babs.kulturgueter`; INTERLIS in STAC | admin.ch terms | Each object can have a safeguarding documentation with surveys: a person requests it through the canton |
| ISOS | Sites of national importance | api3 layer `ch.bak.bundesinventar-schuetzenswerte-ortsbilder`; PDFs on gisos.bak.admin.ch | Only the PDFs are legally binding; reuse by request | Site context and protection |
| [BAK Baukultur](https://www.bak.admin.ch/de/baukultur) | Federal Office of Culture: heritage and monument preservation | Static pages with the list of national monuments (PDF), the cantonal heritage offices, expert reports of the federal commission (texts on request) and publications | admin.ch terms | Many of the modelled buildings are documented here |
| Cantonal inventories | Bern Bauinventar (Stadt Bern REST service `map.bern.ch/arcgis/rest/services/Geoportal/Bauinventar/MapServer`), Zurich protected objects (OGD and PDFs on odb.zh.ch), Vaud architectural census | REST, WMS, PDFs | Geoportal extracts are not legally binding; Vaud data for own use only; the Zurich object database needs a login | Dates, architects, alterations and protection status |
| [Kunstdenkmäler der Schweiz online](https://ekds.ch/) | The national art-monument inventory volumes | JavaScript app | Terms not verified | A person searches |
| [POP / Mérimée](https://pop.culture.gouv.fr/) | France | Heritage records with protection dates, history and linked photographs; [open-data exports](https://pop.culture.gouv.fr/donnees-ouvertes) | Text Etalab 2.0 unless stated; images carry their own rights; protection dossiers only on site (a person) | Example: Pavillon Suisse `PA00086613`, with alterations in 1948, 1953 and 1957: choose and record the reconstruction date |
| Korea Heritage Service | South Korea | Open API `http://www.khs.go.kr/cha/SearchKindOpenapiList.do` with coordinates; 3D models and drawings at digital.khs.go.kr after login | Image licence per item; heritage preservation zones around protected sites | Gyeonghuigung and the Seoul City Wall are near the embassy |
| Historical Dictionary of Switzerland, Wikidata, Wayback Machine | General | Public pages and APIs | Per source | Dates and names; the Wayback Machine for retired pages |

## Tours, scans and 3D datasets

| Source | Coverage | Product and access | Limits | Comments |
|---|---|---|---|---|
| geo.admin 3D Tiles | Switzerland: buildings, vegetation, names, terrain | `https://3d.geo.admin.ch/ch.swisstopo.swissbuildings3d.3d/v1/tileset.json` and the same pattern for `ch.swisstopo.vegetation.3d` and `ch.swisstopo.terrain.3d` | Viewer data; terms not stated | Quick context; prefer the STAC source files for geometry |
| City and cantonal 3D models | Stadt Zürich LoD2 roofs (2011–2018) and historical city models, Geneva "Couverts 3D", Lucerne 3D buildings | DXF, GPKG, GDB through opendata.swiss | Open, terms per dataset | Finer local context than swissBUILDINGS3D |
| Public 360° and Matterport tours | Per building | Viewer in the browser; panoramas only through a separate download pipeline | Viewing is not a reuse licence; some need prior written consent | Von Wattenwyl-Haus documents the route in its folder |
| [Open Heritage 3D](https://openheritage3d.org/data) | Selected heritage sites, also CyArk's open data | LiDAR and photogrammetry point clouds and meshes (about 25 GB a site); request form per DOI, links by email | A person supplies a real inbox; licence per dataset, mostly non-commercial | San Marino: Mount Titano (10.26301/296p-dn53), La Cesta (10.26301/2h6g-jz80); check georeferencing and formats before choosing a workflow |
| [Sketchfab](https://sketchfab.com/) | User-made 3D models | Search API without login (`api.sketchfab.com/v3/search?type=models&downloadable=true&license=by&categories=architecture`) | Download needs an account token (a person); unknown provenance; owned by KitBash since August 2026 | Reference only; never evidence |
| Europeana 3D | European heritage 3D items | Search API with `qf=TYPE:3D` | Often only a link to the provider's viewer | Check rights per item |
| S-Map Seoul | Seoul 3D digital twin (2024 capture) | Browser viewer only | All rights reserved; no download | Visual reference only |

## Import tools

| Source | Coverage | Product and access | Limits | Comments |
|---|---|---|---|---|
| Scripted GIS | Any raster and vector data | PyProj and Rasterio to clip and reproject; the modelling engine builds terrain, context masses and tagged meshes by script (Revit toposolids and masses through pyRevit, Blender Python) | Needs explicit snapshots, transforms and checks | Preferred: reproducible and fits the release process |
| [BlenderGIS](https://github.com/domlysz/BlenderGIS) | GeoTIFF DEM, shapefile, OSM XML | Open-source Blender add-on ([releases](https://github.com/domlysz/BlenderGIS/releases)) | Its OpenTopography service needs an API key; test with the project's Blender build | An add-on does not establish accuracy or data rights |
| [Blosm](https://github.com/vvoovv/blosm) | OSM buildings, roads, about 30 m terrain | Blender add-on through Gumroad; Pro adds appearance features | Check actual OSM height coverage | Add-on availability is separate from each data service's terms |

## Using context data in the model

- Keep terrain and neighbouring buildings in separate context sets, with the `terrain` role for terrain ([viewer guide](viewer.md#categories-and-object-properties)); preserve the building's geometry and IDs when adding the site.
- Credit the sources in the building's About page and distinguish context from reconstructed architecture.
- Review coverage and nodata, normals, footprint placement, inferred heights, duplicates and the ground-to-building junction; check walking collision separately from appearance.
- Run architectural Dollhouse and furniture checks on the building only, since neighbours have no floor membership; include context in hygiene and coplanar checks.
- Re-run GLB, BIM and IFC validation after a context change, and release a new version.

## Frames and rights

- **Swiss frames.** swisstopo products are LV95 (EPSG:2056) with LN02 heights. Drawings in "m ü. M." are usually LN02; record that assumption. Convert with [REFRAME](https://www.swisstopo.admin.ch/en/coordinate-conversion-reframe) (`geodesy.geo.admin.ch/reframe/…`: `lv03tolv95`, `ln02tolhn95`, `lv95towgs84`), never by constant offsets: LV03 to LV95 differed by 6–7 cm and LN02 to LHN95 by −4 cm at the Bundeshaus. A Revit project's "true north" is grid north unless a GIS coordinate system is set.
- **Open data.** swisstopo data has been free since 1 March 2021, including commercial use, with the credit "© swisstopo". Other publishers state their own licence; admin.ch content and archive scans without a stated licence need prior written consent to reproduce.
- **3D models of buildings.** Swiss panorama freedom (URG Art. 27) allows depicting a work on public ground in two dimensions, not in three. A building whose architect died less than 70 years ago can still be a protected work, so publishing its 3D reconstruction is the owner's decision. Abroad it is stricter: France's exception covers only private non-commercial use; Italy has no panorama freedom and its Cultural Heritage Code requires authorisation for commercial reproduction of cultural property; South Korea excludes reproduction for sale. Le Corbusier's works stay protected until the end of 2035.
- **Photographs.** Since 1 April 2020, photographs without individual character are protected for 50 years from creation. Rights are recorded per file; unknown stays unknown.
- **Not published:** owner correspondence, BBL internal plan contents, anything excluded for security, third-party imagery without a licence, and screenshots of streamed services.

## Example requests

All returned data on 14 October 2026; replace the coordinates, IDs and bbox for another building.

Switzerland (Bundeshaus, EGID 2242547):

```text
https://api3.geo.admin.ch/rest/services/ech/SearchServer?searchText=Bundesplatz%203%20Bern&type=locations&sr=2056&limit=3
https://api3.geo.admin.ch/rest/services/ech/MapServer/find?layer=ch.bfs.gebaeude_wohnungs_register&searchField=egid&searchText=2242547&contains=false&returnGeometry=false
https://api3.geo.admin.ch/rest/services/ech/MapServer/identify?geometryType=esriGeometryPoint&geometry=2600430,1199460&sr=2056&imageDisplay=0,0,0&mapExtent=0,0,0,0&tolerance=0&layers=all:ch.swisstopo-vd.amtliche-vermessung&returnGeometry=false
https://geodienste.ch/db/av_0/deu?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=ms:LCSF&BBOX=2600380,1199440,2600470,1199520,urn:ogc:def:crs:EPSG::2056&OUTPUTFORMAT=geojson
https://data.geo.admin.ch/api/stac/v1/search?collections=ch.swisstopo.swissimage-dop10,ch.swisstopo.swissalti3d&bbox=7.4435,46.9463,7.4450,46.9472&datetime=2024-01-01T00:00:00Z/..
https://data.geo.admin.ch/api/stac/v1/collections/ch.swisstopo.lubis-luftbilder_schraegaufnahmen/items?bbox=7.4435,46.9463,7.4450,46.9472
https://wms.geo.admin.ch/?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=ch.swisstopo.swissimage&STYLES=&CRS=EPSG:2056&BBOX=2600300,1199350,2600550,1199600&WIDTH=2500&HEIGHT=2500&FORMAT=image/jpeg
https://wms.geo.admin.ch/?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=ch.swisstopo.swissimage-product&TIME=1946&STYLES=&CRS=EPSG:2056&BBOX=2600300,1199350,2600550,1199600&WIDTH=2500&HEIGHT=2500&FORMAT=image/jpeg
https://api3.geo.admin.ch/rest/services/ech/SearchServer?features=ch.babs.kulturgueter&type=featuresearch&searchText=Bundeshaus
https://geodesy.geo.admin.ch/reframe/lv95towgs84?easting=2600426.92&northing=1199490.255&altitude=540&format=json
https://ckan.opendata.swiss/api/3/action/package_search?q=Orthofoto&rows=20
https://www.e-rara.ch/i3f/v20/198/manifest
```

The SWISSIMAGE requests ask for 250 m in 2500 px, so one pixel is 0.1 m; the second returns the 1946 state of the same area.

France (Pavillon Suisse):

```text
https://nominatim.openstreetmap.org/search?q=Pavillon%20Suisse%2C%207%20Boulevard%20Jourdan%2C%20Paris&format=jsonv2&limit=3
https://data.geopf.fr/wfs/ows?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=BDTOPO_V3:batiment&BBOX=48.8178,2.3415,48.8185,2.3428,urn:ogc:def:crs:EPSG::4326&OUTPUTFORMAT=application/json&COUNT=50
https://data.geopf.fr/wfs/ows?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=IGNF_LIDAR-HD_METADONNEE:metadata&BBOX=48.817,2.341,48.819,2.343,urn:ogc:def:crs:EPSG::4326&OUTPUTFORMAT=application/json
https://data.geopf.fr/wfs/ows?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=pva:image&BBOX=651300,6857400,651500,6857600,urn:ogc:def:crs:EPSG::2154&OUTPUTFORMAT=application/json&COUNT=400
https://rnb-api.beta.gouv.fr/api/alpha/buildings/637SNR6WD9E9/
```

Photographs and abroad:

```text
https://commons.wikimedia.org/w/api.php?action=query&format=json&formatversion=2&maxlag=5&generator=geosearch&ggscoord=48.81812%7C2.34216&ggsradius=200&ggsnamespace=6&ggsprimary=all&ggslimit=50&prop=imageinfo%7Ccoordinates&coprimary=all&iiprop=url%7Csize%7Cextmetadata&iiurlwidth=1280
https://api.openverse.org/v1/images/?q=Pavillon%20Suisse%20Le%20Corbusier&license_type=commercial&page_size=20
https://www.eda.admin.ch/seoul
https://dodis.ch/search?q=Villa%20Maraini&c=Document
```

Europe:

```text
https://data.europa.eu/api/hub/search/search?q=ortofoto&filter=dataset&facets=%7B%22country%22%3A%5B%22it%22%5D%7D&bboxMinLon=12.48&bboxMaxLon=12.50&bboxMinLat=41.90&bboxMaxLat=41.91&limit=5
```

Send an identifying User-Agent with every scripted request; opendata.swiss and the OSM services refuse anonymous library defaults.
