"""Revit viewer export, step 11 (CPython): whole-product BIM registry (docs/bim-registry.schema.json v1) for building.glb (tools/revit/export).

One Revit element = one product; its material/placement nodes are the components. Sub-elements that Revit keeps
as separate elements (balusters, top rails, nested shared trims) are products with parentId = their host when the
host is exported too. Room information comes from Revit rooms (FromRoom/ToRoom for doors and windows, point-in-room
for other family instances and components).
"""
import hashlib
import json
import re
import sys
from collections import Counter, OrderedDict
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import argparse  # noqa: E402
import x10_build_glb as X  # noqa: E402
from x10_build_glb import slug  # noqa: E402

KEY_SUFFIXES = ['Building', 'Part', 'RegistryId', 'EvidenceSource', 'Method', 'ClassificationBasis', 'Confidence', 'StateDate', 'ConstructionPeriod',
                'Tol_H', 'Tol_V', 'Uncertainty', 'LOA', 'LOD', 'Decisions', 'Findings', 'Stage', 'Licence', 'StructuralRole', 'StructuralBasis', 'HostRef']


def text(v, limit=4000):
    return str(v)[:limit]


def mat(values):
    return np.array(values, float).reshape(4, 4).T if values is not None else np.eye(4)


def flat(M):
    return [float(round(x, 12)) for x in M.T.reshape(-1)]


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--config', type=Path, default=Path('export_config.json'))
    ap.add_argument('--stage', type=Path)
    ap.add_argument('--raw', type=Path)
    args = ap.parse_args()
    CFG = X.configure(args.config)
    P = X.PFX
    STAGE = args.stage or X.EXPORT / 'stage'
    RAW = args.raw or X.EXPORT / 'raw'
    VM_KEYS = [P + k for k in KEY_SUFFIXES]
    STOREYS, MODEL_ID, NAMESPACE, BUILDING_NAMES = X.STOREYS, X.MODEL_ID, X.NAMESPACE, X.BUILDING_NAMES
    build = json.loads((STAGE / 'build.json').read_text(encoding='utf-8'))
    elements = json.loads((STAGE / 'building.elements.json').read_text(encoding='utf-8'))
    meta = json.loads((RAW / 'building.meta.json').read_text(encoding='utf-8'))
    rooms = meta['rooms']
    exported = {e['id'] for e in elements}
    families, types, out = OrderedDict(), OrderedDict(), []
    max_err = 0.0
    for e in elements:
        sem = e['semantic']
        cat = sem['semantic']
        fam_name = e.get('family') or e.get('category')
        fam_id = f"family:{cat}:{slug(fam_name)}"
        families.setdefault(fam_id, {'id': fam_id, 'name': text(fam_name), 'category': cat})
        type_id = f"type:{cat}:r{e['typeId']}" if e.get('typeId') else f"type:{cat}:untyped"
        elem_id = f"{X.IDP}-r{e['id']}"
        if type_id not in types:
            types[type_id] = {'id': type_id, 'familyId': fam_id, 'name': text(e.get('typeName') or fam_name), 'revision': 1,
                              'prototypeElementId': elem_id}
        comps = e['components']
        # Root: the instance placement when the product is one rigid, right-handed family placement.
        placed = [c for c in comps if c['symbol'] and c['matrix'] is not None]
        root = np.eye(4)
        if placed and len({tuple(np.round(c['matrix'], 9)) for c in placed}) == 1 and not placed[0]['mirrored']:
            R = mat(placed[0]['matrix'])
            if np.linalg.det(R[:3, :3]) > 0:
                root = R
        inv = np.linalg.inv(root)
        components = []
        for slot, c in enumerate(comps):
            node = mat(c['matrix'])
            local = inv @ node
            err = float(np.abs(root @ local - node).max())
            max_err = max(max_err, err)
            components.append({'id': c['id'], 'localMatrix': flat(local), 'slot': slot})
        vm = e.get('vm') or {}
        vmt = e.get('vmType') or {}
        room_labels = []
        for r in e.get('rooms') or []:
            rr = rooms.get(str(r))
            if rr:
                room_labels.append(text(f"{rr['number']} {rr['name']}".strip(), 256))
        props = OrderedDict()
        props['revitElementId'] = e['id']
        props['revitUniqueId'] = e.get('uniqueId') or ''
        props['revitCategory'] = e.get('category') or ''
        props['revitFamily'] = e.get('family') or ''
        props['revitType'] = e.get('typeName') or ''
        if e.get('level'):
            props['revitLevel'] = e['level']
        if e.get('mark'):
            props['mark'] = e['mark']
        b = vm.get(P + 'Building') or sem.get('building') or ''
        if b:
            props['building'] = f"{b} ({BUILDING_NAMES.get(b, b)})"
        for k in VM_KEYS:
            v = vm.get(k)
            if v not in (None, '') and k != P + 'Building':
                props[k] = v if isinstance(v, (int, float)) else text(v)
        if vmt.get(P + 'GeometryBasis'):
            props[P + 'GeometryBasis (type)'] = text(vmt[P + 'GeometryBasis'])
        for r in e.get('rooms') or []:
            rr = rooms.get(str(r))
            if rr and rr.get('vm', {}).get(P + 'SIA416'):
                props['roomSIA416'] = f"{rr['number']}: {rr['vm'][P + 'SIA416']}"
                break
        props = OrderedDict(list(props.items())[:40])
        primary = sem.get('primary') or (sem['floors'][0] if sem['floors'] else X.STOREY_IDS[0])
        refs = [s for s in sem['floors'] if s != primary][:20]
        method = vm.get(P + 'Method') or 'unknown'
        geometry = f"method={method}; LOD={vm.get(P + 'LOD', 'n/a')}; tolerance H {vm.get(P + 'Tol_H', 'n/a')} / V {vm.get(P + 'Tol_V', 'n/a')}"
        item = OrderedDict([
            ('id', elem_id), ('name', text(e.get('typeName') or fam_name) + (f" ({e['mark']})" if e.get('mark') else '')),
            ('category', cat), ('typeId', type_id), ('rootMatrix', flat(root)), ('components', components),
            ('primaryStorey', primary), ('storeyRefs', refs), ('roomIds', room_labels[:100]),
            ('environment', sem['environment']), ('ifcClass', sem['ifc']),
            ('bounds', [[round(x, 6) for x in e['bounds'][0]], [round(x, 6) for x in e['bounds'][1]]]),
            ('quantities', {}), ('properties', props),
            ('evidence', {'basis': sem['basis'], 'confidence': sem['confidence'],
                          'source': text(vm.get(P + 'EvidenceSource') or 'Revit model; no element-level source recorded'),
                          'geometry': text(geometry)}),
            ('membership', 'reviewed'),
        ])
        out.append((item, e))
    # parents (sub-elements whose host element is exported as well)
    meta_el = meta['elements']
    for item, e in out:
        m = meta_el.get(str(e['id'])) or {}
        for key in ('superComponent', 'hostRailing'):
            p = m.get(key)
            if p and p in exported and p != e['id']:
                item['parentId'] = f'{X.IDP}-r{p}'
                break
    items = [i for i, _ in out]
    cats = sorted({i['category'] for i in items})
    coverage = [{'category': c, 'status': 'partial',
                 'scope': f"All modelled {c} elements of the {CFG.get('title', CFG['buildingId'])} Revit export (building set); the model is not a census of the real building"}
                for c in cats]
    registry = OrderedDict([
        ('schemaVersion', 1), ('modelId', MODEL_ID), ('projectId', CFG['buildingId']), ('projectNamespace', NAMESPACE),
        ('sourceSha256', build['sourceSha256']), ('units', 'm'), ('coordinateSystem', 'glTF-Y-up'), ('conversionTolerance', 0.001),
        ('storeys', [{'id': k, 'name': v['label'], 'elevation': v['elevation'], 'provisional': True} for k, v in STOREYS.items()]),
        ('families', list(families.values())), ('types', list(types.values())), ('elements', items), ('openings', []),
        ('unresolvedComponents', []), ('coverage', coverage),
        ('caveats', CFG.get('caveats') or [
            'Exported from the native Revit model; geometry is measured, scaled, transferred or inferred as the provenance parameters state, not a surveyed BIM.',
            'One Revit element is one registered product; its material parts are the components. Revit sub-elements (balusters, top rails, nested trims) are separate products linked to their host by parentId.',
            'Provenance (method, confidence, tolerances, LOD, licence) is copied from the building\'s provenance shared parameters.',
            'Room references come from Revit rooms (doors and windows: from/to room; other family instances: room at the element centre). Walls, slabs and roofs carry no room reference.',
            'Storey elevations follow the Revit levels of the building set; the surroundings set carries no storeys.',
            'No host/filling opening records are registered (openings list empty); door and window host walls are listed in the element properties where known.',
        ]),
    ])
    payload = json.dumps(registry, ensure_ascii=False, indent=None, separators=(',', ':')) + '\n'
    (STAGE / 'bim.json').write_text(payload, encoding='utf-8')
    digest = hashlib.sha256(payload.encode('utf-8')).hexdigest()
    validation = {'products': len(items), 'ownedComponents': sum(len(i['components']) for i in items), 'unresolvedComponents': 0,
                  'maximumTransformErrorM': max_err, 'status': 'PASS' if max_err <= 0.001 else 'FAIL'}
    (STAGE / 'bim.validation.json').write_text(json.dumps(validation, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'sha256': digest, **validation, 'families': len(families), 'types': len(types),
                      'categories': Counter(i['category'] for i in items)}, indent=1))


if __name__ == '__main__':
    main()
