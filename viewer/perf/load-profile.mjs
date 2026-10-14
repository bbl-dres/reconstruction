// CPU-side profile of the viewer's load path and per-interaction work, using the viewer's own
// modules on the published model. Node has no WebGL, so textures are stripped and GPU work
// (upload, shader compilation, rasterisation) is out of scope: see browser-profile.mjs.
// Read-only. From the repository root:
//   node --expose-gc viewer/perf/load-profile.mjs [building-id] [--no-surroundings] [--json]
// building-id defaults to bundeshaus. Timings are wall-clock milliseconds on this machine.
import { registerHooks } from 'node:module';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const args = process.argv.slice(2);
const id = args.find(arg => !arg.startsWith('--')) || 'bundeshaus';
const withSurroundings = !args.includes('--no-surroundings');
const root = pathToFileURL(path.resolve('.') + '/');
const own = `reconstructions/${id}/public/policy/model-policy.js`;
const policyURL = new URL(existsSync(own) ? own : 'viewer/js/policy-default.js', root).href;
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'three') return { url: new URL('viewer/vendor/three/build/three.module.js', root).href, shortCircuit: true };
  if (specifier === 'building-policy') return { url: policyURL, shortCircuit: true };
  if (specifier.startsWith('three/addons/')) return { url: new URL('viewer/vendor/three/examples/jsm/' + specifier.slice(13), root).href, shortCircuit: true };
  return next(specifier, context);
} });
globalThis.ProgressEvent ??= class { constructor(type, init) { this.type = type; Object.assign(this, init); } };

const THREE = await import('three');
const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
const { MeshoptDecoder } = await import(new URL('viewer/vendor/meshoptimizer/meshopt_decoder.mjs', root));
const { prepareStaticModel } = await import(new URL('viewer/js/asset-loader.js', root));
const { createRenderInstances, ELEMENT_LAYER } = await import(new URL('viewer/js/render-instances.js', root));
const { pickHit } = await import(new URL('viewer/js/inspection.js', root));
const { collisionInput, buildCollisionData, unpackCollision } = await import(new URL('viewer/js/collision-data.js', root));
const { Walker } = await import(new URL('viewer/js/walking.js', root));
const { parseBimRegistry } = await import(new URL('viewer/js/bim-registry.js', root));
const { parseMetadata } = await import(new URL('viewer/js/model-metadata.js', root));
const { parseCatalog } = await import(new URL('viewer/js/model-catalog.js', root));
const { buildModelTree } = await import(new URL('viewer/js/model-tree.js', root));
const { visibleModelScope } = await import(new URL('viewer/js/model-scope.js', root));
const { fitDistance, eyeLevelFov } = await import(new URL('viewer/js/view-navigation.js', root));
const { createSurroundingsStyle } = await import(new URL('viewer/js/surroundings-style.js', root));
const policy = await import('building-policy');
await MeshoptDecoder.ready;

const now = () => performance.now();
const ms = value => Math.round(value * 10) / 10;
const median = list => { const s = [...list].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const p95 = list => { const s = [...list].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * 0.95))]; };
const out = { building: id, machine: { node: process.version, platform: process.platform }, phases: {} };

const modelsDir = new URL(`reconstructions/${id}/public/models/`, root);
const catalogData = JSON.parse(await readFile(new URL('catalog.json', modelsDir), 'utf8'));
const entry = parseCatalog(catalogData).find(model => model.id === catalogData.default) || parseCatalog(catalogData)[0];
const activeLevels = entry.levelDefinitions || policy.LEVELS;
out.model = entry.id;

// Rebuild the GLB without images: Node cannot decode them. Geometry, materials and extras are unchanged.
function withoutImages(glb) {
  const jsonLength = glb.readUInt32LE(12);
  const doc = JSON.parse(glb.subarray(20, 20 + jsonLength).toString());
  const strip = value => {
    if (!value || typeof value !== 'object') return;
    for (const key of Object.keys(value)) {
      if (/Texture$/.test(key)) delete value[key]; else strip(value[key]);
    }
  };
  for (const material of doc.materials || []) strip(material);
  delete doc.images; delete doc.textures; delete doc.samplers;
  let json = Buffer.from(JSON.stringify(doc));
  json = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, 0x20)]);
  const bin = glb.subarray(20 + jsonLength);
  const header = Buffer.alloc(20);
  header.write('glTF'); header.writeUInt32LE(2, 4); header.writeUInt32LE(20 + json.length + bin.length, 8);
  header.writeUInt32LE(json.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
  const result = Buffer.concat([header, json, bin]);
  return { buffer: result.buffer.slice(result.byteOffset, result.byteOffset + result.length), doc, jsonLength };
}

async function loadAsset(file, label) {
  const raw = await readFile(new URL(file, modelsDir));
  const phase = {};
  let t = now();
  const glb = raw[0] === 0x1f && raw[1] === 0x8b ? gunzipSync(raw) : raw;
  phase.gunzipMs = ms(now() - t);
  t = now();
  JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString());
  phase.jsonParseMs = ms(now() - t);
  const { buffer, doc } = withoutImages(glb);
  // Meshopt decode alone, as the loader does it (main thread, no workers).
  const bin = glb.subarray(20 + glb.readUInt32LE(12) + 8);
  t = now();
  let decodedBytes = 0;
  for (const view of doc.bufferViews) {
    const ext = view.extensions?.EXT_meshopt_compression;
    if (!ext) continue;
    const source = new Uint8Array(bin.buffer, bin.byteOffset + (ext.byteOffset || 0), ext.byteLength);
    const target = new Uint8Array(ext.count * ext.byteStride);
    MeshoptDecoder.decodeGltfBuffer(target, ext.count, ext.byteStride, source, ext.mode, ext.filter);
    decodedBytes += target.length;
  }
  phase.meshoptDecodeMs = ms(now() - t);
  phase.meshoptDecodedBytes = decodedBytes;
  t = now();
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(buffer, '');
  phase.gltfParseMs = ms(now() - t);
  t = now();
  let triangles = 0;
  const meshes = await prepareStaticModel(gltf.scene, { yieldControl: async () => {}, onMesh: mesh => {
    mesh.name = mesh.userData.viewer_source_name || mesh.name.replaceAll('_', ' ');
    triangles += (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3;
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) material.clipShadows = true;
  } });
  phase.prepareStaticModelMs = ms(now() - t);
  phase.meshes = meshes.length;
  phase.triangles = Math.round(triangles);
  const materials = new Set(meshes.flatMap(mesh => Array.isArray(mesh.material) ? mesh.material : [mesh.material]));
  phase.materials = materials.size;
  out.phases[label] = phase;
  return { root: gltf.scene, meshes, materials };
}

// ── Load ──
const scene = new THREE.Scene();
const building = await loadAsset(entry.building, 'building');
scene.add(building.root);
let t = now();
const buildingInstances = createRenderInstances(building.meshes, scene);
out.phases.building.renderInstancesMs = ms(now() - t);
out.phases.building.instanceBatches = buildingInstances.batches.length;
out.phases.building.instancedPlacements = buildingInstances.placements;
let surroundings = null;
if (withSurroundings && entry.surroundings) {
  surroundings = await loadAsset(entry.surroundings, 'surroundings');
  t = now();
  const style = createSurroundingsStyle(surroundings.root);
  style.setMuted(true);
  surroundings.instances = createRenderInstances(surroundings.meshes, scene);
  surroundings.instances.sync();
  scene.add(surroundings.root);
  out.phases.surroundings.styleAndInstancesMs = ms(now() - t);
  out.phases.surroundings.instanceBatches = surroundings.instances.batches.length;
  out.phases.surroundings.instancedPlacements = surroundings.instances.placements;
}
scene.updateMatrixWorld(true);

t = now();
const metadataText = await readFile(new URL(entry.metadata, modelsDir), 'utf8');
const metadata = parseMetadata(JSON.parse(metadataText), entry.levels);
out.phases.metadata = { bytes: metadataText.length, parseMs: ms(now() - t), objects: metadata.objects.size };
let bim = null;
if (entry.bim) {
  t = now();
  const text = await readFile(new URL(entry.bim, modelsDir), 'utf8');
  const data = JSON.parse(text);
  const jsonMs = now() - t;
  t = now();
  bim = parseBimRegistry(data, building.meshes, entry);
  out.phases.bim = { bytes: text.length, jsonParseMs: ms(jsonMs), validateMs: ms(now() - t), elements: bim.elements.size };
}
const treeLevels = entry.levels.filter(level => level !== 'all' && activeLevels[level]);
t = now();
let tree = buildModelTree({ meshes: building.meshes, bim, levels: treeLevels, definitions: activeLevels, category: () => 'unclassified' });
out.phases.tree = { buildMs: ms(now() - t), nodes: tree.nodes.size };
// Retained after a full collection (run with --expose-gc), and the peak resident set during loading.
// The script's own image-stripping copies inflate the peak a little; the browser also holds decoded images.
globalThis.gc?.();
const memory = process.memoryUsage();
out.memoryAfterLoad = { retainedRssMB: Math.round(memory.rss / 1e6), heapUsedMB: Math.round(memory.heapUsed / 1e6), arrayBuffersMB: Math.round(memory.arrayBuffers / 1e6),
  peakRssMB: Math.round(process.resourceUsage().maxRSS / 1e3), collected: Boolean(globalThis.gc) };

// ── Visibility (main.js applyVisibility, without the DOM) ──
const PLAN_WHOLE = new Set(['furniture', 'chair', 'desk', 'table', 'cabinet', 'bench', 'stair', 'balustrade', 'railing', 'handrail', 'guardrail', 'sculpture', 'plant', 'equipment', 'decoration', 'light-fixture']);
const uncutMaterials = new Map(), cutMaterialOf = new Map();
const uncut = material => { if (!uncutMaterials.has(material)) uncutMaterials.set(material, Object.assign(material.clone(), { clippingPlanes: null })); return uncutMaterials.get(material); };
const cutPlanes = [new THREE.Plane(new THREE.Vector3(0, -1, 0), 100), new THREE.Plane(new THREE.Vector3(0, 1, 0), 100)];
function applyVisibility(view, level) {
  const section = activeLevels[level];
  const clip = Boolean(section && view === 'plan');
  if (clip) { cutPlanes[0].constant = section.elevation + 1; cutPlanes[1].constant = -section.min; }
  for (const mesh of building.meshes) {
    const data = mesh.userData;
    const overhead = level !== 'all' && (data.viewer_cutaway_role === 'overhead' || data.viewer_role === 'ceiling' || data.viewer_role === 'roof');
    mesh.visible = visibleModelScope(mesh, true, view) && policy.visibleInMode(mesh, view, 'all', activeLevels)
      && (level === 'all' || tree.elementOf.get(mesh)?.level === level) && !overhead;
    const whole = clip && mesh.visible && PLAN_WHOLE.has(data.viewer_category ?? data.viewer_role) && (data.bounds?.min.y ?? Infinity) < cutPlanes[0].constant;
    if (whole && !cutMaterialOf.has(mesh)) { cutMaterialOf.set(mesh, mesh.material); mesh.material = Array.isArray(mesh.material) ? mesh.material.map(uncut) : uncut(mesh.material); }
    else if (!whole && cutMaterialOf.has(mesh)) { mesh.material = cutMaterialOf.get(mesh); cutMaterialOf.delete(mesh); }
  }
  buildingInstances.sync();
  for (const material of building.materials) material.clippingPlanes = clip ? cutPlanes : null;
  // refreshShadowBounds: visibleBounds() twice.
  for (let i = 0; i < 2; i++) { const bounds = new THREE.Box3(); for (const mesh of building.meshes) if (mesh.visible) bounds.union(mesh.userData.bounds); }
}
const views = [['orbit', 'all'], ['dollhouse', 'all'], ['dollhouse', treeLevels.includes('principal') ? 'principal' : treeLevels[0]], ['plan', treeLevels.includes('principal') ? 'principal' : treeLevels[0]]];
out.visibility = {};
for (const [view, level] of views) {
  const samples = [];
  for (let i = 0; i < 5; i++) {
    applyVisibility(view === 'orbit' ? 'dollhouse' : 'orbit', 'all'); // force a change, as a real switch does
    t = now(); applyVisibility(view, level); samples.push(now() - t);
  }
  out.visibility[`${view}/${level}`] = { medianMs: ms(median(samples)), visibleMeshes: building.meshes.filter(m => m.visible).length };
}

// ── Draws per view: emulates WebGLRenderer.projectObject (layers, frustum culling, material groups) ──
const aspect = 16 / 9;
const perspective = new THREE.PerspectiveCamera(45, aspect, 0.08, 1500);
if (surroundings) {
  const diameter = new THREE.Box3().setFromObject(surroundings.root).getSize(new THREE.Vector3()).length();
  perspective.far = Math.max(perspective.far, diameter * 6);
}
perspective.updateProjectionMatrix();
function visibleBounds() {
  const bounds = new THREE.Box3();
  for (const mesh of building.meshes) if (mesh.visible) bounds.union(mesh.userData.bounds);
  return bounds;
}
function frame(view, level) {
  const bounds = visibleBounds();
  const center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
  if (view === 'plan') {
    const section = activeLevels[level];
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
    camera.up.set(0, 0, -1);
    const height = Math.max(size.z * 1.25, size.x / aspect * 1.25, 20);
    Object.assign(camera, { left: -height * aspect / 2, right: height * aspect / 2, top: height / 2, bottom: -height / 2 });
    camera.position.set(center.x, (section ? section.elevation + 1 : bounds.max.y) + 150, center.z);
    camera.lookAt(center.x, center.y, center.z);
    camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
    return camera;
  }
  const camera = perspective.clone();
  if (view === 'walk') {
    const start = Object.values(policy.WALK_STARTS || {})[0];
    camera.fov = eyeLevelFov(aspect);
    camera.position.fromArray(start ? start.position : center.toArray()).y += 1.65;
    camera.lookAt(new THREE.Vector3().fromArray(start ? start.target : [center.x + 1, center.y, center.z]));
  } else {
    const distance = fitDistance(camera, size.length() / 2) * (view === 'dollhouse' ? 1.03 : 1.06);
    const direction = new THREE.Vector3(0.95, view === 'dollhouse' ? 1.1 : 0.65, -1.35).normalize();
    camera.position.copy(center).addScaledVector(direction, distance);
    camera.lookAt(center);
  }
  camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
  return camera;
}
function countDraws(camera) {
  const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  const lists = { opaque: [], transmissive: [], transparent: [] };
  let instanced = 0;
  const push = (object, geometry, material, group) => {
    const list = material.transmission > 0 ? lists.transmissive : material.transparent ? lists.transparent : lists.opaque;
    const count = group ? group.count : geometry.index ? geometry.index.count : geometry.attributes.position.count;
    list.push({ object, material, triangles: count / 3 * (object.isInstancedMesh ? object.count : 1) });
    if (object.isInstancedMesh) instanced++;
  };
  const sum = items => items.reduce((total, item) => total + item.triangles, 0);
  const visit = object => {
    if (!object.visible) return;
    if (object.layers.test(camera.layers) && object.isMesh && (!object.frustumCulled || frustum.intersectsObject(object))) {
      const { geometry, material } = object;
      if (Array.isArray(material)) { for (const group of geometry.groups) { const m = material[group.materialIndex]; if (m?.visible) push(object, geometry, m, group); } }
      else if (material.visible) push(object, geometry, material, null);
    }
    for (const child of object.children) visit(child);
  };
  visit(scene);
  const main = lists.opaque.length + lists.transmissive.length + lists.transparent.length;
  // The transmission pass redraws every opaque item into its own target first (plus double-sided
  // glass from behind where WEBGL_multisampled_render_to_texture is missing, as on desktop).
  const backsides = lists.transmissive.filter(i => i.material.side === THREE.DoubleSide);
  const transmissionPass = lists.transmissive.length ? lists.opaque.length + backsides.length : 0;
  const triangles = sum(lists.opaque) + sum(lists.transmissive) + sum(lists.transparent) + (lists.transmissive.length ? sum(lists.opaque) + sum(backsides) : 0);
  const cell = 24;
  const center = new THREE.Vector3();
  const cells = new Set(lists.opaque.map(({ object, material }) => {
    (object.userData.bounds || object.boundingSphere ? (object.userData.bounds ? object.userData.bounds.getCenter(center) : center.copy(object.boundingSphere.center)) : center.setFromMatrixPosition(object.matrixWorld));
    return `${material.uuid}|${Math.floor(center.x / cell)},${Math.floor(center.y / cell)},${Math.floor(center.z / cell)}`;
  }));
  return {
    drawCalls: main + transmissionPass, mainPass: main, transmissionPass,
    opaque: lists.opaque.length, transmissive: lists.transmissive.length, transparent: lists.transparent.length, instancedDraws: instanced,
    submittedTriangles: Math.round(triangles),
    opaqueMaterials: new Set(lists.opaque.map(i => i.material)).size,
    opaqueIfMergedPerMaterialAnd24mCell: cells.size,
  };
}
out.draws = {};
const drawViews = [['orbit', 'all'], ['dollhouse', 'all'], ['plan', views[3][1]], ['walk', 'all']];
for (const [view, level] of drawViews) {
  applyVisibility(view === 'walk' ? 'orbit' : view, level);
  const camera = frame(view, level);
  const counts = countDraws(camera);
  if (surroundings) {
    surroundings.root.visible = false; surroundings.instances.sync();
    counts.withoutSurroundings = countDraws(camera).drawCalls;
    surroundings.root.visible = view !== 'plan'; surroundings.instances.sync();
  }
  out.draws[`${view}/${level}`] = counts;
}
// What-if estimates for the Exterior home view (no viewer code changes; the scene is altered here only):
// glass drawn without the transmission pass, interior contents hidden while looking from outside, both.
{
  applyVisibility('orbit', 'all');
  const camera = frame('orbit', 'all');
  const glass = [...building.materials, ...(surroundings?.materials || [])].filter(m => m.transmission > 0);
  const withoutTransmission = () => { for (const m of glass) { m.userData.perfTransmission = m.transmission; m.transmission = 0; m.transparent = true; } };
  const restoreTransmission = () => { for (const m of glass) { m.transmission = m.userData.perfTransmission; m.transparent = false; } };
  const interior = mesh => mesh.userData.viewer_environment === 'interior' && ['furniture', 'decoration'].includes(mesh.userData.viewer_role);
  const hideInterior = on => { for (const mesh of building.meshes) if (interior(mesh)) mesh.visible = !on; buildingInstances.sync(); };
  out.whatIf = {};
  withoutTransmission();
  out.whatIf['orbit/all, glass without transmission pass'] = countDraws(camera);
  restoreTransmission();
  hideInterior(true);
  out.whatIf['orbit/all, interior furniture+decoration hidden'] = { ...countDraws(camera), hiddenMeshes: building.meshes.filter(interior).length };
  withoutTransmission();
  out.whatIf['orbit/all, both'] = countDraws(camera);
  restoreTransmission();
  hideInterior(false);
}

// Without render instances (?instances=0), Exterior.
applyVisibility('orbit', 'all');
buildingInstances.dispose(); surroundings?.instances.dispose();
out.draws['orbit/all ?instances=0'] = countDraws(frame('orbit', 'all'));

// ── Picking (inspection.js pickHit): 60 clicks aimed at visible elements from the Exterior and Dollhouse home views ──
out.picking = {};
for (const view of ['orbit', 'dollhouse']) {
  applyVisibility(view, 'all');
  const camera = frame(view, 'all');
  const raycaster = new THREE.Raycaster(); raycaster.layers.enable(ELEMENT_LAYER);
  const visible = building.meshes.filter(mesh => mesh.visible);
  const samples = [], candidates = [], raycasts = [];
  let seed = 7;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 60; i++) {
    const target = visible[Math.floor(random() * visible.length)].userData.bounds.getCenter(new THREE.Vector3());
    raycaster.ray.origin.copy(camera.position);
    raycaster.ray.direction.copy(target).sub(camera.position).normalize();
    raycaster.camera = camera;
    const stats = {};
    t = now(); pickHit(raycaster, building.meshes, stats); samples.push(now() - t);
    candidates.push(stats.candidates); raycasts.push(stats.raycasts);
  }
  out.picking[view] = { medianMs: ms(median(samples)), p95Ms: ms(p95(samples)), maxMs: ms(Math.max(...samples)), medianCandidates: median(candidates), medianTriangleTests: median(raycasts) };
}

// ── Walk: collision preparation and per-frame stepping ──
applyVisibility('orbit', 'all');
t = now();
const input = await collisionInput(building.meshes, undefined, policy.collisionCandidate);
const inputMs = now() - t;
t = now();
const packed = buildCollisionData(input.data);
const buildMs = now() - t;
const collision = unpackCollision(packed);
out.walk = { collisionInputMainThreadMs: ms(inputMs), bvhBuildWorkerMs: ms(buildMs), collisionMeshes: packed.meshes, collisionTriangles: packed.triangles,
  bvhMB: Math.round((packed.vertices.byteLength + packed.boxes.byteLength + packed.layout.byteLength + packed.refs.byteLength) / 1e6) };
const start = Object.values(policy.WALK_STARTS || {})[0];
if (start) {
  const camera = new THREE.PerspectiveCamera(75, aspect, 0.08, 1500);
  const walker = new Walker(camera, collision.world);
  if (walker.spawn(start.position, start.target)) {
    const keys = new Set(['KeyW']);
    const samples = [];
    for (let i = 0; i < 240; i++) {
      if (i % 60 === 0) camera.rotateY(0.6);
      t = now(); walker.update(1 / 60, keys); samples.push(now() - t);
    }
    out.walk.stepMedianMs = ms(median(samples)); out.walk.stepP95Ms = ms(p95(samples));
  }
}

if (args.includes('--json')) console.log(JSON.stringify(out, null, 1));
else {
  console.log(`${out.building} ${out.model} (Node ${process.version})`);
  for (const [label, phase] of Object.entries(out.phases)) console.log(label.padEnd(13), JSON.stringify(phase));
  console.log('memory       ', JSON.stringify(out.memoryAfterLoad));
  for (const [label, v] of Object.entries(out.visibility)) console.log(`visibility ${label}`.padEnd(30), JSON.stringify(v));
  for (const [label, v] of Object.entries(out.draws)) console.log(`draws ${label}`.padEnd(30), JSON.stringify(v));
  for (const [label, v] of Object.entries(out.whatIf || {})) console.log(`what-if ${label}`.padEnd(30), JSON.stringify(v));
  for (const [label, v] of Object.entries(out.picking)) console.log(`pick ${label}`.padEnd(30), JSON.stringify(v));
  console.log('walk'.padEnd(30), JSON.stringify(out.walk));
}
