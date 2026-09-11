// No install or build required: node --test --test-isolation=none tests/viewer.test.mjs
import { registerHooks } from 'node:module';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';
import { collisionThroughWorker } from './helpers/collision-worker.mjs';
import { readGLBBytes } from './helpers/glb-bytes.mjs';

registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'three') return { url: new URL('../public/vendor/three/build/three.module.js', import.meta.url).href, shortCircuit: true };
  if (specifier.startsWith('three/addons/')) return { url: new URL('../public/vendor/three/examples/jsm/' + specifier.slice(13), import.meta.url).href, shortCircuit: true };
  return next(specifier, context);
} });
globalThis.ProgressEvent ??= class { constructor(type, init) { this.type = type; Object.assign(this, init); } };

const THREE = await import('three');
const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
const { MeshoptDecoder } = await import('../public/vendor/meshoptimizer/meshopt_decoder.mjs');
const { Octree } = await import('three/addons/math/Octree.js');
const { visibleInMode, collisionCandidate, WALK_STARTS, LEVELS, isStaircaseSculpture, isPublicEntrance, belongsToUpperRoom } = await import('../public/js/model-policy.js');
const { createCollisionWorld, Walker } = await import('../public/js/walking.js');
const { OrbitControls } = await import('three/addons/controls/OrbitControls.js');
const { captureView, restoreView, navigateView } = await import('../public/js/view-navigation.js');
const { createSurroundingsStyle } = await import('../public/js/surroundings-style.js');
const { parseMetadata, describeElement } = await import('../public/js/model-metadata.js');
const { pickElement, highlightElement } = await import('../public/js/inspection.js');
const { parseCatalog, chooseModel } = await import('../public/js/model-catalog.js');
const { localParts, localInstant, dayOfYear, daysInYear, solarDirection, solarState, calendarSelection, calendarDate } = await import('../public/js/solar-time.js');
const { Daylight } = await import('../public/js/daylight.js');
const { prepareStaticModel } = await import('../public/js/asset-loader.js');

// Exercise the real GLTFLoader and actual model geometry. Browser image decode
// and WebGL rendering are separate checks, so omit textures only in this test.
const catalog = parseCatalog(JSON.parse(await readFile(new URL('../public/models/catalog.json', import.meta.url), 'utf8')));
const bytes = await readFile(new URL('../public/models/' + catalog.find(entry => entry.version === 3).building.slice(2), import.meta.url));
const jsonLength = bytes.readUInt32LE(12);
const doc = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
const binStart = 20 + jsonLength + 8;
doc.buffers[0].uri = 'data:application/octet-stream;base64,' + bytes.subarray(binStart, binStart + doc.buffers[0].byteLength).toString('base64');
delete doc.materials; delete doc.textures; delete doc.images; delete doc.samplers;
for (const mesh of doc.meshes) for (const primitive of mesh.primitives) delete primitive.material;
const { scene } = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(JSON.stringify(doc), '');
scene.updateMatrixWorld(true);
const meshes = [];
scene.traverse(mesh => {
  if (!mesh.isMesh) return;
  mesh.name = mesh.userData.viewer_source_name || mesh.name.replaceAll('_', ' ');
  mesh.userData.bounds = new THREE.Box3().setFromObject(mesh);
  meshes.push(mesh);
});
const collision = createCollisionWorld(meshes);
console.log(`Real model: ${meshes.length} meshes; collision index: ${collision.meshes} meshes / ${collision.triangles} triangles`);

test('all building geometry is restored when leaving dollhouse for 3D or walk', () => {
  assert.equal(meshes.length, 662);
  const shell = meshes.filter(mesh => mesh.userData.viewer_dollhouse_hidden);
  assert.ok(shell.length > 200);
  for (const mesh of shell) {
    assert.equal(visibleInMode(mesh, 'dollhouse'), isStaircaseSculpture(mesh), mesh.name);
    assert.equal(visibleInMode(mesh, 'orbit'), true, mesh.name);
    assert.equal(visibleInMode(mesh, 'walk'), true, mesh.name);
  }
});

test('floor plan retains exterior walls and removes roofs, ceilings and upper rooms', () => {
  const principal = meshes.filter(mesh => visibleInMode(mesh, 'plan', 'principal'));
  assert.ok(principal.length > 150);
  assert.ok(principal.some(mesh => mesh.userData.viewer_role === 'exterior'));
  assert.ok(principal.some(mesh => mesh.name === 'NR floor'));
  assert.ok(!principal.some(mesh => ['roof', 'ceiling'].includes(mesh.userData.viewer_role)));
  assert.ok(!principal.some(mesh => mesh.name === '301 parquet floor'));
  const upper = meshes.filter(mesh => visibleInMode(mesh, 'plan', 'upper'));
  assert.ok(upper.some(mesh => mesh.name === '301 parquet floor'));
  assert.ok(!upper.some(mesh => mesh.name === 'NR floor'));
});

for (const [name, start] of Object.entries(WALK_STARTS)) {
  test(`real-model walking start is clear and supported: ${name}`, () => {
    const camera = new THREE.PerspectiveCamera();
    const walker = new Walker(camera, collision.world);
    assert.equal(walker.spawn(start.position, start.target), true, `No valid spawn near ${start.position}`);
    const original = camera.position.clone();
    for (let i = 0; i < 300; i++) walker.update(1 / 60, new Set());
    assert.ok(Math.abs(camera.position.y - original.y) < 0.15, `Start falls from ${original.y} to ${camera.position.y}`);
    assert.ok(walker.grounded);
  });
}

function testWorld() {
  const group = new THREE.Group();
  const floor = new THREE.Mesh(new THREE.BoxGeometry(20, 0.2, 20));
  floor.position.y = -0.1;
  const wall = new THREE.Mesh(new THREE.BoxGeometry(10, 4, 0.2));
  wall.position.set(0, 2, -2);
  group.add(floor, wall);
  return new Octree().fromGraphNode(group);
}

test('walking stops at a wall and survives a large paused-frame delta', () => {
  const camera = new THREE.PerspectiveCamera();
  const walker = new Walker(camera, testWorld());
  assert.ok(walker.spawn([0, 0, 0], [0, 1.65, -5]));
  for (let i = 0; i < 240; i++) walker.update(1 / 60, new Set(['KeyW', 'ShiftLeft']));
  assert.ok(camera.position.z > -1.7 && camera.position.z < -1, `Wall penetration: z=${camera.position.z}`);
  walker.update(10, new Set(['KeyW', 'ShiftLeft']));
  assert.ok(camera.position.z > -1.7);
  assert.ok(camera.position.y > 1.5 && camera.position.y < 1.8);
});

test('fly mode passes walls, and returning to walking restores a supported position', () => {
  const camera = new THREE.PerspectiveCamera();
  const walker = new Walker(camera, testWorld());
  walker.spawn([0, 0, 0], [0, 1.65, -5]);
  for (let i = 0; i < 60; i++) walker.update(1 / 60, new Set());
  walker.setFlying(true);
  for (let i = 0; i < 90; i++) walker.update(1 / 60, new Set(['KeyW']));
  assert.ok(camera.position.z < -3);
  walker.setFlying(false);
  assert.ok(camera.position.z > -1);
  assert.ok(camera.position.y > 1.5);
});

test('walking climbs ordinary low stair risers', () => {
  const group = new THREE.Group();
  const floor = new THREE.Mesh(new THREE.BoxGeometry(20, 0.2, 20));
  floor.position.y = -0.1;
  group.add(floor);
  for (let i = 0; i < 5; i++) {
    const height = (i + 1) * 0.15;
    const tread = new THREE.Mesh(new THREE.BoxGeometry(4, height, 0.5));
    tread.position.set(0, height / 2, -1 - i * 0.5);
    group.add(tread);
  }
  const camera = new THREE.PerspectiveCamera();
  const walker = new Walker(camera, new Octree().fromGraphNode(group));
  walker.spawn([0, 0, 0], [0, 1.65, -5]);
  for (let i = 0; i < 65; i++) walker.update(1 / 60, new Set(['KeyW']));
  assert.ok(camera.position.z < -2.2, `Did not advance up stairs: ${camera.position.toArray()}`);
  assert.ok(camera.position.y > 2.1, `Did not climb stairs: ${camera.position.toArray()}`);
});

test('returning to a floor plan restores its scale and position after another floor and a resize', () => {
  const camera = new THREE.OrthographicCamera(-80, 80, 50, -50, 0.1, 1000);
  camera.up.set(0, 0, -1);
  camera.position.set(12, 160, -18);
  const control = new OrbitControls(camera);
  control.target.set(12, 10, -18);
  control.update();
  camera.zoom = 2;
  const saved = captureView(camera, control, 'principal');
  camera.top = 200;
  camera.bottom = -200;
  camera.zoom = 0.5;
  camera.position.set(100, 200, 100);
  control.target.set(100, 0, 100);
  restoreView(saved, camera, control, 0.6);
  assert.equal(saved.level, 'principal');
  assert.equal(camera.top, 50);
  assert.equal(camera.bottom, -50);
  assert.equal(camera.right, 30);
  assert.equal(camera.left, -30);
  assert.equal(camera.zoom, 2);
  assert.ok(camera.position.distanceTo(saved.position) < 1e-8);
  assert.ok(control.target.equals(saved.target));
});

test('zoom controls keep the target fixed and respect perspective distance limits', () => {
  const camera = new THREE.PerspectiveCamera(45, 1.6, 0.1, 1000);
  camera.position.set(30, 30, 30);
  const control = new OrbitControls(camera);
  control.minDistance = 2;
  control.maxDistance = 100;
  const target = control.target.clone();
  for (let i = 0; i < 100; i++) navigateView(camera, control, { zoom: 0.8 });
  assert.ok(Math.abs(camera.position.distanceTo(target) - 2) < 1e-8);
  for (let i = 0; i < 100; i++) navigateView(camera, control, { zoom: 1.25 });
  assert.ok(Math.abs(camera.position.distanceTo(target) - 100) < 1e-8);
  assert.ok(control.target.equals(target));
});

test('keyboard navigation pans a plan in screen directions without tilting it', () => {
  const camera = new THREE.OrthographicCamera(-50, 50, 50, -50, 0.1, 1000);
  camera.up.set(0, 0, -1);
  camera.position.set(0, 100, 0);
  const control = new OrbitControls(camera);
  control.enableRotate = false;
  control.minZoom = 0.4;
  control.maxZoom = 12;
  const direction = camera.getWorldDirection(new THREE.Vector3());
  navigateView(camera, control, { vertical: 1 });
  assert.ok(control.target.z < 0, 'screen-up moves toward the top of the plan');
  navigateView(camera, control, { horizontal: 1 });
  assert.ok(control.target.x > 0);
  assert.ok(direction.distanceTo(camera.getWorldDirection(new THREE.Vector3())) < 1e-8);
  for (let i = 0; i < 100; i++) navigateView(camera, control, { zoom: 0.8 });
  assert.equal(camera.zoom, 12);
  for (let i = 0; i < 100; i++) navigateView(camera, control, { zoom: 1.25 });
  assert.equal(camera.zoom, 0.4);
});

test('keyboard rotation stays above the ground and Shift-style pan preserves distance', () => {
  const camera = new THREE.PerspectiveCamera(45, 1.6, 0.1, 1000);
  camera.position.set(30, 30, 30);
  const control = new OrbitControls(camera);
  control.maxPolarAngle = Math.PI * 0.495;
  const distance = camera.position.distanceTo(control.target);
  for (let i = 0; i < 100; i++) navigateView(camera, control, { vertical: -1 });
  assert.ok(camera.position.y > control.target.y);
  assert.ok(Math.abs(camera.position.distanceTo(control.target) - distance) < 1e-8);
  const offset = camera.position.clone().sub(control.target);
  navigateView(camera, control, { horizontal: 1, vertical: 1, pan: true });
  assert.ok(camera.position.clone().sub(control.target).distanceTo(offset) < 1e-8);
});

test('inspecting the building cannot move or turn a separate walking camera', () => {
  const walkCamera = new THREE.PerspectiveCamera();
  const walker = new Walker(walkCamera, collision.world);
  const start = WALK_STARTS.hall;
  assert.ok(walker.spawn(start.position, start.target));
  walker.update(0.05, new Set(['KeyW']));
  const position = walkCamera.position.clone();
  const heading = walkCamera.quaternion.clone();
  const inspectCamera = new THREE.PerspectiveCamera();
  inspectCamera.position.set(30, 30, 30);
  const control = new OrbitControls(inspectCamera);
  navigateView(inspectCamera, control, { horizontal: 1, zoom: 0.8 });
  assert.ok(walkCamera.position.equals(position));
  assert.ok(walkCamera.quaternion.equals(heading));
  assert.ok(walker.capsule.end.equals(position));
});

test('muted surroundings restore exact original materials, colors and textures', () => {
  const texture = new THREE.Texture();
  const original = new THREE.MeshStandardMaterial({ color: 0x984325, map: texture });
  const other = new THREE.MeshStandardMaterial({ color: 0x124466 });
  const geometry = new THREE.BoxGeometry();
  const root = new THREE.Group();
  const single = new THREE.Mesh(geometry, original);
  const grouped = new THREE.Mesh(geometry, [original, other]);
  const building = new THREE.Mesh(geometry, original); // deliberately shares a material
  root.add(single, grouped);
  const originalArray = grouped.material;
  const originalColor = original.color.clone();
  const style = createSurroundingsStyle(root);
  style.setMuted(true);
  assert.equal(style.materials.length, 2);
  assert.notEqual(single.material, original);
  assert.equal(single.material.map, null);
  assert.equal(grouped.material[0], single.material);
  assert.equal(building.material, original, 'the building is unaffected');
  assert.equal(original.map, texture);
  assert.ok(original.color.equals(originalColor));
  for (let i = 0; i < 5; i++) { style.setMuted(false); style.setMuted(true); }
  style.setMuted(false);
  assert.equal(single.material, original);
  assert.equal(grouped.material, originalArray);
  assert.equal(single.material.map, texture);
});

test('metadata rejects ambiguous cameras and properties without inference evidence', () => {
  const metadata = parseMetadata({ schemaVersion: 1, coordinates: 'gltf-y-up-meters',
    views: [
      { id: 'good', title: 'Overview', camera: { mode: 'orbit', frame: 'building' } },
      { id: 'bad-plan', title: 'Invalid', camera: { mode: 'plan', level: 'all', frame: 'building' } },
      { id: 'bad-camera', title: 'Invalid', camera: { mode: 'orbit', position: [0, 1, 0], target: [0, 1, 0] } },
    ],
    pointsOfInterest: [{ id: 'good', title: 'Duplicate', camera: { mode: 'orbit', frame: 'site' } }],
    objects: [{ id: 'door-1', title: 'Door', properties: [
      { label: 'Material', value: 'Oak', basis: 'inferred', source: 'Photo' },
      { label: 'Material', value: 'Timber', basis: 'inferred', confidence: 'medium', source: 'Photo' },
    ] }],
  });
  assert.equal(metadata.views.length, 1);
  assert.equal(metadata.pointsOfInterest.length, 0);
  assert.equal(metadata.objects.get('door-1').properties.length, 1);
  assert.equal(metadata.issues.length, 4);
  assert.throws(() => parseMetadata({ schemaVersion: 1, coordinates: 'blender-z-up' }));
});

test('element fallback labels guesses and world-aligned model measurements', () => {
  const door = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 0.1), new THREE.MeshStandardMaterial());
  door.name = 'Timber door leaf';
  door.userData.bounds = new THREE.Box3().setFromObject(door);
  const info = describeElement(door, { objects: new Map() });
  assert.equal(info.properties[0].value, 'Door');
  assert.equal(info.properties[0].basis, 'inferred');
  assert.equal(info.properties[0].confidence, 'medium');
  assert.equal(info.properties[1].basis, 'measured');
  assert.equal(info.properties[1].value, '1.00 × 2.00 × 0.10 m');
});

test('picking ignores invisible meshes and surfaces outside the visible floor cut', () => {
  const floor = new THREE.Mesh(new THREE.BoxGeometry(10, 0.2, 10), new THREE.MeshStandardMaterial({ side: THREE.DoubleSide }));
  const roof = new THREE.Mesh(new THREE.BoxGeometry(10, 1, 10), new THREE.MeshStandardMaterial({ side: THREE.DoubleSide }));
  roof.position.y = 5;
  roof.material.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, -1, 0), 2)];
  floor.updateMatrixWorld(true); roof.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(new THREE.Vector3(0, 10, 0), new THREE.Vector3(0, -1, 0));
  assert.equal(pickElement(ray, [roof, floor]), floor);
  roof.material.clippingPlanes = null;
  assert.equal(pickElement(ray, [roof, floor]), roof);
  roof.visible = false;
  assert.equal(pickElement(ray, [roof, floor]), floor);
});

test('inspection highlighting never mutates shared materials and restores them on close', () => {
  const material = new THREE.MeshStandardMaterial({ color: 0xabcdef });
  const first = new THREE.Mesh(new THREE.BoxGeometry(), material);
  const second = new THREE.Mesh(first.geometry, material);
  const restore = highlightElement(first);
  assert.notEqual(first.material, material);
  assert.equal(second.material, material);
  assert.equal(material.emissive.getHex(), 0);
  assert.equal(first.material.isMeshBasicMaterial, true);
  assert.equal(first.material.color.getHex(), 0x38d9ff);
  assert.equal(first.material.toneMapped, false);
  assert.equal(first.children.length, 1);
  assert.equal(first.children[0].material.depthTest, false);
  restore();
  assert.equal(first.material, material);
  assert.equal(first.children.length, 0);
  restore(); // Closing/unloading twice must be harmless.
});

test('authored interior sculptures are retained even when they share a collection with exterior figures', () => {
  const art = { name: 'New interior artwork', userData: { viewer_category: 'sculpture', viewer_role: 'decoration',
    viewer_environment: 'interior', viewer_dollhouse_hidden: false, viewer_source_collections: ['04 | Sculpture approximations'] } };
  assert(visibleInMode(art, 'dollhouse'));
  assert(!visibleInMode({ ...art, userData: { ...art.userData, viewer_environment: 'exterior' } }, 'dollhouse'));
});

test('dollhouse removes new facade assemblies while retaining interior columns and gallery circulation', () => {
  const column = { name: 'Corinthian column', userData: { viewer_role: 'decoration', viewer_category: 'column',
    viewer_environment: 'exterior', viewer_dollhouse_hidden: false, viewer_source_collections: ['02d | South facade precision v009'] } };
  assert.equal(visibleInMode(column, 'dollhouse'), false);
  assert.equal(visibleInMode(column, 'orbit'), true);
  assert.equal(visibleInMode(column, 'walk'), true);
  assert.equal(visibleInMode(column, 'plan'), true, 'Floor plan retains the envelope for slicing');
  const interior = { ...column, userData: { ...column.userData, viewer_environment: 'interior', viewer_source_collections: ['07 | Kuppelhalle and ceremonial stairs'] } };
  assert.equal(visibleInMode(interior, 'dollhouse'), true);
  const gallery = { name: 'Connector NE upper gallery structural deck', userData: { ...column.userData,
    viewer_dollhouse_hidden: true, viewer_source_collections: ['02b | Connecting galleries'], viewer_floor_ids: ['lower'],
    bounds: new THREE.Box3(new THREE.Vector3(-30, 7.3, -20), new THREE.Vector3(-20, 7.6, -15)) } };
  assert.equal(visibleInMode(gallery, 'dollhouse', 'principal'), true);
  assert.equal(visibleInMode(gallery, 'plan', 'principal'), true);
  assert.equal(visibleInMode(gallery, 'dollhouse', 'lower'), false, 'World bounds still restrict floor membership');
  assert.equal(visibleInMode(gallery, 'dollhouse', 'upper'), false);
  assert.equal(collisionCandidate(gallery), true);
  assert.equal(visibleInMode({ ...gallery, name: 'Connector NE upper cornice tier 01' }, 'dollhouse'), false);
  assert.equal(visibleInMode({ ...gallery, name: 'Connector NE recessed flat roof deck' }, 'dollhouse'), false);
});

test('chamber gallery storey tags do not hide its decks and railings from the principal cutaway', () => {
  const deck = { name: 'NR v019 west gallery corner deck | Oak', userData: {
    viewer_role: 'floor', viewer_floor_ids: ['upper'], viewer_room_ids: ['national-council'],
    bounds: new THREE.Box3(new THREE.Vector3(0, 13.8, 0), new THREE.Vector3(3, 13.96, 3)) } };
  for (const mode of ['dollhouse', 'plan']) {
    assert(visibleInMode(deck, mode, 'principal'));
    assert(!visibleInMode(deck, mode, 'lower'));
    assert(!visibleInMode(deck, mode, 'upper'), 'Room 301 stays separate');
    assert(!visibleInMode({ ...deck, userData: { ...deck.userData, viewer_role: 'ceiling' } }, mode, 'principal'));
  }
  assert(collisionCandidate(deck), 'Authored deck supports walking');
  assert(collisionCandidate({ name: 'NR v019 dais president | Blue carpet', userData: { viewer_role: 'floor' } }));
  const other = { ...deck, userData: { ...deck.userData, viewer_room_ids: ['different-room'] } };
  assert(!visibleInMode(other, 'dollhouse', 'principal'), 'Compatibility correction is scoped to the chamber');
});

test('version catalog selects the highest number and honors explicit previous versions', () => {
  const entry = { id: 'model-9', label: 'v009', version: 9, building: './model-9/building.glb', surroundings: './model-9/surroundings.glb', metadata: './model-9/viewer.json', levels: ['all', 'principal'] };
  const models = parseCatalog({ schemaVersion: 1, models: [entry, { ...entry, id: 'model-10', version: 10, label: 'v010' }, { ...entry, id: 'invalid', building: 'https://example.com/model.glb' }] });
  assert.equal(models.length, 2);
  assert.equal(chooseModel(models, null).version, 10);
  assert.equal(chooseModel(models, 'model-9').version, 9);
  assert.equal(chooseModel(models, 'missing').version, 10);
});

const bern = { latitude: 46.946495525973354, longitude: 7.444211945710425, timeZone: 'Europe/Zurich', enuToModelDegrees: -7 };
const calendarDay = (month, day, year = 2026) => dayOfYear({ year, month, day });

test('date pickers and season sliders agree without browser time zone offsets', () => {
  for (const value of ['1900-01-01', '2026-12-31', '2028-02-29', '2100-12-31']) {
    const selected = calendarSelection(value);
    assert.equal(calendarDate(selected.year, selected.day), value);
  }
  for (const value of ['', '2026-02-29', '2026-13-01', '2026-04-31', '2026-00-01', '1899-12-31', '2101-01-01']) {
    assert.equal(calendarSelection(value), null, value);
  }
  assert.equal(calendarDate(2026, 366), '2026-12-31');
  assert.equal(calendarSelection('2028-02-29').day, 60);
});

test('every published Bundeshaus version retains valid daylight georeferencing', () => {
  for (const entry of catalog.filter(entry => entry.version <= 26)) {
    assert.ok(entry.location, `${entry.id} needs its authored geographic frame`);
    const result = solarState({ year: 2026, day: 172, minutes: 810, location: entry.location });
    assert.ok(Number.isFinite(result.altitude) && result.direction.every(Number.isFinite));
  }
});

test('daylight uses Bern civil time, including the spring gap and autumn repeated hour', () => {
  assert.equal(localInstant(2026, calendarDay(1, 15), 720, bern.timeZone).date.toISOString(), '2026-01-15T11:00:00.000Z');
  assert.equal(localInstant(2026, calendarDay(7, 15), 720, bern.timeZone).date.toISOString(), '2026-07-15T10:00:00.000Z');
  const gap = localInstant(2026, calendarDay(3, 29), 150, bern.timeZone);
  assert.equal(gap.adjusted, true);
  assert.equal(gap.date.toISOString(), '2026-03-29T01:30:00.000Z');
  assert.equal(localParts(gap.date, bern.timeZone).hour, 3);
  const fold = localInstant(2026, calendarDay(10, 25), 150, bern.timeZone);
  assert.equal(fold.repeated, true);
  assert.equal(fold.date.toISOString(), '2026-10-25T00:30:00.000Z');
});

test('the date slider includes leap day and reaches the last minute of the year', () => {
  assert.equal(daysInYear(2028), 366);
  assert.equal(daysInYear(2100), 365);
  assert.equal(calendarDay(2, 29, 2028), 60);
  const leap = localInstant(2028, 60, 720, bern.timeZone);
  assert.equal(leap.date.toISOString(), '2028-02-29T11:00:00.000Z');
  const last = localParts(localInstant(2028, 366, 1439, bern.timeZone).date, bern.timeZone);
  assert.deepEqual(last, { day: 31, month: 12, year: 2028, hour: 23, minute: 59 });
});

test('geographic sun direction follows the actual ENU-to-model rotation and glTF axes', () => {
  const north = new THREE.Vector3().fromArray(solarDirection(0, 0, -7));
  assert.ok(Math.abs(north.x - 0.1218693434) < 1e-8);
  assert.ok(Math.abs(north.z + 0.9925461516) < 1e-8);
  assert.ok(new THREE.Vector3().fromArray(solarDirection(90, 0, 0)).distanceTo(new THREE.Vector3(1, 0, 0)) < 1e-10);
  assert.ok(new THREE.Vector3().fromArray(solarDirection(180, 0, 0)).distanceTo(new THREE.Vector3(0, 0, 1)) < 1e-10);
  const raised = new THREE.Vector3().fromArray(solarDirection(135, 35, -7));
  assert.ok(Math.abs(raised.length() - 1) < 1e-10);
  assert.ok(Math.abs(raised.y - Math.sin(35 * Math.PI / 180)) < 1e-10);
});

test('solar positions vary by season and sunrise/sunset stay on the selected civil date', () => {
  const summer = solarState({ year: 2026, day: calendarDay(6, 21), minutes: 810, location: bern });
  const winter = solarState({ year: 2026, day: calendarDay(12, 21), minutes: 750, location: bern });
  assert.ok(summer.altitude > 65 && summer.altitude < 68);
  assert.ok(winter.altitude > 19 && winter.altitude < 21);
  assert.ok(Math.abs(summer.azimuth - 180) < 3 && Math.abs(winter.azimuth - 180) < 3);
  for (const month of [6, 12]) {
    const midnight = solarState({ year: 2026, day: calendarDay(month, 21), minutes: 0, location: bern });
    const evening = solarState({ year: 2026, day: calendarDay(month, 21), minutes: 1439, location: bern });
    assert.ok(midnight.altitude < 0);
    assert.equal(localParts(midnight.times.sunrise, bern.timeZone).day, 21);
    assert.equal(localParts(midnight.times.sunset, bern.timeZone).day, 21);
    assert.equal(midnight.times.sunrise.getTime(), evening.times.sunrise.getTime());
    assert.equal(midnight.times.sunset.getTime(), evening.times.sunset.getTime());
  }
});

test('daylight toggles restore studio lights and frame shadows across the visible site', () => {
  const daylightScene = new THREE.Scene();
  daylightScene.background = new THREE.Color(0);
  daylightScene.environmentIntensity = 0.8;
  const light = new THREE.DirectionalLight(0xfff4e1, 2.5);
  light.position.set(85, 110, 0); light.target.position.set(0, 10, 0); light.castShadow = false;
  const fill = new THREE.HemisphereLight(0xe8edff, 0x9c866b, 1.6);
  const renderer = { shadowMap: { needsUpdate: false, enabled: true } };
  const bounds = new THREE.Box3(new THREE.Vector3(-400, -10, -300), new THREE.Vector3(400, 70, 300));
  const control = new Daylight({ scene: daylightScene, sun: light, fillLight: fill, renderer, bounds: () => bounds });
  const saved = { position: light.position.clone(), color: light.color.clone(), target: light.target.position.clone(), shadow: light.shadow.camera.left };
  const options = { enabled: true, showSky: true, year: 2026, day: calendarDay(6, 21), minutes: 810, location: bern };
  const solar = control.update(options);
  const sky = control.sky;
  assert.ok(sky.visible && light.castShadow && light.intensity > 0);
  assert.ok(light.position.clone().sub(light.target.position).normalize().distanceTo(new THREE.Vector3().fromArray(solar.direction)) < 1e-10);
  for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
    const point = new THREE.Vector3(x, y, z).project(light.shadow.camera);
    assert.ok(Math.max(Math.abs(point.x), Math.abs(point.y), Math.abs(point.z)) <= 1 + 1e-9);
  }
  assert.equal(renderer.shadowMap.needsUpdate, true);
  assert.equal(renderer.shadowMap.enabled, true, 'daylight must respect the explicit shadows preference');
  control.update({ ...options, showSky: false });
  assert.equal(sky.visible, false, 'the sky can be hidden for floor plan');
  control.update({ ...options, minutes: 0 });
  assert.equal(light.castShadow, false, 'no shadows from a sun below the horizon');
  assert.equal(light.intensity, 0);
  control.update({ enabled: false });
  assert.equal(sky.visible, false);
  assert.ok(light.position.equals(saved.position) && light.target.position.equals(saved.target));
  assert.ok(light.color.equals(saved.color));
  assert.equal(light.intensity, 2.5);
  assert.equal(light.castShadow, false, 'studio lighting restores its shadow-free default');
  assert.equal(fill.intensity, 1.6);
  assert.equal(daylightScene.environmentIntensity, 0.8);
  assert.equal(daylightScene.background.getHex(), 0);
  assert.equal(light.shadow.camera.left, saved.shadow);
  control.update(options);
  assert.equal(control.sky, sky, 'repeated toggles reuse one sky');
});

test('sun and sky do not request shadow fitting while shadows are off', () => {
  const light = new THREE.DirectionalLight();
  const renderer = { shadowMap: { enabled: false, needsUpdate: false } };
  let fits = 0;
  const control = new Daylight({ scene: new THREE.Scene(), sun: light,
    fillLight: new THREE.HemisphereLight(), renderer, bounds: () => {
      fits++;
      return new THREE.Box3(new THREE.Vector3(-20, 0, -20), new THREE.Vector3(20, 20, 20));
    } });
  const options = { enabled: true, showSky: true, year: 2026, day: calendarDay(6, 21), minutes: 720, location: bern };
  const result = control.update(options);
  assert(control.sky.visible && light.intensity > 0, 'daylight works independently of shadows');
  assert(light.position.clone().sub(light.target.position).normalize().distanceTo(new THREE.Vector3().fromArray(result.direction)) < 1e-10);
  assert.equal(renderer.shadowMap.enabled, false);
  assert.equal(renderer.shadowMap.needsUpdate, false);
  assert.equal(fits, 0);
  renderer.shadowMap.enabled = true;
  control.update(options);
  assert.equal(fits, 1);
  assert.equal(renderer.shadowMap.needsUpdate, true);
  renderer.shadowMap.enabled = false;
  renderer.shadowMap.needsUpdate = false;
  control.update({ ...options, minutes: 900 });
  assert.equal(fits, 1, 'changing the hour does not refit disabled shadows');
  assert.equal(renderer.shadowMap.needsUpdate, false);
  control.update({ enabled: false });
  assert.equal(light.castShadow, false);
  assert.equal(renderer.shadowMap.enabled, false);
});

test('invalid georeferencing disables daylight without hiding the model version', () => {
  const base = { id: 'model', version: 1, label: 'v001', levels: ['all'], building: './model/building.glb', surroundings: './model/surroundings.glb', metadata: './model/viewer.json' };
  for (const location of [{ ...bern, latitude: 91 }, { ...bern, enuToModelDegrees: undefined }, { ...bern, timeZone: 'invalid' }]) {
    const parsed = parseCatalog({ schemaVersion: 1, models: [{ ...base, location }] });
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].location, null);
  }
  assert.deepEqual(parseCatalog({ schemaVersion: 1, models: [{ ...base, location: bern }] })[0].location, bern);
});

test('v010 retains all four connecting galleries, walls, room divisions and stair cores', async () => {
  const entry = catalog.find(entry => entry.id === 'bundeshaus-v010');
  const bytes = await readGLBBytes(new URL('../public/models/' + entry.building.slice(2), import.meta.url));
  const doc = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
  const nodes = doc.nodes.filter(node => node.mesh !== undefined);
  const groups = new Map();
  for (const node of nodes) for (const collection of node.extras.viewer_source_collections) {
    groups.set(collection, (groups.get(collection) || 0) + 1);
  }
  for (const [name, count] of [
    ['02b | Connecting galleries', 432],
    ['07b | Principal-floor wall reconstruction', 18],
    ['07c | Principal-floor room divisions v005', 96],
    ['07d | Principal-floor stair cores v005', 26],
  ]) assert.equal(groups.get(name), count, name);
  for (const direction of ['NW', 'NE', 'SW', 'SE']) {
    const parts = nodes.filter(node => node.extras.viewer_source_name.startsWith(`Connector ${direction} `))
      .map(node => ({ name: node.extras.viewer_source_name, userData: node.extras }));
    assert.ok(parts.some(part => part.userData.viewer_role === 'roof'), `${direction}: roof classification`);
    assert.ok(parts.some(part => /structural deck/.test(part.name) && visibleInMode(part, 'dollhouse') && collisionCandidate(part)), `${direction}: visible, supported gallery deck`);
    for (const part of parts) {
      assert.ok(visibleInMode(part, 'orbit'), part.name);
      const roofAssembly = part.userData.viewer_role === 'roof' || /upper cornice|upper entablature|attic/.test(part.name);
      assert.equal(visibleInMode(part, 'dollhouse'), !roofAssembly, part.name);
    }
  }
});
for (const entry of catalog.filter(entry => entry.version <= 26)) {
  test(`${entry.label}: annotations match exported IDs and all walking starts remain supported`, async () => {
    const modelURL = new URL('../public/models/' + entry.building.slice(2), import.meta.url);
    const modelBytes = await readGLBBytes(modelURL);
    const length = modelBytes.readUInt32LE(12);
    const modelDoc = JSON.parse(modelBytes.subarray(20, 20 + length).toString());
    const annotations = parseMetadata(JSON.parse(await readFile(new URL('../public/models/' + entry.metadata.slice(2), import.meta.url), 'utf8')));
    assert.equal(annotations.issues.length, 0);
    const nodeIds = modelDoc.nodes.filter(node => node.mesh !== undefined).map(node => node.extras.viewer_id);
    const sculpture = modelDoc.nodes.filter(node => /^Three Confederates simplified sculpture/.test(node.extras?.viewer_source_name || ''));
    assert(sculpture.length >= 4, 'The complete staircase sculpture group must be present');
    for (const node of sculpture) {
      const part = { name: node.extras.viewer_source_name, userData: node.extras };
      assert(visibleInMode(part, 'dollhouse'), `${part.name} must remain in the cutaway`);
      assert(visibleInMode(part, 'orbit'));
      assert(visibleInMode(part, 'walk'));
    }
    for (const node of modelDoc.nodes.filter(node => node.mesh !== undefined)) {
      const data = node.extras || {}, part = { name: data.viewer_source_name || node.name, userData: data };
      if ((data.viewer_source_collections || []).some(name => name.startsWith('09 |'))) assert(!visibleInMode(part, 'dollhouse'), 'Removable ceiling/glass must stay hidden');
      if ((data.viewer_source_collections || []).some(name => name.startsWith('04 |')) && !part.name.startsWith('Three Confederates')) assert(!visibleInMode(part, 'dollhouse'), 'Facade figures must stay hidden');
    }
    assert.equal(new Set(nodeIds).size, nodeIds.length, 'IDs must be unique');
    for (const id of annotations.objects.keys()) assert.ok(nodeIds.includes(id), id);
    modelDoc.buffers[0].uri = 'data:application/octet-stream;base64,' + modelBytes.subarray(28 + length, 28 + length + modelDoc.buffers[0].byteLength).toString('base64');
    delete modelDoc.materials; delete modelDoc.textures; delete modelDoc.images; delete modelDoc.samplers;
    for (const mesh of modelDoc.meshes) for (const primitive of mesh.primitives) delete primitive.material;
    const { scene: imported } = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(JSON.stringify(modelDoc), '');
    const importedMeshes = await prepareStaticModel(imported, { yieldControl: async () => {}, onMesh: mesh => {
      mesh.name = mesh.userData.viewer_source_name || mesh.name;
    } });
    assert.equal(importedMeshes.length, entry.meshCount);
    assert.equal(new Set(importedMeshes.map(mesh => mesh.userData.viewer_id)).size, entry.meshCount);
    if (entry.version >= 10) {
      assert(entry.levels.includes('entrance'));
      assert.equal(annotations.pointsOfInterest.find(place => place.id === 'south-public-entrance').camera.level, 'entrance');
      const entrance = importedMeshes.filter(isPublicEntrance);
      assert(entrance.length > 1200, 'The complete public entrance inventory survives loading');
      const floors = entrance.filter(mesh => mesh.userData.viewer_role === 'floor' && mesh.userData.bounds.max.y < -1);
      assert(floors.length > 400, 'The lobby floor and stone slabs are present');
      for (const floor of floors) for (const mode of ['dollhouse', 'plan']) {
        assert(visibleInMode(floor, mode, 'entrance'), `${floor.name}: below-ground lobby floor`);
        assert(!visibleInMode(floor, mode, 'lower'), `${floor.name}: does not belong to the lower hall at zero`);
      }
      for (const mesh of entrance) {
        assert(visibleInMode(mesh, 'orbit'), mesh.name);
        assert(visibleInMode(mesh, 'walk'), mesh.name);
        if (mesh.userData.viewer_role === 'ceiling') assert(!visibleInMode(mesh, 'dollhouse', 'entrance'), mesh.name);
        else if (!mesh.userData.viewer_dollhouse_hidden) assert(visibleInMode(mesh, 'dollhouse'), `${mesh.name}: interior retained`);
      }
      const room301 = importedMeshes.filter(mesh => (mesh.userData.viewer_source_collections || []).some(name => name.startsWith('07c | Conference room 301')));
      assert(room301.length > 500);
      assert(room301.every(belongsToUpperRoom), 'Both Room 301 collection aliases are recognized');
      assert(room301.some(mesh => visibleInMode(mesh, 'dollhouse', 'upper')), 'Room 301 is not silently filtered out');
    }
    if (entry.version >= 11) {
      for (const prefix of ['05b |', '06b |', '07j |', '07k | Secondary ceremonial flights', '08g |']) {
        const additions = importedMeshes.filter(mesh => (mesh.userData.viewer_source_collections || []).some(name => name.startsWith(prefix)));
        // v024 replaces the SR gallery supports with explicit whole-column products.
        assert(additions.length >= (entry.version >= 24 && prefix === '06b |' ? 1 : 10), `${prefix}: v011 additions survive the import`);
        for (const mesh of additions.filter(mesh => mesh.userData.viewer_role !== 'ceiling')) {
          const removable = /^(NR v011 (gallery recess wall|rear arcade with fifteen open bays|upper cornices and patterned frieze)|SR v011 mural spandrels and layered timber cornice|Dome v011 (circular glass support mouldings|arch mouldings|four curved corner pendentives|great supporting arch)|v014 North (timber arched transom|inner arched reveal|marble pier panels))/.test(mesh.name);
          assert.equal(visibleInMode(mesh, 'dollhouse'), !removable, mesh.name);
        }
      }
    }
    if (entry.version >= 12) {
      const repairs = importedMeshes.filter(mesh => (mesh.userData.viewer_source_collections || []).includes('07k | Final accuracy corrections v012'));
      assert.equal(repairs.length, 24, 'All new repair placements survive the import');
      const upperRepairs = repairs.filter(mesh => mesh.userData.viewer_room_ids?.includes('room-301'));
      assert.equal(upperRepairs.length, 14, 'Room 301 walls, diffuser and twelve fixture components');
      for (const mesh of repairs) {
        assert(visibleInMode(mesh, 'orbit'), mesh.name);
        assert(visibleInMode(mesh, 'walk'), mesh.name);
        const upper = upperRepairs.includes(mesh);
        assert.equal(belongsToUpperRoom(mesh), upper, `${mesh.name}: semantic room membership`);
        if (upper && mesh.userData.viewer_role !== 'ceiling') {
          assert(mesh.userData.bounds.max.y <= LEVELS.upper.max, `${mesh.name}: upper cut must preserve the complete wall/fixture`);
        }
        for (const mode of ['dollhouse', 'plan']) {
          const covered = mesh.userData.viewer_role === 'ceiling' || (mode === 'dollhouse' && mesh.name.startsWith('v012 Room301 walls fitted'));
          const floor = mesh.userData.viewer_floor_ids[0];
          assert.equal(visibleInMode(mesh, mode, floor), !covered, `${mesh.name}: correct floor`);
          assert.equal(visibleInMode(mesh, mode, 'all'), !covered, `${mesh.name}: complete cutaway`);
          assert(!visibleInMode(mesh, mode, upper ? 'principal' : 'upper'), `${mesh.name}: no floor leakage`);
        }
      }
    }
    if (entry.version >= 19) {
      const gallery = importedMeshes.filter(mesh => /^NR v019 .+gallery/.test(mesh.name));
      assert.equal(gallery.length, 11, 'Complete rear/corner deck and balustrade replacements');
      for (const mesh of gallery) {
        assert(visibleInMode(mesh, 'dollhouse', 'principal'), mesh.name);
        assert(!visibleInMode(mesh, 'dollhouse', 'upper'), `${mesh.name}: not Room 301`);
      }
      const supports = importedMeshes.filter(mesh => /^NR v019 /.test(mesh.name) && mesh.userData.viewer_role === 'floor');
      assert.equal(supports.length, 9, 'Six platform components and three gallery decks');
      for (const floor of supports) assert(collisionCandidate(floor), `${floor.name}: walking support`);
    }
    for (const mesh of importedMeshes) if (mesh.userData.viewer_role === 'ceiling') {
      assert.equal(visibleInMode(mesh, 'dollhouse'), false, mesh.name);
    }
    if (entry.version >= 5) for (const direction of ['NW', 'NE', 'SW', 'SE']) {
      const gallery = importedMeshes.filter(mesh => mesh.name.startsWith(`Connector ${direction} `));
      const decks = gallery.filter(mesh => mesh.name.includes('structural deck'));
      assert(decks.length, `${direction}: gallery deck is exported`);
      for (const deck of decks) {
        assert(visibleInMode(deck, 'dollhouse'), deck.name);
        assert(visibleInMode(deck, 'dollhouse', 'principal'), `${deck.name}: principal floor`);
        assert(visibleInMode(deck, 'plan', 'principal'), `${deck.name}: floor plan`);
        assert(collisionCandidate(deck), `${deck.name}: walking support`);
      }
      const piers = gallery.filter(mesh => /lower piers|broad passage vault spandrels and soffits/.test(mesh.name));
      assert(piers.length, `${direction}: supporting arches are exported`);
      for (const pier of piers) {
        assert(visibleInMode(pier, 'dollhouse'), pier.name);
        assert(collisionCandidate(pier), `${pier.name}: collision support`);
      }
      for (const part of gallery) {
        assert(visibleInMode(part, 'orbit'), part.name);
        assert(visibleInMode(part, 'walk'), part.name);
        if (/\b(?:roof|attic|upper cornice|upper entablature)\b/i.test(part.name)) assert(!visibleInMode(part, 'dollhouse'), part.name);
      }
    }
    for (const mesh of importedMeshes) {
      if ((mesh.userData.viewer_source_collections || []).some(name => name.startsWith('02d |'))) {
        assert(!visibleInMode(mesh, 'dollhouse'), mesh.name);
        assert(visibleInMode(mesh, 'orbit'), mesh.name);
        assert(visibleInMode(mesh, 'walk'), mesh.name);
      }
      if (/^(NR monumental columns|SR marble columns|Hall colossal pilasters)\b/.test(mesh.name)) assert(visibleInMode(mesh, 'dollhouse'), mesh.name);
    }
    const { world } = await collisionThroughWorker(importedMeshes);
    if (entry.version >= 19) {
      const decks = importedMeshes.filter(mesh => /^NR v019 .*gallery .*deck/.test(mesh.name));
      assert.equal(decks.length, 3);
      for (const deck of decks) {
        const bounds = deck.userData.bounds;
        // The rear gallery wraps an open chamber; its box center is in the
        // opening. Sample an actual top face, not that empty bounding-box area.
        const position = deck.geometry.attributes.position, index = deck.geometry.index;
        const triangle = new THREE.Triangle(), normal = new THREE.Vector3();
        let origin, largest = 0;
        for (let i = 0; i < (index?.count ?? position.count); i += 3) {
          for (const [offset, vertex] of [triangle.a, triangle.b, triangle.c].entries()) {
            vertex.fromBufferAttribute(position, index ? index.getX(i + offset) : i + offset).applyMatrix4(deck.matrixWorld);
          }
          const area = triangle.getArea();
          if (triangle.getNormal(normal).y > 0.99 && area > largest
              && [triangle.a, triangle.b, triangle.c].every(vertex => Math.abs(vertex.y - bounds.max.y) < 0.01)) {
            origin = triangle.getMidpoint(new THREE.Vector3());
            largest = area;
          }
        }
        assert(origin, `${deck.name}: upward walking face`);
        origin.y += 0.05;
        const hit = world.rayIntersect(new THREE.Ray(origin, new THREE.Vector3(0, -1, 0)));
        assert(hit && Math.abs(hit.position.y - bounds.max.y) < 0.01, `${deck.name}: actual collision surface`);
      }
    }
    for (const [room, start] of Object.entries(WALK_STARTS)) {
      const walker = new Walker(new THREE.PerspectiveCamera(), world);
      assert.ok(walker.spawn(start.position, start.target), room);
      const original = walker.camera.position.clone();
      for (let i = 0; i < 60; i++) walker.update(1 / 60, new Set());
      assert.ok(Math.abs(walker.camera.position.y - original.y) < 0.15, room);
    }
  });
}
