# GlobalBuildingAtlas for surrounding buildings

[Terrain workflow](terrain-and-surroundings.md) · [Elevation sources](elevation-sources.md) · [New reconstruction](adding-a-building.md)

Checked 8 October 2026. [GlobalBuildingAtlas](https://github.com/zhu-xlab/GlobalBuildingAtlas) is a candidate for estimated context buildings where surveyed heights are unavailable. It does not supply the ground DTM needed to place them, detailed roof shapes, facade textures or interiors.

## Product and limitations

The [paper](https://essd.copernicus.org/articles/17/6647/2025/) describes heights predicted from 3 m PlanetScope imagery, principally 2019 with 2018 gap filling. Its LoD1 product assigns the maximum predicted height within each footprint. European validation height RMSE is **4.1 m**, an aggregate statistic, not a per-building tolerance. `var` represents prediction variation, not a surveyed accuracy certificate. Treat heights as inferred, and investigate low values, tall towers and mixed-height footprints before use.

## Access and licences

| Part | Published licence | Source |
|---|---|---|
| OSM/Microsoft-derived footprint polygons | ODbL 1.0 | [GBA.ODbLPolygon](https://huggingface.co/datasets/zhu-xlab/GBA.ODbLPolygon) |
| Other polygons and LoD1 height/variance attributes | CC BY-NC 4.0 | [GBA.LoD1](https://huggingface.co/datasets/zhu-xlab/GBA.LoD1) |
| Raster height maps | CC BY-NC 4.0 | [mediaTUM](https://mediatum.ub.tum.de/1782307) |

Noncommercial restrictions matter for a professional portfolio or client delivery. Inspect the intended use before adopting those products; private storage alone does not establish a noncommercial purpose. The publishers split the release because combining ODbL footprints with their height products raises licensing issues. Preserve both source families and do not relabel the joined result as unrestricted open data. The paper's CC BY licence is not the dataset licence.

Use published file downloads, not the interactive viewer's WFS: the [repository](https://github.com/zhu-xlab/GlobalBuildingAtlas) explicitly excludes automated querying/extraction through that service. Read provider scripts before running them; code and data licences differ.

## Reproducible integration

1. Intersect the official `representative/lod1.geojson` index with the site. A tile envelope alone does not prove that every local building is present. Inspect file sizes before acquisition; tiles span 5° × 5°.
2. Record URLs, release/file hashes, access date and terms. Save downloads and analyses under private `work/research/geodata/global-building-atlas/`.
3. The publisher's enrichment script joins on concatenated `source`, `id`, `region`, adding `height` and `var`. Existing OSM IDs can be probed first to avoid downloading a multi-gigabyte footprint file. Matching IDs are leads, not proof that old and current outlines coincide.
4. Check coordinate values and declarations. The documented polygon CRS is EPSG:3857, even where some files incorrectly declare 4326. The tile index uses longitude/latitude. Reproject footprints to the project's suitable local metric CRS before geometry operations; Web Mercator coordinate metres are not local ground distances.
5. Match and inspect footprints before transferring heights. Retain genuinely surveyed or otherwise better source heights. Exclude the reconstructed villa from surrounding masses; keep unmatched/unsuitable buildings as explicitly labelled defaults.
6. Place context on a separately sourced DTM. A relative building height cannot establish absolute roof elevation or fix the villa's unresolved floor-to-ground tie. Validate placement and height outliers before producing a new release.

Villa Maraini's private audit is in `reconstructions/villa-maraini/work/research/context-heights-v003.md`. All 105 context IDs matched the hash-verified height table. After comparing source polygons in a local metric CRS (IoU ≥0.85 and centroid separation ≤3 m), v003 adopted 99 formerly defaulted heights, retained five OSM storey-derived heights and kept one failed match at 10 m. These thresholds are project choices, not a dataset guarantee. A range-read polygon subset has response/subset hashes; it does not verify the entire multi-gigabyte source file. This is a local experimental use with the noncommercial restriction recorded, not a general commercial-use clearance.
