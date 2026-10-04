import { registerHooks } from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFrameLoop } from '../public/js/frame-loop.js';
import { collisionThroughWorker } from './helpers/collision-worker.mjs';
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'three') return { url: new URL('../public/vendor/three/build/three.module.js', import.meta.url).href, shortCircuit: true };
  if (specifier.startsWith('three/addons/')) return { url: new URL('../public/vendor/three/examples/jsm/' + specifier.slice(13), import.meta.url).href, shortCircuit: true };
  return next(specifier, context);
} });
const THREE = await import('three');
const { pickElement } = await import('../public/js/inspection.js');
const { fitDirectionalShadow, boxCorners, shadowCoverage } = await import('../public/js/shadow-fit.js');
const { Walker, createCollisionWorld } = await import('../public/js/walking.js');
const { describeElement } = await import('../public/js/model-metadata.js');

test('shadow coverage uses the effective lens, preserving detail at high camera zoom', () => {
  const building = new THREE.Box3(new THREE.Vector3(-20, 0, -20), new THREE.Vector3(20, 40, 20));
  const site = new THREE.Box3(new THREE.Vector3(-400, -10, -400), new THREE.Vector3(400, 80, 400));
  const target = building.getCenter(new THREE.Vector3());
  const camera = new THREE.PerspectiveCamera(45, 1.5);
  camera.position.set(0, 20, 600);
  assert.equal(shadowCoverage({ building, site, camera, target }), 'site');
  camera.zoom = 4;
  assert.equal(shadowCoverage({ building, site, camera, target }), 'building');
  const equivalent = new THREE.PerspectiveCamera(camera.getEffectiveFOV(), camera.aspect);
  equivalent.position.copy(camera.position);
  for (const previous of ['building', 'site']) {
    assert.equal(shadowCoverage({ building, site, camera, target, previous }), shadowCoverage({ building, site, camera: equivalent, target, previous }));
  }
});

test('family/type properties come from each placement and respect inference evidence and sidecar overrides', () => {
  const mesh = box(0); mesh.name = 'Chair';
  mesh.userData = { viewer_id: 'chair-1', viewer_category: 'chair', viewer_family_id: 'council-chair', viewer_type_name: 'Cane seat', viewer_environment: 'interior' };
  let info = describeElement(mesh, { objects: new Map() });
  assert.equal(info.properties.find(p => p.label === 'Category').basis, 'authored');
  assert.equal(info.properties.find(p => p.label === 'Family').value, 'council-chair');
  assert.equal(info.properties.find(p => p.label === 'Type').value, 'Cane seat');
  mesh.userData.viewer_classification_basis = 'inferred';
  assert.equal(describeElement(mesh).properties.some(p => p.label === 'Family'), false, 'incomplete inference must not become authored data');
  Object.assign(mesh.userData, { viewer_classification_confidence: 'medium', viewer_classification_source: 'Estimated from the reference photograph.' });
  assert.equal(describeElement(mesh).properties.find(p => p.label === 'Family').basis, 'inferred');
  const property = { label: 'Category', value: 'Antique chair', basis: 'authored', source: 'Inventory' };
  info = describeElement(mesh, { objects: new Map([['chair-1', { properties: [property] }]]) });
  assert.equal(info.properties.filter(p => p.label === 'Category').length, 1);
  assert.equal(info.properties.find(p => p.label === 'Category').value, 'Antique chair');
});

test('BVH walking climbs stairs and Fly returns to a supported floor', async () => {
  const floor = new THREE.Mesh(new THREE.BoxGeometry(20, .2, 20)); floor.name = 'floor'; floor.position.y = -.1;
  const meshes = [floor];
  for (let i = 0; i < 5; i++) {
    const height = (i + 1) * .15;
    const step = new THREE.Mesh(new THREE.BoxGeometry(4, height, .5)); step.name = 'stair'; step.position.set(0, height / 2, -1 - i * .5); meshes.push(step);
  }
  meshes.forEach(mesh => mesh.updateMatrixWorld(true));
  const { world } = await collisionThroughWorker(meshes);
  const walker = new Walker(new THREE.PerspectiveCamera(), world);
  assert.ok(walker.spawn([0, 0, 0], [0, 1.65, -10]));
  for (let i = 0; i < 70; i++) walker.update(1 / 60, new Set(['KeyW']));
  assert.ok(walker.camera.position.y > 2.1, 'camera must climb the risers');
  const safe = walker.safePosition.clone();
  walker.setFlying(true);
  for (let i = 0; i < 60; i++) walker.update(1 / 60, new Set(['KeyE']));
  assert.ok(walker.camera.position.y > 3);
  walker.setFlying(false);
  assert.ok(walker.camera.position.clone().sub(new THREE.Vector3(0, walker.eyeHeight, 0)).distanceTo(safe) < .05);
});

test('worker collision preserves transforms, shared geometry, wall contacts and render buffers', async () => {
  const floor = new THREE.Mesh(new THREE.BoxGeometry(20, 0.2, 20)); floor.name = 'floor'; floor.position.y = -0.1;
  const wall = new THREE.Mesh(new THREE.BoxGeometry(10, 4, 0.2)); wall.name = 'wall'; wall.position.set(0, 2, -2);
  const copy = wall.clone(); copy.position.set(4, 2, 0); copy.rotation.y = Math.PI / 2;
  const meshes = [floor, wall, copy]; meshes.forEach(mesh => mesh.updateMatrixWorld(true));
  const original = meshes.map(mesh => mesh.geometry.attributes.position.array.slice());
  const legacy = createCollisionWorld(meshes);
  const prepared = await collisionThroughWorker(meshes);
  assert.equal(prepared.triangles, legacy.triangles); assert.equal(prepared.meshes, 3);
  meshes.forEach((mesh, i) => assert.deepEqual(mesh.geometry.attributes.position.array, original[i], 'transferring copies must not detach render geometry'));
  const first = new Walker(new THREE.PerspectiveCamera(), legacy.world);
  const second = new Walker(new THREE.PerspectiveCamera(), prepared.world);
  for (const walker of [first, second]) {
    assert.ok(walker.spawn([0, 0, 0], [0, 1.65, -5]));
    for (let i = 0; i < 180; i++) walker.update(1 / 60, new Set(['KeyW']));
  }
  assert.ok(first.camera.position.distanceTo(second.camera.position) < 1e-10);
  assert.ok(second.camera.position.z > -1.7 && second.camera.position.z < -1);
});

function frameHarness(draw) {
  const queue = new Map(); let id = 0;
  const loop = createFrameLoop(draw, { request(callback) { queue.set(++id, callback); return id; }, cancel(id) { queue.delete(id); } });
  const tick = () => { const callbacks = [...queue.values()]; queue.clear(); callbacks.forEach(callback => callback(16)); };
  return { queue, loop, tick };
}

test('render requests coalesce, stop at idle, and can resume after damping settles', () => {
  let draws = 0;
  const frames = frameHarness(() => { draws++; if (draws < 3) frames.loop.invalidate(); });
  for (let i = 0; i < 100; i++) frames.loop.invalidate();
  assert.equal(frames.queue.size, 1);
  frames.tick(); frames.tick(); frames.tick();
  assert.equal(draws, 3); assert.equal(frames.queue.size, 0);
  frames.tick(); assert.equal(draws, 3);
  frames.loop.invalidate(); frames.tick(); assert.equal(draws, 4);
});

test('walking stays continuous, hidden tabs cancel pending frames, context loss stops permanently', () => {
  let draws = 0;
  const { loop, queue, tick } = frameHarness(() => { draws++; return true; });
  loop.invalidate(); tick(); tick();
  assert.equal(draws, 2); assert.equal(queue.size, 1);
  loop.setPaused(true); loop.invalidate(); tick();
  assert.equal(queue.size, 0); assert.equal(draws, 2);
  loop.setPaused(false); tick(); assert.equal(draws, 3);
  loop.stop(); loop.invalidate(); loop.setPaused(false); tick();
  assert.equal(draws, 3); assert.equal(queue.size, 0);
});

function box(z, size = 1) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), new THREE.MeshStandardMaterial({ side: THREE.DoubleSide }));
  mesh.position.z = z; mesh.updateMatrixWorld(true);
  mesh.userData.bounds = new THREE.Box3().setFromObject(mesh);
  return mesh;
}

test('picking uses exact surfaces and skips distant meshes after finding the nearest hit', () => {
  const meshes = Array.from({ length: 100 }, (_, index) => box(-index * 3));
  const ray = new THREE.Raycaster(new THREE.Vector3(0, 0, 5), new THREE.Vector3(0, 0, -1));
  const stats = {};
  assert.equal(pickElement(ray, [...meshes].reverse(), stats), meshes[0]);
  assert.equal(stats.raycasts, 1); assert.equal(stats.candidates, 100);
  meshes[0].visible = false;
  assert.equal(pickElement(ray, meshes), meshes[1]);
  const hiddenParent = new THREE.Group(); hiddenParent.visible = false; hiddenParent.add(meshes[1]);
  meshes[2].material.visible = false;
  assert.equal(pickElement(ray, meshes), meshes[3]);
  ray.far = 3; assert.equal(pickElement(ray, meshes), null);
});

test('picking handles rays inside bounds and clipped front faces without losing a closer hit', () => {
  const room = box(0, 20); const object = box(-3);
  const ray = new THREE.Raycaster(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1));
  assert.equal(pickElement(ray, [room, object]), object);
  object.material.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, 0, -1), -3)];
  assert.equal(pickElement(ray, [room, object]), object, 'rear surface remains selectable when front is clipped');
  object.material.clippingPlanes.push(new THREE.Plane(new THREE.Vector3(1, 0, 0), -1));
  assert.equal(pickElement(ray, [room, object]), room);
  object.material.clipIntersection = true;
  assert.equal(pickElement(ray, [room, object]), object);
});

const building = new THREE.Box3(new THREE.Vector3(-30, -5, -31), new THREE.Vector3(30, 61, 44));
const site = new THREE.Box3(new THREE.Vector3(-311, -45, -316), new THREE.Vector3(322, 61, 264));
test('shadow receivers fit at different sun angles and distant casters remain in the depth range', () => {
  for (const direction of [[1, 1, 1], [1, 0.01, 0], [0, 1, 0], [-0.1, -0.5, 1]]) {
    const light = new THREE.DirectionalLight();
    light.position.fromArray(direction); light.shadow.mapSize.set(1024, 1024);
    const sunDirection = light.position.clone().normalize();
    fitDirectionalShadow(light, building, site);
    const camera = light.shadow.camera;
    assert.ok(light.position.clone().sub(light.target.position).normalize().distanceTo(sunDirection) < 1e-10);
    for (const corner of boxCorners(building)) {
      corner.project(camera);
      assert.ok(Math.max(Math.abs(corner.x), Math.abs(corner.y), Math.abs(corner.z)) <= 1 + 1e-9);
    }
    for (const corner of boxCorners(site)) assert.ok(Math.abs(corner.project(camera).z) <= 1 + 1e-9);
    assert.ok(camera.right - camera.left < 150, 'building detail must not cover the whole city');
    assert.ok(camera.near > 0 && camera.far > camera.near);
    const saved = camera.projectionMatrix.clone();
    fitDirectionalShadow(light, building, site);
    assert.ok(saved.elements.every((value, i) => Math.abs(value - camera.projectionMatrix.elements[i]) < 1e-9));
    fitDirectionalShadow(light, site);
    for (const corner of boxCorners(site)) assert.ok(Math.max(...corner.project(camera).toArray().map(Math.abs)) <= 1 + 1e-9);
  }
});

test('shadow coverage keeps detail at building views and switches to the site on zoom/pan with hysteresis', () => {
  const camera = new THREE.PerspectiveCamera(45, 1.6);
  const target = building.getCenter(new THREE.Vector3());
  camera.position.copy(target).add(new THREE.Vector3(100, 100, 100));
  assert.equal(shadowCoverage({ building, site, camera, target }), 'building');
  camera.position.set(1000, 800, 1000);
  assert.equal(shadowCoverage({ building, site, camera, target }), 'site');
  camera.position.copy(target).add(new THREE.Vector3(100, 100, 100));
  assert.equal(shadowCoverage({ building, site, camera, target, previous: 'site' }), 'building');
  assert.equal(shadowCoverage({ building, site, camera, target: new THREE.Vector3(200, 0, 200) }), 'site');
  assert.equal(shadowCoverage({ building, site: null, camera, target }), 'building');
  assert.equal(shadowCoverage({ building, site, camera: new THREE.OrthographicCamera(), target }), 'building');
  const radius = building.getSize(new THREE.Vector3()).length() / 2;
  camera.position.copy(target).add(new THREE.Vector3(0, 0, radius * 3.5 / Math.sin(THREE.MathUtils.degToRad(22.5))));
  assert.equal(shadowCoverage({ building, site, camera, target, previous: 'building' }), 'building');
  assert.equal(shadowCoverage({ building, site, camera, target, previous: 'site' }), 'site');
});
