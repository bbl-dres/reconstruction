"""Download the posed 360° panoramas (cube faces) of a public Matterport tour.

Uses the same public GraphQL request as matterport-dl (GetShowcaseSweeps), but
fetches only what a splat or photogrammetry experiment needs: the sweep poses
and the six skybox faces per sweep at one resolution. No viewer, mesh or tiles.

    python reconstructions/von-wattenwyl-haus/matterport/download.py https://my.matterport.com/show/?m=r9QzqKWcYwh

Output (gitignored), in matterport/output/panoramas/ by default:
    metadata.json                 model ID, poses, floors, rooms, neighbours; no signed URLs
    sweeps/<sweep>/<res>_face<k>.jpg

Skybox face order, verified on r9QzqKWcYwh: 0 up, 1 front (+X of the sweep),
2 right, 3 back, 4 left, 5 down. See README.md for the camera convention.
"""
import argparse
import concurrent.futures
import json
import re
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
GRAPH_URL = 'https://my.matterport.com/api/mp/models/graph'
# Persisted-query hash used by the Matterport Showcase web player. If Matterport
# changes it, copy the current value from matterport-dl's GRAPH_DATA_REQ.
SWEEPS_QUERY_HASH = '0faff869a8ae9385fe262d18ea1f731bbbeb3d618c036e60a8d0d630ae3526a5'
RESOLUTION_ORDER = ['4k', '2k', 'high', 'low']  # high = 1024 px, low = 512 px faces
USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) matterport-splat-experiment'


class MatterportError(RuntimeError):
    """Matterport answered, but not with what we asked for."""


def model_id(value):
    match = re.search(r'[?&]m=([A-Za-z0-9]+)', value) or re.fullmatch(r'([A-Za-z0-9]{8,})', value)
    if not match:
        raise SystemExit(f'Not a Matterport model URL or ID: {value}')
    return match.group(1)


def request(url, model, timeout=60):
    headers = {'User-Agent': USER_AGENT, 'Referer': f'https://my.matterport.com/show/?m={model}'}
    with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=timeout) as response:
        return response.read()


def fetch_sweeps(model, query_hash):
    query = urllib.parse.urlencode({
        'operationName': 'GetShowcaseSweeps',
        'variables': json.dumps({'modelId': model}, separators=(',', ':')),
        'extensions': json.dumps({'persistedQuery': {'version': 1, 'sha256Hash': query_hash}}, separators=(',', ':')),
    })
    data = json.loads(request(f'{GRAPH_URL}?{query}', model))
    if data.get('errors') or not data.get('data', {}).get('model'):
        raise MatterportError(f'Matterport did not return sweeps: {json.dumps(data.get("errors"))[:500]}\n'
                              'The tour may be private, or the persisted query hash may have changed (--query-hash).')
    return data['data']['model']['locations']


def pick_resolution(location, wanted):
    skyboxes = {s['resolution']: s for s in location['pano']['skyboxes'] if s.get('status') == 'available'}
    if wanted != 'max':
        return skyboxes.get(wanted)
    return next((skyboxes[r] for r in RESOLUTION_ORDER if r in skyboxes), None)


def clean_metadata(model, locations, resolution):
    """Poses and topology only. Signed CDN URLs expire within minutes and are not kept."""
    sweeps = []
    for loc in locations:
        pano = loc['pano']
        sweeps.append({
            'id': loc['id'], 'index': loc['index'], 'label': pano.get('label'), 'sweepUuid': pano['sweepUuid'],
            'placement': pano.get('placement'), 'source': pano.get('source'),
            'floor': (loc.get('floor') or {}).get('meshId'), 'room': (loc.get('room') or {}).get('meshId'),
            'neighbors': loc.get('neighbors', []), 'tags': loc.get('tags', []),
            'floorPosition': loc.get('position'), 'position': pano.get('position'), 'rotation': pano.get('rotation'),
            'resolutions': pano.get('resolutions', []),
        })
    return {
        'modelId': model, 'url': f'https://my.matterport.com/show/?m={model}',
        'retrieved': datetime.now(timezone.utc).isoformat(timespec='seconds'),
        'resolution': resolution,
        'coordinates': 'Matterport world: right-handed, Z up, metres. position = camera centre; '
                       'rotation = quaternion (x, y, z, w) mapping sweep-local axes to world.',
        'faces': {'0': 'up', '1': 'front (+X local)', '2': 'right (-Y local)', '3': 'back (-X local)',
                  '4': 'left (+Y local)', '5': 'down'},
        'sweeps': sweeps,
    }


def complete_jpeg_bytes(data):
    return len(data) > 1000 and data[:2] == b'\xff\xd8' and data.rstrip(b'\0')[-2:] == b'\xff\xd9'


def complete_jpeg(path):
    try:
        return complete_jpeg_bytes(path.read_bytes())
    except OSError:
        return False


class SignedUrls:
    """Skybox URLs carry short-lived tokens; refresh them all when one is rejected."""

    def __init__(self, model, query_hash, resolution):
        self.model, self.query_hash, self.resolution = model, query_hash, resolution
        self.lock = threading.Lock()
        self.generation = 0
        self.refresh()

    def refresh(self):
        self.locations = {loc['pano']['sweepUuid']: loc for loc in fetch_sweeps(self.model, self.query_hash)}
        self.generation += 1

    def url(self, sweep, face):
        skybox = pick_resolution(self.locations[sweep], self.resolution)
        return skybox['urlTemplate'].replace('<face>', str(face)), self.generation

    def expired(self, generation):
        with self.lock:  # one refresh per expiry, however many workers noticed it
            if generation == self.generation:
                print('Signed URLs expired; requesting fresh ones.', flush=True)
                self.refresh()


def download_face(urls, sweep, face, target, attempts=5):
    for attempt in range(attempts):
        url, generation = urls.url(sweep, face)
        try:
            data = request(url, urls.model)
            if not complete_jpeg_bytes(data):
                raise ValueError('incomplete JPEG')
            temporary = target.with_suffix('.part')
            temporary.write_bytes(data)
            temporary.replace(target)
            return len(data)
        except urllib.error.HTTPError as error:
            if error.code in (401, 403):
                urls.expired(generation)
            elif error.code == 404:
                raise
            else:
                time.sleep(2 ** attempt)
        except (urllib.error.URLError, TimeoutError, ValueError):
            time.sleep(2 ** attempt)
    raise RuntimeError(f'Could not download {sweep} face {face} after {attempts} attempts')


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    parser.add_argument('model', help='Matterport show URL or model ID')
    parser.add_argument('--resolution', default='max', choices=['max', *RESOLUTION_ORDER],
                        help='Skybox face size: 4k=4096, 2k=2048, high=1024, low=512 px; max picks the largest available')
    parser.add_argument('--out', type=Path, default=HERE / 'output' / 'panoramas', help='Output folder (default: matterport/output/panoramas)')
    parser.add_argument('--workers', type=int, default=4, help='Parallel downloads; keep this modest')
    parser.add_argument('--include-unplaced', action='store_true', help='Also download uploaded 360 photos that have no pose')
    parser.add_argument('--limit', type=int, help='Download only the first N sweeps (for a quick trial)')
    parser.add_argument('--query-hash', default=SWEEPS_QUERY_HASH, help='GetShowcaseSweeps persisted-query hash')
    args = parser.parse_args()

    model = model_id(args.model)
    try:
        urls = SignedUrls(model, args.query_hash, args.resolution)
    except (MatterportError, urllib.error.URLError) as error:
        raise SystemExit(str(error))
    locations = list(urls.locations.values())
    root = args.out
    root.mkdir(parents=True, exist_ok=True)

    chosen = [loc for loc in locations if args.include_unplaced or loc['pano'].get('placement') != 'unplaced']
    chosen.sort(key=lambda loc: loc['index'])
    if args.limit:
        chosen = chosen[:args.limit]
    sizes = {loc['pano']['sweepUuid']: pick_resolution(loc, args.resolution) for loc in chosen}
    missing = [loc['pano']['label'] for loc in chosen if sizes[loc['pano']['sweepUuid']] is None]
    if missing:
        raise SystemExit(f'Resolution {args.resolution} unavailable for sweeps {missing}')
    resolution = sorted({s['resolution'] for s in sizes.values()}, key=RESOLUTION_ORDER.index)
    if len(resolution) != 1:
        raise SystemExit(f'Sweeps differ in maximum resolution {resolution}; pass --resolution explicitly.')
    resolution = resolution[0]

    metadata = clean_metadata(model, locations, resolution)
    (root / 'metadata.json').write_text(json.dumps(metadata, indent=2), encoding='utf-8')
    unplaced = sum(1 for loc in locations if loc['pano'].get('placement') == 'unplaced')
    print(f'{model}: {len(locations)} sweeps ({unplaced} unplaced), downloading {len(chosen)} at {resolution} '
          f'-> {len(chosen) * 6} faces into {root}', flush=True)

    jobs = []
    for loc in chosen:
        sweep = loc['pano']['sweepUuid']
        folder = root / 'sweeps' / sweep
        folder.mkdir(parents=True, exist_ok=True)
        for face in range(6):
            target = folder / f'{resolution}_face{face}.jpg'
            if not complete_jpeg(target):
                jobs.append((sweep, face, target))
    print(f'{len(chosen) * 6 - len(jobs)} faces already present; {len(jobs)} to fetch.', flush=True)

    done = total = 0
    failures = []
    start = time.time()
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, args.workers)) as pool:
        futures = {pool.submit(download_face, urls, *job): job for job in jobs}
        for future in concurrent.futures.as_completed(futures):
            try:
                total += future.result()
            except Exception as error:  # report every failure, keep the rest
                failures.append((futures[future][2].relative_to(root).as_posix(), str(error)))
            done += 1
            if done % 60 == 0 or done == len(jobs):
                print(f'  {done}/{len(jobs)} faces, {total / 1e6:.0f} MB, {time.time() - start:.0f} s', flush=True)
    for path, error in failures:
        print(f'FAILED {path}: {error}', file=sys.stderr)
    return 1 if failures else 0


if __name__ == '__main__':
    sys.exit(main())
