import { registerHooks } from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'three') return { url: new URL('../public/vendor/three/build/three.module.js', import.meta.url).href, shortCircuit: true };
  return next(specifier, context);
} });
const THREE = await import('three');
const { createRenderInstances, ELEMENT_LAYER } = await import('../public/js/render-instances.js');
const { pickElement, highlightElement } = await import('../public/js/inspection.js');
function fixture() {
  const scene = new THREE.Scene(), root = new THREE.Group(); scene.add(root);
  const geometry = new THREE.BoxGeometry(), material = new THREE.MeshStandardMaterial();
  const meshes = Array.from({ length: 6 }, (_, i) => {
    const mesh = new THREE.Mesh(geometry, material); mesh.name = `Chair ${i}`; mesh.userData.viewer_id = `chair-${i}`;
    mesh.position.set(i * 2 + 1, 1, 1); mesh.castShadow = mesh.receiveShadow = true; root.add(mesh); return mesh;
  });
  scene.updateMatrixWorld(true);
  meshes.forEach(mesh => { mesh.userData.bounds = new THREE.Box3().setFromObject(mesh); });
  return { scene, root, meshes, geometry, material };
}

test('render instances preserve exact world transforms, source IDs and shadow flags', () => {
  const { scene, root, meshes } = fixture(); root.position.set(2, 4, 3); root.rotation.y = 0.25; scene.updateMatrixWorld(true);
  const instances = createRenderInstances(meshes, scene, { cellSize: 1000 });
  assert.equal(instances.batches.length, 1); assert.equal(instances.placements, 6);
  const batch = instances.batches[0], matrix = new THREE.Matrix4();
  for (let i = 0; i < meshes.length; i++) {
    batch.getMatrixAt(i, matrix);
    assert.ok(matrix.elements.every((n, j) => Math.abs(n - meshes[i].matrixWorld.elements[j]) < 1e-6));
    assert.equal(meshes[i].userData.viewer_id, `chair-${i}`); assert.equal(meshes[i].parent, root);
  }
  assert.equal(batch.castShadow, true); assert.equal(batch.receiveShadow, true);
});

test('visibility compaction honors floors and hidden ancestors and refreshes culling bounds', () => {
  const { scene, root, meshes } = fixture(); const instances = createRenderInstances(meshes, scene);
  const batch = instances.batches[0];
  meshes[5].visible = false; instances.sync();
  assert.equal(batch.count, 5); assert.ok(batch.boundingBox.max.x < 10);
  root.visible = false; instances.sync(); assert.equal(batch.count, 0); assert.equal(batch.visible, false);
  root.visible = true; meshes[5].visible = true; instances.sync();
  assert.equal(batch.count, 6); assert.equal(batch.visible, true); assert.ok(batch.boundingBox.max.x > 11);
});

test('picking and highlighting affect one placement while its family remains batched', () => {
  const { scene, meshes, material } = fixture(); const instances = createRenderInstances(meshes, scene);
  const ray = new THREE.Raycaster(new THREE.Vector3(5, 1, 10), new THREE.Vector3(0, 0, -1)); ray.layers.enable(ELEMENT_LAYER);
  assert.equal(pickElement(ray, meshes), meshes[2]);
  const matrices = instances.batches[0].instanceMatrix.array.slice();
  const version = instances.batches[0].instanceMatrix.version;
  instances.select(meshes[2]); const clear = highlightElement(meshes[2]);
  assert.equal(instances.batches[0].count, 6); assert.equal(instances.batches[0].material, material);
  assert.deepEqual(instances.batches[0].instanceMatrix.array, matrices);
  assert.equal(instances.batches[0].instanceMatrix.version, version, 'selection does not re-upload unrelated placements');
  assert.equal(meshes[2].material.polygonOffset, true);
  assert.equal(meshes[2].layers.isEnabled(0), true); assert.equal(meshes[1].layers.isEnabled(0), false);
  assert.equal(meshes[2].material.isMeshBasicMaterial, true); assert.equal(meshes[1].material, material);
  clear(); instances.select(null); assert.equal(instances.batches[0].count, 6); assert.equal(meshes[2].layers.isEnabled(0), false);
});

test('glass, transparent, mirrored, sheared and animated placements retain ordinary rendering', () => {
  for (const kind of ['glass', 'transparent', 'mirror', 'shear', 'morph']) {
    const { scene, meshes } = fixture();
    const material = kind === 'glass' ? new THREE.MeshPhysicalMaterial({ transmission: 1 })
      : new THREE.MeshStandardMaterial({ transparent: kind === 'transparent' });
    for (const mesh of meshes) {
      mesh.material = material;
      if (kind === 'mirror') mesh.scale.x = -1;
      if (kind === 'morph') mesh.morphTargetInfluences = [0];
    }
    scene.updateMatrixWorld(true);
    if (kind === 'shear') for (const mesh of meshes) mesh.matrixWorld.elements[4] = 0.4;
    const instances = createRenderInstances(meshes, scene);
    assert.equal(instances.placements, 0, kind);
    for (const mesh of meshes) assert.equal(mesh.layers.mask, 1);
  }
});

test('batches compensate for a transformed parent and keep multi-material draw groups', () => {
  const { scene, root, meshes, material } = fixture();
  root.position.set(20, 30, -40); root.rotation.y = 0.2; root.scale.setScalar(2);
  const second = new THREE.MeshStandardMaterial({ color: 0xff0000 });
  for (const mesh of meshes) mesh.material = [material, second];
  scene.updateMatrixWorld(true);
  const instances = createRenderInstances(meshes, root, { cellSize: 1000 });
  const batch = instances.batches[0]; scene.updateMatrixWorld(true);
  const matrix = new THREE.Matrix4(); batch.getMatrixAt(3, matrix); matrix.premultiply(batch.matrixWorld);
  assert.ok(matrix.elements.every((n, j) => Math.abs(n - meshes[3].matrixWorld.elements[j]) < 1e-5));
  assert.deepEqual(batch.material, [material, second]); assert.equal(batch.geometry.groups.length, 6);
});

test('material replacements propagate and disposal releases instance buffers without disposing shared assets', () => {
  const { scene, meshes, material, geometry } = fixture();
  const instances = createRenderInstances(meshes, scene); let disposed = 0;
  instances.batches[0].addEventListener('dispose', () => disposed++);
  geometry.addEventListener('dispose', () => assert.fail('shared geometry disposed'));
  material.addEventListener('dispose', () => assert.fail('shared material disposed'));
  const muted = new THREE.MeshStandardMaterial({ color: 0x303237 }); meshes.forEach(mesh => { mesh.material = muted; }); instances.sync();
  assert.equal(instances.batches[0].material, muted);
  instances.dispose(); instances.dispose(); assert.equal(disposed, 1);
  for (const mesh of meshes) assert.equal(mesh.layers.mask, 1);
  assert.equal(instances.root.parent, null);
});
