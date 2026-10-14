// Static structure of published GLBs: what the viewer has to download, decode, upload and draw.
// Read-only; no dependencies beyond Node. From the repository root:
//   node viewer/perf/glb-stats.mjs                      (every catalog's building + surroundings)
//   node viewer/perf/glb-stats.mjs path/to/a.glb[.gz]   (specific files)
// Prints one JSON object per file; --summary prints a compact table instead.
import { readFile, stat, readdir } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';

const args = process.argv.slice(2);
const summary = args.includes('--summary');
let files = args.filter(arg => !arg.startsWith('--'));
if (!files.length) {
  for (const id of await readdir('reconstructions')) {
    let catalog;
    try { catalog = JSON.parse(await readFile(`reconstructions/${id}/public/models/catalog.json`, 'utf8')); } catch { continue; }
    const model = catalog.models.find(entry => entry.id === catalog.default) || catalog.models[0];
    for (const key of ['building', 'surroundings']) if (model[key]) files.push(path.join(`reconstructions/${id}/public/models`, model[key]));
  }
}

const COMPONENT_BYTES = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const TYPE_SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const percentile = (sorted, p) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : 0;

function imageSize(bytes) {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset < bytes.length) {
      if (bytes[offset] !== 0xff) { offset++; continue; }
      const marker = bytes[offset + 1];
      const length = bytes.readUInt16BE(offset + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return [bytes.readUInt16BE(offset + 7), bytes.readUInt16BE(offset + 5)];
      offset += 2 + length;
    }
  }
  return [0, 0];
}

async function analyse(file) {
  const raw = await readFile(file);
  const bytes = raw[0] === 0x1f && raw[1] === 0x8b ? gunzipSync(raw) : raw;
  const jsonLength = bytes.readUInt32LE(12);
  const doc = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
  const binStart = 20 + jsonLength + 8;
  const binLength = bytes.length - binStart;
  const accessors = doc.accessors || [], views = doc.bufferViews || [];
  const accessorBytes = index => {
    const a = accessors[index];
    return a ? a.count * TYPE_SIZE[a.type] * COMPONENT_BYTES[a.componentType] : 0;
  };
  // Buffer views: images versus geometry, compressed versus stored.
  const imageViews = new Set((doc.images || []).map(image => image.bufferView).filter(v => v !== undefined));
  let meshoptViews = 0, meshoptStored = 0, meshoptDecoded = 0, imageBytes = 0, geometryStored = 0;
  views.forEach((view, i) => {
    const ext = view.extensions?.EXT_meshopt_compression;
    if (imageViews.has(i)) { imageBytes += view.byteLength; return; }
    if (ext) { meshoptViews++; meshoptStored += ext.byteLength; meshoptDecoded += view.byteLength; }
    else geometryStored += view.byteLength;
  });
  // Images.
  const images = (doc.images || []).map(image => {
    const view = views[image.bufferView];
    const data = bytes.subarray(binStart + (view.byteOffset || 0), binStart + (view.byteOffset || 0) + view.byteLength);
    const [width, height] = imageSize(data);
    return { name: image.name, mimeType: image.mimeType, bytes: view.byteLength, width, height };
  });
  const textureUse = new Map();
  for (const material of doc.materials || []) {
    const refs = [];
    const visit = value => {
      if (!value || typeof value !== 'object') return;
      if (Number.isInteger(value.index) && Object.keys(value).every(key => ['index', 'texCoord', 'scale', 'strength', 'extensions'].includes(key))) refs.push(value.index);
      for (const child of Object.values(value)) visit(child);
    };
    visit({ ...material, extras: undefined });
    for (const ref of refs) textureUse.set(ref, (textureUse.get(ref) || 0) + 1);
  }
  const usedImages = new Set([...textureUse.keys()].map(t => doc.textures[t]?.source));
  // RGBA8 with a full mip chain: 4/3 of the base level.
  const gpuTextureBytes = images.filter((_, i) => usedImages.has(i)).reduce((sum, image) => sum + image.width * image.height * 4 * 4 / 3, 0);
  // Materials.
  const materials = doc.materials || [];
  const matInfo = materials.map(m => ({
    name: m.name,
    blend: m.alphaMode === 'BLEND', mask: m.alphaMode === 'MASK', doubleSided: Boolean(m.doubleSided),
    transmission: (m.extensions?.KHR_materials_transmission?.transmissionFactor || 0) > 0 || Boolean(m.extensions?.KHR_materials_transmission?.transmissionTexture),
    textured: JSON.stringify(m).includes('"index"'),
    extensions: Object.keys(m.extensions || {}),
  }));
  // Meshes and nodes.
  const meshes = doc.meshes || [];
  const meshTriangles = meshes.map(mesh => mesh.primitives.reduce((sum, p) => {
    const count = p.indices !== undefined ? accessors[p.indices].count : accessors[p.attributes.POSITION].count;
    return sum + ((p.mode ?? 4) === 4 ? count / 3 : 0);
  }, 0));
  const meshGpuBytes = meshes.map(mesh => mesh.primitives.reduce((sum, p) => sum
    + Object.values(p.attributes).reduce((s, a) => s + accessorBytes(a), 0) + (p.indices !== undefined ? accessorBytes(p.indices) : 0), 0));
  const meshVertices = meshes.map(mesh => mesh.primitives.reduce((sum, p) => sum + accessors[p.attributes.POSITION].count, 0));
  const nodes = doc.nodes || [];
  const meshNodes = nodes.filter(node => node.mesh !== undefined);
  const uses = new Map();
  for (const node of meshNodes) uses.set(node.mesh, (uses.get(node.mesh) || 0) + 1);
  const usesHistogram = {};
  for (const count of uses.values()) { const bucket = count === 1 ? '1' : count === 2 ? '2' : count < 10 ? '3-9' : count < 100 ? '10-99' : '100+'; usesHistogram[bucket] = (usesHistogram[bucket] || 0) + 1; }
  const nodesOnSharedMeshes = meshNodes.filter(node => uses.get(node.mesh) >= 3).length;
  const nodeTriangles = meshNodes.map(node => meshTriangles[node.mesh]).sort((a, b) => a - b);
  const totalTriangles = nodeTriangles.reduce((a, b) => a + b, 0);
  const uniqueTriangles = [...uses.keys()].reduce((sum, mesh) => sum + meshTriangles[mesh], 0);
  const uniqueGeometryBytes = [...uses.keys()].reduce((sum, mesh) => sum + meshGpuBytes[mesh], 0);
  const uniqueVertices = [...uses.keys()].reduce((sum, mesh) => sum + meshVertices[mesh], 0);
  // Draw calls if every node draws one call per primitive (no culling, no batching).
  const primitivesPerNode = meshNodes.reduce((sum, node) => sum + meshes[node.mesh].primitives.length, 0);
  // Per material: primitives across nodes, and triangles.
  const perMaterial = new Map();
  for (const node of meshNodes) for (const p of meshes[node.mesh].primitives) {
    const key = p.material ?? -1;
    const entry = perMaterial.get(key) || { primitives: 0, triangles: 0 };
    entry.primitives++;
    entry.triangles += (p.indices !== undefined ? accessors[p.indices].count : accessors[p.attributes.POSITION].count) / 3;
    perMaterial.set(key, entry);
  }
  const transmissionPrimitives = [...perMaterial].filter(([m]) => matInfo[m]?.transmission).reduce((s, [, e]) => s + e.primitives, 0);
  const blendPrimitives = [...perMaterial].filter(([m]) => matInfo[m]?.blend).reduce((s, [, e]) => s + e.primitives, 0);
  // Attribute formats.
  const formats = new Map();
  for (const mesh of meshes) for (const p of mesh.primitives) for (const [name, a] of Object.entries(p.attributes)) {
    const key = `${name}:${accessors[a].componentType}${accessors[a].normalized ? 'n' : ''}`;
    formats.set(key, (formats.get(key) || 0) + 1);
  }
  // Roles and scopes from viewer extras.
  const count = (list, pick) => { const result = {}; for (const item of list) { const value = String(pick(item)); result[value] = (result[value] || 0) + 1; } return result; };
  const heaviest = meshNodes.map(node => ({ name: node.extras?.viewer_source_name || node.name, triangles: meshTriangles[node.mesh], instances: uses.get(node.mesh), role: node.extras?.viewer_role }))
    .sort((a, b) => b.triangles - a.triangles);
  const seen = new Set();
  const top = heaviest.filter(entry => !seen.has(entry.name) && seen.add(entry.name)).slice(0, 12);
  // Triangle share of the heaviest 1 % / 5 % of nodes.
  const shareOfTop = fraction => nodeTriangles.slice(-Math.ceil(nodeTriangles.length * fraction)).reduce((a, b) => a + b, 0) / Math.max(1, totalTriangles);
  const fileStat = await stat(file);
  return {
    file: file.replaceAll('\\', '/'),
    transferBytes: fileStat.size, glbBytes: bytes.length, jsonBytes: jsonLength, binBytes: binLength,
    bin: { imageBytes, meshoptViews, meshoptStoredBytes: meshoptStored, meshoptDecodedBytes: meshoptDecoded, uncompressedGeometryBytes: geometryStored },
    nodes: nodes.length, meshNodes: meshNodes.length, meshes: meshes.length, accessors: accessors.length, bufferViews: views.length,
    primitivesAcrossNodes: primitivesPerNode,
    meshReuse: { histogram: usesHistogram, nodesOnMeshesUsed3OrMore: nodesOnSharedMeshes },
    triangles: { acrossNodes: totalTriangles, unique: uniqueTriangles, perNode: { p50: percentile(nodeTriangles, 0.5), p90: percentile(nodeTriangles, 0.9), p99: percentile(nodeTriangles, 0.99), max: nodeTriangles.at(-1) },
      nodesUnder100: nodeTriangles.filter(t => t < 100).length, nodesUnder1000: nodeTriangles.filter(t => t < 1000).length,
      shareOfHeaviest1Percent: +shareOfTop(0.01).toFixed(3), shareOfHeaviest5Percent: +shareOfTop(0.05).toFixed(3) },
    geometryGpuBytesUnique: uniqueGeometryBytes, verticesUnique: uniqueVertices,
    attributeFormats: Object.fromEntries(formats),
    materials: { count: materials.length, used: perMaterial.size, blend: matInfo.filter(m => m.blend).length, mask: matInfo.filter(m => m.mask).length,
      transmission: matInfo.filter(m => m.transmission).length, doubleSided: matInfo.filter(m => m.doubleSided).length, textured: matInfo.filter(m => m.textured).length,
      transmissionPrimitives, blendPrimitives,
      primitivesPerMaterial: { p50: percentile([...perMaterial.values()].map(e => e.primitives).sort((a, b) => a - b), 0.5), max: Math.max(...[...perMaterial.values()].map(e => e.primitives)) } },
    images: { count: images.length, used: usedImages.size, bytes: imageBytes, mime: count(images, i => i.mimeType),
      sizes: count(images, i => `${i.width}x${i.height}`), gpuBytesRGBA8Mipmapped: Math.round(gpuTextureBytes) },
    extras: {
      roles: count(meshNodes, n => n.extras?.viewer_role ?? '-'),
      cutawayRoles: count(meshNodes, n => n.extras?.viewer_cutaway_role ?? '-'),
      modelScope: count(meshNodes, n => n.extras?.viewer_model_scope ?? '-'),
      dollhouseHidden: meshNodes.filter(n => n.extras?.viewer_dollhouse_hidden).length,
      averageExtrasBytesPerNode: Math.round(meshNodes.reduce((s, n) => s + JSON.stringify(n.extras || {}).length, 0) / Math.max(1, meshNodes.length)),
    },
    heaviestMeshes: top,
  };
}

const results = [];
for (const file of files) results.push(await analyse(file));
if (summary) {
  const mb = n => (n / 1e6).toFixed(1);
  console.log('file | transfer MB | GLB MB | JSON MB | images MB | mesh nodes | meshes | triangles (nodes) | unique tris | GPU geom MB | GPU tex MB | materials (transm./blend)');
  for (const r of results) console.log([path.basename(path.dirname(r.file)) + '/' + path.basename(r.file).split('-')[0], mb(r.transferBytes), mb(r.glbBytes), mb(r.jsonBytes), mb(r.images.bytes), r.meshNodes, r.meshes,
    Math.round(r.triangles.acrossNodes), Math.round(r.triangles.unique), mb(r.geometryGpuBytesUnique), mb(r.images.gpuBytesRGBA8Mipmapped), `${r.materials.count} (${r.materials.transmission}/${r.materials.blend})`].join(' | '));
} else console.log(JSON.stringify(results, null, 1));
