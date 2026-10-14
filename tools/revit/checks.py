# -*- coding: utf-8 -*-
"""Model checks for a Revit reconstruction (IronPython 2.7, pyRevit run_query: read-only).

inputs: {'prefix': 'RH', 'tag': 'agent:rh', 'max_pairs': 20000, 'building_codes': ['VIL', 'GAL', ...], 'roof_checks': True, 'roof_step': 1.0}
Reports: element counts by category; duplicate Marks; untagged model elements; elements without <P>_Method;
free wall ends (an end that meets no other wall body or end within 0.03 m); stairs whose runs do not reach their
base or top level (±0.02 m); rooms without area; furniture outside any room, overlapping furniture pairs (XY boxes
of tagged ':furniture:' elements on one level); warnings count; <P>_Building values (with 'building_codes': the unknown
ones, which the export drops). With roof_checks (default on; 'roof_step' 1.0 m):
open_to_sky (rooms with points under no roof, floor, glazing or terrain; interior elements the sky sees first; wells) and
through_roof (ceilings, floors and ceiling / vault models rising above a roof underside where nothing covers them);
about a minute together on a 1800-element model. Run before every export and in every review round;
copy the result into the round folder.
"""
from pyrevit.api import DB
import System
from System.Collections.Generic import List
import collections, math

try:
    INP = inputs or {}
except NameError:
    INP = {}
P = INP.get('prefix', 'XX')
TAG = INP.get('tag', 'agent')
FT = 1.0 / 0.3048
MODEL_CATS = ['OST_Walls', 'OST_Floors', 'OST_Roofs', 'OST_Ceilings', 'OST_Doors', 'OST_Windows', 'OST_Columns', 'OST_StructuralColumns',
              'OST_StructuralFraming', 'OST_Stairs', 'OST_StairsRailing', 'OST_GenericModel', 'OST_Furniture', 'OST_Casework',
              'OST_LightingFixtures', 'OST_PlumbingFixtures', 'OST_SpecialityEquipment', 'OST_MechanicalEquipment', 'OST_Mass', 'OST_Toposolid',
              'OST_Planting', 'OST_Site', 'OST_CurtainWallPanels']


def name_of(e):
    try:
        return DB.Element.Name.__get__(e) or ''
    except Exception:
        return ''


def pstr(e, bip):
    p = e.get_Parameter(bip)
    return (p.AsString() or '') if p else ''


out = collections.OrderedDict()
elements = []
for n in MODEL_CATS:
    bic = getattr(DB.BuiltInCategory, n, None)
    if bic is None:
        continue
    elements += list(DB.FilteredElementCollector(doc).OfCategory(bic).WhereElementIsNotElementType())
out['elements'] = len(elements)
out['by_category'] = dict(collections.Counter(e.Category.Name if e.Category else '?' for e in elements))

# marks and tags
marks = collections.defaultdict(list)
untagged = collections.Counter()
no_method = collections.Counter()
for e in elements:
    mk = pstr(e, DB.BuiltInParameter.ALL_MODEL_MARK)
    if mk:
        marks[mk].append(int(e.Id.Value))
    if not pstr(e, DB.BuiltInParameter.ALL_MODEL_INSTANCE_COMMENTS).startswith(TAG):
        untagged[e.Category.Name if e.Category else '?'] += 1
    p = e.LookupParameter(P + '_Method')
    if p is None or not p.HasValue or not p.AsString():
        no_method[e.Category.Name if e.Category else '?'] += 1
out['duplicate_marks'] = dict((k, v) for k, v in marks.items() if len(v) > 1)
# building codes: the export sets are chosen by <P>_Building, and an unknown code silently drops the element from the
# viewer (a tag cut at 250 characters once left 'V' / 'LIN'). inputs 'building_codes': ['VIL', ...] flags any other value.
codes = collections.Counter()
bad_code = []
known = set(INP.get('building_codes') or [])
for e in elements:
    p = e.LookupParameter(P + '_Building')
    v = (p.AsString() or '') if p is not None and p.HasValue else ''
    codes[v] += 1
    if known and v not in known:
        bad_code.append([pstr(e, DB.BuiltInParameter.ALL_MODEL_MARK) or int(e.Id.Value), v])
out['building_codes'] = dict(codes)
if known:
    out['building_code_unknown'] = {'count': len(bad_code), 'sample': bad_code[:40]}
out['untagged_by_category'] = dict(untagged)
out['without_method_by_category'] = dict(no_method)

# free wall ends
walls = []
for w in DB.FilteredElementCollector(doc).OfClass(DB.Wall):
    lc = w.Location
    if isinstance(lc, DB.LocationCurve):
        walls.append((w, lc.Curve, w.Width / 2.0))
free = []
for w, c, hw in walls:
    for end in (0, 1):
        p = c.GetEndPoint(end)
        ok = False
        try:
            if w.get_ElementsAtJoin(end).Size > 0:
                ok = True
        except Exception:
            pass
        if not ok:
            for w2, c2, hw2 in walls:
                if w2.Id == w.Id:
                    continue
                z0, z1 = c2.GetEndPoint(0).Z, c2.GetEndPoint(1).Z
                if abs(z0 - p.Z) > 0.5 * FT:
                    continue
                try:
                    q = c2.Project(p)
                except Exception:
                    continue
                if q is not None and q.Distance <= hw2 + 0.03 * FT:
                    ok = True
                    break
                if p.DistanceTo(c2.GetEndPoint(0)) <= 0.05 * FT or p.DistanceTo(c2.GetEndPoint(1)) <= 0.05 * FT:
                    ok = True
                    break
        if not ok:
            free.append([int(w.Id.Value), end, [round(p.X / FT, 3), round(p.Y / FT, 3), round(p.Z / FT, 3)]])
out['free_wall_ends'] = {'count': len(free), 'sample': free[:40]}

# stairs
bad = []
for s in DB.FilteredElementCollector(doc).OfClass(DB.Architecture.Stairs):
    try:
        base = doc.GetElement(s.get_Parameter(DB.BuiltInParameter.STAIRS_BASE_LEVEL_PARAM).AsElementId())
        top = doc.GetElement(s.get_Parameter(DB.BuiltInParameter.STAIRS_TOP_LEVEL_PARAM).AsElementId())
        bo = s.get_Parameter(DB.BuiltInParameter.STAIRS_BASE_OFFSET).AsDouble()
        to = s.get_Parameter(DB.BuiltInParameter.STAIRS_TOP_OFFSET).AsDouble()
        runs = [doc.GetElement(i) for i in s.GetStairsRuns()]
        if not runs:
            bad.append([int(s.Id.Value), 'no runs'])
            continue
        if base is None:
            bad.append([int(s.Id.Value), 'no base level'])
            continue
        # StairsRun.BaseElevation / TopElevation are relative to the stair's base (base level + base offset)
        want_lo = base.Elevation + bo
        lo = want_lo + min(r.BaseElevation for r in runs)
        hi = want_lo + max(r.TopElevation for r in runs)
        want_hi = top.Elevation + to if top is not None else hi
        if abs(lo - want_lo) > 0.02 * FT or abs(hi - want_hi) > 0.02 * FT:
            bad.append([int(s.Id.Value), 'runs %.2f..%.2f vs levels %.2f..%.2f' % (lo / FT, hi / FT, want_lo / FT, want_hi / FT)])
    except Exception as ex:
        bad.append([int(s.Id.Value), str(ex)[:80]])
out['stairs_not_arriving'] = bad

# rooms
zero = []
for r in DB.FilteredElementCollector(doc).OfCategory(DB.BuiltInCategory.OST_Rooms).WhereElementIsNotElementType():
    try:
        if r.Area <= 0:
            zero.append([int(r.Id.Value), pstr(r, DB.BuiltInParameter.ROOM_NUMBER)])
    except Exception:
        pass
out['rooms_without_area'] = zero

# furniture: outside rooms, overlaps (XY boxes per level)
furn = []
for e in DB.FilteredElementCollector(doc).OfCategory(DB.BuiltInCategory.OST_GenericModel).WhereElementIsNotElementType():
    if ':furniture:' not in pstr(e, DB.BuiltInParameter.ALL_MODEL_INSTANCE_COMMENTS):
        continue
    bb = e.get_BoundingBox(None)
    lv = doc.GetElement(e.LevelId)
    if bb is None or lv is None:
        continue
    furn.append((e, bb, lv))
# Furniture, lights, equipment and radiators placed as loadable families
for bic in (DB.BuiltInCategory.OST_Furniture, DB.BuiltInCategory.OST_LightingFixtures, DB.BuiltInCategory.OST_SpecialityEquipment, DB.BuiltInCategory.OST_MechanicalEquipment):
  for e in DB.FilteredElementCollector(doc).OfCategory(bic).WhereElementIsNotElementType():
    bb = e.get_BoundingBox(None)
    lv = doc.GetElement(e.LevelId)
    if bb is not None and lv is not None:
        furn.append((e, bb, lv))
outside = []
for e, bb, lv in furn:
    p = e.Location.Point if isinstance(e.Location, DB.LocationPoint) else None
    if p is None:
        continue
    r = doc.GetRoomAtPoint(DB.XYZ(p.X, p.Y, lv.Elevation + 0.3 * FT))
    if r is None:
        outside.append([int(e.Id.Value), pstr(e, DB.BuiltInParameter.ALL_MODEL_MARK)])
pairs = []
maxp = int(INP.get('max_pairs', 20000))
n = 0
for i in range(len(furn)):
    ei, bi, li = furn[i]
    for j in range(i + 1, len(furn)):
        ej, bj, lj = furn[j]
        if li.Id != lj.Id:
            continue
        n += 1
        if n > maxp:
            break
        ox = min(bi.Max.X, bj.Max.X) - max(bi.Min.X, bj.Min.X)
        oy = min(bi.Max.Y, bj.Max.Y) - max(bi.Min.Y, bj.Min.Y)
        if ox > 0.05 * FT and oy > 0.05 * FT:
            pairs.append([pstr(ei, DB.BuiltInParameter.ALL_MODEL_MARK) or int(ei.Id.Value), pstr(ej, DB.BuiltInParameter.ALL_MODEL_MARK) or int(ej.Id.Value),
                          round(ox / FT, 2), round(oy / FT, 2)])
out['furniture'] = {'count': len(furn), 'outside_rooms': outside[:40], 'overlapping_pairs': pairs[:60], 'pairs_tested': n}

# roof closure (from the Roemerholz package 8, 2026-10-13): rays in the '{3D}' view through a ReferenceIntersector
def _m(v):
    return v / FT


def _ft(v):
    return v * FT


def _mark(e):
    p = e.get_Parameter(DB.BuiltInParameter.ALL_MODEL_MARK)
    s = (p.AsString() if p else '') or ''
    return s if s else str(e.Id.Value)


def _comment(e):
    p = e.get_Parameter(DB.BuiltInParameter.ALL_MODEL_INSTANCE_COMMENTS)
    return (p.AsString() if p else '') or ''


def _view3d(doc):
    vs = [v for v in DB.FilteredElementCollector(doc).OfClass(DB.View3D) if not v.IsTemplate]
    for v in vs:
        if v.Name == '{3D}':
            return v
    return vs[0] if vs else None


def _intersector(doc, cats, view):
    lst = List[DB.BuiltInCategory]()
    for c in cats:
        lst.Add(c)
    ri = DB.ReferenceIntersector(DB.ElementMulticategoryFilter(lst), DB.FindReferenceTarget.Face, view)
    ri.FindReferencesInRevitLinks = False
    return ri


def _hits(doc, ri, origin, direction):
    """{element id: (element, [distances m of every face crossing, sorted])} along the ray"""
    out = {}
    for rwc in ri.Find(origin, direction):
        eid = rwc.GetReference().ElementId
        if eid.Value not in out:
            out[eid.Value] = (doc.GetElement(eid), [])
        out[eid.Value][1].append(_m(rwc.Proximity))
    for k in out:
        out[k][1].sort()
    return out


def _cat(e):
    return e.Category.Id.Value if e is not None and e.Category is not None else None


def _model_top(doc):
    zmax = -1e9
    for c in (DB.BuiltInCategory.OST_Roofs, DB.BuiltInCategory.OST_Walls):
        for e in DB.FilteredElementCollector(doc).OfCategory(c).WhereElementIsNotElementType():
            bb = e.get_BoundingBox(None)
            if bb is not None:
                zmax = max(zmax, bb.Max.Z)
    return zmax


def open_to_sky(doc, tag='agent', grid=1.0, skip_departments=('exterior',), sky_grid=1.0, max_rows=60, well_rise=1.2, well_reach=8.0):
    view = _view3d(doc)
    out = collections.OrderedDict()
    if view is None:
        out['error'] = 'no 3D view'
        return out
    # 1. rooms: rays up
    # sloped glazing (skylights, glass housings) closes a room: its panels are curtain panels, not roof faces
    # the terrain (toposolid) closes an underground room
    ri_up = _intersector(doc, [DB.BuiltInCategory.OST_Roofs, DB.BuiltInCategory.OST_Floors, DB.BuiltInCategory.OST_CurtainWallPanels,
                               DB.BuiltInCategory.OST_Toposolid], view)
    ri_roof = _intersector(doc, [DB.BuiltInCategory.OST_Roofs], view)
    rows = []
    n_rooms = 0
    above_roof = 0
    for r in DB.FilteredElementCollector(doc).OfCategory(DB.BuiltInCategory.OST_Rooms).WhereElementIsNotElementType():
        if not _comment(r).startswith(tag) or r.Area <= 0:
            continue
        dep = r.get_Parameter(DB.BuiltInParameter.ROOM_DEPARTMENT)
        dep = (dep.AsString() if dep else '') or ''
        if any(s in dep for s in skip_departments):
            continue
        n_rooms += 1
        lvl = doc.GetElement(r.LevelId)
        ch = lvl.get_Parameter(DB.BuiltInParameter.LEVEL_ROOM_COMPUTATION_HEIGHT)
        z = lvl.Elevation + (ch.AsDouble() if ch else 0.0) + _ft(0.5)
        bb = r.get_BoundingBox(None)
        if bb is None:
            continue
        g = _ft(grid)
        nx = max(1, int((bb.Max.X - bb.Min.X) / g))
        ny = max(1, int((bb.Max.Y - bb.Min.Y) / g))
        tot, open_, ex = 0, 0, None
        for i in range(nx + 1):
            for j in range(ny + 1):
                p = DB.XYZ(bb.Min.X + (i + 0.5) * (bb.Max.X - bb.Min.X) / (nx + 1), bb.Min.Y + (j + 0.5) * (bb.Max.Y - bb.Min.Y) / (ny + 1), z)
                if not r.IsPointInRoom(p):
                    continue
                tot += 1
                if ri_up.FindNearest(p, DB.XYZ.BasisZ) is None:
                    # a point at the room's edge under a low roof can lie above that roof (outside): not an opening
                    hr = ri_roof.FindNearest(p, DB.XYZ.BasisZ.Negate())
                    if hr is not None and hr.Proximity < p.Z - lvl.Elevation:
                        above_roof += 1
                        continue
                    open_ += 1
                    if ex is None:
                        ex = [round(_m(p.X), 2), round(_m(p.Y), 2), round(_m(p.Z), 2)]
        if open_:
            num = r.get_Parameter(DB.BuiltInParameter.ROOM_NUMBER)
            rows.append([(num.AsString() if num else '') or '', (r.get_Parameter(DB.BuiltInParameter.ROOM_NAME).AsString() or ''),
                         lvl.Name, open_, tot, ex, int(r.Id.Value)])
    out['rooms_checked'] = n_rooms
    out['rooms_open'] = len(rows)
    out['rooms_open_rows'] = sorted(rows, key=lambda x: -x[3])[:max_rows]
    out['room_points_above_a_roof'] = above_roof            # room edge under a sloped roof: the probe point is outside
    # 2. the sky view: rays down
    cats = [DB.BuiltInCategory.OST_Roofs, DB.BuiltInCategory.OST_Floors, DB.BuiltInCategory.OST_Ceilings, DB.BuiltInCategory.OST_Walls,
            DB.BuiltInCategory.OST_Stairs, DB.BuiltInCategory.OST_StairsRailing, DB.BuiltInCategory.OST_GenericModel,
            DB.BuiltInCategory.OST_Furniture, DB.BuiltInCategory.OST_LightingFixtures, DB.BuiltInCategory.OST_CurtainWallPanels,
            DB.BuiltInCategory.OST_CurtainWallMullions, DB.BuiltInCategory.OST_Toposolid]
    ri_dn = _intersector(doc, cats, view)
    # 3. wells: where the sky sees a roof or a floor, horizontal rays at that surface + well_rise in +-X / +-Y: when all four
    #    meet a wall first (roofs and floors also stop a ray) within well_reach, the surface lies at the bottom of a box open
    #    to the sky (walls rising more than well_rise above it on every side): an open parapet box or a missing roof slab
    ri_h = _intersector(doc, [DB.BuiltInCategory.OST_Walls, DB.BuiltInCategory.OST_Roofs, DB.BuiltInCategory.OST_Floors], view)
    wall_cat = int(DB.BuiltInCategory.OST_Walls)
    wells = collections.defaultdict(list)
    walls = [w for w in DB.FilteredElementCollector(doc).OfCategory(DB.BuiltInCategory.OST_Walls).WhereElementIsNotElementType()
             if _comment(w).startswith(tag)]
    if not walls:
        return out
    bbs = [w.get_BoundingBox(None) for w in walls]
    x0, y0 = min(b.Min.X for b in bbs if b), min(b.Min.Y for b in bbs if b)
    x1, y1 = max(b.Max.X for b in bbs if b), max(b.Max.Y for b in bbs if b)
    ztop = _model_top(doc) + _ft(5.0)
    g = _ft(sky_grid)
    seen = collections.Counter()
    bad = collections.defaultdict(list)
    slabs = collections.Counter()
    ix = int((x1 - x0) / g) + 1
    iy = int((y1 - y0) / g) + 1
    for i in range(ix):
        for j in range(iy):
            o = DB.XYZ(x0 + (i + 0.37) * g, y0 + (j + 0.37) * g, ztop)
            h = ri_dn.FindNearest(o, DB.XYZ.BasisZ.Negate())
            if h is None:
                continue
            e = doc.GetElement(h.GetReference().ElementId)
            c = _cat(e)
            cname = e.Category.Name if e.Category else '?'
            seen[cname] += 1
            cm = _comment(e)
            interior = False
            if ':site:' in cm or '-site-' in _mark(e):
                pass                                      # garden stairs, terrace furniture, paving: outdoors
            elif c == int(DB.BuiltInCategory.OST_Ceilings):
                interior = True
            elif c in (int(DB.BuiltInCategory.OST_Stairs), int(DB.BuiltInCategory.OST_Furniture), int(DB.BuiltInCategory.OST_LightingFixtures)):
                interior = cm.startswith(tag)
            elif c == int(DB.BuiltInCategory.OST_GenericModel):
                interior = ':interior:' in cm
            elif c == int(DB.BuiltInCategory.OST_Floors) and ':fabric:floor' in cm:
                # a slab seen from the sky is a terrace or roof slab unless a room stands on it (a room open to the sky)
                zf = ztop - h.Proximity
                rm = doc.GetRoomAtPoint(DB.XYZ(o.X, o.Y, zf + _ft(0.5)))
                interior = rm is not None
                if not interior:
                    slabs[_mark(e)] += 1
            if interior:
                zhit = _m(ztop - h.Proximity)
                bad[_mark(e)].append([round(_m(o.X), 2), round(_m(o.Y), 2), round(zhit, 2)])
            elif c in (int(DB.BuiltInCategory.OST_Roofs), int(DB.BuiltInCategory.OST_Floors)) and well_reach > 0:
                zh = ztop - h.Proximity
                q = DB.XYZ(o.X, o.Y, zh + _ft(well_rise))
                ws_ = []
                for d in (DB.XYZ.BasisX, DB.XYZ.BasisX.Negate(), DB.XYZ.BasisY, DB.XYZ.BasisY.Negate()):
                    hh = ri_h.FindNearest(q, d)
                    if hh is None or _m(hh.Proximity) > well_reach:
                        break
                    we = doc.GetElement(hh.GetReference().ElementId)
                    if _cat(we) != wall_cat:
                        break
                    ws_.append(_mark(we))
                if len(ws_) == 4:
                    wells[_mark(e)].append([round(_m(o.X), 2), round(_m(o.Y), 2), round(_m(zh), 2), ws_])
    out['sky_samples_by_first_hit'] = dict(seen)
    out['slabs_seen_from_sky_without_room'] = dict(slabs.most_common(max_rows))     # terraces, roof slabs, wells: review
    out['wells'] = collections.OrderedDict(
        (k, {'points': len(v), 'example': v[0][:3], 'walls': sorted(set(x for p in v for x in p[3]))[:12]})
        for k, v in sorted(wells.items(), key=lambda kv: -len(kv[1]))[:max_rows])
    out['well_points'] = sum(len(v) for v in wells.values())
    out['interior_seen_from_sky'] = collections.OrderedDict(
        (k, {'points': len(v), 'example': v[0]}) for k, v in sorted(bad.items(), key=lambda kv: -len(kv[1]))[:max_rows])
    out['interior_seen_points'] = sum(len(v) for v in bad.values())
    return out


def through_roof(doc, tag='agent', step=0.5, tol=0.01, band=3.0, max_rows=80, cover_tol=0.05):
    view = _view3d(doc)
    out = collections.OrderedDict()
    if view is None:
        out['error'] = 'no 3D view'
        return out
    cats = [DB.BuiltInCategory.OST_Roofs, DB.BuiltInCategory.OST_Ceilings, DB.BuiltInCategory.OST_Floors, DB.BuiltInCategory.OST_GenericModel,
            DB.BuiltInCategory.OST_Walls]
    ri = _intersector(doc, cats, view)
    roof_cat = int(DB.BuiltInCategory.OST_Roofs)
    wall_cat = int(DB.BuiltInCategory.OST_Walls)
    ztop = _model_top(doc) + _ft(5.0)
    elems = []
    for c in (DB.BuiltInCategory.OST_Ceilings, DB.BuiltInCategory.OST_Floors, DB.BuiltInCategory.OST_GenericModel):
        for e in DB.FilteredElementCollector(doc).OfCategory(c).WhereElementIsNotElementType():
            cm = _comment(e)
            if not cm.startswith(tag):
                continue
            if c == DB.BuiltInCategory.OST_GenericModel and not (':ceiling|' in cm or ':vault|' in cm):
                continue
            elems.append(e)
    rows = []
    checked = 0
    for e in elems:
        bb = e.get_BoundingBox(None)
        if bb is None:
            continue
        checked += 1
        g = _ft(step)
        nx = max(1, int((bb.Max.X - bb.Min.X) / g))
        ny = max(1, int((bb.Max.Y - bb.Min.Y) / g))
        n_above, worst, ex = 0, 0.0, None
        for i in range(nx + 1):
            for j in range(ny + 1):
                o = DB.XYZ(bb.Min.X + (i + 0.5) * (bb.Max.X - bb.Min.X) / (nx + 1), bb.Min.Y + (j + 0.5) * (bb.Max.Y - bb.Min.Y) / (ny + 1), ztop)
                hs = _hits(doc, ri, o, DB.XYZ.BasisZ.Negate())
                if e.Id.Value not in hs:
                    continue
                d_e = hs[e.Id.Value][1][0]                      # the element's top at this point
                # roofs whose underside lies below the element's top (within `band` m): the element rises above that roof's
                # underside here (inside the roof body or out through it)
                dz_best = None
                # inside the envelope here: a roof whose underside lies above the element top (or at most cover_tol below it: a
                # touching edge), or a wall standing above it (a chimney stack through the roof)
                covered = any((_cat(x) == roof_cat and ds[-1] < d_e + cover_tol) or (_cat(x) == wall_cat and ds[0] < d_e - tol)
                              for x, ds in hs.values())
                if covered:
                    continue
                for x, ds in hs.values():
                    if _cat(x) != roof_cat:
                        continue
                    d_bot = ds[-1]
                    if d_e + tol < d_bot < d_e + band:
                        dz = d_bot - d_e
                        if dz_best is None or dz > dz_best:
                            dz_best = dz
                if dz_best is not None:
                    n_above += 1
                    if dz_best > worst:
                        worst = dz_best
                        ex = [round(_m(o.X), 2), round(_m(o.Y), 2), round(_m(ztop) - d_e, 2)]
        if n_above:
            rows.append([_mark(e), e.Category.Name if e.Category else '?', n_above, round(worst, 3), ex])
    out['elements_checked'] = checked
    out['elements_above_a_roof'] = len(rows)
    out['points_above_a_roof'] = sum(r[2] for r in rows)
    out['rows'] = sorted(rows, key=lambda r: -r[2])[:max_rows]
    return out


if INP.get('roof_checks', True):
    out['open_to_sky'] = open_to_sky(doc, tag=TAG)
    out['through_roof'] = through_roof(doc, tag=TAG, step=float(INP.get('roof_step', 1.0)))
out['warnings'] = len(doc.GetWarnings())
result = out
