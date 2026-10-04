import { registerHooks } from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';
registerHooks({ resolve(s, c, next) {
  if (s === 'three') return { url: new URL('../public/vendor/three/build/three.module.js', import.meta.url).href, shortCircuit: true };
  return next(s, c);
} });
const THREE = await import('three');
const { parseBimRegistry, describeProduct } = await import('../public/js/bim-registry.js');
const { createRenderInstances, ELEMENT_LAYER } = await import('../public/js/render-instances.js');
const { highlightElements } = await import('../public/js/inspection.js');
const { parseCatalog } = await import('../public/js/model-catalog.js');

function fixture() {
  const scene = new THREE.Scene(), meshes = [], elements = [];
  const geometry = new THREE.BoxGeometry(1, 1, 1), material = new THREE.MeshStandardMaterial();
  for (let i = 0; i < 4; i++) {
    const root = new THREE.Matrix4().makeTranslation(i * 3, 0, 0), components = [];
    for (let j = 0; j < 2; j++) {
      const mesh = new THREE.Mesh(geometry, material); mesh.position.set(i * 3, j, 0);
      mesh.name = `Chair ${i} part ${j}`; mesh.userData.viewer_id = `part-${i}-${j}`; scene.add(mesh); meshes.push(mesh);
      components.push({ id: mesh.userData.viewer_id, localMatrix: new THREE.Matrix4().makeTranslation(0, j, 0).toArray(), slot: j });
    }
    elements.push({ id: `chair-${i}`, name: `Chair ${i}`, category: 'chair', typeId: 'chair-type',
      rootMatrix: root.toArray(), components, primaryStorey: 'principal', storeyRefs: [], roomIds: ['room'], environment: 'interior', ifcClass: 'IfcFurniture',
      bounds: [[i * 3 - .5, -.5, -.5], [i * 3 + .5, 1.5, .5]], quantities: {}, properties: {}, membership: 'reviewed',
      evidence: { basis: 'authored', confidence: 'high', source: 'Synthetic test fixture', geometry: 'Test cubes' } });
  }
  scene.updateMatrixWorld(true);
  for (const mesh of meshes) mesh.userData.bounds = new THREE.Box3().setFromObject(mesh);
  const catalog = { id: 'test-v1', sourceSha256: 'a'.repeat(64) };
  const data = { schemaVersion: 1, modelId: catalog.id, projectId: 'test', projectNamespace: 'b2ed4189-5941-542d-9227-9b4b3c9a7688', sourceSha256: catalog.sourceSha256, units: 'm', coordinateSystem: 'glTF-Y-up', conversionTolerance: .001,
    storeys: [{ id: 'principal', name: 'Principal', elevation: 0, provisional: true }],
    families: [{ id: 'chairs', name: 'Timber chair', category: 'chair' }],
    types: [{ id: 'chair-type', name: 'Complete chair', familyId: 'chairs', prototypeElementId: 'chair-0', revision: 1 }],
    elements, openings: [], unresolvedComponents: [], coverage: [{ category: 'chair', status: 'complete-modeled-category', scope: 'All modeled chairs in fixture' }], caveats: [] };
  return { scene, meshes, material, data, catalog };
}

test('floor footprint is a typed product quantity, counted once with unknown coverage retained', () => {
  const { data, meshes, catalog } = fixture();
  data.elements[0].quantities.floorArea = { value: 12.5, unit: 'm2', method: 'Union of projected slab triangles', source: 'Synthetic fixture', confidence: 'high' };
  data.elements[1].quantities.floorArea = null;
  const registry = parseBimRegistry(data, meshes, catalog);
  assert.deepEqual(registry.counts[0].areas.floorArea, { value: 12.5, unit: 'm2', known: 1, registered: 4 });
  assert(describeProduct(meshes[1], registry).properties.some(p => p.label === 'Modeled floor footprint' && p.value === '12.500 m²'));
  data.elements[0].quantities.floorArea.unit = 'm';
  assert.throws(() => parseBimRegistry(data, meshes, catalog), /typed area/);
});

test('whole products select all material parts and count once across hidden floors', () => {
  const { scene, meshes, material, data, catalog } = fixture();
  const registry = parseBimRegistry(data, meshes, catalog), instances = createRenderInstances(meshes, scene, { cellSize: 1000 });
  assert.equal(registry.counts[0].count, 4); assert.equal(registry.representatives.length, 4);
  assert.equal(registry.product(meshes[1]).id, 'chair-0'); assert.equal(registry.members(meshes[0]).length, 2);
  assert.equal(describeProduct(meshes[1], registry).id, 'chair-0');
  const before = instances.batches[0].instanceMatrix.version;
  const members = registry.members(meshes[0]); instances.select(members);
  const clear = highlightElements(members, '#38d9ff', scene, registry.bounds(meshes[0]));
  for (const part of members) { assert.equal(part.layers.isEnabled(0), true); assert.equal(part.material.isMeshBasicMaterial, true); }
  assert.equal(meshes[2].material, material); assert.equal(meshes[2].layers.isEnabled(0), false);
  assert.equal(instances.batches[0].instanceMatrix.version, before, 'No unrelated matrix upload on selection');
  meshes.forEach(m => { m.visible = false; }); instances.sync();
  clear.syncVisibility();
  assert.equal(scene.children.find(o => o.name === 'Whole product selection bounds').visible, false, 'Hidden product must not leave a floating selection box');
  assert.equal(instances.batches[0].count, 0); assert.equal(registry.counts[0].count, 4);
  clear(); clear(); instances.select(null);
  for (const part of members) { assert.equal(part.material, material); assert.equal(part.layers.mask, 1 << ELEMENT_LAYER); }
  instances.dispose();
});

test('selecting every member of a render batch never leaks its highlight to neighbors', () => {
  const { scene, meshes, material } = fixture();
  const instances = createRenderInstances(meshes, scene, { cellSize: 1000 });
  instances.select(new Set(meshes)); const clear = highlightElements(meshes, '#ffffff', scene);
  instances.sync(); assert.equal(instances.batches[0].material, material);
  clear(); instances.select([]); assert(meshes.every(m => !m.layers.isEnabled(0))); instances.dispose();
});

test('missing, stale, multiply owned or transformed registries fail closed', () => {
  for (const mutate of [
    d => { d.schemaVersion = 99; }, d => { d.sourceSha256 = 'b'.repeat(64); }, d => { d.modelId = 'other'; },
    d => { d.elements[0].components[0].id = 'absent'; },
    d => { d.elements[1].components[0].id = d.elements[0].components[0].id; },
    d => { d.elements[0].components[0].localMatrix[12] += .1; },
    d => { d.elements[0].rootMatrix[0] = NaN; },
    d => { d.elements[0].typeId = 'absent'; }, d => { d.types[0].prototypeElementId = 'absent'; },
    d => { d.elements[0].parentId = 'chair-1'; d.elements[1].parentId = 'chair-0'; },
    d => { d.elements[0].primaryStorey = 'absent'; }, d => { d.coverage = []; },
    d => { d.elements[0].quantities.netGlazingArea = { value: -1, unit: 'm2', method: 'test', source: 'test' }; },
  ]) {
    const { data, meshes, catalog } = fixture(); mutate(data);
    assert.throws(() => parseBimRegistry(data, meshes, catalog), /BIM registry/);
  }
});

test('unregistered components remain searchable but do not become invented product counts', () => {
  const { data, meshes, catalog } = fixture(); const removed = data.elements.pop();
  data.unresolvedComponents = removed.components.map(c => ({ id: c.id, category: 'chair', reason: 'Membership unknown' }));
  assert.throws(() => parseBimRegistry(data, meshes, catalog), /complete category/);
  data.coverage[0].status = 'partial';
  const registry = parseBimRegistry(data, meshes, catalog);
  assert.equal(registry.counts[0].count, 3); assert.equal(registry.representatives.length, 5);
  assert.equal(registry.product(meshes[7]), null); assert.deepEqual(registry.members(meshes[7]), [meshes[7]]);
  assert.equal(registry.counts[0].areas.netGlazingArea.value, null);
});

test('area subtotal preserves unknown coverage and never treats glass faces as product instances', () => {
  const { data, meshes, catalog } = fixture(); data.families[0].category = 'window'; data.coverage[0].category = 'window'; data.coverage[0].status = 'partial';
  for (const e of data.elements) { e.category = 'window'; e.ifcClass = 'IfcWindow'; e.quantities = { netGlazingArea: null }; }
  data.elements[0].quantities.netGlazingArea = { value: 2.5, unit: 'm2', method: 'Reviewed projected pane union', source: 'Fixture', confidence: 'high' };
  const { counts } = parseBimRegistry(data, meshes, catalog);
  assert.deepEqual(counts[0].areas.netGlazingArea, { value: 2.5, unit: 'm2', known: 1, registered: 4 });
});

test('catalog accepts optional local BIM assets and rejects traversal/remote paths', () => {
  const entry = { id: 'model-v1', label: 'v001', version: 1, building: './model/building.glb', surroundings: './model/context.glb', metadata: './model/viewer.json', levels: ['all'], bim: './model/bim.json', ifc: './model/model.ifczip' };
  assert.equal(parseCatalog({ schemaVersion: 1, models: [entry] })[0].bim, entry.bim);
  for (const bad of ['https://example.com/bim.json', './../bim.json', './model/bim.js']) assert.throws(() => parseCatalog({ schemaVersion: 1, models: [{ ...entry, bim: bad }] }));
});
