# DACH BIM modelling guidelines: research notes for an AI-agent modelling guide

[← Research](README.md) · [BIM modelling guide](../README.md)

Research date: 2026-10-09. Scope: public BIM modelling guidelines (Modellierungsrichtlinien), BIM guides, EIR/AIA/BAP templates and LOIN/LOG/LOI definitions from CH/DE/AT. The aim is to pull out concrete rules for LOD 200–300 models of historic and public buildings that are authored in Blender and exported to glTF (three.js) and IFC4 (CDE).

## Read this first: limits of this research

- **WebFetch did not work for any host in this session.** Every call failed with `getaddrinfo ENOTFOUND`, including kbob.admin.ch, sbb.ch, fib-bund.de, bimdeutschland.de and wikipedia.org. Shell curl was off-limits.
- **No PDF was opened in full.** Everything below comes from WebSearch result excerpts, which are partial and machine-summarised. They contain verbatim fragments of the source documents.
- **Quotes are short fragments** as they appeared in those excerpts. Treat each one as "reported by search excerpt, verify against the PDF". Page numbers are not available.
- **No BBL-specific modelling guideline was found online.** BBL's public BIM position is expressed through:
  - the joint federal "Strategie digitale Methoden" (BBL + armasuisse + ETH domain + ASTRA);
  - the KBOB contract annexes, which BBL co-authors as a KBOB member.
- **Internal leads, not accessed.** Internal KBOB/BBL data catalogues (element and property requirements, LOIN, IFC mappings) are probably the most authoritative source for federal requirements; the owner should consult them directly.
- **Licences.** Almost none of the documents state a redistribution licence in the excerpts. The exception is the Graphisoft DE guideline, which is CC BY-NC-SA. Assume "free to read, not licensed for redistribution": summarise and link, don't copy.

---

## 0. Scope update: CAFM / FM as-built survey model (read this first)

### Target model
The target is a reduced, light **architectural CAFM as-built model** (Bestandsmodell / Bauaufnahme for facility management), built on IFC4.

It does **not** include:
- MEP or technical equipment;
- detailed structural members;
- multi-layer walls;
- anything needed for simulation.

This section weights the DACH sources toward that use case. Sections 1–4 hold the full, broader research.

### 0.1 FM / CAFM sources (additional)
| # | Title | Publisher | Year | URL | What it gives for CAFM |
|---|---|---|---|---|---|
| FM1 | Richtlinie Bauwerksdokumentation im Hochbau (+ Empfehlung, Modellbeschrieb, Merkblatt, checklists) | KBOB / IPB (with IFMA CH) | 2016 (1st ed. 2013) | https://www.kbob.admin.ch/dam/it/sd-web/-s2qA0Hnsejs/KBOB-IPB_Richtlinie_Bauwerksdokumentation_2016_DE.pdf ; https://www.kbob.admin.ch/de/bauwerksdokumentation-im-hochbau | Federal (BBL is a KBOB member) basis for handover documentation |
| FM2 | Richtlinie Flächenerfassung und Erstellung Bewirtschaftungspläne (RFB) + CAFM-Richtlinie IMMO + BIM@IMMO Anhang C Bauwerkskennzeichnung | Stadt Zürich, Immobilien (IMMO) | RFB v18.0 2015 (newer ed. cited 2025-10-30); Anhang C 2020 | https://www.stadt-zuerich.ch/content/dam/web/de/planen-bauen/bauvorschriften-und-planerische-grundlagen/dokumente/standards-richtlinien-immo/computer-aided-facility-management-cafm/richtlinie-flaechenerfassung-und-erstellung-bewirtschaftungsplaene.pdf ; https://www.stadt-zuerich.ch/content/dam/web/de/planen-bauen/bauvorschriften-und-planerische-grundlagen/dokumente/standards-richtlinien-immo/computer-aided-facility-management-cafm/richtlinie-cafm-immo.pdf | Room and storey codes, room polygons, SIA 416 area typing |
| FM3 | Richtlinie Flächennachweis (2025) | Kanton Zürich HBA + Immobilienamt | in force 2025-08-28, V1.1 area tree | https://www.zh.ch/content/dam/zhweb/bilder-dokumente/themen/planen-bauen/hochbau/planungsgrundlagen/cad/grundlagen/Richtlinie%20Fl%C3%A4chennachweis%20(2025).pdf | SIA 416 / SIA d0165 area tree and measuring special cases |
| FM4 | Handbuch Flächendefinition (23.031W, v11) | Kanton Luzern, Dienststelle Immobilien | 2024-11-12 | https://immobilien.lu.ch/-/media/Immobilien/Dokumente/Leistungen/Planen_Bauen/23031W_Flaechendefinition_Version_11.pdf | Concrete polygon rules (geometry for CAFM) |
| FM5 | UZH Konzept Gebäude-, Geschoss- und Raumbezeichnung (V2021-01) + Richtlinien Bauwerksdokumentation (V2024-1) | Universität Zürich, Immobilien und Betrieb | 2021 / 2024 | https://www.ib.uzh.ch/dam/jcr:7592b488-3a86-4fc1-a879-cb5432e890c6/Richtlinie_Gebaeude_Geschoss_und_Raumbezeichnung_UZH.pdf ; https://www.ib.uzh.ch/dam/jcr:a28f48d7-aa7f-4eca-8420-4fd340976837/Richtlinien_Bauwerksdokumentation_UZH_V_2024_1.pdf | A fully specified numbering scheme, the most detailed found |
| FM6 | Kanton ZH Immobilienamt Kennzeichnungskonzept; Kanton SG Beschriftung und Nummerierung von Gebäuden; Basel-Stadt Richtlinie Bezeichnungen 0_7700; Stadt Bern CAD-Richtlinien ISB 2020; Kanton SO CAD-Richtlinie 4.2.1; Kanton AG Richtlinie CAD | Cantons / cities | 2019–2024 | https://www.zh.ch/content/dam/zhweb/bilder-dokumente/organisation/baudirektion/ima/richtlinie_kennzeichnungskonzept.pdf ; https://www.sg.ch/bauen/hochbau/richtlinien-und-vorlagen/planungsvorgaben/_jcr_content/Par/sgch_downloadlist/DownloadListPar/sgch_download.ocFile/Richtlinie%20Beschriftung%20und%20Nummerierung%20von%20Gebaeuden.pdf ; https://www.bern.ch/politik-und-verwaltung/stadtverwaltung/prd/hochbau-stadt-bern/downloads-fur-planer/organisation-und-zusammenarbeit/CAD%20Richtlinien_ISB_20200709.pdf/@@download/file/CAD%20Richtlinien_ISB_20200709.pdf ; https://so.ch/fileadmin/internet/bjd/bjd-hba/04-Ueber-uns/Zusatzrubrik/CAD_Richtlinien_HBASO_4-2_1_Revision_20190703.pdf | Corroborate naming and polygon conventions |
| FM7 | Baufachliche Richtlinien Gebäudebestandsdokumentation (BFR GBestand) | German federal (BMWSB / fib-bund) | current | https://www.fib-bund.de/Inhalt/Richtlinien/BFRGBestand/bfr_gbestand.pdf | German federal as-built documentation: rooms per DIN 277, storey polygon |
| FM8 | VBV Baden-Württemberg Anlage B-2 Bestandsdokumentation Flächenmanagement CAFM; Arbeitsmittel Dokumentation Pläne und Daten | Vermögen und Bau BW | 2019 / 2025-01 | https://www.vbv-bw.de/fileadmin/VBV-Portal/Service/Planungshilfen/CAD/B-2-Bestandsdokumentation-Flaechenmanagement-CAFM-191101.pdf | Room numbering, door numbering, room polygons, BGF storey polygon (chapter headings only) |
| FM9 | SIB Sachsen CAD-FM-Dokumentationsrichtlinie (Teil 1, Anlage II.1 FM-Layer) | SIB Sachsen | n/a | https://www.sib.sachsen.de/download/CAD/Anlage_II_1_Vorgaben_Geometriedatenerf_FMLayer.pdf | Rule for multi-storey rooms |
| FM10 | BIM-AwF Bestandserfassung und -modellierung: BIM-Handbuch Bund AwF-Steckbriefe 2.0; BIM.Hamburg AwF 010 v002; AwF 200 Datenaufbereitung für den Betrieb | fib-bund / BIM.Hamburg | 2024 / v002 | https://www.fib-bund.de/Inhalt/Themen/BIM_fuer_Bundesbauten/2024-07_BIM_AH_AwF-Steckbriefe_2.0.pdf ; https://bim.hamburg.de/resource/blob/612210/2d116fd59cf35f1bbb6eaa223943ea3a/d-awf-010-data.pdf ; https://bim.hamburg.de/resource/blob/991564/4bb06cdbc1f6eb5f70f28e4772e7acb9/d-awf-200-data.pdf | Purpose-driven LOIN for as-built models |
| FM11 | BAK "BIM für Architekten – Digitalisierung und Bauen im Bestand" (revised, incl. BIM in Denkmalpflege) | Bundesarchitektenkammer | 2025-05 | https://bak.de/wp-content/uploads/2025/05/BAK_DigitalisierungUndBauenImBestand.pdf | As-built and heritage workflow; information depth set in AIA |
| FM12 | Leitfaden BIM für den Betrieb | FMA / IFMA Austria | 2022-01 | https://www.fma.or.at/fileadmin/uploads/FMA/dokumente/fachliteratur/BIM_CAFM/Leitfaden_BIM_fuer_den_Betrieb_21_Web_final.pdf | FM attribute tables, citing ÖNORM A 6241-2 |
| FM13 | CAFM-Connect (IFC-based CAFM exchange, CAFM-Ring); a DIN SPEC titled "BIM und CAFM verbinden" (number shown garbled in the excerpt as "9155 5"; unverified); GEFMA 198 FM-Dokumentation | CAFM-Ring / DIN / GEFMA | various | https://bim.fm-connect.com/bim/cafm/cafm-connect/ | Industry practice (DE). Attribute lists not public |

**Not found:**
- a BBL- or armasuisse-specific public FM attribute list (armasuisse has an "Elementplan" and Bestellunterlagen, not public in the excerpts);
- a BIG Austria FM/BIM guideline;
- a DB Bestandsmodell guideline for buildings (DB's AwF 010 covers track/infrastructure).

**Internal lead:** internal KBOB/BBL data catalogues very likely contain the federal FM element and property list. Check these before anything else.

### 0.2 Key CAFM rules from the sources

**Rooms (IfcSpace)**
- **Every room has a room polygon. Room polygons sum to NGF** (net floor area, SIA 416).
  - "Jeder Raum enthält mindestens ein Raumpolygon" (each room contains at least one room polygon; FM4).
  - "Die Summe aller Raumpolygone ergibt die Nettogeschossfläche (NGF)" (the sum of all room polygons gives the NGF; FM4).
  - Stadt Zürich: "Die Summe der Flächen der verschiedenen Nutzungsarten muss der Raumfläche entsprechen" (the areas by usage type must add up to the room area; FM2).
  - DE federal: rooms follow DIN 277 room enclosure. For mixed use, "die überwiegende Nutzung ist maßgeblich" (the predominant use decides; FM7).
- **Each storey has one storey polygon = GF (SIA 416) / BGF (DIN 277).**
  - "Jedes Geschoss enthält ein Geschosspolygon" (each storey contains one storey polygon; FM4).
  - BFR GBestand: "ein Geschosspolygon … das die Brutto-Grundfläche je Geschoss nach DIN 277 beschreibt" (a storey polygon describing the gross floor area per storey per DIN 277; FM7).
  - VBV BW: "Geschosspolygon für die BGF" (FM8).
  - **IFC mapping:** an `IfcSpace` per room. Optionally, a GF/BGF zone or `IfcSpace` per storey with ObjectType "GF". Alternatively, provide `Qto_BuildingStoreyBaseQuantities.GrossFloorArea`.
- **Polygon construction** (FM4, Luzern), which maps directly to simple extruded `IfcSpace` footprints:
  - "Polygone werden auf Bodenhöhe erstellt" (polygons are drawn at floor level);
  - "nur gerade Polylinien, keine Bogensegmente" (straight polylines only, no arc segments). Facet curved walls.
  - "Stützen und Pfeiler sind im Polygon einzuschliessen" (columns and pillars are included in the polygon). The room polygon is not cut around columns; the column area is accounted as construction area.
  - "Polygone desselben Polygontyps dürfen sich nicht überschneiden" (polygons of the same type must not overlap).
  - Net areas of existing buildings are derived "aus den Rohbaumassen" (from structural / unfinished dimensions).
- **Voids and air spaces:**
  - double-height rooms and large stairwells count as construction area up to 4 m²;
  - above 4 m² they are marked as air space (LUF; FM4);
  - air space is always deducted, and duplicate areas are not counted twice (FM3).
- **Shafts, stairs and multi-storey rooms:**
  - stairs penetrating a floor count as construction area (FM3);
  - Solothurn counts shafts within the room polygon's NGF;
  - Sachsen: rooms spanning several storeys are documented only in their **lowest** storey (FM9). Translate as: one `IfcSpace` in the lowest storey with its full height.
- **Area typing (SIA 416):**
  - HNF = main usable area; NNF = secondary usable area; VF = circulation; FF = functional area (plant); KF = construction area; plus ANGF (external, e.g. balconies), which Stadt Zürich also treats as rooms (FM2).
  - UZH area codes: HNF 001–599, NNF 600–699, FF 700–799, VF 800–899, outdoor 900–999 (FM5).
  - DE equivalent: DIN 277 NUF 1–7 / TF / VF.
- **Room height:** the lower bound on top of the structural slab (or finished floor; agree a convention), upper bound at the underside of the slab or suspended ceiling (CH14 IDC; Graphisoft). Lucerne measures areas at floor level, so height is secondary for CAFM. Sloped roofs: area measured to the inner face of the exterior wall; roof-slope height has no effect on area (FM3).

**Storey naming (owner-specific; pick one scheme and record it)**

| Owner | Scheme | Examples |
|---|---|---|
| Stadt Zürich AHB CAD | Letter + 2 digits | `U01` basement, `E00` ground floor, `O01` upper floor, `D01` attic |
| Stadt Zürich IMMO (BIM@IMMO) | Storey code + 3-digit room number | storey `OG01`, room `OG01002` |
| UZH | Building code - storey letter - room number; storey letters A–T (no I, O) and X–Z; main entrance floor = `E`, upwards `F`, `G`, `H`…, downwards `D`, `C`, `B`, `A`; mezzanine = storey letter + lowercase (`Ea`) | `KOL-E-122` |
| Kanton SG, Kanton ZH IMA | Their own Kennzeichnungskonzepte, also sortable letter codes | — |

**Room numbering (UZH FM5, most explicit)**
- "Jeder Raum mit Tür erhält eine Raumnummer" (every room with a door gets a number).
- Numbering runs clockwise within the storey.
- Rooms stacked above each other get the same number on each storey.
- Reserve numbers are left where later subdivision is likely.
- Internally subdivided rooms get suffixes `a` (main access room), `b`, `c`…
- Room numbers are unique per building (Stadt Zürich CAFM).
- Stadt Zürich's management plan shows room name, on-site room number and the system number (FM2).
- **IFC mapping:** `IfcSpace.Name` = room number; `LongName` = room name/function; usage code in a property; storey code in `IfcBuildingStorey.Name`.

**Doors and windows (inventory)**
- VBV BW has a dedicated **door numbering system** (Türnummerierungssystem, FM8 §3.2). Details were not visible.
- The Austrian FM table (FM12, from ÖNORM A 6241-2) lists door attributes such as `RmNrTuer` (room number of the door) and object ID. Door number is usually derived from the room it opens into.
- CAFM-Connect: rooms, doors and windows must keep their **relations after IFC export** (door → host wall → adjacent spaces). Do not use `IfcBuildingElementProxy` (FM13).
- ÖNORM A 6241-2 / BIMpedia: windows reference their storey. Sill height (Brüstungshöhe) is measured from storey zero = top of structural slab.
- **IFC mapping:** `IfcDoor` / `IfcWindow` filling an `IfcOpeningElement` in the host wall. `Name` = door/window number. Provide OverallWidth/OverallHeight. Include `Pset_DoorCommon.FireRating` / `IsExternal` if known. Space boundaries (`IfcRelSpaceBoundary`) or a room-number property tie them to rooms.

**FM attribute minimums named in sources (FM12 ÖNORM-derived table for rooms)**
- Room number, long name, Aufenthaltsraum flag (habitable room yes/no), target room area m².
- Ownership split: client vs. architect.

**Combined minimum LOI for a CAFM as-built model** (synthesised from FM2–FM12, CH5 FDK, CH13):

| Element | Attributes |
|---|---|
| Site / building | Name, address, EGID (Swiss federal building ID, for BBL), building code |
| Storey | `Name` = code, elevation, GF / BGF |
| Space | Room number, name, SIA 416 / DIN 277 usage category, net area (NGF / NRF), height (optional), finish floor offset (optional) |
| Door / window | Number, width, height, `IsExternal`, host wall, rooms served |
| Wall / slab / roof / column / stair | Class, `IsExternal`, `LoadBearing` (if known), single material |

**Bestand / as-built specifics (FM10, FM11)**
- LOIN of an as-built model "orientieren sich am Ziel der Erfassung" (is oriented to the purpose of the survey; FM10). The three purposes are:
  - before renovation;
  - **for operation (Betrieb)**;
  - terrain before new build.
- Inputs: existing plans, GIS/cadastre, survey data. Only laser scanning and photogrammetry give point clouds for object-based 3D modelling (DB AwF 010).
- BAK 2025: decide the information depth up front in the AIA. "Ein informationsüberladenes Modell" (an information-overloaded model) slows work. Verify old plans on site. A new chapter covers BIM in heritage conservation (Denkmalpflege).
- Accuracy (LOA) is separate from LOG. Many guides note VDI 2552 doesn't cover historic as-built accuracy. Recording data source and accuracy per element is good practice but is **not** prescribed by any DACH public guide found.

### 0.3 Simple single-material elements (what the sources support for a light model)
- **SBB (CH5):**
  - "mehrschichtige Bauteile nicht erlaubt" (multi-layer elements not allowed);
  - every element is single-layer and typed;
  - no overlaps.
  This is the strongest Swiss federal-sector support for single-material elements.
- **ÖNORM A 6241-2:** the structural slab is single-layer ("Rohdecke einschichtig"). Walls may be multi-layer there, but for CAFM the layers are irrelevant.
- **BIM-Handbuch Bund (DE1):** separates a Rohbau model from an Ausbau model and a Raum model. A CAFM as-built model is essentially the **Raummodell + simplified Rohbau envelope**.
- **Wuppertal (DE4):** the layering depth depends on LOG. At low LOG one element per wall/slab is acceptable.
- **Recommendation for the guide:**
  - one `IfcWall` per storey and straight segment, with total (as-measured) thickness and one material (e.g. "Mauerwerk", "Beton", "unbekannt");
  - one `IfcSlab` per storey (FLOOR), total thickness;
  - roof as `IfcRoof` / `IfcSlab` ROOF with a single thickness.
- **Do not model:** MEP, furniture, finishes as separate layers, reinforcement, connections.

---

## 1. Source table

| # | Title | Publisher | Year / version | Lang | URL | Access in this session | Licence stated |
|---|---|---|---|---|---|---|---|
| CH1 | Strategie digitale Methoden (BIM-Strategie) | BBL, armasuisse Immobilien, ETH-Bereich, ASTRA (with KBOB) | v2.0, 2024-04-02 | DE (FR/IT exist) | https://www.kbob.admin.ch/dam/de/sd-web/DAUiDPBh6xux/BIM-Strategie-digitale-Methoden_20240402_DE.pdf | Search excerpts only | not stated |
| CH2 | KBOB Empfehlungen Umgang mit BIM | KBOB | 2018-01-15 | DE | https://www.kbob.admin.ch/dam/de/sd-web/DehwSu7MxwmU/20180115_KBOB-Empfehlungen_Umgang_BIM_Publikation_DE.pdf | Excerpts | not stated |
| CH3 | Anwendung der Methode BIM im Hochbau bei Einzelplanermandaten (EIR contract annex) | KBOB | v1.0, 2023-04-02 (GP variant 2021-03-01, updated 2023) | DE/FR/IT | https://www.kbob.admin.ch/dam/de/sd-web/O-FZjskdBMWH/20230402_KBOB-Anwendung_BIM_Hochbau_Einzelplaner_EIR_Publikation_DE.docx ; FAQ: https://www.kbob.admin.ch/dam/kbob/it/dokumente/digitalisierung_bim/KBOB_FAQ%20zum%20Dokument%20Anwendung%20BIM-d.pdf.download.pdf/KBOB_FAQ%20zum%20Dokument%20Anwendung%20BIM-d.pdf | Excerpts | not stated |
| CH4 | AHB-Standard für BIM-Projekte (Stadt Zürich's adaptation of the KBOB annex) | Stadt Zürich, Amt für Hochbauten | 1.0 2021-03-21; doc stamp 2022-10-31; refers to KBOB doc 30 v2023 [3.0] | DE | https://www.stadt-zuerich.ch/content/dam/web/de/planen-bauen/projekte-und-ausschreibungen/dokumente/hochbauvorhaben/vorgaben/bim-pilotprojekte/ahb-standard-bim-kbob.pdf | Excerpts | not stated |
| CH5 | SBB Regelwerk Bauwerksmodelle IM-70018 (+ Anhang A model structure/naming XLSX, Anhang B geometry G1–G4) | SBB Infrastruktur | v5.0 valid from 2025-03-01 (PDF found); FDK page cites v7.0 | DE (EN page) | https://company.sbb.ch/content/dam/internet/corporate/downloads/de/sbb-als-geschaeftspartner/einkauf/bim/regelwerk-bauwerksmodelle.pdf.sbbdownload.pdf ; page: https://company.sbb.ch/de/bahnentwicklung/zukunft-bahn/bim/planen/regelwerk-bauwerksmodelle.html | Excerpts | not stated |
| CH5b | SBB Richtlinie Bauwerksmodelle (predecessor) | SBB | V3.0, valid from 2022-04-01 | DE | https://chgeol.org/wp-content/uploads/2023/09/Richtlinie_Bauwerksmodelle-V3_0.pdf | Excerpts | not stated |
| CH5c | SBB BIM-Prüfplan (XLSX) and Fachdatenkatalog FDK | SBB | rolling releases | DE/EN | https://company.sbb.ch/de/bahnentwicklung/zukunft-bahn/bim/planen/pruefplan.html ; https://fdk.app.sbb.ch/de/explanation | Excerpts | not stated |
| CH6 | Georeferenzierung in der BIM-Methodik (use case CH.1507.04) and swisstopo presentation | buildingSMART Switzerland / swisstopo (T. Marti) | UC 2021-04-15; slides 2022-04-29 | DE | https://ucm.buildingsmart.org/de/use-cases/2316/de ; https://www.swisstopo.admin.ch/dam/de/sd-web/sjjLXXkQU868/20220429-Georeferenzierung-BIM-Methodik-DE.pdf | Excerpts | not stated |
| CH7 | Level of Information Need – Grundlagen / Hochbau / Landschaftsarchitektur | Bauen digital Schweiz / buildingSMART Switzerland | 2023 | DE/FR | https://bauen-digital.ch/publikationen/ ; https://bauen-digital.ch/aktuell/out-now-level-of-information-need-grundlagen-und-anwendungen/ | Excerpts. No direct PDF URL found | not stated |
| CH8 | SIA 2051 BIM – Grundlagen zur Anwendung der BIM-Methode | SIA | 2017, **withdrawn end of 2024** (superseded by SN EN ISO 19650) | DE/FR | https://irf.fhnw.ch/entities/publication/ae3d27f4-e33b-4498-b495-efcc6ff48299 | Metadata only (paid) | paid norm |
| CH9 | armasuisse Immobilien: Informationsanforderungen / BIM@arImmo | armasuisse | 2023–2026 | DE | https://www.ar.admin.ch/de/focus-anforderungenbim ; https://www.ar.admin.ch/de/bimarimmo | Excerpts | not stated |
| CH10 | Stadt Zürich: Vorgaben digitales Bauen; BIM@IMMO (Anhang C Bauwerkskennzeichnung 2020); CAD-Richtlinie AHB | Stadt Zürich (AHB, IMMO) | 2020–2024 | DE | https://www.stadt-zuerich.ch/de/planen-und-bauen/projekte-und-ausschreibungen/hochbauvorhaben/vorgaben/projektierung/digitales-bauen.html ; https://www.stadt-zuerich.ch/content/dam/web/de/planen-bauen/bauvorschriften-und-planerische-grundlagen/dokumente/standards-richtlinien-immo/bim@immo/anhang-c-zur-richtliniebim-immo-bauwerkskennzeichnung.pdf ; https://www.stadt-zuerich.ch/content/dam/web/de/planen-bauen/projekte-und-ausschreibungen/dokumente/hochbauvorhaben/vorgaben/revisionsplaene-planarchiv/cad-richtlinie.pdf | Excerpts | not stated |
| CH11 | Kanton Zürich TBA: Informationsanforderungen (EIR, infrastructure) | Kanton ZH Tiefbauamt | Feb 2024 | DE | https://www.zh.ch/content/dam/zhweb/bilder-dokumente/themen/planen-bauen/tiefbau/strassenanlagen/bim-im-tiefbau/dokumente/eir/informationsanforderungen.pdf | Excerpts | not stated |
| CH12 | Kanton St. Gallen HBA: Richtlinie BIM | Kanton SG Hochbauamt | V2.2/2.3, 2021-11-15 | DE | https://www.sg.ch/bauen/hochbau/richtlinien-und-vorlagen/planungsvorgaben/_jcr_content/Par/sgch_downloadlist/DownloadListPar/sgch_download_539350.ocFile/Richtlinie%20BIM.pdf | Excerpts (framework only) | not stated |
| CH13 | CRB Regelsatz eBKP-H ↔ IFC4 | CRB | eBKP-H SN 506 511:2020 | DE/FR/IT | https://www.crb.ch/de/normen-standards/baukostenplane/regelsatz-ebkp-ifc ; summary PDF: https://www.crb.ch/_Resources/Persistent/b/a/2/9/ba297291c00a30fbd079717708722c535963b497/Regelsatz_wichtigste_Punkte_de_Web_Nov21.pdf | Excerpts (rule set is paid XLSX) | paid |
| CH14 | IDC (Solibri CH) FAQ Modellierung für IFC; SIA 416 role | IDC AG (vendor) | n/a | DE | https://www.idc.ch/nc/support/view/?tx_idcsupport%5BprimaryLink%5D=2830&tx_idcsupport%5Bentry%5D=1206&cHash=c7206c2d37752462741cb4679ce82d47 | Excerpts | vendor |
| DE1 | BIM-Handbuch Bundesbauten – Arbeitshilfe Erstellung von Modellierungsvorgaben | BMWSB / BBR (bundesbau.de, fib-bund.de) | 10/2023 (file 231107) | DE | https://bundesbau.de/fileadmin/user_upload/BIM_Roadmap/bbau_ah_modellierungsvorgaben_231107_zh.pdf | Excerpts | not stated |
| DE2 | BIM-Handbuch Bundesbauten – Arbeitshilfe LOIN-Konzept; Arbeitshilfe Modellprüfung; Muster-BAP; AwF-Steckbriefe | BMWSB / BBR | 2023–2024 | DE | https://fib-bund.de/Inhalt/Themen/BIM_fuer_Bundesbauten/BIM_AH_LOIN-Konzept.pdf ; https://www.fib-bund.de/Inhalt/Themen/BIM_fuer_Bundesbauten/2023-06_BIM_AH_Modellpr%C3%BCfung.pdf ; https://bundesbau.de/fileadmin/user_upload/BIM_Roadmap/bbau_ah_muster_bap_23023.pdf | Excerpts | not stated |
| DE3 | BBR AIA (Auftraggeber-Informationsanforderungen) Stand 1.2 | BBR | v1.2 | DE | https://www.bbr.bund.de/SharedDocs/Downloads/DE/BBR/BIM/AIA_Stand_1-2.pdf?__blob=publicationFile&v=4 | Excerpts | not stated |
| DE4 | Entwicklung einer standardisierten BIM-Modellierungsrichtlinie (BBSR-Online 43/2023) + Wuppertal "Leitfaden für die Erstellung eines Bauwerksdatenmodells – Modellierungsgrundlagen" (Hauptdokument) | BBSR / Bergische Univ. Wuppertal (Helmus, Meins-Becker et al.) | 2023; Hauptdokument 10/2021 | DE | https://www.bbsr.bund.de/BBSR/DE/veroeffentlichungen/bbsr-online/2023/bbsr-online-43-2023-dl.pdf?__blob=publicationFile&v=3 ; https://dpbb.uni-wuppertal.de/fileadmin/architektur/ib/DPBB/Download-Bereich/Forschungsprojekte-Modellierungsrichtlinie/Modellierungsrichtlinie._Hauptdokument.pdf | Excerpts | not stated |
| DE5 | BIM Deutschland Muster-AIA Hochbau (Beispiel Verwaltungsbau) + LOIN-Anhänge (Mindestanforderungen, AWF 190, TGA) | BIM Deutschland (BMV/BMWSB) | 2023-05-03 | DE | https://www.bimdeutschland.de/fileadmin/media/Downloads/Muster-AIA/BIM_D_AP43b_Muster-AIA_Hochbau_Beispiel_Verwaltungsbau.pdf ; index: https://www.bimdeutschland.de/bim-wissen/auftraggeber-informationsanforderungen | Excerpts | not stated |
| DE6 | BLB NRW BIM-Richtlinie (Anlage 14a) + Modellanforderungen (Anlage 14b) + Parameterliste (14c) + BAP template (Anlage 16) | Bau- und Liegenschaftsbetrieb NRW | 14b v2.3 Jan 2025 | DE | https://www.blb.nrw.de/fileadmin/Home/Service/Service_fuer_Auftragnehmer/Standards_Erlasse_Regelungen/BIM/Anlage-14b_Modellanforderungen.pdf ; https://www.blb.nrw.de/fileadmin/Home/Service/Service_fuer_Auftragnehmer/Standards_Erlasse_Regelungen/BIM/bim-richtlinie-blb-nrw.pdf | Excerpts | not stated |
| DE7 | SBN Anwendungsleitfaden Revit (Staatliches Baumanagement Niedersachsen) | NLBL Niedersachsen | template 2025-08 | DE | https://www.nlbl.niedersachsen.de/download/221315 | Excerpts | not stated |
| DE8 | SIB Sachsen Muster-Modellierungsrichtlinie | Staatsbetrieb Sächsisches Immobilien- und Baumanagement | 2020-08-27 | DE | https://www.sib.sachsen.de/download/BIM/20200827_Muster_Modellierungsrichtlinie.pdf | Title only | not stated |
| DE9 | BIM-Leitfaden für die FHH (v004) + Checkliste Modellprüfung + Objektkatalog | BIM.Hamburg | v004 | DE | https://bim.hamburg.de/resource/blob/611776/c6f8a78657aea6824f5163d718eaadc5/d-bim-leitfaden-fhh-v004-data.pdf ; https://bim.hamburg.de/standardisierungsprojekte/rahmendokumente | Excerpts | not stated |
| DE10 | DB InfraGO Personenbahnhöfe: Vorgaben zur Anwendung der BIM-Methodik (v3.1) + Anlage 2 Modellierungsrichtlinie + Anlage 4 Georeferenzierung + Anlage A Bauteilbibliothek | Deutsche Bahn | v3.1 (2024–2026) | DE | https://infoplattform-personenbahnhoefe.deutschebahn.com/resource/blob/13312494/484d77a087626b19455e55ddd1da8ae0/Vorgaben-zur-Anwendung-der-BIM-Methodik-3-1-data.pdf ; https://infoplattform-personenbahnhoefe.deutschebahn.com/resource/blob/12679064/50134ccc1abacab3537e223b15f1b57e/BIM-Vorgaben-Anlage-A-V-3-0-data.pdf | Excerpts | not stated |
| DE11 | DEGES BIM-Modellierungsrichtlinie V3.0 (infra) + Modellprüfung Fach-/Gesamtkoordination V1.2 | DEGES | V3.0 2026; checklists 2021 | DE | https://www.deges.de/wp-content/uploads/2026/07/BIM-Modellierungsrichtlinie_V3.0.pdf?type=original ; https://www.deges.de/wp-content/uploads/2021/05/BIM-Modellpruefung_Fachkoord_V12.pdf?type=original | Excerpts | not stated |
| DE12 | Modellierungsrichtlinie BIM-Bauantrag LBO NRW | Stadt Bochum / Ruhr-Uni Bochum et al. | 2024-03-11 | DE | https://www.teamproject.de/wp-content/uploads/2024/05/Modellierungsrichtlinie_BIM_LBO_NRW.pdf | Title only | not stated |
| DE13 | VDI 2552 Blatt 4 (data exchange; draft 2026-05 "Anforderungen an die Modellierung von Fach- und Teilmodellen") | VDI | 2020-08; draft 2026-05 | DE/EN | https://vdi.de/richtlinien/details/vdi-2552-blatt-4-building-information-modeling-requirements-for-data-exchange | TOC metadata only | paid |
| DE14 | DIN EN 17412-1 / ISO 7817-1 LOIN | CEN / ISO | 2021 / 2024 | — | https://www.iso.org/standard/89075.html (7817-2 draft) | Public summaries only | paid |
| DE15 | Graphisoft BIM-Modellierungsrichtlinien für Archicad 24/25/26 | Graphisoft Deutschland | 2020–2022 | DE | https://pub.graphisoft.de/gsmucftp/bim-modellierungsrichtlinien/GRAPHISOFT-Literatur-BIM-Modellierungsrichtlinien-fur-Archicad-26.pdf | Excerpts | **CC BY-NC-SA 4.0** |
| DE16 | Vectorworks Modellierungsrichtlinie für Deutschland und Österreich; e-bau Modellierungsrichtlinie Mengenermittlung eBKP-H (CH) | ComputerWorks | n/a; 2024-09 | DE | https://cw-downloads.eu/vectorworks/bim-im-klartext/Modellierungsrichtlinie_A2-1.pdf ; https://www.computerworks.ch/sites/default/files/media_document/2024-09/modellierungsrichtlinie_ebkp-h.pdf | Excerpts | vendor |
| AT1 | ÖNORM A 6241-2:2015 Digitale Bauwerksdokumentation – BIM Level 3-iBIM (Anhang A modelling guide, Anhang C LOD) | Austrian Standards | 2015-07-01 | DE | https://www.austrian-standards.at/en/shop/onorm-a-6241-2-2015-07-01~p2429816 | Public summaries only | paid |
| AT2 | "Richtlinie BIM-Modellierung" Ausgabe September 2024 (based on ÖNORM A 6241-2) | bautechnik.pro | 2024-09 | DE | https://www.bautechnik.pro/modellierungsvorgaben | Excerpts | not stated |
| AT3 | Stadt Wien openBIM-Bauverfahren (BRISE-Vienna) – Informationsanforderung Bauantragsmodell (BAM) + IDS | Stadt Wien / buildingSMART Austria | v1.3 Oct 2025 | DE | https://ucm.buildingsmart.org/de/use-cases/3507/en ; https://www.oiav.at/wp-content/uploads/2021/09/7_brise.pdf | Excerpts | not stated |
| AT4 | Stadt Wien CAD-Leitfaden zur ÖNORM A 6241 | Stadt Wien | n/a | DE | https://www.wien.gv.at/wirtschaft/auftraggeber-stadt/cad-leitfaden/pdf/cad-leitfaden.pdf | Title only | not stated |
| AT5 | BIG Bundesimmobiliengesellschaft BIM-Leitfaden | BIG (AT) | — | — | **not found publicly** | — | — |
| AT6 | ÖBB BIM Modellierungsrichtlinie | ÖBB | — | — | **not searched in depth / not found** | — | — |

**Not found or not accessible:**
- a BBL "Modellierungsrichtlinie" or "BIM@BBL" document (none public);
- a KBOB stand-alone Modellierrichtlinie (none: KBOB publishes EIR contract annexes, not a modelling guideline);
- Kanton Bern AGG and Kanton Basel-Stadt BIM modelling guidelines (only CAD and naming guidelines);
- ETH Zürich / ETH-Rat public BIM guideline (only "Baulich-technische Vorgaben", none BIM-specific in excerpts);
- BIG Austria BIM-Leitfaden;
- ÖBB;
- full text of VDI 2552, DIN EN 17412-1, ÖNORM A 6241-2 and SIA 2051 (all paid).

---

## 2. Per-source findings

### CH1 – Strategie digitale Methoden (BBL, armasuisse, ETH domain, ASTRA), v2.0 2024
- This is a strategic document, not a modelling rulebook. It covers the use of digital methods incl. BIM "für die Initialisierung, die Planung, die Erstellung, den Betrieb, die Nutzung und die Wiederverwendung von Bauwerken und ihren Bauteilen" (for initiation, planning, construction, operation, use and reuse of buildings and their components).
- It was defined in coordination with KBOB.
- **Relevance:** it is the top-level federal mandate. Concrete requirements are delegated to the KBOB annexes and the BLO-specific Bestellunterlagen (see armasuisse, CH9).
- **Implication for the guide:** reuse and operation (FM) are explicit goals. LOI must therefore serve operation (rooms, areas, components) and not just visualisation.

### CH2 / CH3 / CH4 – KBOB BIM recommendations and EIR contract annexes (+ Stadt Zürich adaptation)
- **CH2 (2018), information requirements:** "Üblicherweise wird zwischen Informationsanforderungen des Bestellers (Ausschreibung) und des Anbieters (Angebot) unterschieden … in Form von Datenablagen (data drops) und Modellen" (client vs. supplier information requirements, defined as data drops and models).
- **CH3, nature of the annex:** an EIR contract annex to the KBOB planner contract (Dok. Nr. 30). It applies to SIA 102/103/105/108 services. Green text marks project-specific additions and black text is the KBOB recommendation.
- **CH3, IFC:** the AHB adaptation (CH4) references ISO 16739:2018 (IFC4) for exchange.
- **CH4 (Stadt Zürich)** adds the following:
  - "mindestens ein Modell pro Gewerk … nicht grösser als 150 MB". This means at least one model per discipline, each ≤150 MB, with the model list defined in the BEP.
  - 17 use cases (StZH-AWF-000…170).
  - An "Elementplan" (element plan) that drives the data order.
  - A model structure based on buildingSMART standards.
- **Concrete geometry rules:** none were visible in the excerpts. The KBOB annexes are process and contract documents. Modelling detail is left to the BEP and to project handbooks.

### CH5 / CH5b / CH5c – SBB Regelwerk Bauwerksmodelle (IM-70018), Prüfplan, FDK
This is the most concrete public Swiss federal-sector modelling rulebook found. Key rules from the excerpts, mostly from V3.0/2022 and v5.0/2025:

- **Scope:** "beschreibt strukturelle, inhaltliche und grafische Vorgaben an die dreidimensionale Modellierung von digitalen Bauwerksmodellen" (structural, content and graphical requirements for 3D modelling). Binding for SBB staff and contractors.
- **Chapters:** Fachmodellstruktur, Fachmodellinhalt, Datenaustausch, Modellaufbau, Dateibezeichnungskonvention, Anforderungen an die Geometrie (Anhang B, levels G1–G4), Abschnitte/Baufelder.
- **Project origin:**
  - "Für jedes Projekt ist ein Projektnullpunkt (0,0,0) in der Nähe des Bauwerks zu bestimmen". Every project defines a project zero point near the structure, described in the BEP with LV95 coordinates.
  - "Der Projektnullpunkt muss sich im Koordinatensystem der CAD-Autorensoftware auf XYZ = 0,0,0 befinden". The project zero must sit at the authoring tool's origin.
  - Units are metres.
  - "Zusätzlich zum Projektnullpunkt müssen zwei weitere Passpunkte" are defined, so that any rotation can be detected.
  - Each discipline model marks the zero point with a downward-pointing pyramid.
- **Coordinate systems:** for SBB rail infrastructure "LV95 SBB" and "LN02 SBB". These are SBB-specific realisations; buildings off the railway use standard LV95/LN02.
- **No overlaps:** "Modellelemente in einem Fachmodell sind überschneidungsfrei zu erstellen" (model elements within a discipline model must not overlap).
- **No multi-layer elements:** "Die Fachmodelle müssen die Grundregeln des eBKP abdecken. Deshalb sind mehrschichtige Bauteile nicht erlaubt." Discipline models must follow eBKP basic rules, so multi-layer components are not allowed. Wall and slab build-ups are modelled as separate single-layer elements.
- **Types:** "Sämtliche Bauteile sind zu typisieren" (all components must be typed).
- **No empty storeys:** the exported model must contain no empty IfcBuildingStorey.
- **GUIDs:** must be unique within each discipline model.
- **Clashes:** deliverable models must be "frei von relevanten Kollisionen" (free of relevant clashes).
- **Prüfplan (XLSX):** "sammelt alle Regeln und Anforderungen, welche notwendig sind, um die Fachmodelle auf ihre Datenqualität zu prüfen" (collects all rules needed to check data quality).
- **FDK:**
  - defines all object types and properties SBB can require, plus their mapping to IFC classes and eBKP;
  - says which objects are modelled, "how they should be structured and named, and which properties";
  - is published online and as XLSX;
  - since spring 2025, project-specific requirements are derived from it as **IDS** files attached to tenders.
- **Beginner mistakes warned against:** overlapping elements, multi-layer "sandwich" elements, untyped elements, empty storeys, duplicate GUIDs, and a model not at the origin or without control points.

### CH6 – Georeferenzierung in der BIM-Methodik (buildingSMART CH / swisstopo)
- **Use case CH.1507.04** (approved 2021-04-15) recommends IFC georeferencing via **LoGeoRef50**, i.e. `IfcMapConversion` + `IfcProjectedCRS`. LoGeoRef40 (translation/rotation in `IfcGeometricRepresentationContext`) is the fallback.
- **Scale:** a scale change, if any, is stated with at least 5 decimal places and documented in the BEP.
- **Steps for local building projects (swisstopo):**
  1. "Festlegen des Projektnullpunktes vor Projektbeginn" (fix the project zero before starting).
  2. Document the transformation (translation, rotation, scale) in the BEP.
  3. "Erstellen der Pyramiden für die Georeferenzierung" (create the georeferencing pyramids).
  4. "Erstellen und Zuweisen des Psets" (create and assign a georeferencing Pset).
- **CRS:** EPSG:2056 (CH1903+/LV95) for position and EPSG:5728 (LN02) for height. "In der Schweiz entfällt die Angabe einer Kartenzone" (no map zone needed in CH).
- **IFC4:** Institut Digitales Bauen FHNW: "Ab IFC Version 4 empfehlen wir die Georeferenzierung mit IfcMapConversion".
- **Viewer pitfall:** some viewers misplace EPSG:2056 data. An open ifc-lite issue reports a "location in the Atlantic". Test the export in the target CDE and viewer.

### CH7 – Bauen digital Schweiz: LOIN Grundlagen / Hochbau (2023)
- Based on SN EN 17412-1. The Grundlagen document "beschreibt die Methode zur Definition des Level of Information Need" (describes the method for defining the LOIN). The application documents for Hochbau and Landschaftsarchitektur describe the requirements "methodisch und beispielhaft" (methodically and by example).
- **Earlier Swiss BIM LOIN definition (2018):** the client defines LOIN as "Grundlage für die Ableitung des Level of Geometry (LOG) und des Level of Information (LOI)" (the basis for deriving LOG and LOI).
- **Implication:** Swiss practice is moving away from fixed "LOD 100–500" ladders. Requirements are stated per use case, per element and per milestone (what, why, when, by whom). It is still common for guides to use 100–500 labels as shorthand.
- No concrete per-element tables were visible in the excerpts.

### CH8 – SIA 2051 (2017, withdrawn end of 2024)
- It was a use-case and role guideline with no element modelling rules, superseded by SN EN ISO 19650.
- armasuisse's arIMMO team built its standards on SIA 2051.
- **Do not cite it as current.**

### CH9 – armasuisse Immobilien
- **Exchange formats:** "setzt beim Austausch von BIM-Daten auf das Dateiformat IDS (alternativ IFC und COBie)". Requirements are exchanged as IDS; IFC and COBie are the alternatives.
- **Checking:** automated in the "PrüfCloud powered by Solibri".
- **Ordering documents:** BIM-capable Bestellunterlagen since autumn 2023, plus a first version of an **Elementplan**.
- **Focus:** the information requirements of construction management and FM. "Die Informationsanforderungen sind zentral, um nach Bauabschluss ein Gebäude effizient zu betreiben" (information requirements are central to operating the building efficiently).
- **Shared federal basis:** "Gemeinsame Vorgaben von den Bau- und Liegenschaftsorganen des Bundes (armasuisse Immobilien, BBL, ETH-Rat sowie ASTRA)".

### CH10 – Stadt Zürich (AHB / IMMO)
- **BIM@IMMO:**
  - binding annexes A Zielkatalog, B Leistungskatalog, C Bauwerkskennzeichnung, D Richtlinie Bauwerksmodelle (D not retrieved);
  - storey code set by the owner, example "OG01";
  - room code assigned by the contractor in agreement with the owner, example "OG01002", i.e. storey code + 3-digit number;
  - room number unique per building (CAFM-Richtlinie).
- **AHB CAD-Richtlinie storey codes:**

  | Code | Storey |
  |---|---|
  | E00 | Erdgeschoss (ground floor) |
  | O01–O99 | Obergeschosse (upper floors) |
  | U01–U99 | Untergeschosse (basements) |
  | D01–D99 | Dachgeschosse (attic floors) |

  Other Swiss owners use similar schemes (UZH, Kanton ZH Immobilienamt Kennzeichnungskonzept, Kanton SG).
- **Area model:** Kanton ZH HBA/IMMO "Richtlinie Flächennachweis 2025" assigns rooms to SIA 416 / SN 504 416 usage codes (HNF, NNF, VF, FF…).

### CH11 – Kanton Zürich Tiefbauamt EIR (Feb 2024, infrastructure)
- Formats: IFC 2x3 / IFC 4.3. Annexes: Prüfprotokoll, IFC-Bauwerkstruktur, Namenskonvention, Farbkonzept, CDE folders, BEP template.
- Models are built from solids with attributes. "Annäherung an die Realität, aber keine exakte Abbildung" (an approximation of reality, not an exact copy).
- A search excerpt reported "geschlossene Volumenkörper" (closed solids) and "eine GUID pro Bauteil", stable from a given phase. The full text was not verified.
- Survey accuracy (Bestandesaufnahme): cm in general; mm for structures (Kunstbauten).

### CH12 – Kanton St. Gallen HBA Richtlinie BIM (2021)
- A client-goals and process framework. Detailed rules sit in the "Richtlinie CAD" and in "Beschriftung und Nummerierung von Gebäuden" (storey letters for sortable naming).

### CH13 – CRB eBKP-H ↔ IFC4 rule set
- eBKP-H (SN 506 511:2020) was revised "an IFC-Standard angepasst" (aligned to IFC). It introduced a second reference system B for 3D quantities (volume, count).
- Classification uses the 3-level code. Levels 1–2 "sind nicht ausgelegt, in einen ModelChecker importiert zu werden" (not intended for import into a model checker).
- "Neben der Geometrie (LOG) müssen den Bauteilen auch Informationen (LOI) zugewiesen werden … entscheidend für eine korrekte Zuordnung" (LOI is required for correct eBKP assignment).
- **Implication:** this is why SBB forbids multi-layer elements. Each eBKP element (e.g. C 2.1 load-bearing exterior wall vs. E 2 façade cladding vs. G finishes) must be its own IFC object.

### CH14 – IDC (Swiss Solibri distributor) FAQ "Modellierung für IFC"
- Model walls and columns per storey ("geschossweise").
- Place rooms automatically where possible. Manually drawn rooms must touch the bounding walls.
- **Room bottom** sits on the structural slab, with the floor build-up thickness entered as a property.
- **Room top** goes to the underside of the slab or suspended ceiling, "damit die Nettomengen stimmen" (so net quantities are correct).
- SIA 416 area checking needs IfcSpace plus the structural elements (walls, columns, slabs) to compute construction areas.

### DE1 – BIM-Handbuch Bundesbauten: Arbeitshilfe Erstellung von Modellierungsvorgaben (10/2023)
- **Correct element types:** a column must be modelled as a column object, "nicht als schmale Wand", and a foundation as a foundation, "nicht als kleine Decke". This is a classic beginner mistake.
- **Sub-models of the architecture model:**
  - Rohbaumodell: load-bearing walls, columns, slabs, floor plates;
  - Raummodell: rooms;
  - Ausbaumodell: non-load-bearing interior walls, floors, finishes.
- **Storeys:**
  - "Bauteile und Elemente eines Modells sind geschossweise zu modellieren. Dazu definiert man relevante Konstruktionsebenen als Geschossebenen." Model per storey, with relevant construction levels defined as storey levels.
  - "Geschossübergreifende Bauteile sollten im Allgemeinen nicht geschossübergreifend modelliert werden. Solche Bauteile sind ebenenbezogen zu trennen." Elements spanning storeys should be split per level.
  - Questions the guide must answer, e.g. "Wie wird die Geschosshöhe bemessen (zum Beispiel von OKRD bis OKRD des oberen Geschosses)?" (how is storey height measured, e.g. top of structural slab to top of structural slab above).
- **Load-bearing classification:** load-bearing vs. non-load-bearing and interior vs. exterior walls are distinguished, i.e. the `LoadBearing` and `IsExternal` properties.
- **Origin:** "Festlegung eines gemeinsamen Modellursprungs … unerlässlich" (a shared model origin is essential). The BIM-Handbuch is product-neutral.
- **Overlaps (BBR AIA, DE3):** "Überschneidungen von Bauteilen oder Räumen sind auszuschließen" (overlaps of components or rooms must be excluded), stated as a minimum requirement.

### DE2 – BIM-Handbuch: LOIN-Konzept, Modellprüfung, Muster-BAP
- **LOIN-Konzept:** sets geometric and alphanumeric properties per model element and assigns them to discipline and project phase.
- **Modellprüfung check categories:**
  - geometric: "Duplikate / Einschlüsse" (duplicates and inclusions), "Kollisionen" (clashes);
  - structural: "geschossweise Modellierung samt Geschossbezeichnung und Geschosshöhen" (per-storey modelling with storey names and heights), checkable by rules in a model checker.
- **Muster-BAP:** "Detaillierte Anforderungen auf der Ebene der Modellelemente sind dem LOIN-Anhang … zu entnehmen" (element-level requirements live in the LOIN annex).

### DE4 – BBSR 43/2023 standardised modelling guideline (Wuppertal)
- **Status:** a generally applicable baseline, "frei von Anforderungen aus BIM-Anwendungsfällen" (free of use-case requirements), to be used inside an AIA.
- **Storeys:** "Jedes Gebäudegeschoss darf nur einmal erstellt werden" (each storey may only be created once). Storey height runs OKRD to OKRD (top of structural slab to top of structural slab), same as SBN, DE7.
- **No duplicates:** the same element must not be modelled twice, to avoid clashes and quantity errors.
- **Openings:** "Öffnungen in Bauteilen explizit als solche modelliert werden" (openings must be modelled explicitly as openings).
- **Joins:** element joins must be defined so they produce no false quantities.
- **Base lines:** "Basislinien insbesondere bei Modellelementen, die von fachübergreifender Relevanz sind, maßgeblich" (base lines are decisive for cross-discipline elements such as load-bearing exterior walls). Reference lines are defined before modelling starts.
- **Wall heights** (Wuppertal Hauptdokument), three variants:
  1. non-load-bearing interior walls from OKRD to the underside of the structural slab above;
  2. from OKFF (top of finished floor) to the underside of the slab above;
  3. as actually built.
- **Layers by LOG:** walls, slabs and roofs are modelled per layer depending on LOG. In the "hybrid" approach, structural elements (Rohdecke) are separate and the remaining build-up is grouped in packages. Example: an insulated load-bearing exterior wall is modelled as separate sub-walls.
- **Rooms:** "ein von Wänden, Decken und Böden umgebenes Volumen" (a volume enclosed by walls, slabs and floors). Rooms must be closed, must not overlap and must touch the bounding elements.

### DE5 – BIM Deutschland Muster-AIA Hochbau (2023)
- Builds on DIN EN 17412-1. LOG is grouped by HOAI phase bands (LPH 1–2, 3–4, 5–7, 8, 9).
- Shipped as template + filled example (Verwaltungsbau) + LOIN annexes (Mindestanforderungen, AWF 190, TGA).
- "Der Entwicklungsgrad verschiedener Objekte innerhalb eines Modells kann zwischen LOG und LOI durchaus variieren" (LOG and LOI may differ per object within one model).
- The LOIN annex tables were not visible in the excerpts.

### DE6 – BLB NRW Anlage 14b Modellanforderungen (v2.3, Jan 2025)
- Minimum quality and quantity requirements.
- Chapters: Modellstruktur, Ebenen und Geschosse, Geschossdecken, Türen und Fenster, Durchbrüche, technische Anlagen, Räume, Zonen, Wartungsräume/Platzhalter.
- Openings: "Durchbrüche, Schlitze, Nischen und Öffnungen" must be separate, evaluable model elements.
- Rooms: generally 3D objects enclosed by walls, slabs and floors, adjoining the bounding components directly.
- All components and parameters of Anlage 14c Parameterliste must be present.
- Deliverables: .ifc + .dwf + native.

### DE7 – SBN Niedersachsen Anwendungsleitfaden Revit (2025-08)
- "Jedes Gebäudegeschoss darf nur einmal erstellt werden, die Geschosshöhe wird dabei festgelegt von Oberkante Rohdecke (OKRD) bis OKRD des darüberliegenden Geschosses."
- Project zero = ±0.00 OKRD of the ground floor.
- Elements are modelled per storey with the matching tool (wall tool for walls, etc.). Storey-spanning elements are split per level.

### DE9 – BIM.Hamburg Leitfaden FHH (v004)
- Project-independent minimum requirements for 3D models. Model structure must be uniformly typed and hierarchical. Chapters on Projektkoordinaten and Projektnullpunkt.
- QA: volume checks for spatial closure ("räumliche Geschlossenheit") and contact surfaces between adjacent objects. Rule-based checks are done in DESITE MD.

### DE10 – DB Personenbahnhöfe BIM-Vorgaben (v3.1)
- Mandatory since 2017. Has a separate Anlage 2 Modellierungsrichtlinie and Anlage 4 Georeferenzierung (station coordinate system, project zero).
- LOI levels: "100 Grundlagenmodell, Variantenentscheidungsmodell", "200 (Gesamtmodell Stufe 1)", "300 (Gesamtmodell Stufe 2)".
- Uses a component library (Bauteilbibliothek) for standard elements.

### DE11 – DEGES (infrastructure)
- The modelling guideline becomes part of the contract. Deviations need client approval. Coordinate and height systems are as agreed in the AIA.
- Model-check checklists: model consistency incl. redundant geometric objects, closed solids, model structure per guideline, clash-free.

### DE13/DE14 – VDI 2552 Blatt 4 and DIN EN 17412-1 (paid; public metadata only)
- **VDI 2552-4 (2020):**
  - covers exchange of geometric-semantic models via vendor-neutral interfaces;
  - sets processes for defining Levels of Development for geometry and attributes;
  - names model types (Grundlagenmodell, Fachmodell, Betreibermodell).
  - A 2026-05 draft is retitled "Anforderungen an die Modellierung von Fach- und Teilmodellen".
  - Practitioner criticism: VDI 2552 is new-build oriented, and "historische Ausführungsgenauigkeit" (as-built accuracy of historic buildings) is not covered.
- **DIN EN 17412-1 / ISO 7817-1:**
  - LOIN replaces "LOD";
  - requirements are split into geometrical, alphanumerical and documentation;
  - prerequisites are purpose, milestone, actor and object breakdown.
  - The geometric facets are detail, dimensionality, location, appearance and parametric behaviour. This is from general knowledge, not confirmed in the excerpts.
  - Principle: "so viele Informationen wie nötig, aber auch nicht mehr" (as much information as needed, no more).

### DE15/DE16 – Vendor guidelines (Graphisoft DE CC BY-NC-SA; Vectorworks; e-bau eBKP-H CH)
- Define first whether the structural slab belongs below or above the storey (OKFF/FBOK vs. OKRD/DOK), and agree this with partners.
- Wall base = top of structural slab ("UK Wand = OK Rohdecke"). Joins are controlled by material priorities.
- Space variant from top of structural slab to underside of structural slab. Suspended ceiling and plenum are handled separately.
- Columns and beams use their own tools.
- "Elemente nicht gleichzeitig als Gesamtelement und als Unterelemente klassifizieren" (don't classify as both assembly and parts), because it double-counts quantities.
- Vectorworks notes that for windows and doors "eine für Deutschland verbindliche Definition gibt es bisher nicht" (no binding German definition exists yet).
- mb AEC: build elements piece by piece. Don't distort slabs to fake other elements.

### AT1/AT2 – ÖNORM A 6241-2 (2015) and derived "Richtlinie BIM-Modellierung" (2024)
- ÖNORM A 6241-2 covers BIM "Level 3-iBIM" for buildings, ties into the ASI Merkmalserver (property server), and has Anhang A modelling guide and Anhang C levels of detail (LOD 100–500).
- **Wall and slab layers** (excerpt attributed to the ÖNORM context): "Die Rohdecke ist einschichtig zu modellieren. Wände sowie Bodenplatte sind als mehrschichtige Bauteile darzustellen." The structural slab is single-layer; walls and ground slab may be multi-layer. **This conflicts with SBB**, which forbids multi-layer elements.
- **AT2 mapping:**
  - floor slab → `IfcSlab` PredefinedType `FLOOR`, "Primäres Bauelement";
  - slab steps → `IfcWall` with ObjectType "Deckensprung";
  - clear structural and architectural openings must be geometrically correct;
  - rooms are derived from bounding geometry.

### AT3 – Stadt Wien openBIM Bauverfahren (BRISE), v1.3 2025
- Bauantragsmodell (BAM) in IFC2x3 or IFC4 Add2 TC1. ÖNORM A 6241-2 applies to modelling. LOI is based on ISO 16739:2024.
- Requirements are delivered as Excel + **IDS** for automated checking.
- Storey dependency of elements and reference to storey zero ("Geschossnull") are explicit requirements.

### Generic IFC structure for stairs and openings (buildingSMART IFC4 docs, used by all guides)
- **Stairs:** `IfcStair` aggregates (`IfcRelAggregates`) one or more `IfcStairFlight` plus landings as `IfcSlab` PredefinedType `LANDING`, and `IfcRailing`. Use either a full decomposition or a single un-decomposed stair, not a mix.
- **Openings:** `IfcWall` → `IfcRelVoidsElement` → `IfcOpeningElement` → `IfcRelFillsElement` → `IfcWindow` / `IfcDoor`.
  - Energy, quantity and FM tools rely on this chain (e.g. ArchiPHYSIK: "IfcWall hat IfcOpening hat IfcWindow").
  - Openings must not be faked by cutting geometry.
  - Each window or door needs its own opening.

---

## 3. Consolidated rules by topic

The count in brackets is the number of independent sources that state the rule. The bracket lists the source IDs, plus "IFC" where the buildingSMART schema itself implies the rule. Status:
- **Strong:** 4 or more sources, or a federal and a Swiss source together.
- **Moderate:** 2–3 sources.
- **Weak / conflict:** a single source, or sources disagree.

### 3.1 Coordinates, origin, units
| Rule | Sources | Status |
|---|---|---|
| Define one shared project origin (project zero) near the building before modelling. All discipline models use the same origin | SBB CH5, swisstopo CH6, BIM-Handbuch DE1, SBN DE7, Hamburg DE9, DB DE10, DEGES DE11 (7) | Strong |
| Project zero = authoring origin (0,0,0); keep coordinates small locally. Georeference via a transformation, not by modelling at full LV95 values | SBB CH5, CH6 (2, implicit in DE1) | Moderate |
| Swiss CRS: LV95 (EPSG:2056) + LN02 (EPSG:5728). In IFC4 use `IfcMapConversion` + `IfcProjectedCRS` (LoGeoRef50). Document the transformation in the BEP | CH5, CH6, CH3/CH11 context (3) | Strong for CH |
| Add a visible marker (downward pyramid) at the project zero plus 2 extra control points to detect rotation and offset | CH5, CH6 (2) | Moderate (Swiss-specific) |
| Units are metres. Scale factor, if any, to at least 5 decimals | CH5, CH6 (2) | Moderate |
| Project zero ±0.00 = OKRD (top of structural slab) of the ground floor | SBN DE7 (1) | Weak (common practice) |

**Note for Blender to glTF:** glTF is Y-up and has no CRS. Keep the local project origin in glTF and store LV95/LN02 offset and rotation as metadata (`extras`). IFC carries the true georeference.

### 3.2 Storeys
| Rule | Sources | Status |
|---|---|---|
| Model per storey ("geschossweise"). Every element belongs to exactly one storey (IfcRelContainedInSpatialStructure) | DE1, DE2, DE4, DE7, CH14, AT3, Graphisoft DE15 (7) | Strong |
| Each storey exists exactly once (no duplicate levels) | DE4, DE7 (2) + DE2 check rule | Moderate |
| Storey elevation and height defined OKRD to OKRD (top of structural slab to top of structural slab) | DE1 (example), DE4, DE7 (3); Graphisoft notes both conventions exist, so agree one | Moderate. **Decide explicitly** |
| No empty IfcBuildingStorey in export | SBB CH5b (1) + DE2 checks | Moderate |
| Consistent storey naming/codes, sortable (e.g. Swiss: U01, E00, O01, D01 or OG01; room = storey + nnn) | Stadt ZH CH10, Kanton SG CH12, UZH, BIM@IMMO (3+) | Strong for CH (scheme varies by owner) |

### 3.3 Walls
| Rule | Sources | Status |
|---|---|---|
| Do not run walls through several storeys; split at each storey | DE1, DE4, DE7, CH14, BBSR cost report (5) | Strong |
| Wall base on top of the structural slab (OKRD). Top to the underside of the structural slab above (load-bearing) | DE4 (variant 1), DE15 ("UK Wand = OK Rohdecke") (2) | Moderate. Wuppertal also allows OKFF-based or as-built variants |
| Use the wall tool/class only for walls. Never use thin walls as columns or slabs as foundations | DE1 (1, emphatic) + DE15 | Moderate. **Beginner mistake** |
| Distinguish load-bearing / non-load-bearing and exterior / interior (Pset_WallCommon.LoadBearing, IsExternal) | DE1, BLB DE6 (14c params), AT2 (3) | Moderate |
| Layering: either separate single-layer elements for core vs. insulation vs. cladding/finish (SBB: multi-layer forbidden for eBKP), or multi-layer walls allowed (ÖNORM: walls multi-layer, structural slab single-layer). Wuppertal: depends on LOG ("hybrid": structure separate, rest as package) | CH5 vs AT1 vs DE4 | **Conflict.** For CH federal and eBKP-H, separate core from finish. At LOD 200, one wall with core thickness is acceptable |
| Define reference/base lines (e.g. wall axis or exterior face of load-bearing walls) before modelling. Keep them consistent across disciplines | DE4 (1) | Weak |
| Joins must not produce overlapping volumes or double quantities. Model straight segments joined cleanly | DE4, DE3 (no overlaps), CH5 (overlap-free), DE11 (4) | Strong (as "no overlaps") |

### 3.4 Slabs, floors, roofs
| Rule | Sources | Status |
|---|---|---|
| Structural slab as its own element (`IfcSlab` FLOOR), single-layer. Floor build-up/screed as a separate element or as a room property | AT1/AT2, CH5 (no multi-layer), DE4 hybrid, CH14 (floor build-up thickness on room) (4) | Strong |
| Slab steps modelled explicitly (AT2: `IfcWall` with ObjectType "Deckensprung") | AT2 (1) | Weak |
| Slab openings (stair wells, shafts) as explicit openings, not by drawing the slab outline around them | DE4, DE6 (2) | Moderate |
| Don't distort slabs to imitate other elements | DE15/mb AEC (1) | Weak |
| Roof: `IfcRoof` as a container of `IfcSlab` ROOF and `IfcBeam` (rafters). Roof layers per LOG | IFC schema, DE4 (layers per LOG) (2) | Moderate (detail not found in excerpts) |

### 3.5 Columns, beams, foundations
| Rule | Sources | Status |
|---|---|---|
| Columns (`IfcColumn`) and beams (`IfcBeam`) as separate elements with their own tools/classes. Not merged into walls or slabs | DE1, DE15, CH14, BBSR cost report (4) | Strong |
| Columns per storey | CH14, BBSR cost report (2) | Moderate |
| Foundations as `IfcFooting`, not as small slabs | DE1 (1) | Moderate. **Beginner mistake** |

### 3.6 Stairs
| Rule | Sources | Status |
|---|---|---|
| `IfcStair` as an assembly of `IfcStairFlight`(s) + landings `IfcSlab` LANDING + `IfcRailing`. Flights and landings not merged into one mesh | IFC4 docs, Digital Building LU, BBSR cost report (IfcStair) (3) | Moderate |
| Do not classify both the assembly and the parts with quantities (double-counting) | DE15 (1) | Weak |
| Stair in storey of its base. Stair flight height = storey height (OK to OK) | Zürich area guideline (1) | Weak |

### 3.7 Openings, doors, windows
| Rule | Sources | Status |
|---|---|---|
| Doors and windows are hosted in walls: `IfcOpeningElement` voids the wall, and `IfcDoor`/`IfcWindow` fills the opening | DE4, DE6, IFC, cadwork/ArchiPHYSIK practice, AT2 (5) | Strong |
| One opening per door/window. The host must be the wall it physically sits in | Graphisoft/Revit practice (2) | Moderate |
| Recesses, slots and penetrations as separate, evaluable elements | DE6 (1) | Weak |
| Clear structural/architectural opening dimensions geometrically correct | AT2 (1) | Weak |

### 3.8 Spaces / rooms
| Rule | Sources | Status |
|---|---|---|
| Rooms modelled as `IfcSpace`: closed volumes, bounded by walls/slabs, touching the bounding elements, no overlap | DE3, DE4, DE6, DE7, CH14, Hamburg (closure checks) (6) | Strong |
| Space bottom on structural slab or finished floor. Top to underside of the slab or suspended ceiling, so net areas and volumes are correct. Agree and document the convention | CH14, DE15 (2) | Moderate |
| Net areas per SIA 416 (CH) / DIN 277 (DE): rooms need usage codes (HNF/NNF/VF/FF); sum of room polygons = NGF | CH10 (Kanton ZH Flächennachweis), Kanton LU Flächenhandbuch, CH14 (3) | Strong for CH |
| Unique room number per building, derived from storey code | CH10 (BIM@IMMO, CAFM) (1–2) | Moderate |

### 3.9 Element classes, types and attributes (LOI)
| Rule | Sources | Status |
|---|---|---|
| Use the correct IFC class per element (no `IfcBuildingElementProxy` where a proper class exists) | DE1, DE15, CH14, CH5 (FDK mapping) (4) | Strong |
| All elements typed (IfcTypeObject / consistent type names) | CH5, Hamburg DE9 ("einheitlich typisiert") (2) | Moderate |
| Stable, unique GlobalIds per element. Don't regenerate on re-export | CH5b, CH11 (2) | Moderate |
| Minimum attributes come from an owner data catalogue (SBB FDK, BLB 14c, armasuisse Elementplan, Stadt ZH Elementplan, KBOB data catalogue). Deliver and verify via **IDS** | CH5c, CH9, CH10, DE6, AT3 (5) | Strong (trend: IDS) |
| Classification: eBKP-H 3-level code in CH (SN 506 511, CRB IFC4 rule set). DIN 276 in DE. Uniclass not used by DACH public owners | CH13, CH5, CH10 (3) | Strong for CH |
| LOG and LOI may differ per element within one model. Specify per element and milestone (LOIN), "so much as needed, not more" | DE5, CH7, DE14 (3) | Strong |

### 3.10 Model structure, files, naming
| Rule | Sources | Status |
|---|---|---|
| One model per discipline (architecture: structure / rooms / finishes may be sub-models). File-size cap (Stadt ZH: ≤150 MB) | CH4, DE1, CH5 (3) | Strong |
| File naming convention from the owner (SBB Anhang A XLSX, Basel-Stadt Richtlinie Bezeichnungen, Kanton ZH TBA) | CH5, Basel-Stadt, CH11 (3) | Strong (content owner-specific) |

### 3.11 Quality checks
| Check | Sources | Status |
|---|---|---|
| Clash-free within and between discipline models (relevant clashes) | CH5, DE2, DE11, DE9 (4) | Strong |
| No duplicates / inclusions / redundant geometry | DE2, DE4, DE11 (3) | Strong |
| Closed solids (watertight volumes) | CH11, DE11, Hamburg DE9 (3) | Strong |
| Every element assigned to a storey. Storey names and heights per guideline. No empty storeys | DE2, CH5b, AT3 (3) | Strong |
| Required attributes present and valid (rule-based checker: Solibri PrüfCloud, DESITE, IDS validation) | CH5c, CH9, DE9, AT3 (4) | Strong |
| Delivery with a check protocol (Prüfprotokoll) | CH11, CH5c (2) | Moderate |

---

## 4. Typical beginner mistakes named or implied by the guides
1. **Columns modelled as short walls, foundations as small slabs** (DE1: "nicht als schmale Wand" / "nicht als kleine Decke").
2. **Walls or columns running through several storeys** instead of being split per level (DE1, DE4, DE7, CH14).
3. **Storeys created twice or empty storeys exported** (DE4, DE7, CH5b).
4. **Overlapping or duplicate elements**, causing double quantities and clashes (CH5, DE3, DE4, DE2).
5. **Multi-layer "sandwich" walls** where the owner needs separate eBKP elements (CH5). Conversely, unclear layer convention (AT1 vs CH5).
6. **Openings faked by cutting or modelling around** instead of `IfcOpeningElement` + door/window fill. Windows not hosted in their wall (DE4, DE6, practice).
7. **Rooms not touching walls, overlapping, or of inconsistent height** (OKFF vs OKRD vs underside of ceiling), so net areas are wrong (DE4, CH14, DE15).
8. **Wrong IFC class / generic proxies**, untyped elements (CH5, DE1).
9. **Model far from origin** or each discipline with its own origin. Missing georeference or control points (CH5, CH6, DE1).
10. **Assembly and parts both carrying quantities**, e.g. stair plus flights (DE15).
11. **Regenerated GUIDs** between deliveries (CH5b, CH11).

---

## 5. Implications for an AI-agent guide (Blender → glTF + IFC4, LOD 200–300, historic/public buildings)

These are suggestions synthesised from the above, not quotes.

**Origin and georeference**
- Local project origin at ground-floor OKRD near a building corner. Metres.
- Document LV95 E/N, LN02 height and rotation (true north) in an IFC4 `IfcMapConversion`/`IfcProjectedCRS` (EPSG:2056 / EPSG:5728).
- Mirror them in glTF `extras`.

**Spatial structure**
- `IfcProject > IfcSite > IfcBuilding > IfcBuildingStorey`. One storey per level, no empty storeys.
- Storey elevation = OKRD.
- Swiss-style codes (e.g. U01, E00, O01, D01, or OG01) in `Name`, plus the long name.

**Walls**
- One `IfcWall` per storey, straight segments. Base on OKRD, top at the underside of the slab above (or under the roof).
- A single body with the total as-measured thickness and one material, plus `LoadBearing` and `IsExternal`.
- Per the scope update (section 0), there is no core/finish split at any LOD. That split only matters for eBKP-H cost quantities, which are out of scope.

**Other elements**
- **Slabs:** `IfcSlab` FLOOR, single structural layer. Openings for stairwells. Roof as `IfcRoof` with `IfcSlab` ROOF parts.
- **Columns and beams:** `IfcColumn` and `IfcBeam`, per storey. Never walls or slabs.
- **Stairs:** `IfcStair` aggregating `IfcStairFlight` and `IfcSlab` LANDING (+ `IfcRailing`). No single merged mesh.
- **Doors and windows:** `IfcOpeningElement` voiding the host wall, filled by `IfcDoor`/`IfcWindow`. One opening each.
- **Spaces:** `IfcSpace` per room, closed, touching walls, no overlaps. Height to the underside of the slab or ceiling. Name = room number (storey code + nnn), LongName = function. Usage code (SIA 416: HNF/NNF/VF/FF) for areas.

**LOI minimum**
- Name, ObjectType/type name, stable GlobalId, storey containment.
- Pset_*Common (`IsExternal`, `LoadBearing`, `FireRating` if known).
- eBKP-H code (Classification reference).
- **For historic buildings, add a custom Pset** with data source (scan / plan / photo / estimate), accuracy class (LOA) and survey date. Guides do not prescribe this: VDI 2552 is criticised for not covering historic accuracy. It is consistent with LOIN "documentation" requirements and with separating LOA from LOG.

**QA before export**
- Clash and duplicate check.
- Every element on a storey.
- Closed solids.
- No proxies where a proper class exists.
- Required properties present, ideally validated against an IDS.

---

## 6. Search provenance
All content came from WebSearch result excerpts (2026-10-09) for the URLs in the table. WebFetch failed (DNS) for every host, so no document was read in full. Before publishing rules as quotations, re-verify against the PDFs, especially SBB IM-70018 v7.0 Anhang B, BBSR 43/2023 element chapters and KBOB annexes.
