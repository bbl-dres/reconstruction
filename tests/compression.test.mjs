import test from 'node:test';
import assert from 'node:assert/strict';
import { compressGLB, readGLB, writeGLB } from '../scripts/meshopt_glb.mjs';

function fixture() {
  const floats = new Float32Array(30000);
  for (let i = 0; i < floats.length; i++) floats[i] = Math.sin(i / 13) * 500;
  const data = Buffer.from(floats.buffer), image = Buffer.from('embedded-image-exact');
  const doc = { asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0, 1] }],
    nodes: [{ mesh: 0, extras: { viewer_id: 'chair-1', viewer_family_id: 'chair' } }, { mesh: 0, translation: [1, 2, 3], extras: { viewer_id: 'chair-2' } }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }], images: [{ bufferView: 1, mimeType: 'image/png' }],
    buffers: [{ byteLength: data.length + image.length }],
    bufferViews: [{ buffer: 0, byteLength: data.length, target: 34962 }, { buffer: 0, byteOffset: data.length, byteLength: image.length }],
    accessors: [{ bufferView: 0, componentType: 5126, count: floats.length / 3, type: 'VEC3' }],
    extras: { note: 'Preserve arbitrary authored metadata' } };
  return writeGLB(doc, Buffer.concat([data, image]));
}

test('lossless compression preserves placements, shared geometry and images with a required decoder', async () => {
  const input = fixture(), { output, stats } = await compressGLB(input);
  assert(stats.compressedViews > 0);
  assert(output.length < input.length);
  const before = readGLB(input).doc, after = readGLB(output).doc;
  for (const key of ['nodes', 'meshes', 'accessors', 'images', 'extras']) assert.deepEqual(after[key], before[key]);
  assert(after.extensionsRequired.includes('EXT_meshopt_compression'));
  assert.equal(after.buffers[1].extensions.EXT_meshopt_compression.fallback, true);
  await assert.rejects(compressGLB(output), /one embedded buffer|Already compressed/);
});

test('malformed input fails before an output can be published', async () => {
  const input = fixture();
  await assert.rejects(compressGLB(input.subarray(0, input.length - 4)), /length mismatch/);
  const { doc, binary } = readGLB(input);
  doc.bufferViews[0].byteLength = binary.length * 2;
  await assert.rejects(compressGLB(writeGLB(doc, binary)), /Invalid buffer view/);
});

test('a file-size budget compresses repetitive geometry without losing images or BIM identity', async () => {
  const { doc, binary } = readGLB(fixture());
  binary.fill(0, 0, doc.bufferViews[0].byteLength);
  const input = writeGLB(doc, binary);
  const preferred = await compressGLB(input);
  assert.equal(preferred.stats.storageStrategy, 'transfer-size');
  assert(preferred.output.length > 20000, 'Highly repetitive raw streams are cheaper over gzip');
  const packed = await compressGLB(input, { maxBytes: 20000 });
  assert.equal(packed.stats.storageStrategy, 'file-size');
  assert(packed.output.length < 20000);
  assert(packed.stats.compressedViews > 0);
  for (const key of ['nodes', 'meshes', 'accessors', 'images', 'extras']) assert.deepEqual(readGLB(packed.output).doc[key], doc[key]);
  assert.equal(packed.stats.verifiedViews, doc.bufferViews.length);
});
