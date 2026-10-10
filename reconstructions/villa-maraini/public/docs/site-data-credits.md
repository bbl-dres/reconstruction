# Villa Maraini site data

Acquired 8 October 2026. Approximate historical context; no current survey is claimed.

**Terrain:** Regione Lazio, 2002 Carta Tecnica Regionale Numerica scala 1:5.000 — Provincia di Roma, DTM 5 mt DXF tile 374062. [Dataset and resource metadata](https://dati.lazio.it/dataset/carta-tecnica-regionale-2002-2003-5k-roma), resource `df8dea52-9982-4429-883d-dafa0e361ab6`, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Changes: clipped to about 600 m, transformed to the architectural local frame, triangulated at the native 5 m spacing, coloured and given a small building clearance. The vertical translation is a provisional display assumption, not a measured floor tie. No original map artwork or aerial imagery is reproduced.

**Roads and building footprints:** © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), [Open Database License](https://opendatacommons.org/licenses/odbl/1-0/). Extract bbox `12.483,41.903,12.492,41.910` on 8 October 2026. Main villa reference way [200170131](https://www.openstreetmap.org/way/200170131). Source [OSM API map request](https://api.openstreetmap.org/api/0.6/map?bbox=12.483,41.903,12.492,41.910). Changes: subset/transformed footprints, class-based road-width assumptions and terrain draping. Five storey-count-based masses assume 3 m/storey; one unmatched outline retains the owner's 10 m display default. Roof forms are schematic.

**99 inferred neighbouring heights:** Zhu, X. X., Chen, S., Zhang, F., Shi, Y. and Wang, Y. (2025), [GlobalBuildingAtlas](https://doi.org/10.5194/essd-17-6647-2025), [GBA.LoD1](https://huggingface.co/datasets/zhu-xlab/GBA.LoD1), tile `europe/e010_n45_e015_n40`, [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/). Changes: selected predictions transferred to matching OSM footprints and extruded above the existing ground bases. Separate [ODbL source polygons](https://huggingface.co/datasets/zhu-xlab/GBA.ODbLPolygon) were used to check correspondence. Heights are machine-learning estimates, not measured elevations. This locally prepared experiment is not cleared for commercial use or redistribution under unrestricted repository terms; the source components retain their respective licences. No external deployment was performed.

**Comparison only:** Tarquini S., I. Isola, M. Favalli, A. Battistini, G. Dotta (2023), TINITALY, a digital elevation model of Italy with a 10 meters cell size, Version 1.1. INGV. [DOI:10.13127/tinitaly/1.1](https://doi.org/10.13127/tinitaly/1.1), CC BY 4.0. Not used for the rendered ground. Lazio's technical map corroborated the local hill after a substantial disagreement between the two grids.

Detailed data snapshots, hashes, transformations and checks are retained in the private building work folder. Geometry is an interpretation; the source providers do not endorse the reconstruction.

## v004 observed garden path

The garden-path boundary is traced from AGEA2020 orthophotography, supplied by Regione Lazio through Roma Capitale GeoServer, CC BY4.0. Source: https://geoportale.regione.lazio.it/catalogue/csw_to_extra_format/r_lazio%3A92b0f7e3-3b75-4feb-ac5e-2382/ortofoto-agea-v-2020.html . Modifications:22 boundary picks transformed with the existing local registration; polygon draped on the unchanged2002 DTM; overlapping OSM paving removed. Requested image spacing0.30m is not a survey accuracy claim. No photograph/orthophoto pixels are included in the model.

## v008 local garden construction

The villa's local garden and entrance use an inferred relative calibration of the HMQ site section against archival villa controls. Source drawings and photographs remain private evidence and are not embedded as textures. The bounded garden patch replaces the older DTM drape; regional terrain and roads outside the patch remain unchanged, as do all neighbouring masses. The AGEA path retains its observed outline while its Z values follow the local garden control. Slabs, stairs, retaining construction and guards are authored separately. Transverse grades, guard/pier rhythm, thicknesses and the transition to the regional DTM are study assumptions. No absolute vertical datum or complete ramp/stair route is established.

## v010 site and context correction

OpenStreetMap contributors (ODbL) supply ways, multipolygon relations and building parts from the saved8October2026 extract.26 relations add32 courtyards.22 new heights are matched GlobalBuildingAtlas predictions (CC BY-NC4.0); one OSM height and three storey conventions take precedence.17 Palazzo parts use OSM levels times3m. The new GBA acquisition verifies exact byte ranges and hashes, not a complete586MB height-table checksum. Regional Lazio2002 terrain and AGEA2020 orthophoto attribution above remain applicable. Source images remain private research; route grades, retaining profiles and local ground transitions are inferred. No geographic datum or code compliance is established.

## v012 street and context elevations

Regione Lazio CTRN 1:5,000 vector tile 374062, 2002 aerial photography / 2005 restitution, CC BY 4.0, supplies classified ordinary-road edges and road-axis spot heights. [Official vector resource](https://geoportale.regione.lazio.it/cartografia/files/2002_2003_CTRN_5K_DXF/Roma/374062_plt.zip). Changes: transformed source observations, local interpolation and corridor blending; road normal repair; no absolute datum calibration. Retaining heads and roofs are not treated as ground. Retained OSM road plan outlines use assumed widths.

Owner-transcribed whole-metre Google Earth observations corroborate street levels and constrain 15 matched roof masses; historical official eaves/division lines help distinguish roof parts. Photogrammetric surfaces, quantization and differing epochs limit accuracy. No Google imagery or tile meshes are embedded in exports. Other neighboring roofs retain their earlier OSM/GBA attribution and restrictions. Local garden grades, route details and wall profiles remain inferred construction.

## v013 enclosure, trees and neighboring compound

Owner-supplied Street View and Earth screenshots inform qualitative architectural interpretation only; no image textures or map meshes are exported. AGEA 2020 crown observations guide approximate street-tree stations. Casino dell’Aurora compound geometry uses the retained OpenStreetMap garden footprint and classified Lazio CTRN retaining-head/spot evidence; the sparse garden surface and massive wall depth are inferred. Earlier OSM, Lazio and GBA credits and reuse restrictions continue to apply.

## v013 audit corrections (neighbouring outlines, registration evidence)

Roma Capitale open geoportal WFS layer `REGLAZ:CostruzioniVolumiCTRN` (building volumes of the regional technical map, CC BY 4.0, https://geoportale.comune.roma.it/) and the Regione Lazio CTRN 1:5,000 DXF sheet 374062 (2002 photography / 2005 restitution, CC BY 4.0; the original drawing carries an older reproduction notice that is retained in the private source record) supplied the classified building outlines used to register the villa, the Portineria and the corner Dependance, and the rigid correction applied to the neighbouring OpenStreetMap masses (−0.006°, +0.93 m / +0.52 m in the local frame; the Dependance and the Casino dell'Aurora compound keep their own controls). No map geometry is copied into the public model; neighbouring masses remain schematic OSM/GlobalBuildingAtlas volumes with their earlier attribution and CC BY-NC restriction. Owner-supplied Street View captures (2015–2025) informed only qualitative checks of walls, gates and the Portineria street front.

### Garden plan 778 (undated, hand-drawn) — positional use only (v013)

The undated garden layout sheet of the Istituto Svizzero (ref-38b80072d29e6fde, local reference, not published) was used at the owner's instruction for three things only: the relation of the lodge to the Via Ludovisi perimeter wall, the positions of the garden staircases, and the carriage drive from the gate along Via Cadore and Via Liguria to the former stables. It is a hand drawing; its positions were read through a similarity fit to the villa footprint (0.32 m RMS at the villa, 1–3 m at the enclosure) and snapped to the modelled walls, court and drive. Levels of the added features come from the HMQ section (lower apron −4.50 ± 0.7 m) and the municipal retaining-head line, not from the plan. All added pieces are placeholders marked `inferred`.
