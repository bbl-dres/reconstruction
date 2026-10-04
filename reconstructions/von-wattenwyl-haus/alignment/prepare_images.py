"""Prepare the panoramas for an images-only alignment: cube faces and tripod masks, no poses.

    python reconstructions/von-wattenwyl-haus/alignment/prepare_images.py

Takes every panorama in matterport/output/panoramas/ (all 109, including the
three uploads Matterport never placed) as its six 90° cube faces, as published.
Nothing of Matterport's 3D data is used: metadata.json only names each panorama
by its capture index (s000 ... s108), which is also the order retrieval matching
uses for neighbours. The faces' fixed layout (one optical centre, 90° apart) is
part of the image format; align.py uses it as a camera rig.

Writes alignment/output/images-<N>/ (or --out): images/s###_f#.jpg at --size px,
masks/s###_f5.png for the tripod patch on the down faces (white = keep), and
transforms.json with the shared pinhole intrinsics and no frames.
"""
import argparse
import json
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT / 'dataset'))
from make_dataset import write_image  # noqa: E402


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    parser.add_argument('panoramas', type=Path, nargs='?', default=ROOT / 'matterport' / 'output' / 'panoramas',
                        help='Folder written by matterport/download.py --include-unplaced')
    parser.add_argument('--size', type=int, default=1024, help='Face size in px (default 1024: the faces hold about 1k of real detail)')
    parser.add_argument('--nadir-mask', type=float, default=0.5, help='Tripod mask diameter as a fraction of the face width')
    parser.add_argument('--out', type=Path, help='Output folder (default: alignment/output/images-<panoramas>)')
    args = parser.parse_args()

    metadata = json.loads((args.panoramas / 'metadata.json').read_text(encoding='utf-8'))
    views = []
    for sweep in sorted(metadata['sweeps'], key=lambda s: s['index']):
        sources = [args.panoramas / 'sweeps' / sweep['sweepUuid'] / f'{metadata["resolution"]}_face{k}.jpg' for k in range(6)]
        if all(path.exists() for path in sources):
            views += [{'name': f's{sweep["index"]:03d}_f{face}.jpg', 'face': face, 'source': sources[face]} for face in range(6)]
    panoramas = len(views) // 6
    out = (args.out or HERE / 'output' / f'images-{panoramas}').resolve()
    for folder in ('images', 'masks'):
        (out / folder).mkdir(parents=True, exist_ok=True)
    with ThreadPoolExecutor() as pool:
        list(pool.map(lambda view: write_image(view, out, args.size, args.nadir_mask), views))
    focal = args.size / 2  # exact 90° faces
    camera = {'camera_model': 'OPENCV', 'fl_x': focal, 'fl_y': focal, 'cx': args.size / 2, 'cy': args.size / 2,
              'w': args.size, 'h': args.size, 'k1': 0, 'k2': 0, 'p1': 0, 'p2': 0}
    (out / 'transforms.json').write_text(json.dumps({**camera, 'frames': []}, indent=1), encoding='utf-8')
    print(f'{panoramas} panoramas, {len(views)} faces -> {out}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
