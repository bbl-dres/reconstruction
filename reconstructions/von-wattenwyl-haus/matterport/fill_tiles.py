"""Rebuild missing panorama tiles in a matterport-dl archive from its skybox faces.

Matterport's CDN answered most tile requests with HTTP 429 (rate limited), but
the same imagery is archived as whole skybox faces. Tiles are 512 px crops:
<level>_face<f>_<x>_<y>.jpg is column x, row y of the face at that level.

    python reconstructions/von-wattenwyl-haus/matterport/fill_tiles.py

Levels: 2k = 4 x 4 crops of the 2048 px face, 1k = 2 x 2 crops of the 1024 px
("high") face, 512 = the 1024 px face downscaled (no 512 px face is published).
Existing downloaded tiles are kept and used to verify the layout. Every rebuilt
file is listed in tiles-generated.json at the archive root.
"""
import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent

TILE = 512
LEVELS = (('2k', '2k', 4), ('1k', 'high', 2), ('512', 'high', 1))  # tile level, skybox folder, tiles per side


def tiles_for(faces, level, source, per_side):
    image = faces[source]
    if per_side * TILE != image.width:
        image = image.resize((per_side * TILE,) * 2, Image.Resampling.LANCZOS)
    for x in range(per_side):
        for y in range(per_side):
            yield x, y, image.crop((x * TILE, y * TILE, (x + 1) * TILE, (y + 1) * TILE))


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    parser.add_argument('archive', type=Path, nargs='?', help='matterport-dl model folder (default: the tour in matterport/output/tour/)')
    parser.add_argument('--quality', type=int, default=92, help='JPEG quality of rebuilt tiles')
    args = parser.parse_args()
    if args.archive is None:
        tours = [p for p in (HERE / 'output' / 'tour').glob('*') if p.is_dir()]
        if len(tours) != 1:
            raise SystemExit('Pass the matterport-dl model folder; output/tour/ does not hold exactly one tour.')
        args.archive = tours[0]

    # Tiles rebuilt by an earlier run stay recorded and are never mistaken for downloads.
    record_path = args.archive / 'tiles-generated.json'
    earlier = set(json.loads(record_path.read_text(encoding='utf-8'))['files']) if record_path.exists() else set()
    generated, differences = [], {level: [] for level, _, _ in LEVELS}
    for assets in sorted(args.archive.glob('models/*/assets')):
        skyboxes = assets / 'pan' / 'high' / '~'
        sweeps = sorted({re.sub(r'_skybox\d\.jpg$', '', p.name) for p in skyboxes.glob('*_skybox[0-5].jpg')})
        for sweep in sweeps:
            folder = assets / '~' / 'tiles' / sweep
            folder.mkdir(parents=True, exist_ok=True)
            for face in range(6):
                faces = {}
                for name in ('high', '2k'):
                    path = assets / 'pan' / name / '~' / f'{sweep}_skybox{face}.jpg'
                    if path.exists():
                        faces[name] = Image.open(path).convert('RGB')
                for level, source, per_side in LEVELS:
                    if source not in faces:
                        continue
                    for x, y, tile in tiles_for(faces, level, source, per_side):
                        target = folder / f'{level}_face{face}_{x}_{y}.jpg'
                        if target.exists():
                            if target.relative_to(args.archive).as_posix() in earlier:
                                continue
                            original = np.asarray(Image.open(target).convert('L'), float)
                            differences[level].append(float(np.abs(original - np.asarray(tile.convert('L'), float)).mean()))
                            continue
                        tile.save(target, quality=args.quality)
                        generated.append(target.relative_to(args.archive).as_posix())
    verification = {level: {'downloadedTilesCompared': len(v), 'meanAbsDifference': round(float(np.mean(v)), 3) if v else None}
                    for level, v in differences.items()}
    rebuilt = len(generated)
    generated = sorted(earlier | set(generated))
    record = {
        'created': datetime.now(timezone.utc).isoformat(timespec='seconds'),
        'reason': 'Matterport CDN returned HTTP 429 for these tile requests; rebuilt from archived skybox faces.',
        'method': {'2k': '4x4 crops of pan/2k skybox (2048 px)', '1k': '2x2 crops of pan/high skybox (1024 px)',
                   '512': 'pan/high skybox (1024 px) downscaled with Lanczos'},
        'verification': verification, 'jpegQuality': args.quality, 'files': generated,
    }
    record_path.write_text(json.dumps(record, indent=1), encoding='utf-8')
    print(f'Rebuilt {rebuilt} tiles ({len(generated)} recorded in total); verification against downloaded tiles (grey levels): {json.dumps(verification)}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
