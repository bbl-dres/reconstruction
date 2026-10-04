"""Train a Gaussian splat with Brush on the prepared dataset.

    python reconstructions/von-wattenwyl-haus/brush/train.py holdout   # score held-out positions
    python reconstructions/von-wattenwyl-haus/brush/train.py full      # all positions, for viewing

Reads dataset/output/<split>/ and writes brush/output/<split>/: export_<step>.ply,
brush.log and, for the holdout split, eval_<step>/ renders scored with
dataset/evaluate.py. Brush runs from brush/ so its GPU kernel tuning cache
(target/) stays here. Brush itself is expected in brush/bin/ (see README.md).
"""
import argparse
import os
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATASET = HERE.parent / 'dataset'


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    parser.add_argument('split', choices=['holdout', 'full'], help='holdout: score novel positions; full: train on everything')
    parser.add_argument('--brush', type=Path, default=Path(os.environ.get('BRUSH_APP', HERE / 'bin' / 'brush_app.exe')))
    parser.add_argument('--steps', type=int, default=30000)
    parser.add_argument('--max-splats', type=int, default=3_000_000, help='Cap that keeps training within 8 GB of GPU memory')
    parser.add_argument('--out', type=Path, help='Output folder (default: brush/output/<split>)')
    parser.add_argument('--dry-run', action='store_true', help='Print the command without running it')
    parser.epilog = 'Unrecognised options are passed on to Brush.'
    args, extra = parser.parse_known_args()

    dataset = DATASET / 'output' / args.split
    out = (args.out or HERE / 'output' / args.split).resolve()
    command = [str(args.brush), str(dataset), '--total-steps', str(args.steps), '--max-splats', str(args.max_splats),
               '--export-path', str(out)]
    if args.split == 'holdout':
        # Brush evaluates on transforms_val.json: the held-out panorama positions.
        command += ['--export-every', str(args.steps), '--eval-every', str(max(1, args.steps // 3)), '--eval-save-to-disk']
    else:
        command += ['--export-every', str(max(1, args.steps // 3))]
    command += [a for a in extra if a != '--']
    print(' '.join(command), flush=True)
    if args.dry_run:
        return 0
    if not args.brush.is_file():
        raise SystemExit(f'Brush not found at {args.brush}. See brush/README.md, or pass --brush / set BRUSH_APP.')
    if not dataset.is_dir():
        raise SystemExit(f'No dataset at {dataset}. Run dataset/make_dataset.py first.')
    out.mkdir(parents=True, exist_ok=True)
    with open(out / 'brush.log', 'w', encoding='utf-8') as log:
        result = subprocess.run(command, cwd=HERE, stdout=log, stderr=subprocess.STDOUT)
    if result.returncode:
        raise SystemExit(f'Brush exited with {result.returncode}; see {out / "brush.log"}')
    for folder in sorted(out.glob('eval_*'), key=lambda p: int(p.name.split('_')[1])):
        print(f'{folder.name}:', flush=True)
        subprocess.run([sys.executable, str(DATASET / 'evaluate.py'), str(folder), str(dataset)], check=True)
    return 0


if __name__ == '__main__':
    sys.exit(main())
