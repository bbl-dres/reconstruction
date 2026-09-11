import { Matrix4, Mesh, Object3D } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

function compatible(parts) {
  const identity = new Matrix4();
  const first = parts[0].geometry;
  const names = Object.keys(first.attributes).sort();
  return parts.every(part => {
    part.updateMatrix();
    const geometry = part.geometry, material = part.material;
    if (part.isSkinnedMesh || part.isInstancedMesh || part.morphTargetInfluences?.length || !part.matrix.equals(identity)
      || !part.visible || part.layers.mask !== 1 || part.renderOrder !== 0 || !part.frustumCulled
      || part.customDepthMaterial || part.customDistanceMaterial
      || !material || Array.isArray(material) || material.transparent || material.transmission
      || geometry.drawRange.start !== 0 || geometry.drawRange.count !== Infinity
      || Object.keys(geometry.morphAttributes).length || Boolean(geometry.index) !== Boolean(first.index)
      || Object.keys(geometry.attributes).sort().join(',') !== names.join(',')) return false;
    return names.every(name => {
      const a = first.attributes[name], b = geometry.attributes[name];
      return a.itemSize === b.itemSize && a.normalized === b.normalized && a.gpuType === b.gpuType
        && a.array.constructor === b.array.constructor;
    });
  });
}

// GLTFLoader represents one multi-material placement as a Group of primitives.
// Restore one semantic Mesh with material groups, retaining every attribute and
// index. Never combine different BIM placements, rooms or family instances.
export function normalizeModelPrimitives(root) {
  const groups = [], cache = new Map();
  root.traverse(object => {
    if (object.isGroup && object.userData.viewer_id && object.children.length > 1
      && object.children.every(child => child.isMesh && !child.userData.viewer_id && !child.children.length)) groups.push(object);
  });
  for (const group of groups) {
    const parts = group.children;
    if (!group.parent || !compatible(parts)) {
      // Unsupported primitives retain their original rendering but still inherit
      // their placement's floor, ceiling and inspection metadata.
      for (const part of parts) part.userData = { ...group.userData, ...part.userData };
      continue;
    }
    const key = parts.map(part => part.geometry.uuid).join(':');
    let geometry = cache.get(key);
    if (!geometry) {
      geometry = mergeGeometries(parts.map(part => part.geometry), true);
      if (!geometry) throw new Error(`Cannot prepare the material groups of ${group.name}.`);
      cache.set(key, geometry);
    }
    const mesh = new Mesh(geometry, parts.map(part => part.material));
    Object3D.prototype.copy.call(mesh, group, false);
    mesh.userData = group.userData;
    const parent = group.parent;
    parent.remove(group); parent.add(mesh);
  }
}
