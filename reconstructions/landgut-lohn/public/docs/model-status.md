# Landgut Lohn – model status

[← Published files](../README.md)

Version **v006** (6 October 2026). Only this version is published; v001–v005 are kept in the private authoring workspace. An experimental reconstruction made with 3D modelling software from documentary evidence; it is not a survey and not an engineering model. Every exported object carries its evidence class (`lohn_basis`: measured, inferred or placeholder), a source note and a confidence.

## Changes from v005

- **Interiors**: 17 rooms that appear in the 2019 360° tour are furnished as photographed – the Salon, Speisesaal, Rauchzimmer, Kleines Esszimmer, Garderobe, Halle and corridors on the ground floor, and the Obere Halle, Churchill-, Damen-, Mittel-, Biedermeier- and Kreidolf-Zimmer upstairs. Each piece is placed where it stands in the panorama: 303 pieces, built from 24 parametric families (chairs, armchairs, sofas, beds, tables, chests, wardrobes, a built-in china cabinet, clocks, mirrors, pictures, carpets, lamps, chandeliers, door curtains). Pieces of the same kind and size share one type and are drawn as instances. Pictures are frames with a neutral canvas and carpets show their main colours only; no artwork is reproduced.
- **Room finishes**: skirting, dado, panel mouldings and cornices in 11 rooms, following the panelling seen in the tour.
- **Corrections**: the opening between the Vorsaal and the Speisesaal is a double door; the line in front of the Churchill-Zimmer stove was not a wall; the west window of the Rauchzimmer is closed on the room side; the corridors and the upper hall have stone floors.

## What the model contains

| Part | Content | Basis |
|---|---|---|
| Main house | Ground floor (EG), 1. OG, attic (Dachgeschoss): walls with plan thicknesses, window and door openings, slabs, ceilings, floor finishes, open-well stone stair (28 steps, two landings, stone string) and service stair to the attic, two Tuscan columns, tiled stoves and fireplaces | Floor plans 2005 (calibrated, fitted to the cadastral footprint, RMS 0.087 m); heights from the 2019 360° tour; archive sections 1939 |
| Envelope | Hipped roof with eave kick and ridge cap, south pediment, north frontispiece with two windows, segmental west pediment, two north dormers, five chimneys; west portico with four sandstone piers and upper loggia balustrade; window surrounds, open shutters, corner pilasters and plinth | swissSURFACE3D 2023 point cloud (roof), tour panoramas and archive facades 1939–1971 |
| Peristyl | Glazed gallery of 1959/60 with posts, glazed bays, gable roof and segmental ceiling | Plan, point cloud, tour |
| Dependance | Ground floor with the Speisesaal and service rooms; upper storey under the half-hipped roof with two east dormers | Plan, point cloud, tour (Speisesaal) |
| Interiors | 303 pieces of furniture and decoration in 17 photographed rooms, chandeliers, curtains and door curtains; skirting, dado, panelling and cornices in 11 rooms | Positions read from the 2019 panoramas (floor contacts, wall planes) and set against the walls; parametric shared types in the period styles seen, not replicas |
| Surroundings | Terrain and land cover (500 × 500 m), neighbouring buildings, walls, basins, hedges, trees and planters | swissALTI3D 2025, swissSURFACE3D 2023, swissBUILDINGS3D 3.0, SWISSIMAGE 2024 (colours), © swisstopo (OGD); cadastral survey (open data); BBL green inventory |

## Accuracy figures

| Check | Result |
|---|---|
| Footprint vs cadastral survey (12 corners) | RMS 0.087 m, maximum 0.117 m |
| Roof vs swissSURFACE3D 2023 (building points above the eaves) | Main house median −0.005 m, 87 % within ±0.15 m; Dependance −0.005 m, 96 %; Peristyl 0.003 m, 97 % |
| Panorama poses (22 nodes) | Bearing RMS 0.0–2.6°, median 0.6° |
| Storey heights | EG clear 3.68 m, EG → 1. OG 4.09 m (1939 section: 4.11 m), 1. OG clear 2.90 m (2.89 m), Speisesaal 3.05 m |
| Model walls vs plan wall lines | 83 % (EG) and 87 % (1. OG) of plan wall-line length within 5 cm of the model (the stair string and the stove front line are not counted as walls) |
| Model vs panoramas | Renders from the 22 solved panorama viewpoints compared with the tour; edge agreement above chance at 21 of 22 viewpoints (the forecourt view is dominated by trees) |
| Trees vs swisstopo vegetation | 279 of 446 swisstopo single trees within 3 m of a model tree |

## Inferred or unknown

- Attic and Dependance upper storey: there are no photographs. Floor levels and the size of the Dependance dormer windows are inferred, and several attic partitions are not resolved. Attic door hands follow a rule.
- East facades: no exterior photograph or drawing in the evidence set; sills and heads follow the rules measured inside.
- Stucco ceilings, parquet patterns, wallpaper and fabric patterns, porcelain and small objects are not modelled; pictures and carpets carry no imagery; wall colours follow the tour.
- Furniture shapes are simplified period types. Where the camera height of a panorama was not measured, positions are inferred and the pieces are set against the walls. Rooms without photographs (attic, Dependance upper storey, service rooms) stay unfurnished.
- Trees and hedges are generic shapes sized from the LiDAR canopy; species are recorded where the green inventory gives them.

## Downloads

The catalog in `models/` lists the v006 building and surroundings GLBs, the BIM product registry (864 products, 641 types) and an IFC4 reference model (IFCZIP, tessellated, schema-validated; not tested in a receiving application).
