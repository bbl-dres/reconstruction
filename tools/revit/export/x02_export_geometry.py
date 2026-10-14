# Revit viewer export, step 2: triangulated geometry out of Revit through CustomExporter / IExportContext (tools/revit/export).
# IronPython 2.7, run through the pyRevit agent (run_query: read-only for the model; writes files only).
# inputs: config (export_config.json), view (3D view name), set ('building' | 'surroundings'), out (folder), lod (ViewNode.LevelOfDetail, -1 = Revit default),
#         probe (True = count only, write nothing), limit_s (soft deadline for IsCanceled).
# Output (raw Revit internal frame, feet, Z up; converted to metres / glTF Y-up by x10_build_glb.py):
#   <set>.geom.bin   records: <iiiiii> geomIndex, matIndex, nPoints, nFacets, nNormals, distribution
#                    + nPoints*3 float32 + nNormals*3 float32 + nFacets*3 int32
#   <set>.export.json geometry keys, materials, placements (element -> geometry key + transform), membership, counters
# Shared symbol geometry (same SymbolGeometryId) is captured once in symbol space and placed by its instance transform,
# so repeated family types stay linked meshes in the GLB. Element-specific geometry is written in world coordinates.
from pyrevit.api import DB
import System, struct, json, os, time, collections


def _jd(o):
    """JSON fallback for .NET values (Int64 ids, enums, strings)."""
    try:
        return int(o)
    except Exception:
        return str(o)


VIEW = inputs.get('view')
SET = inputs.get('set')
OUT = inputs.get('out')
LOD = int(inputs.get('lod', -1))
PROBE = bool(inputs.get('probe', False))
LIMIT_S = float(inputs.get('limit_s', 3000))
SHARE = bool(inputs.get('share', True))
DEEP = bool(inputs.get('deep', False))   # also share nested instances (balusters inside railings)

# ---- building configuration (export_config.json next to the building's build/export; see export_config.example.json)
with open(inputs['config']) as _fh:
    CFG = json.load(_fh)
P = CFG.get('prefix', 'XX') + '_'
PRES_PREFIX = CFG.get('presentationTagPrefix') or '\x00none'
SET_OF = dict((k, v['set']) for k, v in CFG['buildingCodes'].items())
INTERIOR_TAG = CFG.get('interiorTagPrefix')
EXCLUDE_CATS = set(['Rooms', 'Areas', 'Lines', 'Cameras', 'Shaft Openings', 'Detail Items', 'Sun Path'])

view = None
for v in DB.FilteredElementCollector(doc).OfClass(DB.View3D):
    if not v.IsTemplate and v.Name == VIEW:
        view = v
if view is None:
    raise Exception('view not found: %s' % VIEW)

_cls = {}


def _str(e, name):
    p = e.LookupParameter(name)
    if p is None:
        return None
    s = p.AsString()
    return s if s else None


def classify(e, depth=0):
    """-> (set, reason). Presentation families and presentation-tagged elements are excluded."""
    if e is None:
        return ('unresolved', 'no element')
    k = int(e.Id.Value)
    if k in _cls:
        return _cls[k]
    r = None
    c = e.get_Parameter(DB.BuiltInParameter.ALL_MODEL_INSTANCE_COMMENTS)
    cs = c.AsString() if c else None
    cat = e.Category.Name if e.Category else ''
    if cs and cs.startswith(PRES_PREFIX):
        r = ('exclude', 'presentation comment')
    elif cat in EXCLUDE_CATS:
        r = ('exclude', 'category %s' % cat)
    else:
        b = _str(e, P + 'Building')
        if b:
            r = (SET_OF.get(b, 'unresolved'), P + 'Building=%s' % b)
    if r is None and depth < 6:
        hosts = []
        for attr in ('SuperComponent', 'Host'):
            try:
                h = getattr(e, attr)
                if h is not None:
                    hosts.append(h)
            except Exception:
                pass
        for attr in ('HostRailingId', 'HostId'):
            try:
                hid = getattr(e, attr)
                if hid is not None and hid.Value > 0:
                    hosts.append(doc.GetElement(hid))
            except Exception:
                pass
        for h in hosts:
            hr = classify(h, depth + 1)
            if hr[0] != 'unresolved':
                r = (hr[0], 'host %d (%s)' % (int(h.Id.Value), hr[1]))
                break
    if r is None and cs and INTERIOR_TAG and cs.startswith(INTERIOR_TAG):
        r = ('building', 'interior tag (%s)' % INTERIOR_TAG)
    if r is None:
        r = ('unresolved', 'no %sBuilding, no host' % P)
    _cls[k] = r
    return r


def tf_list(t):
    o, x, y, z = t.Origin, t.BasisX, t.BasisY, t.BasisZ
    return [x.X, x.Y, x.Z, y.X, y.Y, y.Z, z.X, z.Y, z.Z, o.X, o.Y, o.Z]


def det(t):
    x, y, z = t.BasisX, t.BasisY, t.BasisZ
    return x.X * (y.Y * z.Z - y.Z * z.Y) - x.Y * (y.X * z.Z - y.Z * z.X) + x.Z * (y.X * z.Y - y.Y * z.X)


RN = DB.RenderNodeAction


class Ctx(DB.IExportContext):
    def __init__(self):
        self.t0 = time.time()
        self.tstack = [DB.Transform.Identity]
        self.elem = None
        self.elem_base = 0
        self.capture = None          # (symbol key, depth, inverse world transform)
        self.mat = -1
        self.mats = []               # material records
        self.mat_index = {}
        self.geoms = []              # geometry keys
        self.geom_index = {}
        self.placements = []         # [elementId, geomKey, transform12 or None, mirrored]
        self.symbols = set()
        self.members = collections.Counter()
        self.skipped = collections.Counter()
        self.unresolved = []
        self.exported = []
        self.n_poly = 0
        self.n_tri = 0
        self.n_pts = 0
        self.n_rpc = 0
        self.rpc_elems = []
        self.inst_begin = 0
        self.inst_end = 0
        self.inst_skip = 0
        self.f = None
        self.cancel = False

    def Start(self):
        if not PROBE:
            self.f = open(os.path.join(OUT, SET + '.geom.bin'), 'wb')
        return True

    def Finish(self):
        if self.f:
            self.f.close()
            self.f = None

    def IsCanceled(self):
        if time.time() - self.t0 > LIMIT_S:
            self.cancel = True
        return self.cancel

    def OnViewBegin(self, node):
        if LOD >= 0:
            node.LevelOfDetail = LOD
        return RN.Proceed

    def OnViewEnd(self, eid):
        pass

    def OnElementBegin(self, eid):
        e = doc.GetElement(eid)
        s, why = classify(e)
        if s != SET:
            self.skipped[s] += 1
            if s == 'unresolved':
                self.unresolved.append([int(eid.Value), e.Category.Name if e and e.Category else None, why])
            return RN.Skip
        self.members[why.split(' ')[0] if why.startswith('host') else why] += 1
        self.elem = int(eid.Value)
        self.elem_base = len(self.tstack)
        self.exported.append(int(eid.Value))
        return RN.Proceed

    def OnElementEnd(self, eid):
        self.elem = None

    def OnInstanceBegin(self, node):
        self.inst_begin += 1
        world = self.tstack[-1].Multiply(node.GetTransform())
        if SHARE and self.elem is not None and self.capture is None and (DEEP or len(self.tstack) == self.elem_base):
            key = None
            try:
                key = 's' + node.GetSymbolGeometryId().AsUniqueIdentifier()
            except Exception:
                key = None
            if key is not None:
                self.placements.append([self.elem, key, tf_list(world), det(world) < 0])
                if key in self.symbols:
                    self.inst_skip += 1
                    self.tstack.append(world)
                    return RN.Skip
                self.symbols.add(key)
                self.capture = (key, len(self.tstack) + 1, world.Inverse)
        self.tstack.append(world)
        return RN.Proceed

    def OnInstanceEnd(self, node):
        self.inst_end += 1
        if self.capture is not None and len(self.tstack) == self.capture[1]:
            self.capture = None
        self.tstack.pop()

    def OnLinkBegin(self, node):
        self.tstack.append(self.tstack[-1].Multiply(node.GetTransform()))
        return RN.Proceed

    def OnLinkEnd(self, node):
        self.tstack.pop()

    def OnFaceBegin(self, node):
        return RN.Proceed

    def OnFaceEnd(self, node):
        pass

    def OnRPC(self, node):
        self.n_rpc += 1
        if self.elem is not None and len(self.rpc_elems) < 200:
            self.rpc_elems.append(self.elem)

    def OnLight(self, node):
        pass

    def OnMaterial(self, node):
        c = node.Color
        rgb = (int(c.Red), int(c.Green), int(c.Blue)) if c.IsValid else (180, 180, 180)
        key = (int(node.MaterialId.Value), rgb, round(node.Transparency, 3))
        i = self.mat_index.get(key)
        if i is None:
            i = len(self.mats)
            self.mat_index[key] = i
            m = doc.GetElement(node.MaterialId) if node.MaterialId.Value > 0 else None
            self.mats.append({'materialId': int(node.MaterialId.Value), 'name': m.Name if m else '<no material>',
                              'class': (str(m.MaterialClass) if m else None), 'rgb': list(rgb),
                              'transparency': float(node.Transparency), 'glossiness': int(node.Glossiness),
                              'smoothness': int(node.Smoothness)})
        self.mat = i

    def OnPolymesh(self, poly):
        if self.elem is None:
            return
        if self.capture is not None:
            gkey = self.capture[0]
            t = self.capture[2].Multiply(self.tstack[-1])
        else:
            gkey = 'e%d' % self.elem
            t = self.tstack[-1]
        gi = self.geom_index.get(gkey)
        if gi is None:
            gi = len(self.geoms)
            self.geom_index[gkey] = gi
            self.geoms.append(gkey)
            if gkey[0] == 'e':
                self.placements.append([self.elem, gkey, None, False])
        npts = poly.NumberOfPoints
        nf = poly.NumberOfFacets
        nn = poly.NumberOfNormals
        self.n_poly += 1
        self.n_tri += nf
        self.n_pts += npts
        if PROBE:
            return
        ident = t.IsIdentity
        flip = det(t) < 0
        vals = []
        ext = vals.extend
        if ident:
            for p in poly.GetPoints():
                ext((p.X, p.Y, p.Z))
        else:
            for p in poly.GetPoints():
                q = t.OfPoint(p)
                ext((q.X, q.Y, q.Z))
        nvals = []
        next_ = nvals.extend
        if ident:
            for n in poly.GetNormals():
                next_((n.X, n.Y, n.Z))
        else:
            for n in poly.GetNormals():
                q = t.OfVector(n)
                next_((q.X, q.Y, q.Z))
        ivals = []
        iext = ivals.extend
        if flip:
            for fc in poly.GetFacets():
                iext((fc.V1, fc.V3, fc.V2))
        else:
            for fc in poly.GetFacets():
                iext((fc.V1, fc.V2, fc.V3))
        dist = int(poly.DistributionOfNormals)
        w = self.f.write
        w(struct.pack('<iiiiii', gi, self.mat, npts, nf, len(nvals) // 3, dist))
        w(struct.pack('<%df' % len(vals), *vals))
        if nvals:
            w(struct.pack('<%df' % len(nvals), *nvals))
        w(struct.pack('<%di' % len(ivals), *ivals))


ctx = Ctx()
exporter = DB.CustomExporter(doc, ctx)
exporter.IncludeGeometricObjects = False
exporter.ShouldStopOnError = False
t0 = time.time()
try:
    exporter.Export(view)
finally:
    ctx.Finish()
elapsed = time.time() - t0
summary = {
    'view': VIEW, 'viewId': int(view.Id.Value), 'set': SET, 'lod': LOD, 'probe': PROBE, 'share': SHARE, 'deep': DEEP, 'elapsed_s': round(elapsed, 1),
    'canceled': ctx.cancel, 'elements': len(ctx.exported), 'polymeshes': ctx.n_poly, 'triangles': ctx.n_tri,
    'points': ctx.n_pts, 'materials': len(ctx.mats), 'geometries': len(ctx.geoms), 'placements': len(ctx.placements),
    'symbols': len(ctx.symbols), 'instanceBegin': ctx.inst_begin, 'instanceEnd': ctx.inst_end, 'instanceSkipped': ctx.inst_skip,
    'rpc': ctx.n_rpc, 'rpcElements': sorted(set(int(x) for x in ctx.rpc_elems)), 'skipped': dict(ctx.skipped), 'membership': dict(ctx.members),
    'unresolved': ctx.unresolved[:200],
}
if not PROBE:
    with open(os.path.join(OUT, SET + '.export.json'), 'w') as fh:
        json.dump({'summary': summary, 'geoms': ctx.geoms, 'materials': ctx.mats, 'placements': ctx.placements,
                   'exported': ctx.exported}, fh, default=_jd)
result = summary
