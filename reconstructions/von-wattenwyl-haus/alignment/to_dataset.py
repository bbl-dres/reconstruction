"""Turn a COLMAP model from align.py or align_test.py into a training dataset.

    python reconstructions/von-wattenwyl-haus/alignment/to_dataset.py alignment/output/images-109-loma --dataset alignment/output/images-109
    python reconstructions/von-wattenwyl-haus/alignment/to_dataset.py alignment/output/all-106-retr6/loma-rig --frame matterport

Poses and points stay COLMAP's own; one similarity transform only moves the
model into a usable frame. The initial point cloud is COLMAP's sparse model.

--frame own (default) uses the images alone: up is the mean direction of the
cube faces that point up (the panoramas are levelled to about 1°), the
horizontal axes follow the spread of the capture positions, and the scale makes
each camera --camera-height above the floor its down face sees (median over
positions; no image can give true scale). The ground floor lies at z = 0.
Positions that observe fewer than --min-observations (default 10 %) of the median
position's 3D points are left out: in the images-only model of all 109
panoramas, three positions registered with 1-2 % of the median were placed
2.6-15 m wrong, while every correctly placed one had at least 29 %. If
Matterport's metadata is at hand, the report compares the result with it, for
information only.

--frame matterport fits the model to Matterport's poses (rotation from the
camera orientations, scale and offset from the positions, like align_test.py's
scoring), so a splat lines up with the viewers built on Matterport's frame.
Positions more than 0.5 m from Matterport's after the fit are left out.

Images and masks are linked from --dataset (default dataset/output/full/);
images COLMAP did not register are left out. Writes <model>-dataset/ (or --out):
images/, masks/, sparse/0/ (COLMAP text, one PINHOLE camera), transforms.json,
sparse_pc.ply and report.json.

--holdout-every N leaves every Nth position out of training (index % N == N // 2,
the positions make_dataset.py holds out: s005, s015, ... for 10) and writes their
views, with images and transforms.json, to <out>-val/ for scoring
(dataset/score_splat.py --views all --dataset <out>-val). COLMAP triangulated its
points from all views, so the training cloud keeps only points that at least two
training views observe.
"""
import argparse
import json
import re
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT / 'dataset'))
from make_dataset import FACE_AXES, quaternion_matrix, write_colmap, write_ply  # noqa: E402
from align_test import evaluate, link, read_model  # noqa: E402

UP_FACE, DOWN_FACE = 0, 5


def read_points(model):
    """points3D.txt -> ids, xyz, rgb."""
    ids, xyz, rgb = [], [], []
    for line in (model / 'points3D.txt').read_text(encoding='utf-8').splitlines():
        if line and not line.startswith('#'):
            parts = line.split()
            ids.append(int(parts[0]))
            xyz.append([float(v) for v in parts[1:4]])
            rgb.append([int(v) for v in parts[4:7]])
    return np.array(ids, int), np.array(xyz).reshape(-1, 3), np.array(rgb, np.uint8).reshape(-1, 3)


def read_observations(model, prefix):
    """images.txt -> {image name: ids of the 3D points it observes}, for images whose name starts with prefix."""
    lines = [line for line in (model / 'images.txt').read_text(encoding='utf-8').splitlines() if not line.startswith('#')]
    observed = {}
    for i in range(0, len(lines) - 1, 2):
        parts = lines[i].split()
        if len(parts) >= 10 and parts[9].startswith(prefix):
            ids = np.array(lines[i + 1].split()[2::3], int) if lines[i + 1].strip() else np.zeros(0, int)
            observed[parts[9]] = ids[ids >= 0]
    return observed


def read_tracks(model):
    """points3D.txt tracks -> {point id: names of the images that observe it}."""
    lines = [line for line in (model / 'images.txt').read_text(encoding='utf-8').splitlines() if not line.startswith('#')]
    names = {int(lines[i].split()[0]): lines[i].split()[9] for i in range(0, len(lines) - 1, 2) if len(lines[i].split()) >= 10}
    tracks = {}
    for line in (model / 'points3D.txt').read_text(encoding='utf-8').splitlines():
        if line and not line.startswith('#'):
            parts = line.split()
            tracks[int(parts[0])] = [names[int(i)] for i in parts[8::2] if int(i) in names]
    return tracks


def write_views(out, names, poses, transform, source_folder):
    """Link the images and masks of `names` into out/; return (cameras for write_colmap, transforms.json frames)."""
    scale, rotation, offset = transform
    for folder in ('images', 'masks'):
        (out / folder).mkdir(parents=True, exist_ok=True)
    cameras, frames = [], []
    for name in sorted(names, key=lambda n: (int(re.search(r's(\d+)', n).group(1)), n)):
        face, index = (int(v) for v in re.fullmatch(r'face(\d)/s(\d+)\.jpg', name).groups())
        stem = f's{index:03d}_f{face}'
        if not (source_folder / 'images' / f'{stem}.jpg').exists():
            raise SystemExit(f'{stem}.jpg is not in {source_folder / "images"}; pass the images the model was aligned from with --dataset')
        r_wc = rotation @ poses[name][0]
        centre = scale * rotation @ poses[name][1] + offset
        link(source_folder / 'images' / f'{stem}.jpg', out / 'images' / f'{stem}.jpg')
        frame = {'file_path': f'images/{stem}.jpg'}
        if (source_folder / 'masks' / f'{stem}.png').exists():
            link(source_folder / 'masks' / f'{stem}.png', out / 'masks' / f'{stem}.png')
            frame['mask_path'] = f'masks/{stem}.png'
        c2w = np.eye(4)
        c2w[:3, :3] = r_wc @ np.diag([1, -1, -1])  # OpenCV -> OpenGL camera axes
        c2w[:3, 3] = centre
        frames.append({**frame, 'transform_matrix': np.round(c2w, 10).tolist()})
        cameras.append((f'{stem}.jpg', r_wc, centre))
    return cameras, frames


def weak_positions(model, share):
    """Positions whose faces observe fewer than `share` x the median position's 3D points: placed on too little evidence."""
    counts = {}
    for name, observed in read_observations(model, 'face').items():
        position = name.split('/')[1].split('.')[0]
        counts[position] = counts.get(position, 0) + len(observed)
    median = float(np.median(list(counts.values())))
    return {p: round(n / median, 3) for p, n in counts.items() if n < share * median}


def fit_frame(poses, truth, outlier=0.5):
    """Similarity into Matterport's frame, ignoring positions more than `outlier` metres off after a first fit.
    Returns scale, rotation, offset and the names of the images that fit."""
    names = sorted(set(poses) & set(truth))
    u, _, vt = np.linalg.svd(sum(truth[n][0] @ poses[n][0].T for n in names))
    rotation = u @ np.diag([1, 1, np.linalg.det(u @ vt)]) @ vt
    estimated = np.array([poses[n][1] for n in names]) @ rotation.T
    reference = np.array([truth[n][1] for n in names])
    keep = np.ones(len(names), bool)
    for _ in range(2):
        mu_e, mu_r = estimated[keep].mean(0), reference[keep].mean(0)
        scale = float(((estimated[keep] - mu_e) * (reference[keep] - mu_r)).sum() / ((estimated[keep] - mu_e) ** 2).sum())
        keep = np.linalg.norm(scale * (estimated - mu_e) - (reference - mu_r), axis=1) < outlier
        if keep.sum() < max(3, len(names) / 2):
            raise SystemExit('Most positions disagree with Matterport by more than 0.5 m: the model failed as a whole.')
    return scale, rotation, mu_r - scale * mu_e, {n for n, k in zip(names, keep) if k}


def own_frame(poses, model, camera_height):
    """Similarity into a Z-up frame from the images alone. Returns scale, rotation, offset and a short report."""
    up = np.mean([r_wc[:, 2] for name, (r_wc, _) in poses.items() if name.startswith(f'face{UP_FACE}/')], axis=0)
    up /= np.linalg.norm(up)
    axis = np.cross(up, [0, 0, 1])
    angle = np.arctan2(np.linalg.norm(axis), up[2])
    k = np.array([[0, -axis[2], axis[1]], [axis[2], 0, -axis[0]], [-axis[1], axis[0], 0]]) / max(np.linalg.norm(axis), 1e-12)
    tilt = np.eye(3) + np.sin(angle) * k + (1 - np.cos(angle)) * k @ k  # Rodrigues: up -> +Z
    xy = np.array([(tilt @ centre)[:2] for name, (_, centre) in poses.items() if name.startswith(f'face{UP_FACE}/')])
    _, vectors = np.linalg.eigh(np.cov((xy - xy.mean(0)).T))
    yaw = np.arctan2(vectors[1, -1], vectors[0, -1])  # longest spread of the positions -> +X
    turn = np.array([[np.cos(-yaw), -np.sin(-yaw), 0], [np.sin(-yaw), np.cos(-yaw), 0], [0, 0, 1]])
    rotation = turn @ tilt
    ids, xyz, _ = read_points(model)
    height_of = dict(zip(ids.tolist(), (xyz @ rotation.T)[:, 2]))
    heights = {}  # per position: how far below the camera the surfaces seen by its down face lie
    for name, observed in read_observations(model, f'face{DOWN_FACE}/').items():
        if name not in poses:  # a position left out
            continue
        camera_z = (rotation @ poses[name][1])[2]
        below = np.array([camera_z - height_of[i] for i in observed.tolist() if i in height_of])
        below = below[below > 0]
        if len(below) >= 20:
            heights[name.split('/')[1]] = float(np.percentile(below, 75))  # the floor is the farthest surface below
    if len(heights) < 3:
        raise SystemExit('Too few down faces see enough points to estimate the camera height.')
    median = float(np.median(list(heights.values())))
    scale = camera_height / median
    up_names = [n for n in poses if n.startswith(f'face{UP_FACE}/')]
    positions = np.array([scale * rotation @ poses[n][1] for n in up_names])
    offset = -np.array([*positions[:, :2].mean(0), np.percentile(positions[:, 2] - camera_height, 5)])
    report = {'upTiltFromModelZDeg': round(float(np.degrees(angle)), 2), 'cameraHeight': camera_height,
              'positionsWithHeight': len(heights), 'heightSpreadPercent': round(float(np.std(list(heights.values())) / median * 100), 1)}
    return scale, rotation, offset, report


def matterport_truth(metadata_path):
    metadata = json.loads(metadata_path.read_text(encoding='utf-8'))
    return {f'face{face}/s{sweep["index"]:03d}.jpg': (quaternion_matrix(sweep['rotation']) @ FACE_AXES[face],
                                                       np.array([sweep['position'][k] for k in 'xyz']))
            for sweep in metadata['sweeps'] if sweep['placement'] != 'unplaced' for face in range(6)}


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    parser.add_argument('model', type=Path, help='Folder with sparse/<n>/ models (align.py output, or an align_test.py variant)')
    parser.add_argument('--frame', choices=['own', 'matterport'], default='own', help='Coordinate frame (default: own, from the images alone)')
    parser.add_argument('--camera-height', type=float, default=1.5, help='Own frame: assumed camera height above the floor in metres')
    parser.add_argument('--min-observations', type=float, default=0.1,
                        help="Own frame: leave out positions that observe less than this share of the median position's points")
    parser.add_argument('--out', type=Path, help='Dataset folder (default: <model>-dataset next to the model)')
    parser.add_argument('--dataset', type=Path, default=ROOT / 'dataset' / 'output' / 'full',
                        help='Source of images, masks and intrinsics (transforms.json), e.g. a prepare_images.py folder')
    parser.add_argument('--metadata', type=Path, default=ROOT / 'matterport' / 'output' / 'panoramas' / 'metadata.json')
    parser.add_argument('--holdout-every', type=int, default=0,
                        help='Hold out every Nth position (index %% N == N // 2) and write its views to <out>-val/ for scoring')
    args = parser.parse_args()

    root = args.model.resolve()
    model = max((p for p in (root / 'sparse').iterdir() if p.is_dir() and (p / 'images.txt').exists()),
                key=lambda p: len(read_model(p)))
    poses = read_model(model)
    truth = matterport_truth(args.metadata) if args.metadata.exists() else None
    if args.frame == 'matterport':
        if truth is None:
            raise SystemExit(f'--frame matterport needs {args.metadata}')
        scale, rotation, offset, keep = fit_frame(poses, truth)
        frame_report = {'frame': 'matterport', 'scale': scale}
    else:
        weak = weak_positions(model, args.min_observations)
        keep = {n for n in poses if n.split('/')[1].split('.')[0] not in weak}
        scale, rotation, offset, frame_report = own_frame({n: poses[n] for n in keep}, model, args.camera_height)
        frame_report = {'frame': 'own', 'scale': scale, **frame_report, 'leftOutWeak': weak}

    source = json.loads((args.dataset / 'transforms.json').read_text(encoding='utf-8'))
    size, focal = int(source['w']), float(source['fl_x'])
    camera = {k: source[k] for k in ('camera_model', 'fl_x', 'fl_y', 'cx', 'cy', 'w', 'h', 'k1', 'k2', 'p1', 'p2')}
    out = (args.out or root.with_name(root.name + '-dataset')).resolve()
    n = args.holdout_every
    held = {name for name in keep if n and int(re.search(r's(\d+)', name).group(1)) % n == n // 2}
    train = keep - held
    ids, xyz, rgb = read_points(model)
    if held:  # only points that two training views observe
        tracks = read_tracks(model)
        seen = np.array([sum(view in train for view in tracks.get(i, ())) >= 2 for i in ids.tolist()], bool)
        ids, xyz, rgb = ids[seen], xyz[seen], rgb[seen]
    xyz = xyz @ (scale * rotation).T + offset
    cameras, frames = write_views(out, train, poses, (scale, rotation, offset), args.dataset)
    write_colmap(out / 'sparse' / '0', size, focal, cameras, xyz, rgb)
    write_ply(out / 'sparse_pc.ply', xyz, rgb)
    (out / 'transforms.json').write_text(json.dumps({**camera, 'frames': frames, 'ply_file_path': 'sparse_pc.ply'}, indent=1), encoding='utf-8')
    if held:
        val = out.with_name(out.name + '-val')
        _, val_frames = write_views(val, held, poses, (scale, rotation, offset), args.dataset)
        (val / 'transforms.json').write_text(json.dumps({**camera, 'frames': val_frames}, indent=1), encoding='utf-8')

    report = {'model': str(model), 'images': len(cameras), 'points': len(xyz), **frame_report}
    if held:
        report['heldOut'] = {'every': n, 'positions': sorted({name.split('/')[1][:4] for name in held}), 'images': len(held)}
    if truth is not None:  # comparison with Matterport, for information; in the own frame it changes nothing
        score = evaluate(poses, truth)
        report['matterport'] = {'compared': score.get('registered'), 'misaligned': score.get('misaligned', []),
                                'positionErrorCm': score.get('positionErrorCm'), 'rotationErrorDeg': score.get('rotationErrorDeg')}
        if args.frame == 'own':
            mp_scale, mp_rotation, _, _ = fit_frame(poses, truth)
            up_difference = np.degrees(np.arccos(np.clip((mp_rotation.T @ [0, 0, 1]) @ (rotation.T @ [0, 0, 1]), -1, 1)))
            report['matterport'].update({'scaleRatio': round(scale / mp_scale, 4), 'upDifferenceDeg': round(float(up_difference), 3)})
    (out / 'report.json').write_text(json.dumps(report, indent=1), encoding='utf-8')
    note = ''
    if args.frame == 'own':
        note = f'; left out as weakly placed: {", ".join(sorted(report["leftOutWeak"])) or "none"}'
        if 'matterport' in report:
            note += f'; against Matterport: scale x{report["matterport"]["scaleRatio"]}, up {report["matterport"]["upDifferenceDeg"]}°'
    elif args.frame == 'matterport':
        note = f'; left out as misaligned: {", ".join(report["matterport"]["misaligned"]) or "none"}'
    if held:
        note += f'; held out: {len(held)} views of {len(report["heldOut"]["positions"])} positions -> {out.name}-val'
    print(f'{len(cameras)} images, {len(xyz)} points -> {out} ({args.frame} frame{note})')
    return 0


if __name__ == '__main__':
    sys.exit(main())
