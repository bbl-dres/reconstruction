// Small scene helpers shared by the viewer's modules.

// A mesh's materials as a list, whether it has one or several.
export const materialsOf = mesh => Array.isArray(mesh.material) ? mesh.material : [mesh.material];

// Shown when the object and every parent are visible.
export function isShown(object) {
  for (let node = object; node; node = node.parent) if (!node.visible) return false;
  return true;
}
