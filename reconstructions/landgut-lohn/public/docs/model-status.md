# Landgut Lohn – model status

[← Published files](../README.md)

Version **v004** (5 October 2026). Only this version is published; v001–v003 are kept in the private authoring workspace. An experimental reconstruction made with 3D modelling software from documentary evidence; it is not a survey and not an engineering model. Every exported object carries its evidence class (`lohn_basis`: measured, inferred or placeholder), a source note and a confidence.

## Changes from v003

- **Surroundings**: 500 × 500 m instead of about ±75 m. Terrain follows the cadastral land cover (roads, fields, meadows, gardens, water) with colours taken from the 2024 aerial photo. 64 neighbouring buildings come from the current swissBUILDINGS3D release (2026-05-20). Walls and basins come from the cadastral survey. 830 trees are placed from the 2023 LiDAR canopy. Inside the Landgut parcel, the garden areas, hedges and 136 trees (with species) follow the BBL green inventory. Trees are generic shapes, not species models.
- **Dollhouse**: the whole exterior shell is removed, including the plaster on the inside of the exterior walls, the curtains and the floor edges inside the walls.
- **Roof**: the roof surface is open under the dormers and the north frontispiece, so their windows look into the attic. The Dependance dormers sit where the 2023 LiDAR shows them, with their windows above the roof surface.
- **Stair hall**: the niche under the stair eye is open towards the Vorraum, as the tour shows. v003 had a wall there.
- **Doors**: leaves open into rooms, not into halls and corridors. Where the 2019 tour shows a door, its hand follows the photo.
- **Materials**: base colours use realistic reflectance (painted white 0.80, plaster about 0.70, sandstone about 0.43), so facades no longer burn out in sunlight.
- **Archive drawings**: sections and facades of 1939–1971 from the BBL archive confirm the dormers and the frontispiece, the open stair eye and the storey heights within 2–14 cm.

## What the model contains

| Part | Content | Basis |
|---|---|---|
| Main house | Ground floor (EG), 1. OG, attic (Dachgeschoss): walls with plan thicknesses, window and door openings, slabs, ceilings, floor finishes, open-well stone stair and service stair to the attic, two Tuscan columns, tiled stoves and fireplaces | Floor plans 2005 (calibrated, fitted to the cadastral footprint, RMS 0.087 m); heights from the 2019 360° tour; archive sections 1939 |
| Envelope | Hipped roof with eave kick and ridge cap, south pediment, north frontispiece with two windows, segmental west pediment, two north dormers, five chimneys; west portico with four sandstone piers and upper loggia balustrade; window surrounds, open shutters, corner pilasters and plinth | swissSURFACE3D 2023 point cloud (roof), tour panoramas and archive facades 1939–1971 |
| Peristyl | Glazed gallery of 1959/60 with posts, glazed bays, gable roof and segmental ceiling | Plan, point cloud, tour |
| Dependance | Ground floor with the Speisesaal and service rooms; upper storey under the half-hipped roof with two east dormers | Plan, point cloud, tour (Speisesaal) |
| Furnishing | Representative furniture in photographed rooms (Speisesaal, Churchill-Zimmer, Damenzimmer, Kleines Esszimmer), ten chandeliers, curtains in nine rooms | Positions measured from panorama angles; generic shared types, not replicas |
| Surroundings | Terrain and land cover (500 × 500 m), neighbouring buildings, walls, basins, hedges, trees and planters | swissALTI3D 2025, swissSURFACE3D 2023, swissBUILDINGS3D 3.0, SWISSIMAGE 2024 (colours), © swisstopo (OGD); cadastral survey (open data); BBL green inventory |

## Accuracy figures

| Check | Result |
|---|---|
| Footprint vs cadastral survey (12 corners) | RMS 0.087 m, maximum 0.117 m |
| Roof vs swissSURFACE3D 2023 (building points above the eaves) | Main house median −0.007 m, 88 % within ±0.15 m; Dependance −0.005 m, 95 %; Peristyl 0.003 m, 97 % |
| Panorama poses (22 nodes) | Bearing RMS 0.0–2.6°, median 0.6° |
| Storey heights | EG clear 3.68 m, EG → 1. OG 4.09 m (1939 section: 4.11 m), 1. OG clear 2.90 m (2.89 m), Speisesaal 3.05 m |
| Model walls vs plan wall lines | 85 % (EG) and 88 % (1. OG) of plan wall-line length within 5 cm of the model |
| Model vs panoramas | Renders from the 22 solved panorama viewpoints compared with the tour; edge agreement above chance at 20 of 22 viewpoints |
| Trees vs swisstopo vegetation | 279 of 446 swisstopo single trees within 3 m of a model tree |

## Inferred or unknown

- Attic and Dependance upper storey: there are no photographs. Floor levels, the riser count of the attic stair and the size of the Dependance dormer windows are inferred, and several attic partitions are not resolved. Attic door hands follow a rule.
- East facades: no exterior photograph or drawing in the evidence set; sills and heads follow the rules measured inside.
- Cornices, stucco ceilings, panelling, parquet patterns, carpets and art are not modelled; wall colours follow the tour.
- Furniture is representative; most rooms are unfurnished.
- Trees and hedges are generic shapes sized from the LiDAR canopy; species are recorded where the green inventory gives them.

## Downloads

The catalog in `models/` lists the v004 building and surroundings GLBs, the BIM product registry (557 products, 387 types) and an IFC4 reference model (IFCZIP, tessellated, schema-validated; not tested in a receiving application).
