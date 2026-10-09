# International BIM modelling guidelines and LOD/LOI standards: research notes

[← Research](README.md) · [BIM modelling guide](../README.md)

Purpose: input for a consolidated best-practice guide for AI agents that model existing or historic buildings (mostly in Blender with Bonsai/IfcOpenShell), export glTF for a three.js viewer and IFC4 for a CDE, at LOD 200–300 geometry with basic but consistent LOI.

Research date: 2026-10-09.

**Scope (user update).** IFC (ISO 16739, IFC4) is the foundation. The target is a **reduced, light architectural / CAFM as-built survey model**. The following are **not modelled**: MEP and technical equipment, systems, detailed structure (connections, reinforcement, structural analysis), multi-layer wall build-ups, and simulation or energy data. Columns and beams appear only as *architectural* elements (visible, single-profile solids). Walls are single-layer (mean thickness). The emphasis is on FM/CAFM handover minimums (section 2.11), as-built / existing-conditions specs (section 2.10) and architectural element rules. Where sources below mention structural or MEP detail, it is listed only for context and should be left out of the guide.

## 0. Access and evidence notes

How I gathered the material, and what that means for how far each claim can be trusted:

- **WebFetch could not resolve any host except github.com** in this session (`getaddrinfo ENOTFOUND` for bimforum.org, bimforum.global, buildingsmart.org, historicengland.org.uk, natspec.com.au, theseus.fi, tudelft.nl and others). The bash proxy status page was blocked. So **I did not open any of the primary PDFs.** Evidence comes from three places:
  1. **WebSearch result extracts.** The search engine reads the PDFs and returns short verbatim snippets. Quotes marked **[V-search]** come from these.
  2. **GitHub repositories cloned locally.** These are fully verified: buildingSMART/IDS, buildingSMART/ifc-gherkin-rules (the Validation Service rules), buildingSMART/IFC4.3.x-development (the IFC docs) and buildingSMART/Sample-Test-Files. Quotes marked **[V-repo]** come from these.
  3. **My prior knowledge of these documents.** Marked **[R]** (recalled, not re-verified in this session). Treat [R] items as plausible paraphrase. Check them against the PDF before you quote them as normative text.
- Sources whose primary text I could **not** read at all: COBIM Series 3 and 6, Statsbygg BIM Manual 1.2.1 and the SIMBA 2.x requirement sets, the NATSPEC NBG and its matrix, the AEC (UK) BIM Technology Protocol, the USACE M3 spreadsheet, the GSA guides, NYC DDC, BCA BIM Guide v2, Historic England HEAG154 and the full BIMForum element tables. For each of these I give whatever the search snippets confirmed, plus clearly marked [R] content.
- Rules that directly target the beginner mistakes listed in the brief are marked **[BEGINNER]**.

---

## 1. Source table

| # | Title | Publisher | Year / version | URL (PDF where known) | Licence / redistribution | Access achieved |
|---|---|---|---|---|---|---|
| 1 | Level of Development (LOD) Specification Part I (+ Part II spreadsheet) | BIMForum (USA), with BIMForum Global / Ecuador | 2025 edition (released 31 Dec 2025). 2024 edition still widely cited | 2025: https://bimforum.org/wp-content/uploads/2026/01/LOD-Spec-2025-Part-I-Official.pdf (an earlier link also seen: https://bimforum.org/wp-content/uploads/2024/12/LOD-Spec-2025-Part-I-Official.pdf). BIMForum Global 2025 EN: https://bimforum.global/wp-content/uploads/dae-uploads/BIMForum-Global_2025_LOD_ENG_2025-12-26_final.pdf. 2024: https://bimforum.org/wp-content/uploads/2024/11/LOD-Spec-2024-Part-I-official-English.pdf. Hub: https://bimforum.org/lod/ | Part I CC BY-NC-ND 4.0, Part II CC BY-NC 4.0 [V-search]. Older reprints say "No portions of this work may be reproduced … without the express written permission". **Do not copy tables; cite and paraphrase.** | Search snippets only |
| 2 | Common BIM Requirements 2012 (COBIM), Series 1–13 (S1 General, S2 Modelling of the starting situation, S3 Architectural design, S6 Quality assurance) | buildingSMART Finland (originally Senate Properties and others) | v1.0, 2012 (Finnish 27 Mar 2012, EN later) | Wiki: https://wiki.buildingsmart.fi/en/04_Guidelines_and_Standards/COBIM_Requirements. S1 PDF: https://drive.buildingsmart.fi/s/nrd3G3qzj6pYWyq. RT cards: RT 10-11066 en … RT 10-11076 en (https://kortistot.rakennustieto.fi/) | No explicit licence found. Freely downloadable from the bSFI drive | Snippets only. S3/S6 PDFs not located |
| 3 | Statsbygg BIM Manual 1.2.1 and SIMBA 2.0 / 2.1 / SIMBA X (existing buildings) | Statsbygg (Norway) | Manual 1.2.1 (2013). SIMBA 1.3 (IFC2x3), 2.0 (IFC4), X (existing). 2.1 referenced by Cobuilder | https://sites.google.com/view/simba-bim-krav (mvdXML + PDF). bSI UCM: https://ucm.buildingsmart.org/use-case-details/2553/en. GlobalBIM: https://globalbim.org/info-collection/statsbygg-bim-requirements-existing-buildings | Not stated in snippets | Snippets only |
| 4 | BIM basis ILS (v2) and BIM base IDS. English predecessor: "BIM Basic Information Delivery Manual (IDM)" | BIM Loket / buildingSMART Benelux (NL) | ILS 2.0 (2019/2020). UCM entry Rev 2, 2022. EN IDM 2018 (v1.01) | EN: https://www.icis.org/wp-content/uploads/2018/07/2018_BIM-basic-IDM.pdf. NL course copy: https://www.han.nl/opleidingen/post-hbo/bim-digitaal-data-beheer/bim-BIM-basis-ILS-versie-2.pdf. Tool manuals: https://digigo.nu/wp-content/uploads/2023/11/Archicad_-_BIM_basis_ILS2_0-ppt-handleiding_20201013-1.pdf, https://dl.construsoft.com/files/nl/Revit_BIM_basis_ILS_Handleiding_2_01_exp2.pdf. UCM: https://ucm.buildingsmart.org/use-case-details/2594 | UCM documents CC BY-NC-SA 4.0 [V-search] | Snippets plus the **demo IDS file [V-repo]** |
| 5 | NATSPEC National BIM Guide (NBG) and BIM Object/Element Matrix | NATSPEC (Australia) | NBG v1.0 2011 (later revisions). Matrix v1.0 Sep 2011 (`NATSPEC_BIM_Object-Element_Matrix_v1.0_Sep_2011.xls`) | https://www.natspec.com.au/ (NBG pages). Matrix catalogue: https://ipweaq.intersearch.com.au/ipweaqjspui/handle/1/2378 | "All rights reserved" (catalogue). Free download, **not redistributable** | Snippets only |
| 6 | NBS BIM Object Standard | NBS (UK) | First 2014, revised since (v2.x) | https://www.thenbs.com/our-tools/nbs-bim-object-standard | Free with an NBS account. No open licence | Snippets only |
| 7 | ISO 7817-1:2024 Level of information need (replaces EN 17412-1:2020) and UK BIM Framework guidance (ISO 19650 guidance, "Guidance D" on LOIN) | ISO / BSI / UK BIM Framework | 2024 | https://www.iso.org/standard/82914.html. https://www.ukbimframework.org/ | ISO: paid. UK BIM Framework guidance: free, © | Snippets only |
| 8 | AEC (UK) BIM Technology Protocol | AEC (UK) initiative | v2.1.1, June 2015 | https://aecuk.files.wordpress.com/2015/06/aecukbimtechnologyprotocol-v2-1-1-201506022.pdf | Free download. No open licence stated | Snippets only |
| 9 | USACE Minimum Modeling Matrix (M3) and ECB 2018-7 | US Army Corps of Engineers / CAD-BIM Technology Center | ECB 2018-7 rev 2/3 | https://www.wbdg.org/FFC/ARMYCOE/COEECB/ecb_2018_7_rev_2.pdf (rev 3: https://stg.wbdg.org/FFC/ARMYCOE/COEECB/ecb_2018_7_rev_3.pdf). M3 is hosted by the CAD-BIM TC via WBDG | US government work (generally public domain) | Snippets only |
| 10 | GSA BIM Guide Series (01 overview, 02 Spatial Program Validation, 03 3D imaging, …) | US GSA | Series 02 v0.90 (2006), v1.0 (2007) | https://www.gsa.gov/bim (series PDFs). NBIMS-US V3 4.3 SPV: https://www.nibs.org/files/pdfs/nbimsv3/NBIMS-US_V3_4.3_Design_to_Spatial_Validation_SPV.pdf | US government work | Snippets only |
| 11 | NYC DDC BIM Guidelines | NYC Dept. of Design + Construction | July 2012 | https://a860-gpp.nyc.gov/downloads/37720d223?locale=en | Public document | Snippets (table of contents) only |
| 12 | BIM Project Execution Planning Guide | Penn State CIC | v3.0, 2021 | https://psu.pb.unizin.org/bimprojectexecutionplanning/ | **CC BY-SA 4.0** [V-search] | Snippets only |
| 13 | Singapore BIM Guide v2 and IFC-SG Resource Toolkit (CORENET X) | BCA Singapore | BIM Guide v2.0 Aug 2013. IFC-SG toolkit (current) | https://www1.bca.gov.sg/regulatory-info/building-control/corenet-x/resources/ifc-sg-resource-toolkit | © BCA. Templates optional | Snippets only |
| 14 | IFC4 ADD2 TC1 (ISO 16739-1:2018) and IFC4.3 docs | buildingSMART International | IFC4.0.2.1. IFC4.3.2.0 | https://standards.buildingsmart.org/IFC/RELEASE/IFC4/ADD2_TC1/HTML/. Source: https://github.com/buildingSMART/IFC4.3.x-development | Docs repo: open on GitHub | **Repo verified (4.3 docs)** |
| 15 | IFC Validation Service normative rules (Gherkin) | buildingSMART International | 2024–2026 (living) | https://github.com/buildingSMART/ifc-gherkin-rules | **MIT** [V-repo] | **Repo verified** |
| 16 | Information Delivery Specification (IDS) 1.0 | buildingSMART International | 1.0 final, June 2024 | https://github.com/buildingSMART/IDS | **CC BY-ND 4.0** [V-repo] | **Repo verified** |
| 17 | IFC Implementation Agreements (CV-2x3-xxx) | buildingSMART International | 2x3 era (2008+) | https://standards.buildingsmart.org/documents/Implementation/IFC_Implementation_Agreements/ | © bSI | Snippets only |
| 18 | User Guide for Geo-referencing in IFC | buildingSMART Australasia | v2.0, Jan 2020 (v1 Aug 2018 "Model Setup IDM") | https://ucm.buildingsmart.org/use-case-details/2047/en | UCM (registration) | Snippets only |
| 19 | bSDD (buildingSMART Data Dictionary) | buildingSMART International | live service | https://search.bsdd.buildingsmart.org/ | Per-dictionary licences | Background only |
| 20 | BIM for Heritage: Developing a Historic Building Information Model (HEAG154) | Historic England (Antonopoulou & Bryan) | July 2017 | https://historicengland.org.uk/images-books/publications/bim-for-heritage/ | © Historic England, free PDF | Snippets only |
| 21 | The Application of BIM within a Heritage Science Context (Research Report 29/2017, Ramboll) | Historic England | 2017 | https://archaeologydataservice.ac.uk/catalogue/adsdata/arch-1893-1/dissemination/pdf/englishh2-291356_1.pdf | © HE | Table of contents only |
| 22 | Level of Accuracy (LOA) Specification Guide | USIBD | v3.1, 21 Jan 2025 (v3.0 2019) | https://usibd.org/ (free download after sign-up) | © USIBD | Snippets (secondary) |
| 23 | Madaster BIM–IFC guidelines (builds on BIM basis ILS) | Madaster | current | https://docs.madaster.com/files/ch/en/Madaster%20BIM%20-%20IFC%20guidelines_EN.pdf | © | Snippets |
| 24 | VA BIM Manual v2.2 (origin of the Object/Element Matrix) | US Dept. of Veterans Affairs | v2.2, Nov 2016 | https://www.cfm.va.gov/til/bim/BIM-Manual.pdf | US government work | Snippet |
| 25 | NZ BIM Handbook Appendix C (LOD definitions) | BIMinNZ | Apr 2019 | https://www.globalbim.org/wp-content/uploads/2024/01/NZ-BIM-Handbook-Appendix_C-Levels-of-development-definitions-April-19-2.pdf | © | Snippet |

---

## 2. Per-source sections

### 2.1 BIMForum LOD Specification (USA), 2024 and 2025 editions

**Scope and licence.** The specification covers LOD 100, 200, 300, 350 and 400 per *element*, not per model. Elements are organised by Uniformat (with OmniClass and Uniclass cross-references). Part I (PDF) is CC BY-NC-ND 4.0. Part II (spreadsheet of attribute tables) is CC BY-NC 4.0 [V-search]. The NC-ND licence means **we must not paste its tables into our guide**. Paraphrase and link instead.

**Fundamental definitions.** The classic wording below is from the 2013–2020 editions. It matches the AIA G202 wording and is reproduced in many secondary sources [V-search for LOD 300, R for the others]:
- **LOD 100**: The element may be graphically represented with a symbol or other generic representation, but does not satisfy LOD 200. Information (e.g. cost per m²) can be derived from other elements. [R]
- **LOD 200**: "The Model Element is graphically represented within the Model as a generic system, object, or assembly with approximate quantities, size, shape, location, and orientation." [R; widely quoted]
- **LOD 300**: "The Model Element is graphically represented within the Model as a specific system, object or assembly in terms of quantity, size, shape, location, and orientation." [V-search] BIMForum interpretation: quantity, size, shape, location and orientation "can be measured directly from the model without referring to non-modelled information such as notes or dimension call-outs" [V-search, paraphrased by the forum source].
- **LOD 350**: As LOD 300 "… and interfaces with other building systems". This covers supports, connections and clearances needed for coordination. [R; the secondary sources describe it this way]
- **LOD 400**: "… specific system, object or assembly in terms of size, shape, location, quantity, and orientation with detailing, fabrication, assembly, and installation information." [V-search via BDC quote of the older spec]

**2022+ reinterpretation.** The 2024 text says: "LOD 200 elements are generic placeholders but are recognizable as the components they represent (e.g. a pump, a light fixture, a beam, etc.). Any information derived from LOD 200 elements must be considered approximate." [V-search] The 2022 change replaced the 2013 idea of LOD 200 as a mere space-reservation volume: LOD 200 now requires recognisable geometry [V-search].

**Envelope rule (very useful for agents).** "at 200 the surfaces may be approximate but must encompass the extents of the element, at 300 they must be accurate." [V-search, 2024]

**Spaces rule.** "LOD of spaces shall not exceed the LOD of the bounding elements. For example, if interior partitions are defined at LOD200, the space objects for the project cannot be delivered at LOD300." Element modelling for spaces at LOD 200 includes "Vertical bounding elements at LOD200; Space objects that automatically associate with vertical bounding elements" [V-search, 2018/2019].

**Element-specific content I could verify (search extracts):**
- **Interior partitions, C1010** (2023 public-comment draft). LOD 200: "Approximate overall wall thickness represented by a single assembly." LOD 300: "Single model element separated by type". **[BEGINNER]** One element per wall type, not one blob.
- **Exterior walls, B2010.** At 200: generic wall objects, "layouts and locations still flexible". At 300, openings are modelled ("openings with any dimension greater than 6" (15 cm) or as noted", surface slopes) [V-search, 2023, attribution to B2010 uncertain]. 350: "All penetrations, modeled at rough opening dimensions" [V-search, element attribution uncertain].
- **Slabs.** 2025 slab-on-grade LOD 200: "Generic slab with approximate thickness". LOD 300: overall size, thickness and geometry, "openings requiring formwork, depressions, edge turndowns, surface slopes, area of influence" [V-search].
- **Columns and beams (B1010 floor structural frame).** The scope "includ[es] columns, girders, beams, trusses, joists". Steel columns at 300: specific section type and size, planned openings [V-search]. Bridging and connections come at 350/400. **[BEGINNER]** Structural framing elements are modelled as their own elements.
- **Stairs (2025).** LOD 200: "Reliable number and arrangement of landings and flights". LOD 300 inclusions: "Overall geometry of landings and flights; Number of risers and treads; Tread width; Riser height; Stringers; Railing; Edge of nosing; Railing element envelope". LOD 350: railing support locations, openings in structural elements, hangers and brackets [V-search, via TU Delft course excerpt]. **[BEGINNER]** Flights, landings and railings are distinct parts.
- **Ceilings** (C2050 Ceiling finishes, suspended ceiling construction) exist as sections. A "Ceiling suspension grid" inclusion appears (level not visible) [V-search].
- **Doors** (B2050 exterior, C1030 interior), **windows** (B2020), **roofs** (B30), **furnishings/casework** (E-sections) exist as sections, but their inclusion text was not returned. See the [R] content in the LOD table in section 4.

**Not about accuracy.** BIMForum LOD defines reliability and content, not survey tolerance. For scan-based existing-condition models, pair LOD with USIBD LOA (2.17). [V-search: "The BIMForum spec itself does not … tie LOD levels to numeric measurement tolerances."]

### 2.2 COBIM 2012 (Finland)

The search confirmed that COBIM 2012 is based on the Senate Properties 2007 BIM requirements and was released as Series 1–13 [V-search]. It is used as a contract appendix and exists in EN/ET/ES.

Confirmed rules (via search extracts of S1/S3 and RT-card summaries):
- **S1: model with the intended tools [BEGINNER].** "all model elements should be modeled using the intended components and tools", i.e. walls with wall tools and slabs with slab tools. If a tool is unsuitable, the workaround is documented in the **Model Description Document** [V-search, paraphrase].
- **S3: the architect's model is the base model.** "the architect's BIM is mandatory for all the design phases … the foundation for all other models" [V-search]. Requirements come in **three levels** that are adjusted per model purpose [V-search].
- **S3: the space model.** The spatial model must let space types, areas and total building volume be obtained automatically [V-search].
- **S1: building element BIM.** It contains the building elements "in the form they are intended to be implemented" [V-search].
- **S6: quality assurance.** Each discipline checks its own model before publishing. Official QA is done by the BIM coordinator. Checks include duplicate building elements, spaces having gross area, and space heights against requirements [V-search via thesis on COBIM Solibri ruleset]. Clash analysis is also covered.
- **S2: starting situation (inventory model).** Existing building and site modelled as source information. 16 pages [V-search]. Accuracy tables not retrieved.

Recalled, not re-verified [R]. These are commonly cited COBIM S3 practices:
- Model storey by storey. Vertical elements (walls, columns) are split at each storey and run from the storey's floor (top of slab) to the underside of the slab above. Floors and slabs are modelled with the slab tool and belong to the storey whose floor they form. **[BEGINNER]**
- Walls are modelled as straight segments joined at their ends. Composite (layered) walls may be one element, or split into core and lining when needed.
- Doors and windows are library objects inserted into walls (hosted). Openings are made by the hosted object, not by manual geometry cuts. **[BEGINNER]**
- Spaces are modelled for every room, with a number and name. Space height goes to the underside of the slab or ceiling. Spaces must not overlap.
- The inventory (existing) model has its own accuracy classes and defines what is measured versus assumed. Unknown structures are flagged.

### 2.3 Statsbygg (Norway): BIM Manual 1.2.1 and SIMBA

Verified [V-search]:
- Manual 1.2 (2011) and 1.2.1 (2013). SIMBA 2.0 "contains a completely new set of requirements (requirement set templates), independent of requirements in previous BIM manuals", targeting **IFC4 only**, split into 7 disciplines × 4 phases. Published as **mvdXML plus PDF**.
- Principle: "all requirements that Statsbygg defines for models (BIM) that can be checked automatically should be checked automatically".
- **SIMBA X (existing buildings)** is "the 'base' requirement set, which assumes that the only source of data for creating the model (BIM) is a scan. It contains requirements for the correct use of object types, and a few selected properties that can be set on the basis of the scan." This is the closest official analogue to our use case: correct entity types plus a small, honest property set.
- Example machine rules quoted in a model-checking paper: "the site name shall contain the official ID"; "the space names should be unique" [V-search].

Recalled [R]. Typical Statsbygg 1.2.1 rules: use the correct IFC entity, with IfcBuildingElementProxy only when no suitable entity exists. Every object is assigned to an IfcBuildingStorey. IfcSpace is required for all rooms, with a unique number. Georeferencing uses the national grid (EUREF89 UTM/NTM) and NN2000 heights. Units are SI (metre/millimetre). Storey elevations and names follow agreed lists.

### 2.4 BIM basis ILS (NL) and its IDS: the "minimal consistent LOI" concept

The concept is a deliberately tiny, universal set of agreements that every model must satisfy regardless of project, so models are "uitwisselbaar, gestructureerd, eenduidig, correct, volledig en herbruikbaar" (exchangeable, structured, unambiguous, correct, complete, reusable) [V-repo, demo IDS description].

Verified rules (English 2018 IDM, NL v2 course text, tool manuals, buildingSMART demo IDS):
1. **File name.** Consistent across discipline models, e.g. `<Building>_<Discipline>_<Component>` [V-search].
2. **Local position and orientation.** Agree on a zero point and orientation early and use them for all models. "use a physical object as point of origin, positioned at 0.0.0., and also export this to IFC" [V-search]. The demo IDS encodes this as exactly one IfcBuildingElementProxy whose name contains "nulpunt" [V-repo]. Madaster's variant: "Ensure that the project zero point is related to the RD coordinate" [V-search].
3. **Storeys and naming.** "Allocate all objects to the correct level." Name storeys only via IfcBuildingStorey Name, numerically sortable with text, e.g. "00 ground floor", "01 first floor" [V-search]. IDS: "Ken alle objecten aan de juiste bouwlaag toe. Benoem alleen bouwlagen als IfcBuildingStorey." (Assign every object to the right storey. Define only storeys as IfcBuildingStorey.) [V-repo] **[BEGINNER]**
4. **Correct entity.** "Use the most appropriate type of BIM entity, both in the source application and the IFC entity", e.g. IfcWall, IfcSlab, IfcBeam, IfcColumn, IfcStair, IfcDoor. Madaster adds: "Avoid the use of the IFC entity 'Building element proxy' and 'Building element part'." [V-search] **[BEGINNER]**
5. **Type and name.** "Correctly enter the object TYPE (ifcType, ifcObjectType …). Where applicable, also correctly enter the Name" [V-search].
6. **Classification.** Four-digit NL-SfB on every object (IDS: "Voorzie objecten altijd van een viercijferige NL-SfB code", i.e. always give objects a four-digit NL-SfB code) [V-repo]. Other countries use their own system (Madaster CH: eBKP).
7. **Material.** "Allocate objects with a material description (ifcMaterial)." [V-search]
8. **Properties.** Use buildingSMART standard Psets where possible. **LoadBearing**, **IsExternal**, and **FireRating** "when applicable" (Pset_*Common) [V-search; LoadBearing/IsExternal/FireRating also visible as classification files in the Solibri ruleset repo, V-repo].
9. **No duplicates or intersections.** "There are no duplicates or intersections permitted. Make sure this is checked in IFC." [V-search] **[BEGINNER]**
10. Madaster extras: unique GUIDs, export Base Quantities, renovation status or phase (Existing/Demolish/New), prefer IFC4 export [V-search].

Sample files: `IDS_demo_BIM-basis-ILS.ids` in buildingSMART/IDS (CC BY-ND 4.0, three specs: lokale positie, bouwlaagindeling, classificatie; note it is IFC2X3-targeted for two specs). Solibri ruleset: https://github.com/Root-bv/Solibri-ruleset-BIM-basisILS. **No licence file seen**, so treat it as not redistributable.

### 2.5 NATSPEC National BIM Guide and BIM Object/Element Matrix (Australia)

- The matrix is a spreadsheet "to be used for identifying and tracking BIM information during the project". It "depicts Building Information Typologies/Types, when they are relevant, and to what level of development (LOD) throughout a building lifecycle", referenced by OmniClass. It was adapted from the US VA Object/Element Matrix (2010). Copyright, all rights reserved [V-search].
- The NBG contains modelling requirements, BIM uses, roles, collaboration procedures and documentation standards [V-search]. State adaptations (e.g. SA DIT BP18 G168) require: "Model geometry shall comply with the requirements of the current edition of the BIM Forum – Level of Development (LOD) Specification for the applicable LOD." [V-search] (https://dit.sa.gov.au/__data/assets/pdf_file/0008/1635263/DOCS_AND_FILES-14376206-v4-Building-Information-Modelling-Requirements-BP18-G168.pdf)
- [R] The NBG also requires: model to true scale and at correct levels, use the correct object categories, avoid modelling-in-place where a parametric type exists, and include an LOD/LOI matrix in the BIM Management Plan. NATSPEC also offers a "BIM Properties Generator" spreadsheet (existence not confirmed by search).

### 2.6 United Kingdom

**NBS BIM Object Standard** [V-search]:
- Five sections: General, Information, Geometry, Functional, Metadata.
- Generic objects carry **nominal dimensions**. Manufacturer objects carry actual dimensions.
- "BIM object properties should be either assigned as type or component. All common properties should be type." **[BEGINNER]** This is the type versus instance rule.
- Unknown values: "'n/a' should be used" (do not leave fields silently empty).
- General requirements include **IFC element type and predefined type** for each object, and GUIDs.
- [R] Geometry should be simple enough for performance, with no unnecessary detail. Use symbolic or detail-level variants. Naming uses a structured, consistent convention without spaces or special characters.

**ISO 7817-1:2024 (LOIN), adopted by the UK BIM Framework** [V-search]:
- Geometrical information is specified by five aspects: **Detail, Dimensionality, Location, Appearance, Parametric behaviour** (clause 6.2). Alphanumerical information and documentation are specified separately.
- The industry is moving "away from using simple labels as 'LOD/LOG/LOI'". Requirements should state per object type exactly what is needed, for which purpose and milestone, and who needs it.
- Our guide should express its LOD 200/300 targets as a LOIN table: per element, the detail, dimensionality (3D solid), location (storey and tolerance), appearance (material colour), parametric behaviour (type-driven) and the property list.

**AEC (UK) BIM Technology Protocol v2.1.1 (2015)**: free PDF. It provides "practical guidance for adoption of the British Standards" (BS 1192 / PAS 1192, now ISO 19650) and includes Revit and AECOsim supplements [V-search]. Recalled content [R]:
- **Modelling methodology.** Model at 1:1 in true location. Every element on the correct level/storey. Use the correct category or tool (do not model a wall as a generic model or mass). Split models by building, zone and discipline. Shared coordinates are defined once and used by all.
- **Graded components.** Grade 1 "Concept", Grade 2 "Defined", Grade 3 "Rendered". Use the lowest grade adequate for the stage.
- **Naming.** Hyphen-delimited fields, no spaces. Layer naming has five fields (role-classification-presentation-description-view) per BS 1192 [V-search for layer naming].

### 2.7 USA: USACE M3, GSA, NYC DDC, Penn State

- **USACE M3.** It "establishes the minimum content requirements to include for facility model elements". Each element needs an **LOD** and a **Grade** (level of complexity) plus specific element information [V-search, ECB 2018-7]. The M3 spreadsheet itself was not retrieved. [R] Grades distinguish presence/placeholder from specific geometry. Attributes are expressed via the USACE/COBie-aligned property list.
- **GSA BIM Guide 02 (Spatial Program Validation)** sets a minimum requirement for 3D models "with such attributes as GSA net area, space name, space number, occupant organization name, GSA STAR space type, walls, slabs, columns and beams" [V-search, 2006 trade report]. Vendor implementations describe the GSA "net" space boundary that wraps pilasters and free-standing columns, and space 3D height "based on story-aware settings" [V-search]. **[BEGINNER]** Spaces, walls, slabs, columns and beams are distinct, required element classes. [R] GSA 02 also requires spaces not to overlap, every space assigned to one storey, and storeys with consistent elevations and names. Series 03 covers 3D laser scanning (existing conditions).
- **NYC DDC BIM Guidelines (2012)** give a framework for DDC public building projects ($15–50M at launch) [V-search]. [R] Requires an LOD matrix (AIA E202), models built with the appropriate element tools, coordinated origin/shared coordinates, and model QA (duplicates, clashes) before submission.
- **Penn State BIM PxP Guide v3.0 (2021)**, CC BY-SA 4.0 [V-search]. It provides the procedure (goals → BIM uses → process maps → information exchanges with LOD per Uniformat element → infrastructure). It is useful as a **licence-compatible source we can adapt** for the "information exchange worksheet" idea (per element: LOD and responsible party).

### 2.8 Singapore: BCA BIM Guide v2 and IFC-SG

- BIM Guide v2.0 (Aug 2013) contains BIM Specifications plus BIM Modelling and Collaboration Procedures [V-search].
- IFC-SG (CORENET X) toolkit steps: Industry Mapping Excel (per component: IFC entity plus required properties per agency), software templates, quick-start exercises in IFC viewers, IFC-SG Validator. Firms may use their own templates "as long as their CORENET X submission models contain the relevant data" [V-search].
- [R] The Industry Mapping requires a precise IfcEntity + PredefinedType + ObjectType for every component (e.g. IfcSlab/FLOOR, IfcStair, IfcRailing) and the `SGPset_*` properties. Storeys must be IfcBuildingStorey with proper elevation. Proxies are generally not accepted for regulated components. This is the clearest real-world example of **"entity + predefined type + small property list"** being enforced by an automated validator.

### 2.9 buildingSMART: IFC4, validation rules, IDS, implementation agreements, georeferencing, bSDD

All verified from GitHub [V-repo] unless noted.

**Walls (IfcWall).** "Wall are usually vertical, or nearly vertical, planar elements". "_IfcWall_ with _IfcMaterialLayerSetUsage_ is used for all occurrences of walls, that have a non-changing thickness along the wall path … represented geometrically by an 'Axis' and a 'SweptSolid' shape representation". Walls without layer-set usage are for changing thickness, non-rectangular sections, non-vertical walls, or "walls having only 'Brep', or 'SurfaceModel' geometry". "An arbitrary planar element to which this semantic information is not applicable (is not predominantly vertical), shall be modeled as _IfcPlate_." In IFC4.3 IfcWallStandardCase is deprecated. In **IFC4 (our target)** it still exists, so use IfcWall (or IfcWallStandardCase for layered straight walls) consistently. → **[BEGINNER]** Prefer straight extruded segments with an Axis plus SweptSolid. Free-form Brep is allowed but loses the parametric wall semantics.

**Wall joins.** IfcRelConnectsPathElements "provides the connectivity information between two elements, which have path information", with connection type at start, middle or end. → Walls should meet at their axis end points and be explicitly connected. In practice: snap segment end points so the axes share a vertex, and miter or butt the ends (no gaps, no overlaps).

**Slabs.** "Only the core or constructional part of this construction is considered to be a slab. The upper finish (flooring, roofing) and the lower finish (ceiling, suspended ceiling) are considered to be coverings. A special type of slab is the landing". → Floor finishes and ceilings go in IfcCovering, not thicker slabs.

**Openings, doors and windows.** "A wall may have openings … defined by an _IfcOpeningElement_ attached to the wall using … _IfcRelVoidsElement_." A door can "fill an opening, typically in a wall. The door will then have a _FillsVoids_ attribute which uses the _IfcRelFillsElement_ relationship". Implementation agreements: "Opening elements shall be within the wall face or slab profile (not misused as arbitrary cuttings)" (CV-2x3-123). "Non vertical walls shall not be exchanged as instances of IfcWallStandardCase" (CV-2x3-124). For a layered/complex wall, "the opening has to be associated with the aggregate (the IfcWall) and not with the parts" (CV-2x3-134). Insertion point of doors and windows restricted relative to the opening (CV-2x3-133) [V-search]. → **[BEGINNER]** Every door and window is hosted: wall → IfcOpeningElement (void) → door/window (fill).

**Stairs.** IfcStair is either "a stair assembly entity that aggregates all parts (stair flight, landing, etc. with own representations), or a single stair entity without decomposition". In the aggregate case, IfcRelAggregates relates "_IfcStair_ with the related _IfcStairFlight_ and landings, _IfcSlab_ with _PredefinedType_=LANDING. _IfcRailing_'s belonging to the stair may also be included". MVDs may require "at least the 'Body' geometric representations shall not be provided directly at _IfcStair_ if it is an assembly". A flight "is an assembly … in a single 'run' of stair steps (not interrupted by a landing)". The Validation Service rule **BLT003** checks stair decomposition against `stair_DecompositionTable.csv`: IfcStair → {IfcStairFlight, IfcSlab, IfcRailing}. → **[BEGINNER]** Do not merge a stair into one mesh. Use IfcStair (no body) aggregating flights, landing slabs and railings.

**Columns and beams.** IfcColumn: "a vertical structural or architectural member … often aligned with a structural grid intersection". Load-bearing status comes via `Pset_ColumnCommon.LoadBearing`. The preferred representation is a profile swept along the axis (IfcMaterialProfileSetUsage). → **[BEGINNER]** Columns and beams are separate elements with profiles, not parts of wall or slab meshes.

**Proxies.** IfcBuildingElementProxy may be used "To exchange special types of building elements for which the current specification does not yet provide a semantic definition" or when applications cannot provide one. Formal proposition HasObjectName: "A _Name_ attribute should be asserted for a building element proxy." In IFC4.3 it should no longer be used for spatial placeholders (use IfcVirtualElement). → **[BEGINNER]** Proxy is a last resort and must be named.

**Spatial structure and containment.** Validation rule **SPS007** (implementer agreement): "Instances of IfcElement must be part of a spatial structure" (except feature elements and aggregated parts). "Entities that are an aggregated part of another element must not also be part of a spatial structure" (also **SPS003**). IfcRelContainedInSpatialStructure: "Any element can only be assigned once … an element can only be contained within a single spatial structure element". Multi-storey elements are contained in one storey and referenced in others via IfcRelReferencedInSpatialStructure ("A multi-storey space is contained … at which its ground level is, but it is referenced by all the other building storeys"). **SPS001**: at most one IfcSite and at least one IfcBuilding. **SPS002**: spatial composition per table (IfcBuildingStorey → IfcBuilding; IfcSpace → IfcBuildingStorey/IfcSpace/…; IfcBuilding → IfcSite/IfcProject). **PJS002**: building elements must not be attached to IfcProject via IfcRelDeclares. → **[BEGINNER]** Every physical element is contained in exactly one storey. Parts of an assembly (flight in a stair) are not.

**Storeys and spaces.** A storey "has an elevation and typically represents a (nearly) horizontal aggregation of spaces"; PARTIAL storeys exist for split levels. IfcSpace "is associated to a building storey"; "View definitions and implementation agreements may restrict spaces with the same _CompositionType_ to be non-overlapping". Naming: "_Name_ holds the unique name (or space number) … _LongName_ holds the full name … _ObjectType_ holds the space type". **GEM002** checks IfcSpace Body representation.

**Types.** **OJT001**: if PredefinedType = USERDEFINED then ObjectType (or ElementType on the type) must be filled. If a type object has a real PredefinedType, the occurrence's PredefinedType must be empty. IFC formal propositions "CorrectTypeAssigned": the type must match (IfcDoor ↔ IfcDoorType, etc.). → **[BEGINNER]** Doors, windows and furniture get an IfcXxxType shared by identical instances. Instances carry only placement and instance-specific values.

**Properties and quantities.** **PSE001**: any property set starting `Pset_` must be a correctly defined standard Pset (correct names and data types). **PSE002**: custom Psets must not start with "Pset_" in any capitalisation. **QTY001**: same for `Qto_`.

**Georeferencing.** **GRF003** (industry practice, currently `@no-activation`): a model with IfcBuilding in IFC4 "must" have at least one IfcProjectedCRS. **GRF002/004**: CRS name must be a valid `EPSG:` code. **GRF005**: IfcMapConversion.Scale must be used when CRS units differ from project units. **GRF001**: identical coordinate operations across contexts. User Guide for Geo-referencing (bSI ANZ v2.0, 2020): keep the local origin and use IfcMapConversion to place it on the projected CRS ("the IFC file can continue to use its local zero point (0,0,0) … IfcMapConversion then includes all information needed to position the local zero point") [V-search, forum summary]. → Keep geometry near the origin in Blender (float precision, glTF), and put real-world coordinates only in IfcMapConversion (Eastings, Northings, OrthogonalHeight, XAxisAbscissa/Ordinate, Scale) plus IfcProjectedCRS (e.g. "EPSG:2056" for Swiss LV95).

**Units and geometry.** **PJS001**: conversion-based units must be valid. **GEM051/052**: a geometric context with subcontexts (Body, Axis…) must be present. **BRP001–003 / TAS001**: faces must be planar and not self-intersecting. **GEM111**: no duplicate points in polylines. IDS: "Numerical measure values are represented in IDS files using SI units" (so 2.4 m height = 2.4 even if the model is in mm). Validator errors noted by users: negative lengths (e.g. a slab top below its storey exported as a negative quantity) are invalid [V-search].

**IDS 1.0** (final standard June 2024 [V-search]). It is "a buildingSMART standard for specifying and checking simple information requirements from IFC models" [V-repo]. Six facets: Entity (+PredefinedType), Attribute, Classification, Property, Material, PartOf (relations IfcRelAggregates, IfcRelContainedInSpatialStructure, IfcRelNests, IfcRelVoidsElement/FillsElement…). "It cannot be used to require certain geometry" [V-search]. PartOf note [V-repo]: "Every object must have a single primary location container in IFC, even though they may be referenced in multiple locations (such as a multi-storey column)." → We can write our own minimal-LOI IDS and check exports with IfcOpenShell's `ifctester`.

**bSDD** [R]: an online dictionary of classes and properties (incl. IFC, Uniclass, NL-SfB, national ones) with URIs. IDS facets may reference bSDD URIs. Useful for consistent property names, but not required for a basic LOI.

### 2.10 Heritage and existing buildings (HBIM)

- **Historic England, BIM for Heritage (HEAG154, July 2017).** Guidance plus case studies. The Harmondsworth Barn sample model "was developed to Level of Detail (LOD) 2 with representative geometry of each major part of the building" [V-search]. Commentary on the guidance [V-search, pbctoday]: historic buildings are irregular, so accurate modelling "involves either creating very complicated elements or subdividing them"; "for most projects a relatively low Level of Detail is recommended, since the attached information is the key aspect"; "laser scan data is more appropriate than even the most detailed BIM model for metrically accurate data". **→ Key principle for our agents: representative, semantically correct, segmented geometry plus link to the survey. Do not try to sculpt the point cloud.**
- **HE Research Report 29/2017 (Ramboll)** has sections on Level of Detail, Level of Information, classification of surveys, Harmondsworth Barn "Modelling and LoD", and Iron Bridge "Hybrid modelling" (parametric elements combined with mesh for irregular parts) [V-search, table of contents].
- **Academic HBIM practice** [V-search]: irregular walls with variable section need higher LOD/LOI than new build. The GOG/GOA ("grades of generation / accuracy") from Politecnico di Milano's scan-to-HBIM work keeps modelled objects following the logic of the surveyed element.
- **USIBD LOA v3.1 (2025)**, at 95% confidence [V-search, secondary table]: LOA10 > 50 mm (user-defined upper bound); LOA20 50–15 mm; LOA30 15–5 mm; LOA40 5–1 mm; LOA50 1–0 mm. Specify LOA separately for **measured** accuracy (the scan) and **represented** accuracy (the model).
- **Scan-to-BIM practice** [V-search, industry]: survey firms say scan-based deliverables typically meet **LOD 200**, and LOD 300 is the "wisest" maximum for surveyed existing spaces, because hidden conditions (inside walls, under floors) cannot be verified.
- **SIMBA X** (2.3): an existing-building model from scan is checked for correct object types plus a few scan-derivable properties.
- **COBIM S2**: inventory model of the existing building (accuracy tables not retrieved).

**How to model irregular historic walls as segments** (synthesis; no single official source prescribes this. It follows from IfcWall semantics, HE's "subdividing" remark, LOA and the BIMForum envelope rule):
1. Per storey, fit a **straight mean plane per wall run** between corners or junctions (least-squares on the scan). Split a run into additional straight segments where the deviation from the mean plane exceeds the agreed represented-accuracy band (e.g. LOA20 → 15–50 mm; for LOD 200 a 50 mm band is typical).
2. Model each segment as an extruded IfcWall with constant **mean thickness** (layer set). Record measured min/max thickness and out-of-plumb or batter in properties (e.g. custom Pset `…_Survey`: `ThicknessMin`, `ThicknessMax`, `OutOfPlumb`, `LOA`).
3. Tapered or battered walls with a significant lean: keep as IfcWall with a non-vertical extrusion or a clipped SweptSolid. **Not** as IfcWallStandardCase (CV-2x3-124), and not as a mesh blob.
4. Truly sculptural parts (vaults, mouldings, irregular rubble faces) can be a separate element with mesh/Brep geometry (IfcCovering, IfcMember, IfcBuildingElementProxy with Name and ObjectType, or IfcWall with Brep), linked to the parent. This is the "hybrid modelling" approach. Keep these as an exception, not the default.
5. Respect the envelope rule. At LOD 200 the approximate surfaces must still encompass the element's extents, so a mean-plane wall must not be thinner than the real wall over most of its length.

### 2.11 FM / CAFM handover minimums (COBie-lite) and as-built requirements

**Additional sources (all search-extract level):**

| Title | Publisher | Year | URL | Licence |
|---|---|---|---|---|
| COBie (NBIMS-US V3 section 4.2) | NIBS (USA) | 2015 (COBie 2.4) | https://nibs.org/nbims/v3/cobie/4-2/ | NBIMS-US: free, © NIBS |
| BS 1192-4:2014 (COBie code of practice, UK) | BSI | 2014 | (paid / was free via BSI) | © BSI |
| UK BIM Alliance: Guide to what data is required | UK BIM Alliance / BEAMA | ~2019 | https://www.beama.org.uk/static/98bf5d8b-1fb8-4954-8c066266bdfd9ead/UK-BIM-Alliance-Guide-to-what-data-is-required-for-BIM-level-2.pdf | © |
| Alberta Infrastructure COBie requirements v2 | Gov. of Alberta | ~2020 | https://www.alberta.ca/system/files/tr-goa-ai-tsb-spe-cobie-requirements-v2.pdf | © (public) |
| GSA BIM Guide 08 – Facility Management | US GSA | v1 2011 (posted 1/2012) | https://origin-www.gsa.gov/system/files/largedocs/BIM_Guide_Series_Facility_Management.pdf | US gov work |
| GSA BIM Guide 03 – 3D Laser Scanning | US GSA | v1.0 2009 | https://www.gsa.gov/bim | US gov work |
| Penn State PxP Appendix B-21 "Capture Existing Conditions" | Penn State | 2021 | https://psu.pb.unizin.org/bimprojectexecutionplanning/back-matter/use-capture-existing-conditions/ | CC BY-SA 4.0 |
| IFC Qto_SpaceBaseQuantities | buildingSMART | IFC4 / 4.3 | https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/Qto_SpaceBaseQuantities.htm | © bSI |

**COBie structure as a "lite" FM checklist** [V-search]:
- Required worksheets in practice are Contact, Facility, Floor, Space, Type, Component. Zone and Attribute are required only if specified (Bentley's implementation of the NIBS requirements). System is often also required, but it is **out of our scope** (no MEP).
- Row rules (Autodesk COBie guidance): "One row for each vertical level"; "One space per functional use"; "One row for each scheduled product type"; "One row for each individual scheduled product". So doors, windows and furniture are Type + Component.
- "Most of the data required for the Facility, including it's Floor, Spaces, and Zones can easily be exported from the 3D model as it is related to location/geometry", while Type/Component data needs client-specified attributes (UK BIM Alliance).
- Key field is always `Name` (NBIMS-US). Unknown fields: "Information that is not available or not applicable for a given field shall be set as 'n/a'" (Alberta). The same convention appears in the NBS Object Standard.
- Scope of assets: "only assets that are relevant for operation and maintenance are typically included, not every modeled element" (third-party GSA COBie summary).

**Mapping COBie-lite to IFC4 for our model** (synthesis from COBie row rules + IFC docs [V-repo] + IFC Qto definitions [V-search]):
| COBie sheet | IFC4 | Minimum fields for our survey model |
|---|---|---|
| Facility | IfcProject + IfcSite + IfcBuilding | Name, Description (address via IfcPostalAddress on IfcBuilding), units, IfcMapConversion |
| Floor | IfcBuildingStorey | Name ("00 Ground floor"), Elevation, optional Description |
| Space | IfcSpace (contained in storey) | Name = room number (unique per building), LongName = room name, ObjectType or classification = usage category, `Qto_SpaceBaseQuantities.NetFloorArea`, `GrossFloorArea`, `Height` (if constant), `NetVolume`. Optional `Pset_SpaceCommon` (IsExternal, Reference) |
| Zone | IfcZone (grouping spaces) | Only if needed (e.g. fire compartment, tenant, wing) |
| Type | IfcDoorType, IfcWindowType, IfcFurnitureType, IfcWallType, IfcCoveringType, IfcRailingType … | Name, PredefinedType, Description, optional manufacturer and model (if known, else omit), nominal dimensions (OverallWidth/Height on door and window types) |
| Component | IfcDoor, IfcWindow, IfcFurniture … occurrences | Name/Tag (unique mark, e.g. "D-01.012"), type relation, containing storey, **space relation** (furniture contained in IfcSpace or referenced, doors relate to adjacent spaces), Pset_DoorCommon/Pset_WindowCommon basics (IsExternal, FireRating if known) |

**IFC space quantity definitions** (Qto_SpaceBaseQuantities, IFC4.3 docs) [V-search]:
- NetFloorArea is the "Sum of all net usable floor areas" and excludes the area covered by elements inside the space (columns, inner walls).
- GrossFloorArea "Includes the area covered by elements inside the space (columns, inner walls, etc.) and excludes the area covered by wall claddings".
- Height: "To be provided only if the space has a constant height".
- NetVolume: "excluding the volume of construction elements inside the space".
- Storey/building totals: "In case of inconsistencies, the individual quantities of spaces and construction elements take precedence."
- **Agent rule:** compute area and volume from the IfcSpace solid (not hand-entered). Space solids follow the inner wall faces (net boundary). The GSA "net" boundary wraps pilasters and free-standing columns [V-search, vendor GSA guidance]. National area standards (e.g. SIA 416, DIN 277, ISO 9836) may define areas differently, so record which standard was applied.

**GSA BIM Guide 08 (FM)** [V-search]: its goal is facility data reuse across the lifecycle, and as-built accuracy is meant "to reduce the cost & time required for renovations". Its chapters include "Required BIM Objects and Properties", "Asset Identification Number", "Maintaining and Updating As-Built BIMs", "Minimum COBie Requirements" (from a book TOC). [R] It requires a record/as-built BIM with spaces, and an asset ID per maintainable component.

**GSA BIM Guide 03 (3D laser scanning)** [V-search]: it defines tolerances for deliverables (plans, point clouds, surface models) but "tolerances for BIMs are not mentioned". "If point clouds are used, they should be delivered together with the BIM to allow the end user of the model to control the accuracy." [R] Its data-quality levels are roughly Level 1 ±51 mm, Level 2 ±13 mm, Level 3 ±6 mm, Level 4 ±3 mm, each with a minimum artifact size. Verify against the PDF before quoting.

**NYC DDC (2012)**: as-built/record-model text not retrieved. [R] It requires a record model updated to reflect field changes at closeout.

**Penn State "Capture Existing Conditions" use** [V-search]: the team must "determine what level of detail will be required to add 'value' to the project". In other words, model only what the downstream use (here FM/CAFM and viewing) needs.

**Out-of-scope reminders from FM sources:** COBie System, Job, Spare, Resource and Connection sheets and MEP equipment are excluded by the user's scope. Keep the FM layer to **Facility / Floor / Space / (Zone) / architectural Types + Components** (doors, windows, furniture, coverings, railings, stairs as assets if needed).

---

## 3. Consolidated rules by topic

The "Sources" column counts **distinct sources that state or enforce the rule**. V = verified in this session; R = recalled only. The guide should prefer rules with high V counts.

| # | Topic | Consolidated rule | Sources (count) | Beginner mistake addressed |
|---|---|---|---|---|
| 1 | Correct element class | Model every element with the tool or entity intended for it: IfcWall, IfcSlab, IfcRoof, IfcColumn, IfcBeam, IfcStair/IfcStairFlight, IfcRailing, IfcDoor, IfcWindow, IfcCovering (ceiling/floor finish), IfcFurniture/IfcFurnishingElement, IfcSpace. IfcBuildingElementProxy only as a documented last resort, always with Name and ObjectType. | V: COBIM S1, BIM basis ILS, Madaster, SIMBA X, IFC docs (proxy usage), NBS (IFC type/predefined type), IFC-SG (mapping), GSA (walls/slabs/columns/beams listed) = **8**. R: Statsbygg 1.2.1, AEC UK, NYC DDC, NATSPEC = 4 | Proxies and blobs; "wall" modelled as a generic mesh |
| 2 | Spatial containment | Exactly one IfcProject, ≤1 IfcSite, ≥1 IfcBuilding, storeys as IfcBuildingStorey only. Every physical element is contained in exactly **one** storey (the one where it starts). Multi-storey elements are additionally referenced. Aggregated parts are not contained directly. | V: bSI SPS001/002/003/007, IFC docs, IDS PartOf, BIM basis ILS (+IDS) = **4 independent**. R: COBIM, Statsbygg, GSA, IFC-SG, AEC UK = 5 | Elements not in storeys; elements attached to project or site |
| 3 | Storey naming and elevation | Storeys named consistently and sortably ("00 Ground floor", "01 First floor", "-01 Basement"). Elevation = top of structural floor (or agreed datum), used consistently. Partial storeys for split levels. | V: BIM basis ILS, IFC docs (PARTIAL) = 2. R: Statsbygg, COBIM, AEC UK, IFC-SG = 4 | Random or duplicated storey names; missing elevations |
| 4 | Walls per storey | Split vertical elements (walls, columns) per storey: base at the storey floor level, top at the underside of the slab above (or as agreed). Do not run one wall through several storeys unless it is a genuinely continuous element (then contain + reference). | V (indirect): IFC containment single-storey rule, BIM basis ILS "correct level". R (explicit): COBIM S3, AEC UK, NATSPEC, NYC DDC = **2 V + 4 R** | Full-height walls spanning all storeys; walls floating between storeys |
| 5 | Wall geometry and joins | Walls are straight (or simple arc) extruded segments with constant thickness (layer set), axis-based. Segments meet at shared axis end points with clean butt or miter joins, no gaps and no overlaps. Non-vertical or tapered walls are not IfcWallStandardCase. Non-wall planar elements are IfcPlate. | V: IFC docs (Axis+SweptSolid, IfcRelConnectsPathElements, IfcPlate note), CV-2x3-124, BIMForum (single element per type), BIM basis ILS (no intersections) = **4**. R: COBIM, AEC UK = 2 | Free-form blobs instead of straight walls; overlapping or disconnected walls |
| 6 | Wall–slab relationship | Slabs are the structural core only. Finishes and ceilings are IfcCovering. Walls stand on the slab top (or its storey floor level) and stop at the underside of the slab above. No intersections or duplicates between walls and slabs (clean joins, no double volume). Slab edges meet wall faces or run under walls, consistently per project. | V: IFC docs (slab core vs covering), BIM basis ILS and Madaster (no duplicates/intersections), COBIM S6 (duplicate checks) = **4**. R: COBIM S3 (walls to underside of slab), GSA (space height), Statsbygg = 3 | Walls not connected to floors; gaps, overlaps, slabs including finishes |
| 7 | Columns and beams (architectural) | Visible columns and beams are separate IfcColumn/IfcBeam elements with simple profile geometry, per storey, LoadBearing if known. Not merged into walls or slabs. No structural detailing (per scope). | V: IFC docs, BIMForum B1010 scope, GSA (columns/beams) = **3**. R: COBIM, USACE M3 = 2 | Missing columns and beams |
| 8 | Stairs | IfcStair as an aggregate (no own body) of IfcStairFlight(s), IfcSlab PredefinedType=LANDING and IfcRailing. Riser count, riser height and tread depth are correct at LOD 300. | V: IFC docs, bSI BLT003 + decomposition table, BIMForum 2025 stair inclusions = **3**. R: COBIM, IFC-SG = 2 | Stairs merged into one mesh |
| 9 | Railings | IfcRailing as its own element (aggregated into the stair, or contained in the storey for balconies). At 300: correct height and envelope. | V: IFC docs, BLT003, BIMForum stair inclusions ("Railing element envelope") = 3 | Railings missing or fused into stair |
| 10 | Openings, doors, windows | Doors and windows are hosted: IfcOpeningElement voids the wall (IfcRelVoidsElement), door/window fills it (IfcRelFillsElement). Opening within the wall thickness, not an arbitrary cut. Opening on the aggregate wall, not on its parts. | V: IFC docs, CV-2x3-123/133/134, BIMForum (openings modelled at 300/350) = **3** (+bSI IDS PartOf supports VOIDS/FILLS). R: COBIM, AEC UK = 2 | Doors as loose boxes in holes; no openings |
| 11 | Types vs instances | Identical doors, windows, furniture, wall build-ups and so on share one type (IfcDoorType, IfcWindowType, IfcFurnitureType, IfcWallType…). Common properties live on the type, instance-specific ones on the occurrence. Type class must match the occurrence class. PredefinedType set on type *or* occurrence, USERDEFINED needs ObjectType. In glTF, reuse one mesh per type (instancing). | V: NBS ("All common properties should be type"), bSI OJT001, IFC CorrectTypeAssigned, BIMForum ("separated by type"), BIM basis ILS (object type) = **5**. R: AEC UK, IFC-SG = 2 | No family/type/instance structure |
| 12 | Naming | Consistent, structured, ASCII, no spaces in file names (`<Building>_<Discipline>_<Part>`). Element Name = type name (or mark). Space Name = number, LongName = room name. Proxy must have Name. | V: BIM basis ILS (files, storeys), IFC docs (space Name/LongName, proxy HasObjectName), AEC UK (delimited fields), Statsbygg (unique space names, site ID) = **4**. R: NBS, NATSPEC = 2 | Default names ("Cube.034") |
| 13 | IfcSpace | One IfcSpace per room, contained in its storey, closed solid body from finished floor to the underside of the slab or ceiling. Bounded by walls, no overlaps. Name = number, LongName = function. Space LOD ≤ LOD of bounding elements. | V: BIMForum (space LOD rule), IFC docs (naming, non-overlap note), bSI GEM002, GSA (space name/number/area), COBIM S3 (space model for areas/volume), Statsbygg (unique names) = **6** | Missing rooms; spaces overlapping walls |
| 14 | Coordinates and base point | Model near the local origin with an agreed zero point and orientation shared by all models (optionally a named "zero point" marker object). Georeference with IfcMapConversion + IfcProjectedCRS (valid EPSG code, Scale if units differ). Never move geometry to large real-world coordinates. | V: BIM basis ILS (+IDS), Madaster (RD link), bSI GRF001–005, bSI georef user guide = **4**. R: Statsbygg (UTM/NN2000), AEC UK (shared coordinates), NYC DDC = 3 | Models placed at 600 km offsets; inconsistent origins between files |
| 15 | Units | SI units. Length in metres in Blender/IFC (or mm, declared correctly in IfcUnitAssignment). Valid conversion-based units only. IDS values always in SI. No negative lengths in quantities. | V: IDS units doc, bSI PJS001, validator negative-length error = 3. R: Statsbygg, COBIM = 2 | mm/m confusion (1000× scale errors) |
| 16 | Minimum LOI (properties) | Per element: Name, ObjectType/type, classification code, material, and the standard Pset_*Common props LoadBearing, IsExternal (+FireRating where known). Status/phase (Existing/Demolish/New). Base quantities. Unknown values: omit or 'n/a' per agreement, but never invent them. Custom Psets must not start with "Pset_". | V: BIM basis ILS (classification, material, LoadBearing/IsExternal/FireRating), Madaster (phase, Qto), NBS ('n/a', type properties), SIMBA X (few scan-derivable properties), bSI PSE001/002 = **5** | Empty or inconsistent properties; invented data |
| 17 | Model checking | Automate checks: schema validity (bSI Validation Service), containment, entity use, types, Psets, duplicates/intersections, space checks, plus a project IDS. Each author checks before publishing. Document deviations in a model description. | V: SIMBA ("checked automatically"), COBIM S6, BIM basis ILS (IDS), bSI Validation Service, IDS standard, IFC-SG validator = **6** | No QA loop |
| 18 | FM/CAFM minimum (COBie-lite) | Facility → Floor → Space (→ Zone) hierarchy from the model. Every room is an IfcSpace with unique number (Name), room name (LongName), usage category, and computed NetFloorArea/GrossFloorArea/Height/NetVolume. Doors, windows and furniture are Type + Component with a unique tag, linked to storey and space. 'n/a' or omit for unknowns. No MEP, System, Spare or Job data. | V: COBie/NBIMS-US (sheets, Name key, row rules), UK BIM Alliance, Alberta ('n/a'), IFC Qto definitions, GSA 02 (space name/number/area), GSA 08 (FM reuse), BIMForum (space LOD), NBS ('n/a') = **8** | No rooms, no room numbers, areas typed by hand; doors and furniture not inventoried |
| 19 | Deliver evidence with as-built model | Deliver or link the point cloud / survey with the model and state the survey date, method and LOA, so users can check accuracy. | V: GSA 03 (point cloud with BIM), USIBD LOA, Historic England (scan more accurate than model) = 3 | Model presented as more accurate than the survey |
| 20 | Existing/heritage geometry | State LOD *and* LOA separately. Scan-based models are realistically LOD 200–300. Use representative, segmented, semantic geometry. Store measured irregularity as properties. Use mesh only for genuinely sculptural parts (hybrid). Flag unverified or hidden conditions. | V: Historic England (representative LOD, subdivide, relatively low LOD), HE 29/2017 (hybrid modelling), USIBD LOA, SIMBA X, scan-to-BIM practice, BIMForum (LOD ≠ accuracy) = **6** | Sculpting the point cloud; claiming LOD 300 for unseen structure |

---

## 4. LOD 200 vs LOD 300 per element (for existing/historic buildings)

Basis: BIMForum fundamental definitions and verified inclusions (stairs, partitions, slabs, columns, spaces, envelope rule) [V-search], plus the BIMForum structure for other elements [R]. The rows were **adapted by me for scan-based existing buildings**. This is a working proposal, not BIMForum text.

| Element (IFC) | LOD 200 (generic, approximate) | LOD 300 (specific, measurable from model) | Typical beginner error |
|---|---|---|---|
| Exterior walls (IfcWall, IsExternal=TRUE) | Generic wall per storey, straight segments, approximate overall thickness as a single layer. Approximate location and height. Large openings only. Surfaces may be approximate but must encompass the wall's extent. | Specific wall type per segment with measured mean thickness as a **single layer** (no multi-layer build-up, per scope). Accurate axis, base and top (to underside of slab or roof). All openings > ~150 mm at their real size and position. Batter or out-of-plumb captured if beyond tolerance. | One mesh for the whole facade; wall thickness 0 (surface only) |
| Interior partitions (IfcWall, IsExternal=FALSE) | "Approximate overall wall thickness represented by a single assembly" [V]. | "Single model element separated by type" [V]. Accurate thickness and position. Joined to adjacent walls and to the slabs above and below. | Walls floating, not touching floors or ceilings |
| Floor slabs (IfcSlab FLOOR / BASESLAB) | "Generic slab with approximate thickness" [V]. Per storey, outline approximate. | Overall size, thickness and geometry. Openings (stair wells, shafts), depressions, steps and slopes [V, slab-on-grade]. Finishes as IfcCovering (FLOORING) if modelled. | Slab includes floor finish and ceiling; slab missing under walls |
| Roofs (IfcRoof aggregating IfcSlab ROOF / IfcMember rafters) | Generic roof mass or slabs with approximate thickness and pitch. | Specific roof planes with correct pitch, eaves and ridge heights, overall build-up thickness. Major openings (dormers, rooflights). Exposed timber elements only if architecturally relevant and visible (as simple IfcBeam/IfcMember solids). No structural detailing. | Roof as a closed blob merged with walls |
| Columns (IfcColumn), architectural only | Approximate size, shape and location. Generic profile. | Visible columns with measured section (simple rectangular/circular/I profile), position, base and top per storey. No connections or reinforcement. | Columns omitted or fused into walls |
| Beams (IfcBeam), architectural only | Only visible or space-relevant beams (downstand beams, exposed timber), approximate depth and width. | Visible beams with measured section and elevation. Exposed historic timber beams modelled individually as simple solids. No structural detailing. | Beams omitted or part of the slab mesh |
| Stairs (IfcStair aggregate) | "Reliable number and arrangement of landings and flights" [V]. Flights as generic sloping solids, landings as slabs. | Overall geometry of landings and flights. Number of risers and treads. Tread width, riser height, stringers, nosing edge, railing envelope [V]. Aggregate: IfcStairFlight + IfcSlab(LANDING) + IfcRailing. | Whole stair one mesh; landings missing |
| Railings (IfcRailing) | Generic railing (height × length envelope). | Specific height, posts or balusters at representative spacing, handrail profile. "Railing element envelope" accurate [V for stairs]. | Railing fused with stair or missing |
| Doors (IfcDoor + IfcDoorType, in IfcOpeningElement) | Generic door object, approximate size and location, hosted in a wall opening. | Specific type (single/double, swing direction, panel/frame), actual opening size and position, sill or threshold height, operation type on the type object. One type per distinct door design. | Door modelled as a box not in an opening; no types |
| Windows (IfcWindow + IfcWindowType) | Generic window, approximate size and location, hosted. | Specific type with frame, mullions or transoms, sill and head heights, partitioning type. One type per distinct window design. | Windows as holes only, or glass panes only |
| Ceilings (IfcCovering CEILING) | Generic ceiling plane at approximate height (or omitted; space height to slab). | Specific ceiling heights, bulkheads and soffits. Vaults approximated by segmented or simple surfaces. Suspension grid only if relevant. | Ceiling modelled as part of the slab |
| Floor/wall finishes (IfcCovering FLOORING / CLADDING) | Usually omitted. The finish material is recorded as a space or covering property only. | Separate thin covering element only where FM needs it (e.g. floor finish area per room, tracked material). Never merged into the slab. | Slab thickened to include finish |
| Furniture (IfcFurniture / IfcFurnishingElement + type) | Generic placeholder of approximate size and location (bounding box shaped like the item). | Specific size, location and configuration. Shared type per model, instances placed. | Every chair a unique mesh; no types |
| Casework / built-in fittings (IfcFurniture with built-in flag, or IfcBuildingElementProxy only if no better class) | Approximate overall envelope. | Specific overall size, configuration and location. Doors or drawers representative. | Built-ins merged into walls |
| Spaces (IfcSpace) | Space per room bounded by LOD 200 walls (space LOD ≤ bounding element LOD) [V]. | Accurate net boundary, height to ceiling or slab, number and name, area/volume derivable. | Spaces missing or overlapping walls |
| Openings without fill (IfcOpeningElement) | Large openings only. | All openings > ~150 mm. Niches and recesses as recess openings. | Openings cut as mesh booleans with no IfcOpeningElement |

Practical cut-off for our agents: **LOD 200 everywhere by default, LOD 300 for elements actually visible and measured in the survey** (walls, slabs at edges, stairs, openings, doors and windows, visible columns and beams). Hidden structure stays at LOD 200 and is flagged (e.g. `Pset_…Survey.Verified = FALSE`).

---

## 5. Freely redistributable sample files (GitHub)

| File / set | Repo path | Licence | Use |
|---|---|---|---|
| `Building-Architecture.ifc` (142 KB) plus Structural/Hvac/Landscaping, IFC4 ADD2 TC1 | https://github.com/buildingSMART/Sample-Test-Files, folder `IFC 4.0.2.1 (IFC 4 ADD2 TC1)/Simple-Scene/` | **CC BY 4.0** (redistributable with attribution) [V-repo] | Reference IFC4 architecture model (storeys, walls, slabs, doors, windows, types) |
| `wall-with-opening-and-window.ifc` (12 KB), `column-straight-rectangle-tessellation.ifc`, etc. | same repo, `IFC 4.0.2.1 (IFC 4 ADD2 TC1)/ISO Spec - ReferenceView_V1.2/` | CC BY 4.0 | Minimal correct hosted-opening pattern (wall → opening → window) |
| IDS examples: `IDS_demo_BIM-basis-ILS.ids`, `IDS_wooden-windows.ids` + `IDS_wooden-windows_IFC.ifc`, `IDS_SimpleBIM_examples.ids`, `IDS_ArcDox.ids` | https://github.com/buildingSMART/IDS, `Documentation/Examples/` | **CC BY-ND 4.0** (redistribute unchanged with attribution, no derivatives) [V-repo] | Templates for writing our own minimal-LOI IDS (write new files, do not modify theirs) |
| Validation rule sets (Gherkin) and `stair_DecompositionTable.csv`, `spatial_CompositionTable.csv` | https://github.com/buildingSMART/ifc-gherkin-rules, `features/rules/`, `features/resources/` | **MIT** [V-repo] | Can be copied and adapted into our own checker or guide |
| IFC 4.3 documentation sources (entity Markdown) | https://github.com/buildingSMART/IFC4.3.x-development `docs/` | Repo licence not checked in this session (bSI copyright). Cite, don't copy wholesale | Authoritative wording for IfcWall/IfcStair/etc. |
| Solibri ruleset for BIM basis ILS | https://github.com/Root-bv/Solibri-ruleset-BIM-basisILS | **No licence file found**, so not redistributable | Reference only |
| Penn State BIM PxP Guide v3.0 (web book) | https://psu.pb.unizin.org/bimprojectexecutionplanning/ (not GitHub) | **CC BY-SA 4.0** | Adaptable template text for LOD/information-exchange worksheet |

Not redistributable: BIMForum LOD Part I (CC BY-NC-ND; we may link, but must not copy or modify). BIMForum Part II (CC BY-NC; adaptation allowed only non-commercially, with attribution). NATSPEC matrix (all rights reserved). BIM basis ILS UCM docs (CC BY-NC-SA). USIBD LOA (©).

---

## 6. What I could not access (honest gaps)

- **No primary PDF was opened.** WebFetch failed on DNS for every non-GitHub host and the shell proxy check was blocked. Quotes marked [V-search] are search-engine extracts and may be slightly truncated.
- **BIMForum element tables** for exterior walls, doors, windows, roofs, ceilings, furniture and casework: inclusion text not retrieved. Those LOD table rows are my adaptation [R].
- **COBIM Series 3 and Series 6** full text: not located online. The storey-by-storey wall rule and wall-to-underside-of-slab rule are [R].
- **Statsbygg BIM Manual 1.2.1 and SIMBA 2.x mvdXML**: not retrieved (Google Sites hosted). Only principles and SIMBA X scope verified.
- **NATSPEC NBG text, NBS BIM Object Standard full clauses, AEC (UK) protocol text, USACE M3 spreadsheet, GSA guides, NYC DDC, BCA BIM Guide v2, IFC-SG Industry Mapping**: summaries only.
- **Historic England HEAG154 full text**: only the Harmondsworth "LOD 2 representative geometry" fact and third-party commentary.
- **USIBD LOA v3.1**: ranges from a secondary source (consistent with v3.0 as I recall it).
- **IFC implementation agreements**: CV-2x3-122/123/124/133/134 titles from search. Current IFC4 status is debated (forum: "IFC4 should generally have no CVs").

Suggested follow-up if network access improves: download BIMForum 2025 Part I (pages for B2010, B2020, B2050, B30, C1010, C1030, C20, C2050, E20), COBIM S3/S6 English PDFs from the bSFI drive, and Historic England HEAG154. Then upgrade the [R] items to verified.
