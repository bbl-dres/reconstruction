// Screenshots of the same saved cameras in several viewer set-ups, and how much they differ: for
// checking that a rendering change keeps the picture (e.g. ?batch=1 against the default) and for
// side-by-side review of intended changes. Read-only; no packages. With `python tools/serve.py --port 8047`:
//   node viewer/perf/compare-views.mjs --building bundeshaus --out <folder> [--variant name=query ...] [--old-glass]
// Variants default to "default" (no extra query) and "batch" (batch=1). --old-glass adds "transmission":
// the default viewer with glass.js replaced in memory by a no-op, i.e. glass drawn with refraction as before.
// Prints, per view, the share of pixels that differ visibly from the first variant; PNGs go to --out.
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { inflateSync } from 'node:zlib';
import path from 'node:path';

const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const building = option('building', 'bundeshaus');
const out = option('out', path.join(tmpdir(), 'viewer-views'));
const port = option('port', '8047'), cdpPort = option('cdp', '9347');
const browserPath = option('browser', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe');
const variants = [];
args.forEach((arg, i) => { if (arg === '--variant') { const [name, query = ''] = args[i + 1].split(/=(.*)/s); variants.push({ name, query }); } });
if (!variants.length) variants.push({ name: 'default', query: '' }, { name: 'batch', query: 'batch=1' });
if (args.includes('--old-glass')) variants.push({ name: 'transmission', query: '', oldGlass: true });
// Cameras: the building's own saved views with explicit cameras, as link parameters.
const cameras = {
  bundeshaus: {
    exterior: 'view=3d&floor=all&pos=79.16746,73.66085,-104.93562&target=0.90813,20.115,6.275',
    dollhouse: 'view=dollhouse&floor=all&pos=76.98406,99.87851,-98.49021&target=0.92058,11.805,9.6',
    plan: 'view=floorplan&floor=principal&pos=0.98689,158.16,7.41794&target=0.98689,7.53,7.41794&height=90.33016',
    'states-chamber': 'view=3d&floor=all&pos=8.5184,14.8792,-14.3003&target=-1.0388,10.4792,-19.1171',
    'north-foyer': 'view=3d&floor=all&pos=0,2.2874,-22.1916&target=0,3.2794,-8.6285',
  },
  'landgut-lohn': { exterior: '', dollhouse: 'view=dollhouse' },
  roemerholz: { exterior: 'view=3d&floor=all&pos=40,40,50&target=-15,0,-2' },
}[building] || { exterior: '' };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Minimal PNG reader (8-bit RGB/RGBA, no interlace), enough for browser screenshots.
function readPNG(buffer) {
  let offset = 8, width, height, channels;
  const data = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset), type = buffer.toString('latin1', offset + 4, offset + 8);
    const chunk = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') { width = chunk.readUInt32BE(0); height = chunk.readUInt32BE(4); channels = { 2: 3, 6: 4 }[chunk[9]]; }
    if (type === 'IDAT') data.push(chunk);
    offset += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(data)), stride = width * channels, pixels = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? pixels[y * stride + x - channels] : 0, b = y ? pixels[(y - 1) * stride + x] : 0, c = x >= channels && y ? pixels[(y - 1) * stride + x - channels] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const predictor = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][filter];
      pixels[y * stride + x] = (line[x] + predictor) & 255;
    }
  }
  return { width, height, channels, pixels };
}
function difference(first, second) {
  const a = readPNG(first), b = readPNG(second);
  let differing = 0;
  for (let i = 0, n = a.width * a.height; i < n; i++) {
    let delta = 0;
    for (let c = 0; c < 3; c++) delta = Math.max(delta, Math.abs(a.pixels[i * a.channels + c] - b.pixels[i * b.channels + c]));
    if (delta > 24) differing++;
  }
  return differing / (a.width * a.height);
}

mkdirSync(out, { recursive: true });
const results = {};
for (const variant of variants) {
  const profile = mkdtempSync(path.join(tmpdir(), 'viewer-perf-'));
  const browser = spawn(browserPath, [`--remote-debugging-port=${cdpPort}`, `--user-data-dir=${profile}`, '--headless=new', '--no-first-run',
    '--disable-extensions', '--ignore-gpu-blocklist', '--window-size=1600,900', 'about:blank'], { stdio: 'ignore' });
  try {
    let target;
    for (let i = 0; i < 100 && !target; i++) {
      try { target = (await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json()).find(t => t.type === 'page'); } catch { await sleep(200); }
    }
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    let id = 0; const pending = new Map(), handlers = [];
    socket.onmessage = event => { const m = JSON.parse(event.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } else handlers.forEach(h => h(m)); };
    const send = (method, params = {}) => new Promise(resolve => { pending.set(++id, resolve); socket.send(JSON.stringify({ id, method, params })); });
    const errors = [];
    handlers.push(m => {
      if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description?.split('\n')[0]);
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map(a => a.value ?? a.description).join(' ').split('\n')[0]);
      if (m.method === 'Fetch.requestPaused') send('Fetch.fulfillRequest', { requestId: m.params.requestId, responseCode: 200,
        responseHeaders: [{ name: 'Content-Type', value: 'text/javascript' }], body: Buffer.from('export function blendGlass() { return false; }\n').toString('base64') });
    });
    await send('Runtime.enable');
    await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
    if (variant.oldGlass) await send('Fetch.enable', { patterns: [{ urlPattern: '*viewer/js/glass.js*', requestStage: 'Request' }] });
    await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
    results[variant.name] = { errors };
    for (const [view, camera] of Object.entries(cameras)) {
      const query = [variant.query, camera].filter(Boolean).join('&');
      await send('Page.navigate', { url: `http://127.0.0.1:${port}/reconstructions/${building}/${query ? `?${query}` : ''}` });
      for (let i = 0; i < 600; i++) {
        await sleep(250);
        const { result } = await send('Runtime.evaluate', { expression: `document.getElementById('loading')?.hidden === true && document.getElementById('tree-status')?.hidden === true`, returnByValue: true });
        if (result?.value) break;
      }
      await sleep(2500);
      const { data } = await send('Page.captureScreenshot', { format: 'png' });
      const file = path.join(out, `${building}-${view}-${variant.name}.png`);
      writeFileSync(file, Buffer.from(data, 'base64'));
      results[variant.name][view] = file;
    }
    socket.close();
  } finally { browser.kill(); await sleep(1500); try { rmSync(profile, { recursive: true, force: true }); } catch {} }
}
const [first, ...others] = variants;
const report = { building, out, errors: Object.fromEntries(variants.map(v => [v.name, results[v.name].errors])), differingPixels: {} };
for (const view of Object.keys(cameras)) for (const other of others) {
  const { readFileSync } = await import('node:fs');
  report.differingPixels[`${view}: ${other.name} vs ${first.name}`] = +(difference(readFileSync(results[first.name][view]), readFileSync(results[other.name][view])) * 100).toFixed(2) + ' %';
}
console.log(JSON.stringify(report, null, 1));
