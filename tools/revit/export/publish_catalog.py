"""Make the staged release the one published version of a building (CPython, tools/revit/export).

usage: python tools/revit/export/publish_catalog.py --config reconstructions/<id>/work/build/export/export_config.json [--dry]

After x20_publish.py: replaces (or adds) the building's entry in reconstructions/<id>/public/models/catalog.json with
stage/catalog-entry.json, deletes superseded assets inside the release folder (files not referenced by the entry), and
retires other published versions of the building to work/archive/models/<modelId>/ (the Blender importer's rule: one
published version). Prints what it did; --dry only reports.
"""
import argparse
import json
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import x10_build_glb as X  # noqa: E402

REPO = Path(__file__).resolve().parents[3]


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--config', type=Path, default=Path('export_config.json'))
    ap.add_argument('--dry', action='store_true')
    a = ap.parse_args()
    cfg = X.configure(a.config)
    stage = X.EXPORT / 'stage'
    bid = cfg['buildingId']
    models = REPO / 'reconstructions' / bid / 'public' / 'models'
    catalog_path = models / 'catalog.json'
    entry = json.loads((stage / 'catalog-entry.json').read_text(encoding='utf-8'))
    catalog = json.loads(catalog_path.read_text(encoding='utf-8')) if catalog_path.exists() else {'schemaVersion': 1, 'models': []}
    others = [m for m in catalog['models'] if m['id'] != entry['id']]
    catalog['models'] = [entry]
    actions = []
    # retire other published versions of this building
    archive = REPO / 'reconstructions' / bid / 'work' / 'archive' / 'models'
    for m in others:
        folder = models / m['id']
        if folder.exists():
            dst = archive / m['id']
            actions.append(f'retire {folder.relative_to(REPO)} -> {dst.relative_to(REPO)}')
            if not a.dry:
                archive.mkdir(parents=True, exist_ok=True)
                if dst.exists():
                    shutil.rmtree(dst)
                shutil.move(str(folder), str(dst))
        actions.append(f'catalog entry removed: {m["id"]}')
    # superseded assets inside the release folder
    release = models / entry['id']
    keep = {Path(entry[k]).name.split('.')[0] for k in ('building', 'surroundings', 'bim') if entry.get(k)}
    for f in sorted(release.iterdir()) if release.exists() else []:
        stem = f.name.split('.')[0]
        if stem.startswith(('building-', 'surroundings-', 'bim-')) and stem not in keep:
            actions.append(f'delete superseded {f.relative_to(REPO)}')
            if not a.dry:
                f.unlink()
    actions.append(f'catalog -> {entry["id"]} ({Path(entry["building"]).name}, {Path(entry["surroundings"]).name}, {Path(entry["bim"]).name})')
    if not a.dry:
        catalog_path.write_text(json.dumps(catalog, indent=1, ensure_ascii=False) + '\n', encoding='utf-8')
    print('\n'.join(actions))
    return 0


if __name__ == '__main__':
    sys.exit(main())
