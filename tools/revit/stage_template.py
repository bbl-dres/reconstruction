# -*- coding: utf-8 -*-
# Stage NN (<package>, <owner request and date>): <what this stage builds, in two lines>.
# Evidence and specification: references/research/<group>/spec-<group>.json; findings: reviews/<round>/<report>.md.
# Parts (inputs['part'], default 'all' = every part in this order; each part is idempotent: it finds its own elements by
# tag and Mark, deletes or updates them, and never touches other packages' elements):
#  <part-a>  - ...
#  <part-b>  - ...
#  verify    - read-only checks (always appended).
# Run as pyRevit run_modify (dry_run first), workspace = work/build/revit_ws, inputs {'part': ...} or {'parts': [...]}.
# IronPython 2.7: no f-strings; ids with V.eid(n); feet inside Revit, metres everywhere else (V.ft / V.m).
# Committed runs: <part> <run id> <date>   (record them here and with V.manifest_record after each commit)
from pyrevit.api import DB
import System
import collections, io, json, math, os
import rvt_base as V
reload(V)
V.configure(tag='agent:xx', prefix='XX')          # the building's tag and parameter prefix

try:
    INP = inputs or {}
except NameError:
    INP = {}
PART = INP.get('part', 'all')
PARTS = INP.get('parts') or []
ORDER = ['part-a', 'part-b']
STAGE = 'sNN'
HERE = os.path.dirname(os.path.abspath(__file__))
WS = os.path.normpath(os.path.join(HERE, '..'))
SPEC = json.load(io.open(os.path.join(WS, '..', '..', 'references', 'research', 'group', 'spec-group.json'), encoding='utf-8'))
report = collections.OrderedDict()
L = V.levels(doc)


def run(name):
    return PART == name or name in PARTS or (PART == 'all' and name in ORDER)


def tag(e, package, kind, note, mk=None, **tokens):
    """Comments tag + Mark; the provenance stage reads the tokens (method, src, conf, tolh, tolv, lod, period, date)."""
    V.set_comment(e, V.tag_string(package, kind, STAGE + ' ' + note, **tokens), mk)


# ======================================================================== part-a
if run('part-a'):
    out = collections.OrderedDict()
    t, pre = V.start(doc, 'XX %s part-a' % STAGE)
    n = V.delete_tagged(doc, 'agent:xx:package:kind-a')         # own elements of a previous run
    # ... create elements from SPEC, tag(e, 'package', 'kind-a', 'what and why', 'xx-part-floor-kind-001', method='scaled-drawing', src='XX-S001', conf='medium', tolh=0.1, tolv=0.05)
    t.Commit()
    out['replaced'] = n
    out.update(V.wrap(pre))
    report['part-a'] = out

# ======================================================================== verify (read-only, always)
chk = collections.OrderedDict()
chk['own_elements'] = len(V.tagged(doc, 'agent:xx:package'))
report['verify'] = chk
result = report
