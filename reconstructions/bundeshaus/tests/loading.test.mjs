import { registerHooks } from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'three') return { url: new URL('../public/vendor/three/build/three.module.js', import.meta.url).href, shortCircuit: true };
  if (specifier.startsWith('three/addons/')) return { url: new URL('../public/vendor/three/examples/jsm/' + specifier.slice(13), import.meta.url).href, shortCircuit: true };
  return next(specifier, context);
} });
const { downloadGLB, loadGLB, prepareStaticModel } = await import('../public/js/asset-loader.js');
const { collisionInput } = await import('../public/js/collision-data.js');
const THREE = await import('three');
const { resolveMeshoptDecoder } = await import('../public/js/meshopt-decoder.js');

test('decoder initialization handles disabled WASM and rejected compilation with a working local fallback', async () => {
  const { MeshoptEncoder } = await import('../scripts/vendor/meshoptimizer/meshopt_encoder.mjs');
  await MeshoptEncoder.ready;
  const raw = new Uint8Array(new Float32Array([0, 1, 2, -1, 3, 9]).buffer);
  const encoded = MeshoptEncoder.encodeGltfBuffer(raw, 2, 12, 'ATTRIBUTES', 0);
  for (const native of [{ supported: false }, { supported: true, get ready() { return Promise.reject(new Error('WASM blocked')); } }]) {
    const decoder = await resolveMeshoptDecoder(native);
    const decoded = new Uint8Array(raw.length);
    decoder.decodeGltfBuffer(decoded, 2, 12, encoded, 'ATTRIBUTES');
    assert.deepEqual(decoded, raw);
  }
});

test('the application loader configures its decoder before parsing a compressed GLB', async () => {
  const { compressGLB, writeGLB } = await import('../scripts/meshopt_glb.mjs');
  const values = Float32Array.from({ length: 30000 }, (_, i) => Math.sin(i / 13));
  const doc = { asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    buffers: [{ byteLength: values.byteLength }], bufferViews: [{ buffer: 0, byteLength: values.byteLength, target: 34962 }],
    accessors: [{ bufferView: 0, componentType: 5126, type: 'VEC3', count: 10000, min: [-1, -1, -1], max: [1, 1, 1] }],
    meshes: [{ primitives: [{ mode: 0, attributes: { POSITION: 0 } }] }] };
  const { output, stats } = await compressGLB(writeGLB(doc, Buffer.from(values.buffer)));
  assert(stats.compressedViews > 0);
  const gltf = await loadGLB('http://localhost/compressed.glb', { fetcher: async () => new Response(output), yieldControl: async () => {} });
  assert.deepEqual(gltf.scene.children[0].geometry.attributes.position.array, values);
});

function fixture() {
  const text = JSON.stringify({ asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [] }], nodes: [], extras: { note: 'Test asset '.repeat(1000) } });
  const json = Buffer.from(text.padEnd(Math.ceil(text.length / 4) * 4, ' '));
  const data = Buffer.alloc(20 + json.length);
  data.write('glTF'); data.writeUInt32LE(2, 4); data.writeUInt32LE(data.length, 8);
  data.writeUInt32LE(json.length, 12); data.writeUInt32LE(0x4e4f534a, 16); json.copy(data, 20);
  return data;
}
const file = fixture();
const url = 'http://localhost/model.glb';
function response(data = file, headers = {}, sizes = [5, 1, 8, 100, 1500]) {
  return new Response(new ReadableStream({ start(controller) {
    let offset = 0;
    for (const size of sizes) { controller.enqueue(new Uint8Array(data.subarray(offset, offset + size))); offset += size; }
    if (offset < data.length) controller.enqueue(new Uint8Array(data.subarray(offset)));
    controller.close();
  } }), { headers });
}

test('gzip delivery streams decode once, validate their CRC and keep progress within bounds', async () => {
  for (const bytes of [gzipSync(file), file]) {
    const events = [];
    const result = await downloadGLB(url + '.gz', { fetcher: async () => response(bytes, {}, [1, 1, 2, 5]), onProgress: event => events.push(event) });
    assert.deepEqual(Buffer.from(result), file);
    assert(events.every(event => event.percent === null || (event.percent >= 0 && event.percent <= 99)));
    assert.equal(events.at(-1).loaded, file.length);
  }
  const damaged = gzipSync(file); damaged[damaged.length - 8] ^= 1;
  await assert.rejects(downloadGLB(url + '.gz', { fetcher: async () => response(damaged) }));
  await assert.rejects(downloadGLB(url + '.gz', { fetcher: async () => response(gzipSync(file).subarray(0, 30)) }));
});

test('cancelling a gzip delivery also cancels its stalled compressed source', async () => {
  const abort = new AbortController(); let cancelled = false;
  const bytes = gzipSync(file);
  const loading = downloadGLB(url + '.gz', { signal: abort.signal, fetcher: async () => new Response(new ReadableStream({
    start(controller) { controller.enqueue(bytes.subarray(0, 30)); },
    cancel() { cancelled = true; },
  })) });
  await new Promise(resolve => setImmediate(resolve));
  abort.abort();
  await assert.rejects(loading, { name: 'AbortError' });
  assert(cancelled);
});

test('GLB progress uses decoded file length with compressed, absent or incorrect HTTP totals', async () => {
  for (const headers of [{}, { 'content-length': '42', 'content-encoding': 'gzip' }, { 'content-length': String(file.length / 1.2) }, { 'content-length': '999999' }]) {
    const events = [];
    const result = await downloadGLB(url, { fetcher: async () => response(file, headers), onProgress: event => events.push(event) });
    assert.deepEqual(new Uint8Array(result), new Uint8Array(file));
    const percentages = events.filter(event => event.percent !== null).map(event => event.percent);
    assert.ok(percentages.every(value => Number.isFinite(value) && value >= 0 && value < 100));
    assert.deepEqual(percentages, [...percentages].sort((a, b) => a - b));
    assert.equal(percentages.at(-1), 99);
    assert.equal(events.at(-1).total, file.length);
  }
});

test('truncated, oversized and non-GLB responses fail before model parsing', async () => {
  const malformed = [file.subarray(0, file.length - 1), Buffer.concat([file, Buffer.from('extra')]), Buffer.from('<html>Not a model</html>')];
  for (const data of malformed) {
    let parsed = false;
    await assert.rejects(loadGLB(url, { fetcher: async () => response(data, {}, [5, 1, 8]), decode: () => { parsed = true; }, yieldControl: async () => {} }));
    assert.equal(parsed, false);
  }
  await assert.rejects(downloadGLB(url, { fetcher: async () => new Response('missing', { status: 404 }) }), /404/);
});

test('decode is a distinct indeterminate stage and waits for the page before parsing a real GLB', async () => {
  const events = [];
  let painted = false;
  const result = await loadGLB(url, {
    fetcher: async () => response(), onProgress: event => events.push(event),
    yieldControl: async () => { assert.equal(events.at(-1).phase, 'decode'); assert.equal(events.at(-1).percent, null); painted = true; },
  });
  assert.ok(painted && result.scene.isGroup);
});

test('cancellation stops a stalled stream and prevents late decode results from escaping', async () => {
  const first = new AbortController();
  let cancelled = false;
  const stalled = downloadGLB(url, { signal: first.signal, fetcher: async () => new Response(new ReadableStream({ cancel() { cancelled = true; } })) });
  await new Promise(resolve => setImmediate(resolve));
  first.abort();
  await assert.rejects(stalled, { name: 'AbortError' });
  assert.ok(cancelled);

  const second = new AbortController();
  const root = new THREE.Group(); const geometry = new THREE.BoxGeometry(); const material = new THREE.MeshStandardMaterial();
  let geometryDisposed = 0, materialDisposed = 0;
  geometry.addEventListener('dispose', () => geometryDisposed++); material.addEventListener('dispose', () => materialDisposed++);
  root.add(new THREE.Mesh(geometry, material), new THREE.Mesh(geometry, material));
  await assert.rejects(loadGLB(url, { signal: second.signal, fetcher: async () => response(), yieldControl: async () => {}, decode: async () => {
    second.abort(); return { scene: root };
  } }), { name: 'AbortError' });
  assert.equal(geometryDisposed, 1); assert.equal(materialDisposed, 1);
});

test('static preparation preserves transforms, shares cached geometry bounds and excludes child elements from parent bounds', async () => {
  const geometry = new THREE.BoxGeometry(2, 2, 2);
  const root = new THREE.Group(); root.position.x = 5;
  const parent = new THREE.Mesh(geometry); const child = new THREE.Mesh(geometry); child.position.x = 20;
  parent.add(child); root.add(parent);
  const meshes = await prepareStaticModel(root, { yieldControl: async () => {} });
  assert.equal(meshes.length, 2);
  assert.equal(parent.userData.bounds.min.x, 4); assert.equal(parent.userData.bounds.max.x, 6);
  assert.equal(child.userData.bounds.min.x, 24); assert.equal(child.userData.bounds.max.x, 26);
  assert.ok(geometry.boundingBox && geometry.boundingSphere);
  assert.equal(child.matrixWorldAutoUpdate, false);
  const aborted = AbortSignal.abort();
  await assert.rejects(prepareStaticModel(root, { signal: aborted }), { name: 'AbortError' });
  await assert.rejects(collisionInput(meshes, aborted), { name: 'AbortError' });
});

test('multi-material BIM placements retain attributes, materials, transforms and shared geometry', async () => {
  const root = new THREE.Group(); root.position.y = 7;
  const geometries = [new THREE.BoxGeometry(), new THREE.BoxGeometry().translate(2, 0, 0)];
  const materials = [new THREE.MeshStandardMaterial(), new THREE.MeshStandardMaterial({ color: 'red' })];
  for (let i = 0; i < 2; i++) {
    const placement = new THREE.Group(); placement.position.x = i * 10;
    placement.userData = { viewer_id: `ceiling-${i}`, viewer_role: 'ceiling', viewer_floor_ids: ['principal'], viewer_dollhouse_hidden: true };
    geometries.forEach((geometry, index) => placement.add(new THREE.Mesh(geometry, materials[index])));
    root.add(placement);
  }
  root.updateMatrixWorld(true);
  const bounds = root.children.map(child => new THREE.Box3().setFromObject(child));
  const meshes = await prepareStaticModel(root, { yieldControl: async () => {} });
  assert.equal(meshes.length, 2);
  assert.equal(meshes[0].geometry, meshes[1].geometry);
  for (const [i, mesh] of meshes.entries()) {
    assert.equal(mesh.userData.viewer_id, `ceiling-${i}`);
    assert.equal(mesh.userData.viewer_role, 'ceiling');
    assert.deepEqual(mesh.userData.viewer_floor_ids, ['principal']);
    assert.equal(mesh.userData.viewer_dollhouse_hidden, true);
    assert.deepEqual(mesh.material, materials);
    assert(mesh.userData.bounds.equals(bounds[i]));
    assert.deepEqual(mesh.geometry.groups, [
      { start: 0, count: geometries[0].index.count, materialIndex: 0 },
      { start: geometries[0].index.count, count: geometries[1].index.count, materialIndex: 1 },
    ]);
    for (const name of Object.keys(geometries[0].attributes)) {
      assert.deepEqual(Array.from(mesh.geometry.attributes[name].array), geometries.flatMap(geometry => Array.from(geometry.attributes[name].array)));
    }
    const positions = geometries[0].attributes.position.count;
    assert.deepEqual(Array.from(mesh.geometry.index.array), [
      ...geometries[0].index.array, ...Array.from(geometries[1].index.array, index => index + positions),
    ]);
  }
});

test('unsupported material primitives keep their rendering and inherit placement metadata', async () => {
  for (const variant of ['glass', 'transform', 'hidden', 'attributes']) {
    const root = new THREE.Group(), placement = new THREE.Group(); root.add(placement);
    placement.userData = { viewer_id: variant, viewer_role: 'ceiling', viewer_floor_ids: ['principal'] };
    const first = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshPhysicalMaterial());
    const second = first.clone(); second.geometry = first.geometry.clone(); second.material = first.material.clone();
    if (variant === 'glass') second.material.transmission = 0.8;
    if (variant === 'transform') second.position.x = 4;
    if (variant === 'hidden') second.visible = false;
    if (variant === 'attributes') second.geometry.deleteAttribute('uv');
    placement.add(first, second);
    const meshes = await prepareStaticModel(root, { yieldControl: async () => {} });
    assert.deepEqual(meshes, [first, second]);
    assert.equal(root.children[0], placement);
    assert.equal(second.position.x, variant === 'transform' ? 4 : 0);
    assert.equal(second.visible, variant !== 'hidden');
    assert.equal(second.material.transmission, variant === 'glass' ? 0.8 : 0);
    for (const mesh of meshes) {
      assert.equal(mesh.userData.viewer_id, variant);
      assert.equal(mesh.userData.viewer_role, 'ceiling');
      assert.deepEqual(mesh.userData.viewer_floor_ids, ['principal']);
    }
  }
});
