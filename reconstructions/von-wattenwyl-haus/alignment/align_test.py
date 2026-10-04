"""Test open-source camera alignment (COLMAP) against Matterport's poses on part of the tour.

    python reconstructions/von-wattenwyl-haus/alignment/align_test.py --positions 12 --floor 0
    python reconstructions/von-wattenwyl-haus/alignment/align_test.py --floor all --matching retrieval --variants loma-rig

Takes N linked capture positions on one floor, lays out their cube faces as a
six-camera rig (all faces share one optical centre, at known rotations), aligns
them from the images alone with several COLMAP variants, and compares every
result with Matterport's poses (median epipolar error 0.48 px, see
dataset/README.md) after a similarity transform. Matterport's poses only serve
as the reference: COLMAP never sees them, only the fixed rig layout and the
90° pinhole intrinsics of the cube faces.

Writes alignment/output/<floor>-<positions>/: images/ and masks/ in rig layout,
one COLMAP database per feature type, a sparse model per variant and
results.json.
"""
import argparse
import json
import math
import re
import sqlite3
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

import cv2
import numpy as np
import psutil

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT / 'dataset'))
from make_dataset import FACE_AXES, matrix_quaternion, quaternion_matrix  # noqa: E402

WINDOWS = sys.platform == 'win32'
COLMAP = Path(os.environ.get('COLMAP') or (HERE / 'tools' / 'colmap' / 'bin' / 'colmap.exe' if WINDOWS else shutil.which('colmap') or 'colmap'))
# Learned features (ALIKED, LightGlue, LoMa) run through ONNX Runtime, whose GPU path needs NVIDIA's CUDA 12 and
# cuDNN 9 libraries; COLMAP does not ship them. With them in tools/cuda12 (see README.md), or installed system-wide
# and ALIGN_LEARNED_ON_GPU=1 set (as on a cloud machine), they run on the GPU; otherwise on the CPU, which takes
# about 25 minutes instead of seconds for 72 images.
CUDA_LIBRARIES = HERE / 'tools' / 'cuda12' / 'nvidia'
LEARNED_ON_GPU = CUDA_LIBRARIES.is_dir() or os.environ.get('ALIGN_LEARNED_ON_GPU') == '1'
# COLMAP is stopped before the machine runs out of memory (a whole-house run once hung the laptop).
MIN_FREE_GB = float(os.environ.get('ALIGN_MIN_FREE_GB', 3))
REFERENCE_FACE = 1  # the rig frame is the front face's camera frame
# name: (feature extractor, matcher, cube faces as a rig, mapper)
VARIANTS = {
    'sift-rig': ('SIFT', 'SIFT_BRUTEFORCE', True, 'mapper'),
    'sift-rig-global': ('SIFT', 'SIFT_BRUTEFORCE', True, 'global_mapper'),
    'sift-norig': ('SIFT', 'SIFT_BRUTEFORCE', False, 'mapper'),
    'aliked-lightglue-rig': ('ALIKED_N16ROT', 'ALIKED_LIGHTGLUE', True, 'mapper'),
    'loma-rig': ('LOMA_B', 'LOMA_B', True, 'mapper'),
}


def link(source, target):
    target.parent.mkdir(parents=True, exist_ok=True)
    if not target.exists():
        try:
            os.link(source, target)
        except OSError:
            shutil.copy2(source, target)


def select(metadata, floor, count):
    """All positions in capture order for floor 'all'; otherwise linked positions, nearest first from the best-connected one: a compact cluster of rooms, not a corridor.

    Positions along one line would leave the rotation about that line undetermined (and defeat global SfM).
    """
    if floor == 'all':
        return sorted((s for s in metadata['sweeps'] if s['placement'] != 'unplaced'), key=lambda s: s['index'])[:count]
    sweeps = {s['id']: s for s in metadata['sweeps'] if s['placement'] != 'unplaced' and s['floor'] == int(floor)}
    start = max(sweeps.values(), key=lambda s: sum(n in sweeps for n in s['neighbors']))
    centre = lambda sweep: np.array([sweep['position'][k] for k in 'xyz'])
    chosen, frontier = [], {start['id']}
    while frontier and len(chosen) < count:
        sweep = sweeps[min(frontier, key=lambda i: np.linalg.norm(centre(sweeps[i]) - centre(start)))]
        frontier.discard(sweep['id'])
        chosen.append(sweep)
        frontier |= {n for n in sweep['neighbors'] if n in sweeps and all(n != c['id'] for c in chosen)}
    return chosen


def rig_config():
    """Cube faces as one rig: shared optical centre, rotations relative to the reference face.

    COLMAP 4.2 needs the reference sensor first; otherwise rig_configurator aborts without a message.
    """
    cameras = []
    for face in [REFERENCE_FACE] + [f for f in range(6) if f != REFERENCE_FACE]:
        camera = {'image_prefix': f'face{face}/'}
        if face == REFERENCE_FACE:
            camera['ref_sensor'] = True
        else:
            # cam_k <- local <- reference camera; FACE_AXES maps camera axes to sweep-local axes.
            q = matrix_quaternion(FACE_AXES[face].T @ FACE_AXES[REFERENCE_FACE])
            camera['cam_from_rig_rotation'] = [float(v) for v in q]  # w, x, y, z
            camera['cam_from_rig_translation'] = [0.0, 0.0, 0.0]
        cameras.append(camera)
    return [{'cameras': cameras}]


def colmap(log, *args):
    log.write(f'\n$ colmap {" ".join(map(str, args))}\n')
    log.flush()
    env = dict(os.environ)
    if CUDA_LIBRARIES.is_dir():  # pip's NVIDIA packages: DLLs in */bin on Windows, shared libraries in */lib on Linux
        variable = 'PATH' if WINDOWS else 'LD_LIBRARY_PATH'
        folders = sorted(CUDA_LIBRARIES.glob('*/bin' if WINDOWS else '*/lib'))
        env[variable] = os.pathsep.join([str(p) for p in folders] + [env.get(variable, '')])
    process = subprocess.Popen([str(COLMAP), *map(str, args)], stdout=log, stderr=subprocess.STDOUT, env=env)
    peak, lowest = 0.0, float('inf')
    while process.poll() is None:
        time.sleep(2)
        try:
            peak = max(peak, psutil.Process(process.pid).memory_info().rss / 1e9)
        except psutil.Error:
            pass
        lowest = min(lowest, psutil.virtual_memory().available / 1e9)
        if lowest < MIN_FREE_GB:
            process.kill()
            process.wait()
            log.write(f'\n[memory] stopped: {lowest:.1f} GB free (COLMAP {peak:.1f} GB)\n')
            raise RuntimeError(f'{args[0]} stopped with {lowest:.1f} GB of memory free (COLMAP used {peak:.1f} GB)')
    log.write(f'\n[memory] COLMAP peak {peak:.1f} GB, lowest free {lowest:.1f} GB\n')
    log.flush()
    if process.returncode:
        raise subprocess.CalledProcessError(process.returncode, [str(COLMAP), *map(str, args)])


def retrieval_pairs(log, test, images, masks, intrinsics, names, overlap, min_inliers):
    """Image pairs for expensive matching: every face pair of panoramas that exhaustive SIFT matching (fast on the GPU)
    finds overlapping, or that are within `overlap` of each other in capture order. Writes and returns the pair list."""
    sift = test / 'db' / 'retrieval-SIFT.db'
    if not sift.exists():
        partial = sift.with_suffix('.partial.db')
        partial.unlink(missing_ok=True)
        colmap(log, 'feature_extractor', '--database_path', partial, '--image_path', images, '--ImageReader.mask_path', masks,
               '--ImageReader.camera_model', 'PINHOLE', '--ImageReader.single_camera_per_folder', 1, '--ImageReader.camera_params', intrinsics)
        colmap(log, 'rig_configurator', '--database_path', partial, '--rig_config_path', test / 'rig_config.json')
        colmap(log, 'exhaustive_matcher', '--database_path', partial)
        partial.replace(sift)
    position = lambda name: int(re.search(r's(\d+)\.jpg$', name).group(1))
    with sqlite3.connect(sift) as db:
        image_names = dict(db.execute('SELECT image_id, name FROM images'))
        found = {tuple(sorted((position(image_names[pair // 2147483647]), position(image_names[pair % 2147483647]))))
                 for pair, rows in db.execute('SELECT pair_id, rows FROM two_view_geometries') if rows >= min_inliers}
    positions = sorted({position(name) for name in names})
    near = {(a, b) for i, a in enumerate(positions) for b in positions[i + 1:i + 1 + overlap]}
    panorama_pairs = sorted({pair for pair in found | near if pair[0] != pair[1]})
    faces = {}
    for name in names:
        faces.setdefault(position(name), []).append(name)
    lines = [f'{x} {y}' for a, b in panorama_pairs for x in faces[a] for y in faces[b]]
    lines += [f'{x} {y}' for group in faces.values() for i, x in enumerate(group) for y in group[i + 1:]]  # faces of one panorama
    pair_list = test / 'retrieval-pairs.txt'
    pair_list.write_text('\n'.join(lines) + '\n', encoding='utf-8')
    log.write(f'\n[retrieval] {len(found)} panorama pairs from SIFT, {len(near)} in capture order, '
              f'{len(panorama_pairs)} in total -> {len(lines)} image pairs\n')
    return pair_list


def read_model(folder):
    """images.txt -> {name: (R_wc, centre)}."""
    lines = [line for line in (folder / 'images.txt').read_text(encoding='utf-8').splitlines() if not line.startswith('#')]
    poses = {}
    for i in range(0, len(lines), 2):
        parts = lines[i].split()
        if len(parts) < 10:
            continue
        qw, qx, qy, qz, tx, ty, tz = map(float, parts[1:8])
        r_cw = quaternion_matrix({'w': qw, 'x': qx, 'y': qy, 'z': qz})
        poses[parts[9]] = (r_cw.T, -r_cw.T @ np.array([tx, ty, tz]))
    return poses


def evaluate(poses, truth, outlier=0.5):
    """Errors after aligning to the reference: rotation from the camera orientations, then scale and offset
    from the centres. Images more than `outlier` metres off after a first fit count as misaligned and are left
    out of the second fit and of the error statistics, so one misplaced position does not mask the rest."""
    names = sorted(set(poses) & set(truth))
    if len(names) < 3:
        return {'registered': len(names)}
    u, _, vt = np.linalg.svd(sum(truth[n][0] @ poses[n][0].T for n in names))  # chordal mean rotation
    rotation = u @ np.diag([1, 1, np.linalg.det(u @ vt)]) @ vt
    estimated = np.array([poses[n][1] for n in names]) @ rotation.T
    reference = np.array([truth[n][1] for n in names])
    keep = np.ones(len(names), bool)
    for _ in range(2):
        mu_e, mu_r = estimated[keep].mean(0), reference[keep].mean(0)
        scale = float(((estimated[keep] - mu_e) * (reference[keep] - mu_r)).sum() / ((estimated[keep] - mu_e) ** 2).sum())
        position = np.linalg.norm(scale * (estimated - mu_e) - (reference - mu_r), axis=1)
        keep = position < outlier
        if keep.sum() < max(3, len(names) / 2):  # most of the model is off: it failed as a whole
            keep = np.ones(len(names), bool)
            break
    angle = np.array([math.degrees(math.acos(np.clip((np.trace(truth[n][0].T @ rotation @ poses[n][0]) - 1) / 2, -1, 1))) for n in names])
    stats = lambda values, factor, digits: {'median': round(float(np.median(values)) * factor, digits),
                                            'p90': round(float(np.percentile(values, 90)) * factor, digits),
                                            'max': round(float(values.max()) * factor, digits)}
    return {'registered': len(names), 'misaligned': sorted({n.split('/')[-1].split('.')[0] for n, k in zip(names, keep) if not k}),
            'positionErrorCm': stats(position[keep], 100, 1), 'rotationErrorDeg': stats(angle[keep], 1, 3)}


def describe(r):
    if 'positionErrorCm' not in r:
        return r.get('error', f'{r.get("registered", 0)} images registered')
    misaligned = f', {len(r["misaligned"])} position(s) misaligned ({", ".join(r["misaligned"])})' if r.get('misaligned') else ''
    return (f'{r["registered"]}/{r["images"]} images in {r["models"]} model(s){misaligned}; position error median '
            f'{r["positionErrorCm"]["median"]} cm (90 % {r["positionErrorCm"]["p90"]} cm); rotation error median {r["rotationErrorDeg"]["median"]}°')


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    parser.add_argument('--floor', default='0', help="Matterport floor index (0 = ground floor), or 'all'")
    parser.add_argument('--positions', type=int, default=12, help='Number of linked capture positions (default 12; all floors: every position)')
    parser.add_argument('--matching', choices=['exhaustive', 'sequential', 'retrieval'], default='exhaustive',
                        help='exhaustive: every pair of images. sequential: panoramas close in capture order (Matterport sweep '
                             'index) plus a few at doubling distances. retrieval: panorama pairs that fast SIFT matching finds '
                             'overlapping, plus neighbours in capture order; all 36 face pairs of each')
    parser.add_argument('--overlap', type=int, default=6, help='Sequential and retrieval matching: neighbouring panoramas in capture order')
    parser.add_argument('--min-inliers', type=int, default=15, help='Retrieval: verified SIFT matches that make two panoramas a pair')
    parser.add_argument('--variants', default=','.join(VARIANTS), help=f'Comma-separated, from: {", ".join(VARIANTS)}')
    parser.add_argument('--dataset', type=Path, default=ROOT / 'dataset' / 'output' / 'full', help='Dataset with images/ and masks/ (make_dataset.py)')
    parser.add_argument('--metadata', type=Path, default=ROOT / 'matterport' / 'output' / 'panoramas' / 'metadata.json')
    parser.add_argument('--evaluate-only', action='store_true', help='Score the existing models again without running COLMAP')
    args = parser.parse_args()
    if not COLMAP.is_file():
        raise SystemExit(f'COLMAP not found at {COLMAP}; see alignment/README.md or set COLMAP.')

    metadata = json.loads(args.metadata.read_text(encoding='utf-8'))
    chosen = select(metadata, args.floor, 10 ** 6 if args.floor == 'all' and args.positions == 12 else args.positions)
    test = HERE / 'output' / (f'{"all" if args.floor == "all" else f"floor{args.floor}"}-{len(chosen)}'
                              + {'exhaustive': '', 'sequential': f'-seq{args.overlap}', 'retrieval': f'-retr{args.overlap}'}[args.matching])
    images, masks = test / 'images', test / 'masks'
    size = 2 * float(json.loads((args.dataset / 'transforms.json').read_text(encoding='utf-8'))['fl_x'])
    truth = {}
    for sweep in chosen:
        stem = f's{sweep["index"]:03d}'
        rotation = quaternion_matrix(sweep['rotation'])
        centre = np.array([sweep['position'][k] for k in 'xyz'])
        for face in range(6):
            link(args.dataset / 'images' / f'{stem}_f{face}.jpg', images / f'face{face}' / f'{stem}.jpg')
            # COLMAP skips images without a mask once a mask folder is given: white masks for the faces without a
            # tripod patch. Masks share the image's sub-path plus .png; black = no features.
            mask, target = args.dataset / 'masks' / f'{stem}_f{face}.png', masks / f'face{face}' / f'{stem}.jpg.png'
            if mask.exists():
                link(mask, target)
            elif not target.exists():
                target.parent.mkdir(parents=True, exist_ok=True)
                cv2.imwrite(str(target), np.full((int(size), int(size)), 255, np.uint8))
            truth[f'face{face}/{stem}.jpg'] = (rotation @ FACE_AXES[face], centre)
    (test / 'rig_config.json').write_text(json.dumps(rig_config(), indent=1), encoding='utf-8')
    intrinsics = f'{size / 2},{size / 2},{size / 2},{size / 2}'  # PINHOLE fx, fy, cx, cy: exact 90° faces
    print(f'{len(chosen)} positions on floor(s) {args.floor} ({", ".join(str(s["index"]) for s in chosen)}): {len(truth)} images -> {test}', flush=True)

    results_path = test / 'results.json'
    results = json.loads(results_path.read_text(encoding='utf-8')) if results_path.exists() else {}
    for name in args.variants.split(','):
        features, matcher, rig, mapper = VARIANTS[name]
        out = test / name
        if args.evaluate_only:
            models = sorted(p for p in (out / 'sparse').iterdir() if p.is_dir()) if (out / 'sparse').is_dir() else []
            if models and name in results:
                best = max((evaluate(read_model(m), truth) for m in models), key=lambda e: e['registered'])
                results[name] = {**results[name], **{k: v for k, v in best.items()}}
                results[name].pop('error', None)
                print(f'{name:>22}: {describe(results[name])} (rescored)', flush=True)
                results_path.write_text(json.dumps(results, indent=1), encoding='utf-8')
            continue
        shutil.rmtree(out, ignore_errors=True)
        (out / 'sparse').mkdir(parents=True)
        start = time.time()
        try:
            with open(out / 'colmap.log', 'w', encoding='utf-8') as log:
                database = test / 'db' / f'{features}-{matcher}-{"rig" if rig else "norig"}.db'
                if not database.exists():  # features and matches are shared by variants that differ only in the mapper
                    database.parent.mkdir(exist_ok=True)
                    partial = database.with_suffix('.partial.db')
                    partial.unlink(missing_ok=True)
                    colmap(log, 'feature_extractor', '--database_path', partial, '--image_path', images, '--ImageReader.mask_path', masks,
                           '--ImageReader.camera_model', 'PINHOLE', '--ImageReader.single_camera_per_folder', 1,
                           '--ImageReader.camera_params', intrinsics, '--FeatureExtraction.type', features,
                           '--FeatureExtraction.use_gpu', int(features == 'SIFT' or LEARNED_ON_GPU))
                    if rig:
                        colmap(log, 'rig_configurator', '--database_path', partial, '--rig_config_path', test / 'rig_config.json')
                    gpu = ('--FeatureMatching.type', matcher, '--FeatureMatching.use_gpu', int(features == 'SIFT' or LEARNED_ON_GPU))
                    if args.matching == 'exhaustive':
                        colmap(log, 'exhaustive_matcher', '--database_path', partial, *gpu)
                    elif args.matching == 'sequential':  # names sort by capture order per face folder; rig frames expand to six faces
                        colmap(log, 'sequential_matcher', '--database_path', partial, *gpu, '--SequentialMatching.overlap', args.overlap,
                               '--SequentialMatching.quadratic_overlap', 1, '--SequentialMatching.expand_rig_images', 1)
                    else:
                        pair_list = retrieval_pairs(log, test, images, masks, intrinsics, sorted(truth), args.overlap, args.min_inliers)
                        colmap(log, 'matches_importer', '--database_path', partial, '--match_list_path', pair_list,
                               '--match_type', 'pairs', *gpu)
                    partial.replace(database)
                matched = time.time() - start
                prefix = 'Mapper' if mapper == 'mapper' else 'GlobalMapper'
                rig_option = '--Mapper.ba_refine_sensor_from_rig' if mapper == 'mapper' else '--GlobalMapper.refine_sensor_from_rig'
                colmap(log, mapper, '--database_path', database, '--image_path', images, '--output_path', out / 'sparse',
                       f'--{prefix}.ba_refine_focal_length', 0, f'--{prefix}.ba_refine_principal_point', 0,
                       f'--{prefix}.ba_refine_extra_params', 0, rig_option, 0)
                models = sorted(p for p in (out / 'sparse').iterdir() if p.is_dir())
                if not models:
                    raise RuntimeError('no model')
                evaluations = []
                for model in models:
                    colmap(log, 'model_converter', '--input_path', model, '--output_path', model, '--output_type', 'TXT')
                    evaluations.append(evaluate(read_model(model), truth))
            best = max(evaluations, key=lambda e: e['registered'])
            results[name] = {**best, 'images': len(truth), 'models': len(models), 'seconds': round(time.time() - start),
                             'featureSeconds': round(matched)}
        except (subprocess.CalledProcessError, RuntimeError) as error:
            results[name] = {'error': str(error)[:300], 'images': len(truth), 'seconds': round(time.time() - start)}
        print(f'{name:>22}: {describe(results[name])}; {results[name]["seconds"]} s', flush=True)
        results_path.write_text(json.dumps(results, indent=1), encoding='utf-8')
    return 0


if __name__ == '__main__':
    sys.exit(main())
