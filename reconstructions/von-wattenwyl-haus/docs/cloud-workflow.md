# Cloud workflow

[← Findings](README.md)

A concept for one session on a rented RTX 5090 that goes from upload to a finished web viewer, using only the data we already have. It builds on what was measured so far: the laptop runs ([splat-quality.md](splat-quality.md), [viewer.md](viewer.md)) and the first cloud run, which aligned the whole house on an RTX 4090 ([compute.md](compute.md#first-run-whole-house-alignment-on-runpod-4-october-2026)). Steps marked *untested* have not been run yet. Concept stage, October 2026; prices change.

## Summary

- **What the 5090 changes:** 32 GB instead of 8 GB. That allows more Gaussians per room, the main lever for detail at the capture positions (a room trained alone scored 7–9 dB higher than in the whole-house model). It is also several times faster than the laptop.
- **What it cannot change:** the fog between capture positions comes from the sparse capture, and fine detail is capped by the published photos (about 1024 px of real detail per face). Depth priors are the only lever against the fog with this data.
- **The trainer: LichtFeld, built for Linux.** A test of the Linux alternatives found none plug-and-play on this capture (fVDB was very fast but 2–3 dB worse, gsplat's run failed, Brush cannot reach the GPU in RunPod's containers; [below](#choosing-the-trainer)). Instead, LichtFeld v0.5.3 was built for Linux once (38 minutes, kept in `cloud/tools/`); it trains headless on RunPod and matches the Windows build (28.42 against 28.37 dB on the same faces). The Windows-machine route is no longer needed.
- **First full session (4 October 2026), images only:** all 109 panoramas aligned in 31 minutes, 106 kept; the 3M/60k splat fits the photos 1.4 dB better than the published one and, in the holdout test, renders unseen positions 0.8 dB better. 10 million Gaussians at 150k steps fit the photos 3.5 dB more closely but overfit: unseen positions and views off the photo directions get worse. 3M/60k stays the budget ([cloud/README.md](../cloud/README.md#results-4-october-2026)).
- **Our own poses beat Matterport's.** A splat trained on the LoMa alignment fits the photos 1.3 dB better than the published one ([alignment/README.md](../alignment/README.md#a-splat-trained-on-loma-poses)), so alignment becomes a regular step rather than an option.
- **The viewer moves to three.js** for 3D annotations and navigation between capture positions ([viewer.md](viewer.md#options-considered), option C). The cloud then only prepares the streaming files (PlayCanvas splat-transform); LichtFeld's HTML export is no longer needed.
- **One session takes about 3–4 hours of machine time, about USD 3–4**, most of it a short settings test series.
- **What comes back:** the streaming files for the viewer (about 130 MB for 3 million Gaussians, more for a larger splat), the scores and logs, and the trained `.ply` if it is to be kept.

## What the input data allows

| Property | Value | Consequence |
|---|---|---|
| Positions | 106 placed by Matterport on 2 floors (55 and 51), 3 uploaded panoramas without a pose | The 3 unposed ones can join if they are registered (below) |
| Images | Six 90° cube faces per position, 2048 px, JPEG quality about 80 | Train at 1024 px: the faces hold about 1024 px of real detail (39.7 dB when reduced and enlarged again) |
| Poses | Matterport, median epipolar error 0.48 px | Our LoMa alignment differs by 5.8 cm (median), yet a splat on it scores 1.3 dB higher: align ourselves, keep Matterport's poses as the reference |
| Spacing and height | Neighbours 1.72 m apart (median), all at one height per floor | Surfaces are seen from few positions: views between positions stay soft whatever the training |
| Tripod | Blurred patch on each down face | Mask it and leave it out of the loss; the trainer must support per-image masks |

## The workflow

| # | Step | Where | Time on the 5090 | Output |
|---|---|---|---|---|
| 0 | Build the dataset: `dataset/make_dataset.py` (full split) and `--holdout-every 10` (holdout split); the images are the input to the alignment | Laptop | 1–2 min | `dataset/output/full/`, `holdout/`, about 200 MB each |
| 1 | Start the machine (below) and upload the datasets and scripts | Cloud | 5–10 min | |
| 2 | Own alignment with LoMa (`alignment/align_test.py --floor all --matching retrieval`), then `alignment/to_dataset.py`; *untested:* the 3 unposed panoramas joining it | Cloud | 25–35 min (32 min on an RTX 4090) | Dataset with LoMa poses |
| 3 | *Optional, untested:* depth priors, a depth map per face (Depth Anything, MoGe) scaled to the triangulated points | Cloud | 10–20 min | Depth maps, if the trainer takes a depth loss |
| 4 | Settings test series on the holdout split (below) | Cloud | 1–2 h | Choice of splat cap and length |
| 5 | Final training on the full split with the chosen settings | Cloud | 15–60 min | Trained `.ply` |
| 6 | Streaming files for the viewer: decimate into levels of detail and write a streamed format (splat-transform, as in `viewer/make_viewer.py --lod`) | Cloud | 5–10 min | Level-of-detail bundle |
| 7 | Download the results, delete the machine, check that it is gone | Cloud | 2–10 min | |
| 8 | Look at the result in the viewer locally, then commit it | Laptop | | GitHub Pages |

Times on the 5090 are estimates: LoMa ran about five times faster on the RTX 4090 than on the laptop, and a 5090 is roughly another 30–40 % faster. The laptop needs 80 minutes for 60,000 steps at 3 million Gaussians with LichtFeld. The trainer test measures the real speed.

**Scoring.** `dataset/score_splat.py` renders any trainer's `.ply` with Brush, so all splats are scored alike. It runs on the laptop (Brush's Linux version needs Vulkan, which a cloud container may not provide), so scoring means downloading each `.ply` (744 MB at 3 million Gaussians, a few minutes). A trainer's own evaluation on the holdout split can stand in during the test series if it reports the same held-out positions.

**Registering the 3 unposed panoramas (*untested*).** Build a COLMAP model with the Matterport poses held fixed and LoMa matches triangulated (`point_triangulator`), then add the three panoramas with `image_registrator`; they come out in Matterport's frame. `make_dataset.py` would need to accept those poses. Three positions are 3 % more coverage, mostly where they were taken.

## Choosing the trainer

What makes a trainer plug-and-play in the cloud: a ready package (`pip`, a Linux download or an official image), headless training on a COLMAP dataset, per-image masks for the tripod patch, a permissive licence, and speed close to LichtFeld's.

**LichtFeld Studio has no ready Linux build.** Ready-made builds exist only for Windows, from the paid LichtFeld portal; on Linux it is built from source (GPLv3; CMake, GCC 14, vcpkg, CUDA toolkit 12.8+). The `docker/` folder in its repository is a developer container that still compiles everything. That build turned out to be the practical route: `cloud/build_lichtfeld.sh` follows LichtFeld's own Ubuntu CI, took 38 minutes with 12 parallel jobs, and the result is kept (`cloud/tools/`, `install_lichtfeld.sh`). The alternatives considered before, for running the Windows build in the cloud:
- **On a RunPod machine through Wine:** not realistic. Only Wine's experimental staging version passes CUDA calls to the Linux driver, and it lags behind current CUDA versions; LichtFeld is built against CUDA 12.8 and brings its own Windows CUDA libraries.
- **On a rented Windows GPU machine:** possible, and the only route with no porting: the same binary and our scripts as they are. Big clouds (Azure, AWS, Google, all with Zurich regions but few GPU types there) rent Windows Server machines, mostly with data-centre cards (A10, L4, L40S, A100, H100); some smaller providers rent Windows machines with RTX 4090s, mostly by the month. Expect a higher price than RunPod (machine plus a Windows licence per hour), a slower start (a full machine with remote desktop or SSH) and few consumer cards like the 5090.

**Candidates** (licences and claims as published, not yet tested on our data):

| Trainer | Licence | Install | Our masks | Speed | Notes |
|---|---|---|---|---|---|
| [fVDB Reality Capture](https://fvdb-reality-capture.readthedocs.io/latest/) (NVIDIA) | Apache 2.0 | `pip` wheels for PyTorch 2.10 with CUDA 12.8 or 13.0, Linux, Ampere or newer | Mask paths are part of its dataset format; use in training unverified | Claims 30 % less runtime than gsplat | One command: `frgs reconstruct <colmap folder> -o out.ply`. Also reads E57 laser scans and extracts meshes. Young project; APIs moved between releases |
| [gsplat](https://github.com/nerfstudio-project/gsplat) | Apache 2.0 | `pip`, compiles its CUDA code on first run | Its example trainer masks only fisheye edges; per-image masks need a small patch | Reference library | Widely used; reference implementation of MCMC (hard Gaussian cap). Last release July 2025, code still active |
| [Brush](https://github.com/ArthurBrussee/brush) | Apache 2.0 | 44 MB Linux download (v0.3.0) | Yes, a `masks/` folder, as used here | On the laptop as fast as LichtFeld; 0.4 dB lower at held-out and 1.3 dB at capture positions | Reaches the GPU through Vulkan, which a container may not provide |
| nerfstudio splatfacto | Apache 2.0 | Docker image; no release since November 2024 | Yes | gsplat plus framework overhead | Stale; likely too old for a 5090 |
| [Faster-GS](https://github.com/nerficg-project/faster-gaussian-splatting) (CVPR 2026) | Apache 2.0 | Research framework, CUDA 12.8 | Only for carving the starting cloud | "2–5× faster" than other research code | Research code |
| [FastGS](https://github.com/fastgs/FastGS) (CVPR 2026) | MIT, on Inria's 3DGS | Research code | No | About 100 s per benchmark scene | Licence risk: the Inria base allows non-commercial research only |
| Postshot, Polycam, Luma, Kiri | Commercial | Windows app or upload service | | | Windows-only, or run their own alignment and cannot use Matterport's poses or our masks |

RunPod offers no ready-made template for any of them (checked on its Hub and verified templates).

**Trainer test (4 October 2026).** One RTX 5090 at RunPod (EU-RO-1, USD 0.99/h, about one hour, USD 1), RunPod's PyTorch image (`runpod/pytorch:1.0.2-cu1281-torch280-ubuntu2404`, CUDA 12.8). Data: the training part of the holdout split as a COLMAP dataset, 570 faces of 95 positions with 95 masks and 60k starting points, the same as LichtFeld's holdout runs. 30,000 steps each, each `.ply` downloaded and scored on the laptop with `dataset/score_splat.py`:

| Trainer | Install | Settings | 30k steps on the 5090 | Gaussians | Held-out / capture positions, PSNR |
|---|---|---|---|---|---|
| LichtFeld 0.5.3 (laptop, reference) | Windows build | `mrnf`, 3 million cap | 40 min on the laptop; roughly 6–8 min on a 5090 (estimate) | 3.0 M | **16.55 / 25.32 dB** |
| Brush 0.3 (laptop, reference) | Windows build | 3 million cap | 42 min on the laptop | 2.5 M | 16.18 / 24.01 dB |
| fVDB Reality Capture 0.6 | `pip`; the documented PyTorch 2.10 / CUDA 12.8 build does not exist for 0.6, it needs PyTorch 2.13 / CUDA 13 | Default densification (scene scale set by hand: its default needs point visibility, which our dataset lacks) | 1.7 min | 0.2 M (densification stalls) | not scored |
| | | Densification threshold 0.00005 instead of 0.0002, scene scale set by hand, normalisation off | **2.9 min** | 3.0 M | 14.48 / 22.03 dB |
| gsplat 1.5.3 | `pip`, plus `ninja` and a CUDA build of its helpers; a 5-line patch to read per-image masks; the model converted to COLMAP's binary format | Classic densification | 2.7 min | 0.25 M (stalls) | not scored |
| | | MCMC, 3 million cap, world normalisation off | 10 min | 3.0 M | 9.70 / 12.50 dB (failed) |
| Brush 0.3 (Linux) | 44 MB download | | could not run | | |

- **fVDB is very fast but not plug-and-play here.** Its defaults suit its usual inputs (images reduced by 4, a scene scale from point visibility that our dataset does not carry), and densification stalls on this capture. With five settings changed it trained 3 million Gaussians in under 3 minutes, but scored 2–3 dB below LichtFeld; matching LichtFeld would take real tuning. Also: it drops images that see fewer than 5 points (`--tx.min-points-per-image 0`), shrinks images by 4 (`--tx.image-downsample-factor 1`), and writes the splat in its own normalised frame (`--tx.normalization-type none` keeps ours). It reads our `masks/` folder by itself.
- **gsplat's run is inconclusive.** Its classic densification stalled like fVDB's; the MCMC run diverged (Gaussians spread up to 150 m from the house, almost transparent), most likely because world normalisation was switched off to keep our coordinates. Not a verdict on gsplat, but not plug-and-play either.
- **Brush cannot use the GPU in RunPod's containers.** Vulkan finds no driver, even with `NVIDIA_DRIVER_CAPABILITIES=all` (which brings the graphics libraries but still no working Vulkan driver), and the matching driver package cannot be installed over the host's mounted files.
- **Densification is the common problem.** The classic 3DGS rule (split where the screen-space gradient exceeds 0.0002) grows only 0.1–0.25 million Gaussians on this capture in both fVDB and gsplat, while LichtFeld's `mrnf` and Brush grow to 2.5–3 million.

**LichtFeld's Windows build on a Windows GPU machine** was the fallback, not needed since the Linux build works. AWS, for example, rents Windows Server machines with NVIDIA GPUs: G6e (L40S, 48 GB, roughly RTX 4090 speed) fits best, G5 (A10G, 24 GB) and G6 (L4, 24 GB) are slower. Expect roughly USD 1–2.50 per hour including the Windows licence, check GPU types per region (Frankfurt, Zurich), and request a GPU quota first (new accounts start at zero). Our Windows scripts, LichtFeld and Brush run unchanged, so scoring can happen on the same machine. Prepare a machine image once (driver 570 or newer, Python, Node.js, LichtFeld, Brush); each session is then start, upload, run, download, terminate. Ask IT whether the federal framework contracts (Public Clouds Bund) already provide an account.

## Requirements

**Accounts and the laptop**
- RunPod account with credit and a spending limit; an SSH key registered with RunPod (`~/.ssh/runpod_ed25519`).
- `ssh` and `scp` (built into Windows), Python with this repository's requirements, Brush for scoring.
- For the final check and the commit: a browser and Git.

**The machine**

| Setting | Value | Why |
|---|---|---|
| GPU | RTX 5090, 32 GB, secure cloud, USD 0.99/h | Stock was low on 4 October 2026; fall back to an RTX 4090 (24 GB, USD 0.74/h) or an L40S (48 GB, USD 1.09/h) |
| Data centre | EU-CZ-1, EU-RO-1 or EUR-IS-1 | EU sites with the card; RunPod has no Frankfurt or Zurich site |
| Network | Secure cloud, port `22/tcp` exposed | A community machine had no public IP (no `scp`) and 0.1 MB/s internet |
| Host CUDA | At least 12.8 for training, 12.9 for the COLMAP image (`minCudaVersion`) | The images' CUDA versions |
| Disk | 50–100 GB container disk | Image, Python packages, checkpoints |
| Storage between sessions | *Optional:* a network volume in EU-RO-1 or EUR-IS-1 (EU-CZ-1 has none), about USD 0.07 per GB and month | Keeps datasets and installed packages, so later sessions skip the upload |

**Software**

| Component | Version | For |
|---|---|---|
| RunPod PyTorch image | `runpod/pytorch:1.0.2-cu1281-torch280-ubuntu2404` (PyTorch 2.8, CUDA 12.8; SSH built in) | Linux trainers installed by a start script (used for the trainer test) |
| [`colmap/colmap`](https://hub.docker.com/r/colmap/colmap) | `20260929.8466` (COLMAP 4.2.1, CUDA 12.9, ONNX Runtime 1.30 with CUDA), plus cuDNN 9, Python and SSH | Only for step 2; recipe in [alignment/README.md](../alignment/README.md#in-the-cloud) |
| Node.js | 20 or newer | `npx @playcanvas/splat-transform@3.9.0` for the streaming files |

A Linux trainer that installs by `pip` needs no custom image: a start script installs it in a few minutes. LichtFeld needs either a Windows GPU machine with a prepared machine image, or a one-time Linux build ([Choosing the trainer](#choosing-the-trainer)).

## Settings

| Setting | Value | Evidence |
|---|---|---|
| Image size | 1024 px | Real detail in the photos; training at 2048 px adds little |
| Faces | All six, down faces masked (nadir mask 0.5) | Floors need the down faces; the tripod patch is masked |
| Poses | Own alignment: COLMAP 4.2 with LoMa, panoramas as rigs, retrieval matching | +1.3 dB over Matterport's poses on all 636 faces (training views; a holdout check is open). Also the route for captures without Matterport |
| Initial point cloud | COLMAP's sparse points from the alignment (173k) | Came with the better LoMa splat; a dense cloud from depth maps might help white walls (*untested*) |
| Trainer | LichtFeld Studio 0.5.3 | Beat Brush by 0.4 dB at held-out and 1.3 dB at capture positions in the same time, and fVDB by 2–3 dB (trainer test) |
| Densification | LichtFeld: `mrnf` (its default). Other trainers: their default, compared in the test | In LichtFeld, `--ppisp`, MCMC and `--enable-mip` all scored lower |
| Loss | Tripod patch left out of the loss; full 1024 px | As with LichtFeld's `--mask-mode=ignore --resize_factor=1` |
| Colour | Spherical harmonics degree 3 | Degree 1 or 0 costs 2.9–4.0 dB at capture positions |
| Splat cap and length | 3 million and 60k steps | 10 million at 150k fit the photos 3.5 dB more closely but overfit (held-out SSIM 0.662 to 0.624, washed-out views off the photo directions); memory was not the limit (8.2 GB) |

**Test series for step 4,** with the chosen trainer on the holdout split, scored at held-out and capture positions:

| Run | Splat cap | Steps | Question |
|---|---|---|---|
| A | 3 million | 60k | Baseline against the laptop's LichtFeld run (16.5 / 26.9 dB) |
| B | 6 million | 60k | Does a larger cap help at the same length? |
| C | 10 million | 120k | Does it keep improving, and does it fit in 32 GB? |
| D | *Untested:* best of A–C with depth priors | | Does the fog between positions lift? |

Choose the run with the best capture-position score whose held-out score does not drop. Held-out scores are expected to stay near 16.5 dB; only depth priors (run D) may move them.

## What to download

| Result | Size | Needed? |
|---|---|---|
| Streaming files for the viewer | About 43 MB per million Gaussians (128 MB at 3 million) | Yes |
| Scores and training logs | Under 10 MB | Yes |
| Trained splat `.ply` | 248 bytes per Gaussian: 744 MB at 3 million, about 2.5 GB at 10 million | To score it, keep it, or build other formats later |
| Checkpoints | About 1 GB per run | No; they only resume training |
| COLMAP database | 1.9 GB | No, unless more images will be registered later |

Downloads ran at about 4 MB/s from the Czech data centre (47 MB in 12 s), so even 2.5 GB is about 10 minutes.

**For GitHub Pages,** a larger splat needs a decision: files must stay under 100 MB, the published site under 1 GB, and every rebuild stays in the repository history. The 10 million Gaussian bundle came to 284 MB (above 3 million, `make_viewer.py` keeps the phone levels at the 3 million splat's counts). Options: publish a decimated top level (for example 4–5 million Gaussians), or host the bundle elsewhere and keep only the page on GitHub.

## Cost and time

| Part | Time | Cost at USD 0.99/h |
|---|---|---|
| Start, install, upload, checks | 15 min | 0.25 |
| LoMa alignment, if wanted | 30 min | 0.50 |
| Test series (runs A–C) | 1.5–2 h | 1.50–2.00 |
| Final training | 0.5–1 h | 0.50–1.00 |
| Streaming files, download | 15–20 min | 0.30 |
| **Session** | **about 3–4 h** | **about USD 3–4** |

The trainer test cost about USD 1 (one hour on the RTX 5090).

## Pitfalls from the first run

- **Nothing switches a machine off.** It bills until it is deleted; delete it after downloading and list the machines to confirm. Keep the account's spending limit.
- **A machine's disk is lost when it is deleted.** Download first; use a network volume for anything that should outlast the session.
- **RunPod's SSH relay** (`ssh.runpod.io`) only offers an interactive terminal, without `scp`. Use the direct connection (port 22 exposed, secure cloud).
- **Long jobs:** start them detached (`nohup setsid … &`) so a dropped connection does not stop them, and poll their logs.
- **Unpacking a tar made on Windows** on the machine prints ownership warnings and exits with an error; add `--no-same-owner`. On Windows, Git Bash's `tar` reads `C:\…` as a remote host; pipe the archive in instead.
- **`align_test.py`'s memory guard** sees the host's memory inside a container, not the container's limit.
- **Blackwell GPUs** (5090, the laptop) need CUDA 12.8 or newer throughout. The COLMAP image, ONNX Runtime 1.30 and cuDNN 9 work (LoMa ran on the laptop's Blackwell GPU); the trainer's packages must be built for CUDA 12.8 or newer too.

## Open questions

- A budget between 3 and 10 million Gaussians (for example 5 million at 90k steps), or regularisation (opacity, scale) for the larger caps: does it keep the capture-position gain without losing unseen positions?
- Does a depth loss with monocular depth reduce the fog between positions on this capture?
- Placing the three positions the images-only alignment left out (s036, s037, s047): `image_registrator` with stricter thresholds, or a second mapper run.
- Which streaming format suits the three.js viewer once LichtFeld's `.rad` export (option C in viewer.md) is no longer available, and how large a splat can it carry while phones stay smooth? Today phones draw at most about 1 million Gaussians.
