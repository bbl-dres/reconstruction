# Candidates for additional reconstructions

Research checked on **8 October 2026**. This shortlist follows the repository's two approaches: evidence-based, AI-authored architectural/BIM models and photographic Gaussian splats. Local surveys around Bern and Zürich can supplement public material.

The initial screening used the 3,936 asset records in `out_Gebäude Stammdaten.xlsx` (worksheet `Gebaeude`), followed by public-source research on selected promising buildings. The records include infrastructure and ancillary assets; they are not 3,936 distinct buildings. Portfolio IDs below come from that supplied workbook. This is a selective feasibility shortlist, not a complete audit of every portfolio asset.

Rankings and proposed first scopes are research judgments. A public tour is not automatically a downloadable training dataset, and public visitor access does not establish permission for systematic capture or publication. Neither raw tour exports nor the external dataset archives have been tested.

## Recommended starting points

- **Next complete portfolio reconstruction:** Sammlung Oskar Reinhart «Am Römerholz», combining published drawings with local observations.
- **Small Bern BIM-versus-splat pilot:** Bellevue Palace lobby and one salon.
- **Existing panorama feasibility study:** Château de Prangins or Centre Dürrenmatt.
- **Overseas BIM from public architectural material:** Swiss Embassy in Seoul.
- **Outdoor survey near Zürich:** Amphitheater Vindonissa, initially one gate and adjoining masonry.
- **Time-sensitive capture:** Swiss National Library reading room before its relocation closure on **30 October 2026 at 18:00**, subject to arranging access.

## Geocoded locations

Coordinates checked on **8 October 2026**, in **WGS84 / EPSG:4326**, listed as latitude, longitude. This covers the shortlist and reserve below, not all 3,936 workbook records. Google Maps links use the displayed coordinates.

Swiss buildings with a supplied EGID were matched through the swisstopo API's GWR layer (`ch.bfs.gebaeude_wohnungs_register`), with exact EGID matching and the workbook address used to choose between entrances. The linked EGIDs reproduce the API requests. These are returned building/entrance points, not surveyed footprints. Vindonissa uses a named-site point because no EGID was supplied and the workbook address did not produce an exact address match. Overseas coordinates are approximate site pins from the linked sources; they were not obtained from swisstopo. Decimal precision does not establish positional accuracy.

| Candidate | Portfolio ID | EGID / coordinate source | Matched address or point type | Latitude | Longitude | Google Maps |
|---|---|---|---|---:|---:|---|
| Römerholz, Winterthur | `1086/3408/SR` | [1150994](https://api3.geo.admin.ch/rest/services/ech/MapServer/find?layer=ch.bfs.gebaeude_wohnungs_register&searchField=egid&searchText=1150994&contains=false&sr=4326&returnGeometry=true) | Haldenstrasse 95 | 47.511305 | 8.731823 | [Map](https://www.google.com/maps/search/?api=1&query=47.511305%2C8.731823) |
| Château de Prangins | `1086/5158/AA` | [9035556](https://api3.geo.admin.ch/rest/services/ech/MapServer/find?layer=ch.bfs.gebaeude_wohnungs_register&searchField=egid&searchText=9035556&contains=false&sr=4326&returnGeometry=true) | Avenue du Général-Guiguer 3 | 46.394153 | 6.251977 | [Map](https://www.google.com/maps/search/?api=1&query=46.394153%2C6.251977) |
| Bellevue Palace, Bern | `1086/5845/HB` | [1230565](https://api3.geo.admin.ch/rest/services/ech/MapServer/find?layer=ch.bfs.gebaeude_wohnungs_register&searchField=egid&searchText=1230565&contains=false&sr=4326&returnGeometry=true) | Kochergasse 5 | 46.946704 | 7.446610 | [Map](https://www.google.com/maps/search/?api=1&query=46.946704%2C7.446610) |
| Centre Dürrenmatt — house / administration | `1086/7286/AA` | [1479919](https://api3.geo.admin.ch/rest/services/ech/MapServer/find?layer=ch.bfs.gebaeude_wohnungs_register&searchField=egid&searchText=1479919&contains=false&sr=4326&returnGeometry=true) | Chemin du Pertuis-du-Sault 74 | 47.001231 | 6.936401 | [Map](https://www.google.com/maps/search/?api=1&query=47.001231%2C6.936401) |
| Centre Dürrenmatt — exhibition building | `1086/7286/AB` | [502357084](https://api3.geo.admin.ch/rest/services/ech/MapServer/find?layer=ch.bfs.gebaeude_wohnungs_register&searchField=egid&searchText=502357084&contains=false&sr=4326&returnGeometry=true) | Chemin du Pertuis-du-Sault 74.1 | 47.001135 | 6.936349 | [Map](https://www.google.com/maps/search/?api=1&query=47.001135%2C6.936349) |
| Landesmuseum Zürich | `1086/3667/LM` | [2372933](https://api3.geo.admin.ch/rest/services/ech/MapServer/find?layer=ch.bfs.gebaeude_wohnungs_register&searchField=egid&searchText=2372933&contains=false&sr=4326&returnGeometry=true) | Museumstrasse 2 | 47.379024 | 8.540567 | [Map](https://www.google.com/maps/search/?api=1&query=47.379024%2C8.540567) |
| Kloster Sankt Georgen, Stein am Rhein | `1086/6114/KS` | [191331950](https://api3.geo.admin.ch/rest/services/ech/MapServer/find?layer=ch.bfs.gebaeude_wohnungs_register&searchField=egid&searchText=191331950&contains=false&sr=4326&returnGeometry=true) | Chlosterhof 9 | 47.658457 | 8.860235 | [Map](https://www.google.com/maps/search/?api=1&query=47.658457%2C8.860235) |
| Swiss National Library, Bern | `1086/2025/LB` | [1236008](https://api3.geo.admin.ch/rest/services/ech/MapServer/find?layer=ch.bfs.gebaeude_wohnungs_register&searchField=egid&searchText=1236008&contains=false&sr=4326&returnGeometry=true) | Hallwylstrasse 15 | 46.941216 | 7.449761 | [Map](https://www.google.com/maps/search/?api=1&query=46.941216%2C7.449761) |
| Amphitheater Vindonissa, Windisch | `1086/3587/AT` | [swisstopo gazetteer](https://api3.geo.admin.ch/rest/services/ech/SearchServer?type=locations&origins=gazetteer&searchText=Amphitheater%20Windisch&sr=4326&limit=5) | Named site: Römisches Amphitheater; no EGID | 47.476345 | 8.213273 | [Map](https://www.google.com/maps/search/?api=1&query=47.476345%2C8.213273) |
| Swiss Embassy, Seoul | `1086/3794/KC; 1086/3794/RB` | [EmbassyFinder](https://embassyfinder.org/switzerland-in-south-korea/seoul) | 77 Songwol-gil, Jongno-gu; shared site pin for both records | 37.570207 | 126.965268 | [Map](https://www.google.com/maps/search/?api=1&query=37.570207%2C126.965268) |
| Pavillon Suisse, Paris | `1086/5294/CU` | [Mapcarta / OpenStreetMap](https://mapcarta.com/W32530611) | Pavillon Suisse building, CIUP; approximate site pin | 48.818120 | 2.342160 | [Map](https://www.google.com/maps/search/?api=1&query=48.818120%2C2.342160) |
| Villa Maraini, Rome (reserve) | `1086/4978/IA` | [Turismo Roma](https://www.turismoroma.it/it/node/2150) | Via Ludovisi 48; tourism location point | 41.906773 | 12.487714 | [Map](https://www.google.com/maps/search/?api=1&query=41.906773%2C12.487714) |
| La Cesta, San Marino (external dataset) | — | [Wikimedia Commons](https://commons.wikimedia.org/wiki/Category:Cesta_Tower) | Tower site; converted from source DMS coordinates | 43.932800 | 12.451500 | [Map](https://www.google.com/maps/search/?api=1&query=43.932800%2C12.451500) |
| Basilica di San Marino & Chiesa di San Pietro (external dataset) | — | [Mapcarta / OpenStreetMap](https://mapcarta.com/W59305134) | Representative basilica pin for the combined dataset; not a separate San Pietro entrance | 43.937130 | 12.446710 | [Map](https://www.google.com/maps/search/?api=1&query=43.937130%2C12.446710) |

Matching notes:

- **Centre Dürrenmatt:** Both workbook records use number 74. GWR distinguishes the exhibition building as **74.1**, with its own EGID and point.
- **Kloster Sankt Georgen:** The workbook says **Chloster 9**; the EGID resolves to **Chlosterhof 9**.
- **Bellevue Palace and National Library:** GWR returns multiple entrance records for these EGIDs. The table selects **Kochergasse 5** and **Hallwylstrasse 15**, respectively.
- **Vindonissa:** The workbook says **Arenastrasse 20**. Nearby fuzzy address results were rejected; the named archaeological-site match is used instead.
- **Paris:** The workbook's postcode **75007** conflicts with the site's location in the 14th arrondissement. The pin identifies the named Pavillon Suisse building, rather than accepting that postcode.
- **Seoul:** The [official embassy contact page](https://www.fdfa.admin.ch/countries/korea-republic/en/home/services/links.html/content/contacts/en/EDAVis/S/154) confirms 77 Songwol-gil. The coordinates are from the secondary source linked in the table and do not distinguish the chancery and residence.
- **National Library:** The pin refers to the portfolio building on Hallwylstrasse, not the temporary premises used after relocation.

API references: [Find features by attribute](https://docs.geo.admin.ch/access-data/find-features.html) and [Search locations](https://docs.geo.admin.ch/access-data/search.html). For a repeat lookup, request `sr=4326`; GWR geometry `x` is longitude and `y` is latitude. SearchServer supplies explicit `lat` and `lon` attributes.

## Portfolio shortlist

### 1. Sammlung Oskar Reinhart «Am Römerholz», Winterthur

- **Portfolio ID:** `1086/3408/SR`
- **Public evidence:** BBL's renovation document contains ground-floor and basement plans, a section, room names, and photographs. The museum reopened in May 2026.
- **Recommended method:** BIM plus supplementary local survey; a separate splat of selected rooms could provide a comparison.
- **First scope:** Public ground floor of the villa and its gallery connection.
- **Outstanding checks:** The drawings describe the 2010 renovation; compare them with today's arrangement. Agree interior capture with the museum.
- **Sources:** [BBL drawings and photographs](https://www.bbl.admin.ch/dam/de/sd-web/J0CtjBU3FYIA/20101001_Winterthur%20Sammlung%20Oskar%20Reinhart%20Am%20R%C3%B6merholz%20Erneuerung_DE.pdf); [visitor access and reopening](https://www.roemerholz.ch/de/regulaere-offnungszeiten).

### 2. Château de Prangins, Vaud

- **Portfolio ID:** `1086/5158/AA`
- **Public evidence:** Several official virtual visits and BBL renovation documentation. The **Indiennes** panorama tour was opened in a browser and rendered interior views, including the timber roof structure.
- **Recommended method:** Architectural/BIM reconstruction, with a separate splat feasibility study for the documented exhibition rooms.
- **First scope:** A connected group of rooms covered by the working tour; expand the architectural model as geometric evidence becomes available.
- **Outstanding checks:** The advertised **Noblesse oblige** tour link redirected to a missing page when checked. Tour coverage is partial; image resolution, camera positions, raw export availability, reuse permission, and scaled drawing coverage remain unverified.
- **Sources:** [Official digital visits](https://www.chateaudeprangins.ch/fr/expositions/digital/chateau-de-prangins-digital); [working Indiennes tour](https://virtuell.chateaudeprangins.ch/2021_Indiennes/); [BBL construction documentation, including Prangins](https://www.bbl.admin.ch/de/bautendokumentationen).

### 3. Bellevue Palace, Bern

- **Portfolio ID:** `1086/5845/HB`
- **Public evidence:** The hotel publishes function-room plans and length, width, and height measurements, supported by room and lobby imagery. Salon Royal is listed as **24.8 × 12 × 5.05 m**.
- **Recommended method:** A small BIM model and a survey-based splat of the same space.
- **First scope:** Lobby and one adjoining salon, rather than the whole hotel.
- **Outstanding checks:** Arrange a quiet capture session. Hospitality access does not establish permission for a systematic survey. No usable public 360 training dataset was confirmed.
- **Source:** [Official room specifications and floor-plan links](https://www.bellevue-palace.ch/en/meetings-and-conferences/).

### 4. Centre Dürrenmatt, Neuchâtel

- **Portfolio IDs:** `1086/7286/AA`, `1086/7286/AB`
- **Public evidence:** The official site provides a virtual-museum viewer, several exhibition tours, and documentation of Mario Botta's architecture. The permanent-exhibition viewer loaded in a browser.
- **Recommended method:** Small interior splat feasibility study; later architectural/BIM reconstruction of the house and museum extension.
- **First scope:** Main exhibition hall.
- **Outstanding checks:** Panorama count, spacing, resolution, camera poses, export availability, and reuse permission remain unverified. Locate scaled drawings before committing to a detailed BIM model.
- **Sources:** [Official virtual visits](https://www.cdn.ch/de/virtuelle-rundgaenge); [permanent-exhibition viewer](https://ead.nb.admin.ch/museevirtuel/Expositionpermanente/index.htm); [architecture](https://www.cdn.ch/en/architecture-2).

### 5. Swiss Embassy, Seoul

- **Portfolio IDs:** `1086/3794/KC`, `1086/3794/RB`
- **Public evidence:** The architect publishes project plans and extensive architectural photography. BBL publishes a substantial construction dossier.
- **Recommended method:** AI-authored architectural/BIM model. The courtyard composition and repeated façade elements are promising for parametric modelling.
- **First scope:** Documented envelope, courtyard, and representative interiors shown in public sources.
- **Outstanding checks:** Confirm drawing scale and coverage. No usable public splat dataset or walkthrough was confirmed; unseen areas would require explicit inference or additional evidence.
- **Sources:** [Burckhardt project, photographs, and drawings](https://burckhardt.swiss/fr/project/lambassade-de-suisse-seoul/); [BBL construction documentation, including Seoul](https://www.bbl.admin.ch/de/bautendokumentationen).

### 6. Landesmuseum Zürich

- **Portfolio ID:** `1086/3667/LM`
- **Public evidence:** BBL renovation and extension dossiers, architectural photographs, and an official architecture guide containing a museum plan.
- **Recommended method:** BIM with supplementary local photography; selected interiors could become separate splats.
- **First scope:** Courtyard and new wing, or one historic interior suite.
- **Outstanding checks:** The entire complex is a large undertaking. The verified advertised virtual guided tour is a **live Zoom tour**, not a downloadable capture dataset. Agree systematic interior capture separately.
- **Sources:** [Architecture and building-history guide](https://www.landesmuseum.ch/landesmuseum/ihr-besuch/schulen/allgemein/das-landesmuseum.-architektur-und-baugeschichte/200824_su_architektur_baugeschichte_download.pdf); [BBL dossiers](https://www.bbl.admin.ch/de/bautendokumentationen); [live virtual-tour description](https://www.landesmuseum.ch/virtuelle-fuehrungen).

### 7. Pavillon Suisse / Fondation Suisse, Paris

- **Portfolio ID:** `1086/5294/CU`
- **Public evidence:** Architectural history and photographs from Fondation Le Corbusier. The operator confirms visitor access to the lobby, Salon courbe, and sample room 105.
- **Recommended method:** BIM using repeated architectural elements.
- **First scope:** Pilotis, accommodation block, representative room, and curved communal space.
- **Outstanding checks:** Verify a complete, scaled drawing set. Other residential floors are outside normal visitor access. No working 360 dataset was confirmed; the visitor map link alone does not establish measured-plan availability.
- **Sources:** [Fondation Le Corbusier architectural documentation](https://www.fondationlecorbusier.fr/oeuvre-architecture/realisations-pavillon-suisse-cite-internationale-universitaire-paris-france-1930-1933/); [official visitor information](https://www.fondationsuisse.fr/en/practical-information/visit-the-building/).

### 8. Kloster Sankt Georgen, Stein am Rhein

- **Portfolio ID:** `1086/6114/KS`
- **Public evidence:** Public museum route through former monastic rooms, abbot's apartments, and garden, including historic panelling and murals. The published 2026 season runs until **1 November 2026**.
- **Recommended method:** Survey-based splat with a supporting architectural model; a possible day trip from the Zürich region.
- **First scope:** Cloister and one decorated room.
- **Outstanding checks:** No usable public 360 dataset or complete measured plans were confirmed. Arrange capture and check seasonal access before travel.
- **Source:** [Official museum information](https://www.klostersanktgeorgen.ch/de).

### 9. Amphitheater Vindonissa, Windisch

- **Portfolio ID:** `1086/3587/AT`
- **Public evidence:** The municipality explicitly confirms free public access. BBL documentation includes a plan, dimensions, renovation history, and photographs.
- **Recommended method:** Outdoor photographic survey and splat, with a geometric model of the surviving ruins. An ancient reconstruction could be a separate, clearly labelled interpretation.
- **First scope:** One gate and adjoining masonry, then expand to the site.
- **Outstanding checks:** Whole-site coverage is substantial. Historical reconstruction needs archaeological evidence beyond the present-day survey; keep observed remains and hypothetical restoration distinct.
- **Sources:** [Municipal access information](https://www.windisch.ch/freizeit-mobilitaet/freizeit/freizeitaktivitaeten/vindonissapark/amphitheater-vindonissa.html/212); [BBL renovation dossier](https://www.bbl.admin.ch/dam/de/sd-web/u6Zrv3Wx2zhg/20110401_Windisch,%20Arenastrasse%2020,%20Sanierung%20Amphitheater_DE.pdf).

### 10. Swiss National Library, Bern

- **Portfolio ID:** `1086/2025/LB`
- **Public evidence:** Public reading-room access, interior photographs, and a documented renovation project.
- **Recommended method:** Survey-based splat preserving the current state; add a simple architectural model later.
- **First scope:** Reading room and entrance sequence.
- **Outstanding checks:** **Highest immediate scheduling priority.** Public service closes on **30 October 2026 at 18:00**, reopening at the temporary Monbijoustrasse address on **30 November 2026**. Confirm whether a capture of the Hallwylstrasse rooms can be arranged before relocation alters them.
- **Sources:** [Reading room](https://www.nb.admin.ch/de/arbeitsplaetze); [renovation project](https://www.bbl.admin.ch/de/sanierung-und-erweiterung-schweizerische-nationalbibliothek-bern); [closure and relocation dates](https://www.nb.admin.ch/de/offnungszeiten).

## Reserve candidate: Villa Maraini, Rome

- **Portfolio ID:** `1086/4978/IA`
- **Potential:** Historic interiors, tower, and garden; an appealing architectural reconstruction if drawings or a capture partner can be secured.
- **Evidence:** Istituto Svizzero documents public architectural visits. The verified Open House dates were **16–17 May 2026**, already past at the research date; they do not establish an upcoming access opportunity.
- **Why reserve:** Less immediately usable geometric evidence was found than for Seoul or Römerholz. No usable public 360 training dataset was confirmed.
- **Source:** [Istituto Svizzero architectural visit](https://www.istitutosvizzero.it/architettura/open-house-roma-5/).

## Existing capture datasets outside the portfolio

These are optional method-development projects, not matches to the supplied portfolio. Dataset descriptions and publication status were checked; archives have not been downloaded, aligned, or trained.

| Site | Published capture material | Proposed use | Source |
|---|---|---|---|
| **La Cesta, San Marino** | 2,277 terrestrial photographs, 707 drone photographs, 31 LiDAR scans | Historic fortress/tower splat; assess reconstruction against captured geometry | [Open Heritage 3D dataset](https://openheritage3d.org/project.php?id=2h6g-jz80) |
| **Basilica di San Marino and Chiesa di San Pietro** | 2,664 terrestrial photographs, 925 drone photographs, 42 LiDAR scans; exterior, interior, and attic spaces | Interior/exterior splat experiment with geometric reference data | [Open Heritage 3D dataset](https://openheritage3d.org/project.php?id=shvk-8173) |

Both pages list **CC BY-NC-SA** and offer download links by email. Verify archive contents, calibration/pose availability, image quality, and the applicable reuse terms before choosing a publication workflow. Their listed photographic coverage makes them promising inputs, not proven ready-to-train datasets.

## Method selection and next checks

### Architectural/BIM reconstruction

Prefer candidates with floor plans plus sections or known heights, supported by photographs that connect the rooms and façades. Published drawings may describe an earlier state; choose and record the reconstruction date. Keep inferred dimensions and unseen spaces explicit, following the [model handoff](model-handoff.md) and [reconstruction handbook](reconstruction-handbook.md).

For Swiss sites, [swissSURFACE3D](https://www.swisstopo.admin.ch/en/height-model-swisssurface3d) provides classified airborne LiDAR that can support exterior geometry and site context. Check local coverage and acquisition dates. It does not resolve interior evidence gaps.

### Gaussian splats from existing tours

The [Wattenwyl results](../reconstructions/von-wattenwyl-haus/docs/results.md) show that good alignment alone does not overcome sparse capture: panoramas roughly 1.7 m apart still produced softness between capture positions. More perspective crops from one panorama do not add new camera positions or parallax.

For Prangins or CDN, first evaluate a connected room cluster:

1. Establish the available original images, resolution, capture positions, and reuse permission.
2. Check overlap and whether poses or a geometric reference can be obtained or recovered.
3. Train a small pilot and inspect movement between capture positions, not only views at the original cameras.
4. Expand only after the pilot supports the desired visual quality and viewer budget.

### Local capture priorities

1. **National Library:** determine whether its current state can be captured before the October relocation closure.
2. **Römerholz:** compare public plans with current rooms and agree a targeted capture.
3. **Bellevue Palace:** arrange one measured room and adjacent circulation for a controlled BIM-versus-splat comparison.
4. **Vindonissa:** start with a bounded outdoor section before attempting the entire site.

Museum or hotel opening hours establish visitor access only. Systematic capture and publication arrangements remain unresolved for the proposed interior surveys. No venue has been contacted as part of this research.
