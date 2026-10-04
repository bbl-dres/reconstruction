# Splat quality

[← Findings](README.md)

Why the splat looks the way it does, what the training settings changed, and what could still improve it. Measured in October 2026 on the laptop described in [compute.md](compute.md).

## Summary

- **Two separate limits.** Detail at the capture positions is limited by the training budget per room. Fog and floaters between positions come from the capture itself and do not go away with more training.
- **LichtFeld's default strategy (`mrnf`) remains the best setting tested.** Appearance modelling (`--ppisp`), the MCMC strategy and anti-aliasing (`--enable-mip`) all scored lower.
- **The published viewer now uses all 106 positions** (60k steps, 81 min). The 11 positions the holdout runs leave out score 26.7 dB instead of 16.5 dB; between positions the splat stays foggy.
- **The biggest remaining lever is better geometry** (depth priors), then more budget per room. A new, denser capture would beat both.

## The capture

| Property | Value |
|---|---|
| Positions | 106 placed by Matterport, on 2 floors (3 more uploaded photos have no pose) |
| Spacing | Nearest neighbour median 1.72 m, 90th percentile 2.44 m |
| Height | One tripod height per floor; the camera is about 1.53 m above the floor |
| Images | Six 90° cube faces per position, 2048 × 2048 px, JPEG quality about 80 |
| Real detail | About 1024 px per face: reducing a face to 1024 px and back loses almost nothing (39.7 dB) |
| Poses | Median epipolar error 0.48 px against 89,202 independent feature matches |

All six faces of a panorama share one optical centre, so depth comes only from parallax between positions, all at the same height.

## Two limits, two kinds of fix

| Symptom | Cause | Evidence |
|---|---|---|
| Soft detail at capture positions | Training budget per room: the whole-house model gives a typical room about 116,000 Gaussians and 47 steps per photo | The same room trained alone (702,000 Gaussians, 278 steps per photo) scores 7–9 dB higher on identical photos |
| Fog and floaters between positions | Sparse capture: surfaces are seen from few positions, all at one height | Held-out positions stay at about 16.5 dB from 15k steps on, whatever the training length |

The measurement table is in the [project README](../README.md#why-the-results-lack-resolution).

## Training length

LichtFeld on the holdout split (95 positions trained, 11 held out), `mrnf`, 3 million splat cap. Details in [lichtfeld/README.md](../lichtfeld/README.md#how-many-iterations-on-this-laptop).

| Steps | Time | Held-out PSNR | Capture positions PSNR |
|---|---|---|---|
| 15,000 | 17 min | 16.33 dB | 23.06 dB |
| 30,000 | 40 min | 16.54 dB | 25.32 dB |
| 60,000 | 79 min | 16.54 dB | 26.88 dB |

Recommendation for this laptop: 15k steps for quick tests, 30k for comparing settings, 60k for a splat to look at.

## Settings test series

30,000 steps each on the holdout split; each exported splat is scored with `dataset/score_splat.py` at the held-out positions (66 faces) and at six capture positions (36 faces). Higher is better.

| Run | Option | Time | Held-out PSNR / SSIM | Capture positions PSNR / SSIM |
|---|---|---|---|---|
| Baseline | `mrnf` (default) | 41 min | **16.55 dB / 0.628** | **25.32 dB / 0.773** |
| Appearance modelling | `--ppisp` | 41 min | 15.61 dB / 0.620 | 21.58 dB / 0.759 |
| MCMC densification | `--strategy mcmc` | 26 min | 14.59 dB / 0.606 | 19.48 dB / 0.647 |
| Anti-aliasing | `--enable-mip` | 39 min | 16.52 dB / 0.625 | 25.05 dB / 0.767 |

- **The scores are comparable.** Renders of each exported splat match LichtFeld's own evaluation renders to 45.8–50.9 dB, and LichtFeld's own held-out scores agree with ours within 0.02 dB.
- **PPISP** models each photo's exposure and colour response during training. Most likely that per-photo correction is not part of the exported splat, so the viewer, like our scoring, sees the splat without it; held-out positions have no learned correction at all. For a viewer, Matterport's per-panorama tone mapping is better left in the splat.
- **MCMC** grows to the 3 million cap from the start, which makes it faster, but it scored lowest with LichtFeld's defaults. It was not tuned (opacity and scale regularisation, cap).
- **Anti-aliasing** (`--enable-mip`) is on par at held-out positions and slightly lower at capture positions. Its 3D filter is part of rendering: the web viewer applies it only on request and not when streaming levels of detail, so it brings nothing to the published viewer.

Results are in `lichtfeld/output/test-series.json` (local).

## Options to improve

| Effort | Step | Addresses |
|---|---|---|
| About a day | Depth priors: estimate depth per face with a monocular depth model (Depth Anything, MoGe), scale it with the triangulated points, train with LichtFeld's `--use-depth-loss` | The main lever against fog between positions; fits in 8 GB |
| About a day | Dense starting cloud from those depth maps instead of 60k SIFT points | Plain white walls and ceilings, which start almost empty |
| About a day | Re-slice each panorama into 8–14 overlapping views instead of six edge-to-edge faces | Seams at cube-face edges |
| Days, cloud GPU | Train per floor or room cluster with a full budget, or one run with 10–15 million Gaussians on a 48–80 GB GPU | Detail at capture positions (rooms need about 6× today's budget) |
| Research | Generative clean-up of novel views | Remaining artefacts between positions; invents detail |

**Hard limits:**
- **Fine detail is capped by the published photos** (about 1k of real detail per face, JPEG quality 80). Training at 2048 px adds little; AI upscaling invents detail.
- **Between positions, only stronger assumptions help.** Depth or generative priors get closer to the real geometry or fill gaps with invented detail.
- **A new capture is the real fix.** Positions every 0.5–1 m at two heights, or a 360° video walk, would give much better splats than any training setting.
