# -*- coding: utf-8 -*-
"""Generic provenance stage (IronPython 2.7, pyRevit run_modify): binds the building's provenance parameters and fills
them from the stage tags. Runs LAST after every geometry package; touches no geometry; re-runnable.

Copy into the building's workspace as stages/s99_provenance.py (keep its number last in MANIFEST.json) next to
rvt_base.py, provenance_params.py and <PREFIX>_Provenance_SharedParameters.txt (tools/revit/shared_parameters.py).
Configuration: <workspace>/provenance.json
  {"prefix": "RH", "tagPrefix": "agent:rh",
   "buildingByPackage": {"villa": "VIL", "gallery": "GAL", "link": "LINK", "site": "SITE", "context": "CTX"},
   "defaultBuilding": "VIL",
   "buildingCodes": ["VIL", "GAL", "LINK", "SITE", "CTX"],   (optional: every valid code; a cut code in a tag is repaired)
   "defaults": {"method": "inferred", "confidence": "low", "tolh": 0.3, "tolv": 0.3, "lod": 200, "stateDate": "", "period": ""},
   "lodByCategory": {"Walls": 300, "Doors": 300, "Windows": 300, "Generic Models": 200}}
inputs: {'parts': ['bind', 'elements', 'rooms', 'coverage']} (default all), {'cats': ['Walls', ...]} to limit 'elements'.
Fill rules (per element, from its Comments tag 'agent:<ns>:<package>:<kind>|<note>|k=v...'):
  RegistryId = Mark; Building = token 'building' or buildingByPackage[package] or the default;
  Method / Confidence / Tol_H / Tol_V / LOD / StateDate / ConstructionPeriod = tokens method / conf / tolh / tolv / lod / date / period, else defaults;
  EvidenceSource = token 'src' plus every XX-SNNN and ref-... id in the comment; Decisions = XX-DNNN ids; Stage = last sNN in the comment,
  else the package; Part = package. Sub-elements without a tag (balusters, rails, nested instances) inherit their host.
  Untagged model elements get the defaults, Method 'unknown-placeholder', and are counted in the coverage report.
"""
from pyrevit.api import DB
import System
import collections, io, json, os, re
import rvt_base as V
import provenance_params as PP
reload(V)
reload(PP)

try:
    INP = inputs or {}
except NameError:
    INP = {}
HERE = os.path.dirname(os.path.abspath(__file__))
WS = os.path.normpath(os.path.join(HERE, '..')) if os.path.basename(HERE) == 'stages' else HERE
with io.open(os.path.join(WS, 'provenance.json'), encoding='utf-8') as fh:
    CFG = json.load(fh)
P = CFG['prefix']
V.configure(CFG.get('tagPrefix', 'agent'), P)
GROUP = CFG.get('group', P + ' Provenance')
SP_FILE = os.path.join(WS, CFG.get('sharedParametersFile', P + '_Provenance_SharedParameters.txt'))
DEF = CFG.get('defaults', {})
PARTS = INP.get('parts') or ['bind', 'elements', 'rooms', 'coverage']
report = collections.OrderedDict()


def pname(suffix):
    return P + '_' + suffix


def spec_of(s):
    return {'text': DB.SpecTypeId.String.Text, 'number': DB.SpecTypeId.Number, 'integer': DB.SpecTypeId.Int.Integer}[s]


def cats_of(doc, key):
    names = {'model': PP.MODEL_CATS, 'type-model': PP.MODEL_CATS, 'room': PP.ROOM_CATS, 'project': PP.PROJECT_CATS}[key]
    out = []
    for n in names:
        bic = getattr(DB.BuiltInCategory, n, None)
        if bic is None:
            continue
        try:
            c = doc.Settings.Categories.get_Item(bic)
        except Exception:
            c = None
        if c is not None and c.AllowsBoundParameters:
            out.append(c)
    return out


def group_of(suffix):
    if suffix in ('StructuralRole', 'StructuralBasis'):
        return DB.GroupTypeId.Structural
    if suffix in ('VerticalDatum', 'Georeference'):
        return DB.GroupTypeId.IdentityData
    return DB.GroupTypeId.Data


# ------------------------------------------------------------------ bind
if 'bind' in PARTS:
    if not os.path.exists(SP_FILE):
        raise Exception('shared-parameter file missing: %s (tools/revit/shared_parameters.py --prefix %s)' % (SP_FILE, P))
    orig = app.SharedParametersFilename
    app.SharedParametersFilename = SP_FILE
    acts = {}
    try:
        df = app.OpenSharedParameterFile()
        grp = df.Groups.get_Item(GROUP)
        if grp is None:
            raise Exception('group %s not in %s' % (GROUP, SP_FILE))
        t, pre = V.start(doc, P + ' provenance: shared parameters and bindings')
        bm = doc.ParameterBindings
        for suffix, spec, binding, ckey, desc in PP.PARAMS:
            d = grp.Definitions.get_Item(pname(suffix))
            if d is None:
                acts[pname(suffix)] = 'missing in file'
                continue
            cats = cats_of(doc, ckey)
            cs = DB.CategorySet()
            for c in cats:
                cs.Insert(c)
            b = DB.TypeBinding(cs) if binding == 'type' else DB.InstanceBinding(cs)
            spe = DB.SharedParameterElement.Lookup(doc, d.GUID)
            if spe is None:
                acts[pname(suffix)] = 'inserted' if bm.Insert(d, b, group_of(suffix)) else 'insert-failed'
            else:
                old = bm.get_Item(spe.GetDefinition())
                missing = [c.Name for c in cats if old is None or not old.Categories.Contains(c)]
                if missing:
                    acts[pname(suffix)] = ('widened ' if bm.ReInsert(d, b, group_of(suffix)) else 'widen-failed ') + ','.join(missing)
        t.Commit()
    finally:
        app.SharedParametersFilename = orig
    report['bind'] = {'file': SP_FILE, 'actions': acts}


# ------------------------------------------------------------------ fill helpers
def set_p(e, suffix, value):
    p = e.LookupParameter(pname(suffix))
    if p is None or p.IsReadOnly or value is None:
        return False
    try:
        st = p.StorageType
        if st == DB.StorageType.String:
            p.Set(str(value)[:250])
        elif st == DB.StorageType.Double:
            p.Set(float(value))
        elif st == DB.StorageType.Integer:
            p.Set(int(value))
        return True
    except Exception:
        return False


def host_of(e):
    for attr in ('SuperComponent', 'Host'):
        try:
            h = getattr(e, attr)
            if h is not None and V.comment(h):
                return h
        except Exception:
            pass
    for attr in ('HostRailingId', 'HostId'):
        try:
            hid = getattr(e, attr)
            if hid is not None and hid.Value > 0:
                h = doc.GetElement(hid)
                if h is not None and V.comment(h):
                    return h
        except Exception:
            pass
    return None


REPAIRED = []   # [mark, cut building token, repaired code]: elements whose tag lost part of its building code


def values_from(e):
    """-> (dict suffix -> value, tagged: bool) from the element's own tag or its host's."""
    c = V.comment(e)
    tag = V.parse_tag(c)
    if tag is None:
        h = host_of(e)
        if h is not None:
            c, tag = V.comment(h), V.parse_tag(V.comment(h))
    cat = e.Category.Name if e.Category else ''
    out = {'RegistryId': V.mark(e) or None,
           'Method': DEF.get('method', 'inferred'), 'Confidence': DEF.get('confidence', 'low'),
           'Tol_H': DEF.get('tolh', 0.3), 'Tol_V': DEF.get('tolv', 0.3), 'LOD': CFG.get('lodByCategory', {}).get(cat, DEF.get('lod', 200)),
           'StateDate': DEF.get('stateDate', ''), 'ConstructionPeriod': DEF.get('period', ''), 'Building': CFG.get('defaultBuilding', '')}
    if tag is None:
        out['Method'] = 'unknown-placeholder'
        out['Stage'] = ''
        out['Part'] = ''
        return out, False
    tk = tag['tokens']
    out['Part'] = tag['package']
    b = tk.get('building')
    codes = set(CFG.get('buildingCodes') or [])
    if b and codes and b not in codes:
        # a tag cut at 250 characters (tag_string before 2026-10-13) can end in 'building=V': take the one code it begins
        hit = [c for c in codes if c.startswith(b)]
        REPAIRED.append([V.mark(e) or int(e.Id.Value), b, hit[0] if len(hit) == 1 else None])
        b = hit[0] if len(hit) == 1 else None
    out['Building'] = b or CFG.get('buildingByPackage', {}).get(tag['package'], out['Building'])
    if tk.get('method'):
        out['Method'] = tk['method']
    if tk.get('conf'):
        out['Confidence'] = tk['conf']
    for k, suffix in (('tolh', 'Tol_H'), ('tolv', 'Tol_V'), ('lod', 'LOD')):
        if tk.get(k):
            try:
                out[suffix] = float(tk[k]) if suffix != 'LOD' else int(float(tk[k]))
            except ValueError:
                pass
    if tk.get('date'):
        out['StateDate'] = tk['date']
    if tk.get('period'):
        out['ConstructionPeriod'] = tk['period']
    srcs = []
    if tk.get('src'):
        srcs.append(tk['src'])
    for s_ in V.RX_SOURCE.findall(c):
        if not any(s_ in x for x in srcs):
            srcs.append(s_)
    out['EvidenceSource'] = '; '.join(srcs)
    out['Decisions'] = '; '.join(sorted(set(V.RX_DECISION.findall(c))))
    st = V.RX_STAGE.findall(c)
    out['Stage'] = st[-1] if st else tag['package']
    return out, True


def model_elements(cats=None):
    out = []
    for n in PP.MODEL_CATS:
        bic = getattr(DB.BuiltInCategory, n, None)
        if bic is None:
            continue
        for e in DB.FilteredElementCollector(doc).OfCategory(bic).WhereElementIsNotElementType():
            if cats and (e.Category is None or e.Category.Name not in cats):
                continue
            out.append(e)
    return out


# ------------------------------------------------------------------ elements
if 'elements' in PARTS:
    t, pre = V.start(doc, P + ' provenance: element values')
    stats = collections.Counter()
    untagged = collections.Counter()
    for e in model_elements(INP.get('cats')):
        vals, tagged_ = values_from(e)
        if not tagged_:
            untagged[e.Category.Name if e.Category else '?'] += 1
        n = 0
        for suffix, val in vals.items():
            if set_p(e, suffix, val):
                n += 1
        stats['elements'] += 1
        stats['values'] += n
    t.Commit()
    report['elements'] = {'elements': stats['elements'], 'values_set': stats['values'], 'untagged_by_category': dict(untagged),
                          'building_repaired': {'count': len(REPAIRED), 'sample': REPAIRED[:40]}}
    report['elements'].update(V.wrap(pre))

# ------------------------------------------------------------------ rooms
if 'rooms' in PARTS:
    t, pre = V.start(doc, P + ' provenance: rooms')
    n = 0
    for r in DB.FilteredElementCollector(doc).OfCategory(DB.BuiltInCategory.OST_Rooms).WhereElementIsNotElementType():
        try:
            if r.Area <= 0:
                continue
        except Exception:
            continue
        pa = r.LookupParameter(pname('PlanArea'))
        if pa is not None and pa.HasValue and pa.AsDouble() > 0:
            set_p(r, 'AreaDeviation', round(r.Area / (V.FT * V.FT) - pa.AsDouble(), 2))
            n += 1
    t.Commit()
    report['rooms'] = {'area_deviation_set': n}

# ------------------------------------------------------------------ coverage (read-only)
if 'coverage' in PARTS:
    cov = collections.Counter()
    missing = collections.defaultdict(list)
    for e in model_elements():
        cov['elements'] += 1
        for suffix in ('Method', 'Building', 'Tol_H', 'LOD'):
            p = e.LookupParameter(pname(suffix))
            if p is None or not p.HasValue or (p.StorageType == DB.StorageType.String and not p.AsString()):
                missing[suffix].append(int(e.Id.Value))
        if not V.comment(e).startswith(CFG.get('tagPrefix', 'agent')):
            cov['untagged'] += 1
    report['coverage'] = {'elements': cov['elements'], 'untagged': cov['untagged'],
                          'missing': dict((k, {'count': len(v), 'sample': v[:20]}) for k, v in missing.items())}
result = report
