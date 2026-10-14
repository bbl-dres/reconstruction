// Release checks in Node with the production viewer modules (no browser, no WebGL).
// Usage (repo root): node tools/revit/export/validate.mjs <building-id> <path-to-build/export/stage/>
import { registerHooks } from 'node:module';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const [buildingId, stageDir] = process.argv.slice(2);
if (!buildingId || !stageDir) { console.error('usage: node tools/revit/export/validate.mjs <building-id> <stage-dir>'); process.exit(2); }
const root = new URL('../../../', import.meta.url);
const stage = pathToFileURL(stageDir.replace(/[\\/]?$/, '/'));
const models = new URL(`reconstructions/${buildingId}/public/models/`, root);
registerHooks({ resolve(s, c, next) {
  if (s === 'three') return { url: new URL('viewer/vendor/three/build/three.module.js', root).href, shortCircuit: true };
  if (s === 'building-policy') return { url: new URL('viewer/js/policy-default.js', root).href, shortCircuit: true };
  if (s.startsWith('three/addons/')) return { url: new URL('viewer/vendor/three/examples/jsm/' + s.slice(13), root).href, shortCircuit: true };
  return next(s, c);
} });
globalThis.ProgressEvent ??= class { constructor(type, init) { this.type = type; Object.assign(this, init); } };
const { parseCatalog } = await import(new URL('viewer/js/model-catalog.js', root));
const { parseMetadata } = await import(new URL('viewer/js/model-metadata.js', root));
const { parseBimRegistry, describeProduct } = await import(new URL('viewer/js/bim-registry.js', root));
const { readGLBBytes } = await import(new URL('tests/helpers/glb-bytes.mjs', root));
const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
const { MeshoptDecoder } = await import(new URL('viewer/vendor/meshoptimizer/meshopt_decoder.mjs', root));
const { prepareStaticModel } = await import(new URL('viewer/js/asset-loader.js', root));
const { visibleInMode, collisionCandidate } = await import(new URL('viewer/js/policy-default.js', root));
const { visibleModelScope } = await import(new URL('viewer/js/model-scope.js', root));
const { collisionInput, buildCollisionData, unpackCollision } = await import(new URL('viewer/js/collision-data.js', root));
const { Walker } = await import(new URL('viewer/js/walking.js', root));
const { PerspectiveCamera } = await import('three');

const results = {};
const entryRaw = JSON.parse(await readFile(new URL('catalog-entry.json', stage), 'utf8'));
const [entry] = parseCatalog({ schemaVersion: 1, models: [entryRaw] });
assert.equal(entry.id, entryRaw.id);
assert(entry.location, 'location parses');
const preview = parseCatalog(JSON.parse(await readFile(new URL('preview/catalog.json', stage), 'utf8')));
results.previewCatalog = preview.map(m => m.id);
const metadata = parseMetadata(JSON.parse(await readFile(new URL(entry.metadata, models), 'utf8')), entry.levels);
assert.deepEqual(metadata.issues, []);
results.views = metadata.views.length;

async function load(path) {
  const bytes = await readGLBBytes(new URL(path, models));
  const length = bytes.readUInt32LE(12);
  const d = JSON.parse(bytes.subarray(20, 20 + length));
  const ids = d.nodes.filter(n => n.mesh !== undefined).map(n => n.extras.viewer_id);
  assert.equal(new Set(ids).size, ids.length, 'unique viewer ids');
  assert.deepEqual(d.extensionsRequired || [], ['EXT_meshopt_compression']);
  const { scene } = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const meshes = await prepareStaticModel(scene, { yieldControl: async () => {}, onMesh: m => { m.name = m.userData.viewer_source_name || m.name; } });
  return { d, ids, meshes, scene };
}

const building = await load(entry.building);
assert.equal(building.meshes.length, entry.meshCount, 'meshCount');
results.buildingMeshes = building.meshes.length;
const registry = parseBimRegistry(JSON.parse(await readFile(new URL(entry.bim, models), 'utf8')), building.meshes, entry);
results.products = registry.elements.size;
results.categories = Object.fromEntries(registry.counts.map(c => [c.category, c.count]));
const sampleMesh = building.meshes.find(m => m.userData.viewer_category === 'window') || building.meshes[0];
const sample = describeProduct(sampleMesh, registry);
results.sampleProduct = { title: sample.title, properties: sample.properties.slice(0, 12).map(p => `${p.label}: ${p.value}`) };
results.dollhouse = {};
for (const level of entry.levels) {
  const shown = building.meshes.filter(m => visibleModelScope(m, false, 'dollhouse') && visibleInMode(m, 'dollhouse', level, entry.levelDefinitions));
  results.dollhouse[level] = shown.length;
  assert(shown.length > 0, `dollhouse ${level} must not be empty`);
}
results.roles = {};
for (const m of building.meshes) { const k = `${m.userData.viewer_role}/${m.userData.viewer_cutaway_role}`; results.roles[k] = (results.roles[k] || 0) + 1; }
const surroundings = await load(entry.surroundings);
results.surroundingsMeshes = surroundings.meshes.length;
results.terrainMeshes = surroundings.meshes.filter(m => m.userData.viewer_role === 'terrain').length;
if (results.terrainMeshes === 0) console.warn('no terrain meshes in the surroundings set');
const overlap = building.ids.filter(id => surroundings.ids.includes(id));
assert.deepEqual(overlap, [], 'no element in both files');
// Walking: the building's configured start must be reachable on the inferred collision world.
const config = JSON.parse(await readFile(new URL(`reconstructions/${buildingId}/public/building.json`, root), 'utf8'));
const input = await collisionInput(building.meshes, undefined, collisionCandidate);
const { world } = await unpackCollision(buildCollisionData(input.data));
results.walk = {};
for (const [name, start] of Object.entries(config.walkStarts || {})) {
  const walker = new Walker(new PerspectiveCamera(), world);
  results.walk[name] = Boolean(walker.spawn(start.position, start.target)) && walker.hasSafePosition;
}
console.log(JSON.stringify(results, null, 1));
