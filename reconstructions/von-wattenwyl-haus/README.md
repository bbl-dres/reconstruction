# Beatrice von Wattenwyl-Haus

Matterport archive and Gaussian-splat experiment, 3 October 2026: can the public Matterport tours on the [BBL visits page](https://www.bbl.admin.ch/de/besichtigung) be turned into a 3D Gaussian splat? Test tour: **Beatrice von Wattenwyl-Haus**, Matterport model `r9QzqKWcYwh`.

One of the [reconstructions](../../README.md). `index.html` opens the splat viewer directly (`viewer/output/lichtfeld-loma.html`, else `lichtfeld.html`, else `brush.html`); where none exists, it shows a short note instead.

Findings and analyses (splat quality, web viewer and phones, compute, segmentation, floor plans) are in [docs/](docs/README.md).

> [!IMPORTANT]
> BBL commissioned the capture from an external provider. The original capture data was not archived, and the provider that owns the Matterport account no longer responds, so official exports (E57, MatterPak) are unavailable. The public tour is the only remaining copy; it is retrieved here through the web player's API and may go offline if the provider's account lapses.
>
> The repository root is published to GitHub Pages. The splat viewers in `viewer/output/` are published with it; the tour archive, datasets, trained splats and third-party tools are gitignored and stay local.

## Pipeline

| Step | Folder | What it does | Local output |
|---|---|---|---|
| 1 | [matterport/](matterport/README.md) | Downloads the posed panoramas and archives the public tour | `matterport/output/` |
| 2 | [dataset/](dataset/README.md) | Turns panoramas into posed pinhole images, an initial point cloud and a held-out split; scores renders | `dataset/output/` |
| 3a | [brush/](brush/README.md) | Trains splats with Brush | `brush/output/` |
| 3b | [lichtfeld/](lichtfeld/README.md) | Trains splats with LichtFeld Studio and scores them like Brush | `lichtfeld/output/` |
| 4 | [viewer/](viewer/README.md) | Builds a standalone HTML viewer from a splat, for desktop and phones | `viewer/output/` (published) |
| 5 | [alignment/](alignment/README.md) | Aligns the panoramas ourselves (COLMAP with LoMa), scored against Matterport's poses, and turns the result into a training dataset | `alignment/output/` |
| 6 | [cloud/](cloud/README.md) | Runs alignment, LichtFeld training (a Linux build) and the viewer build on rented GPUs, from the images alone | `cloud/tools/` (the LichtFeld build) |

Requires Python 3.11+. `matterport/download.py` uses only the standard library; the other steps need `pip install -r reconstructions/von-wattenwyl-haus/requirements.txt`, and the streamed viewer (`--lod`) needs Node.js. From this folder:

```sh
python matterport/download.py "https://my.matterport.com/show/?m=r9QzqKWcYwh"
python dataset/make_dataset.py
python dataset/make_dataset.py --holdout-every 10
python dataset/split_to_colmap.py
python brush/train.py holdout
python brush/train.py full
python viewer/make_viewer.py brush/output/full/export_30000.ply --lichtfeld <LichtFeld-Studio.exe> --out viewer/output/brush.html
python lichtfeld/train.py full --lichtfeld <LichtFeld-Studio.exe> --steps-scaler=2 --out lichtfeld/output/full-mrnf-x2
python viewer/make_viewer.py lichtfeld/output/full-mrnf-x2/splat_60000.ply --lichtfeld <LichtFeld-Studio.exe> --out viewer/output/lichtfeld.html --lod
python alignment/align_test.py --floor all --matching retrieval --variants loma-rig   # on a 24 GB GPU, see alignment/README.md
python alignment/to_dataset.py alignment/output/all-106-retr6/loma-rig --frame matterport
python lichtfeld/train.py full --dataset alignment/output/all-106-retr6/loma-rig-dataset --lichtfeld <LichtFeld-Studio.exe> --steps-scaler=2 --out lichtfeld/output/full-loma-x2
python viewer/make_viewer.py lichtfeld/output/full-loma-x2/splat_60000.ply --lichtfeld <LichtFeld-Studio.exe> --out viewer/output/lichtfeld-loma.html --lod
```

## Results

**Yes, the panoramas can be used for a splat, with limits.** Matterport already supplies everything a splat trainer needs: each panorama is six 90° pinhole cube faces, and the camera poses are accurate, so no 360° re-projection and no structure-from-motion are needed. Our own alignment (COLMAP with LoMa) turned out even better: a splat trained on it fits the photos 1.3 dB better, and it is now the published viewer.

| Check | Result |
|---|---|
| Panorama positions | 109: 106 placed by Matterport's alignment, 3 uploaded 360° photos without a pose (excluded from training) |
| Floors | 2. Camera height is z ≈ −1.6 m on the ground floor and +2.5 m upstairs. |
| Spacing | Nearest neighbour median 1.72 m, 90th percentile 2.44 m |
| Best resolution | `2k`: six 2048 × 2048 faces per position. No 4k for this tour. |
| Pose accuracy | Median epipolar error 0.48 px against 89,202 independent feature matches (at 1024 px) |
| Brush splat at capture positions | Rooms clearly recognizable, PSNR 22.3 dB |
| Brush splat at held-out positions | Soft and foggy, PSNR 16.2 dB, flat after 20k steps |
| LichtFeld splat, 60k steps (79 min) | Capture positions 26.9 dB, held-out 16.5 dB; best of the trainers tested ([details](lichtfeld/README.md#how-many-iterations-on-this-laptop)) |
| Own alignment (COLMAP with LoMa, whole house) | All 636 faces in one model, 5.8 cm median from Matterport's positions, 32 min on a rented RTX 4090 ([details](alignment/README.md)) |
| LichtFeld splat on our LoMa poses, 60k steps (83 min) | 28.1 dB at capture positions, 28.3 dB over all 636 faces: 1.3 dB better than on Matterport's poses ([details](alignment/README.md#a-splat-trained-on-loma-poses)) |
| Published viewer | LichtFeld on LoMa poses, all 106 positions, 60k steps, streamed in levels of detail ([viewer](viewer/README.md)); the Matterport-posed LichtFeld and the Brush viewers remain alongside |

Between capture positions the capture is too sparse for sharp views: all six faces of a panorama share one optical centre, so depth comes only from parallax between panoramas on a ~1.7 m grid at one tripod height. Details per step are in the step READMEs.

### Why the results lack resolution

Measured on the same photos (side faces at capture positions, PSNR against the photo; higher is sharper):

| Stage | PSNR | Loss |
|---|---|---|
| Published 2k face reduced to the 1024 px training size | 39.7 dB | Small: the 2k faces hold about 1k of real detail (sharp photos score ~27–34 dB in this test) |
| Brush, one room trained alone (6 positions, 10k steps) | 28.9 dB | Reference for an adequate training budget |
| Brush, whole house (106 positions, 30k steps) | 23.2 dB | **−5.7 dB: the main loss** |
| HTML viewer of the whole-house splat | ≈ 22 dB | −1.1 dB from SOG compression |
| Whole house at held-out positions | 16.2 dB | Sparse capture, a separate problem |

The main reason is the training budget per room. The whole-house model spends about 116,000 Gaussians and 47 optimisation steps per photo on a typical room; trained alone, the same room gets about 702,000 Gaussians and 278 steps per photo and scores 7–9 dB higher on identical photos (panorama 40). Matching that density everywhere would take roughly 15 million Gaussians and 180,000 steps, more than one model fits in 8 GB of GPU memory. The ceiling after that is the input: the published faces carry about 1k of real detail per 90° face, so training at 2048 px would add little. Measurements and a visual comparison (`resolution-comparison.jpg`) are in `brush/output/investigation/`.

Ideas for more detail at capture positions:

- **Train in sections.** Train floors or room clusters as separate splats with full budgets and combine them (LichtFeld can append and freeze trained splats); stream them with a level-of-detail format for viewing.
- **More steps per photo.** Doubling LichtFeld's run from 30k to 60k steps added 1.6 dB at capture positions for 39 more minutes; LichtFeld is not much faster than Brush on this laptop GPU, so longer runs cost real time.

Ideas against the fog:

- **Better geometry.** Initialize from the archived Matterport mesh, or add depth supervision (LichtFeld supports depth maps). Only the coarse 50k mesh is available.
- **Sparse-view training settings.** Tested with LichtFeld's defaults, MCMC densification (`--strategy mcmc`) and appearance modelling (`--ppisp`) both scored lower than the default strategy ([details](docs/splat-quality.md#settings-test-series)); tuned opacity regularization is untested.
- **Overlapping views.** The six cube faces meet edge to edge, so no two views of one panorama overlap. Cutting 8–14 overlapping perspective views per panorama, as common 360° splat workflows do, may reduce seams; it adds no parallax.
- **Own poses.** Done: COLMAP with LoMa, panoramas as rigs, improves the fit by 1.3 dB ([alignment](alignment/README.md)). Open: registering the three unposed uploads into that model.
