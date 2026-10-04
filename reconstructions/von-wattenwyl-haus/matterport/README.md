# 1 · Matterport download and archive

[← Overview](../README.md)

Everything retrieved from the public tour lands in `output/`, and nothing else does:

| Folder | Content |
|---|---|
| `output/panoramas/` | All 109 panoramas as 2048 px cube faces (`sweeps/<sweep>/2k_face<k>.jpg`) and `metadata.json` (model ID, poses, floors, rooms, neighbours; no expiring URLs). From `download.py --include-unplaced`. |
| `output/tour/r9QzqKWcYwh/` | [matterport-dl](https://github.com/rebane2001/matterport-dl) offline copy: viewer code, panoramas as faces (256/1024/2048 px) and tiles, the 50k mesh (`.dam`) with 198 textures, floors, rooms, labels, snapshots and plugins. |
| `output/MANIFEST.sha256` | Checksums of both. Verify with `sha256sum -c MANIFEST.sha256` from `output/`. |

Copy `output/` to BBL-managed storage; it is the archive. `tools/matterport-dl/` holds matterport-dl at commit `4ec8c4b`, patched with open upstream PR [#210](https://github.com/rebane2001/matterport-dl/pull/210) (needed for Matterport's current player; the diff is `tools/matterport-dl-pr210.diff`) and limited to 4 parallel requests. Keep it with the archive to serve the offline tour:

```sh
cd tools/matterport-dl
python run.py r9QzqKWcYwh 127.0.0.1 8080 --base-folder ../../output/tour
```

## Download the panoramas

```sh
python download.py "https://my.matterport.com/show/?m=r9QzqKWcYwh" --include-unplaced
```

`download.py` uses the same public GraphQL request as matterport-dl (`GetShowcaseSweeps`) but fetches only the poses and the six skybox faces per panorama. It resumes interrupted runs and refreshes the signed CDN URLs, which expire after a few minutes. Options:

- `--resolution` picks the face size (default: the largest available).
- `--limit N` downloads only the first N panoramas, for a quick trial.
- `--include-unplaced` also fetches the uploaded 360° photos that have no pose.
- `--out` changes the output folder (default `output/panoramas/`).

## Archive gaps

- **500k mesh: not available.** Matterport refuses the detailed mesh (HTTP 403) even with its own signed link; it appears to be owner-only. Only the 50k mesh is archived.
- **Panorama tiles: rebuilt locally.** Matterport's CDN answered 13,657 of 13,734 tile requests with HTTP 429 (rate limited), even at 4 parallel requests. `fill_tiles.py` rebuilt the 12,600 still missing as crops of the archived faces. Against the 1,134 tiles that did download, crops differ by 0.3–0.7 grey levels, or 2.1 for the downscaled 512 level. Rebuilt files are listed in `output/tour/r9QzqKWcYwh/tiles-generated.json`.
- **Offline viewer: not yet confirmed in a real browser.** Headless Edge stopped at the viewer's own browser check (software-only WebGL) before requesting any tour data, so that test was inconclusive.

## Camera convention

Matterport world coordinates are right-handed, Z up, in metres. `position` is the camera centre, and `rotation` (x, y, z, w) maps panorama-local axes to world.

| Face | Direction | Local axis |
|---|---|---|
| 0 | Up | its bottom edge meets face 1 |
| 1 | Front | +X |
| 2 | Right | −Y |
| 3 | Back | −X |
| 4 | Left | +Y |
| 5 | Down | its top edge meets face 1 |

`FACE_AXES` in `../dataset/make_dataset.py` encodes this. It was verified two ways:

- **Cube-edge continuity.** For every face, the true seam matched at least 2.5× better than any other edge, and usually 5–19× better.
- **Epipolar error between neighbouring panoramas.** All eight combinations of front axis and quaternion direction were tested. The one used gives a median of 1.9 px at 1024 px; the alternatives give 20–500 px.
