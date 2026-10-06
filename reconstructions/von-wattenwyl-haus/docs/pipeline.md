# Pipeline

[← Overview](../README.md)

| Step | Folder | What it does | Local output |
|---|---|---|---|
| 1 | [matterport/](../matterport/README.md) | Downloads the posed panoramas and archives the public tour | `matterport/output/` |
| 2 | [dataset/](../dataset/README.md) | Turns panoramas into posed pinhole images, an initial point cloud and a held-out split; scores renders | `dataset/output/` |
| 3a | [brush/](../brush/README.md) | Trains splats with Brush | `brush/output/` |
| 3b | [lichtfeld/](../lichtfeld/README.md) | Trains splats with LichtFeld Studio and scores them like Brush | `lichtfeld/output/` |
| 4 | [viewer/](../viewer/README.md) | Builds a standalone HTML viewer from a splat, for desktop and phones | `viewer/output/` (published) |
| 5 | [alignment/](../alignment/README.md) | Aligns the panoramas ourselves (COLMAP with LoMa), scored against Matterport's poses, and turns the result into a training dataset | `alignment/output/` |
| 6 | [cloud/](../cloud/README.md) | Runs alignment, LichtFeld training (a Linux build) and the viewer build on rented GPUs, from the images alone | `cloud/tools/` (the LichtFeld build) |

Requires Python 3.11+. `matterport/download.py` uses only the standard library; the other steps need `pip install -r reconstructions/von-wattenwyl-haus/requirements.txt`, and the streamed viewer (`--lod`) needs Node.js. From `reconstructions/von-wattenwyl-haus/`:

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
