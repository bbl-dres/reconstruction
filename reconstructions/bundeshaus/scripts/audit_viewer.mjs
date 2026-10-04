// Repeatable asset/CPU audit, not a GPU or browser benchmark. No dependencies.
// node scripts/audit_viewer.mjs [output.json]
import { registerHooks } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { cpus, platform, arch } from 'node:os';
import assert from 'node:assert/strict';
import { collisionThroughWorker } from '../tests/helpers/collision-worker.mjs';
import { readGLBBytes } from '../tests/helpers/glb-bytes.mjs';
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'three') return { url: new URL('../public/vendor/three/build/three.module.js', import.meta.url).href, shortCircuit: true };
  if (specifier.startsWith('three/addons/')) return { url: new URL('../public/vendor/three/examples/jsm/' + specifier.slice(13), import.meta.url).href, shortCircuit: true };
  return next(specifier, context);
} });
globalThis.ProgressEvent ??= class { constructor(type, data) { Object.assign(this, data); } };
const THREE = await import('three');
const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
const { MeshoptDecoder } = await import('../public/vendor/meshoptimizer/meshopt_decoder.mjs');
const { pickElement } = await import('../public/js/inspection.js');
const { visibleInMode, LEVELS } = await import('../public/js/model-policy.js');
const { createCollisionWorld } = await import('../public/js/walking.js');
const { fitDirectionalShadow } = await import('../public/js/shadow-fit.js');

async function asset(path) {
  const bytes = await readGLBBytes(new URL('../public/models/' + path.replace(/^\.\//, ''), import.meta.url));
  const length = bytes.readUInt32LE(12);
  const doc = JSON.parse(bytes.subarray(20, 20 + length).toString());
  const objects = doc.nodes.filter(node => node.mesh !== undefined).map(node => ({
    name: node.extras?.viewer_source_name || node.name,
    triangles: doc.meshes[node.mesh].primitives.reduce((sum, primitive) => sum + doc.accessors[primitive.indices ?? primitive.attributes.POSITION].count / 3, 0),
  }));
  const summary = { path, bytes: bytes.length, meshNodes: objects.length, uniqueMeshes: doc.meshes.length,
    primitivesAcrossNodes: doc.nodes.filter(node => node.mesh !== undefined).reduce((sum, node) => sum + doc.meshes[node.mesh].primitives.length, 0),
    trianglesAcrossNodes: objects.reduce((sum, object) => sum + object.triangles, 0), materials: doc.materials?.length || 0,
    doubleSidedMaterials: doc.materials?.filter(material => material.doubleSided).length || 0,
    alphaModes: [...new Set(doc.materials?.map(material => material.alphaMode || 'OPAQUE'))],
    embeddedImages: doc.images?.length || 0, extensions: doc.extensionsUsed || [],
    largestObjects: objects.sort((a, b) => b.triangles - a.triangles).slice(0, 10) };
  return { bytes, length, doc, summary };
}

const catalog = JSON.parse(await readFile(new URL('../public/models/catalog.json', import.meta.url)));
const latest = [...catalog.models].sort((a, b) => b.version - a.version)[0];
const building = await asset(latest.building);
const context = await asset(latest.surroundings);
const doc = building.doc;
doc.buffers[0].uri = 'data:application/octet-stream;base64,' + building.bytes.subarray(28 + building.length, 28 + building.length + doc.buffers[0].byteLength).toString('base64');
delete doc.materials; delete doc.textures; delete doc.images; delete doc.samplers;
for (const mesh of doc.meshes) for (const primitive of mesh.primitives) delete primitive.material;
const beforeLoad = performance.now();
const { scene } = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(JSON.stringify(doc), '');
const geometryLoadMs = performance.now() - beforeLoad;
scene.updateMatrixWorld(true);
const meshes = [];
scene.traverse(mesh => {
  if (!mesh.isMesh) return;
  mesh.name = mesh.userData.viewer_source_name || mesh.name;
  mesh.userData.bounds = new THREE.Box3().setFromObject(mesh);
  mesh.material = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide });
  meshes.push(mesh);
});
const beforeCollision = performance.now();
const collision = createCollisionWorld(meshes);
const collisionBuildMs = performance.now() - beforeCollision;
console.log(`Loaded ${latest.id}; collision ${collision.meshes} meshes / ${collision.triangles} triangles in ${collisionBuildMs.toFixed(1)} ms`);
let lastTick = performance.now(), maxHeartbeatGap = 0, heartbeats = 0;
const heartbeat = setInterval(() => { const now = performance.now(); maxHeartbeatGap = Math.max(maxHeartbeatGap, now - lastTick); lastTick = now; heartbeats++; }, 10);
let worker;
try { worker = await collisionThroughWorker(meshes); } finally { clearInterval(heartbeat); }

function baseline(ray) {
  return ray.intersectObjects(meshes.filter(mesh => mesh.visible), false).find(hit => !hit.object.material.clippingPlanes?.some(plane => plane.distanceToPoint(hit.point) < -1e-5))?.object || null;
}
function percentile(values, fraction) { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))]; }
const scenarios = [];
for (const mode of ['orbit', 'dollhouse', 'plan']) {
  const level = mode === 'plan' ? 'principal' : 'all';
  const bounds = new THREE.Box3();
  const planes = [new THREE.Plane(new THREE.Vector3(0, -1, 0), LEVELS.principal.elevation + 2), new THREE.Plane(new THREE.Vector3(0, 1, 0), -LEVELS.principal.min)];
  for (const mesh of meshes) {
    mesh.visible = visibleInMode(mesh, mode, level);
    mesh.material.clippingPlanes = mode === 'plan' ? planes : null;
    if (mesh.visible) bounds.union(mesh.userData.bounds);
  }
  const center = bounds.getCenter(new THREE.Vector3());
  const camera = new THREE.PerspectiveCamera(45, 1.6, 0.08, 1500);
  const radius = bounds.getSize(new THREE.Vector3()).length() / 2;
  camera.position.copy(center).addScaledVector(new THREE.Vector3(mode === 'plan' ? 0 : 0.95, mode === 'plan' ? 1 : 1.1, mode === 'plan' ? 0.0001 : -1.35).normalize(), radius / Math.sin(Math.PI / 8));
  camera.lookAt(center); camera.updateMatrixWorld(true);
  const rays = [];
  for (let y = -3; y <= 3; y++) for (let x = -5; x <= 5; x++) {
    const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2(x / 7, y / 5), camera); rays.push(ray);
  }
  for (const ray of rays.slice(30, 40)) { baseline(ray); pickElement(ray, meshes); }
  const oldTimes = [], newTimes = [], exactRaycasts = [];
  let mismatches = 0, hits = 0;
  for (let index = 0; index < rays.length; index++) {
    const ray = rays[index]; const stats = {};
    let oldHit, newHit;
    const oldRun = () => { const start = performance.now(); oldHit = baseline(ray); oldTimes.push(performance.now() - start); };
    const newRun = () => { const start = performance.now(); newHit = pickElement(ray, meshes, stats); newTimes.push(performance.now() - start); };
    if (index % 2) { newRun(); oldRun(); } else { oldRun(); newRun(); }
    if (oldHit !== newHit) mismatches++;
    if (newHit) hits++;
    exactRaycasts.push(stats.raycasts);
  }
  assert.equal(mismatches, 0, `${mode}: selection must match the baseline on actual geometry`);
  scenarios.push({ mode, level, rays: rays.length, hits, matchingSelections: rays.length - mismatches,
    visibleMeshes: meshes.filter(mesh => mesh.visible).length,
    baselineMs: { median: percentile(oldTimes, .5), p95: percentile(oldTimes, .95), total: oldTimes.reduce((a,b) => a+b,0) },
    optimizedMs: { median: percentile(newTimes, .5), p95: percentile(newTimes, .95), total: newTimes.reduce((a,b) => a+b,0) },
    exactMeshRaycasts: { median: percentile(exactRaycasts, .5), max: Math.max(...exactRaycasts), total: exactRaycasts.reduce((a,b) => a+b,0) } });
}
const bounds = new THREE.Box3(); meshes.forEach(mesh => bounds.union(mesh.userData.bounds));
const reportURL = new URL('../public/models/' + latest.surroundings.replace(/^\.\//, '').replace(/\.glb(?:\.gz)?$/, '.report.json'), import.meta.url);
const report = JSON.parse(await readFile(reportURL));
const raw = report.selection.boundsBlender;
const site = new THREE.Box3(new THREE.Vector3(raw.min[0], raw.min[2], -raw.max[1]), new THREE.Vector3(raw.max[0], raw.max[2], -raw.min[1])).union(bounds);
const light = new THREE.DirectionalLight(); light.position.set(1, 1, 1); light.shadow.mapSize.set(1024, 1024);
fitDirectionalShadow(light, bounds, site);
const shadow = { resolution: 1024, direction: [1, 1, 1], previousSiteWidthMeters: Math.max(50, site.getSize(new THREE.Vector3()).length()/2)*2.3,
  buildingWidthMeters: light.shadow.camera.right - light.shadow.camera.left,
  buildingHeightMeters: light.shadow.camera.top - light.shadow.camera.bottom };
const result = { measuredAt: new Date().toISOString(), environment: { node: process.version, platform: platform(), arch: arch(), cpu: cpus()[0].model },
  scope: 'CPU geometry-only Node benchmark. Texture decode, GPU rendering, browser frame rates and physical devices are not measured. 10 warm-up rays per mode; alternating baseline/optimized order; 77 deterministic rays per mode.',
  model: latest.id, assets: { building: building.summary, surroundings: context.summary }, geometryLoadMs,
  collision: { buildMs: collisionBuildMs, meshes: collision.meshes, triangles: collision.triangles,
    worker: { ...worker.timings, heartbeats, maxHeartbeatGapMs: maxHeartbeatGap, heartbeatIntervalMs: 10 } }, picking: scenarios, shadow };
if (process.argv[2]) await writeFile(process.argv[2], JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ model: result.model, collision: result.collision, picking: scenarios, shadow }, null, 2));
