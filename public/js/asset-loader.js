import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Box3 } from 'three';
import { meshoptDecoderReady } from './meshopt-decoder.js';
import { normalizeModelPrimitives } from './model-primitives.js';

// Let updated status text paint before parsing or preparing a large asset.
export function paintOpportunity(signal) {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    let frame, timer;
    const cleanup = () => { if (frame !== undefined) cancelAnimationFrame(frame); clearTimeout(timer); signal?.removeEventListener('abort', abort); };
    const done = () => { cleanup(); resolve(); };
    const abort = () => { cleanup(); reject(signal.reason); };
    signal?.addEventListener('abort', abort, { once: true });
    if (typeof requestAnimationFrame === 'function' && !document.hidden) frame = requestAnimationFrame(() => { timer = setTimeout(done, 0); });
    else timer = setTimeout(done, 0);
  });
}

export function disposeAsset(root) {
  const geometries = new Set(), materials = new Set(), textures = new Set(), images = new Set();
  root?.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) if (material) materials.add(material);
  });
  for (const material of materials) for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
  for (const texture of textures) if (texture.source?.data) images.add(texture.source.data);
  geometries.forEach(value => value.dispose()); materials.forEach(value => value.dispose()); textures.forEach(value => value.dispose());
  images.forEach(value => value.close?.());
  root?.removeFromParent();
}

// Fetch decodes Content-Encoding before exposing chunks. The GLB header declares
// the decoded file length, so compressed/missing/wrong HTTP totals cannot inflate
// percentages. Allocate one output buffer, and validate EOF before decoding.
export async function downloadGLB(url, { signal, onProgress = () => {}, fetcher = fetch } = {}) {
  signal?.throwIfAborted();
  onProgress({ phase: 'download', loaded: 0, total: null, percent: null });
  const response = await fetcher(url, { signal });
  if (!response.ok) throw new Error(`Model request failed (${response.status}). Check that this version has been imported.`);
  let reader = (response.body || new Blob([await response.arrayBuffer()]).stream()).getReader();
  let upstream;
  const abortRead = () => {
    upstream?.cancel(signal.reason).catch(() => {});
    reader?.cancel(signal.reason).catch(() => {});
  };
  signal?.addEventListener('abort', abortRead, { once: true });
  const header = new Uint8Array(12);
  let headerBytes = 0, loaded = 0, output, total, lastPercent = null;
  function consume(chunk) {
    signal?.throwIfAborted();
    if (!output) {
      const copied = Math.min(12 - headerBytes, chunk.length);
      header.set(chunk.subarray(0, copied), headerBytes);
      headerBytes += copied;
      if (headerBytes === 12) {
        const view = new DataView(header.buffer);
        total = view.getUint32(8, true);
        if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 || total < 20 || total % 4) throw new Error('This file is not a valid GLB 2 model. Re-export it from Blender.');
        output = new Uint8Array(total);
        output.set(header.subarray(0, loaded));
      }
    }
    if (output) {
      if (loaded + chunk.length > total) throw new Error('The model contains more data than its GLB header declares. Re-export this version.');
      output.set(chunk, loaded);
    }
    loaded += chunk.length;
    const percent = total ? Math.min(99, Math.floor(loaded / total * 100)) : null;
    if (percent !== lastPercent) {
      onProgress({ phase: 'download', loaded, total, percent });
      lastPercent = percent;
    }
  }
  try {
    if (reader) {
      // GitHub Pages can serve large models as .glb.gz without Content-Encoding.
      // Sniff the actual bytes: fetch may already have decoded HTTP gzip.
      const prefix = [], signature = [];
      while (signature.length < 2) {
        signal?.throwIfAborted();
        const { done, value } = await reader.read();
        if (done) break;
        prefix.push(value);
        for (const byte of value.subarray(0, 2 - signature.length)) signature.push(byte);
      }
      if (signature[0] === 0x1f && signature[1] === 0x8b) {
        upstream = reader;
        const replay = new ReadableStream({
          start(controller) { prefix.forEach(chunk => controller.enqueue(chunk)); },
          async pull(controller) {
            const { done, value } = await upstream.read();
            if (done) controller.close(); else controller.enqueue(value);
          },
          cancel(reason) { return upstream.cancel(reason); },
        });
        reader = replay.pipeThrough(new DecompressionStream('gzip')).getReader();
      } else prefix.forEach(consume);
      while (true) {
        signal?.throwIfAborted();
        const { done, value } = await reader.read();
        if (done) break;
        consume(value);
      }
    } else consume(new Uint8Array(await response.arrayBuffer()));
    signal?.throwIfAborted();
    if (!output || loaded !== total) throw new Error('The model download is incomplete. Check the local server and try again.');
    return output.buffer;
  } catch (error) {
    try { await upstream?.cancel(error); } catch { /* Preserve the original error. */ }
    try { await reader?.cancel(error); } catch { /* Preserve the original error. */ }
    throw error;
  } finally { signal?.removeEventListener('abort', abortRead); reader?.releaseLock(); upstream?.releaseLock(); }
}

export async function loadGLB(url, { signal, onProgress = () => {}, fetcher, decode, yieldControl = paintOpportunity } = {}) {
  const decoder = decode ? null : await meshoptDecoderReady;
  signal?.throwIfAborted();
  const buffer = await downloadGLB(url, { signal, onProgress, fetcher });
  onProgress({ phase: 'decode', percent: null });
  await yieldControl(signal);
  signal?.throwIfAborted();
  const gltf = await (decode || ((data, path) => new GLTFLoader().setMeshoptDecoder(decoder).parseAsync(data, path)))(buffer, new URL('.', url).href);
  if (signal?.aborted) { disposeAsset(gltf.scene); signal.throwIfAborted(); }
  return gltf;
}

export async function prepareStaticModel(root, { signal, onMesh = () => {}, yieldControl = paintOpportunity } = {}) {
  signal?.throwIfAborted();
  normalizeModelPrimitives(root);
  root.updateMatrixWorld(true);
  const meshes = [];
  root.traverse(object => {
    object.matrixAutoUpdate = false; object.matrixWorldAutoUpdate = false;
    if (object.isMesh) meshes.push(object);
  });
  let yieldedAt = performance.now();
  for (const mesh of meshes) {
    signal?.throwIfAborted();
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
    // An element's bounds must not include children belonging to other elements.
    mesh.userData.bounds = new Box3().copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld);
    mesh.castShadow = mesh.receiveShadow = true;
    onMesh(mesh);
    if (performance.now() - yieldedAt >= 8) { await yieldControl(signal); yieldedAt = performance.now(); }
  }
  signal?.throwIfAborted();
  return meshes;
}
