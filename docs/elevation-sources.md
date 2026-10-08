# Free elevation sources: Italy and global fallbacks

[New reconstruction guide](adding-a-building.md) · [Frames and units](conventions.md#frames-and-units) · [Blender terrain and surroundings](terrain-and-surroundings.md)

For current Italian catalogue routes, cadastral maps, roof vectors and tested coverage gaps, see [Italian geodata discovery](italian-geodata.md). The user-linked Lazio 1 m LiDAR DTM was tested directly: the service renders the Tiber corridor but returns NoData at Villa Maraini. Its broad catalogue extent does not establish site coverage.

Research checked 8 October 2026 for Villa Maraini, Rome. Lazio tile374062 and a TINITALY WCS subset were subsequently acquired and compared. Lazio's grid is used for approximate v002 context after technical-map corroboration; no absolute floor datum or survey control is asserted. See [terrain acquisition lessons](terrain-and-surroundings.md#villa-maraini-acquisition-lessons). Other entries remain leads.

| Source | Product and access | Useful scope / limits |
|---|---|---|
| [Regione Lazio, Rome CTRN 2002](https://dati.lazio.it/dataset/carta-tecnica-regionale-2002-2003-5k-roma) | 5 m DTM in DXF; [DTM resource](https://dati.lazio.it/dataset/carta-tecnica-regionale-2002-2003-5k-roma/resource/df8dea52-9982-4429-883d-dafa0e361ab6) states CC BY 4.0; select tiles from the index | Tile374062 acquired and used for approximate Villa Maraini context. Preserve full Gauss–Boaga index WKT. Old data, not current landscaping; absolute vertical datum/floor tie unresolved. |
| [TINITALY 1.1, INGV](https://tinitaly.pi.ingv.it/) | Italy-wide bare-ground DTM, 10 m GeoTIFF, WGS84/UTM 32; [public download index](https://tinitaly.pi.ingv.it/Download_Area1_1.html); CC BY 4.0 with dataset citation | National fallback. January 2023 is the version release, not a nationwide survey date. Check underlying sources and vertical reference. |
| [MASE / national geodata catalogue](https://geodati.gov.it/) | Search PST-A LiDAR DTM: Lazio 1 m river corridors, 2 m coastal strip | Potential fine data, **not confirmed at Villa Maraini**. A regional title does not establish full coverage. Verify footprint, live service and licence. |
| [Copernicus DEM](https://dataspace.copernicus.eu/explore-data/data-collections/copernicus-contributing-missions/collections-description/COP-DEM) | Global GLO-30/GLO-90 **DSM**, 30/90 m; WGS84 horizontal, EGM2008 vertical per [handbook](https://dataspace.copernicus.eu/sites/default/files/media/files/2024-06/geo1988-copernicusdem-spe-002_producthandbook_i5.0.pdf) | Distant context; includes buildings and vegetation. CDSE uses CCM registration; the [30 m view service changed in August 2026](https://dataspace.copernicus.eu/news/2026-8-25-copernicus-dem-30m-view-service-update). |
| [Copernicus DEM on AWS Open Data](https://registry.opendata.aws/copernicus-dem/) | Anonymous COG distribution of the 2021 global release under its stated terms | Useful separate access route; record distribution/version and check the selected tile. Anonymous AWS availability does not imply all CDSE services are anonymous. |
| [USGS/NASA SRTM 1 arc-second](https://www.usgs.gov/centers/eros/science/usgs-eros-archive-digital-elevation-shuttle-radar-topography-mission-srtm) | Approximately 30 m radar elevation, February 2000; WGS84 / EGM96; EarthExplorer/NASA routes | Older comparison/fallback. Account requirements vary by route. Do not mix EGM96 values directly with EGM2008 or local plan zero. |

For other countries, begin with municipal/regional/national mapping authorities and catalogue footprints, then use a global source when suitable. The [Lazio archive guide](https://regione.lazio.it/cittadini/urbanistica/sistema-informativo-territoriale-regionale/consultazione-archivi) also lists newer cartography; verify actual elevation products instead of assuming a newer map includes a newer DTM.

1. Use an identified visitor pin to discover coverage; keep it separate from building control.
2. Select the smallest relevant area. Record publisher, product/version, acquisition/release dates, horizontal CRS, vertical datum/geoid, units, grid spacing, nodata, tile bounds and licence.
3. Distinguish **DTM** (ground) from **DSM** (surface including objects). Grid spacing is not vertical accuracy; resampling adds no measured detail.
4. Save raw geodata and metadata privately under `work/research/geodata/` or re-downloadable `work/downloads/`, with acquisition records in research. These do not belong among architectural reference photographs/drawings.
5. Check known spot heights/streets and independent building controls. Record transformations and residuals before placing plans onto terrain.
6. Use coarse terrain for context only. Steps, retaining walls, grottoes, floor levels and roof planes require finer survey/drawing evidence. Never force a terrain sample to explain an unresolved printed altitude.
7. If the service needs a login or request, prepare exact product identifiers and an area of interest for a human collaborator. Discovery, authentication, successful download and redistribution rights are separate checks.

## Paid fallback after public data gaps

[Maxar/Vantor Vivid Terrain](https://developers.maxar.com/docs/ordering/guides/3d-ordering) offers finer DTM/DSM products, but verify the exact site and quote before committing. Villa Maraini's anonymous Discovery check returned 401; global marketing coverage is not point-level coverage evidence. The approximately 10 km² minimum is much larger than a single 600 m study square (0.36 km²). Hub quotes depend on account-specific credit rates, not a verified public currency tariff. A human can request a sample, acquisition date, vertical datum, void mask, one-off price and rights for derived Blender/GLB delivery. Keep Vivid Terrain and the separate WorldView 3D processing workflow distinct. Private detailed audit: `reconstructions/villa-maraini/work/research/maxar-elevation-assessment.md`.
