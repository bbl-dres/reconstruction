// Visibility answers remembered per mesh, Floor plan's parked cut planes and background shader
// compilation (viewer/js/visibility-rules.js, plan-cut.js, shader-warmup.js).
import { registerHooks } from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'three') return { url: new URL('../viewer/vendor/three/build/three.module.js', import.meta.url).href, shortCircuit: true };
  if (specifier === 'building-policy') return { url: new URL('../reconstructions/bundeshaus/public/policy/model-policy.js', import.meta.url).href, shortCircuit: true };
  return next(specifier, context);
} });
const THREE = await import('three');
const { createVisibilityRules } = await import('../viewer/js/visibility-rules.js');
const { createCutPlanes, PARKED } = await import('../viewer/js/plan-cut.js');
const { representatives, compileScene, compileVariants, depthStandIn } = await import('../viewer/js/shader-warmup.js');
const { visibleModelScope } = await import('../viewer/js/model-scope.js');
const { pickHit } = await import('../viewer/js/inspection.js');
const bundeshaus = await import('../reconstructions/bundeshaus/public/policy/model-policy.js');
const defaults = await import('../viewer/js/policy-default.js');

const levels = {
  lower: { label: 'Lower', elevation: 0, min: -0.5, max: 7 },
  principal: { label: 'Principal', elevation: 7.5, min: 7, max: 19 },
};
function sampleMeshes() {
  const site = new THREE.Group(); site.userData.viewer_model_scope = 'site';
  const rows = [
    { viewer_role: 'exterior-wall', viewer_cutaway_role: 'enclosure', viewer_floor_ids: ['lower'] },
    { viewer_role: 'floor', viewer_floor_ids: ['principal'] },
    { viewer_role: 'ceiling', viewer_floor_ids: ['principal'] },
    { viewer_role: 'roof', viewer_dollhouse_hidden: true },
    { viewer_role: 'furniture', viewer_cutaway_role: 'interior', viewer_floor_ids: ['lower'] },
    { viewer_role: 'collision' },
    { viewer_role: 'decoration', viewer_source_collections: ['04 | Sculpture'] },
    { viewer_role: 'window', viewer_source_collections: ['09 | Skylights'] },
  ];
  const meshes = rows.map((data, i) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry());
    mesh.name = `Element ${i}`;
    mesh.userData = { ...data, viewer_id: `e-${i}`, bounds: new THREE.Box3(new THREE.Vector3(0, i * 2, 0), new THREE.Vector3(1, i * 2 + 1, 1)) };
    return mesh;
  });
  site.add(meshes[6]);
  return meshes;
}

test('remembered policy answers equal the building policy for every view and level', () => {
  for (const policy of [bundeshaus, defaults]) {
    const meshes = sampleMeshes();
    const rules = createVisibilityRules(meshes, policy.visibleInMode, levels);
    for (const view of ['orbit', 'dollhouse', 'plan', 'walk']) for (const level of ['all', 'lower', 'principal']) {
      meshes.forEach((mesh, i) => assert.equal(rules.inMode(i, view, level), policy.visibleInMode(mesh, view, level, levels), `${view} ${level} ${mesh.name}`));
    }
    for (const view of ['orbit', 'plan']) for (const surroundings of [true, false]) {
      meshes.forEach((mesh, i) => assert.equal(rules.inScope(i, surroundings, view), visibleModelScope(mesh, surroundings, view), `${view} ${surroundings} ${mesh.name}`));
    }
  }
});

test('the policy runs once per mesh for each view and level, however often visibility is applied', () => {
  const meshes = sampleMeshes();
  const calls = [];
  const rules = createVisibilityRules(meshes, (mesh, view, level, definitions) => {
    calls.push([mesh, view, level]);
    assert.equal(definitions, levels);
    return mesh.userData.viewer_role !== 'roof' || view === 'orbit';
  }, levels);
  for (let pass = 0; pass < 3; pass++) for (const view of ['orbit', 'dollhouse']) meshes.forEach((_, i) => rules.inMode(i, view, 'all'));
  assert.equal(calls.length, meshes.length * 2);
  assert.equal(rules.inMode(3, 'orbit', 'all'), true);
  assert.equal(rules.inMode(3, 'dollhouse', 'all'), false);
  rules.inMode(0, 'dollhouse', 'principal');
  assert.equal(calls.length, meshes.length * 3, 'a new level is evaluated once, for all meshes');
});

test('parked cut planes clip nothing; Floor plan moves them without changing their number', () => {
  const cut = createCutPlanes();
  const [top, bottom] = cut.planes;
  for (const y of [-500, 0, 30, 5000]) {
    const point = new THREE.Vector3(10, y, -20);
    assert.ok(top.distanceToPoint(point) > 0 && bottom.distanceToPoint(point) > 0, `parked planes keep y = ${y}`);
  }
  cut.cut(8.5, 7);
  assert.equal(cut.top, 8.5);
  assert.ok(top.distanceToPoint(new THREE.Vector3(0, 9, 0)) < 0, 'above the cut is clipped');
  assert.ok(bottom.distanceToPoint(new THREE.Vector3(0, 6, 0)) < 0, 'below the level is clipped');
  assert.ok(top.distanceToPoint(new THREE.Vector3(0, 8, 0)) > 0 && bottom.distanceToPoint(new THREE.Vector3(0, 8, 0)) > 0);
  cut.park();
  assert.equal(cut.planes.length, 2);
  assert.equal(cut.top, PARKED);
});

test('picking ignores parked planes and respects an active cut', () => {
  const cut = createCutPlanes();
  const material = new THREE.MeshStandardMaterial({ clippingPlanes: cut.planes, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 10, 2), material);
  mesh.position.y = 5; mesh.updateMatrixWorld(true);
  mesh.userData.bounds = new THREE.Box3().setFromObject(mesh);
  const ray = new THREE.Raycaster(new THREE.Vector3(0, 8, 10), new THREE.Vector3(0, 0, -1));
  assert.equal(pickHit(ray, [mesh])?.object, mesh, 'parked: the element is picked');
  cut.cut(5, 0);
  assert.equal(pickHit(ray, [mesh]), null, 'cut away above 5 m: no hit');
});

// A stand-in renderer: records what each compile saw (renderer state, render target, clipping planes primed).
function recordingRenderer(state) {
  let target = null, primed = null, polls = 0;
  const programs = new Map(), passes = [], primes = [];
  const renderer = {
    localClippingEnabled: true,
    compile(root, camera, into) {
      const materials = new Set();
      root.traverse(object => { if (object.material && object !== root) for (const m of [object.material].flat()) materials.add(m); });
      passes.push({ state: state.value, target, primed, into, materials: [...materials] });
      for (const material of materials) programs.set(material, { isReady: () => polls >= 3 });
      return materials;
    },
    render(scene) { primed = scene.children[0].material.clippingPlanes.length; primes.push({ primed, into: target }); },
    getRenderTarget: () => target,
    setRenderTarget: value => { target = value; },
    properties: { get: material => ({ currentProgram: programs.get(material) }) },
  };
  return { renderer, passes, primes, wait: async () => { polls++; }, polls: () => polls };
}

test('background compilation primes the clipping-plane count of each group of materials', async () => {
  const scene = new THREE.Scene(), geometry = new THREE.BoxGeometry();
  const planes = createCutPlanes().planes;
  const clipped = new THREE.MeshStandardMaterial({ clippingPlanes: planes }), plain = new THREE.MeshStandardMaterial();
  for (const material of [clipped, clipped, plain]) scene.add(new THREE.Mesh(geometry, material));
  const { renderer, passes, primes, wait } = recordingRenderer({ value: 'now' });
  const count = await compileScene(renderer, scene, new THREE.PerspectiveCamera(), scene, { wait });
  assert.equal(count, 2);
  assert.deepEqual(passes.map(pass => [pass.primed, pass.materials]), [[2, [clipped]], [0, [plain]]]);
  assert.ok(primes.every(prime => prime.into?.isWebGLRenderTarget), 'priming draws into its own 1 × 1 target, never the canvas');
  assert.ok(passes.every(pass => pass.target === null && pass.into === scene));
});

test('shader warm-up compiles one object per material and kind, restores the state and waits for the driver', async () => {
  const scene = new THREE.Scene(), geometry = new THREE.BoxGeometry();
  const planes = createCutPlanes().planes;
  const a = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, clippingPlanes: planes, clipShadows: true }), b = new THREE.MeshStandardMaterial({ map: new THREE.Texture() });
  const meshes = [a, a, a, b].map(material => scene.add(new THREE.Mesh(geometry, material)).children.at(-1));
  meshes[0].castShadow = true;
  const instanced = new THREE.InstancedMesh(geometry, a, 2); scene.add(instanced);
  assert.deepEqual(representatives(scene), [meshes[0], meshes[3], instanced]);
  const state = { value: 'off' };
  const { renderer, passes, wait, polls } = recordingRenderer(state);
  const versions = [a.version, b.version];
  const count = await compileVariants(renderer, scene, new THREE.PerspectiveCamera(), () => { state.value = 'on'; return () => { state.value = 'off'; }; },
    { shadowDepth: true, wait });
  // Main programs with the state applied, one primed group per plane count.
  assert.deepEqual(passes.slice(0, 2).map(pass => [pass.state, pass.target, pass.primed, pass.materials]), [['on', null, 2, [a]], ['on', null, 0, [b]]]);
  // The shadow pass: only casters, with depth stand-ins mirroring faces, map and clipping, into a render target.
  const depthPass = passes[2];
  assert.equal(passes.length, 3);
  assert.equal(depthPass.state, 'on'); assert.ok(depthPass.target?.isWebGLRenderTarget); assert.equal(depthPass.primed, 2);
  const [depth] = depthPass.materials;
  assert.ok(depth.isMeshDepthMaterial);
  assert.equal(depth.side, THREE.DoubleSide); assert.equal(depth.clippingPlanes, planes); assert.equal(depth.clipShadows, true);
  assert.equal(depthStandIn(b).map, b.map); assert.equal(depthStandIn(b).side, THREE.BackSide, 'front faces cast from their back');
  assert.equal(renderer.getRenderTarget(), null, 'the canvas is the render target again');
  assert.equal(state.value, 'off', 'the renderer state is restored at once');
  assert.equal(meshes[0].material, a, 'the casters keep their materials');
  assert.equal(count, 3);
  assert.equal(polls(), 3, 'resolves when the programs report ready');
  assert.ok(a.version > versions[0] && b.version > versions[1], 'the next frame selects the current programs again');
  assert.ok(meshes.every(mesh => mesh.parent === scene), 'compiled objects keep their parent');
});
