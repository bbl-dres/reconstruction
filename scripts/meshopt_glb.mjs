// Lossless buffer-view compression. No scene rewriting, quantization or merging.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { MeshoptEncoder } from './vendor/meshoptimizer/meshopt_encoder.mjs';
import { MeshoptDecoder } from '../public/vendor/meshoptimizer/meshopt_decoder.mjs';

const EXT = 'EXT_meshopt_compression';
const align4 = n => (n + 3) & ~3;
const components = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
const sizes = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };

export function readGLB(bytes) {
  assert(bytes.length >= 28 && bytes.readUInt32LE(0) === 0x46546c67 && bytes.readUInt32LE(4) === 2, 'Expected GLB 2');
  assert.equal(bytes.readUInt32LE(8), bytes.length, 'GLB length mismatch');
  const jsonLength = bytes.readUInt32LE(12), binaryHeader = 20 + jsonLength;
  assert.equal(bytes.readUInt32LE(16), 0x4e4f534a);
  assert(binaryHeader + 8 <= bytes.length, 'Missing binary chunk');
  assert.equal(bytes.readUInt32LE(binaryHeader + 4), 0x004e4942);
  assert.equal(binaryHeader + 8 + bytes.readUInt32LE(binaryHeader), bytes.length, 'Unexpected GLB chunks');
  const doc = JSON.parse(bytes.subarray(20, binaryHeader));
  return { doc, binary: bytes.subarray(binaryHeader + 8) };
}

export function writeGLB(doc, binary) {
  const json = Buffer.from(JSON.stringify(doc)), jsonLength = align4(json.length), binaryLength = align4(binary.length);
  const output = Buffer.alloc(28 + jsonLength + binaryLength);
  output.writeUInt32LE(0x46546c67, 0); output.writeUInt32LE(2, 4); output.writeUInt32LE(output.length, 8);
  output.writeUInt32LE(jsonLength, 12); output.writeUInt32LE(0x4e4f534a, 16);
  output.fill(32, 20, 20 + jsonLength); json.copy(output, 20);
  output.writeUInt32LE(binaryLength, 20 + jsonLength); output.writeUInt32LE(0x004e4942, 24 + jsonLength);
  binary.copy(output, 28 + jsonLength);
  return output;
}

export async function compressGLB(input, { maxBytes = Infinity, preferFileSize = false } = {}) {
  await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
  const { doc: original, binary } = readGLB(input), doc = structuredClone(original);
  assert.equal(doc.buffers?.length, 1, 'Expected one embedded buffer');
  assert(!doc.buffers[0].uri && !doc.buffers[0].extensions, 'External/extended buffers are unsupported');
  assert(doc.buffers[0].byteLength <= binary.length);
  assert(!doc.extensionsUsed?.some(name => /meshopt_compression/.test(name)), 'Already compressed; use the original export');
  const users = new Map(), images = new Set((doc.images || []).map(image => image.bufferView));
  for (const accessor of doc.accessors || []) {
    if (accessor.bufferView !== undefined) {
      if (!users.has(accessor.bufferView)) users.set(accessor.bufferView, []);
      users.get(accessor.bufferView).push(accessor);
    }
  }
  // Sparse and matrix layouts are retained verbatim, as are image payloads.
  const sparseViews = new Set((doc.accessors || []).flatMap(a => a.sparse ? [a.sparse.indices.bufferView, a.sparse.values.bufferView] : []));
  let offset = 0, fallbackLength = 0, compressedViews = 0;
  const chunks = [];
  for (const [index, view] of (doc.bufferViews || []).entries()) {
    assert.equal(view.buffer, 0);
    const start = view.byteOffset || 0, length = view.byteLength;
    assert(Number.isSafeInteger(start) && start >= 0 && Number.isSafeInteger(length) && length > 0 && start + length <= doc.buffers[0].byteLength, 'Invalid buffer view');
    const raw = binary.subarray(start, start + length), accessors = users.get(index) || [];
    let stride, mode, encoded;
    if (accessors.length && !images.has(index) && !sparseViews.has(index) && !view.extensions) {
      const scalarIndices = view.target === 34963 && accessors.every(a => a.type === 'SCALAR' && [5123, 5125].includes(a.componentType));
      stride = scalarIndices ? sizes[accessors[0].componentType] : view.byteStride;
      if (!stride && accessors.length === 1 && !accessors[0].byteOffset) stride = components[accessors[0].type] * sizes[accessors[0].componentType];
      mode = scalarIndices ? 'INDICES' : 'ATTRIBUTES';
      const validStride = scalarIndices ? accessors.every(a => sizes[a.componentType] === stride) : stride >= 4 && stride <= 256 && stride % 4 === 0;
      if (validStride && length % stride === 0) {
        // Explicit v0 is compatible with EXT_meshopt_compression. INDICES keeps
        // triangle order byte-exact; TRIANGLES can rotate equivalent indices.
        encoded = Buffer.from(MeshoptEncoder.encodeGltfBuffer(raw, length / stride, stride, mode, 0));
        if (encoded.length + 192 >= length) encoded = undefined;
        // Some repetitive float/index streams gzip better before Meshopt. Keep
        // those raw, accounting for the extension's compressed JSON overhead.
        if (!preferFileSize && encoded && gzipSync(encoded, { level: 6 }).length + 128 >= gzipSync(raw, { level: 6 }).length) encoded = undefined;
      }
    }
    const payload = encoded || raw;
    if (encoded) {
      view.buffer = 1; view.byteOffset = fallbackLength;
      view.extensions = { [EXT]: { buffer: 0, byteOffset: offset, byteLength: encoded.length, byteStride: stride, count: length / stride, mode } };
      fallbackLength = align4(fallbackLength + length);
      compressedViews++;
    } else { view.buffer = 0; view.byteOffset = offset; }
    chunks.push(payload, Buffer.alloc(align4(payload.length) - payload.length));
    offset += align4(payload.length);
  }
  doc.buffers[0].byteLength = offset;
  if (compressedViews) {
    doc.buffers.push({ byteLength: fallbackLength, extensions: { [EXT]: { fallback: true } } });
    doc.extensionsUsed = [...(doc.extensionsUsed || []), EXT];
    doc.extensionsRequired = [...(doc.extensionsRequired || []), EXT];
  }
  const output = writeGLB(doc, Buffer.concat(chunks));
  // A stream that gzips well can still make the standalone GLB too large for
  // hosting. Retry with smaller buffer views, retaining exactly the same bytes
  // after decoding. Prefer transfer size whenever it fits the storage budget.
  if (output.length > maxBytes && !preferFileSize) return compressGLB(input, { maxBytes, preferFileSize: true });
  // Verify the serialized artifact, including every image and uncompressed view.
  // All non-storage JSON (IDs, families, placements, materials, etc.) is exact.
  const actual = readGLB(output);
  for (const [i, view] of actual.doc.bufferViews.entries()) {
    const source = original.bufferViews[i], ext = view.extensions?.[EXT];
    let decoded;
    if (ext) {
      decoded = Buffer.alloc(view.byteLength);
      MeshoptDecoder.decodeGltfBuffer(decoded, ext.count, ext.byteStride, actual.binary.subarray(ext.byteOffset, ext.byteOffset + ext.byteLength), ext.mode);
    } else decoded = actual.binary.subarray(view.byteOffset, view.byteOffset + view.byteLength);
    assert(decoded.equals(binary.subarray(source.byteOffset || 0, (source.byteOffset || 0) + source.byteLength)), `View ${i} changed`);
  }
  const semantic = object => Object.fromEntries(Object.entries(object).filter(([key]) => !['buffers', 'bufferViews', 'extensionsUsed', 'extensionsRequired'].includes(key)));
  assert.deepEqual(semantic(actual.doc), semantic(original));
  return { output, stats: { compressedViews, verifiedViews: doc.bufferViews.length, lossless: true, storageStrategy: preferFileSize ? 'file-size' : 'transfer-size', originalBytes: input.length, bytes: output.length } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 4) throw new Error('Usage: node scripts/meshopt_glb.mjs input.glb output.glb');
  const { output, stats } = await compressGLB(await readFile(process.argv[2]));
  await writeFile(process.argv[3], output);
  console.log(JSON.stringify(stats));
}
