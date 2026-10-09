# Research

[← BIM modelling guide](../README.md)

Where the rules of the [BIM modelling guide](../README.md) come from. Researched on 2026-10-09 by agents, consolidated and checked by hand.

| Note | Content |
|---|---|
| [dach.md](dach.md) | Swiss, German and Austrian modelling guidelines, EIR templates, LOIN and CAFM/area rules (about 45 sources) |
| [international.md](international.md) | BIMForum LOD, COBIM, Statsbygg/SIMBA, BIM basis ILS, NATSPEC, NBS, UK BIM Framework, USACE, GSA, NYC DDC, Singapore, buildingSMART (IFC, IDS, validation rules), heritage and scan-to-BIM, COBie-based FM minimums (25 sources) |
| [toolchain.md](toolchain.md) | Bonsai (BlenderBIM) workflow, Blender hygiene, glTF and three.js, IFC export pitfalls from mesh workflows, checking tools; with tested snippets |
| [agent-skills.md](agent-skills.md) | Public agent skills, MCP servers and agent workflows for 3D, CAD, BIM and building survey (about 30 repositories) |
| [repo-gap-analysis.md](repo-gap-analysis.md) | The three published IFC models of this repository and reference samples, audited against the guide; recommended pipeline changes |

## How far to trust the notes

- **Primary documents were mostly not read in full.** In this research environment only GitHub and package registries were reachable; other hosts (bimforum.org, buildingsmart.org, kbob.admin.ch, sbb.ch, historicengland.org.uk and others) could not be fetched. Content therefore comes from three kinds of evidence, marked in the notes:
  - **verified in a repository**: buildingSMART IFC documentation, IDS, Validation Service rules and sample files, Bonsai documentation sources, the Blender glTF exporter documentation, Khronos guidelines, agent-skill repositories (read in full);
  - **search extracts**: short verbatim fragments of the PDFs returned by web search (DACH guides, BIMForum, COBIM, Statsbygg, BIM basis ILS, NBS, GSA and others); quote them only after checking the PDF;
  - **recalled**: the agents' prior knowledge, marked `[R]`; treat as plausible paraphrase.
- **Rules in the guide rest on agreement between sources**, not on single quotes: each rule in the consolidated tables of [dach.md](dach.md#3-consolidated-rules-by-topic) and [international.md](international.md#3-consolidated-rules-by-topic) lists how many independent sources state it. Where the sources disagree (multi-layer walls; storey elevation at top of structural slab or finished floor), the guide records its choice and why.
- **Licences.** Most guidelines are free to read but not licensed for redistribution (BIMForum Part I is CC BY-NC-ND; NATSPEC all rights reserved; BIM basis ILS documents CC BY-NC-SA). The guide paraphrases and links them; only openly licensed files were copied into [examples](../examples/README.md).
- **No BBL-specific public modelling guideline was found.** Federal requirements are expressed through the KBOB contract annexes and the joint federal strategy; internal KBOB/BBL data catalogues should be consulted and, where they differ, take precedence over this guide.

## Choices the guide makes where sources differ

| Topic | Sources say | The guide chooses | Why |
|---|---|---|---|
| Wall layers | SBB: multi-layer elements forbidden; ÖNORM A 6241-2: walls may be multi-layer; Wuppertal: depends on LOG | One solid per wall with total thickness and one material; visible finishes as separate coverings | CAFM survey model, no simulation; light for three.js; the owner's scope |
| Storey elevation | DACH new-build guides: top of structural slab (OKRD); viewer and survey practice: finished floor | Finished floor level; slabs carry the total floor thickness | Floor build-ups are not modelled; matches the viewer's level list and the evidence (tours, sections show finished floors) |
| LOD labels | ISO 7817-1 (LOIN) replaces fixed LOD ladders; many guides still use LOD 100–500 | LOD 200/300 as shorthand, defined per element with numeric tolerances for this project, plus an explicit information list (LOI) | Agents need simple targets; the definitions follow BIMForum's meaning and LOIN's per-element approach |
| Accuracy | LOD is not accuracy (BIMForum, USIBD LOA) | Separate evidence class per product (measured / inferred / unknown) with source and confidence | Reconstruction from heterogeneous evidence; honest uncertainty |
| Rooms | All FM sources: one space per room, closed, non-overlapping, area per SIA 416 / DIN 277 | `IfcSpace` from inner wall faces, number + name + computed net floor area | CAFM purpose |
| Classification | eBKP-H (CH), DIN 276 (DE), NL-SfB (NL) | Not required yet; IFC class + predefined type + project category | Keeps LOI basic; add the owner's system later through IDS |

## Most-cited sources

| Source | Publisher | Used for |
|---|---|---|
| [IFC 4 ADD2 TC1 (ISO 16739-1)](https://standards.buildingsmart.org/IFC/RELEASE/IFC4/ADD2_TC1/HTML/) | buildingSMART | classes, spatial structure, openings, stairs, types |
| [IFC Validation Service rules](https://github.com/buildingSMART/ifc-gherkin-rules) | buildingSMART | containment (SPS007), stair decomposition (BLT003), predefined types (OJT001) |
| [IDS 1.0](https://github.com/buildingSMART/IDS) | buildingSMART | machine-readable LOI |
| [LOD Specification 2025](https://bimforum.org/lod/) | BIMForum | LOD 200/300 meaning, envelope rule, stairs, partitions, spaces |
| [Common BIM Requirements 2012 (COBIM)](https://wiki.buildingsmart.fi/en/04_Guidelines_and_Standards/COBIM_Requirements) | buildingSMART Finland | model with the intended tools, per-storey modelling, space model, QA |
| [SIMBA / SIMBA X](https://sites.google.com/view/simba-bim-krav) | Statsbygg | automated checks; existing-building requirement set (correct classes, few honest properties) |
| [BIM basis ILS](https://ucm.buildingsmart.org/use-case-details/2594) | BIM Loket (NL) | the minimal consistent LOI idea |
| [SBB Regelwerk Bauwerksmodelle IM-70018](https://company.sbb.ch/de/bahnentwicklung/zukunft-bahn/bim/planen/regelwerk-bauwerksmodelle.html) | SBB | no overlaps, typed elements, no multi-layer elements, project zero with control points, IDS |
| [BIM-Handbuch Bundesbauten: Modellierungsvorgaben](https://bundesbau.de/fileadmin/user_upload/BIM_Roadmap/bbau_ah_modellierungsvorgaben_231107_zh.pdf) | BMWSB / BBR | per-storey modelling, correct element tools ("not a column as a narrow wall") |
| [BBSR-Online 43/2023 standardised modelling guideline](https://www.bbsr.bund.de/BBSR/DE/veroeffentlichungen/bbsr-online/2023/bbsr-online-43-2023-dl.pdf?__blob=publicationFile&v=3) | BBSR / Uni Wuppertal | storeys once, no duplicates, explicit openings, rooms closed and touching walls |
| [Georeferenzierung in der BIM-Methodik](https://www.swisstopo.admin.ch/dam/de/sd-web/sjjLXXkQU868/20220429-Georeferenzierung-BIM-Methodik-DE.pdf) | swisstopo / buildingSMART CH | LV95/LN02 via `IfcMapConversion` |
| [Richtlinie Flächenerfassung (RFB)](https://www.stadt-zuerich.ch/content/dam/web/de/planen-bauen/bauvorschriften-und-planerische-grundlagen/dokumente/standards-richtlinien-immo/computer-aided-facility-management-cafm/richtlinie-flaechenerfassung-und-erstellung-bewirtschaftungsplaene.pdf), [Handbuch Flächendefinition](https://immobilien.lu.ch/-/media/Immobilien/Dokumente/Leistungen/Planen_Bauen/23031W_Flaechendefinition_Version_11.pdf), [UZH Raumbezeichnung](https://www.ib.uzh.ch/dam/jcr:7592b488-3a86-4fc1-a879-cb5432e890c6/Richtlinie_Gebaeude_Geschoss_und_Raumbezeichnung_UZH.pdf) | Stadt Zürich, Kanton Luzern, UZH | rooms, room numbering, SIA 416 areas |
| [BIM for Heritage (HEAG154)](https://historicengland.org.uk/images-books/publications/bim-for-heritage/) | Historic England | representative, segmented geometry for historic buildings |
| [Asset Creation Guidelines](https://github.com/KhronosGroup/3DC-Asset-Creation/blob/main/asset-creation-guidelines/RealtimeAssetCreationGuidelines.md), [glTF Blender IO docs](https://github.com/KhronosGroup/glTF-Blender-IO/blob/main/docs/blender_docs/scene_gltf2.rst) | Khronos | real-time geometry, mesh reuse, extras |
| [Bonsai documentation](https://github.com/IfcOpenShell/IfcOpenShell/tree/v0.9.0/src/bonsai/docs) | IfcOpenShell | what a clean IFC wall, opening, stair and type look like |

The full source tables with URLs, versions, licences and access status are in the four notes.
