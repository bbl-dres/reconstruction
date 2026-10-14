"""Revit viewer export, step 10 (CPython): raw Revit export -> GLB + report (tools/revit/export; configured by export_config.json).

Reads raw/<set>.geom.bin, raw/<set>.export.json, raw/<set>.meta.json written by x02/x03 inside Revit.
Writes stage/<set>-<source12>-<glb12>.glb, its .report.json and, for the building, stage/bim.json.

Frames: Revit internal coordinates (feet, Z up) -> metres, glTF Y up: (X, Y, Z) -> (X, Z, -Y) * 0.3048.
Shared symbol geometry is stored once in symbol space; each placement is a glTF node with the instance matrix.
One node per (element, placement, material): every node has exactly one primitive, so the viewer's
whole-product registry can own every component without merging transparent and opaque primitives.
"""
import argparse
import hashlib
import json
import math
import re
import struct
import sys
from collections import Counter, OrderedDict, defaultdict
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
EXPORT = None
FT = 0.3048
C = np.array([[1.0, 0, 0], [0, 0, 1.0], [0, -1.0, 0]])   # Revit (X, Y, Z) -> glTF (x, y, z) = (X, Z, -Y)
CFG, MODEL_ID, NAMESPACE, PFX, IDP = {}, None, None, 'XX_', 'xx'
STOREYS, STOREY_IDS, ELEVS, BUILDING_IDS, BUILDING_NAMES = OrderedDict(), [], [], {}, {}


def configure(path):
    """Load export_config.json (next to the building's build/export); sets the module constants."""
    global CFG, EXPORT, MODEL_ID, NAMESPACE, PFX, IDP, STOREYS, STOREY_IDS, ELEVS, BUILDING_IDS, BUILDING_NAMES
    path = Path(path).resolve()
    CFG = json.loads(path.read_text(encoding='utf-8'))
    EXPORT = path.parent
    MODEL_ID = CFG['modelId']
    NAMESPACE = CFG['namespace']
    PFX = CFG.get('prefix', 'XX') + '_'
    IDP = CFG.get('prefix', 'XX').lower()
    STOREYS = OrderedDict((k, v) for k, v in CFG['storeys'].items())
    STOREY_IDS = list(STOREYS)
    ELEVS = [STOREYS[s]['elevation'] for s in STOREY_IDS]
    BUILDING_IDS = dict((k, v['id']) for k, v in CFG['buildingCodes'].items())
    BUILDING_NAMES = dict((k, v['name']) for k, v in CFG['buildingCodes'].items())
    return CFG


# Storeys, building codes and names come from the configuration (configure()); the villa values were:
_EXAMPLE_ = '''

# Viewer storeys of the villa (Revit levels, model frame P3 = 0.00). Slices follow the v013 convention
# (0.65 m below the finished floor, about 0.4 m below the next floor).
STOREYS = OrderedDict([
    ('p1', {'label': 'Piano 1 · Interrato', 'elevation': -7.55, 'min': -8.5, 'max': -4.26}),
    ('p2', {'label': 'Piano 2 · Seminterrato', 'elevation': -4.0, 'min': -4.65, 'max': -0.31}),
    ('p3', {'label': 'Piano 3 · Rialzato', 'elevation': 0.0, 'min': -0.65, 'max': 5.31}),
    ('p4', {'label': 'Piano 4 · Primo', 'elevation': 5.72, 'min': 5.07, 'max': 10.51}),
    ('p5', {'label': 'Piano 5 · Secondo', 'elevation': 11.12, 'min': 10.47, 'max': 15.06}),
    ('p6', {'label': 'Piano 6 · Torretta inferiore', 'elevation': 15.32, 'min': 14.67, 'max': 17.87}),
    ('p7', {'label': 'Piano 7 · Torretta superiore', 'elevation': 18.16, 'min': 17.51, 'max': 26.4}),
])
STOREY_IDS = list(STOREYS)
ELEVS = [STOREYS[s]['elevation'] for s in STOREY_IDS]

BUILDING_IDS = {'VIL': 'villa-maraini', 'POR': 'villa-maraini-portineria', 'DEP': 'villa-maraini-dependance',
                'GATE': 'villa-maraini-gate', 'SITE': 'villa-maraini-site', 'CTX': 'villa-maraini-context'}
BUILDING_NAMES = {'VIL': 'Villa', 'POR': 'Portineria', 'DEP': 'Dependance', 'GATE': 'Street gate',
                  'SITE': 'Site and garden', 'CTX': 'Context'}
'''

# Revit category -> (semantic category, viewer role, IFC class)
CATEGORY = {
    'Walls': ('wall', 'interior-wall', 'IfcWall'),
    'Doors': ('door', 'door', 'IfcDoor'),
    'Windows': ('window', 'window', 'IfcWindow'),
    'Floors': ('slab', 'floor', 'IfcSlab'),
    'Roofs': ('roof', 'roof', 'IfcRoof'),
    'Ceilings': ('ceiling', 'ceiling', 'IfcCovering'),
    'Columns': ('column', 'column', 'IfcColumn'),
    'Structural Columns': ('column', 'column', 'IfcColumn'),
    'Structural Framing': ('beam', 'decoration', 'IfcBuildingElementProxy'),
    'Stairs': ('stair', 'stair', 'IfcStair'),
    'Runs': ('stair-flight', 'stair', 'IfcStairFlight'),
    'Landings': ('landing', 'floor', 'IfcSlab'),
    'Railings': ('balustrade', 'balustrade', 'IfcRailing'),
    'Top Rails': ('handrail', 'balustrade', 'IfcRailing'),
    'Handrails': ('handrail', 'balustrade', 'IfcRailing'),
    'Balusters': ('balustrade', 'balustrade', 'IfcRailing'),
    'Generic Models': ('ornament', 'decoration', 'IfcBuildingElementProxy'),
    'Wall Sweeps': ('ornament', 'decoration', 'IfcBuildingElementProxy'),
    'Curtain Panels': ('canopy', 'roof', 'IfcBuildingElementProxy'),
    'Curtain Wall Mullions': ('canopy', 'roof', 'IfcBuildingElementProxy'),
    'Lighting Fixtures': ('light-fixture', 'decoration', 'IfcBuildingElementProxy'),
    'Furniture': ('furniture', 'furniture', 'IfcFurniture'),
    'Planting': ('plant', 'context', 'IfcBuildingElementProxy'),
    'Mass': ('context-building', 'context', 'IfcBuildingElementProxy'),
    'Toposolid': ('terrain', 'terrain', 'IfcBuildingElementProxy'),
    'Sub-divisions': ('paving', 'terrain', 'IfcBuildingElementProxy'),
    'Site': ('site-equipment', 'context', 'IfcBuildingElementProxy'),
    'Entourage': ('site-equipment', 'context', 'IfcBuildingElementProxy'),
}
# Surroundings elements that people walk on.
WALKABLE = {'terrain', 'paving', 'slab', 'landing', 'stair', 'stair-flight'}


def slug(text):
    return re.sub(r'[^a-z0-9]+', '-', (text or '').lower()).strip('-')[:80] or 'unnamed'


def srgb_to_linear(c):
    c = c / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, 'rb') as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


# ---------------------------------------------------------------- raw geometry
def read_geometry(path):
    """-> {(geomIndex, matIndex): [(P, N, F, dist), ...]} in raw Revit units."""
    data = path.read_bytes()
    groups = defaultdict(list)
    off, n = 0, len(data)
    records = 0
    while off < n:
        gi, mi, npts, nf, nn, dist = struct.unpack_from('<iiiiii', data, off)
        off += 24
        P = np.frombuffer(data, '<f4', npts * 3, off).reshape(-1, 3).astype(np.float64); off += npts * 12
        N = np.frombuffer(data, '<f4', nn * 3, off).reshape(-1, 3).astype(np.float64); off += nn * 12
        F = np.frombuffer(data, '<i4', nf * 3, off).reshape(-1, 3).astype(np.int64); off += nf * 12
        groups[(gi, mi)].append((P, N, F, dist))
        records += 1
    return groups, records


def build_primitive(parts):
    """Concatenate polymeshes; expand normals to vertices. Returns positions, normals (glTF frame, m) and indices."""
    Ps, Ns, Fs, base = [], [], [], 0
    for P, N, F, dist in parts:
        if len(F) == 0 or len(P) == 0:
            continue
        if len(N) == len(P) and not (len(N) == len(F) and dist == 1):
            pass
        elif len(N) == len(F):                       # one normal per facet: unshare the vertices
            P = P[F.reshape(-1)]
            N = np.repeat(N, 3, axis=0)
            F = np.arange(len(P)).reshape(-1, 3)
        elif len(N) == 1:
            N = np.repeat(N, len(P), axis=0)
        else:                                        # no usable normals: flat normals from the triangles
            P = P[F.reshape(-1)]
            tri = P.reshape(-1, 3, 3)
            fn = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
            N = np.repeat(fn, 3, axis=0)
            F = np.arange(len(P)).reshape(-1, 3)
        Ps.append(P); Ns.append(N); Fs.append(F + base)
        base += len(P)
    if not Ps:
        return None
    P = np.concatenate(Ps) @ C.T * FT
    N = np.concatenate(Ns) @ C.T
    length = np.linalg.norm(N, axis=1)
    bad = length < 1e-12
    N[~bad] /= length[~bad, None]
    N[bad] = (0.0, 1.0, 0.0)
    F = np.concatenate(Fs)
    # Drop degenerate triangles (repeated vertex indices); keeps the mesh valid for the glTF validator.
    keep = (F[:, 0] != F[:, 1]) & (F[:, 1] != F[:, 2]) & (F[:, 0] != F[:, 2])
    F = F[keep]
    if len(F) == 0:
        return None
    return P.astype(np.float32), N.astype(np.float32), F


def node_matrix(t12):
    """Revit placement (basis X, Y, Z, origin in feet) -> glTF column-major 4x4 in metres, Y up."""
    if t12 is None:
        return None
    R = np.array([t12[0:3], t12[3:6], t12[6:9]]).T
    o = np.array(t12[9:12]) * FT
    L = C @ R @ C.T
    t = C @ o
    M = np.eye(4)
    M[:3, :3] = L
    M[:3, 3] = t
    return M


# ---------------------------------------------------------------- classification
def storey_of_elevation(z):
    s = STOREY_IDS[0]
    for sid, e in zip(STOREY_IDS, ELEVS):
        if z >= e - 0.02:
            s = sid
    return s


def storeys_overlapping(ymin, ymax):
    lo, hi = ymin + 0.05, ymax - 0.05
    if hi < lo:
        lo = hi = (ymin + ymax) / 2
    out = []
    for i, sid in enumerate(STOREY_IDS):
        a = ELEVS[i] if i else -1e9
        b = ELEVS[i + 1] if i + 1 < len(ELEVS) else 1e9
        if hi >= a and lo < b:
            out.append(sid)
    return out


def classify(meta, bounds, level_elev, set_name):
    """-> dict of viewer semantics for one element."""
    cat = meta.get('category') or ''
    vm = meta.get('vm', {})
    comments = meta.get('comments') or ''
    b = vm.get(PFX + 'Building') or meta.get('resolvedBuilding') or ''
    semantic, role, ifc = CATEGORY.get(cat, ('unclassified', 'decoration', 'IfcBuildingElementProxy'))
    rooms = meta.get('rooms') or []
    fam = (meta.get('family') or '') + ' ' + (meta.get('typeName') or '')
    exterior_wall = meta.get('wallFunction') in ('Exterior', 'Retaining', 'Foundation')
    host_ext = meta.get('hostWallFunction') in ('Exterior', 'Retaining', 'Foundation')
    if cat == 'Walls':
        if meta.get('wallFunction') == 'Retaining':
            semantic, role = 'retaining-wall', 'exterior-wall'
        elif exterior_wall:
            semantic, role = 'exterior-wall', 'exterior-wall'
        else:
            semantic, role = 'interior-wall', 'interior-wall'
    environment = 'interior' if rooms else 'exterior'
    if cat == 'Walls':
        environment = 'boundary' if exterior_wall else 'interior'
    elif cat in ('Doors', 'Windows') and meta.get('hostWallFunction'):
        environment = 'boundary' if host_ext else 'interior'
    tag = comments.split('|')[0]
    facade = any(k in tag for k in (':decor', ':facade', ':entrance', ':roof', ':gate', ':f2deco'))
    # Modelled ceilings and vaults (stucco families of the interior stages, tags '...:ceiling' / '...:vault') are
    # overhead like Revit ceilings: removed in the Dollhouse and in a floor filter (owner 2026-10-12).
    if cat == 'Generic Models' and (tag.endswith(':ceiling') or tag.endswith(':vault')):
        semantic, role, ifc = 'ceiling', 'ceiling', 'IfcCovering'
    # Cutaway (Dollhouse) roles: envelope and attached exterior detail hide together; roofs/ceilings overhead.
    if role in ('roof', 'ceiling') or cat in ('Curtain Panels', 'Curtain Wall Mullions'):
        cutaway = 'overhead'
    elif cat == 'Walls':
        cutaway = 'enclosure' if exterior_wall else 'interior'
    elif cat in ('Doors', 'Windows'):
        cutaway = 'enclosure' if (host_ext or (not rooms and not meta.get('hostWallFunction'))) else 'interior'
    elif cat in ('Wall Sweeps',):
        cutaway = 'enclosure'
    elif cat in ('Generic Models', 'Structural Framing', 'Columns', 'Railings', 'Top Rails', 'Balusters', 'Handrails'):
        cutaway = 'interior' if rooms and not facade else 'enclosure'
    else:
        cutaway = 'interior'
    if set_name == 'surroundings':
        if semantic in WALKABLE:
            role = 'terrain'
        elif role != 'terrain':
            role = 'context'
        cutaway = 'interior'
    # Storeys.
    level_storey = storey_of_elevation(level_elev) if level_elev is not None else None
    if set_name != 'building':
        floors = []
    elif role in ('floor', 'roof', 'ceiling') and cat not in ('Landings',):
        floors = [level_storey or storey_of_elevation(bounds[0][1])]
    else:
        floors = storeys_overlapping(bounds[0][1], bounds[1][1]) or [level_storey or storey_of_elevation(bounds[0][1])]
    primary = level_storey if (level_storey in floors) else (floors[0] if floors else None)
    method = vm.get(PFX + 'Method') or ''
    basis = 'authored' if method in ('measured-vector', 'owner-instruction') else 'inferred'
    conf = (vm.get(PFX + 'Confidence') or '').lower()
    conf = conf if conf in ('low', 'medium', 'high') else ('low' if not conf else {'l': 'low', 'm': 'medium', 'h': 'high'}.get(conf[:1], 'low'))
    return {'semantic': semantic, 'role': role, 'ifc': ifc, 'cutaway': cutaway, 'environment': environment,
            'floors': floors, 'primary': primary, 'building': b, 'basis': basis, 'confidence': conf}


# ---------------------------------------------------------------- GLB writer
class GLB:
    def __init__(self):
        self.doc = {'asset': {'version': '2.0', 'generator': '%s Revit exporter (IExportContext + numpy; tools/revit/export)' % CFG.get('buildingId', 'reconstruction')},
                    'scene': 0, 'scenes': [{'nodes': []}], 'nodes': [], 'meshes': [], 'materials': [],
                    'accessors': [], 'bufferViews': [], 'buffers': [{'byteLength': 0}]}
        self.bin = bytearray()

    def view(self, data, target):
        while len(self.bin) % 4:
            self.bin.append(0)
        off = len(self.bin)
        self.bin += data
        self.doc['bufferViews'].append({'buffer': 0, 'byteOffset': off, 'byteLength': len(data), 'target': target})
        return len(self.doc['bufferViews']) - 1

    def accessor(self, arr, kind, target, minmax=False):
        ctype = {np.dtype('float32'): 5126, np.dtype('uint16'): 5123, np.dtype('uint32'): 5125}[arr.dtype]
        bv = self.view(arr.tobytes(), target)
        acc = {'bufferView': bv, 'componentType': ctype, 'count': int(arr.shape[0]) if kind != 'SCALAR' else int(arr.size), 'type': kind}
        if minmax:
            acc['min'] = [float(x) for x in arr.min(axis=0)]
            acc['max'] = [float(x) for x in arr.max(axis=0)]
        self.doc['accessors'].append(acc)
        return len(self.doc['accessors']) - 1

    def mesh(self, name, P, N, F, material):
        idx = F.reshape(-1).astype(np.uint16 if len(P) < 65536 else np.uint32)
        prim = {'attributes': {'POSITION': self.accessor(P, 'VEC3', 34962, True), 'NORMAL': self.accessor(N, 'VEC3', 34962)},
                'indices': self.accessor(idx, 'SCALAR', 34963), 'material': material}
        self.doc['meshes'].append({'name': name, 'primitives': [prim]})
        return len(self.doc['meshes']) - 1

    def write(self, path):
        while len(self.bin) % 4:
            self.bin.append(0)
        self.doc['buffers'][0]['byteLength'] = len(self.bin)
        js = json.dumps(self.doc, separators=(',', ':'), ensure_ascii=False).encode('utf-8')
        js += b' ' * ((4 - len(js) % 4) % 4)
        total = 12 + 8 + len(js) + 8 + len(self.bin)
        with open(path, 'wb') as fh:
            fh.write(struct.pack('<4sII', b'glTF', 2, total))
            fh.write(struct.pack('<I4s', len(js), b'JSON')); fh.write(js)
            fh.write(struct.pack('<I4s', len(self.bin), b'BIN\x00')); fh.write(self.bin)


def material_record(m):
    rgb = m['rgb']
    alpha = max(0.08, 1.0 - float(m['transparency'] or 0.0))
    smooth = float(m.get('smoothness') or 50) / 100.0
    rec = {'name': m['name'], 'doubleSided': True,
           'pbrMetallicRoughness': {'baseColorFactor': [round(srgb_to_linear(c), 4) for c in rgb] + [round(alpha, 4)],
                                    'metallicFactor': 0.0, 'roughnessFactor': round(min(1.0, max(0.05, 0.9 - 0.5 * smooth)), 3)},
           'extras': {'revit_material_id': m['materialId'], 'revit_material_class': m.get('class'),
                      'revit_rgb': rgb, 'revit_transparency': m['transparency']}}
    if alpha < 0.999:
        rec['alphaMode'] = 'BLEND'
        rec['pbrMetallicRoughness']['roughnessFactor'] = 0.1
    return rec


# ---------------------------------------------------------------- main
def build(set_name, raw, stage, source_sha):
    exp = json.loads((raw / f'{set_name}.export.json').read_text(encoding='utf-8'))
    meta_all = json.loads((raw / f'{set_name}.meta.json').read_text(encoding='utf-8'))
    metas = meta_all['elements']
    rooms = meta_all['rooms']
    level_elev = {lv['name']: lv['elevation_m'] for lv in meta_all['levels']}
    groups, records = read_geometry(raw / f'{set_name}.geom.bin')
    geoms = exp['geoms']
    mats = exp['materials']
    glb = GLB()
    used_mats = {}
    prims = {}           # (geomKey, matIndex) -> (meshIndex, P bounds corners, triangles)
    for (gi, mi), parts in sorted(groups.items()):
        key = geoms[gi]
        built = build_primitive(parts)
        if built is None:
            continue
        P, N, F = built
        if mi not in used_mats:
            used_mats[mi] = len(glb.doc['materials'])
            glb.doc['materials'].append(material_record(mats[mi]))
        name = f'{key}-m{used_mats[mi]}'
        mesh = glb.mesh(name, P, N, F, used_mats[mi])
        prims[(key, mi)] = (mesh, P, len(F))
    by_geom = defaultdict(list)
    for (key, mi), v in prims.items():
        by_geom[key].append((mi, v))
    placements = defaultdict(list)
    seen_pl = set()
    for eid, key, t12, mirrored in exp['placements']:
        sig = (eid, key, None if t12 is None else tuple(round(x, 6) for x in t12))
        if sig in seen_pl:          # an element visited twice by the exporter
            continue
        seen_pl.add(sig)
        placements[eid].append((key, t12, mirrored))
    # Revit sub-elements without VM Heritage values (balusters, top rails, nested trims) inherit their host's values.
    for k, m in metas.items():
        if m.get('vm'):
            continue
        cur, depth = m, 0
        while cur is not None and not cur.get('vm') and depth < 6:
            nxt = None
            for hk in ('superComponent', 'hostRailing', 'railingHost', 'host'):
                h = cur.get(hk)
                if h and str(h) in metas and str(h) != k:
                    nxt = metas[str(h)]
                    break
            cur, depth = nxt, depth + 1
        if cur is not None and cur.get('vm'):
            m['vm'] = dict(cur['vm'])
            m['vmInheritedFrom'] = cur['id']
        elif set_name == 'building':
            m['resolvedBuilding'] = CFG.get('defaultBuilding', '')
    elements, node_count, tri_count = [], 0, 0
    order = sorted(exp['exported'], key=lambda e: ((metas.get(str(e)) or {}).get('category') or '', e))
    seen = set()
    for eid in order:
        if eid in seen:
            continue
        seen.add(eid)
        meta = metas.get(str(eid))
        if meta is None:
            continue
        comps = []
        for key, t12, mirrored in placements.get(eid, []):
            if key not in by_geom:
                continue
            M = node_matrix(t12)
            for mi, (mesh, P, ntri) in sorted(by_geom[key], key=lambda x: x[0]):
                W = P if M is None else (P @ M[:3, :3].T + M[:3, 3])
                comps.append({'mesh': mesh, 'matrix': M, 'min': W.min(axis=0), 'max': W.max(axis=0), 'tri': ntri,
                              'material': used_mats[mi], 'mirrored': bool(mirrored), 'symbol': key[0] == 's'})
        if not comps:
            continue
        lo = np.min([c['min'] for c in comps], axis=0)
        hi = np.max([c['max'] for c in comps], axis=0)
        sem = classify(meta, (lo, hi), level_elev.get(meta.get('level')), set_name)
        elements.append((eid, meta, sem, comps, lo, hi))
    # Nodes
    for eid, meta, sem, comps, lo, hi in elements:
        vm = meta.get('vm', {})
        elem_id = f'{IDP}-r{eid}'
        fam_name = meta.get('family') or meta.get('category')
        type_name = meta.get('typeName') or meta.get('name')
        src_name = ' · '.join(x for x in [meta.get('category'), fam_name, type_name, str(eid)] if x)
        bcode = sem['building'] or ''
        room_labels = [f"{rooms[str(r)]['number']} {rooms[str(r)]['name']}".strip() for r in (meta.get('rooms') or []) if str(r) in rooms]
        for slot, c in enumerate(comps):
            extras = OrderedDict([
                ('viewer_id', f'{elem_id}-c{slot}'), ('viewer_element_id', elem_id), ('viewer_parent_id', elem_id),
                ('viewer_category', sem['semantic']), ('viewer_role', sem['role']), ('viewer_cutaway_role', sem['cutaway']),
                ('viewer_dollhouse_hidden', False), ('viewer_floor_ids', sem['floors']), ('viewer_room_ids', room_labels),
                ('viewer_family_id', f"{IDP}-family-{slug(meta.get('category'))}-{slug(fam_name)}"), ('viewer_family_name', fam_name),
                ('viewer_type_id', f"{IDP}-type-r{meta.get('typeId')}" if meta.get('typeId') else f"{IDP}-type-{slug(meta.get('category'))}"),
                ('viewer_type_name', type_name),
                ('viewer_building_id', BUILDING_IDS.get(bcode, CFG['buildingId'] + '-unassigned')),
                ('viewer_model_scope', 'building' if set_name == 'building' else ('site' if bcode == 'SITE' else 'surroundings')),
                ('viewer_environment', sem['environment']),
                ('viewer_classification_basis', sem['basis']), ('viewer_classification_confidence', sem['confidence']),
                ('viewer_classification_source', vm.get(PFX + 'EvidenceSource') or ('Revit model of %s (provenance parameters)' % CFG['buildingId'])),
                ('viewer_source_name', src_name),
                ('revit_element_id', eid), ('revit_unique_id', meta.get('uniqueId')), ('revit_category', meta.get('category')),
                ('revit_level', meta.get('level')),
            ])
            for k in [PFX + x for x in ('Building', 'Part', 'Method', 'Confidence', 'LOD', 'LOA', 'Tol_H', 'Tol_V', 'StateDate', 'Licence')]:
                if vm.get(k) not in (None, ''):
                    extras[k.lower()] = vm[k]
            node = {'name': extras['viewer_id'], 'mesh': c['mesh'], 'extras': extras}
            if c['matrix'] is not None:
                node['matrix'] = [float(x) for x in c['matrix'].T.reshape(-1)]
            glb.doc['nodes'].append(node)
            glb.doc['scenes'][0]['nodes'].append(len(glb.doc['nodes']) - 1)
            c['viewer_id'] = extras['viewer_id']
            node_count += 1
            tri_count += c['tri']
    glb.doc['scenes'][0]['name'] = f"{CFG.get('title', CFG['buildingId'])} {set_name}"
    glb.doc['scenes'][0]['extras'] = {'scope': CFG.get('scope', ''), 'frame': CFG.get('frame', 'Revit internal coordinates in metres, glTF Y up; see model_georeference.json.')}
    return glb, elements, {'records': records, 'nodes': node_count, 'triangles': tri_count,
                           'uniqueMeshes': len(glb.doc['meshes']), 'materials': len(glb.doc['materials'])}, meta_all


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--config', type=Path, default=Path('export_config.json'))
    ap.add_argument('--raw', type=Path)
    ap.add_argument('--stage', type=Path)
    args = ap.parse_args()
    configure(args.config)
    args.raw = args.raw or EXPORT / 'raw'
    args.stage = args.stage or EXPORT / 'stage'
    args.stage.mkdir(parents=True, exist_ok=True)
    raw_files = sorted(p for p in args.raw.iterdir() if p.suffix in ('.bin', '.json') and p.name.split('.')[0] in ('building', 'surroundings'))
    source_sha = hashlib.sha256(''.join(f'{p.name}:{sha256_file(p)}\n' for p in raw_files).encode()).hexdigest()
    out = {'sourceSha256': source_sha, 'rawFiles': {p.name: sha256_file(p) for p in raw_files}, 'sets': {}}
    for set_name in ('building', 'surroundings'):
        glb, elements, stats, meta_all = build(set_name, args.raw, args.stage, source_sha)
        tmp = args.stage / f'{set_name}.tmp.glb'
        glb.write(tmp)
        digest = sha256_file(tmp)
        final = args.stage / f'{set_name}-{source_sha[:12]}-{digest[:12]}.glb'
        for old in args.stage.glob(f'{set_name}-*.glb'):
            if old != final and 'meshopt' not in old.name:
                old.unlink()
        tmp.replace(final)
        out['sets'][set_name] = {'asset': final.name, 'sha256': digest, 'bytes': final.stat().st_size, **stats,
                                 'elements': len(elements)}
        (args.stage / f'{set_name}.elements.json').write_text(json.dumps([
            {'id': eid, 'category': meta.get('category'), 'family': meta.get('family'), 'typeName': meta.get('typeName'),
             'typeId': meta.get('typeId'), 'level': meta.get('level'), 'semantic': sem, 'vm': meta.get('vm'), 'vmType': meta.get('vmType'),
             'rooms': meta.get('rooms'), 'uniqueId': meta.get('uniqueId'), 'mark': meta.get('mark'),
             'bounds': [lo.tolist(), hi.tolist()],
             'components': [{'id': c['viewer_id'], 'matrix': None if c['matrix'] is None else c['matrix'].T.reshape(-1).tolist(),
                             'min': c['min'].tolist(), 'max': c['max'].tolist(), 'tri': c['tri'], 'material': c['material'],
                             'mirrored': c['mirrored'], 'symbol': c['symbol']} for c in comps]}
            for eid, meta, sem, comps, lo, hi in elements], ensure_ascii=False), encoding='utf-8')
        print(set_name, json.dumps(out['sets'][set_name]))
    (args.stage / 'build.json').write_text(json.dumps(out, indent=2), encoding='utf-8')


if __name__ == '__main__':
    sys.exit(main())
