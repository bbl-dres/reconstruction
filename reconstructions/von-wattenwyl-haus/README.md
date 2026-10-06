# Beatrice von Wattenwyl-Haus

An archive of the public Matterport tour of the house at Junkerngasse 59 in Bern, where the Federal Council receives official guests, and an experiment turning its panoramas into a 3D Gaussian splat. The published splat viewer is trained with LichtFeld Studio on our own camera alignment.

**Viewer:** [bbl-dres.github.io/reconstruction/reconstructions/von-wattenwyl-haus](https://bbl-dres.github.io/reconstruction/reconstructions/von-wattenwyl-haus/) · **Run locally:** `python tools/serve.py --building von-wattenwyl-haus` from the repository root

> [!IMPORTANT]
> BBL commissioned the capture from an external provider. The original data was not archived, so the public tour is the only remaining copy. The tour archive, datasets, trained splats and tools stay local (gitignored); only the splat viewers in `viewer/output/` are published.

**Result:** the splat is sharp at the 106 capture positions and foggy between them, because the panoramas sit about 1.7 m apart at one height. Our own alignment fits the photos 1.3 dB better than Matterport's poses ([results](docs/results.md)).

## Contents

| Path | Content |
|---|---|
| [`matterport/`](matterport/README.md) | Downloads the posed panoramas and archives the public tour |
| [`dataset/`](dataset/README.md) | Turns the panoramas into a training dataset; scores renders |
| [`brush/`](brush/README.md), [`lichtfeld/`](lichtfeld/README.md) | Train splats with Brush or LichtFeld Studio |
| [`alignment/`](alignment/README.md) | Aligns the panoramas ourselves (COLMAP with LoMa) |
| [`viewer/`](viewer/README.md) | Builds the standalone splat viewers; `viewer/output/` is published |
| [`cloud/`](cloud/README.md) | Runs alignment, training and the viewer build on rented GPUs |
| [`docs/`](docs/README.md) | Findings: splat quality, the web viewer, compute, segmentation, floor plans |

## More

- [Pipeline](docs/pipeline.md): requirements and the commands for every step
- [Results](docs/results.md): measurements, why the splat lacks resolution, and ideas for more detail
