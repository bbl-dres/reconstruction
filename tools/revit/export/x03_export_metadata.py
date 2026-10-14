# Revit viewer export, step 3: element metadata for the exported elements (read-only; writes <set>.meta.json).
# IronPython 2.7 through the pyRevit agent run_query. inputs: config (export_config.json), set, out (folder with <set>.export.json).
from pyrevit.api import DB
import json, os, System


def _jd(o):
    """JSON fallback for .NET values (Int64 ids, enums, strings)."""
    try:
        return int(o)
    except Exception:
        return str(o)


SET = inputs.get('set')
OUT = inputs.get('out')

# ---- building configuration (export_config.json next to the building's build/export; see export_config.example.json)
with open(inputs['config']) as _fh:
    CFG = json.load(_fh)
P = CFG.get('prefix', 'XX') + '_'
with open(os.path.join(OUT, SET + '.export.json')) as fh:
    exp = json.load(fh)
ids = exp['exported']
FT = 0.3048

phase = None
for ph in doc.Phases:
    phase = ph          # last phase = the one the export views show


def pstr(p):
    if p is None or not p.HasValue:
        return None
    st = p.StorageType
    if st == DB.StorageType.String:
        return p.AsString()
    if st == DB.StorageType.Integer:
        return p.AsInteger()
    if st == DB.StorageType.Double:
        return round(p.AsDouble(), 6)
    if st == DB.StorageType.ElementId:
        return p.AsElementId().Value
    return None


def vm_params(e):
    out = {}
    if e is None:
        return out
    for p in e.Parameters:
        try:
            n = p.Definition.Name
        except Exception:
            continue
        if n.startswith(P):
            v = pstr(p)
            if v is not None and v != '':
                if p.StorageType == DB.StorageType.Double:
                    try:
                        v = p.AsValueString()
                    except Exception:
                        pass
                out[n] = v
    return out


def bip(e, b):
    try:
        return pstr(e.get_Parameter(b))
    except Exception:
        return None


def level_name(e):
    lid = None
    try:
        lid = e.LevelId
    except Exception:
        lid = None
    if lid is None or lid.Value < 0:
        for b in (DB.BuiltInParameter.WALL_BASE_CONSTRAINT, DB.BuiltInParameter.FAMILY_LEVEL_PARAM,
                  DB.BuiltInParameter.SCHEDULE_LEVEL_PARAM, DB.BuiltInParameter.STAIRS_BASE_LEVEL_PARAM,
                  DB.BuiltInParameter.ROOF_BASE_LEVEL_PARAM, DB.BuiltInParameter.LEVEL_PARAM):
            try:
                p = e.get_Parameter(b)
                if p is not None and p.AsElementId().Value > 0:
                    lid = p.AsElementId()
                    break
            except Exception:
                pass
    if lid is None or lid.Value < 0:
        return None
    lv = doc.GetElement(lid)
    return ename(lv)


def room_rec(r):
    if r is None:
        return None
    return r.Id.Value


def rooms_of(e, bb):
    out = []
    try:
        if isinstance(e, DB.FamilyInstance):
            for attr in ('FromRoom', 'ToRoom'):
                try:
                    r = getattr(e, attr)
                    if r is not None and r.Id.Value not in out:
                        out.append(r.Id.Value)
                except Exception:
                    pass
            if not out:
                try:
                    r = e.Room
                    if r is not None:
                        out.append(r.Id.Value)
                except Exception:
                    pass
            if out:
                return out
    except Exception:
        pass
    if bb is None or isinstance(e, DB.Wall):
        return out
    c = DB.XYZ((bb.Min.X + bb.Max.X) / 2, (bb.Min.Y + bb.Max.Y) / 2, bb.Min.Z + 0.5 / FT)
    try:
        r = doc.GetRoomAtPoint(c, phase) if phase is not None else doc.GetRoomAtPoint(c)
        if r is not None:
            out.append(r.Id.Value)
    except Exception:
        pass
    return out


def ename(e):
    if e is None:
        return None
    try:
        return DB.Element.Name.__get__(e)
    except Exception:
        try:
            return e.Name
        except Exception:
            return None


rows = {}
for i in ids:
    try:
        e = doc.GetElement(DB.ElementId(System.Int64(i)))
    except Exception:
        e = None
    if e is None:
        continue
    t = doc.GetElement(e.GetTypeId()) if e.GetTypeId().Value > 0 else None
    fam = None
    if t is not None:
        try:
            fam = t.FamilyName
        except Exception:
            fam = bip(t, DB.BuiltInParameter.SYMBOL_FAMILY_NAME_PARAM)
    bb = e.get_BoundingBox(None)
    row = {
        'id': i, 'uniqueId': e.UniqueId, 'category': e.Category.Name if e.Category else None,
        'bic': e.Category.Id.Value if e.Category else None, 'class': e.GetType().Name,
        'name': ename(e), 'family': fam, 'typeName': ename(t), 'typeId': t.Id.Value if t else None,
        'level': level_name(e), 'comments': bip(e, DB.BuiltInParameter.ALL_MODEL_INSTANCE_COMMENTS),
        'mark': bip(e, DB.BuiltInParameter.ALL_MODEL_MARK), 'vm': vm_params(e), 'vmType': vm_params(t),
        'bbox': [[bb.Min.X * FT, bb.Min.Y * FT, bb.Min.Z * FT], [bb.Max.X * FT, bb.Max.Y * FT, bb.Max.Z * FT]] if bb else None,
        'rooms': rooms_of(e, bb),
    }
    if isinstance(e, DB.Wall):
        try:
            row['wallFunction'] = str(e.WallType.Function)
        except Exception:
            pass
        row['topLevel'] = None
        try:
            p = e.get_Parameter(DB.BuiltInParameter.WALL_HEIGHT_TYPE)
            if p and p.AsElementId().Value > 0:
                row['topLevel'] = ename(doc.GetElement(p.AsElementId()))
        except Exception:
            pass
        try:
            row['structural'] = bool(e.get_Parameter(DB.BuiltInParameter.WALL_STRUCTURAL_SIGNIFICANT).AsInteger())
        except Exception:
            pass
    if isinstance(e, DB.FamilyInstance):
        try:
            row['host'] = e.Host.Id.Value if e.Host else None
            if e.Host is not None and isinstance(e.Host, DB.Wall):
                row['hostWallFunction'] = str(e.Host.WallType.Function)
                hv = vm_params(e.Host)
                row['hostBuilding'] = hv.get(P + 'Building')
        except Exception:
            pass
        try:
            row['superComponent'] = e.SuperComponent.Id.Value if e.SuperComponent else None
        except Exception:
            pass
        try:
            row['mirrored'] = bool(e.Mirrored)
        except Exception:
            pass
    for attr in ('HostRailingId',):
        try:
            v = getattr(e, attr)
            if v is not None and v.Value > 0:
                row['hostRailing'] = v.Value
        except Exception:
            pass
    if isinstance(e, DB.Architecture.Railing):
        try:
            row['railingHost'] = e.HostId.Value if e.HostId.Value > 0 else None
        except Exception:
            pass
    rows[str(i)] = row

rooms = {}
for r in DB.FilteredElementCollector(doc).OfCategory(DB.BuiltInCategory.OST_Rooms):
    if not isinstance(r, DB.Architecture.Room):
        continue
    try:
        if r.Area <= 0:
            continue
    except Exception:
        continue
    rooms[str(r.Id.Value)] = {
        'id': r.Id.Value, 'uniqueId': r.UniqueId, 'number': r.Number,
        'name': bip(r, DB.BuiltInParameter.ROOM_NAME), 'level': ename(r.Level),
        'area_m2': round(r.Area * FT * FT, 3), 'volume_m3': round(r.Volume * FT ** 3, 3) if r.Volume else None,
        'vm': vm_params(r), 'comments': bip(r, DB.BuiltInParameter.ALL_MODEL_INSTANCE_COMMENTS)}

levels = [{'id': lv.Id.Value, 'name': ename(lv), 'elevation_m': round(lv.Elevation * FT, 4),
           'storey': bool(lv.get_Parameter(DB.BuiltInParameter.LEVEL_IS_BUILDING_STORY).AsInteger())}
          for lv in DB.FilteredElementCollector(doc).OfClass(DB.Level)]
pi = doc.ProjectInformation
project = {'vm': vm_params(pi), 'name': ename(pi), 'number': pi.Number, 'address': pi.Address}
import codecs
_payload = json.dumps({'elements': rows, 'rooms': rooms, 'levels': levels, 'project': project,
                       'phase': ename(phase)}, default=_jd, ensure_ascii=False)
with codecs.open(os.path.join(OUT, SET + '.meta.json'), 'w', 'utf-8') as fh:
    fh.write(_payload)
result = {'elements': len(rows), 'rooms': len(rooms), 'levels': len(levels)}
