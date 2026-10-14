"""Copy pyRevit agent run records and captures into a review-round folder (CPython).

usage: python tools/revit/save_run_record.py --round reconstructions/<id>/work/reviews/<round> --run 1cededd8657d [--run ...] [--captures 2026-10-12]

The pyRevit agent keeps every run under %APPDATA%/pyRevit/agent/runs/<timestamp>-<run_id>/ (request.json, response.json,
script.py) and every capture under %APPDATA%/pyRevit/agent/captures/. Both are outside the repository and are lost when
the profile is cleaned, so the records of every committed run (and the captures a review relies on) are copied into the
round folder: <round>/runs/<timestamp>-<run_id>/ and <round>/captures/.
"""
import argparse
import os
import shutil
import sys
from pathlib import Path


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--round', required=True, type=Path, help='the review round folder (work/reviews/<round>)')
    ap.add_argument('--run', action='append', default=[], help='run id (repeatable)')
    ap.add_argument('--captures', help='copy captures whose file name starts with this date, e.g. 20261012 or 2026-10-12')
    a = ap.parse_args()
    agent = Path(os.environ.get('APPDATA', '')) / 'pyRevit' / 'agent'
    runs = agent / 'runs'
    copied = []
    for rid in a.run:
        hits = sorted(runs.glob(f'*-{rid}')) if runs.exists() else []
        if not hits:
            print(f'run {rid}: not found under {runs}')
            continue
        for h in hits:
            dst = a.round / 'runs' / h.name
            dst.mkdir(parents=True, exist_ok=True)
            for f in ('request.json', 'response.json', 'script.py'):
                if (h / f).exists():
                    shutil.copy2(h / f, dst / f)
            copied.append(dst)
    if a.captures:
        key = a.captures.replace('-', '')
        cdir = agent / 'captures'
        dst = a.round / 'captures'
        n = 0
        for f in sorted(cdir.glob('*.png')) if cdir.exists() else []:
            if f.name.replace('-', '').startswith(key):
                dst.mkdir(parents=True, exist_ok=True)
                shutil.copy2(f, dst / f.name)
                n += 1
        print(f'captures copied: {n}')
    print('runs copied:', [str(p) for p in copied])
    return 0


if __name__ == '__main__':
    sys.exit(main())
