// Opens a measurement page in a headless Edge (or Chrome) and prints the page's window.__result once
// its status is 'done' or 'error'. Read-only; no packages. From the repository root, with
// `python tools/serve.py --port 8047` running:
//   node viewer/perf/run-page.mjs "http://127.0.0.1:8047/viewer/perf/batching-benchmark.html?variant=batched" [--cdp 9347] [--gpu high] [--throttle 4]
// --throttle N slows the page's CPU N times (DevTools CPU throttling), a rough stand-in for a phone CPU.
// --cpu-profile samples JavaScript while the page measures and lists the functions with most self time.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const url = args.find(arg => /^https?:/.test(arg));
const cdpPort = option('cdp', '9347');
const browserPath = option('browser', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const profile = mkdtempSync(path.join(tmpdir(), 'viewer-perf-'));
const flags = [`--remote-debugging-port=${cdpPort}`, `--user-data-dir=${profile}`, '--headless=new', '--no-first-run', '--no-default-browser-check',
  '--disable-extensions', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--ignore-gpu-blocklist', '--window-size=1600,1000', 'about:blank'];
if (option('gpu', '') === 'high') flags.unshift('--force_high_performance_gpu');
const browser = spawn(browserPath, flags, { stdio: 'ignore' });
let output = { error: 'not started' };
try {
  let target;
  for (let i = 0; i < 100 && !target; i++) {
    try { target = (await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json()).find(t => t.type === 'page'); } catch { await sleep(200); }
  }
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let id = 0; const pending = new Map();
  socket.onmessage = event => { const m = JSON.parse(event.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  const send = (method, params = {}) => new Promise(resolve => { pending.set(++id, resolve); socket.send(JSON.stringify({ id, method, params })); });
  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  const throttle = Number(option('throttle', '1'));
  if (throttle > 1) await send('Emulation.setCPUThrottlingRate', { rate: throttle });
  await send('Page.navigate', { url });
  // --cpu-profile: sample JavaScript while the page reports status 'measuring', and list the top self times.
  const profiling = args.includes('--cpu-profile');
  let started = false;
  for (let i = 0; i < 2400; i++) {
    await sleep(250);
    const { result } = await send('Runtime.evaluate', { expression: 'JSON.stringify(window.__result || null)', returnByValue: true });
    const value = result?.result?.value && JSON.parse(result.result.value);
    if (profiling && !started && value?.status === 'measuring') {
      await send('Profiler.enable'); await send('Profiler.setSamplingInterval', { interval: 200 }); await send('Profiler.start'); started = true;
    }
    if (value && ['done', 'error'].includes(value.status)) {
      output = value;
      if (started) {
        const { result: { profile: cpu } } = await send('Profiler.stop');
        const nodes = new Map(cpu.nodes.map(node => [node.id, node])), self = new Map();
        cpu.samples.forEach((sample, k) => {
          const { callFrame } = nodes.get(sample);
          const key = `${callFrame.functionName || '(anonymous)'} · ${callFrame.url.split('/').pop().split('?')[0]}:${callFrame.lineNumber + 1}`;
          self.set(key, (self.get(key) || 0) + (cpu.timeDeltas[k + 1] ?? 0));
        });
        output.cpuProfile = [...self].filter(([key]) => !/^\((idle|program|garbage collector)\)/.test(key)).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([key, micros]) => ({ key, ms: Math.round(micros / 1000) }));
      }
      break;
    }
  }
  socket.close();
} catch (error) { output = { error: error.message }; }
finally { browser.kill(); await sleep(1500); try { rmSync(profile, { recursive: true, force: true }); } catch {} }
console.log(JSON.stringify(output, null, 1));
