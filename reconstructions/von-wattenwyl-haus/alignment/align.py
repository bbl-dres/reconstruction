"""Align panoramas from the images alone: COLMAP 4.2 with LoMa, each panorama's cube faces as a rig.

    python reconstructions/von-wattenwyl-haus/alignment/align.py alignment/output/images-109

The images-only counterpart of align_test.py, with the variant that worked best
there (loma-rig with retrieval matching, see README.md). It needs no poses and
no metadata: the input is a folder written by prepare_images.py (images/,
masks/, transforms.json with the intrinsics). Learned features need a GPU with
about 12 GB; see README.md for the cloud setup.

Writes <input>-loma/ (or --out): the faces in rig layout, the COLMAP databases,
sparse/<n>/ (binary and text), colmap.log and summary.json.
"""
import argparse
import json
import re
import sys
import time
from pathlib import Path

import cv2
import numpy as np

HERE = Path(__file__).resolve().parent
from align_test import LEARNED_ON_GPU, colmap, link, read_model, retrieval_pairs, rig_config  # noqa: E402


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    parser.add_argument('images', type=Path, help='Folder written by prepare_images.py')
    parser.add_argument('--out', type=Path, help='Output folder (default: <images>-loma next to it)')
    parser.add_argument('--matching', choices=['retrieval', 'exhaustive'], default='retrieval',
                        help='retrieval: panorama pairs that fast SIFT matching finds overlapping, plus neighbours in capture order')
    parser.add_argument('--overlap', type=int, default=6, help='Retrieval: neighbouring panoramas in capture order')
    parser.add_argument('--min-inliers', type=int, default=15, help='Retrieval: verified SIFT matches that make two panoramas a pair')
    args = parser.parse_args()

    source = args.images.resolve()
    out = (args.out or source.with_name(source.name + '-loma')).resolve()
    camera = json.loads((source / 'transforms.json').read_text(encoding='utf-8'))
    size = int(camera['w'])
    images, masks = out / 'images', out / 'masks'
    names = []
    for path in sorted((source / 'images').glob('s*_f*.jpg')):
        index, face = re.fullmatch(r's(\d+)_f(\d)', path.stem).groups()
        name = f'face{face}/s{index}.jpg'
        link(path, images / name)
        # COLMAP skips images without a mask once a mask folder is given: white masks where there is no tripod patch.
        mask, target = source / 'masks' / f'{path.stem}.png', masks / f'{name}.png'
        if mask.exists():
            link(mask, target)
        elif not target.exists():
            target.parent.mkdir(parents=True, exist_ok=True)
            cv2.imwrite(str(target), np.full((size, size), 255, np.uint8))
        names.append(name)
    (out / 'rig_config.json').write_text(json.dumps(rig_config(), indent=1), encoding='utf-8')
    intrinsics = f'{camera["fl_x"]},{camera["fl_y"]},{camera["cx"]},{camera["cy"]}'
    print(f'{len(names) // 6} panoramas, {len(names)} faces -> {out}', flush=True)

    start = time.time()
    (out / 'sparse').mkdir(parents=True, exist_ok=True)
    with open(out / 'colmap.log', 'a', encoding='utf-8') as log:
        database = out / 'db' / 'LOMA_B-LOMA_B-rig.db'
        if not database.exists():  # features and matches are kept, so the mapper can be rerun alone
            database.parent.mkdir(exist_ok=True)
            partial = database.with_suffix('.partial.db')
            partial.unlink(missing_ok=True)
            gpu = int(LEARNED_ON_GPU)
            colmap(log, 'feature_extractor', '--database_path', partial, '--image_path', images, '--ImageReader.mask_path', masks,
                   '--ImageReader.camera_model', 'PINHOLE', '--ImageReader.single_camera_per_folder', 1,
                   '--ImageReader.camera_params', intrinsics, '--FeatureExtraction.type', 'LOMA_B', '--FeatureExtraction.use_gpu', gpu)
            colmap(log, 'rig_configurator', '--database_path', partial, '--rig_config_path', out / 'rig_config.json')
            matching = ('--FeatureMatching.type', 'LOMA_B', '--FeatureMatching.use_gpu', gpu)
            if args.matching == 'exhaustive':
                colmap(log, 'exhaustive_matcher', '--database_path', partial, *matching)
            else:
                pair_list = retrieval_pairs(log, out, images, masks, intrinsics, sorted(names), args.overlap, args.min_inliers)
                colmap(log, 'matches_importer', '--database_path', partial, '--match_list_path', pair_list, '--match_type', 'pairs', *matching)
            partial.replace(database)
        matched = time.time() - start
        colmap(log, 'mapper', '--database_path', database, '--image_path', images, '--output_path', out / 'sparse',
               '--Mapper.ba_refine_focal_length', 0, '--Mapper.ba_refine_principal_point', 0,
               '--Mapper.ba_refine_extra_params', 0, '--Mapper.ba_refine_sensor_from_rig', 0)
        models = sorted(p for p in (out / 'sparse').iterdir() if p.is_dir())
        for model in models:
            colmap(log, 'model_converter', '--input_path', model, '--output_path', model, '--output_type', 'TXT')
    registered = {model.name: len(read_model(model)) for model in models}
    summary = {'images': len(names), 'models': registered, 'matching': args.matching,
               'seconds': round(time.time() - start), 'featureSeconds': round(matched)}
    (out / 'summary.json').write_text(json.dumps(summary, indent=1), encoding='utf-8')
    print(f'{len(models)} model(s), images registered per model: {registered}; {summary["seconds"]} s', flush=True)
    return 0 if models else 1


if __name__ == '__main__':
    sys.exit(main())
