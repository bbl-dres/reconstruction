import { registerHooks } from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readViewURL, writeViewURL } from '../public/js/view-url.js';
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'three') return { url: new URL('../public/vendor/three/build/three.module.js', import.meta.url).href, shortCircuit: true };
  if (specifier.startsWith('three/addons/')) return { url: new URL('../public/vendor/three/examples/jsm/' + specifier.slice(13), import.meta.url).href, shortCircuit: true };
  return next(specifier, context);
} });
const THREE = await import('three');
const { OrbitControls } = await import('three/addons/controls/OrbitControls.js');
const { Octree } = await import('three/addons/math/Octree.js');
const { toPlan, fromPlan, copyPerspective, viewHeight, navigateView } = await import('../public/js/view-navigation.js');
const { Walker } = await import('../public/js/walking.js');
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);
const sameVector = (a, b) => close(a.distanceTo(b), 0);

test('plan round trip retains focus, orientation and visible scale across viewport shapes', () => {
  for (const aspect of [320 / 480, 768 / 1024, 1440 / 1000, 3840 / 2160]) {
    const camera = new THREE.PerspectiveCamera(45, aspect);
    camera.position.set(23, 18, -30); camera.zoom = 1.4;
    const control = new OrbitControls(camera); control.target.set(3, 7, 5); control.update();
    const originalPosition = camera.position.clone(), originalRotation = camera.quaternion.clone();
    const direction = camera.position.clone().sub(control.target).normalize();
    const plan = new THREE.OrthographicCamera(); plan.up.set(0, 0, -1);
    const planControl = new OrbitControls(plan);
    toPlan(camera, control.target, plan, planControl, aspect);
    close(viewHeight(plan, planControl.target), viewHeight(camera, control.target));
    sameVector(planControl.target, control.target);
    fromPlan(plan, planControl.target, direction, camera, control, aspect);
    sameVector(camera.position, originalPosition); close(camera.quaternion.angleTo(originalRotation), 0);
    navigateView(plan, planControl, { zoom: 0.5, horizontal: 1, pan: true });
    fromPlan(plan, planControl.target, direction, camera, control, aspect);
    sameVector(control.target, planControl.target);
    sameVector(camera.position.clone().sub(control.target).normalize(), direction);
    close(viewHeight(camera, control.target), viewHeight(plan, planControl.target));
  }
});

test('POV handoff preserves the lens, position and upward or downward gaze', () => {
  for (const y of [-10, 10]) {
    const source = new THREE.PerspectiveCamera(45); source.zoom = 1.8;
    source.position.set(12, 6, 8); source.lookAt(0, y, 0);
    const walk = new THREE.PerspectiveCamera(60);
    copyPerspective(source, walk);
    sameVector(walk.position, source.position); close(walk.quaternion.angleTo(source.quaternion), 0);
    close(walk.getEffectiveFOV(), source.getEffectiveFOV());
  }
});

test('keyboard panning stays proportional to the visible view with a zoomed lens', () => {
  for (const zoom of [0.5, 1, 2, 10]) {
    const camera = new THREE.PerspectiveCamera(45, 1.5);
    camera.zoom = zoom; camera.position.set(0, 0, 20); camera.updateProjectionMatrix();
    const control = new OrbitControls(camera); control.update();
    const height = viewHeight(camera, control.target);
    const before = new THREE.Vector3(0, 0, 0).project(camera);
    navigateView(camera, control, { horizontal: 1, pan: true });
    const after = new THREE.Vector3(0, 0, 0).project(camera);
    close(control.target.length(), height * 0.05);
    close(Math.abs(after.x - before.x), 0.1 / camera.aspect);
  }
});

test('a shared airborne POV stays in place and ground-level POV can walk without teleporting', () => {
  const root = new THREE.Group(), floor = new THREE.Mesh(new THREE.BoxGeometry(20, 0.2, 20));
  floor.position.y = -0.1; root.add(floor);
  const world = new Octree().fromGraphNode(root);
  for (const height of [1.65, 90]) {
    const camera = new THREE.PerspectiveCamera(); camera.position.set(1, height, 2); camera.lookAt(3, 1.65, -5);
    const position = camera.position.clone(), rotation = camera.quaternion.clone();
    const walker = new Walker(camera, world); walker.adoptView();
    sameVector(camera.position, position); close(camera.quaternion.angleTo(rotation), 0);
    assert.equal(walker.flying, height === 90); assert.equal(walker.hasSafePosition, height !== 90);
    assert.equal(walker.hasPosition, true);
    if (walker.flying) { walker.update(1 / 60, new Set()); sameVector(camera.position, position); }
  }
});

test('all view links round trip and preserve unrelated route parameters and hash', () => {
  for (const mode of ['orbit', 'dollhouse', 'plan', 'walk']) {
    const view = { version: 'bundeshaus-v007', mode, level: 'principal', position: [12.123456, 24, -40], target: [2, 7.55, 3],
      zoom: 2, halfHeight: 34, orbit: [0.4, 0.5, -0.7], cut: 2.4, surroundings: true, muted: false };
    const url = writeViewURL('https://example.test/viewer/?custom=keep#place', view);
    const restored = readViewURL(url);
    assert.equal(restored.mode, mode); assert.equal(restored.level, view.level);
    assert.equal(restored.snapshot.zoom, 2); assert.equal(restored.cut, 2.4);
    assert.equal(restored.surroundings, true); assert.equal(restored.muted, false);
    assert.equal(restored.snapshot.position[0], 12.12346);
    assert.equal(url.searchParams.get('version'), view.version); assert.equal(url.searchParams.get('custom'), 'keep');
    assert.equal(url.hash, '#place');
    if (mode === 'plan') { assert.equal(restored.snapshot.halfHeight, 34); assert.deepEqual(restored.orbit, view.orbit); }
    else { assert.equal(url.searchParams.has('height'), false); assert.equal(url.searchParams.has('orbit'), false); }
  }
});

test('malformed view URLs cannot create NaN, degenerate or unbounded cameras', () => {
  assert.equal(readViewURL('https://example.test/?version=latest'), null);
  for (const position of ['NaN,2,3', 'Infinity,0,0', '1000000,2,3', '1,,2', '1,2', '0,0,0']) {
    assert.equal(readViewURL(`https://example.test/?view=3d&pos=${position}&target=0,0,0`).snapshot, null);
  }
  const bad = readViewURL('https://example.test/?view=floorplan&floor=missing&height=-1&zoom=NaN&cut=99&orbit=0,0,0');
  assert.equal(bad.level, 'principal'); assert.equal(bad.snapshot, null); assert.equal(bad.cut, 2); assert.equal(bad.orbit, null);
  const valid = readViewURL('https://example.test/?view=walk&pos=1,2,3&target=0,0,0&zoom=Infinity');
  assert.equal(valid.snapshot.zoom, 1);
});
