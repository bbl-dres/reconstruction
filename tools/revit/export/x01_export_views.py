# Revit viewer export, step 1 (tools/revit/export): the two export views and their filters, from export_config.json.
# Views and view filters only; no model geometry is created, moved or deleted. Re-runnable (finds by name).
# IronPython 2.7 (pyRevit run_modify, dry run first). inputs: {'config': '<path to export_config.json>'}
#   views.building      3D view that shows the building set   (filter hides every other <P>_Building code and the presentation tag)
#   views.surroundings  3D view that shows the surroundings set (filter hides the building codes and the presentation tag)
from pyrevit.api import DB
import System, json
from System.Collections.Generic import List

with open(inputs['config']) as _fh:
    CFG = json.load(_fh)
P = CFG.get('prefix', 'XX') + '_'
VIEW_B = CFG['views']['building']
VIEW_S = CFG['views']['surroundings']
F_NOT_B = P + 'Export - not building'
F_NOT_S = P + 'Export - not surroundings'
F_PRES = P + 'Export - presentation'
PRES = CFG.get('presentationTagPrefix')
B_CODES = [k for k, v in CFG['buildingCodes'].items() if v['set'] == 'building']
S_CODES = [k for k, v in CFG['buildingCodes'].items() if v['set'] == 'surroundings']
log = []


def param_id(name):
    for b in DB.FilteredElementCollector(doc).OfClass(DB.SharedParameterElement):
        if b.Name == name:
            return b.Id
    raise Exception('shared parameter not found: ' + name)


PID = param_id(P + 'Building')
COMMENTS = DB.ElementId(DB.BuiltInParameter.ALL_MODEL_INSTANCE_COMMENTS)


def filter_categories(pid):
    ids = []
    for c in doc.Settings.Categories:
        if c.CategoryType != DB.CategoryType.Model:
            continue
        one = List[DB.ElementId]([c.Id])
        try:
            common = DB.ParameterFilterUtilities.GetFilterableParametersInCommon(doc, one)
        except Exception:
            continue
        if any(x.Value == pid.Value for x in common):
            ids.append(c.Id)
    # Sub-categories (Runs, Landings, Wall Sweeps, Sub-divisions ...) are not in doc.Settings.Categories: add the ones
    # the configuration names so that their elements follow the filters too.
    for n in CFG.get('extraFilterCategories', ['OST_StairsRuns', 'OST_StairsLandings', 'OST_Cornices', 'OST_ToposolidSubdivisions', 'OST_StairsRailingBaluster', 'OST_StairsRailingRail']):
        bic = getattr(DB.BuiltInCategory, n, None)
        if bic is None:
            continue
        cid = DB.ElementId(bic)
        if all(cid.Value != x.Value for x in ids):
            try:
                one = List[DB.ElementId]([cid])
                common = DB.ParameterFilterUtilities.GetFilterableParametersInCommon(doc, one)
                if any(x.Value == pid.Value for x in common):
                    ids.append(cid)
            except Exception:
                pass
    return List[DB.ElementId](ids)


def find_filter(name):
    for f in DB.FilteredElementCollector(doc).OfClass(DB.ParameterFilterElement):
        if f.Name == name:
            return f
    return None


def or_filter(pid, values):
    fs = List[DB.ElementFilter]([DB.ElementParameterFilter(DB.ParameterFilterRuleFactory.CreateEqualsRule(pid, v)) for v in values])
    return DB.LogicalOrFilter(fs)


def ensure_filter(name, cats, efilter):
    f = find_filter(name)
    if f is None:
        f = DB.ParameterFilterElement.Create(doc, name, cats, efilter)
        log.append('created filter %s (%d categories)' % (name, cats.Count))
    else:
        f.SetCategories(cats)
        f.SetElementFilter(efilter)
        log.append('updated filter %s (%d categories)' % (name, cats.Count))
    return f


def find_view(name):
    for v in DB.FilteredElementCollector(doc).OfClass(DB.View3D):
        if not v.IsTemplate and v.Name == name:
            return v
    return None


def ensure_view(name, vft):
    v = find_view(name)
    if v is None:
        v = DB.View3D.CreateIsometric(doc, vft.Id)
        v.Name = name
        log.append('created view %s' % name)
    else:
        log.append('reused view %s' % name)
    v.ViewTemplateId = DB.ElementId.InvalidElementId
    v.DetailLevel = DB.ViewDetailLevel.Fine
    v.DisplayStyle = DB.DisplayStyle.ShadingWithEdges
    v.IsSectionBoxActive = False
    try:
        v.CropBoxActive = False
    except Exception:
        pass
    pf = v.get_Parameter(DB.BuiltInParameter.VIEW_PHASE_FILTER)
    for e in DB.FilteredElementCollector(doc).OfClass(DB.PhaseFilter):
        if e.Name == 'Show Complete' and pf and not pf.IsReadOnly:
            pf.Set(e.Id)
    hide_bic = ['OST_Rooms', 'OST_Areas', 'OST_Lines', 'OST_RoomSeparationLines', 'OST_AreaSchemeLines',
                'OST_Cameras', 'OST_SunPath', 'OST_DetailComponents', 'OST_ShaftOpening', 'OST_MEPSpaces',
                'OST_PointClouds', 'OST_RvtLinks', 'OST_SectionBox', 'OST_Levels', 'OST_Grids',
                'OST_ReferencePoints', 'OST_ReferenceLines', 'OST_CLines', 'OST_VolumeOfInterest', 'OST_IOSModelGroups']
    hidden = []
    for c in doc.Settings.Categories:
        try:
            if not v.CanCategoryBeHidden(c.Id):
                continue
        except Exception:
            continue
        hide = c.CategoryType in (DB.CategoryType.Annotation, DB.CategoryType.AnalyticalModel)
        bic = str(System.Enum.ToObject(DB.BuiltInCategory, c.Id.Value)) if c.Id.Value < 0 else ''
        if bic in hide_bic:
            hide = True
        if c.CategoryType == DB.CategoryType.Model and bic not in hide_bic:
            hide = False
        try:
            v.SetCategoryHidden(c.Id, hide)
            if hide:
                hidden.append(c.Name)
        except Exception:
            pass
    return v, hidden


vft = [t for t in DB.FilteredElementCollector(doc).OfClass(DB.ViewFamilyType) if t.ViewFamily == DB.ViewFamily.ThreeDimensional][0]
cats = filter_categories(PID)
t = DB.Transaction(doc, P + 'Export views')
t.Start()
f_not_b = ensure_filter(F_NOT_B, cats, or_filter(PID, S_CODES + ['PRES']))
f_not_s = ensure_filter(F_NOT_S, cats, or_filter(PID, B_CODES + ['PRES']))
filters_b, filters_s = [f_not_b], [f_not_s]
if PRES:
    f_pres = ensure_filter(F_PRES, filter_categories(COMMENTS), DB.ElementParameterFilter(DB.ParameterFilterRuleFactory.CreateBeginsWithRule(COMMENTS, PRES)))
    filters_b.append(f_pres)
    filters_s.append(f_pres)
vb, hb = ensure_view(VIEW_B, vft)
vs, hs = ensure_view(VIEW_S, vft)
for v, fl in ((vb, filters_b), (vs, filters_s)):
    existing = [x.Value for x in v.GetFilters()]
    for x in list(v.GetFilters()):
        if x.Value not in [f.Id.Value for f in fl]:
            v.RemoveFilter(x)
    for f in fl:
        if f.Id.Value not in existing:
            v.AddFilter(f.Id)
        v.SetFilterVisibility(f.Id, False)
t.Commit()
result = {'log': log, 'views': {VIEW_B: vb.Id.Value, VIEW_S: vs.Id.Value},
          'filter_categories': sorted([DB.Category.GetCategory(doc, c).Name for c in cats if DB.Category.GetCategory(doc, c) is not None]),
          'hidden_categories_building_view': sorted(hb)[:200]}
