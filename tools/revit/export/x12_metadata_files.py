"""Revit viewer export, step 12 (CPython, tools/revit/export): viewer.json (saved views) and model_georeference.json
from export_config.json.

viewer.json: the saved views listed in the configuration ("savedViews": the viewer-metadata schema's view objects, camera
positions in glTF metres, Y up) plus one Dollhouse view per storey and the "exterior" view when none is given.
model_georeference.json: the "georeference" object of the configuration, completed with modelId and the control points
derived from its projected origin and azimuth. Both go to <export>/stage/.
"""
import argparse
import json
import math
import sys
from collections import OrderedDict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import x10_build_glb as X  # noqa: E402


def viewer_json(cfg):
    views = []
    seen = set()
    for v in cfg.get('savedViews', []):
        views.append(v)
        seen.add(v['id'])
    if 'exterior' not in seen:
        views.insert(0, OrderedDict([('id', 'exterior'), ('title', cfg.get('exteriorTitle', 'Exterior')),
                                     ('description', cfg.get('exteriorDescription', 'The published model in its surroundings.')),
                                     ('camera', OrderedDict([('mode', 'orbit'), ('frame', 'building')]))]))
    for sid, st in X.STOREYS.items():
        if 'dollhouse-' + sid in seen:
            continue
        views.append(OrderedDict([('id', 'dollhouse-' + sid), ('title', st['label']),
                                  ('description', cfg.get('storeyDescription', 'Revit storey of the published model.')),
                                  ('camera', OrderedDict([('mode', 'dollhouse'), ('level', sid), ('frame', 'level')]))]))
    return OrderedDict([('schemaVersion', 1), ('modelId', X.MODEL_ID), ('coordinates', 'gltf-y-up-meters'),
                        ('views', views), ('pointsOfInterest', cfg.get('pointsOfInterest', [])), ('objects', [])])


def georeference(cfg):
    g = OrderedDict(cfg.get('georeference') or {})
    g = OrderedDict([('schemaVersion', 1), ('modelId', X.MODEL_ID)] + [(k, v) for k, v in g.items() if k not in ('schemaVersion', 'modelId')])
    loc = cfg.get('location', {})
    g.setdefault('status', 'Approximate registration for display and sun studies; not survey control.')
    g.setdefault('frame', 'East, North, Up (ENU)')
    if 'origin_wgs84' not in g and loc:
        g['origin_wgs84'] = [loc.get('longitude'), loc.get('latitude'), (g.get('vertical') or {}).get('origin_height_m', 0.0)]
    g.setdefault('architectural_rotation_degrees', loc.get('enuToModelDegrees', 0.0))
    g.setdefault('model_frame', OrderedDict([('description', cfg.get('frame', 'Revit internal coordinates in metres')),
                                             ('gltf_axes', 'glTF x = Revit X, glTF y = Revit Z (up), glTF z = -Revit Y.'), ('recentered', False)]))
    proj = g.get('projected') or {}
    if proj.get('origin_E') is not None and proj.get('model_y_grid_azimuth_degrees') is not None:
        a = math.radians(proj['model_y_grid_azimuth_degrees'])
        h0 = (g.get('vertical') or {}).get('origin_height_m', 0.0)
        controls = []
        for name, p in [('model origin', (0, 0, 0)), ('20 m along model +X', (20, 0, 0)), ('20 m along model +Y (glTF -z)', (0, 0, -20)), ('10 m above the origin', (0, 10, 0))]:
            x, y, z = p
            Xm, Ym = x, -z
            E = proj['origin_E'] + Xm * math.cos(a) + Ym * math.sin(a)
            N = proj['origin_N'] - Xm * math.sin(a) + Ym * math.cos(a)
            controls.append(OrderedDict([('name', name), ('gltf', list(p)), ('projected', [round(E, 3), round(N, 3)]), ('height_m', round(y + h0, 3))]))
        g['control_points'] = controls
    return g


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--config', type=Path, default=Path('export_config.json'))
    ap.add_argument('--stage', type=Path)
    args = ap.parse_args()
    cfg = X.configure(args.config)
    stage = args.stage or X.EXPORT / 'stage'
    stage.mkdir(parents=True, exist_ok=True)
    v = viewer_json(cfg)
    (stage / 'viewer.json').write_text(json.dumps(v, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    g = georeference(cfg)
    (stage / 'model_georeference.json').write_text(json.dumps(g, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    print(len(v['views']), 'views;', 'georeference keys:', list(g.keys())[:8])


if __name__ == '__main__':
    main()
