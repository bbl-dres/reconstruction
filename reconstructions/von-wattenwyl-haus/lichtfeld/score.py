"""Score a LichtFeld holdout run with dataset/evaluate.py, comparable to Brush.

    python reconstructions/von-wattenwyl-haus/lichtfeld/score.py lichtfeld/output/holdout-mrnf-x1

LichtFeld saves each evaluation as one image, photo on the left and render on
the right, numbered in its own order and with the tripod circle blacked out on
down faces. Each image is identified by matching its photo half against the
held-out photos (outside the tripod circle), the render half is saved under the
photo's name in eval_<step>_renders/, and those renders are scored.
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path

import cv2
import numpy as np

HERE = Path(__file__).resolve().parent
DATASET = HERE.parent / 'dataset'


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    parser.add_argument('run', type=Path, help='LichtFeld output folder with eval_step_<N>/')
    parser.add_argument('--step', type=int, help='Evaluation step (default: the last one)')
    args = parser.parse_args()

    steps = sorted(int(p.name.rsplit('_', 1)[1]) for p in args.run.glob('eval_step_*'))
    if not steps:
        raise SystemExit(f'No eval_step_* folders in {args.run}')
    step = args.step or steps[-1]
    held_out = DATASET / 'output' / 'holdout'
    names = [Path(f['file_path']).stem for f in json.loads((held_out / 'transforms_val.json').read_text(encoding='utf-8'))['frames']]
    yy, xx = np.indices((128, 128))
    keep = np.hypot(yy - 63.5, xx - 63.5) > 36  # outside the masked tripod circle
    thumb = lambda image: cv2.resize(image, (128, 128), interpolation=cv2.INTER_AREA).astype(float)[keep]
    photos = {name: thumb(cv2.imread(str(held_out / 'images' / f'{name}.jpg'))) for name in names}
    evals = sorted((args.run / f'eval_step_{step}').glob('*.png'), key=lambda p: int(p.stem))
    images = [cv2.imread(str(p)) for p in evals]
    if not images:
        raise SystemExit(f'No evaluation images in {args.run / f"eval_step_{step}"}')
    size = images[0].shape[0]  # each image is photo | render, both square faces
    psnr = lambda a, b: 10 * np.log10(255 ** 2 / max(np.mean((a - b) ** 2), 1e-9))
    score = np.array([[psnr(thumb(image[:, :size]), photos[name]) for name in names] for image in images])

    # One-to-one assignment, most confident pairs first.
    pairs, used_images, used_names = {}, set(), set()
    for i, j in sorted(np.ndindex(score.shape), key=lambda ij: -score[ij]):
        if i not in used_images and j not in used_names:
            pairs[i] = j
            used_images.add(i)
            used_names.add(j)
    weakest = min(score[i, j] for i, j in pairs.items())
    if weakest < 30:
        raise SystemExit(f'Could not identify every evaluation image (weakest photo match {weakest:.1f} dB).')
    out = args.run / f'eval_{step}_renders'
    out.mkdir(exist_ok=True)
    for i, j in pairs.items():
        cv2.imwrite(str(out / f'{names[j]}.png'), images[i][:, -size:])
    print(f'Step {step}: {len(pairs)} renders identified (weakest photo match {weakest:.1f} dB) -> {out}', flush=True)
    return subprocess.run([sys.executable, str(DATASET / 'evaluate.py'), str(out), str(held_out)]).returncode


if __name__ == '__main__':
    sys.exit(main())
