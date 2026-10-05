import { Group, InstancedMesh, Matrix4, Vector3 } from 'three';

export const ELEMENT_LAYER = 1;
const materials = mesh => Array.isArray(mesh.material) ? mesh.material : [mesh.material];
const opaque = mesh => materials(mesh).every(m => m && !m.transparent && !m.transmission && !m.isShaderMaterial);
const visible = mesh => {
  for (let node = mesh; node; node = node.parent) if (!node.visible) return false;
  return true;
};

function supported(mesh) {
  if (!mesh.isMesh || mesh.isInstancedMesh || mesh.isSkinnedMesh || mesh.morphTargetInfluences?.length
    || mesh.layers.mask !== 1 || mesh.customDepthMaterial || mesh.customDistanceMaterial || !opaque(mesh)) return false;
  // Instanced normals assume orthogonal bases and positive handedness. Retain
  // ordinary meshes for mirrored or sheared transforms rather than flip faces.
  if (mesh.matrixWorld.determinant() <= 0) return false;
  const x = new Vector3().setFromMatrixColumn(mesh.matrixWorld, 0).normalize();
  const y = new Vector3().setFromMatrixColumn(mesh.matrixWorld, 1).normalize();
  const z = new Vector3().setFromMatrixColumn(mesh.matrixWorld, 2).normalize();
  return Math.max(Math.abs(x.dot(y)), Math.abs(x.dot(z)), Math.abs(y.dot(z))) < 1e-5;
}

// Render batches are separate from BIM families. Source nodes, IDs, bounds and
// hierarchy remain the authority for picking, clipping, metadata and collision.
// Spatial cells bound the amount of off-screen geometry drawn by one batch.
export function createRenderInstances(meshes, parent, { cellSize = 24, minimum = 3 } = {}) {
  const groups = new Map(), entries = new Map(), batches = [];
  const root = new Group(); root.name = 'Static render instances';
  parent.add(root); parent.updateWorldMatrix(true, false);
  const inverse = new Matrix4().copy(parent.matrixWorld).invert();
  const matrix = new Matrix4(), center = new Vector3();
  let selected = new Set(), disposed = false;
  for (const mesh of meshes) {
    if (!supported(mesh)) continue;
    if (mesh.userData.bounds) mesh.userData.bounds.getCenter(center);
    else center.setFromMatrixPosition(mesh.matrixWorld);
    const cell = [center.x, center.y, center.z].map(n => Math.floor(n / cellSize)).join(',');
    const key = [mesh.geometry.uuid, materials(mesh).map(m => m.uuid).join(','), mesh.castShadow,
      mesh.receiveShadow, mesh.renderOrder, mesh.frustumCulled, cell].join('|');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(mesh);
  }
  for (const members of groups.values()) {
    if (members.length < minimum) continue;
    const source = members[0];
    const batch = new InstancedMesh(source.geometry, source.material, members.length);
    batch.name = `Instances: ${source.name}`;
    batch.castShadow = source.castShadow; batch.receiveShadow = source.receiveShadow;
    batch.renderOrder = source.renderOrder; batch.frustumCulled = source.frustumCulled;
    batch.matrixAutoUpdate = false;
    batch.raycast = () => {}; // Pick the semantic source node, never a render proxy.
    root.add(batch);
    const entry = { batch, members };
    batches.push(entry);
    for (const mesh of members) { entries.set(mesh, entry); mesh.layers.set(ELEMENT_LAYER); }
  }
  function sync() {
    if (disposed) return;
    for (const { batch, members } of batches) {
      // Muted/original surroundings use corresponding material replacements.
      batch.material = members.find(mesh => !selected.has(mesh))?.material || batch.material;
      let count = 0;
      for (const mesh of members) {
        if (!visible(mesh)) continue;
        batch.setMatrixAt(count++, matrix.multiplyMatrices(inverse, mesh.matrixWorld));
      }
      batch.count = count; batch.visible = count > 0;
      batch.instanceMatrix.needsUpdate = true;
      batch.computeBoundingBox(); batch.computeBoundingSphere();
    }
  }
  sync();
  return {
    root, batches: batches.map(entry => entry.batch), placements: entries.size,
    sync,
    select(value) {
      for (const mesh of selected) if (entries.has(mesh)) mesh.layers.set(ELEMENT_LAYER);
      selected = new Set(value instanceof Set || Array.isArray(value) ? value : value ? [value] : []);
      for (const mesh of selected) if (entries.has(mesh)) mesh.layers.enable(0);
      // Selection draws a depth-biased overlay from the source node. Leave the
      // batch untouched: no instance upload or changed neighbors on a click.
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const mesh of entries.keys()) mesh.layers.set(0);
      for (const { batch } of batches) batch.dispose();
      root.removeFromParent();
      // Geometry, material and textures belong to the source asset.
    },
  };
}
