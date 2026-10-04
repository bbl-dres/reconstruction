"""Render a trained splat (.ply) at a dataset's views with gsplat, for scoring with evaluate.py where Brush cannot run.

    python dataset/render_gsplat.py SPLAT DATASET OUT [--views all|capture]
    python dataset/evaluate.py OUT DATASET --sheet 0

score_splat.py renders with Brush, which needs Vulkan (absent in cloud containers) and allocates training
memory for the whole splat (too much for the laptop's 8 GB at 10 million Gaussians). This renders each frame
of DATASET/transforms.json (all, or the capture positions s000, s020, ..., s100) as OUT/<image stem>.png:
standard 3D Gaussian rasterization (gsplat, pinhole, 0.3 px screen-space dilation), spherical harmonics up to
the splat's degree, black background. Needs a CUDA GPU, PyTorch and gsplat (pip install gsplat).
"""
import argparse
import json
import sys
from pathlib import Path

import cv2
import numpy as np

CAPTURE_SWEEPS = (0, 20, 40, 60, 80, 100)


def read_splat(path):
    """A 3DGS .ply (all properties float) -> means, quaternions (w, x, y, z), scales, opacities, SH (N, K, 3), degree."""
    with open(path, 'rb') as file:
        header = []
        while not header or header[-1] != 'end_header':
            header.append(file.readline().decode('ascii').strip())
        props = [line.split() for line in header if line.startswith('property')]
        if any(kind not in ('float', 'float32') for _, kind, _ in props):
            raise SystemExit(f'{path}: expected float properties only')
        names = [name for _, _, name in props]
        count = int(next(line for line in header if line.startswith('element vertex')).split()[-1])
        data = np.fromfile(file, dtype=np.float32, count=count * len(names)).reshape(count, len(names))
    column = {name: i for i, name in enumerate(names)}
    take = lambda keys: data[:, [column[k] for k in keys]]
    rest = sorted((n for n in names if n.startswith('f_rest_')), key=lambda n: int(n.rsplit('_', 1)[1]))
    per_channel = len(rest) // 3
    sh = np.concatenate([take(['f_dc_0', 'f_dc_1', 'f_dc_2'])[:, None, :],
                         take(rest).reshape(count, 3, per_channel).transpose(0, 2, 1)], axis=1)
    quats = take(['rot_0', 'rot_1', 'rot_2', 'rot_3'])
    quats /= np.linalg.norm(quats, axis=1, keepdims=True)
    return (take(['x', 'y', 'z']), quats, np.exp(take(['scale_0', 'scale_1', 'scale_2'])),
            1 / (1 + np.exp(-data[:, column['opacity']])), sh, int(round((per_channel + 1) ** 0.5)) - 1)


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    parser.add_argument('splat', type=Path)
    parser.add_argument('dataset', type=Path, help='Folder with transforms.json (alignment/to_dataset.py or make_dataset.py)')
    parser.add_argument('out', type=Path, help='Folder for the renders')
    parser.add_argument('--views', choices=['all', 'capture'], default='all')
    args = parser.parse_args()

    import torch
    from gsplat import rasterization
    device = torch.device('cuda')
    tensor = lambda a: torch.from_numpy(np.ascontiguousarray(a, dtype=np.float32)).to(device)
    means, quats, scales, opacities, sh, degree = read_splat(args.splat)
    means, quats, scales, opacities, sh = map(tensor, (means, quats, scales, opacities, sh))
    data = json.loads((args.dataset / 'transforms.json').read_text(encoding='utf-8'))
    width, height = int(data['w']), int(data['h'])
    intrinsics = tensor([[data['fl_x'], 0, data['cx']], [0, data['fl_y'], data['cy']], [0, 0, 1]])[None]
    frames = [f for f in data['frames'] if args.views == 'all' or int(Path(f['file_path']).stem[1:4]) in CAPTURE_SWEEPS]
    args.out.mkdir(parents=True, exist_ok=True)
    with torch.no_grad():
        for frame in frames:
            c2w = np.array(frame['transform_matrix'], dtype=np.float64) @ np.diag([1, -1, -1, 1])  # OpenGL -> OpenCV axes
            colors, _, _ = rasterization(means, quats, scales, opacities, sh, tensor(np.linalg.inv(c2w))[None], intrinsics,
                                         width, height, sh_degree=degree)
            image = (colors[0].clamp(0, 1).cpu().numpy() * 255 + 0.5).astype(np.uint8)
            cv2.imwrite(str(args.out / f'{Path(frame["file_path"]).stem}.png'), image[..., ::-1])
    print(f'{len(frames)} views of {len(means):,} Gaussians (SH degree {degree}) -> {args.out}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
