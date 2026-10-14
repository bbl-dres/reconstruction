// Browser profile of the real viewer: load phases, main-thread blocking, WebGL uploads, draw calls,
// CPU and GPU frame time per mode, and process memory. Drives a headless Edge (or Chrome) over the
// DevTools protocol with Node's built-in WebSocket; no packages. The viewer is not modified: an
// instrumentation script is injected before the page loads (WebGL calls, requestAnimationFrame,
// long tasks, loading-card text).
//
// 1. Serve the repository:   python tools/serve.py --port 8047
// 2. Run (repository root):  node viewer/perf/browser-profile.mjs --building bundeshaus [options]
//    --port 8047          server port            --cdp 9347          DevTools port for the browser it starts
//    --query "a=1&b=2"    extra URL parameters   --mobile            390 x 844 at DPR 3, touch, 4x CPU throttle
//    --throttle N         CPU slowdown factor    --gpu high          ask for the high-performance GPU
//    --no-interact        load only              --browser PATH      browser executable
//    --cpu-profile        sample JavaScript during loading and list the functions that cost most
//    --what-if no-transmission-pass   serve three.module.js with the transmission pass's opaque redraw
//                         skipped (in memory, for this run only): estimates the gain of glass without that pass
// Prints a JSON report. The browser and its temporary profile are removed afterwards.
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback; };
const flag = name => args.includes(`--${name}`);
const building = option('building', 'bundeshaus');
const port = option('port', '8047');
const cdpPort = option('cdp', '9347');
const mobile = flag('mobile');
const throttle = Number(option('throttle', mobile ? '4' : '1'));
const browserPath = option('browser', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe');
const query = ['stats=1', option('query', '')].filter(Boolean).join('&');
const url = `http://127.0.0.1:${port}/reconstructions/${building}/?${query}`;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const profile = mkdtempSync(path.join(tmpdir(), 'viewer-perf-'));
const browserArgs = [`--remote-debugging-port=${cdpPort}`, `--user-data-dir=${profile}`, '--headless=new', '--no-first-run', '--no-default-browser-check',
  '--disable-extensions', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
  '--ignore-gpu-blocklist', '--enable-precise-memory-info', '--window-size=1600,900', 'about:blank'];
if (option('gpu', '') === 'high') browserArgs.unshift('--force_high_performance_gpu');
const browser = spawn(browserPath, browserArgs, { stdio: 'ignore' });

let socket, nextId = 0;
const pending = new Map(), handlers = new Map();
const on = (method, handler) => handlers.set(method, [...(handlers.get(method) || []), handler]);
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++nextId; pending.set(id, { resolve, reject, method });
  socket.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression, awaitPromise = true) => {
  const result = await send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
  if (result.exceptionDetails) throw new Error(`${expression.slice(0, 80)}: ${result.exceptionDetails.exception?.description || result.exceptionDetails.text}`);
  return result.result.value;
};

// Injected before any page script. Times are performance.now() milliseconds of the page.
const instrumentation = `(() => {
  const P = window.__perf = { marks: [], longTasks: [], frames: [], queries: [], counters: { draw: 0, tex: 0, texMs: 0, texBytes: 0, mip: 0, mipMs: 0, buf: 0, bufMs: 0, bufBytes: 0, link: 0, linkMs: 0, compile: 0, compileMs: 0, wait: 0, waitMs: 0 }, links: [] };
  const mark = (name, detail = '') => P.marks.push({ t: performance.now(), name, detail });
  P.mark = mark;
  try { new PerformanceObserver(list => { for (const e of list.getEntries()) P.longTasks.push({ start: e.startTime, duration: e.duration }); }).observe({ type: 'longtask', buffered: true }); } catch {}
  const watch = () => {
    const detail = document.getElementById('loading-detail'), loading = document.getElementById('loading');
    if (!detail || !loading) return false;
    let last = '';
    new MutationObserver(() => { const text = detail.textContent, key = text.replace(/[0-9]+/g, '#'); if (key !== last) { last = key; mark('detail', text); } }).observe(detail, { childList: true, characterData: true, subtree: true });
    new MutationObserver(() => mark(loading.hidden ? 'loading-hidden' : 'loading-shown')).observe(loading, { attributes: true, attributeFilter: ['hidden'] });
    mark('shell');
    return true;
  };
  new MutationObserver((_, observer) => { if (watch()) observer.disconnect(); }).observe(document, { childList: true, subtree: true });
  const proto = WebGL2RenderingContext.prototype, c = P.counters;
  const timed = (name, key, bytes) => { const original = proto[name]; proto[name] = function (...a) { const t = performance.now(); const r = original.apply(this, a); c[key]++; c[key + 'Ms'] += performance.now() - t; if (bytes) c[key + 'Bytes'] += bytes(a) || 0; return r; }; };
  const imageBytes = a => a.length === 6 ? (a[5]?.width || 0) * (a[5]?.height || 0) * 4 : (a[3] || 0) * (a[4] || 0) * 4;
  timed('texImage2D', 'tex', imageBytes); timed('texSubImage2D', 'tex', a => a.length === 7 ? (a[6]?.width || 0) * (a[6]?.height || 0) * 4 : (a[4] || 0) * (a[5] || 0) * 4);
  timed('generateMipmap', 'mip'); timed('bufferData', 'buf', a => typeof a[1] === 'number' ? a[1] : a[1]?.byteLength); timed('linkProgram', 'link'); timed('compileShader', 'compile');
  // three.js reads the program log on first use: this call blocks until the driver has compiled the program.
  timed('getProgramInfoLog', 'wait');
  P.waits = [];
  const log = proto.getProgramInfoLog; proto.getProgramInfoLog = function (...a) { const t = performance.now(); const r = log.apply(this, a); const d = performance.now() - t; if (d > 1) P.waits.push({ t, d }); return r; };
  const link = proto.linkProgram; proto.linkProgram = function (...a) { P.links.push(performance.now()); return link.apply(this, a); };
  for (const name of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) { const original = proto[name]; proto[name] = function (...a) { c.draw++; return original.apply(this, a); }; }
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, options) {
    const context = getContext.call(this, type, options);
    if (type === 'webgl2' && context && !P.gl) {
      P.gl = context; P.timer = context.getExtension('EXT_disjoint_timer_query_webgl2');
      const info = context.getExtension('WEBGL_debug_renderer_info');
      P.renderer = info ? context.getParameter(info.UNMASKED_RENDERER_WEBGL) : context.getParameter(context.RENDERER);
      P.maxTextureSize = context.getParameter(context.MAX_TEXTURE_SIZE);
    }
    return context;
  };
  const resolveQueries = () => {
    const gl = P.gl, ext = P.timer;
    if (!gl || !ext) return;
    const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
    P.queries = P.queries.filter(entry => {
      if (!gl.getQueryParameter(entry.query, gl.QUERY_RESULT_AVAILABLE)) return true;
      if (!disjoint) entry.frame.gpu = gl.getQueryParameter(entry.query, gl.QUERY_RESULT) / 1e6;
      gl.deleteQuery(entry.query);
      return false;
    });
  };
  P.resolveQueries = resolveQueries;
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = callback => raf(time => {
    resolveQueries();
    const gl = P.gl, ext = P.timer, draws = c.draw, start = performance.now();
    let query = null;
    if (gl && ext && !P.queryOpen) { query = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, query); P.queryOpen = true; }
    try { callback(time); } finally {
      if (query) { gl.endQuery(ext.TIME_ELAPSED_EXT); P.queryOpen = false; }
      const frame = { start, cpu: performance.now() - start, draws: c.draw - draws, gpu: null };
      if (frame.draws > 0) { P.frames.push(frame); if (query) P.queries.push({ query, frame }); }
      else if (query) gl.deleteQuery(query);
    }
  });
})();`;

const report = { building, url, mobile, cpuThrottle: throttle };
const network = new Map();
try {
  // Connect to the browser's first page.
  let target;
  for (let i = 0; i < 100 && !target; i++) {
    try { target = (await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json()).find(t => t.type === 'page'); } catch { await sleep(200); }
  }
  if (!target) throw new Error('The browser did not start.');
  const version = await (await fetch(`http://127.0.0.1:${cdpPort}/json/version`)).json();
  report.browser = version.Browser;
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject, method } = pending.get(message.id); pending.delete(message.id);
      if (message.error) reject(new Error(`${method}: ${message.error.message}`)); else resolve(message.result);
    } else for (const handler of handlers.get(message.method) || []) handler(message.params);
  };
  on('Network.requestWillBeSent', p => network.set(p.requestId, { url: p.request.url, start: p.timestamp }));
  on('Network.responseReceived', p => { if (p.response.status >= 400) (report.failedRequests ||= []).push(`${p.response.status} ${p.response.url}`); const r = network.get(p.requestId); if (r) Object.assign(r, { status: p.response.status, encoding: p.response.headers['Content-Encoding'] || p.response.headers['content-encoding'] || '', headersAt: p.timestamp, cacheControl: p.response.headers['Cache-Control'] || p.response.headers['cache-control'] }); });
  on('Network.loadingFinished', p => { const r = network.get(p.requestId); if (r) Object.assign(r, { end: p.timestamp, transferBytes: p.encodedDataLength }); });
  const whatIf = option('what-if', '');
  if (whatIf === 'no-transmission-pass') {
    report.whatIf = whatIf;
    on('Fetch.requestPaused', async p => {
      const { body, base64Encoded } = await send('Fetch.getResponseBody', { requestId: p.requestId });
      let text = base64Encoded ? Buffer.from(body, 'base64').toString('utf8') : body;
      const before = text.length;
      text = text.replace('\t\t\trenderObjects( opaqueObjects, scene, camera );\n', '\t\t\t/* perf what-if: opaque redraw skipped */\n')
        .replace("if ( extensions.has( 'WEBGL_multisampled_render_to_texture' ) === false ) { // see #28131", 'if ( false ) {');
      report.whatIfPatched = text.length !== before;
      await send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: 200,
        responseHeaders: [{ name: 'Content-Type', value: 'text/javascript' }], body: Buffer.from(text).toString('base64') });
    });
    await send('Fetch.enable', { patterns: [{ urlPattern: '*three.module.js*', requestStage: 'Response' }] });
  }
  // Console errors and uncaught exceptions of the page (warnings are listed separately).
  report.console = { errors: [], warnings: [] };
  on('Runtime.exceptionThrown', p => report.console.errors.push(p.exceptionDetails.exception?.description?.split('\n')[0] || p.exceptionDetails.text));
  on('Runtime.consoleAPICalled', p => {
    const text = p.args.map(arg => arg.value ?? arg.description ?? '').join(' ').split('\n')[0].slice(0, 300);
    if (p.type === 'error') report.console.errors.push(text); else if (p.type === 'warning') report.console.warnings.push(text);
  });
  on('Log.entryAdded', p => { if (p.entry.level === 'error') report.console.errors.push(`${p.entry.source}: ${p.entry.text}`.slice(0, 300)); });
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Page.enable');
  await send('Performance.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: instrumentation });
  if (mobile) {
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
    await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'pointer', value: 'coarse' }, { name: 'any-pointer', value: 'coarse' }] });
  } else await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
  if (throttle > 1) await send('Emulation.setCPUThrottlingRate', { rate: throttle });

  if (flag('cpu-profile')) {
    await send('Profiler.enable');
    await send('Profiler.setSamplingInterval', { interval: 500 });
    await send('Profiler.start');
  }
  await send('Page.navigate', { url });
  // Wait for the first presented frame (the loading card hides), then for the BIM tree.
  let state;
  for (let i = 0; i < 2400; i++) {
    await sleep(250);
    try {
      state = await evaluate(`(() => { const p = window.__perf; const loading = document.getElementById('loading'); const status = document.getElementById('tree-status');
        return { presented: Boolean(p?.marks.some(m => m.name === 'loading-hidden')), error: !document.getElementById('retry')?.hidden, tree: Boolean(status && status.hidden) }; })()`, false);
    } catch { continue; }
    if (state.error) throw new Error('The viewer reported a loading error.');
    if (state.presented && state.tree) break;
  }
  if (!state?.presented) throw new Error('The viewer did not finish loading within ten minutes.');
  const treeReadyAt = await evaluate('performance.now()');
  if (flag('cpu-profile')) {
    // Self time per function, and per script, from the sampled profile of the whole load.
    const { profile: cpu } = await send('Profiler.stop');
    const self = new Map(), byScript = new Map();
    const nodes = new Map(cpu.nodes.map(node => [node.id, node]));
    const intervals = cpu.timeDeltas;
    const counts = new Map();
    cpu.samples.forEach((id, i) => counts.set(id, (counts.get(id) || 0) + (intervals[i + 1] ?? intervals[i] ?? 0)));
    for (const [id, micros] of counts) {
      const { callFrame } = nodes.get(id);
      const script = callFrame.url ? callFrame.url.split('/').slice(-1)[0].split('?')[0] : '(native / idle)';
      const key = `${callFrame.functionName || '(anonymous)'} · ${script}:${callFrame.lineNumber + 1}`;
      self.set(key, (self.get(key) || 0) + micros);
      byScript.set(script, (byScript.get(script) || 0) + micros);
    }
    const top = map => [...map].sort((a, b) => b[1] - a[1]).filter(([key]) => !/^\((idle|program|garbage collector)\)/.test(key)).slice(0, 25).map(([key, micros]) => ({ key, ms: Math.round(micros / 1000) }));
    report.cpuProfile = { selfTime: top(self), byScript: top(byScript),
      gcMs: Math.round([...self].filter(([key]) => key.startsWith('(garbage collector)')).reduce((s, [, v]) => s + v, 0) / 1000),
      programMs: Math.round([...self].filter(([key]) => key.startsWith('(program)')).reduce((s, [, v]) => s + v, 0) / 1000) };
  }
  await sleep(1500);
  const load = await evaluate(`(() => { const p = window.__perf; p.resolveQueries();
    return { marks: p.marks, longTasks: p.longTasks, counters: { ...p.counters }, links: p.links, waits: p.waits, renderer: p.renderer, maxTextureSize: p.maxTextureSize, timer: Boolean(p.timer),
      stats: document.getElementById('render-stats')?.textContent || '', model: document.getElementById('model-stats')?.textContent || '',
      dpr: devicePixelRatio, canvas: [document.getElementById('scene').width, document.getElementById('scene').height] }; })()`);
  report.renderer = load.renderer; report.maxTextureSize = load.maxTextureSize; report.gpuTimer = load.timer; report.canvas = load.canvas;
  const hidden = load.marks.find(m => m.name === 'loading-hidden').t;
  const ms = value => Math.round(value);
  report.load = {
    timeline: load.marks.map(m => ({ t: ms(m.t), name: m.name, detail: m.detail.replace(/·.*$/, '').trim() })),
    firstFrameMs: ms(hidden), treeReadyMs: ms(treeReadyAt),
    longTasks: { count: load.longTasks.length, totalMs: ms(load.longTasks.reduce((s, e) => s + e.duration, 0)),
      beforeFirstFrameMs: ms(load.longTasks.filter(e => e.start < hidden).reduce((s, e) => s + e.duration, 0)),
      top: [...load.longTasks].sort((a, b) => b.duration - a.duration).slice(0, 8).map(e => ({ start: ms(e.start), duration: ms(e.duration) })) },
    webgl: { texturesUploaded: load.counters.tex, textureUploadMs: ms(load.counters.texMs), textureMB: ms(load.counters.texBytes / 1e6), mipmapsMs: ms(load.counters.mipMs),
      buffersUploaded: load.counters.buf, bufferUploadMs: ms(load.counters.bufMs), bufferMB: ms(load.counters.bufBytes / 1e6), programsLinked: load.counters.link, linkMs: ms(load.counters.linkMs), compileMs: ms(load.counters.compileMs),
      programsLinkedBeforePreparing: load.links.filter(t => t < (load.marks.find(m => /Preparing the building/.test(m.detail))?.t ?? 0)).length,
      programsLinkedInFirstFrameTask: load.links.filter(t => t >= hidden - (load.longTasks.find(e => Math.abs(e.start + e.duration - hidden) < 5)?.duration ?? 0) - 1 && t <= hidden).length,
      programLogWaitMs: ms(load.counters.waitMs),
      // Blocking shader waits by phase: start-up (before the catalog), loading, and the first frame's task.
      programWaitByPhaseMs: (() => {
        const download = load.marks.find(m => /Starting/.test(m.detail))?.t ?? 0;
        const firstTask = load.longTasks.find(e => Math.abs(e.start + e.duration - hidden) < 5)?.start ?? hidden;
        const sum = list => ms(list.reduce((s, w) => s + w.d, 0));
        return { startup: sum(load.waits.filter(w => w.t < download)), loading: sum(load.waits.filter(w => w.t >= download && w.t < firstTask)), firstFrame: sum(load.waits.filter(w => w.t >= firstTask && w.t <= hidden)) };
      })() },
    statsLine: load.stats, modelLine: load.model,
  };
  report.network = [...network.values()].filter(r => /\.(glb|gz|json)(\?|$)/.test(r.url)).map(r => ({
    file: r.url.split('/').slice(-2).join('/'), status: r.status, encoding: r.encoding, cacheControl: r.cacheControl,
    transferMB: Math.round((r.transferBytes || 0) / 1e5) / 10, startMs: ms((r.start - [...network.values()][0].start) * 1000), durationMs: ms(((r.end || r.start) - r.start) * 1000) }));

  // Frames drawn while idle should be none: rendering is on demand.
  const idleFrom = await evaluate('window.__perf.frames.length');
  await sleep(2000);
  report.idleFrames = (await evaluate('window.__perf.frames.length')) - idleFrom;

  if (!flag('no-interact')) {
    const box = await evaluate(`(() => { const r = document.getElementById('scene').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width }; })()`);
    const frameStats = async (from, label) => {
      await sleep(400);
      const frames = await evaluate(`(() => { window.__perf.resolveQueries(); return window.__perf.frames.slice(${from}); })()`);
      await sleep(300);
      const resolved = await evaluate(`(() => { window.__perf.resolveQueries(); return window.__perf.frames.slice(${from}).map(f => f.gpu); })()`);
      resolved.forEach((gpu, i) => { if (frames[i]) frames[i].gpu = gpu; });
      const pick = (list, q) => { const s = list.filter(v => v !== null && v !== undefined).sort((a, b) => a - b); return s.length ? Math.round(s[Math.min(s.length - 1, Math.floor(q * s.length))] * 10) / 10 : null; };
      const cpu = frames.map(f => f.cpu), gpu = frames.map(f => f.gpu), draws = frames.map(f => f.draws);
      const period = frames.slice(1).map((f, i) => f.start - frames[i].start);
      return { label, frames: frames.length, cpuMedianMs: pick(cpu, 0.5), cpuP95Ms: pick(cpu, 0.95), gpuMedianMs: pick(gpu, 0.5), gpuP95Ms: pick(gpu, 0.95),
        drawsMedian: pick(draws, 0.5), framePeriodMedianMs: pick(period, 0.5), statsLine: await evaluate(`document.getElementById('render-stats')?.textContent || ''`) };
    };
    const drag = async (label, { seconds = 3, button = 'left' } = {}) => {
      const from = await evaluate('window.__perf.frames.length');
      let x = box.x, y = box.y;
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button, buttons: button === 'left' ? 1 : 2, clickCount: 1 });
      const steps = Math.round(seconds * 60);
      for (let i = 0; i < steps; i++) {
        x += Math.cos(i / 40) * 4; y += Math.sin(i / 25) * 1.5;
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button, buttons: button === 'left' ? 1 : 2 });
        await sleep(16);
      }
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button, buttons: 0, clickCount: 1 });
      return frameStats(from, label);
    };
    // Synchronous cost of a control, then the first frame after it.
    const action = async (label, script) => {
      const from = await evaluate('window.__perf.frames.length');
      const before = await evaluate('({ ...window.__perf.counters })');
      const syncMs = await evaluate(`(() => { const t = performance.now(); ${script}; return performance.now() - t; })()`, false);
      await sleep(1500);
      const next = await evaluate(`(() => { window.__perf.resolveQueries(); return window.__perf.frames.slice(${from}, ${from} + 3); })()`);
      const after = await evaluate('({ ...window.__perf.counters })');
      return { label, syncMs: Math.round(syncMs), nextFrameCpuMs: next[0] ? Math.round(next[0].cpu) : null, nextFrameDraws: next[0]?.draws ?? null, laterFrameCpuMs: next[1] ? Math.round(next[1].cpu) : null,
        programsLinked: after.link - before.link, programLogWaitMs: Math.round(after.waitMs - before.waitMs) };
    };
    const click = selector => `document.querySelector('${selector}').click()`;
    report.modes = [];
    report.actions = [];
    report.modes.push(await drag('Exterior orbit'));
    report.actions.push(await action('Dollhouse button', click('[data-mode="dollhouse"]')));
    report.modes.push(await drag('Dollhouse orbit'));
    report.actions.push(await action('Floor plan button', click('[data-mode="plan"]')));
    report.modes.push(await drag('Floor plan pan'));
    report.actions.push(await action('Exterior button', click('[data-mode="orbit"]')));
    const level = await evaluate(`[...document.querySelectorAll('.tree-row.is-storey')].map(r => r.dataset.id)[1] || ''`);
    if (level) {
      report.actions.push(await action(`Level filter ${level}`, `document.querySelector('.tree-row[data-id="${level}"] .tree-label').click()`));
      report.modes.push(await drag(`Exterior orbit, level ${level}`));
      report.actions.push(await action('Level filter off', `document.querySelector('.tree-row[data-id="${level}"] .tree-label').click()`));
    }
    // A real click on the model: picking and the inspector. The cost is the time between the
    // pointerup reaching the window (capture) and leaving it (bubble), around the viewer's handler.
    {
      const from = await evaluate('window.__perf.frames.length');
      const before = await evaluate('({ ...window.__perf.counters })');
      await evaluate(`(() => { const p = window.__perf; p.click = {}; addEventListener('pointerup', () => { p.click.start = performance.now(); }, { capture: true, once: true });
        addEventListener('pointerup', () => { p.click.end = performance.now(); }, { once: true }); })()`);
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', buttons: 1, clickCount: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', buttons: 0, clickCount: 1 });
      await sleep(1500);
      const timing = await evaluate('window.__perf.click');
      const next = await evaluate(`(() => { window.__perf.resolveQueries(); return window.__perf.frames.slice(${from}, ${from} + 2); })()`);
      const after = await evaluate('({ ...window.__perf.counters })');
      report.actions.push({ label: 'Pick at view centre', syncMs: timing.end ? Math.round(timing.end - timing.start) : null, nextFrameCpuMs: next[0] ? Math.round(next[0].cpu) : null,
        nextFrameDraws: next[0]?.draws ?? null, laterFrameCpuMs: next[1] ? Math.round(next[1].cpu) : null, programsLinked: after.link - before.link, programLogWaitMs: Math.round(after.waitMs - before.waitMs) });
    }
    report.picked = await evaluate(`document.getElementById('inspector').hidden ? '' : document.getElementById('element-title').textContent`);
    report.actions.push(await action('Close inspector', click('#close-inspector')));
    // Shadows: every material recompiles, then the shadow map renders.
    report.actions.push(await action('Shadows on', `document.getElementById('shadows').click()`));
    report.modes.push(await drag('Exterior orbit, shadows on'));
    report.actions.push(await action('Shadows off', `document.getElementById('shadows').click()`));
    // Walk: collision preparation, then walking forward.
    const walkStart = await evaluate('performance.now()');
    await evaluate(click('[data-nav="walk"]'), false);
    let ready = false;
    for (let i = 0; i < 240 && !ready; i++) { await sleep(250); ready = await evaluate(`document.getElementById('notice').hidden || !/surfaces/.test(document.getElementById('notice').textContent)`); }
    report.walkPreparationMs = Math.round((await evaluate('performance.now()')) - walkStart);
    const from = await evaluate('window.__perf.frames.length');
    await send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'KeyW', key: 'w', windowsVirtualKeyCode: 87 });
    for (let i = 0; i < 12; i++) { await sleep(250); await send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'KeyW', key: 'w', windowsVirtualKeyCode: 87, autoRepeat: true }); }
    await send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyW', key: 'w', windowsVirtualKeyCode: 87 });
    report.modes.push(await frameStats(from, 'Walk forward'));
  }

  // Memory: the page's JavaScript heap, and every process of this browser profile, after a full
  // garbage collection; peakMB is each process type's highest commit charge during the run.
  await send('HeapProfiler.collectGarbage');
  await sleep(1500);
  const metrics = Object.fromEntries((await send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
  report.memory = { jsHeapUsedMB: Math.round(metrics.JSHeapUsedSize / 1e6), jsHeapTotalMB: Math.round(metrics.JSHeapTotalSize / 1e6) };
  try {
    const script = `$p = Get-CimInstance Win32_Process -Filter "Name='msedge.exe' OR Name='chrome.exe'" | Where-Object { $_.CommandLine -like '*${path.basename(profile)}*' };
      $rows = foreach ($x in $p) { $type = if ($x.CommandLine -match '--type=([a-z-]+)') { $Matches[1] } else { 'browser' }; $gpu = 0;
        try { $gpu = (Get-Counter "\\GPU Process Memory(pid_$($x.ProcessId)_*)\\Dedicated Usage" -ErrorAction Stop).CounterSamples | Measure-Object CookedValue -Sum | Select-Object -ExpandProperty Sum } catch {}
        [pscustomobject]@{ type = $type; privateMB = [math]::Round($x.PrivatePageCount / 1MB); peakMB = [math]::Round($x.PeakPageFileUsage / 1KB); gpuDedicatedMB = [math]::Round($gpu / 1MB) } };
      $rows | Group-Object type | ForEach-Object { [pscustomobject]@{ type = $_.Name; privateMB = ($_.Group | Measure-Object privateMB -Sum).Sum; peakMB = ($_.Group | Measure-Object peakMB -Sum).Sum; gpuDedicatedMB = ($_.Group | Measure-Object gpuDedicatedMB -Sum).Sum } } | ConvertTo-Json`;
    report.memory.processes = JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-Command', script], { encoding: 'utf8' }));
  } catch (error) { report.memory.processes = `unavailable: ${error.message.split('\n')[0]}`; }
} catch (error) {
  report.error = error.message;
} finally {
  try { socket?.close(); } catch {}
  browser.kill();
  await sleep(1500);
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
}
console.log(JSON.stringify(report, null, 1));
