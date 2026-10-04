# 6 · Cloud runs

[← Overview](../README.md)

Scripts to align and train on rented GPUs at [RunPod](https://www.runpod.io/), from the images alone, and what the first sessions taught. The plan and the reasoning behind it are in [docs/cloud-workflow.md](../docs/cloud-workflow.md). October 2026.

## Scripts

| Script | Runs on | Does |
|---|---|---|
| [`build_lichtfeld.sh`](build_lichtfeld.sh) | Training machine | Builds LichtFeld Studio v0.5.3 for Linux the way its own Ubuntu CI does; 38 minutes with 12 parallel jobs |
| [`install_lichtfeld.sh`](install_lichtfeld.sh) | Training machine | Restores a saved build instead: system libraries, unpacking, library paths (`lichtfeld.env`) |
| [`train_check.sh`](train_check.sh) | Training machine | The check run (B2): images-only dataset, then LichtFeld with the laptop's settings |
| [`train_run.sh`](train_run.sh) | Training machine | Any run: `full` or `holdout` split, LichtFeld options passed on; samples GPU memory |
| [`build_viewer.sh`](build_viewer.sh) | Training machine | Streamed web viewer with Node.js and `../viewer/make_viewer.py --dataset` (capture positions from the dataset) |
| [`score_run.sh`](score_run.sh) | Training machine | Scores a splat where it was trained: gsplat renders (`../dataset/render_gsplat.py`) scored by `../dataset/evaluate.py`, the laptop's metrics |

`tools/` (gitignored, never committed) keeps the Linux build: `lichtfeld-v0.5.3-linux-sm120.tar.gz` (592 MB, SHA-256 in the file next to it). It runs only on the same image (`runpod/pytorch:1.0.2-cu1281-torch280-ubuntu2404`) and on Blackwell GPUs (RTX 5090, RTX PRO 4500/6000), because LichtFeld compiles its CUDA code for the build machine's GPU only. It is kept local, not published: LichtFeld is GPLv3 and bundles libraries under their own licences.

`output/` (gitignored) collects what comes back from the cloud, apart from the laptop's runs: `alignment/<model>/` (COLMAP model and logs), `lichtfeld/<run>/` (splat, logs, GPU memory samples, and the laptop's scores next to the splat) and `viewer/` (viewers for local inspection; a viewer moves to `../viewer/output/` only when it is to be published, since everything there goes to GitHub Pages).

The images-only steps before training (`../alignment/prepare_images.py`, `align.py`, `to_dataset.py`) are described in [alignment/README.md](../alignment/README.md).

## A session

| Machine | Image | GPU | Job |
|---|---|---|---|
| Alignment | `colmap/colmap:20260929.8466` with SSH, Python and cuDNN (start command in [alignment/README.md](../alignment/README.md#in-the-cloud)) | RTX 4090, 24 GB | `align.py`: 31 minutes for 109 panoramas |
| Training | `runpod/pytorch:1.0.2-cu1281-torch280-ubuntu2404`, `NVIDIA_DRIVER_CAPABILITIES=all` | Blackwell, 32 or 96 GB | LichtFeld build or restore, training, viewer |

1. Upload the images (`../alignment/output/images-109/`, 197 MB) and the scripts in the repository's folder layout under `/workspace/vwh/`.
2. Align on the alignment machine (copy the inputs to its local disk first: COLMAP's SQLite database does not like network storage), copy `sparse/`, the logs and `summary.json` to the volume, delete the machine.
3. On the training machine: `bash cloud/install_lichtfeld.sh <archive>` (or `build_lichtfeld.sh`), then `bash cloud/train_run.sh <name> full|holdout [options]`.
4. Score on the machine with `bash cloud/score_run.sh <splat> <dataset> <out> [all|capture]`, or download `lichtfeld/output/<name>/` and score on the laptop with `../dataset/score_splat.py` (up to about 3 million Gaussians; Brush cannot reach the GPU in RunPod's containers). Build a viewer with `build_viewer.sh`.
5. Delete the machines; keep or delete the volume.

## Lessons

- **Machines see the host's CPUs.** `nproc` reported 112 on a 28-CPU machine; the library build started that many compiles of USD and OpenImageIO, filled 62 GB of memory and stopped responding. `JOBS=12` fixed it, and the library cache on the volume makes a rerun skip finished libraries.
- **A restored build needs its library paths.** The binary looks for USD and OpenMesh in the build machine's folders; `install_lichtfeld.sh` writes them to `lichtfeld.env`.
- **LichtFeld trains headless on Linux.** Its viewer uses Vulkan, which RunPod's containers lack, but headless training never creates the viewer.
- **Moving data:** uploads ran at about 3.5 MB/s to Romania but 0.35 MB/s to Iceland; downloads at 3-5 MB/s from both. Between machines, `runpodctl send` / `runpodctl receive` (preinstalled) moved the 592 MB build at 150 MB/s.
- **Stock changes by the hour.** No RTX 5090 was free in any EU data centre for the afternoon session; RTX PRO 4500 Blackwell (32 GB, USD 0.72/h) and RTX PRO 6000 (96 GB, USD 2.09/h) ran the same build. Network volumes exist only in some data centres (EU-RO-1, EUR-IS-1), and a machine can only mount a volume in its own.
- **The system Python refuses `pip install`** (PEP 668); on a disposable machine `--break-system-packages` is fine.
- **Start long jobs detached** (`nohup setsid … &`); an SSH session that starts one may still hang, but the job keeps running.

## Results (4 October 2026)

Images only: 106 positions (109 aligned, three weakly placed ones left out), each splat scored at its own poses. PSNR / SSIM; "held-out" is the 11 positions a holdout run leaves out (s005, s015, ... s105), the measure of views the splat has not seen.

| Run | Split | Cap, steps | GPU | Time | Held-out | Capture positions (36 faces) | All 636 faces |
|---|---|---|---|---|---|---|---|
| Published viewer: Matterport poses (laptop) | full | 3M, 60k | Laptop, 8 GB | 81 min | 16.54 / 0.617 (holdout run) | 26.89 / 0.817 | 26.98 / 0.831 |
| B2 `full-own-x2` | full | 3M, 60k | RTX PRO 4500 | 23 min | | 28.16 / 0.848 | 28.39 / 0.863 |
| B3-A `holdout-3m-60k` | holdout | 3M, 60k | RTX PRO 4500 | 23 min | **17.38 / 0.662** | 28.44 / 0.854 | |
| B3-B `holdout-10m-150k` | holdout | 10M, 150k | RTX PRO 4500 | 141 min | 17.20 / 0.624 | **31.90 / 0.926** | |
| `full-10m-150k` | full | 10M, 150k | RTX PRO 6000 | 76 min | | 31.86 / 0.924 | 31.81 / 0.933 |

- **Own poses beat Matterport's, also between positions:** +0.8 dB at held-out positions and +1.6 dB at capture positions with the same 3M/60k budget.
- **10 million Gaussians overfit.** They match the photos 3.5 dB more closely, but held-out positions get worse (SSIM 0.662 to 0.624), and the viewer shows it: at the start view, 27° off the nearest photo direction, portraits wash out and a floater appears where the 3M splat is clear. By the rule in [docs/cloud-workflow.md](../docs/cloud-workflow.md) (best capture score without a held-out drop), **3M/60k wins**, so B2 is the final splat and gets the viewer (`output/viewer/lichtfeld-own.html`).
- **Not published:** the 10M viewer (`output/viewer/lichtfeld-hq.html`, 284 MB bundle) stays local. At the time it would have taken the GitHub Pages site from about 830 MB to about 1.13 GB, above the 1 GB limit for a published site. Since Bundeshaus publishes only its latest version, the site is about 505 MB (Bundeshaus models 164 MB, splat viewers 328 MB), so it would now fit at about 790 MB.
- **Memory is not the limit:** 10 million Gaussians peaked at 8.2-8.3 GB, 3 million at 3.6 GB. A 24 GB card is enough; budget and regularisation are the questions now.
- **Speed:** the RTX PRO 4500 trains 3M/60k in 23 minutes (the laptop: 81); the RTX PRO 6000 is about 1.85 times faster than the PRO 4500 on the 10M run.
- **Scoring in the cloud:** `../dataset/render_gsplat.py` with `../dataset/evaluate.py` reproduces the laptop's Brush scores (B3-A: 17.36 / 0.662 and 28.44 / 0.854 against 17.38 / 0.662 and 28.44 / 0.854), so splats too large for the laptop are scored where they are trained (`score_run.sh`).
