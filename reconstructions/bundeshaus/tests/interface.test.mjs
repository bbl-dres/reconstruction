// Pure layout policies and input events; no browser or WebGL emulation.
import { registerHooks } from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';
import { popupPlacement, renderBudget } from '../public/js/view-layout.js';

registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'three') return { url: new URL('../public/vendor/three/build/three.module.js', import.meta.url).href, shortCircuit: true };
  if (specifier.startsWith('three/addons/')) return { url: new URL('../public/vendor/three/examples/jsm/' + specifier.slice(13), import.meta.url).href, shortCircuit: true };
  return next(specifier, context);
} });
const THREE = await import('three');
const { Octree } = await import('three/addons/math/Octree.js');
const { Walker } = await import('../public/js/walking.js');
const { wireTouchWalk, turnView } = await import('../public/js/touch-walk.js');
const { wirePicking } = await import('../public/js/inspection.js');

const devices = [[320, 568], [390, 844], [844, 390], [768, 1024], [1024, 768], [1440, 900], [2560, 1440], [3840, 2160]];

test('compact lighting uses available height while desktop keeps its toolbar anchor', () => {
  const edges = {left: 20, right: 20, top: 20, bottom: 28};
  const phone = popupPlacement({ left: 20, bottom: 124 }, {left: 0, top: 0, width: 320, height: 568}, 352, edges);
  assert.equal(phone.top, 20); assert.equal(phone.maxHeight, 520);
  const landscape = popupPlacement({ left: 20, bottom: 64 }, {left: 0, top: 0, width: 568, height: 320}, 352, edges);
  assert.equal(landscape.top, 20); assert.equal(landscape.maxHeight, 272);
  const desktop = popupPlacement({ left: 500, bottom: 76 }, {left: 0, top: 0, width: 1280, height: 720}, 352, edges);
  assert.equal(desktop.top, 86);
});
test('lighting dropdown stays within phone, tablet, landscape and large-screen viewports', () => {
  for (const [width, height] of devices) {
    for (const anchor of [{ left: 16, bottom: 136 }, { left: width - 150, bottom: 68 }]) {
      const box = popupPlacement(anchor, { left: 0, top: 0, width, height });
      assert.ok(box.left >= 16 && box.left + box.width <= width - 16, `${width}x${height}`);
      assert.ok(box.top >= 16 && box.top + box.maxHeight <= height - 16);
      assert.ok(box.maxHeight >= 104);
    }
  }
});

test('dropdown anchoring handles keyboard-reduced and zoomed/panned visual viewports', () => {
  for (const viewport of [{ left: 0, top: 100, width: 390, height: 280 }, { left: 80, top: 150, width: 320, height: 256 }]) {
    const box = popupPlacement({ left: 16, bottom: 136 }, viewport);
    assert.ok(box.left >= viewport.left + 16);
    assert.ok(box.left + box.width <= viewport.left + viewport.width - 16);
    assert.ok(box.top >= viewport.top + 16);
    assert.ok(box.top + box.maxHeight <= viewport.top + viewport.height - 16);
  }
});

test('rendering budgets bound high-DPI work without changing model geometry', () => {
  for (const [width, height] of devices) {
    for (const touch of [true, false]) {
      for (const quality of ['auto', 'low', 'high']) {
        const budget = renderBudget({ width, height, dpr: 3, touch, quality });
        const pixels = width * height * budget.pixelRatio ** 2;
        const limit = quality === 'low' ? 2e6 : quality === 'high' ? 8e6 : touch ? 3e6 : 5e6;
        assert.ok(pixels <= limit + 0.001, `${width}x${height}, ${quality}`);
        assert.ok(budget.pixelRatio > 0 && budget.pixelRatio <= 2);
        assert.equal(budget.shadowSize, quality === 'low' || (touch && quality === 'auto') ? 1024 : 2048);
      }
    }
  }
  assert.equal(renderBudget({ width: 390, height: 844, dpr: 1 }).pixelRatio, 1);
});

class Surface extends EventTarget {
  constructor(key) {
    super(); this.dataset = { walkKey: key }; this.classes = new Set(); this.captures = new Set();
    this.classList = { add: key => this.classes.add(key), remove: key => this.classes.delete(key) };
  }
  setPointerCapture(id) { this.captures.add(id); }
  hasPointerCapture(id) { return this.captures.has(id); }
  getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 100 }; }
  releasePointerCapture(id) { this.captures.delete(id); this.send('lostpointercapture', { pointerId: id }); }
  send(type, values = {}) { const event = new Event(type, { cancelable: true }); Object.assign(event, { button: 0, ...values }); this.dispatchEvent(event); }
}

function controls() {
  const canvas = new Surface();
  const forward = new Surface('KeyW');
  const right = new Surface('KeyD');
  const camera = new THREE.PerspectiveCamera();
  const keys = new Set();
  const controller = wireTouchWalk({ canvas, buttons: [forward, right], camera, keys, invalidate() {} });
  return { canvas, forward, right, camera, keys, controller };
}

test('touch walking allows simultaneous movement and looking, then releases cancelled input', () => {
  const input = controls();
  input.controller.setActive(true);
  input.forward.send('pointerdown', { pointerId: 1 });
  input.canvas.send('pointerdown', { pointerId: 2, clientX: 200, clientY: 150 });
  const before = input.camera.quaternion.clone();
  input.canvas.send('pointermove', { pointerId: 2, clientX: 240, clientY: 170 });
  assert.ok(input.keys.has('KeyW'));
  assert.ok(input.camera.quaternion.angleTo(before) > 0.1);
  input.right.send('pointerdown', { pointerId: 3 });
  assert.deepEqual(input.keys, new Set(['KeyW', 'KeyD']));
  input.forward.send('pointercancel', { pointerId: 1 });
  assert.deepEqual(input.keys, new Set(['KeyD']));
  input.right.releasePointerCapture(3);
  assert.equal(input.keys.size, 0);
  input.controller.setActive(false);
  assert.equal(input.canvas.captures.size, 0);
  const paused = input.camera.quaternion.clone();
  input.canvas.send('pointermove', { pointerId: 2, clientX: 100, clientY: 100 });
  input.forward.send('pointerdown', { pointerId: 4 });
  assert.ok(input.camera.quaternion.equals(paused));
  assert.equal(input.keys.size, 0);
});

test('touch direction buttons support keyboard presses and clear held input when paused', () => {
  const input = controls();
  input.controller.setActive(true);
  input.forward.send('keydown', { key: 'Enter' });
  assert.ok(input.keys.has('KeyW'));
  input.forward.send('keyup', { key: 'Enter' });
  assert.equal(input.keys.size, 0);
  input.forward.send('pointerdown', { pointerId: 1 });
  input.controller.setActive(false);
  assert.equal(input.keys.size, 0);
  assert.equal(input.forward.classes.size, 0);
  assert.equal(input.forward.captures.size, 0);
});

test('touch look clamps pitch and never rolls the camera or moves the eye position', () => {
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(3, 1.65, 4);
  for (const dy of [-100000, 100000]) {
    turnView(camera, 150, dy);
    const euler = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
    assert.ok(Math.abs(euler.x) <= Math.PI / 2 - 0.079);
    assert.ok(Math.abs(euler.z) < 1e-10);
    assert.deepEqual(camera.position.toArray(), [3, 1.65, 4]);
  }
});

test('touch movement uses the same collision world and stops when the finger releases', () => {
  const group = new THREE.Group();
  const floor = new THREE.Mesh(new THREE.BoxGeometry(20, 0.2, 20)); floor.position.y = -0.1;
  const wall = new THREE.Mesh(new THREE.BoxGeometry(10, 4, 0.2)); wall.position.set(0, 2, -2);
  group.add(floor, wall);
  const input = controls();
  const walker = new Walker(input.camera, new Octree().fromGraphNode(group));
  assert.ok(walker.spawn([0, 0, 0], [0, 1.65, -5]));
  input.controller.setActive(true);
  input.forward.send('pointerdown', { pointerId: 1 });
  for (let i = 0; i < 120; i++) walker.update(1 / 60, input.keys);
  assert.ok(input.camera.position.z < -1 && input.camera.position.z > -1.7);
  input.forward.send('pointerup', { pointerId: 1 });
  const stop = input.camera.position.clone();
  for (let i = 0; i < 60; i++) walker.update(1 / 60, input.keys);
  assert.ok(input.camera.position.distanceTo(stop) < 0.01);
});

test('inactive and cancelled touch gestures do not block later element selection', () => {
  const canvas = new Surface();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(0, 0, 5); camera.lookAt(0, 0, 0);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  mesh.updateMatrixWorld(true);
  let enabled = false;
  let picks = 0;
  wirePicking({ canvas, camera: () => camera, meshes: () => [mesh], enabled: () => enabled, onPick: () => picks++ });
  canvas.send('pointerdown', { pointerId: 1, clientX: 50, clientY: 50 });
  enabled = true;
  canvas.send('pointerdown', { pointerId: 2, clientX: 50, clientY: 50 });
  canvas.send('pointerup', { pointerId: 2, clientX: 50, clientY: 50 });
  assert.equal(picks, 1);
  canvas.send('pointerdown', { pointerId: 3, clientX: 50, clientY: 50 });
  canvas.send('pointercancel', { pointerId: 3 });
  canvas.send('pointerdown', { pointerId: 4, clientX: 50, clientY: 50 });
  canvas.send('pointermove', { pointerId: 4, clientX: 80, clientY: 50 });
  canvas.send('pointerup', { pointerId: 4, clientX: 50, clientY: 50 });
  assert.equal(picks, 1, 'a drag must not select an element');
  canvas.send('pointerdown', { pointerId: 5, clientX: 50, clientY: 50 });
  canvas.send('lostpointercapture', { pointerId: 5 });
  canvas.send('pointerup', { pointerId: 5, clientX: 50, clientY: 50 });
  assert.equal(picks, 2, 'capture release during pointerup must preserve a normal tap');
});
