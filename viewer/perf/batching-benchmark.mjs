// Batching benchmark (measurement only; not loaded by the viewer). Loads a published model with the
// viewer's own loader and preparation, then renders the Exterior home view and the all-level Dollhouse
// with one of three render set-ups, timing CPU submission and GPU time per frame:
//   instances   what the viewer does today (render-instances.js: InstancedMesh for 3+ repeats per 24 m cell)
//   batched     one BatchedMesh per (material, attribute layout) for every opaque single-material mesh,
//               shared geometries stored once; per-element visibility with setVisibleAt
//   batched-glass  as batched, and transmissive glass drawn as blended glass (no transmission pass)
// URL: batching-benchmark.html?building=bundeshaus&variant=batched&surroundings=1[&sort=0]
// Result: window.__result (JSON), also printed on the page. Run headless with viewer/perf/run-page.mjs.
import * as THREE from 'three';
import { loadGLB, prepareStaticModel } from '../js/asset-loader.js?v=gzip-6';
import { createRenderInstances } from '../js/render-instances.js?v=sync-3';
import { createSurroundingsStyle } from '../js/surroundings-style.js?v=alpha-1';
import { STUDIO, studioSunDirection, applyStudioLights, createSkyEnvironment } from '../js/lighting.js?v=sky-ibl-1';
import { fitDistance } from '../js/view-navigation.js?v=fit-1';
import { visibleModelScope } from '../js/model-scope.js?v=site-1';
import { materialsOf } from '../js/scene-utils.js?v=1';

const params = new URL(location.href).searchParams;
const id = params.get('building') || 'bundeshaus';
const variant = params.get('variant') || 'instances';
const withSurroundings = params.get('surroundings') !== '0';
const out = document.getElementById('out');
const result = window.__result = { building: id, variant, surroundings: withSurroundings, status: 'loading' };
const now = () => performance.now();

async function policyFor(building) {
  try { return await import(`../../reconstructions/${building}/public/policy/model-policy.js`); }
  catch { return import('../js/policy-default.js'); }
}

try {
  const policy = await policyFor(id);
  const base = new URL(`../../reconstructions/${id}/public/models/`, location.href);
  const catalog = await (await fetch(new URL('catalog.json', base))).json();
  const model = catalog.models.find(entry => entry.id === catalog.default) || catalog.models[0];
  const levels = model.levelDefinitions || policy.LEVELS;
  const canvas = document.getElementById('scene');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.setSize(1600, 900, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = STUDIO.toneMapping;
  renderer.toneMappingExposure = STUDIO.exposure;
  renderer.localClippingEnabled = true;
  renderer.info.autoReset = false;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  const environment = createSkyEnvironment(renderer);
  scene.environment = environment.texture;
  const fill = new THREE.HemisphereLight(), sun = new THREE.DirectionalLight();
  applyStudioLights({ scene, sun, fillLight: fill });
  sun.target.position.set(0, 10, 0);
  sun.position.copy(sun.target.position).addScaledVector(studioSunDirection(), STUDIO.sun.distance);
  scene.add(fill, sun, sun.target);
  const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  async function load(file, muted) {
    const gltf = await loadGLB(new URL(file, base));
    const meshes = await prepareStaticModel(gltf.scene, { onMesh: mesh => {
      for (const material of materialsOf(mesh)) { material.clipShadows = true; if (material.map) material.map.anisotropy = anisotropy; }
    } });
    if (muted) createSurroundingsStyle(gltf.scene).setMuted(true);
    scene.add(gltf.scene);
    return meshes;
  }
  const buildingMeshes = await load(model.building, false);
  const surroundingMeshes = withSurroundings && model.surroundings ? await load(model.surroundings, true) : [];
  const allMeshes = [...buildingMeshes, ...surroundingMeshes];
  result.meshes = allMeshes.length;

  if (variant === 'batched-glass') {
    for (const mesh of allMeshes) for (const material of materialsOf(mesh)) if (material.transmission > 0) {
      material.transmission = 0; material.transparent = true; material.opacity = 0.25; material.depthWrite = false; material.needsUpdate = true;
    }
  }

  // Render set-up.
  let t = now();
  const batches = [];
  const batchOf = new Map(); // mesh → { batch, instance }
  if (variant === 'instances') {
    createRenderInstances(buildingMeshes, scene);
    if (surroundingMeshes.length) createRenderInstances(surroundingMeshes, scene);
  } else {
    const opaque = mesh => !Array.isArray(mesh.material) && !mesh.material.transparent && !(mesh.material.transmission > 0)
      && mesh.matrixWorld.determinant() > 0 && mesh.geometry.index;
    const groups = new Map();
    for (const mesh of allMeshes) {
      if (!opaque(mesh)) continue;
      const layout = Object.keys(mesh.geometry.attributes).sort().map(name => `${name}${mesh.geometry.attributes[name].itemSize}${mesh.geometry.attributes[name].normalized ? 'n' : ''}`).join(',');
      const key = `${mesh.material.uuid}|${layout}|${mesh.castShadow}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(mesh);
    }
    const root = new THREE.Group(); root.name = 'Batches'; scene.add(root);
    for (const members of groups.values()) {
      const geometries = [...new Set(members.map(mesh => mesh.geometry))];
      const vertices = geometries.reduce((sum, g) => sum + g.attributes.position.count, 0);
      const indices = geometries.reduce((sum, g) => sum + g.index.count, 0);
      const batch = new THREE.BatchedMesh(members.length, vertices, indices, members[0].material);
      const ids = new Map(geometries.map(g => [g, batch.addGeometry(g)]));
      for (const mesh of members) {
        const instance = batch.addInstance(ids.get(mesh.geometry));
        batch.setMatrixAt(instance, mesh.matrixWorld);
        batchOf.set(mesh, { batch, instance });
        mesh.layers.set(1); // the source stays for picking, metadata and collision; it is no longer drawn
      }
      batch.castShadow = batch.receiveShadow = true;
      // &sort=0: skip BatchedMesh's per-frame depth sort of its instances (it still culls them per frame).
      if (params.get('sort') === '0') batch.sortObjects = false;
      // &cull=0: no per-instance frustum culling either (the whole batch draws when its bounds are in view).
      if (params.get('cull') === '0') batch.perObjectFrustumCulled = false;
      batches.push(batch);
      root.add(batch);
    }
    result.batches = batches.length;
    result.batchedMeshes = batchOf.size;
    result.batchGeometryMB = Math.round(batches.reduce((sum, b) => sum + Object.values(b.geometry.attributes).reduce((s, a) => s + a.array.byteLength, 0) + b.geometry.index.array.byteLength, 0) / 1e6);
  }
  result.setupMs = Math.round(now() - t);
  scene.updateMatrixWorld(true);

  // Home view as main.js frameView().
  const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.08, 1500);
  const bounds = new THREE.Box3();
  for (const mesh of buildingMeshes) bounds.union(mesh.userData.bounds);
  if (surroundingMeshes.length) {
    const site = new THREE.Box3(); for (const mesh of surroundingMeshes) site.union(mesh.userData.bounds);
    camera.far = Math.max(camera.far, site.getSize(new THREE.Vector3()).length() * 6);
  }
  const center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
  function home(mode) {
    const distance = fitDistance(camera, size.length() / 2) * (mode === 'dollhouse' ? 1.03 : 1.06);
    const direction = new THREE.Vector3(0.95, mode === 'dollhouse' ? 1.1 : 0.65, -1.35).normalize();
    camera.position.copy(center).addScaledVector(direction, distance);
    camera.lookAt(center); camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
  }

  // Visibility as applyVisibility() for a mode (all levels): source meshes, then the batches.
  function applyMode(mode) {
    const start = now();
    for (const mesh of buildingMeshes) mesh.visible = visibleModelScope(mesh, true, mode) && policy.visibleInMode(mesh, mode, 'all', levels);
    if (variant !== 'instances') {
      for (const [mesh, { batch, instance }] of batchOf) batch.setVisibleAt(instance, mesh.visible && (!mesh.parent || mesh.parent.visible));
    }
    return now() - start;
  }

  // GPU time per frame with EXT_disjoint_timer_query_webgl2 where available.
  const gl = renderer.getContext();
  const timer = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  async function measure(label, frames = 120) {
    const cpu = [], gpu = [], pending = [];
    let calls = 0, triangles = 0;
    const center0 = camera.position.clone();
    for (let i = 0; i < frames; i++) {
      await new Promise(resolve => requestAnimationFrame(resolve));
      camera.position.copy(center0).sub(center).applyAxisAngle(new THREE.Vector3(0, 1, 0), i * 0.01).add(center);
      camera.lookAt(center); camera.updateMatrixWorld(true);
      let query = null;
      if (timer) { query = gl.createQuery(); gl.beginQuery(timer.TIME_ELAPSED_EXT, query); }
      renderer.info.reset();
      const start = now();
      renderer.render(scene, camera);
      cpu.push(now() - start);
      calls = renderer.info.render.calls; triangles = renderer.info.render.triangles;
      if (query) { gl.endQuery(timer.TIME_ELAPSED_EXT); pending.push(query); }
      for (let j = pending.length - 1; j >= 0; j--) {
        if (gl.getQueryParameter(pending[j], gl.QUERY_RESULT_AVAILABLE)) {
          if (!gl.getParameter(timer.GPU_DISJOINT_EXT)) gpu.push(gl.getQueryParameter(pending[j], gl.QUERY_RESULT) / 1e6);
          gl.deleteQuery(pending[j]); pending.splice(j, 1);
        }
      }
    }
    camera.position.copy(center0);
    const median = list => { const s = [...list].sort((a, b) => a - b); return s.length ? Math.round(s[Math.floor(s.length / 2)] * 10) / 10 : null; };
    const p95 = list => { const s = [...list].sort((a, b) => a - b); return s.length ? Math.round(s[Math.floor(s.length * 0.95)] * 10) / 10 : null; };
    return { label, drawCalls: calls, triangles, cpuMedianMs: median(cpu.slice(10)), cpuP95Ms: p95(cpu.slice(10)), gpuMedianMs: median(gpu), gpuP95Ms: p95(gpu) };
  }

  result.status = 'measuring';
  home('orbit');
  applyMode('orbit');
  t = now();
  await renderer.compileAsync(scene, camera);
  renderer.render(scene, camera);
  result.firstRenderMs = Math.round(now() - t);
  result.exterior = await measure('Exterior home view, orbiting');
  result.visibilityToDollhouseMs = Math.round(applyMode('dollhouse') * 10) / 10;
  home('dollhouse');
  renderer.render(scene, camera);
  result.dollhouse = await measure('Dollhouse home view, orbiting');
  result.visibilityToExteriorMs = Math.round(applyMode('orbit') * 10) / 10;
  result.memory = { geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, programs: renderer.info.programs?.length };
  result.renderer = (() => { const info = gl.getExtension('WEBGL_debug_renderer_info'); return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : ''; })();
  result.multiDraw = Boolean(gl.getExtension('WEBGL_multi_draw'));
  result.status = 'done';
} catch (error) {
  result.status = 'error';
  result.error = String(error?.stack || error);
}
out.textContent = JSON.stringify(result, null, 1);
