import { BatchedMesh, Group, Matrix4 } from 'three';
import { ELEMENT_LAYER, batchable } from './render-instances.js?v=sync-3';
import { isShown } from './scene-utils.js?v=1';

// Opt-in render batching (?batch=1): one BatchedMesh per material and vertex layout for the static
// opaque meshes, whether or not their geometry repeats. A batch draws all of its visible elements with
// one multi-draw call, where render instances need three repeats of one geometry in one 24 m cell.
// As with render instances, the source meshes keep their IDs, metadata, bounds and hierarchy, stay on
// the element layer for picking, and remain the authority for collisions and the selection highlight.
// Their geometry is copied into the batch.
const layout = geometry => Object.keys(geometry.attributes).sort().map(name => {
  const attribute = geometry.attributes[name];
  return `${name}:${attribute.itemSize}:${attribute.normalized ? 'n' : ''}:${attribute.array.constructor.name}`;
}).join(',') + (geometry.index ? '|indexed' : '');

export function createRenderBatches(meshes, parent, { minimum = 2 } = {}) {
  const groups = new Map();
  for (const mesh of meshes) {
    if (!batchable(mesh) || Array.isArray(mesh.material)) continue;
    const key = [mesh.material.uuid, layout(mesh.geometry), mesh.castShadow, mesh.receiveShadow, mesh.renderOrder, mesh.frustumCulled].join('|');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(mesh);
  }
  const root = new Group(); root.name = 'Static render batches';
  parent.add(root); parent.updateWorldMatrix(true, false);
  const inverse = new Matrix4().copy(parent.matrixWorld).invert();
  const matrix = new Matrix4();
  // Each batch draws with its own copy of the material. A material shared by a batch and an ordinary
  // mesh would switch shader variants (batched or not) on every frame, recomputing its parameters.
  const copies = new Map();
  const copyOf = material => {
    let copy = copies.get(material);
    if (!copy) {
      copy = material.clone();
      // The same planes: Floor plan moves them for a batch and its sources alike.
      copy.clippingPlanes = material.clippingPlanes;
      copies.set(material, copy);
    }
    return copy;
  };
  const entries = [], owners = new Map();
  let disposed = false;
  for (const list of groups.values()) {
    if (list.length < minimum) continue;
    const source = list[0];
    const geometries = [...new Set(list.map(mesh => mesh.geometry))];
    let vertices = 0, indices = 0;
    for (const geometry of geometries) { vertices += geometry.attributes.position.count; indices += geometry.index?.count ?? 0; }
    const batch = new BatchedMesh(list.length, vertices, indices, copyOf(source.material));
    batch.name = `Batch: ${source.material.name || source.name}`;
    const geometryIds = new Map(geometries.map(geometry => [geometry, batch.addGeometry(geometry)]));
    const ids = list.map(mesh => {
      const id = batch.addInstance(geometryIds.get(mesh.geometry));
      batch.setMatrixAt(id, matrix.multiplyMatrices(inverse, mesh.matrixWorld));
      return id;
    });
    Object.assign(batch, { castShadow: source.castShadow, receiveShadow: source.receiveShadow, renderOrder: source.renderOrder, frustumCulled: source.frustumCulled });
    batch.matrixAutoUpdate = false;
    // Opaque elements: no per-frame depth sort. Elements outside the view are still skipped.
    batch.sortObjects = false;
    batch.raycast = () => {}; // Pick the semantic source node, never a render proxy.
    batch.computeBoundingBox(); batch.computeBoundingSphere();
    root.add(batch);
    const entry = { batch, members: list, ids, base: source.material, material: source.material, drawn: list.map(() => true) };
    entries.push(entry);
    for (const mesh of list) { owners.set(mesh, entry); mesh.layers.set(ELEMENT_LAYER); }
  }

  // Mirrors the sources' visibility. The batch draws with the material most of its shown members
  // use; a member whose material differs (Floor plan's uncut furniture, for instance) is drawn as its
  // own mesh meanwhile. The muted surroundings swap every member's material, and the batch follows.
  function sync() {
    if (disposed) return;
    for (const entry of entries) {
      const { batch, members, ids, drawn } = entry;
      const shown = members.map(isShown);
      const counts = new Map();
      members.forEach((mesh, i) => { if (shown[i]) counts.set(mesh.material, (counts.get(mesh.material) || 0) + 1); });
      let material = counts.has(entry.base) ? entry.base : null;
      for (const [candidate, count] of counts) if (!material || count > counts.get(material)) material = candidate;
      if (material) entry.material = material;
      batch.material = copyOf(entry.material);
      let any = false;
      members.forEach((mesh, i) => {
        const draw = shown[i] && mesh.material === entry.material;
        if (draw !== drawn[i]) { batch.setVisibleAt(ids[i], draw); drawn[i] = draw; }
        any ||= draw;
        mesh.layers.set(shown[i] && !draw ? 0 : ELEMENT_LAYER);
      });
      batch.visible = any;
    }
  }
  sync();
  return {
    root, batches: entries.map(entry => entry.batch), placements: owners.size,
    // The batches' material copies, for changes that need every program refreshed (shadows).
    get materials() { return [...copies.values()]; },
    sync,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const mesh of owners.keys()) mesh.layers.set(0);
      for (const { batch } of entries) batch.dispose();
      for (const copy of copies.values()) copy.dispose();
      root.removeFromParent();
      // Source geometry, materials and textures belong to the source asset.
    },
  };
}
