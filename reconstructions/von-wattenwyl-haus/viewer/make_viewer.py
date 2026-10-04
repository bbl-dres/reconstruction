"""Turn a trained splat into a standalone HTML viewer.

Uses LichtFeld Studio's HTML export (PlayCanvas SuperSplat viewer) and adapts
it to Matterport coordinates: the export assumes a COLMAP-style Y-down world,
while these splats are Z-up, so the splat is re-oriented and the start camera
is placed at a capture position inside the building. It also adds the page
buttons (Help, View on GitHub, All reconstructions) and a loading card from
overlay.html, and fixes the viewer for phones (see FIXES).

The splat either streams as level-of-detail chunks (--lod) or is embedded:

- --lod builds lighter levels with PlayCanvas splat-transform (Node.js) into a
  folder named like the page. The viewer loads coarse levels first and refines
  them; phones use lighter levels than desktops. Needs a web server.
- Embedded, the page also opens offline by double-click. LichtFeld puts the
  splat in the page head, so a browser would show nothing until the whole page
  had arrived; it is moved into script chunks at the end of the page instead,
  so the buttons and loading card appear at once and show the download progress.

    python reconstructions/von-wattenwyl-haus/viewer/make_viewer.py lichtfeld/output/full/splat_60000.ply ^
        --lichtfeld C:/path/to/LichtFeld-Studio/bin/LichtFeld-Studio.exe --out viewer/output/lichtfeld.html --lod

Pass an existing viewer (.html) instead of a splat to update its buttons and
fixes in place, without converting the splat again.

Viewers in viewer/output/ are committed and published with the site.
"""
import argparse
import base64
import html as markup
import io
import json
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
OVERLAY = HERE / 'overlay.html'
DEFAULT_TITLE = 'Beatrice von Wattenwyl-Haus · Gaussian splat'
SPLAT_TRANSFORM = '@playcanvas/splat-transform@3.9.0'
# Share of the trained splat kept per level of detail. The viewer uses levels
# 0-2 on desktops and 2-5 on phones, so phones get at most about a third.
LOD_SHARES = (1, 0.6, 0.35, 0.15, 0.06, 0.025)
# Phones draw levels 2-5 and desktops 0-2 (fixed in the viewer). For splats above 3 million, levels 2-5 keep the
# counts of a 3 million splat, so phones draw no more than 1.05 million; level 1 lies halfway (geometric mean).
PHONE_LEVELS = (1_050_000, 450_000, 180_000, 75_000)
LOD_CHUNK_EXTENT = 5  # metres: room-sized chunks, so detail follows the camera through the house

# The viewer's loader creates the splat entity itself and hard-codes a COLMAP-style
# 180° roll; the <pc-entity name="splat"> in the markup is an empty placeholder.
# -90° about X maps (x, y, z) to (x, z, -y): Matterport Z-up to viewer Y-up.
SPLAT_ROTATION = re.compile(r"(new Entity\('gsplat'\);\s*entity\.setLocalEulerAngles\()(?:0, 0, 180|-90, 0, 0)(\))")
# Viewer fixes, applied once each: (marker left in the code, pattern of the original code, replacement).
FIXES = (
    # High quality renders at the full device pixel ratio: up to 9x the pixels on
    # a phone, too slow for a 3 million splat. Touch screens start in low quality.
    ("hqMode: !matchMedia('(pointer: coarse)').matches",
     re.compile(r'(readyToRender: false,\s*hqMode: )true(,)'), r"\1!matchMedia('(pointer: coarse)').matches\2"),
    # Touch fly mode split the screen: the left half was a joystick that moved the
    # camera, only the right half looked around. One finger now looks around anywhere...
    ('make_viewer: one finger looks around anywhere',
     re.compile(r'const left = clientX < window\.innerWidth \* 0\.5;'),
     'const left = false; /* make_viewer: one finger looks around anywhere */'),
    # ...but not while two fingers pinch...
    ('make_viewer: no looking around while pinching',
     re.compile(r'\} else \{(\s*)this\.deltas\.rightInput\.append\(\['),
     r'} else if (this._pointerData.size === 1) { /* make_viewer: no looking around while pinching */\1this.deltas.rightInput.append(['),
    # ...pinching moves forward and back instead (1 cm per pixel of finger spread)...
    ('make_viewer: in fly mode, pinching moves',
     re.compile(r'v\.add\(pinchMove\.mulScalar\(orbit \* double \* this\.pinchSpeed \* dt\)\);'),
     'v.add(pinchMove.mulScalar(orbit * double * this.pinchSpeed * dt - fly * double * 0.01)); // make_viewer: in fly mode, pinching moves forward'),
    # ...and the look rate is per pixel: it was scaled by the frame time, so a
    # slow phone turned several times as far for the same swipe.
    ('make_viewer: touch look per pixel',
     re.compile(r'v\.add\(flyRotate\.mulScalar\(fly \* this\.orbitSpeed \* orbitFactor \* dt\)\);'),
     'v.add(flyRotate.mulScalar(fly * 1.5 * camera.fov / window.innerHeight)); // make_viewer: touch look per pixel, not per frame time'),
    # A double tap counted only if both taps landed within 8 px, mouse precision; fingers get 24 px.
    ('make_viewer: finger-sized double tap',
     re.compile(r'Math\.abs\(event\.clientX - lastTap\.x\) < 8 &&(\s*)Math\.abs\(event\.clientY - lastTap\.y\) < 8\)'),
     "Math.abs(event.clientX - lastTap.x) < (event.pointerType === 'touch' ? 24 : 8) &&\\1"
     "Math.abs(event.clientY - lastTap.y) < (event.pointerType === 'touch' ? 24 : 8)) /* make_viewer: finger-sized double tap */"),
    # The walking (fly) camera can jump instead of gliding, for prefers-reduced-motion...
    ('make_viewer: optional jump',
     re.compile(r'goto\(pose\) \{(\s*)this\.controller\.attach\(pose, true\);'),
     'goto(pose, smooth = true) { /* make_viewer: optional jump */\\1this.controller.attach(pose, smooth);'),
    # ...and a double tap or double-click walks to the tapped spot. It switched to the orbit
    # camera instead, after which one finger orbited a point rather than looking around.
    # The floor (or a stair below) is where to stand, at eye height (kept unless the floor is more than
    # 0.35 m higher or lower: stairs, not noise); a wall, picture or piece
    # of furniture is walked up to at the same height, stopping 0.6 m in front; at most 10 m
    # per tap. The view direction stays. Orbit mode keeps its own double tap.
    ('make_viewer: a double tap walks there (2)',
     re.compile(r"events\.on\('pick', \(position\) => \{(\s*)(?:// make_viewer: a double tap walks there.*?return;\s*\}\s*)?"
                r"// switch to orbit camera on pick", re.S),  # also replaces an earlier version of this fix
     """events.on('pick', (position) => {\\1// make_viewer: a double tap walks there (2) (walking camera only)
            if (state.cameraMode === 'fly') {
                const from = this.camera.position;
                const target = new Vec3();
                if (from.y - position.y > 1.0) {
                    const eye = position.y + 1.5;
                    target.set(position.x, Math.abs(eye - from.y) > 0.35 ? eye : from.y, position.z);
                }
                else {
                    target.set(position.x - from.x, 0, position.z - from.z);
                    const length = target.length();
                    target.mulScalar(length > 0.6 ? (length - 0.6) / length : 0).add(from);
                }
                const step = target.clone().sub(from);
                if (step.length() > 10) {
                    target.copy(from).add(step.mulScalar(10 / step.length()));
                }
                const pose = new Pose();
                pose.position.copy(target);
                pose.angles.copy(this.camera.angles);
                pose.distance = this.camera.distance;
                controllers.fly.goto(pose, !matchMedia('(prefers-reduced-motion: reduce)').matches);
                return;
            }\\1// switch to orbit camera on pick"""),
    # Where the picker finds no surface (thin or transparent splat, often the floor close by), a
    # double tap in walk mode still walks: 3 m along the tapped direction.
    ('make_viewer: walk where nothing is picked',
     re.compile(r"(const result = await picker\.pick\(event\.offsetX, event\.offsetY\);\s*if \(result\) \{\s*events\.fire\('pick', result\);(\s*)\})"),
     r"\1\2else if (state.cameraMode === 'fly') { /* make_viewer: walk where nothing is picked */\2"
     r"    events.fire('pick', camera.camera.screenToWorld(event.offsetX, event.offsetY, 3));\2}"),
    # Streamed splats: the viewer stopped rendering once the coarse levels were
    # shown, so data arriving after the camera stopped was not drawn. And it set
    # the device's level range inside this event, but the engine clears its
    # change flag at the end of that frame, so desktops never loaded the finer
    # levels. Switch the range after the frame and keep rendering while levels
    # load or sort. (The pattern also matches an earlier version of this fix.)
    ('make_viewer: switch levels after the first frame',
     re.compile(r"const readyHandler = \(camera, layer, ready, loading\) => \{.*?eventHandler\.on\('frame:ready', readyHandler\);", re.S),
     """const readyHandler = (camera, layer, ready, loading) => {
                    // make_viewer: switch levels after the first frame, keep rendering while levels stream in or sort
                    if (ready && !loading && !state.readyToRender) {
                        // coarse levels are in: show them, then refine to the device's range
                        this.forceRenderNextFrame = false;
                        state.readyToRender = true;
                        app.once('frameend', () => {
                            events.fire('firstFrame');
                            window.firstFrame?.();
                            const range = platform.mobile ? low : high;
                            gsplat.lodRangeMin = range[0];
                            gsplat.lodRangeMax = range[1];
                            app.renderNextFrame = true;
                        });
                        app.renderNextFrame = true;
                    }
                    else if (state.readyToRender ? loading || !ready : ready) {
                        app.renderNextFrame = true;
                    }
                    // update loading status
                    if (!state.readyToRender && loading !== current) {
                        watermark = Math.max(watermark, loading);
                        current = watermark - loading;
                        state.progress = Math.trunc(current / watermark * 100);
                    }
                };
                eventHandler.on('frame:ready', readyHandler);"""),
)
SETTINGS = re.compile(r'settings:\s*(\{"camera".*?"animTracks":\[[^\]]*\]\})')
CONTENT_URL = re.compile(r"(url\.searchParams\.get\('content'\) : )'([^']*)'")
SPLAT_DATA_URL = re.compile(r'fetch\("data:application/octet-stream;base64,([A-Za-z0-9+/=]+)"\)')
SPLAT_REFERENCE = 'window.rcSplat.response'  # set by overlay.html
SPLAT_STREAMED = 'contents: undefined'
SPLAT_CHUNK = re.compile(r'<script>rcSplat\.add\("([A-Za-z0-9+/=]*)",[0-9.]+\)</script>\n')
SPLAT_DONE = '<script>rcSplat.done()</script>\n'
SPLAT_STREAM = '<script>rcSplat.stream()</script>\n'
CHUNK = 1 << 20  # base64 characters per script, a multiple of 4 so each chunk decodes on its own
OVERLAY_BLOCK = re.compile(r'<!-- reconstruction overlay:.*?<!-- /reconstruction overlay -->\n?', re.S)


def to_viewer(point):
    x, y, z = point
    return [round(x, 4), round(z, 4), round(-y, 4)]


def metadata_from_dataset(folder, neighbour_distance=3.0):
    """A stand-in for Matterport's metadata from a dataset's own camera positions (alignment/to_dataset.py), for
    splats trained without Matterport's 3D data: one sweep per position, neighbours within neighbour_distance metres
    in 3D. Floors are not separated (positions on the stairs bridge them), but storeys about 4 m apart are never
    neighbours, so the start view stays on one floor."""
    centres = {}
    for frame in json.loads((folder / 'transforms.json').read_text(encoding='utf-8'))['frames']:
        index = int(re.search(r's(\d+)_f\d', frame['file_path']).group(1))
        centres[index] = [row[3] for row in frame['transform_matrix'][:3]]
    sweeps = [{'id': f's{i:03d}', 'index': i, 'placement': 'own', 'floor': 0, 'position': dict(zip('xyz', c))}
              for i, c in sorted(centres.items())]
    for a in sweeps:
        a['neighbors'] = [b['id'] for b in sweeps if b is not a and math.dist(centres[a['index']], centres[b['index']]) < neighbour_distance]
    return {'sweeps': sweeps}


def placed(metadata):
    return [s for s in metadata['sweeps'] if s['placement'] != 'unplaced']


def start_view(metadata, index, toward=None):
    """Camera at a sweep's optical centre, looking towards its farthest connected neighbour (or the sweep `toward`).

    Splats are sharpest along long sightlines and weakest on surfaces close to
    the camera, so the opening view looks down an enfilade rather than at a wall.
    """
    sweeps = {s['id']: s for s in placed(metadata)}
    sweep = next((s for s in sweeps.values() if s['index'] == index), None) if index is not None else None
    if sweep is None:
        # The best-connected sweep usually sits in a hall with long views.
        sweep = max(sweeps.values(), key=lambda s: sum(n in sweeps for n in s['neighbors']))
    p = sweep['position']
    same_floor = [sweeps[n]['position'] for n in sweep['neighbors'] if n in sweeps and sweeps[n]['floor'] == sweep['floor']]
    far = max(same_floor, key=lambda q: math.hypot(q['x'] - p['x'], q['y'] - p['y']))
    if toward is not None:
        far = next(s['position'] for s in sweeps.values() if s['index'] == toward)
    direction = [far['x'] - p['x'], far['y'] - p['y']]
    length = math.hypot(*direction) or 1
    position = [p['x'], p['y'], p['z']]
    target = [p['x'] + 2 * direction[0] / length, p['y'] + 2 * direction[1] / length, p['z']]
    return sweep['index'], to_viewer(position), to_viewer(target)


def capture_box(metadata):
    """The capture positions plus a margin, in splat coordinates: everything outside is floaters."""
    points = [s['position'] for s in placed(metadata)]
    low = [min(p[k] for p in points) for k in 'xyz']
    high = [max(p[k] for p in points) for k in 'xyz']
    return [low[0] - 10, low[1] - 10, low[2] - 4, high[0] + 10, high[1] + 10, high[2] + 6]


def read(path):
    with open(path, encoding='utf-8', newline='') as file:  # keep line endings: chunk offsets count bytes
        return file.read()


def ply_count(path):
    with open(path, 'rb') as file:
        for line in file:
            if line.startswith(b'element vertex'):
                return int(line.split()[2])
    raise SystemExit(f'{path}: no vertex count in the PLY header.')


def lod_counts(count):
    """Gaussians per level of detail: shares of the splat up to 3 million, beyond that fixed phone levels."""
    if count <= 3_000_000:
        return [round(count * share) for share in LOD_SHARES]
    return [count, round((count * PHONE_LEVELS[0]) ** 0.5), *PHONE_LEVELS]


def build_bundle(splat, folder, box, scratch):
    """Write the levels of detail of a splat as a streamed SOG bundle (folder/lod-meta.json); returns the coarsest level."""
    npx = shutil.which('npx')
    if not npx:
        raise SystemExit('--lod needs Node.js (npx) for PlayCanvas splat-transform.')
    run = lambda *args: subprocess.run([npx, '-y', SPLAT_TRANSFORM, '-q', '-w', *map(str, args)], check=True)
    # splat-transform filters in PlayCanvas space, the PLY turned 180° about Z: (x, y, z) -> (-x, -y, z).
    x0, y0, z0, x1, y1, z1 = box
    crop = ['-B', ','.join(f'{v:.2f}' for v in (-x1, -y1, z0, -x0, -y0, z1)), '-N']
    count = ply_count(splat)
    levels = [splat]
    for index, target in enumerate(lod_counts(count)[1:], 1):
        levels.append(Path(scratch) / f'lod{index}.ply')
        run(splat, *crop, '-d', target, levels[-1])
        print(f'level {index}: {target:,} Gaussians')
    if folder.exists():
        if not (folder / 'lod-meta.json').is_file():
            raise SystemExit(f'{folder} exists and is not a splat bundle; not replacing it.')
        shutil.rmtree(folder)
    inputs = []
    for index, level in enumerate(levels):
        inputs += [level, *(crop if index == 0 else []), '-l', index]
    run(*inputs, folder / 'lod-meta.json', '--lod-chunk-extent', LOD_CHUNK_EXTENT)
    return levels[-1]


def bundle_of(html, page):
    """For a streamed viewer: its bundle URL and the full-detail Gaussian count."""
    url = CONTENT_URL.search(html).group(2)
    meta = json.loads((page.parent / url).read_text(encoding='utf-8'))
    return url, meta['counts'][0]


def take_splat(html):
    """Remove the embedded splat, from LichtFeld's data URL or earlier chunks. Returns the page and the base64 SOG (None if streamed)."""
    html = html.replace(SPLAT_STREAM, '')
    match = SPLAT_DATA_URL.search(html)
    if match:
        return html[:match.start()] + SPLAT_REFERENCE + html[match.end():], match.group(1)
    if SPLAT_STREAMED in html:
        return html, None
    chunks = SPLAT_CHUNK.findall(html)
    if not chunks or SPLAT_REFERENCE not in html:
        raise SystemExit('Unexpected viewer layout: embedded splat not found.')
    return SPLAT_CHUNK.sub('', html).replace(SPLAT_DONE, ''), ''.join(chunks)


def splat_count(data):
    with zipfile.ZipFile(io.BytesIO(base64.b64decode(data))) as sog:
        return json.loads(sog.read('meta.json'))['count']


def add_overlay(html, count, note=None):
    """Insert overlay.html right after <body>, replacing an earlier copy; keeps the earlier note unless one is given."""
    previous = OVERLAY_BLOCK.search(html)
    if note is None:
        kept = previous and re.search(r'data-note="([^"]*)"', previous.group(0))
        note = markup.unescape(kept.group(1)) if kept else ''
    html = OVERLAY_BLOCK.sub('', html)
    stats = ' · '.join(filter(None, [f'{count / 1e6:.1f} million Gaussians', note]))
    block = OVERLAY.read_text(encoding='utf-8').replace('{{note}}', markup.escape(note)).replace('{{stats}}', markup.escape(stats))
    body = re.search(r'<body[^>]*>\n?', html).end()
    return html[:body] + block + html[body:]


def add_splat(html, data):
    """Append the splat as script chunks before </body>, each with the share of the page received once it has run."""
    end = html.rindex('</body>')
    if data is None:  # streamed: the overlay follows the viewer's own loading
        html = html[:end] + SPLAT_STREAM + html[end:]
        return html.replace('{{page_mb}}', f'{len(html.encode("utf-8")) / 1e6:.0f}')
    pieces = [data[i:i + CHUNK] for i in range(0, len(data), CHUNK)]
    script = lambda piece, fraction: f'<script>rcSplat.add("{piece}",{fraction:.4f})</script>\n'
    before = len(html[:end].encode('utf-8'))
    total = len(html.encode('utf-8')) + sum(len(script(piece, 0)) for piece in pieces) + len(SPLAT_DONE)
    scripts, received = [], before
    for piece in pieces:
        received += len(script(piece, 0))
        scripts.append(script(piece, received / total))
    html = html[:end] + ''.join(scripts) + SPLAT_DONE + html[end:]
    return html.replace('{{page_mb}}', f'{total / 1e6:.0f}')


def patch(html, title=None, camera=None, note=None, stream=None):
    """Apply all corrections; safe to run again on a patched viewer.

    stream: (bundle URL, Gaussian count) to make the viewer stream that bundle
    instead of the embedded splat.
    """
    html, count = SPLAT_ROTATION.subn(r'\g<1>-90, 0, 0\2', html)
    if count != 1:
        raise SystemExit('Unexpected LichtFeld HTML layout: splat rotation not found. Check the LichtFeld version.')
    for marker, pattern, replacement in FIXES:
        if marker not in html:
            html, count = pattern.subn(lambda m: m.expand(replacement), html)
            if count != 1:
                raise SystemExit(f'Unexpected LichtFeld HTML layout: cannot apply "{marker}". Check the LichtFeld version.')
    if camera:
        match = SETTINGS.search(html)
        if not match:
            raise SystemExit('Unexpected LichtFeld HTML layout: viewer settings not found.')
        settings = json.loads(match.group(1))
        settings['camera'].update(camera)
        html = html[:match.start(1)] + json.dumps(settings, separators=(',', ':')) + html[match.end(1):]
    if title:
        html = re.sub(r'<title>[^<]*</title>', lambda _: f'<title>{markup.escape(title, quote=False)}</title>', html, count=1)
    html, data = take_splat(html)
    if stream:
        url, count = stream
        html = CONTENT_URL.sub(lambda m: f"{m.group(1)}'{url}'", html, count=1).replace(SPLAT_REFERENCE, 'undefined')
        data = None
    elif data is None:
        raise SystemExit('A streamed viewer needs its bundle (internal error).')
    else:
        count = splat_count(data)
    return add_splat(add_overlay(html, count, note), data)


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    parser.add_argument('source', type=Path, help='Trained splat (.ply), or an existing viewer (.html) to update')
    parser.add_argument('--out', type=Path, help='Output HTML (default: viewer/output/viewer.html; for an .html source, the source itself)')
    parser.add_argument('--lod', action='store_true', help='Stream levels of detail from a folder named like the page instead of embedding the splat')
    parser.add_argument('--lichtfeld', default=os.environ.get('LICHTFELD_STUDIO'), help='LichtFeld-Studio.exe (or set LICHTFELD_STUDIO)')
    parser.add_argument('--metadata', type=Path, default=HERE.parent / 'matterport' / 'output' / 'panoramas' / 'metadata.json')
    parser.add_argument('--dataset', type=Path, help="Take capture positions from this dataset's transforms.json instead of "
                                                     "Matterport's metadata (splats trained on alignment/to_dataset.py poses)")
    parser.add_argument('--sweep', type=int, help='Sweep index for the start camera (default: best-connected sweep)')
    parser.add_argument('--toward', type=int, help='Sweep index the start camera looks towards (default: the farthest connected '
                                                   'neighbour; with --dataset, neighbours are only nearby positions, so the published '
                                                   'viewers use --sweep 27 --toward 0, down the enfilade)')
    parser.add_argument('--fov', type=float, help='Vertical field of view in degrees (default: 70)')
    parser.add_argument('--title', help=f'Page title (default: "{DEFAULT_TITLE}")')
    parser.add_argument('--note', help='Shown after the splat count in Help, e.g. the trainer and run')
    args = parser.parse_args()
    # Only a new start camera or a level-of-detail crop needs the capture positions.
    metadata = lambda: (metadata_from_dataset(args.dataset) if args.dataset
                        else json.loads(args.metadata.read_text(encoding='utf-8')))
    # An existing viewer keeps its camera, title and note unless new ones are given.
    update = args.source.suffix.lower() == '.html'
    camera = None
    if not update or args.sweep is not None or args.fov is not None or args.toward is not None:
        index, position, target = start_view(metadata(), args.sweep, args.toward)
        camera = {'position': position, 'target': target, 'fov': args.fov or 70}

    stream = None
    if update:
        if args.lod:
            raise SystemExit('--lod needs the trained splat (.ply), not a viewer.')
        out = args.out or args.source
        html = read(args.source)
        if SPLAT_STREAMED in html:
            stream = bundle_of(html, args.source)
    else:
        if not args.lichtfeld or not Path(args.lichtfeld).is_file():
            raise SystemExit('Pass --lichtfeld path/to/LichtFeld-Studio.exe or set LICHTFELD_STUDIO.')
        out = args.out or HERE / 'output' / 'viewer.html'
        with tempfile.TemporaryDirectory() as scratch:
            template = args.source
            if args.lod:
                folder = out.with_suffix('')
                # LichtFeld provides the viewer page; its coarsest level converts in seconds.
                template = build_bundle(args.source, folder, capture_box(metadata()), scratch)
                stream = (f'./{folder.name}/lod-meta.json', ply_count(args.source))
            exported = Path(scratch) / 'viewer.html'
            subprocess.run([args.lichtfeld, 'convert', str(template), str(exported), '-f', 'html', '-y'], check=True)
            html = read(exported)
    html = patch(html, args.title or (None if update else DEFAULT_TITLE), camera, args.note, stream)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html, encoding='utf-8', newline='')
    print(f'{out} ({out.stat().st_size / 1e6:.0f} MB)' + (f', streams {stream[0]}' if stream else '')
          + (f', starting at sweep {index}' if camera else ''))
    return 0


if __name__ == '__main__':
    sys.exit(main())
