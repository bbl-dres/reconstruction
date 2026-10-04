# 3a · Brush

[← Overview](../README.md)

[Brush](https://github.com/ArthurBrussee/brush) trains Gaussian splats on WebGPU, so it runs on Windows with NVIDIA, AMD or Intel GPUs.

## Setup

Download the v0.3.0 Windows build (`brush-app-x86_64-pc-windows-msvc.zip` from the [releases](https://github.com/ArthurBrussee/brush/releases/tag/v0.3.0); SHA-256 `b68e3e9cf052d51bf3ee30776fa5a364de7f2ba13b58443128ff797bb7bcfcd6`) and unpack it into `bin/`. Alternatively pass `--brush` or set `BRUSH_APP`.

## Train

```sh
python train.py holdout   # score held-out positions: output/holdout/
python train.py full      # all 106 positions, for viewing: output/full/
```

Both use 30,000 steps and a 3 million splat cap, which keeps training within 8 GB of GPU memory. Each run took about 42 minutes on the laptop's RTX PRO 1000 (8 GB). Outputs: `export_<step>.ply`, `brush.log`, and for the holdout split `eval_<step>/` renders, which `train.py` scores with `../dataset/evaluate.py`. `--dry-run` prints the command; other options are passed on to Brush. Brush writes its GPU kernel tuning cache to `target/`.

## Results

| Test | PSNR | SSIM |
|---|---|---|
| Full run, training views (36 faces from 6 positions) | 24.0 dB | 0.74 |
| Holdout run, training views (6 sampled faces) | 22.3 dB | 0.72 |
| Holdout run, held-out positions, steps 10k / 20k / 30k (66 faces) | 15.7 / 16.3 / 16.2 dB | 0.63 / 0.63 / 0.63 |
| One room trained alone (6 positions, 10k steps), its 36 training views | 29.7 dB | 0.90 |

The whole-house runs underfit even the photos they train on: a room trained alone scores 7–9 dB higher on the same photos, because it gets about six times more Gaussians and optimisation steps per photo. See [Why the results lack resolution](../README.md#why-the-results-lack-resolution).

- **At capture positions** rooms are clearly recognizable: staircase, salons, portraits.
- **Between capture positions** the splat is soft and foggy, and more training does not help (flat from 20k steps).
- **Splat size:** 2.47 million Gaussians (holdout) and 2.58 million (full), 580–610 MB as PLY.
- **Weak spots:** plain white walls and ceilings produce few feature points; mirrors and window glass cause view-dependent artifacts.
