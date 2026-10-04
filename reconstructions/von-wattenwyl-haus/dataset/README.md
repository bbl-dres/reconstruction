# 2 · Training dataset

[← Overview](../README.md)

Turns `../matterport/output/panoramas/` into posed pinhole images that any splat trainer can read. Each cube face is an exact 90° pinhole image; the poses come from Matterport's alignment and are held fixed.

```sh
python make_dataset.py                      # output/full/
python make_dataset.py --holdout-every 10   # output/holdout/
python split_to_colmap.py                   # output/holdout-colmap/
```

## `make_dataset.py` → `output/full/`

| Output | For |
|---|---|
| `images/`, `sparse/0/{cameras,images,points3D}.txt` | COLMAP text model, single `PINHOLE` camera: Brush, LichtFeld, Inria 3DGS, gsplat, Postshot |
| `transforms.json` + `sparse_pc.ply` | nerfstudio `splatfacto`, including `mask_path` for down faces and the initial point cloud |
| `masks/` | Masks for the blurred tripod patch on down faces (white = keep) |
| `report.json` | Counts and the pose check |

The initial point cloud is triangulated from SIFT matches between neighbouring panoramas: 74k colored points in about 40 s, with clean wall outlines on both floors. The same matches check the poses: against a pose-free RANSAC model, the median epipolar error is 0.48 px (90th percentile 1.7 px, 77% under 1 px) over 89,202 matches at 1024 px.

Options:

- `--image-size 2048` keeps native resolution. The default of 1024 suits an 8 GB GPU.
- `--faces 0,1,2,3,4` drops the down faces, for trainers that expect a mask for every image or none.
- `--nadir-mask` sets the tripod mask diameter as a fraction of the face width (default 0.5).
- `--features` sets SIFT features per face (default 8000).

## Held-out split → `output/holdout/` and `output/holdout-colmap/`

`--holdout-every 10` leaves every 10th panorama position (all six faces; 11 positions, 66 images) out of training and out of the initial point cloud. Holding out whole positions matters: a single held-out face would share its optical centre with five training images and overstate quality. The split is written as `transforms_train.json` / `transforms_val.json`, which Brush reads; there is deliberately no COLMAP model, because Brush would prefer it and ignore the split.

`split_to_colmap.py` writes the same split as COLMAP for trainers that evaluate every Nth image, such as LichtFeld Studio. Images are ordered so `--test-every 10` selects exactly the held-out positions; 24 training images are repeated to fill the slots (`split.json` records this).

## `evaluate.py`

```sh
python evaluate.py ../brush/output/holdout/eval_30000 output/holdout
```

Scores renders against the photos, per face type and overall, with the tripod patch excluded: PSNR over RGB and SSIM on greyscale (11 px Gaussian window), each the mean over images. SSIM values are therefore not directly comparable with papers that report RGB SSIM. Writes `metrics.json` and a photo-above-render `contact-sheet.jpg` into the render folder.

## `score_splat.py`

```sh
python score_splat.py ../lichtfeld/output/holdout-mrnf-x2/splat_60000.ply
```

Scores a trained splat from any trainer at fixed views: the 66 held-out faces (meaningful for holdout runs) and 36 faces of six capture positions (sweeps 0, 20, 40, 60, 80 and 100). Brush renders the splat by loading it as its initial point cloud and evaluating after one training step; for LichtFeld splats this matches LichtFeld's own renders to 46–51 dB. Writes `score-<splat>/scores.json` next to the splat. This is how the test series and the SH comparison in [docs/](../docs/README.md) were scored.

The initial point cloud is not bit-reproducible: OpenCV's FLANN matcher and RANSAC are randomised and run on several threads, so reruns differ by about 0.5 % of matches and a few dozen points.

## `render_gsplat.py`

```sh
python render_gsplat.py <splat.ply> <dataset> <out> [--views all|capture]
python evaluate.py <out> <dataset> --sheet 0
```

Renders a splat at a dataset's views with [gsplat](https://github.com/nerfstudio-project/gsplat) (standard 3D Gaussian rasterization, black background) for scoring where Brush cannot run: in cloud containers without Vulkan, or for splats too large for the laptop's 8 GB (Brush allocates training memory for the whole splat). It reproduces `score_splat.py`'s scores within 0.02 dB. Needs a CUDA GPU, PyTorch and `pip install gsplat`; `../cloud/score_run.sh` wraps both steps.
