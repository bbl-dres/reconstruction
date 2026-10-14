# -*- coding: utf-8 -*-
"""Shared helpers for Revit stage scripts run through the pyRevit MCP (IronPython 2.7).

Use from a building's pyRevit workspace (`work/build/revit_ws`): copy this file there as `rvt_base.py` (the
workspace is on sys.path for every run; helper modules are reloaded per run) and configure it once in the
building's own helper module:

    import rvt_base as V
    V.configure(tag='agent:rh', prefix='RH')      # Comments tag prefix and shared-parameter prefix

Units: Revit internal units are feet. Every record, registry and specification is in metres: `ft(m)` converts a
metre value into internal feet, `m(x)` converts an internal value back. Never divide by 0.3048 anywhere else.
Tags: every element a stage creates carries a Comments tag `agent:<ns>:<package>:<kind>|<note>|k=v|...` and a
Mark (the product id). Stages find their own elements by tag and Mark, so they can run again.
"""
import collections
import io
import json
import os
import re
import shutil
import System
from pyrevit.api import DB

FT = 1.0 / 0.3048
TAG = 'agent'
PREFIX = 'XX'


def configure(tag, prefix):
    global TAG, PREFIX
    TAG, PREFIX = tag, prefix


def ft(metres):
    return metres * FT


def m(internal):
    return internal / FT


def xyz(x, y, z=0.0):
    return DB.XYZ(ft(x), ft(y), ft(z))


def eid(n):
    return DB.ElementId(System.Int64(int(n)))


# ---------------------------------------------------------------- transactions
class SwallowWarnings(DB.IFailuresPreprocessor):
    """Warnings are recorded and dismissed; errors with a resolution are resolved and recorded (element ids)."""

    def __init__(self):
        self.warnings = []
        self.warning_ids = []
        self.errors = []

    def PreprocessFailures(self, fa):
        res = DB.FailureProcessingResult.Continue
        for f in fa.GetFailureMessages():
            sev = f.GetSeverity()
            if sev == DB.FailureSeverity.Warning:
                self.warnings.append(f.GetDescriptionText())
                self.warning_ids.append((f.GetDescriptionText(), [i.Value for i in f.GetFailingElementIds()]))
                fa.DeleteWarning(f)
            elif sev == DB.FailureSeverity.Error and f.HasResolutions():
                self.errors.append((f.GetDescriptionText(), [i.Value for i in f.GetFailingElementIds()]))
                fa.ResolveFailure(f)
                res = DB.FailureProcessingResult.ProceedWithCommit
        return res


def start(doc, name):
    """Open a named transaction with the warning preprocessor: `t, pre = start(doc, 'stage part')` ... `t.Commit()`."""
    t = DB.Transaction(doc, name)
    opts = t.GetFailureHandlingOptions()
    pre = SwallowWarnings()
    opts.SetFailuresPreprocessor(pre)
    t.SetFailureHandlingOptions(opts)
    t.Start()
    return t, pre


def wrap(pre):
    """Report block of a part: the swallowed warnings and resolved errors."""
    return {'warnings': collections.Counter(pre.warnings).most_common(5), 'errors': pre.errors[:5]}


# ---------------------------------------------------------------- elements
def name_of(e):
    try:
        return DB.Element.Name.__get__(e) or ''
    except Exception:
        return ''


def by_class(doc, cls):
    return list(DB.FilteredElementCollector(doc).OfClass(cls))


def find_named(doc, cls, name):
    for e in by_class(doc, cls):
        if name_of(e) == name:
            return e
    return None


def mark(e):
    p = e.get_Parameter(DB.BuiltInParameter.ALL_MODEL_MARK)
    return (p.AsString() or '') if p else ''


def comment(e):
    p = e.get_Parameter(DB.BuiltInParameter.ALL_MODEL_INSTANCE_COMMENTS)
    return (p.AsString() or '') if p else ''


def set_comment(e, s, mk=None):
    p = e.get_Parameter(DB.BuiltInParameter.ALL_MODEL_INSTANCE_COMMENTS)
    if p and not p.IsReadOnly:
        p.Set(s[:250])
    if mk is not None:
        q = e.get_Parameter(DB.BuiltInParameter.ALL_MODEL_MARK)
        if q and not q.IsReadOnly:
            q.Set(mk)


def set_type_info(t, desc, type_mark=None):
    for bip, val in ((DB.BuiltInParameter.ALL_MODEL_DESCRIPTION, desc[:250]), (DB.BuiltInParameter.ALL_MODEL_TYPE_COMMENTS, TAG)):
        p = t.get_Parameter(bip)
        if p and not p.IsReadOnly:
            p.Set(val)
    if type_mark:
        p = t.get_Parameter(DB.BuiltInParameter.WINDOW_TYPE_ID)
        if p and not p.IsReadOnly:
            p.Set(type_mark)


TAGS_CUT = []   # tags longer than 250 characters, cut at the end: their trailing tokens (building=...) may be lost


def tag_string(package, kind, note='', **tokens):
    """'agent:<ns>:<package>:<kind>|<note>|method=...|src=...|conf=...|tolh=...|tolv=...|period=...|date=...|building=...'

    Cut at 250 characters, as stored in every model so far: stages compare the stored comment with this string, so changing
    how a long tag is cut would make them rebuild those elements. A cut can lose the trailing tokens, building= first; the
    provenance stage repairs a cut building code (provenance.json buildingCodes), and TAGS_CUT lists the cut tags of a run.
    Keep notes short so that tags fit."""
    s = '%s:%s:%s' % (TAG, package, kind)
    if note:
        s += '|' + note
    for k in ('method', 'src', 'conf', 'tolh', 'tolv', 'lod', 'period', 'date', 'building'):
        if k in tokens and tokens[k] not in (None, ''):
            s += '|%s=%s' % (k, tokens[k])
    if len(s) > 250:
        TAGS_CUT.append(s[:60])
    return s[:250]


def parse_tag(s):
    """-> {'prefix', 'package', 'kind', 'note', 'tokens': {k: v}} or None when the comment is not a stage tag."""
    if not s or not s.startswith(TAG + ':'):
        return None
    head, rest = (s.split('|', 1) + [''])[:2]
    parts = head.split(':')
    out = {'prefix': ':'.join(parts[:2]), 'package': parts[2] if len(parts) > 2 else '', 'kind': ':'.join(parts[3:]), 'note': '', 'tokens': {}}
    for piece in rest.split('|'):
        if '=' in piece and ' ' not in piece.split('=', 1)[0]:
            k, v = piece.split('=', 1)
            out['tokens'][k.strip()] = v.strip()
        elif piece and not out['note']:
            out['note'] = piece
    return out


def tagged(doc, prefix, cat=None):
    """Elements whose Comments start with `prefix` (a full or partial tag)."""
    col = DB.FilteredElementCollector(doc).WhereElementIsNotElementType()
    if cat is not None:
        col = col.OfCategory(cat)
    out = []
    for e in col:
        c = comment(e)
        if c and c.startswith(prefix):
            out.append(e)
    return out


def by_mark(doc, cat, mk):
    for e in DB.FilteredElementCollector(doc).OfCategory(cat).WhereElementIsNotElementType():
        if mark(e) == mk:
            return e
    return None


def delete_tagged(doc, prefix, cat=None):
    n = 0
    for e in tagged(doc, prefix, cat):
        try:
            doc.Delete(e.Id)
            n += 1
        except Exception:
            pass
    return n


# ---------------------------------------------------------------- levels and rooms
def levels(doc):
    """name -> Level; also keyed by elevation string '%.3f' in metres."""
    out = {}
    for l in by_class(doc, DB.Level):
        out[name_of(l)] = l
        out['%.3f' % m(l.Elevation)] = l
    return out


def level_at(doc, z_m, tol=0.01):
    best = None
    for l in by_class(doc, DB.Level):
        d = abs(m(l.Elevation) - z_m)
        if d <= tol and (best is None or d < best[0]):
            best = (d, l)
    return best[1] if best else None


def room_at(doc, level, x, y, dz=0.3):
    return doc.GetRoomAtPoint(DB.XYZ(ft(x), ft(y), level.Elevation + ft(dz)))


def room_number(r):
    if r is None:
        return None
    p = r.get_Parameter(DB.BuiltInParameter.ROOM_NUMBER)
    return p.AsString() if p else None


# ---------------------------------------------------------------- registries and run records
def registry_path(workspace, name):
    return os.path.join(workspace, name if name.endswith('.json') else name + '.json')


def load_registry(workspace, name, default=None):
    p = registry_path(workspace, name)
    if not os.path.exists(p):
        return default if default is not None else {}
    with io.open(p, encoding='utf-8') as fh:
        return json.load(fh)


def save_registry(workspace, name, data, stage):
    """Write a registry after backing up the previous file as <name>.pre-<stage>.bak (first backup per stage wins)."""
    p = registry_path(workspace, name)
    bak = p + '.pre-%s.bak' % stage
    if os.path.exists(p) and not os.path.exists(bak):
        shutil.copy2(p, bak)
    with io.open(p, 'w', encoding='utf-8') as fh:
        fh.write(json.dumps(data, indent=1, ensure_ascii=False))
    return bak


def manifest_record(workspace, stage_id, part, run_id, summary=None):
    """Append a committed run to stages/MANIFEST.json ('runs' list of the stage entry). Call after the commit."""
    p = os.path.join(workspace, 'stages', 'MANIFEST.json')
    if not os.path.exists(p):
        return False
    with io.open(p, encoding='utf-8') as fh:
        man = json.load(fh)
    for s in man.get('stages', []):
        if s.get('id') == stage_id:
            s.setdefault('runs', []).append({'part': part, 'run_id': run_id, 'summary': summary or ''})
            break
    else:
        return False
    with io.open(p, 'w', encoding='utf-8') as fh:
        fh.write(json.dumps(man, indent=1, ensure_ascii=False))
    return True


RX_DECISION = re.compile(r'\b[A-Z]{2}-D\d{3}\b')
RX_SOURCE = re.compile(r'\b[A-Z]{2}-S\d{3}\b|\bref-[0-9a-f]{16}\b')
RX_STAGE = re.compile(r'\bs\d{1,3}[a-z]?\b')
