"""Score Brush evaluation renders against the original cube faces.

    python reconstructions/von-wattenwyl-haus/dataset/evaluate.py brush/output/holdout/eval_30000 dataset/output/holdout

Reports PSNR (RGB) and SSIM (greyscale, 11 px Gaussian window) per face type
(up / side / down) and overall, as the mean over images, ignoring the masked
tripod patch on down faces. Writes metrics.json and a side-by-side contact
sheet (photo above, render below) into the eval folder.
"""
import argparse
import json
import sys
from pathlib import Path

import cv2
import numpy as np


def ssim_map(a, b):
    """Gaussian-window SSIM (Wang et al. 2004) on 0..1 grayscale images."""
    c1, c2 = 0.01 ** 2, 0.03 ** 2
    blur = lambda x: cv2.GaussianBlur(x, (11, 11), 1.5)
    mu_a, mu_b = blur(a), blur(b)
    var_a = blur(a * a) - mu_a ** 2
    var_b = blur(b * b) - mu_b ** 2
    cov = blur(a * b) - mu_a * mu_b
    return ((2 * mu_a * mu_b + c1) * (2 * cov + c2)) / ((mu_a ** 2 + mu_b ** 2 + c1) * (var_a + var_b + c2))


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    parser.add_argument('renders', type=Path, help='Brush eval folder, e.g. splats/holdout/eval_30000')
    parser.add_argument('dataset', type=Path, help='Dataset folder holding images/ and masks/')
    parser.add_argument('--sheet', type=int, default=12, help='Image pairs in the contact sheet (0 disables)')
    args = parser.parse_args()

    rows = []
    for render_path in sorted(args.renders.glob('*.png')):
        name = render_path.stem
        photo = cv2.imread(str(args.dataset / 'images' / f'{name}.jpg'), cv2.IMREAD_COLOR)
        render = cv2.imread(str(render_path), cv2.IMREAD_COLOR)
        if photo is None or render is None:
            continue
        render = cv2.resize(render, photo.shape[1::-1], interpolation=cv2.INTER_AREA)
        mask_path = args.dataset / 'masks' / f'{name}.png'
        keep = cv2.imread(str(mask_path), cv2.IMREAD_GRAYSCALE) > 127 if mask_path.exists() else np.ones(photo.shape[:2], bool)
        a, b = photo.astype(np.float64) / 255, render.astype(np.float64) / 255
        mse = np.mean(((a - b) ** 2)[keep])
        ssim = ssim_map(cv2.cvtColor(photo, cv2.COLOR_BGR2GRAY) / 255.0, cv2.cvtColor(render, cv2.COLOR_BGR2GRAY) / 255.0)[keep].mean()
        face = int(name.rsplit('_f', 1)[1])
        rows.append({'image': name, 'face': {0: 'up', 5: 'down'}.get(face, 'side'),
                     'psnr': float(10 * np.log10(1 / max(mse, 1e-12))), 'ssim': float(ssim)})
    if not rows:
        raise SystemExit(f'No renders with matching photos in {args.renders}')

    summary = {}
    for group in ('up', 'side', 'down', 'all'):
        subset = [r for r in rows if group == 'all' or r['face'] == group]
        if subset:
            summary[group] = {'images': len(subset), 'psnr': round(float(np.mean([r['psnr'] for r in subset])), 2),
                              'ssim': round(float(np.mean([r['ssim'] for r in subset])), 3)}
    (args.renders / 'metrics.json').write_text(json.dumps({'summary': summary, 'images': rows}, indent=1), encoding='utf-8')
    for group, values in summary.items():
        print(f'{group:>5}: {values["images"]:3d} images  PSNR {values["psnr"]:5.2f} dB  SSIM {values["ssim"]:.3f}')

    # Evenly spaced side faces show the walls and furniture people look at.
    sides = [r['image'] for r in rows if r['face'] == 'side']
    if args.sheet and sides:
        picks = [sides[i] for i in np.linspace(0, len(sides) - 1, min(args.sheet, len(sides))).astype(int)]
        tiles = []
        for name in picks:
            photo = cv2.resize(cv2.imread(str(args.dataset / 'images' / f'{name}.jpg')), (384, 384), interpolation=cv2.INTER_AREA)
            render = cv2.resize(cv2.imread(str(args.renders / f'{name}.png')), (384, 384), interpolation=cv2.INTER_AREA)
            tiles.append(np.vstack([photo, render, np.full((8, 384, 3), 255, np.uint8)]))
        columns = 6
        while len(tiles) % columns:
            tiles.append(np.full_like(tiles[0], 255))
        strips = [np.hstack(tiles[i:i + columns]) for i in range(0, len(tiles), columns)]
        cv2.imwrite(str(args.renders / 'contact-sheet.jpg'), np.vstack(strips), [cv2.IMWRITE_JPEG_QUALITY, 88])
    return 0


if __name__ == '__main__':
    sys.exit(main())
