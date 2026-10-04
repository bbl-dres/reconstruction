# Code review

[← Findings](README.md)

Review of the scripts in this folder for bugs, redundant code, performance and robustness, October 2026. Covered: `matterport/download.py`, `matterport/fill_tiles.py`, `dataset/make_dataset.py`, `dataset/split_to_colmap.py`, `dataset/evaluate.py`, `brush/train.py`, `lichtfeld/train.py`, `lichtfeld/score.py`, `viewer/make_viewer.py`, `viewer/overlay.html` and `index.html`, plus the READMEs that describe them.

## Summary

- **The pipeline is sound.** Camera conventions, pose handling, the held-out split and the scoring were checked again and are correct; the review found no error in any published result.
- **Seven bugs fixed**, none of which affected the results so far: a crash, a hard-coded image size, two failure paths that hid errors or misled visitors, a dependency on local data where none was needed, and a misleading description of the training masks.
- **Duplicated code removed** (COLMAP writing, PLY reading, the tripod mask), one performance fix, and a new `dataset/score_splat.py` so the scores of exported splats in these docs can be reproduced from the repository.
- **Verified:** rebuilding the datasets with the revised code gives identical images, masks, poses and transforms; the scoring scripts reproduce earlier scores exactly; the download and viewer changes were tested live.

## Bugs fixed

| Where | Problem | Fix |
|---|---|---|
| `dataset/evaluate.py` | Crashed while building the contact sheet when the renders contain no side faces (for example a dataset built with `--faces 0,5`), after writing `metrics.json` | Skip the sheet when there are no side faces |
| `lichtfeld/score.py` | Assumed 1024 px faces when splitting LichtFeld's photo-and-render evaluation images, so a dataset built with another `--image-size` would be scored on the wrong pixels | Read the face size from the images |
| `matterport/download.py` | When refreshing the expiring URLs failed inside a download thread, `SystemExit` escaped the per-face error handling, so the run ended without its failure report. Truncated downloads were written to the face file before being checked | A dedicated `MatterportError` is reported like any failed face; data is validated before it is written |
| `viewer/make_viewer.py` | Updating an existing viewer required the local tour metadata, although only a new start camera or a level-of-detail crop needs it | Metadata is read only when needed |
| `viewer/overlay.html` | When a streamed splat failed to load (or a download stalled), the loading card stayed unchanged forever | After 30 s without progress the card asks the visitor to check the connection and reload |
| `index.html` | Opened from disk, `fetch` cannot check files, so the page said the viewer was unavailable even when it existed | From disk it opens the embedded viewer (`brush.html`), the one that works offline |
| `lichtfeld/README.md`, `lichtfeld/train.py` | Described `--mask-mode=ignore` as "tripod masks ignored"; it does the opposite: it excludes the masked tripod patch from the loss (LichtFeld's default, `none`, would train on it) | Corrected |

Two viewer bugs found while building the streamed viewer are described in [viewer.md](viewer.md#problems-found-and-fixes): desktops never loaded the finer levels, and splat-transform applies its crop box in a rotated frame.

## Robustness

- **`dataset/make_dataset.py`:** face pairs were taken only from the lower-index end of each neighbour link, so a link listed by one sweep only was dropped when that sweep had the higher index. All links in this tour are symmetric (the 1,644 pairs are identical before and after), but other tours may differ. Fixed.
- **`dataset/split_to_colmap.py`:** its core check (held-out images on every `--test-every` slot) was an `assert`, which Python skips when run with `-O`. Now an explicit error.

## Redundant code

- **COLMAP writing** existed twice (`make_dataset.py` and `split_to_colmap.py`), and `split_to_colmap.py` had its own PLY reader. Both now use `write_colmap()` and `read_ply()` from `make_dataset.py`, next to `write_ply()`.
- **The tripod mask** was drawn in two places; `nadir_mask()` now draws it, and a duplicated "down face" condition is gone.
- **Pair filtering** was split between `face_pairs()` and `main()`; `face_pairs()` now returns the final pairs.
- **`requirements.txt`** said only `make_dataset.py` needs it; the scoring scripts and `fill_tiles.py` do too.

## Performance

- **`make_dataset.py` re-encoded faces that need no resizing** (`--image-size 2048`) as JPEG quality 95: slower, and a second compression of the quality-80 originals. They are now copied unchanged. The default 1024 px dataset is unaffected (identical files).

## Reproducibility

The scores of exported splats in these docs (settings test series, SH degrees) were produced with scratch scripts. **`dataset/score_splat.py`** now scores any trained splat at the held-out positions and at six capture positions, rendered with Brush, exactly as those numbers were made.

## Verification

| Check | Result |
|---|---|
| Rebuild `full`, `holdout` and `holdout-colmap` into scratch folders and compare | Images (636 and 660), masks, `cameras.txt`, `images.txt`, `transforms*.json` and `split.json` identical. Point clouds differ by about 0.1 % (see below) |
| Face pairs, old and new code | Identical lists and order: 1,644 (full), 1,316 (holdout) |
| `evaluate.py` on an existing render set; on renders without side faces | 26.88 dB / 0.816, as before; no crash |
| `score.py` on the anti-aliasing run | 16.54 dB / 0.626, equal to LichtFeld's own evaluation |
| `download.py`: one panorama, a rerun, a wrong query hash | 6 faces in 1 s; "6 faces already present"; a clear error message, exit code 1 |
| `make_viewer.py` update with no tour metadata | Both viewers updated |
| Browser (Edge): `index.html` from disk; a streamed viewer with a missing bundle; the published viewer | Opens `brush.html` and renders; hint after 36 s; loads as before |

## Observed, not changed

- **`make_dataset.py` is not bit-reproducible.** OpenCV's FLANN matcher (randomised k-d trees) and RANSAC run on several threads, so two runs of the same code differ by about 0.5 % of matches (89,480 and 89,700) and a few dozen of the 74,000 points. Harmless for an initial point cloud; exact matching would be orders of magnitude slower.
- **SSIM in `evaluate.py` is greyscale** with an 11 px Gaussian window, and PSNR is the mean over images. Consistent across all runs here, but not directly comparable with papers that report RGB SSIM. Now stated in its docstring and the dataset README.
- **`score_splat.py` renders through one Brush training step,** which nudges the splat slightly; agreement with LichtFeld's own renders is 46–51 dB, far below any difference reported here.
- **`make_viewer.py` patches third-party viewer code by pattern.** Each patch fails loudly if a LichtFeld update changes the template, which is the intended behaviour; LichtFeld 0.5.3 is the tested version.
- **The level-of-detail build decimates each level from the full splat** (five reads of a 744 MB PLY, about 2.5 minutes). Decimating each level from the previous one would be faster but changes the levels; the bundling step (about 3.3 minutes) dominates anyway. Bundle size options are in [viewer.md](viewer.md#streamed-levels-of-detail).
- **`brush/train.py` and `lichtfeld/train.py` are similar** but wrap different command lines; merging them would save little.
- **`overlay.html` is specific to this house** (name, links, Help text), which suits one overlay per reconstruction.
