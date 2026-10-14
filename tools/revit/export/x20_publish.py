"""Revit viewer export, step 20 (CPython): reports, Meshopt/gzip optimisation, release folder, catalog entry, content checks
(tools/revit/export; configured by export_config.json).

Writes reconstructions/<id>/public/models/<modelId>/ and stage/catalog-entry.json + stage/preview/catalog.json.
Does NOT modify public/models/catalog.json: run publish_catalog.py for that (one published version per building).
"""
import gzip
import hashlib
import json
import re
import shutil
import subprocess
import sys
from collections import Counter, OrderedDict
from pathlib import Path

import argparse

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
sys.path.insert(0, str(REPO / 'tools/model-pipeline'))
sys.path.insert(0, str(HERE))
from optimize_models import optimize_asset  # noqa: E402
import x10_build_glb as X  # noqa: E402

CFG, EXPORT, STAGE, RAW, MODELS, RELEASE, MODEL_ID, STOREYS, P = {}, None, None, None, None, None, None, None, 'XX_'


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def write_json(path, value):
    Path(path).write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')


def licence_notes(set_name):
    meta = json.loads((RAW / f'{set_name}.meta.json').read_text(encoding='utf-8'))
    exported = set(json.loads((RAW / f'{set_name}.export.json').read_text(encoding='utf-8'))['exported'])
    lic = Counter()
    for k, e in meta['elements'].items():
        if int(k) in exported and e.get('vm', {}).get(P + 'Licence'):
            lic[e['vm'][P + 'Licence']] += 1
    return lic


def report(set_name, build, views):
    s = build['sets'][set_name]
    els = json.loads((STAGE / f'{set_name}.elements.json').read_text(encoding='utf-8'))
    cats = Counter(e['category'] for e in els)
    blds = Counter((e.get('vm') or {}).get(P + 'Building') or e['semantic'].get('building') or 'resolved-by-host' for e in els)
    lo = [min(e['bounds'][0][i] for e in els) for i in range(3)]
    hi = [max(e['bounds'][1][i] for e in els) for i in range(3)]
    exp = json.loads((RAW / f'{set_name}.export.json').read_text(encoding='utf-8'))['summary']
    lic = licence_notes(set_name)
    notes = list(CFG.get('notes', {}).get('common', []))
    title = '%s - %s (Revit)' % (CFG.get('title', CFG['buildingId']), set_name)
    rid = '%s-%s' % (CFG['buildingId'], set_name)
    notes += CFG.get('notes', {}).get(set_name, [])
    return OrderedDict([
        ('schemaVersion', 1), ('id', rid), ('title', title), ('asset', s['asset']),
        ('source', OrderedDict([('file', CFG.get('sourceFile', 'native Revit model (open session)')),
                                ('identity', 'SHA-256 of the raw Revit export payload (building and surroundings geometry, placements, metadata)'),
                                ('sha256', build['sourceSha256'])])),
        ('conversion', OrderedDict([('method', 'Revit CustomExporter / IExportContext (pyRevit, IronPython) -> numpy GLB writer'),
                                    ('exporterSha256', sha(HERE / 'x02_export_geometry.py')), ('metadataSha256', sha(HERE / 'x03_export_metadata.py')),
                                    ('builderSha256', sha(HERE / 'x10_build_glb.py')), ('viewsSha256', sha(HERE / 'x01_export_views.py')),
                                    ('levelOfDetail', exp.get('lod'))])),
        ('revitVersion', CFG.get('revitVersion', '')),
        ('coordinates', OrderedDict([('units', 'metres'), ('sourceUp', 'Z'), ('exportUp', 'Y'),
                                     ('mapping', 'Revit internal (X, Y, Z) feet -> glTF (X, Z, -Y) * 0.3048'), ('recentered', False)])),
        ('selection', OrderedDict([('view', views[set_name]), ('elements', len(els)), ('categories', dict(sorted(cats.items()))),
                                   ('vmBuilding', dict(sorted(blds.items()))), ('skippedByExporter', exp.get('skipped')),
                                   ('licences', dict(lic)), ('boundsGltf', {'min': lo, 'max': hi})])),
        ('sharedGeometry', OrderedDict([('symbolGeometries', exp.get('symbols')), ('placements', exp.get('placements')),
                                        ('note', 'Family instances with the same Revit SymbolGeometryId share one glTF mesh per material; element-specific geometry is world-baked.')])),
        ('notes', notes),
        ('validation', 'GLB packaging, ID uniqueness, BIM registry recomposition and viewer loading checks: tools/revit/export/validate.mjs and the release report.'),
    ])


def main():
    global CFG, EXPORT, STAGE, RAW, MODELS, RELEASE, MODEL_ID, STOREYS, P
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--config', type=Path, default=Path('export_config.json'))
    args = ap.parse_args()
    CFG = X.configure(args.config)
    EXPORT, STAGE, RAW = X.EXPORT, X.EXPORT / 'stage', X.EXPORT / 'raw'
    MODEL_ID, STOREYS, P = X.MODEL_ID, X.STOREYS, X.PFX
    MODELS = REPO / 'reconstructions' / CFG['buildingId'] / 'public' / 'models'
    RELEASE = MODELS / MODEL_ID
    build = json.loads((STAGE / 'build.json').read_text(encoding='utf-8'))
    views = CFG['views']
    RELEASE.mkdir(parents=True, exist_ok=True)
    delivered = {}
    for set_name in ('building', 'surroundings'):
        asset = STAGE / build['sets'][set_name]['asset']
        write_json(asset.with_suffix('.report.json'), report(set_name, build, views))
        delivery, rep = optimize_asset(asset)
        delivered[set_name] = (delivery, rep)
        base = delivery.with_suffix('') if delivery.suffix == '.gz' else delivery
        for f in (delivery, base.with_suffix('.glb.gz'), base.with_suffix('.report.json')):
            if f.is_file():
                shutil.copy2(f, RELEASE / f.name)
        print(set_name, delivery.name, json.dumps(rep['optimization'])[:300])
    # BIM registry
    bim = (STAGE / 'bim.json').read_bytes()
    bim_name = f"bim-{hashlib.sha256(bim).hexdigest()[:16]}.json"
    (RELEASE / bim_name).write_bytes(bim)
    shutil.copy2(STAGE / 'bim.validation.json', RELEASE / bim_name.replace('.json', '.validation.json'))
    for name in ('viewer.json', 'model_georeference.json'):
        shutil.copy2(STAGE / name, RELEASE / name)
    b_del, b_rep = delivered['building']
    s_del, _ = delivered['surroundings']
    entry = OrderedDict([
        ('id', MODEL_ID), ('label', CFG['label']), ('version', CFG['version']),
        ('building', f'./{MODEL_ID}/{b_del.name}'), ('surroundings', f'./{MODEL_ID}/{s_del.name}'),
        ('metadata', f'./{MODEL_ID}/viewer.json'), ('sourceSha256', build['sourceSha256']),
        ('levels', ['all'] + list(STOREYS)), ('meshCount', b_rep['glb']['meshNodes']),
        ('location', OrderedDict([('latitude', CFG['location']['latitude']), ('longitude', CFG['location']['longitude']), ('timeZone', CFG['location']['timeZone']),
                                  ('enuToModelDegrees', CFG['location']['enuToModelDegrees']), ('source', f'{MODEL_ID}/model_georeference.json; ENU rotated into the Revit internal XY')])),
        ('levelDefinitions', OrderedDict((k, {'label': v['label'], 'elevation': v['elevation'], 'min': v['min'], 'max': v['max']}) for k, v in STOREYS.items())),
        ('bim', f'./{MODEL_ID}/{bim_name}'),
    ])
    write_json(STAGE / 'catalog-entry.json', entry)
    current = json.loads((MODELS / 'catalog.json').read_text(encoding='utf-8'))
    preview = OrderedDict([('schemaVersion', 1), ('models', [m for m in current['models'] if m['id'] != MODEL_ID] + [entry])])
    (STAGE / 'preview').mkdir(exist_ok=True)
    write_json(STAGE / 'preview' / 'catalog.json', preview)
    # Content checks: only model geometry, materials and earlier-release metadata; no local paths or work/ references.
    problems, info = [], {}
    allowed = re.compile(r'^(building|surroundings)-meshopt-[0-9a-f]{16}\.(glb|glb\.gz|report\.json)$|^bim-[0-9a-f]{16}(\.validation)?\.json$|^viewer\.json$|^model_georeference\.json$')
    for f in sorted(RELEASE.iterdir()):
        if not allowed.match(f.name):
            problems.append(f'unexpected file {f.name}')
        data = f.read_bytes()
        if f.suffix == '.gz':
            data = gzip.decompress(data)
        if f.suffix in ('.glb', '.gz'):
            n = int.from_bytes(data[12:16], 'little')
            data = data[20:20 + n]
        text = data.decode('utf-8', 'replace')
        # Local machine paths, user names and private work folders must never appear.
        for pat in [r'\b[A-Za-z]:[\\/]', r'Users[\\/]', r'\bwork/', r'references/(incoming|archive)'] + list(CFG.get('forbiddenPatterns', [])):
            hits = re.findall(pat, text)
            if hits:
                problems.append(f'{f.name}: {len(hits)} x {pat}')
        # Evidence identifiers and research-record names were published by earlier releases too; counted for review.
        for pat in (r'research/', r'\bBBL\b', r'ref-[0-9a-f]{16}'):
            info.setdefault(f.name, {})[pat] = len(re.findall(pat, text))
        if f.stat().st_size >= 100 * 1024 * 1024:
            problems.append(f'{f.name}: >= 100 MiB')
    write_json(STAGE / 'content-check.json', {'files': sorted(f.name for f in RELEASE.iterdir()), 'problems': problems, 'info': info})
    print('content problems:', problems)


if __name__ == '__main__':
    main()
