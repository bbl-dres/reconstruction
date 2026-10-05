import { registerHooks } from 'node:module';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'three') return { url: new URL('../viewer/vendor/three/build/three.module.js', import.meta.url).href, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});

const THREE = await import('three');
const { STUDIO, DAYLIGHT, studioSunDirection, applyStudioLights, skyRadiance } = await import('../viewer/js/lighting.js');

const luminance = c => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
// Mean sky luminance seen by a surface with normal n (cosine-weighted, numerical).
function skyIrradiance(n) {
  let sum = 0, weight = 0;
  for (let i = 0; i < 4000; i++) {
    const u = (i + 0.5) / 4000, phi = i * 2.399963;
    const y = 1 - 2 * u, r = Math.sqrt(1 - y * y);
    const d = new THREE.Vector3(r * Math.cos(phi), y, r * Math.sin(phi));
    const c = d.dot(n);
    if (c <= 0) continue;
    sum += c * luminance(skyRadiance(y)); weight += c;
  }
  return sum / weight;
}
// Lambert factor (output / albedo) for a surface with normal n under the studio lights, no shadows.
function factor(n) {
  const sun = STUDIO.sun.intensity / Math.PI * Math.max(0, n.dot(studioSunDirection()));
  return sun + STUDIO.environmentIntensity * skyIrradiance(n);
}

test('default lighting: neutral tone mapping, sun and sky, shadows off', () => {
  assert.equal(STUDIO.toneMapping, THREE.NeutralToneMapping, 'ACES desaturates base colours and flattens whites');
  assert.equal(STUDIO.shadows, false, 'shadow maps are opt-in');
  const scene = new THREE.Scene(), sun = new THREE.DirectionalLight(), fill = new THREE.HemisphereLight();
  applyStudioLights({ scene, sun, fillLight: fill });
  assert.equal(scene.environmentIntensity, STUDIO.environmentIntensity);
  const d = studioSunDirection();
  assert.ok(Math.abs(d.length() - 1) < 1e-9);
  assert.ok(d.y > 0.5 && d.y < 0.8, 'sun high enough to light roofs, low enough to model facades');
  assert.ok(d.x > 0 && d.z > 0, 'sun from the model south-east: the default +x/-z view sees one lit and one shaded facade');
});

test('the sky environment is brighter above than below the horizon', () => {
  assert.ok(luminance(skyRadiance(1)) > 0.3 && luminance(skyRadiance(0)) > luminance(skyRadiance(1)), 'bright horizon, deeper zenith');
  assert.ok(luminance(skyRadiance(-1)) < 0.3 * luminance(skyRadiance(0)), 'dark ground');
  assert.ok(skyIrradiance(new THREE.Vector3(0, 1, 0)) > 2 * skyIrradiance(new THREE.Vector3(0, -1, 0)), 'up-facing surfaces get more sky');
});

test('sunny-day contrast without shadows for plausible albedos', () => {
  const plaster = 0.70, tile = 0.26;
  const east = plaster * factor(new THREE.Vector3(1, 0, 0));
  const north = plaster * factor(new THREE.Vector3(0, 0, -1));
  assert.ok(east > 0.55 && east < 0.85, `sunlit plaster ${east.toFixed(2)} should sit near the Neutral shoulder (0.76)`);
  assert.ok(north / east > 0.25 && north / east < 0.5, `shade/sun ratio ${(north / east).toFixed(2)}`);
  const roof = tile * factor(new THREE.Vector3(0.4, 0.92, 0.2).normalize());
  assert.ok(roof > 0.2 && roof < 0.6, `sunlit clay roof ${roof.toFixed(2)}`);
});

test('daylight at full sun uses the studio budget, so toggling Sun & sky keeps exposure', () => {
  assert.equal(DAYLIGHT.sunIntensity, STUDIO.sun.intensity);
  assert.equal(DAYLIGHT.environmentDay, STUDIO.environmentIntensity);
  assert.equal(DAYLIGHT.fillDay, STUDIO.fill.intensity);
});

test('the viewer opens in Exterior with shadows off', async () => {
  const shell = await readFile(new URL('../viewer/shell.html', import.meta.url), 'utf8');
  assert.match(shell, /data-mode="orbit" aria-pressed="true"/);
  assert.match(shell, /data-mode="dollhouse" aria-pressed="false"/);
  assert.match(shell, /id="shadows" type="checkbox" role="switch">/);
  const main = await readFile(new URL('../viewer/js/main.js', import.meta.url), 'utf8');
  assert.match(main, /const state = \{ mode: 'orbit',/);
  assert.doesNotMatch(main, /RoomEnvironment/);
});
