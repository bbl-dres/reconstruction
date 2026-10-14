// Opt-in render batching, ?batch=1 (viewer/js/render-batches.js).
import { registerHooks } from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'three') return { url: new URL('../viewer/vendor/three/build/three.module.js', import.meta.url).href, shortCircuit: true };
  return next(specifier, context);
} });
const THREE = await import('three');
const { createRenderBatches } = await import('../viewer/js/render-batches.js');
const { ELEMENT_LAYER } = await import('../viewer/js/render-instances.js');
const { pickElement, highlightElement } = await import('../viewer/js/inspection.js');
const { createSurroundingsStyle } = await import('../viewer/js/surroundings-style.js');

function fixture() {
  const scene = new THREE.Scene(), root = new THREE.Group(); scene.add(root);
  const box = new THREE.BoxGeometry(), slab = new THREE.BoxGeometry(2, 0.2, 2);
  const oak = new THREE.MeshStandardMaterial({ name: 'oak' }), stone = new THREE.MeshStandardMaterial({ name: 'stone' });
  const glass = new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.3 });
  const make = (geometry, material, x, id) => {
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, 1, 0); mesh.userData.viewer_id = id;
    mesh.castShadow = mesh.receiveShadow = true; root.add(mesh); return mesh;
  };
  // Oak: two different geometries, five elements. Stone: one element. Glass: transparent.
  const chairs = [0, 2, 4].map(x => make(box, oak, x, `chair-${x}`));
  const tables = [6, 9].map(x => make(slab, oak, x, `table-${x}`));
  const pier = make(box, stone, 12, 'pier');
  const pane = make(box, glass, 14, 'pane');
  const mirrored = make(box, oak, 16, 'mirrored'); mirrored.scale.x = -1;
  const multi = new THREE.Mesh(box.clone(), [oak, stone]); multi.geometry.addGroup(0, 18, 0); multi.geometry.addGroup(18, 18, 1);
  multi.position.x = 18; root.add(multi);
  scene.updateMatrixWorld(true);
  const meshes = [...chairs, ...tables, pier, pane, mirrored, multi];
  for (const mesh of meshes) mesh.userData.bounds = new THREE.Box3().setFromObject(mesh);
  return { scene, root, meshes, chairs, tables, pier, pane, mirrored, multi, oak, stone };
}

test('one batch per material draws every opaque element of it; the others stay ordinary meshes', () => {
  const { scene, meshes, chairs, tables, pier, pane, mirrored, multi, oak } = fixture();
  const batches = createRenderBatches(meshes, scene);
  assert.equal(batches.batches.length, 1);
  assert.equal(batches.placements, 5);
  const [batch] = batches.batches;
  assert.ok(batch.isBatchedMesh);
  assert.notEqual(batch.material, oak, 'the batch draws with its own copy of the material');
  assert.equal(batch.material.name, 'oak');
  assert.deepEqual(batches.materials, [batch.material]);
  for (const mesh of [...chairs, ...tables]) assert.equal(mesh.layers.mask, 1 << ELEMENT_LAYER, `${mesh.userData.viewer_id} is drawn by the batch`);
  for (const mesh of [pier, pane, mirrored, multi]) assert.ok(mesh.layers.isEnabled(0), 'single, transparent, mirrored and multi-material meshes draw themselves');
  // Exact world transforms.
  const matrix = new THREE.Matrix4();
  [...chairs, ...tables].forEach((mesh, i) => {
    batch.getMatrixAt(i, matrix);
    assert.ok(matrix.elements.every((n, j) => Math.abs(n - mesh.matrixWorld.elements[j]) < 1e-6));
  });
  assert.equal(batch.castShadow, true); assert.equal(batch.receiveShadow, true);
  batches.dispose();
});

test('picking finds the source element, never the batch, and the highlight overlays it', () => {
  const { scene, meshes, chairs } = fixture();
  const batches = createRenderBatches(meshes, scene);
  const ray = new THREE.Raycaster(new THREE.Vector3(2, 1, 10), new THREE.Vector3(0, 0, -1)); ray.layers.enable(ELEMENT_LAYER);
  assert.equal(pickElement(ray, meshes), chairs[1]);
  const hits = []; batches.batches[0].raycast(ray, hits); assert.equal(hits.length, 0);
  const clear = highlightElement(chairs[1]);
  assert.equal(chairs[1].children.length, 3);
  assert.ok(chairs[1].children.every(part => part.layers.isEnabled(0)), 'the overlay is drawn while the batch draws the element');
  clear(); batches.dispose();
});

test('visibility follows elements, hidden ancestors, floors and cutaways', () => {
  const { scene, root, meshes, chairs, tables } = fixture();
  const batches = createRenderBatches(meshes, scene);
  const [batch] = batches.batches;
  chairs[1].visible = false; batches.sync();
  assert.equal(batch.getVisibleAt(1), false); assert.equal(batch.getVisibleAt(0), true);
  root.visible = false; batches.sync();
  assert.ok([0, 1, 2, 3, 4].every(i => !batch.getVisibleAt(i))); assert.equal(batch.visible, false);
  root.visible = true; chairs[1].visible = true; tables[0].visible = false; batches.sync();
  assert.deepEqual([0, 1, 2, 3, 4].map(i => batch.getVisibleAt(i)), [true, true, true, false, true]);
  assert.equal(batch.visible, true);
  batches.dispose();
});

test('an element with another material (Floor plan uncut copy) is drawn on its own meanwhile', () => {
  const { scene, meshes, chairs, oak } = fixture();
  const batches = createRenderBatches(meshes, scene);
  const [batch] = batches.batches;
  const uncut = oak.clone();
  chairs[0].material = uncut; batches.sync();
  assert.equal(batch.getVisibleAt(0), false);
  assert.ok(chairs[0].layers.isEnabled(0), 'drawn as its own mesh with the copy');
  assert.equal(batch.material.name, 'oak');
  chairs[0].material = oak; batches.sync();
  assert.equal(batch.getVisibleAt(0), true);
  assert.equal(chairs[0].layers.mask, 1 << ELEMENT_LAYER);
  batches.dispose();
});

test('the muted surroundings swap the batch material with the elements', () => {
  const { scene, root, meshes, chairs, tables } = fixture();
  const style = createSurroundingsStyle(root);
  const batches = createRenderBatches(meshes, scene);
  const [batch] = batches.batches;
  style.setMuted(true); batches.sync();
  assert.equal(batch.material.color.getHex(), chairs[0].material.color.getHex(), 'a copy of the muted grey');
  assert.ok([...chairs, ...tables].every(mesh => mesh.layers.mask === 1 << ELEMENT_LAYER), 'all still drawn by the batch');
  style.setMuted(false); batches.sync();
  assert.equal(batch.material.name, 'oak');
  batches.dispose(); style.dispose();
});

test('material copies share the Floor plan cut planes, and disposal restores the sources', () => {
  const { scene, meshes, chairs, oak } = fixture();
  const planes = [new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e9)];
  oak.clippingPlanes = planes;
  const batches = createRenderBatches(meshes, scene);
  assert.equal(batches.batches[0].material.clippingPlanes, planes);
  const root = batches.root;
  batches.dispose();
  assert.equal(root.parent, null);
  assert.ok(chairs.every(mesh => mesh.layers.mask === 1), 'sources draw themselves again');
  batches.dispose(); // twice is harmless
});

test('the viewer uses batches only with ?batch=1 and keeps render instances by default', async () => {
  const main = await readFile(new URL('../viewer/js/main.js', import.meta.url), 'utf8');
  assert.match(main, /const useBatches = new URL\(location\.href\)\.searchParams\.get\('batch'\) === '1';/);
  assert.match(main, /useBatches \? createRenderBatches\(meshes, scene\) : useInstances \? createRenderInstances\(meshes, scene\) : null/);
});
