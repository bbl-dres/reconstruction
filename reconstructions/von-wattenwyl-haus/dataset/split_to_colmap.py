"""Write a held-out split as a COLMAP dataset for trainers that pick every Nth image.

LichtFeld Studio (and gsplat-style trainers) evaluate on images i % N == 0 in
images.txt order and cannot read transforms_val.json. This orders the images so
that exactly the held-out views fall on those slots, reproducing the same
whole-sweep split that Brush uses.

    python reconstructions/von-wattenwyl-haus/dataset/split_to_colmap.py

Reads dataset/output/holdout/ and writes dataset/output/holdout-colmap/
(images/, masks/, sparse/0/*.txt, split.json), then prints the
--test-every value. When the training images do not fill every slot, a few are
repeated under a new name; held-out images are never repeated or trained on.
"""
import argparse
import json
import math
import os
import shutil
import sys
from pathlib import Path

import numpy as np

from make_dataset import HERE, read_ply, write_colmap


def link(source, target):
    if target.exists():
        return
    try:
        os.link(source, target)  # no extra disk space on NTFS
    except OSError:
        shutil.copy2(source, target)


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    parser.add_argument('dataset', type=Path, nargs='?', default=HERE / 'output' / 'holdout',
                        help='Folder with transforms_train.json and transforms_val.json (default: dataset/output/holdout)')
    parser.add_argument('--out', type=Path, help='Output folder (default: <dataset>-colmap)')
    args = parser.parse_args()

    source = args.dataset.resolve()
    out = (args.out or source.with_name(source.name + '-colmap')).resolve()
    train = json.loads((source / 'transforms_train.json').read_text(encoding='utf-8'))
    val = json.loads((source / 'transforms_val.json').read_text(encoding='utf-8'))['frames']
    frames = train['frames']
    every = math.ceil(len(frames) / len(val)) + 1  # smallest N whose training slots hold every training image
    slots = len(val) * (every - 1)
    repeats = [frames[round(i * len(frames) / (slots - len(frames)))] for i in range(slots - len(frames))] if slots > len(frames) else []

    for folder in ('images', 'masks'):
        (out / folder).mkdir(parents=True, exist_ok=True)

    def place(frame, name):
        image = Path(frame['file_path']).name
        link(source / 'images' / image, out / 'images' / name)
        mask = source / 'masks' / (Path(image).stem + '.png')
        if mask.exists():
            link(mask, out / 'masks' / (Path(name).stem + '.png'))
        return name, frame

    training = [place(f, Path(f['file_path']).name) for f in frames]
    training += [place(f, f'repeat{i:02d}_{Path(f["file_path"]).name}') for i, f in enumerate(repeats)]
    ordered = []
    for block, frame in enumerate(val):
        ordered.append(place(frame, Path(frame['file_path']).name))
        ordered += training[block * (every - 1):(block + 1) * (every - 1)]
    if len(ordered) != len(val) * every or any(ordered[i * every][1] not in val for i in range(len(val))):
        raise SystemExit('Internal error: held-out images do not fall on every --test-every slot.')

    size = train['w']
    cameras = []
    for name, frame in ordered:
        c2w = np.array(frame['transform_matrix'])
        cameras.append((name, c2w[:3, :3] @ np.diag([1, -1, -1]), c2w[:3, 3]))  # OpenGL -> OpenCV camera axes
    write_colmap(out / 'sparse' / '0', size, train['fl_x'], cameras, *read_ply(source / train['ply_file_path']))
    (out / 'split.json').write_text(json.dumps({
        'testEvery': every, 'heldOutImages': len(val), 'trainingImages': len(frames), 'repeatedTrainingImages': len(repeats),
        'imageSize': size, 'source': str(source.name)}, indent=1), encoding='utf-8')
    print(f'{len(ordered)} images ({len(val)} held out, {len(frames)} training + {len(repeats)} repeats) -> {out}')
    print(f'Use --eval --test-every {every}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
