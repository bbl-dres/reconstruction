"""Train a Gaussian splat with LichtFeld Studio on the prepared dataset.

    python reconstructions/von-wattenwyl-haus/lichtfeld/train.py holdout --lichtfeld C:/path/to/LichtFeld-Studio.exe
    python reconstructions/von-wattenwyl-haus/lichtfeld/train.py full --strategy mcmc

The holdout split uses dataset/output/holdout-colmap/, whose image order makes
--test-every select exactly the held-out panorama positions (see its split.json),
so scores compare directly with Brush. The full split uses dataset/output/full/.
Settings mirror the Brush runs: 30,000 iterations, a 3 million splat cap, the
masked tripod patch excluded from the loss (--mask-mode=ignore, like Brush), and
the 1024 px images used at full size. Output goes to
lichtfeld/output/<split>-<strategy>/.
"""
import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATASET = HERE.parent / 'dataset' / 'output'


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    parser.add_argument('split', choices=['holdout', 'full'], help='holdout: score novel positions; full: train on everything')
    parser.add_argument('--lichtfeld', type=Path, default=os.environ.get('LICHTFELD_STUDIO'), help='LichtFeld-Studio.exe (or set LICHTFELD_STUDIO)')
    parser.add_argument('--strategy', default='mrnf', choices=['mrnf', 'mcmc', 'igs+'], help='Densification strategy (LichtFeld default: mrnf)')
    parser.add_argument('--iterations', type=int, default=30000)
    parser.add_argument('--max-cap', type=int, default=3_000_000)
    parser.add_argument('--out', type=Path, help='Output folder (default: lichtfeld/output/<split>-<strategy>)')
    parser.add_argument('--dataset', type=Path, help='Other COLMAP dataset for the full split (default: dataset/output/full), '
                                                     'e.g. one made by alignment/to_dataset.py')
    parser.add_argument('--dry-run', action='store_true', help='Print the command without running it')
    parser.epilog = 'Unrecognised options are passed on to LichtFeld.'
    args, extra = parser.parse_known_args()

    dataset = (args.dataset.resolve() if args.dataset and args.split == 'full'
               else DATASET / ('holdout-colmap' if args.split == 'holdout' else 'full'))
    out = (args.out or HERE / 'output' / f'{args.split}-{args.strategy.replace("+", "plus")}').resolve()
    command = [str(args.lichtfeld or 'LichtFeld-Studio.exe'), f'--data-path={dataset}', f'--output-path={out}',
               '--headless', '--train', f'--iter={args.iterations}', f'--strategy={args.strategy}',
               f'--max-cap={args.max_cap}', '--mask-mode=ignore', '--resize_factor=1', f'--log-file={out / "lichtfeld.log"}']
    if args.split == 'holdout':
        split = json.loads((dataset / 'split.json').read_text(encoding='utf-8')) if (dataset / 'split.json').exists() else {'testEvery': 10}
        command += ['--eval', f'--test-every={split["testEvery"]}']
    command += [a for a in extra if a != '--']
    print(' '.join(command), flush=True)
    if args.dry_run:
        return 0
    if not args.lichtfeld or not Path(args.lichtfeld).is_file():
        raise SystemExit('Pass --lichtfeld path/to/LichtFeld-Studio.exe or set LICHTFELD_STUDIO.')
    if not dataset.is_dir():
        raise SystemExit(f'No dataset at {dataset}. Run dataset/make_dataset.py (and split_to_colmap.py for holdout) first.')
    out.mkdir(parents=True, exist_ok=True)
    return subprocess.run(command, cwd=HERE).returncode


if __name__ == '__main__':
    sys.exit(main())
