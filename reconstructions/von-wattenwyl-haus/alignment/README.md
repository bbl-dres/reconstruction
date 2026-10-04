# 5 · Camera alignment test

[← Overview](../README.md)

Can free, open-source tools align the panoramas without Matterport? This test aligns cube faces with [COLMAP](https://colmap.github.io/) 4.2.1 from the images alone and compares the result with Matterport's poses, which are accurate to a median epipolar error of 0.48 px ([dataset/README.md](../dataset/README.md)). It tells us whether a future capture, for example a 360° camera walk without Matterport, could be aligned with free tools. October 2026.

## Setup

1. **COLMAP:** download `colmap-x64-windows-cuda.zip` from the [4.2.1 release](https://github.com/colmap/colmap/releases/tag/4.2.1) (SHA-256 `e9c5cbd84c2ea986d2e970a2473fc2d2e6b34a2cdcf5d3df2765c319a63af881`) and unpack it into `tools/colmap/` (so that `tools/colmap/bin/colmap.exe` exists), or set `COLMAP`. Version 4.1 or newer is needed for Blackwell GPUs.
2. **For learned features on the GPU:** COLMAP runs ALIKED, LightGlue and LoMa through ONNX Runtime, whose GPU path needs NVIDIA's CUDA 12 and cuDNN 9 libraries, which COLMAP does not ship. Install them next to it (2.4 GB):

   ```sh
   python -m pip install --target tools/cuda12 nvidia-cuda-runtime-cu12 nvidia-cublas-cu12 nvidia-cudnn-cu12 nvidia-cufft-cu12 nvidia-curand-cu12 nvidia-cuda-nvrtc-cu12
   ```

   Without them the learned variants run on the CPU: about 20 minutes instead of 4–8 for 72 images.

The test against Matterport's poses:

```sh
python align_test.py                      # 12 linked positions on the ground floor
python align_test.py --positions 100      # the whole ground floor (55 positions)
python align_test.py --variants loma-rig  # one variant
python align_test.py --floor all --matching retrieval --variants loma-rig  # the whole house
python to_dataset.py output/all-106-retr6/loma-rig --frame matterport      # dataset in Matterport's frame
```

Output goes to `output/floor<N>-<positions>/` (or `all-106…`): the faces in rig layout, one COLMAP database per feature type, a model per variant, `colmap.log` and `results.json`.

The images-only route, which uses nothing of Matterport's 3D data:

```sh
python prepare_images.py                                     # all 109 panoramas: faces and tripod masks, no poses
python align.py output/images-109                            # COLMAP with LoMa, panoramas as rigs, retrieval matching
python to_dataset.py output/images-109-loma --dataset output/images-109   # dataset in its own frame
```

[`prepare_images.py`](prepare_images.py) takes the cube faces of every panorama, including the three uploads Matterport never placed; the metadata only names them by capture index. [`align.py`](align.py) runs the `loma-rig` variant with retrieval matching on them. [`to_dataset.py`](to_dataset.py) turns a model into a training dataset for `../lichtfeld/train.py full --dataset`. In its own frame (the default) up comes from the faces that point up, and the scale from the camera height above the floor seen in the down faces, assumed to be 1.5 m. Checked on the whole-house model, this frame's up direction differs from Matterport's by 0.04° and its scale by 2.1 % (Matterport implies 1.53 m). With `--frame matterport` it fits the model to Matterport's poses instead, and leaves out positions more than 0.5 m off.

### In the cloud

LoMa on the whole house is too heavy for an 8 GB laptop GPU: its descriptor model alone fills about 7.9 GB, and two local attempts ended in system crashes. The whole-house run was therefore done on a rented RTX 4090 (24 GB) at [RunPod](https://www.runpod.io/), secure cloud, data centre EU-CZ-1, $0.74/h, about $0.45 for the run. The official COLMAP Docker image includes the GPU build of ONNX Runtime; it only lacks SSH, Python and cuDNN, which the start command installs:

```sh
# Image colmap/colmap:20260929.8466 (COLMAP 4.2.1), port 22/tcp, SSH key registered with RunPod
apt-get update && apt-get install -y --no-install-recommends openssh-server
mkdir -p /root/.ssh /run/sshd && echo "$PUBLIC_KEY" > /root/.ssh/authorized_keys && /usr/sbin/sshd
apt-get install -y --no-install-recommends python3 python3-numpy python3-opencv python3-pil python3-psutil libcudnn9-cuda-12
sleep infinity
```

Upload `align_test.py`, `../dataset/make_dataset.py`, the images, masks and `transforms.json` of `../dataset/output/full/` and `../matterport/output/panoramas/metadata.json` in the same folder layout (about 200 MB), then run with `ALIGN_LEARNED_ON_GPU=1` (cuDNN is installed system-wide, not in `tools/cuda12`). Only the model comes back: `sparse/` (112 MB, 47 MB compressed) and the logs; the 1.9 GB feature database can stay. Choose a host with a public IP: a community-cloud machine tried first had none (so no `scp`) and downloaded at 0.1 MB/s.

## Method

- **Images:** the 1024 px cube faces of `../dataset/output/full/`, the tripod patch on down faces masked.
- **Cube faces as a rig.** The six faces of a position share one optical centre at known relative rotations, and the 90° pinhole intrinsics are fixed. Matterport's poses are never given to COLMAP.
- **Matching,** then COLMAP's incremental `mapper` or the `global_mapper` (GLOMAP). `exhaustive` matches every pair of images; `sequential` only panoramas close in capture order (Matterport's sweep index); `retrieval` runs fast exhaustive SIFT matching first and gives the expensive matcher every panorama pair with at least 15 verified SIFT matches, plus the 6 nearest in capture order, with all 36 face pairs of each.
- **Scoring:** the model is rotated onto Matterport's frame using the camera orientations, then scaled and shifted using the camera positions; errors are per image. Positions more than 0.5 m off after a first fit are reported as misaligned and left out of the second fit, so one misplaced position does not mask the accuracy of the rest; if most positions are off, the model counts as failed. Where COLMAP splits the images into several models, the largest one is scored. `--evaluate-only` scores existing models again.

| Variant | Features | Matching | Rig | Mapper |
|---|---|---|---|---|
| `sift-rig` | SIFT | brute force | yes | incremental |
| `sift-rig-global` | SIFT | brute force | yes | global (GLOMAP) |
| `sift-norig` | SIFT | brute force | no | incremental |
| `aliked-lightglue-rig` | ALIKED | LightGlue | yes | incremental |
| `loma-rig` | LoMa B | LoMa B | yes | incremental |

## Results

**12 linked positions (72 faces)**, a compact cluster of rooms on the ground floor:

| Variant | Aligned | Position error, median / 90 % | Rotation error, median | Time |
|---|---|---|---|---|
| `loma-rig` | **72/72, one model** | **0.6 / 1.3 cm** | **0.14°** | 8 min |
| `sift-rig` | 54/72, two models | 0.9 / 1.5 cm | 0.15° | 12 s |
| `sift-rig-global` | 72/72, one model | 3.8 / 7.6 cm | 0.48° | 1 s |
| `aliked-lightglue-rig` | 72/72, one model | CPU run: 3.6 / 12 cm; GPU run: 129 / 477 cm | 0.34° / 0.15° | 19 min CPU, 4 min GPU |
| `sift-norig` | 8/72, one position misaligned | 24 / 30 cm | 2.6° | 11 s |

**The whole ground floor (55 positions, 330 faces):**

| Variant | Aligned | Position error, median / 90 % | Rotation error, median | Time |
|---|---|---|---|---|
| `loma-rig` | **330/330, one model; one position misaligned (4.6 m off)** | **4.5 / 9.2 cm** | **0.37°** | 76 min |
| `sift-rig` | 210/330, three models; one position misaligned | 13 / 28 cm | 1.2° | 3 min |
| `sift-rig-global` | 330/330, one model | 626 / 1272 cm (positions fail) | 0.43° | 10 s |

Locally the LoMa model is as good as on the small cluster: distances between neighbouring positions (under 3 m apart) are off by 0.5 cm median and 1.3 cm at the 90th percentile, and the scale is consistent across the floor to ±0.5 %. Of its 76 minutes, about 8 went into feature extraction and 65 into matching every image with every other (54,000 pairs); larger captures need a smarter choice of pairs.

**The whole house (106 positions on both floors, 636 faces),** `loma-rig`, on the cloud RTX 4090:

| Matching | Aligned | Position error, median / 90 % / max | Rotation error, median | Time |
|---|---|---|---|---|
| `retrieval` (34,854 image pairs) | **636/636, one model, none misaligned** | **5.8 / 13.8 / 25.7 cm** | **0.50°** | 32 min |
| `sequential`, overlap 6 (laptop) | 636/636, one model, but broken | 786 / 1454 cm (model failed) | 2.1°, 90 %: 167° | 47 min |

Retrieval found 772 overlapping panorama pairs with SIFT and added 615 neighbours in capture order: 924 panorama pairs, 34,854 image pairs instead of the 202,000 of exhaustive matching. Time on the RTX 4090: LoMa features 4.6 min (including the one-off model download), SIFT retrieval 5 min, LoMa matching 11.3 min, mapper 11 min; feature extraction ran about five times faster than on the laptop. Sequential matching folded parts of the ground floor over (rotations off by up to 167°), most likely because capture order links some rooms through too few pairs.

**Images only, all 109 panoramas** (`align.py`, nothing of Matterport's 3D data; RTX 4090, 31 min): all 654 faces in one model, the three uploads Matterport never placed included, each with about 6,000 observations. Three positions (s036, s037, s047) were placed on very little evidence, 45-115 observations against a median of 5,256 per position, and are 2.6, 5 and 15 m wrong; the 106-panorama run above had placed the same three within 11 cm, so incremental mapping can go wrong for weakly connected positions from one run to the next. `to_dataset.py` therefore leaves out positions below 10 % of the median (the weakest correctly placed one has 29 %), which removes exactly these three without looking at Matterport. Compared with Matterport afterwards: 5.7 cm median position difference, up direction within 0.04°, scale 2 % apart (the assumed 1.5 m camera height against Matterport's 1.53 m).

## Findings

- **The rig is essential.** Without it, plain SIFT aligned only 8 of 72 faces: a single cube face of a white room offers too few features, and the faces of one position do not overlap.
- **LoMa, a learned matcher (ECCV 2026, MIT licence), is clearly best.** On the cluster it puts every face in one model with sub-centimetre positions and 0.14° rotations, which matches Matterport's own alignment to within its accuracy. On the whole floor it aligns 54 of 55 positions to 4.5 cm median and misplaces one.
- **SIFT is accurate where it connects, but breaks up** on textureless rooms: two models for 12 positions, three for the floor, and larger errors at floor scale.
- **The global mapper is fast and gets rotations right, but its positions fail** on long chains of rooms; on the cluster it was usable (3.8 cm).
- **ALIKED with LightGlue is unstable here:** a CPU run gave a good model, a GPU run of the same data a distorted one.
- **Retrieval matching scales LoMa to the whole house:** one model of both floors, no misplaced position, 5.8 cm median against Matterport, with a sixth of the pairs of exhaustive matching. Matching by capture order alone is not enough, probably because the tour revisits rooms and floors out of order.

**Pitfalls found:**
- COLMAP 4.2.1's `rig_configurator` aborts without a message (exit code `0xC0000409`) unless the reference sensor is listed first in `rig_config.json`.
- With `--ImageReader.mask_path`, images without a mask are skipped, so the script writes white masks for the faces that have no tripod patch.
- Positions along one line (an enfilade) leave the rotation about that line undetermined by positions alone, and defeat global SfM. The test therefore picks a compact cluster and aligns rotations by orientation.
- The memory guard (`ALIGN_MIN_FREE_GB`) reads the machine's free memory. In a container that is the host's (about 1 TB on the cloud machine), not the container's limit, so there it does not protect; COLMAP peaked at 3.6 GB.

## A splat trained on LoMa poses

The whole-house model (`all-106-retr6/loma-rig`) became a dataset with `to_dataset.py` (636 images, no position left out, COLMAP's 173k points as the starting cloud) and was trained exactly like the published splat: LichtFeld 0.5.3, `mrnf`, 60k steps, 3 million cap, 83 minutes on the laptop (`../lichtfeld/output/full-loma-x2/`). Each splat is scored at its own poses with `../dataset/score_splat.py`:

| Splat | Poses and starting cloud | Capture positions (36 faces), PSNR / SSIM | All 636 faces, PSNR / SSIM |
|---|---|---|---|
| Published | Matterport, 74k SIFT points | 26.89 dB / 0.817 | 26.98 dB / 0.831 |
| LoMa | COLMAP with LoMa, 173k points | **28.13 dB / 0.851** | **28.30 dB / 0.862** |

- **Better on every face type:** ceilings +1.1 dB, walls +1.5 dB (better on 406 of 424 wall faces), floors +1.1 dB. It is visibly sharper, for example radiator grilles and rug patterns (`../lichtfeld/output/full-loma-x2/compare-matterport-vs-loma.jpg`, local).
- **What it means:** the LoMa poses agree with the photos more closely than Matterport's (mean reprojection error 0.9 px over 173k points), so the splat can fit them better. The 5.8 cm difference to Matterport is therefore at least partly Matterport's own error.
- **Two caveats.** The starting clouds differ as well (173k against 74k points), so poses and points are not separated. And these are training views. The images-only holdout run in the cloud answered the second: the 11 held-out positions score 17.38 dB / 0.662 with our poses against 16.54 dB / 0.617 with Matterport's, same budget ([cloud/README.md](../cloud/README.md#results-4-october-2026)).
- **One view rendered wrongly:** face 4 (left) of position s033 showed another part of the house (10.9 dB instead of 26.7). Its pose is correct (5.9 cm, 0.56°), its other five faces are fine, and no Gaussians sit close in front of it. It did not recur in the images-only run (26.9 dB), so it was a quirk of that training run. Without it the gain is +1.35 dB.

## Conclusion

Open-source alignment works for this kind of capture, with two conditions: **treat each panorama as a camera rig** and **use learned matching (LoMa)**. COLMAP 4.2 with LoMa recovers Matterport-quality poses for a group of rooms and centimetre-level poses for a whole floor, and with retrieval matching the whole house in one model in half an hour on a rented GPU. A splat trained on those poses fits the photos better than one on Matterport's (+1.3 dB over all 636 faces). An occasional misplaced position remains possible, which a check (or one manual fix) catches. For a capture without Matterport poses, for example a 360° camera walk, this pipeline is a realistic replacement, and on this tour it even beats Matterport's poses.

Next steps:
- **Place the three positions the images-only run left out** (s036, s037, s047), with `image_registrator` and stricter thresholds or a second mapper run.
- **The three uploaded panoramas without a pose:** done in the images-only run (`align.py`), which placed all three with about 6,000 observations each; they are in the cloud splats.
