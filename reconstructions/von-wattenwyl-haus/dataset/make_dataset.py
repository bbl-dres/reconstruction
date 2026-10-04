"""Turn downloaded Matterport cube faces into a posed Gaussian-splatting dataset.

Each skybox face is an exact 90° pinhole image, so no equirectangular
re-projection is needed. Camera poses come from Matterport's own alignment; a
sparse colored point cloud is triangulated from SIFT matches between
neighbouring sweeps with those poses held fixed. The same matches give an
independent check of the poses (epipolar error against a RANSAC estimate).

    python reconstructions/von-wattenwyl-haus/dataset/make_dataset.py

Reads matterport/output/panoramas/ and writes dataset/output/full/:
    images/                      cube faces, optionally resized
    masks/                       nadir masks for the down faces (white = keep)
    sparse/0/*.txt               COLMAP text model (PINHOLE): Inria 3DGS, gsplat, Brush, Postshot
    transforms.json              nerfstudio format (OpenGL camera axes), with ply_file_path
    sparse_pc.ply                triangulated initial point cloud
    report.json                  counts and pose-check statistics

With --holdout-every N, writes dataset/output/holdout/ for an honest novel-view
test instead: every Nth sweep is left out of training and triangulation, and
the split is given as transforms_train.json / transforms_val.json (Brush).
"""
import argparse
import json
import math
import shutil
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent

X, Y, Z = np.eye(3)
# OpenCV camera axes (columns: x right, y down, z forward) in sweep-local
# coordinates for skybox faces 0..5. Verified on r9QzqKWcYwh by cube-edge
# continuity and by epipolar error between neighbouring sweeps (README.md).
FACE_AXES = {
    0: np.stack([-Y, X, Z], 1),    # up; its bottom edge meets the front face
    1: np.stack([-Y, -Z, X], 1),   # front (+X)
    2: np.stack([-X, -Z, -Y], 1),  # right (-Y)
    3: np.stack([Y, -Z, -X], 1),   # back (-X)
    4: np.stack([X, -Z, Y], 1),    # left (+Y)
    5: np.stack([-Y, -X, -Z], 1),  # down; its top edge meets the front face
}


def quaternion_matrix(q):
    x, y, z, w = (q[k] for k in 'xyzw')
    n = math.sqrt(x * x + y * y + z * z + w * w)
    x, y, z, w = x / n, y / n, z / n, w / n
    return np.array([
        [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
        [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
        [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
    ])


def matrix_quaternion(r):
    """Rotation matrix -> (w, x, y, z), w >= 0."""
    trace = np.trace(r)
    if trace > 0:
        s = math.sqrt(trace + 1) * 2
        q = [s / 4, (r[2, 1] - r[1, 2]) / s, (r[0, 2] - r[2, 0]) / s, (r[1, 0] - r[0, 1]) / s]
    elif r[0, 0] > r[1, 1] and r[0, 0] > r[2, 2]:
        s = math.sqrt(1 + r[0, 0] - r[1, 1] - r[2, 2]) * 2
        q = [(r[2, 1] - r[1, 2]) / s, s / 4, (r[0, 1] + r[1, 0]) / s, (r[0, 2] + r[2, 0]) / s]
    elif r[1, 1] > r[2, 2]:
        s = math.sqrt(1 + r[1, 1] - r[0, 0] - r[2, 2]) * 2
        q = [(r[0, 2] - r[2, 0]) / s, (r[0, 1] + r[1, 0]) / s, s / 4, (r[1, 2] + r[2, 1]) / s]
    else:
        s = math.sqrt(1 + r[2, 2] - r[0, 0] - r[1, 1]) * 2
        q = [(r[1, 0] - r[0, 1]) / s, (r[0, 2] + r[2, 0]) / s, (r[1, 2] + r[2, 1]) / s, s / 4]
    q = np.array(q) / np.linalg.norm(q)
    return q if q[0] >= 0 else -q


def skew(t):
    return np.array([[0, -t[2], t[1]], [t[2], 0, -t[0]], [-t[1], t[0], 0]])


def sampson(f, pa, pb):
    xa = np.c_[pa, np.ones(len(pa))]
    xb = np.c_[pb, np.ones(len(pb))]
    fxa, ftxb = xa @ f.T, xb @ f
    return np.abs(np.sum(xb * fxa, 1)) / np.sqrt(fxa[:, 0] ** 2 + fxa[:, 1] ** 2 + ftxb[:, 0] ** 2 + ftxb[:, 1] ** 2)


def nadir_mask(size, nadir):
    """Mask of a down face: white = keep, black = the blurred tripod patch (diameter = nadir x face width)."""
    mask = np.full((size, size), 255, np.uint8)
    cv2.circle(mask, (size // 2, size // 2), round(nadir * size / 2), 0, -1)
    return mask


def load_views(root, faces):
    metadata = json.loads((root / 'metadata.json').read_text(encoding='utf-8'))
    resolution = metadata['resolution']
    sweeps, views = {}, []
    for sweep in sorted(metadata['sweeps'], key=lambda s: s['index']):
        folder = root / 'sweeps' / sweep['sweepUuid']
        sources = [folder / f'{resolution}_face{k}.jpg' for k in range(6)]
        if sweep['placement'] == 'unplaced' or not all(path.exists() for path in sources):
            continue
        rotation = quaternion_matrix(sweep['rotation'])
        centre = np.array([sweep['position'][k] for k in 'xyz'])
        sweeps[sweep['id']] = {**sweep, 'centre': centre, 'views': {}}
        for face in faces:
            view = {'name': f's{sweep["index"]:03d}_f{face}.jpg', 'sweep': sweep['id'], 'face': face,
                    'source': sources[face], 'R_wc': rotation @ FACE_AXES[face], 'C': centre}
            sweeps[sweep['id']]['views'][face] = len(views)
            views.append(view)
    return metadata, sweeps, views


def image_size(path):
    with Image.open(path) as image:
        return image.size


def write_image(view, out, size, nadir):
    target = out / 'images' / view['name']
    if not (target.exists() and image_size(target) == (size, size)):
        with Image.open(view['source']) as image:
            if image.size == (size, size):
                shutil.copyfile(view['source'], target)  # native size: keep the original JPEG instead of re-encoding it
            else:
                image.convert('RGB').resize((size, size), Image.Resampling.LANCZOS).save(target, quality=95)
    if view['face'] == 5 and nadir > 0:
        cv2.imwrite(str(out / 'masks' / view['name'].replace('.jpg', '.png')), nadir_mask(size, nadir))


def detect(view, out, features, nadir):
    color = cv2.imread(str(out / 'images' / view['name']), cv2.IMREAD_COLOR)
    gray = cv2.cvtColor(color, cv2.COLOR_BGR2GRAY)
    mask = nadir_mask(gray.shape[0], nadir) if view['face'] == 5 and nadir > 0 else None  # no features on the tripod patch
    keypoints, descriptors = cv2.SIFT_create(features).detectAndCompute(gray, mask)
    points = np.float32([k.pt for k in keypoints]).reshape(-1, 2)
    xy = np.round(points).astype(int).clip(0, gray.shape[0] - 1)
    rgb = color[xy[:, 1], xy[:, 0], ::-1] if len(points) else np.zeros((0, 3), np.uint8)
    # OpenCV SIFT descriptors are integer-valued 0..255; uint8 keeps memory small.
    return points, (descriptors if descriptors is not None else np.zeros((0, 128))).astype(np.uint8), rgb


def face_pairs(sweeps, views, max_distance, max_angle):
    """Training faces of linked sweeps closer than max_distance that look within max_angle of each other."""
    pairs = []
    cos_limit = math.cos(math.radians(max_angle))
    for a in sweeps.values():
        for neighbour in a['neighbors']:
            b = sweeps.get(neighbour)
            # Each link once, from its lower-index end; a link listed by one sweep only is taken from that sweep.
            if not b or b is a or (b['index'] < a['index'] and a['id'] in b['neighbors']):
                continue
            if np.linalg.norm(a['centre'] - b['centre']) > max_distance:
                continue
            for i in a['views'].values():
                for j in b['views'].values():
                    if not views[i]['holdout'] and not views[j]['holdout'] \
                            and np.dot(views[i]['R_wc'][:, 2], views[j]['R_wc'][:, 2]) > cos_limit:
                        pairs.append((i, j))
    return pairs


def analyse_pair(i, j, views, features, k, threshold):
    va, vb = views[i], views[j]
    (pa_all, da, ca), (pb_all, db, _) = features[i], features[j]
    if len(da) < 30 or len(db) < 30:
        return None
    matcher = cv2.FlannBasedMatcher({'algorithm': 1, 'trees': 4}, {'checks': 64})
    knn = matcher.knnMatch(da.astype(np.float32), db.astype(np.float32), k=2)
    good = [(m.queryIdx, m.trainIdx) for pair in knn if len(pair) == 2 for m, n in [pair] if m.distance < 0.75 * n.distance]
    if len(good) < 30:
        return None
    ia, ib = np.array(good).T
    pa, pb = pa_all[ia], pb_all[ib]
    r_cw_a, r_cw_b = va['R_wc'].T, vb['R_wc'].T
    t_a, t_b = -r_cw_a @ va['C'], -r_cw_b @ vb['C']
    k_inv = np.linalg.inv(k)
    f_pose = k_inv.T @ skew(r_cw_b @ (va['C'] - vb['C'])) @ (r_cw_b @ va['R_wc']) @ k_inv
    # Pose check: matches accepted by a pose-free RANSAC model, measured against Matterport's poses.
    check = np.zeros(0)
    _, inliers = cv2.findFundamentalMat(pa, pb, cv2.FM_RANSAC, threshold / 2, 0.999)
    if inliers is not None and inliers.sum() >= 30:
        check = sampson(f_pose, pa[inliers.ravel() == 1], pb[inliers.ravel() == 1])
    keep = sampson(f_pose, pa, pb) < threshold
    if keep.sum() < 8:
        return check, None
    pa, pb, colors = pa[keep], pb[keep], ca[ia[keep]]
    proj_a, proj_b = k @ np.c_[r_cw_a, t_a], k @ np.c_[r_cw_b, t_b]
    homogeneous = cv2.triangulatePoints(proj_a, proj_b, pa.T.astype(np.float64), pb.T.astype(np.float64))
    xyz = (homogeneous[:3] / homogeneous[3]).T
    ok = np.isfinite(xyz).all(1)
    for r_cw, t, p in ((r_cw_a, t_a, pa), (r_cw_b, t_b, pb)):
        cam = xyz @ r_cw.T + t
        with np.errstate(divide='ignore', invalid='ignore'):
            pix = (cam @ k.T)[:, :2] / cam[:, 2:3]
            ok &= (cam[:, 2] > 0.2) & (np.linalg.norm(pix - p, axis=1) < threshold)
    rays_a = xyz - va['C']
    rays_b = xyz - vb['C']
    with np.errstate(invalid='ignore'):
        cos = np.sum(rays_a * rays_b, 1) / (np.linalg.norm(rays_a, axis=1) * np.linalg.norm(rays_b, axis=1))
    ok &= (cos < math.cos(math.radians(1.5))) & (np.linalg.norm(rays_a, axis=1) < 40)
    return check, (xyz[ok], colors[ok])


def write_ply(path, xyz, rgb):
    vertex = np.empty(len(xyz), dtype=[('x', '<f4'), ('y', '<f4'), ('z', '<f4'), ('red', 'u1'), ('green', 'u1'), ('blue', 'u1')])
    vertex['x'], vertex['y'], vertex['z'] = xyz.T
    vertex['red'], vertex['green'], vertex['blue'] = rgb.T
    header = ('ply\nformat binary_little_endian 1.0\n'
              f'element vertex {len(xyz)}\n'
              'property float x\nproperty float y\nproperty float z\n'
              'property uchar red\nproperty uchar green\nproperty uchar blue\nend_header\n')
    with open(path, 'wb') as handle:
        handle.write(header.encode('ascii'))
        handle.write(vertex.tobytes())


def read_ply(path):
    """Read a point cloud written by write_ply."""
    raw = path.read_bytes()
    end = raw.index(b'end_header\n') + len(b'end_header\n')
    vertex = np.frombuffer(raw[end:], dtype=[('x', '<f4'), ('y', '<f4'), ('z', '<f4'), ('red', 'u1'), ('green', 'u1'), ('blue', 'u1')])
    return np.stack([vertex['x'], vertex['y'], vertex['z']], 1), np.stack([vertex['red'], vertex['green'], vertex['blue']], 1)


def write_colmap(folder, size, focal, cameras, xyz, rgb):
    """COLMAP text model: one PINHOLE camera, fixed poses (cameras: name, R_wc, centre, in order) and initial points."""
    folder.mkdir(parents=True, exist_ok=True)
    (folder / 'cameras.txt').write_text(
        f'# Camera list with one line of data per camera:\n#   CAMERA_ID, MODEL, WIDTH, HEIGHT, PARAMS[]\n'
        f'1 PINHOLE {size} {size} {focal} {focal} {size / 2} {size / 2}\n', encoding='ascii')
    lines = ['# Image list with two lines of data per image:', '#   IMAGE_ID, QW, QX, QY, QZ, TX, TY, TZ, CAMERA_ID, NAME',
             '#   POINTS2D[] as (X, Y, POINT3D_ID); empty: poses are fixed, points are for initialization only']
    for index, (name, r_wc, centre) in enumerate(cameras, 1):
        r_cw = r_wc.T
        q, t = matrix_quaternion(r_cw), -r_cw @ centre
        lines += [f'{index} {" ".join(f"{v:.10f}" for v in q)} {" ".join(f"{v:.10f}" for v in t)} 1 {name}', '']
    (folder / 'images.txt').write_text('\n'.join(lines) + '\n', encoding='ascii')
    (folder / 'points3D.txt').write_text(
        '# 3D point list with one line of data per point:\n#   POINT3D_ID, X, Y, Z, R, G, B, ERROR, TRACK[]\n'
        + ''.join(f'{i} {p[0]:.5f} {p[1]:.5f} {p[2]:.5f} {c[0]} {c[1]} {c[2]} 0\n' for i, (p, c) in enumerate(zip(xyz, rgb), 1)),
        encoding='ascii')


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    parser.add_argument('panoramas', type=Path, nargs='?', default=HERE.parent / 'matterport' / 'output' / 'panoramas',
                        help='Folder written by matterport/download.py (default: matterport/output/panoramas)')
    parser.add_argument('--out', type=Path, help='Dataset folder (default: dataset/output/full, or dataset/output/holdout)')
    parser.add_argument('--image-size', type=int, default=1024, help='Face size in pixels (default 1024; native 2k = 2048)')
    parser.add_argument('--faces', default='0,1,2,3,4,5', help='Skybox faces to include (0 up ... 5 down)')
    parser.add_argument('--nadir-mask', type=float, default=0.5,
                        help='Diameter of the masked tripod patch on down faces, as a fraction of the face (0 disables)')
    parser.add_argument('--features', type=int, default=8000, help='SIFT features per face')
    parser.add_argument('--max-distance', type=float, default=4.0, help='Only match neighbouring sweeps closer than this (m)')
    parser.add_argument('--voxel', type=float, default=0.02, help='Point-cloud deduplication grid (m)')
    parser.add_argument('--max-points', type=int, default=400_000)
    parser.add_argument('--no-points', action='store_true', help='Skip matching and triangulation')
    parser.add_argument('--holdout-every', type=int, default=0,
                        help='Hold out every Nth sweep (all six faces) for evaluation: writes transforms_train.json and '
                             'transforms_val.json instead of COLMAP, and triangulates from training sweeps only')
    parser.add_argument('--workers', type=int, default=8)
    args = parser.parse_args()

    root = args.panoramas.resolve()
    holdout = args.holdout_every > 0
    out = (args.out or HERE / 'output' / ('holdout' if holdout else 'full')).resolve()
    faces = [int(face) for face in args.faces.split(',')]
    size = args.image_size
    metadata, sweeps, views = load_views(root, faces)
    if not views:
        raise SystemExit(f'No downloaded sweeps found in {root}')
    # Whole sweeps, not single faces: a held-out face would otherwise share its
    # optical centre with five training images and overstate novel-view quality.
    held = {s['id'] for n, s in enumerate(sweeps.values()) if holdout and n % args.holdout_every == args.holdout_every // 2}
    for view in views:
        view['holdout'] = view['sweep'] in held
    for folder in ('images', 'masks'):
        (out / folder).mkdir(parents=True, exist_ok=True)
    start = time.time()
    print(f'{len(sweeps)} sweeps, {len(views)} images at {size} px -> {out}', flush=True)
    with ThreadPoolExecutor(args.workers) as pool:
        list(pool.map(lambda view: write_image(view, out, size, args.nadir_mask), views))
    print(f'Images written ({time.time() - start:.0f} s).', flush=True)

    # OpenCV pixel centres are integers; COLMAP and nerfstudio put them at +0.5.
    focal = size / 2
    k = np.array([[focal, 0, (size - 1) / 2], [0, focal, (size - 1) / 2], [0, 0, 1]])
    threshold = 2.0 * size / 1024
    xyz, rgb, check, pairs_used = np.zeros((0, 3)), np.zeros((0, 3), np.uint8), np.zeros(0), 0
    if not args.no_points:
        with ThreadPoolExecutor(args.workers) as pool:
            features = list(pool.map(lambda view: detect(view, out, args.features, args.nadir_mask), views))
        print(f'Features detected ({time.time() - start:.0f} s).', flush=True)
        # Only faces looking in similar directions overlap usefully; held-out sweeps never contribute.
        pairs = face_pairs(sweeps, views, args.max_distance, 65)
        with ThreadPoolExecutor(args.workers) as pool:
            results = list(pool.map(lambda pair: analyse_pair(*pair, views, features, k, threshold), pairs))
        checks, clouds = [], []
        for result in results:
            if result is None:
                continue
            checks.append(result[0])
            if result[1] is not None and len(result[1][0]):
                clouds.append(result[1])
                pairs_used += 1
        check = np.concatenate(checks) if checks else np.zeros(0)
        if clouds:
            xyz = np.concatenate([c[0] for c in clouds])
            rgb = np.concatenate([c[1] for c in clouds])
            _, first = np.unique(np.floor(xyz / args.voxel).astype(np.int64), axis=0, return_index=True)
            xyz, rgb = xyz[first], rgb[first]
            if len(xyz) > args.max_points:
                keep = np.random.default_rng(0).choice(len(xyz), args.max_points, replace=False)
                xyz, rgb = xyz[keep], rgb[keep]
        print(f'{len(pairs)} face pairs matched, {pairs_used} triangulated, {len(xyz)} points ({time.time() - start:.0f} s).', flush=True)

    frames = []
    for view in views:
        c2w = np.eye(4)
        c2w[:3, :3] = view['R_wc'] @ np.diag([1, -1, -1])  # OpenCV -> OpenGL camera axes
        c2w[:3, 3] = view['C']
        frame = {'file_path': f'images/{view["name"]}', 'transform_matrix': np.round(c2w, 10).tolist()}
        if view['face'] == 5 and args.nadir_mask > 0:
            frame['mask_path'] = f'masks/{view["name"].replace(".jpg", ".png")}'
        frames.append(frame)
    write_ply(out / 'sparse_pc.ply', xyz, rgb)
    camera = {'camera_model': 'OPENCV', 'fl_x': focal, 'fl_y': focal, 'cx': size / 2, 'cy': size / 2,
              'w': size, 'h': size, 'k1': 0, 'k2': 0, 'p1': 0, 'p2': 0}
    if holdout:
        # Brush reads transforms_train.json for training and transforms_val.json for evaluation.
        # No COLMAP model here: loaders that prefer COLMAP would ignore the split.
        train = [f for f, v in zip(frames, views) if not v['holdout']]
        val = [f for f, v in zip(frames, views) if v['holdout']]
        (out / 'transforms_train.json').write_text(json.dumps({**camera, 'frames': train, 'ply_file_path': 'sparse_pc.ply'}, indent=1), encoding='utf-8')
        (out / 'transforms_val.json').write_text(json.dumps({**camera, 'frames': val}, indent=1), encoding='utf-8')
    else:
        write_colmap(out / 'sparse' / '0', size, focal, [(v['name'], v['R_wc'], v['C']) for v in views], xyz, rgb)
        (out / 'transforms.json').write_text(json.dumps({**camera, 'frames': frames, 'ply_file_path': 'sparse_pc.ply'}, indent=1), encoding='utf-8')

    report = {
        'modelId': metadata['modelId'], 'sourceResolution': metadata['resolution'], 'imageSize': size,
        'sweeps': len(sweeps), 'images': len(views), 'faces': faces, 'nadirMask': args.nadir_mask,
        'heldOutSweeps': sorted(s['index'] for s in sweeps.values() if s['id'] in held),
        'points': len(xyz), 'pairsTriangulated': pairs_used,
        'poseCheck': {
            'description': 'Sampson distance (px at imageSize) of pose-free RANSAC inlier matches under the Matterport poses',
            'matches': int(len(check)),
            'median': round(float(np.median(check)), 3) if len(check) else None,
            'p90': round(float(np.percentile(check, 90)), 3) if len(check) else None,
            'within1px': round(float(np.mean(check < 1)), 3) if len(check) else None,
        },
        'seconds': round(time.time() - start),
    }
    (out / 'report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps(report['poseCheck'], indent=2))
    return 0


if __name__ == '__main__':
    sys.exit(main())
