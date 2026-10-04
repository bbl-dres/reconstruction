# 3b · LichtFeld Studio

[← Overview](../README.md)

[LichtFeld Studio](https://lichtfeld.io/) trains Gaussian splats with CUDA. It needs an NVIDIA GPU (compute capability 7.5+, 8 GB), driver 570+ and CUDA 12.8+ support. Windows builds come from the [LichtFeld portal](https://portal.lichtfeld.io) (paid); the source is GPLv3. Version 0.5.3 was used. Pass the executable with `--lichtfeld` or set `LICHTFELD_STUDIO`.

## Train and score

```sh
python train.py holdout --lichtfeld <LichtFeld-Studio.exe>                 # output/holdout-mrnf/
python train.py holdout --steps-scaler=2 --out output/holdout-mrnf-x2      # twice the default length
python train.py full --steps-scaler=2                                      # all positions, for viewing
python score.py output/holdout-mrnf-x2                                     # score held-out positions
```

Settings mirror the Brush runs: a 3 million splat cap, the masked tripod patch excluded from the loss (`--mask-mode=ignore`; LichtFeld's default `none` would train on it), and the 1024 px images at full size. Without a config file LichtFeld uses its tuned preset for the chosen strategy (default `mrnf`; `mcmc` and `igs+` are alternatives). `--steps-scaler=N` stretches the whole schedule (iterations, densification, evaluation and save steps) by N, so a longer run keeps the same shape. `--dry-run` prints the command; other options are passed on to LichtFeld.

The holdout split trains on `../dataset/output/holdout-colmap/` with `--eval --test-every 10`, which selects exactly the 11 held-out panorama positions that Brush is scored on. LichtFeld writes `metrics.csv`, `metrics_report.txt`, `eval_step_<N>/` photo-and-render images, `splat_<N>.ply` and a resume checkpoint (`checkpoints/`, about 1 GB, deletable when no resume is needed). Its evaluation images are numbered in LichtFeld's own order and black out the tripod circle on down faces, so `score.py` identifies each one by matching its photo half, saves the renders by name and scores them with `../dataset/evaluate.py`.

## How many iterations on this laptop

RTX PRO 1000 Blackwell laptop GPU, 8 GB. Holdout split, `mrnf`, 3 million splat cap. Held-out: the 66 faces of 11 positions left out of training. Capture positions: 36 training faces from 6 positions, rendered from the exported splat.

| Run | Steps | Time | Gaussians | Held-out PSNR / SSIM | Capture positions PSNR / SSIM |
|---|---|---|---|---|---|
| `--steps-scaler=0.5` | 15,000 | 17 min | 2.18 M | 16.33 dB / 0.635 | 23.06 dB / 0.705 |
| default | 30,000 | 40 min | 3.00 M (cap) | 16.54 dB / 0.628 | 25.32 dB / 0.773 |
| `--steps-scaler=2` | 60,000 | 79 min | 3.00 M (cap) | 16.54 dB / 0.617 | 26.88 dB / 0.817 |
| Brush, for comparison | 30,000 | 42 min | 2.47 M | 16.18 dB / 0.627 | 24.01 dB / 0.743 |

- **Held-out positions do not improve with more iterations.** They are flat from 15k steps, and SSIM drops slightly as the splat fits the training photos more closely. The sparse capture, not training length, limits them.
- **Capture positions keep sharpening, with diminishing returns:** +2.3 dB from 15k to 30k steps (+23 min), +1.6 dB from 30k to 60k (+39 min). A room trained alone reaches 29.7 dB, so more budget per room would still help.
- **Speed:** about 15 steps per second while the splat grows, about 8–9 once it reaches the 3 million cap (12–14 on average). LichtFeld is not several times faster than Brush on this GPU, but at the same 30k steps and time it is 0.4 dB better at held-out positions and 1.3 dB better at capture positions. Rendering the LichtFeld splat in Brush matches LichtFeld's own render to 50.9 dB (median), so the comparison is fair.

Recommendation for this hardware: **15k steps (≈17 min) for quick tests, 30k (≈40 min) for comparing settings, and 60k (≈80 min) for a splat to look at.** Going beyond 60k is unlikely to pay off; training floors or room clusters separately with full budgets is the better next step.

The published viewer uses the full split at 60k steps (`python train.py full --steps-scaler=2 --out output/full-mrnf-x2`, 81 min). It matches the holdout run at shared capture positions (26.9 dB) and is sharp at the 11 positions the holdout run leaves out (26.7 dB instead of 16.5 dB), scored with `../dataset/score_splat.py`.

A settings test series (appearance modelling, MCMC, anti-aliasing) at 30k steps is in [docs/splat-quality.md](../docs/splat-quality.md#settings-test-series): none beat the default `mrnf` strategy.
