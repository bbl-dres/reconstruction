"""Score a trained splat (.ply) from any trainer at fixed dataset views, rendered with Brush.

    python reconstructions/von-wattenwyl-haus/dataset/score_splat.py lichtfeld/output/holdout-mrnf-x2/splat_60000.ply

View sets, the first two used in docs/ and the step READMEs:
    heldOut   the 66 faces of the 11 held-out positions (dataset/output/holdout/transforms_val.json);
              meaningful only for splats trained on the holdout split
    capture   the 36 faces of six capture positions (sweeps 0, 20, 40, 60, 80 and 100), which
              every split trains on
    all       every face of the dataset (636 for the full split): how well a splat fits all of its
              training views, e.g. to compare poses from different alignments

Brush renders the splat by loading it as its initial point cloud and evaluating
after one training step. Renders of LichtFeld splats made this way match
LichtFeld's own renders to 46-51 dB, so the scores compare across trainers and
also cover what the web viewer shows (the exported splat). Each set is scored
with evaluate.py; the summary goes to <out>/scores.json.
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
BRUSH = HERE.parent / 'brush'
CAPTURE_SWEEPS = (0, 20, 40, 60, 80, 100)


def view_sets(dataset=None):
    held_out = HERE / 'output' / 'holdout' / 'transforms_val.json'
    full = (dataset or HERE / 'output' / 'full') / 'transforms.json'
    capture = lambda frame: int(Path(frame['file_path']).stem[1:4]) in CAPTURE_SWEEPS
    return {'heldOut': (held_out, lambda frame: True), 'capture': (full, capture), 'all': (full, lambda frame: True)}


def link(source, target):
    target.unlink(missing_ok=True)
    try:
        os.link(source, target)  # no extra disk space on NTFS
    except OSError:
        shutil.copy2(source, target)


def render(brush, splat, transforms, keep, folder):
    """Brush dataset with only the chosen frames and the splat as init.ply; returns the eval folder."""
    data = json.loads(transforms.read_text(encoding='utf-8'))
    frames = [frame for frame in data['frames'] if keep(frame)]
    if not frames:
        raise SystemExit(f'No views selected from {transforms}')
    dataset = folder / 'ds'
    for sub in ('images', 'masks'):
        (dataset / sub).mkdir(parents=True, exist_ok=True)
    for frame in frames:
        stem = Path(frame['file_path']).stem
        for sub, suffix in (('images', '.jpg'), ('masks', '.png')):
            source = transforms.parent / sub / f'{stem}{suffix}'
            if source.exists():
                link(source, dataset / sub / source.name)
    camera = {k: v for k, v in data.items() if k not in ('frames', 'ply_file_path')}
    for name in ('transforms_train.json', 'transforms_val.json'):
        (dataset / name).write_text(json.dumps({**camera, 'frames': frames}), encoding='utf-8')
    link(splat, dataset / 'init.ply')
    shutil.rmtree(folder / 'render', ignore_errors=True)
    command = [str(brush), str(dataset), '--total-steps', '1', '--eval-every', '1', '--eval-save-to-disk',
               '--export-every', '1000000', '--export-path', str(folder / 'render')]
    with open(folder / 'brush.log', 'w', encoding='utf-8') as log:
        if subprocess.run(command, cwd=BRUSH, stdout=log, stderr=subprocess.STDOUT).returncode:
            raise SystemExit(f'Brush failed; see {folder / "brush.log"}')
    return folder / 'render' / 'eval_1', dataset


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    parser.add_argument('splat', type=Path, help='Trained splat (.ply)')
    parser.add_argument('--out', type=Path, help='Output folder (default: score-<splat name> next to the splat)')
    parser.add_argument('--views', default='heldOut,capture', help='View sets to score (default: heldOut,capture)')
    parser.add_argument('--dataset', type=Path, help='Dataset whose poses render the capture and all views (default: dataset/output/full), '
                                                     'e.g. one made by alignment/to_dataset.py for a splat trained on it')
    parser.add_argument('--brush', type=Path, default=Path(os.environ.get('BRUSH_APP', BRUSH / 'bin' / 'brush_app.exe')))
    args = parser.parse_args()
    if not args.brush.is_file():
        raise SystemExit(f'Brush not found at {args.brush}. See brush/README.md, or pass --brush / set BRUSH_APP.')
    splat = args.splat.resolve()
    out = (args.out or splat.parent / f'score-{splat.stem}').resolve()
    sets = view_sets(args.dataset.resolve() if args.dataset else None)
    scores = {}
    for name in args.views.split(','):
        if name not in sets:
            raise SystemExit(f'Unknown view set {name}; choose from {", ".join(sets)}')
        renders, dataset = render(args.brush, splat, *sets[name], out / name)
        subprocess.run([sys.executable, str(HERE / 'evaluate.py'), str(renders), str(dataset), '--sheet', '0'],
                       check=True, stdout=subprocess.DEVNULL)
        scores[name] = json.loads((renders / 'metrics.json').read_text(encoding='utf-8'))['summary']['all']
        print(f'{name:>8}: {scores[name]["images"]:3d} images  PSNR {scores[name]["psnr"]:5.2f} dB  SSIM {scores[name]["ssim"]:.3f}', flush=True)
    (out / 'scores.json').write_text(json.dumps({'splat': str(splat), **scores}, indent=1), encoding='utf-8')
    return 0


if __name__ == '__main__':
    sys.exit(main())
