"""Write a Revit shared-parameter file for a building's provenance parameters (CPython).

usage: python tools/revit/shared_parameters.py --prefix RH --out reconstructions/roemerholz/work/build/revit_ws

Writes <out>/<PREFIX>_Provenance_SharedParameters.txt (UTF-16 with BOM, tab separated, CRLF: the format Revit
reads) with one group '<PREFIX> Provenance' and the parameters of provenance_params.py, each with a fresh GUID.
Run it once per building: the GUIDs are the identity of the parameters, so an existing file is never overwritten
unless --force is given (then every binding in the model must be redone).
"""
import argparse
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from provenance_params import PARAMS  # noqa: E402

DATATYPE = {'text': 'TEXT', 'number': 'NUMBER', 'integer': 'INTEGER'}


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--prefix', required=True, help='two-letter building prefix, e.g. RH')
    ap.add_argument('--out', required=True, type=Path, help='folder to write into (the pyRevit workspace)')
    ap.add_argument('--force', action='store_true')
    a = ap.parse_args()
    out = a.out / f'{a.prefix}_Provenance_SharedParameters.txt'
    if out.exists() and not a.force:
        print(f'exists, not overwritten (use --force to regenerate the GUIDs): {out}')
        return 1
    lines = ['# This is a Revit shared parameter file.', '# Do not edit manually.', '*META\tVERSION\tMINVERSION', 'META\t2\t1',
             '*GROUP\tID\tNAME', f'GROUP\t1\t{a.prefix} Provenance',
             '*PARAM\tGUID\tNAME\tDATATYPE\tDATACATEGORY\tGROUP\tVISIBLE\tDESCRIPTION\tUSERMODIFIABLE\tHIDEWHENNOVALUE']
    for suffix, spec, binding, cats, desc in PARAMS:
        lines.append('\t'.join(['PARAM', str(uuid.uuid4()), f'{a.prefix}_{suffix}', DATATYPE[spec], '', '1', '1', desc[:250], '1', '0']))
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(('\r\n'.join(lines) + '\r\n').encode('utf-16'))
    print(f'wrote {out} ({len(PARAMS)} parameters)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
