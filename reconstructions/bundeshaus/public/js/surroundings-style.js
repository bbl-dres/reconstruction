import { MeshStandardMaterial } from 'three';

// Swap only the context materials. The original textures/materials remain intact.
export function createSurroundingsStyle(root) {
  const materials = new Map();
  const entries = [];
  const mutedMaterial = original => {
    if (!materials.has(original)) {
      materials.set(original, new MeshStandardMaterial({
        color: 0x303237, roughness: 1, metalness: 0,
        envMapIntensity: 0.25, side: original.side,
        transparent: original.transparent, opacity: original.opacity,
        depthWrite: original.depthWrite,
      }));
    }
    return materials.get(original);
  };
  root.traverse(mesh => {
    if (!mesh.isMesh) return;
    const original = mesh.material;
    const muted = Array.isArray(original) ? original.map(mutedMaterial) : mutedMaterial(original);
    entries.push({ mesh, original, muted });
  });
  return {
    materials: [...materials.values()],
    setMuted(enabled) {
      for (const { mesh, original, muted } of entries) mesh.material = enabled ? muted : original;
    },
    dispose() { for (const material of materials.values()) material.dispose(); },
  };
}
