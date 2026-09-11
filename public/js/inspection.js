import { Box3, Box3Helper, MeshBasicMaterial, Raycaster, Vector2, Vector3 } from 'three';
import { ELEMENT_LAYER } from './render-instances.js?v=bim-1';

export function pickElement(raycaster, meshes, stats) {
  const candidates = [];
  const entry = new Vector3();
  const fallbackBounds = new Box3();
  if (stats) Object.assign(stats, { candidates: 0, raycasts: 0 });
  for (const mesh of meshes) {
    let visible = true;
    for (let parent = mesh; parent; parent = parent.parent) if (!parent.visible) { visible = false; break; }
    if (!visible || !mesh.layers.test(raycaster.layers)) continue;
    // Imported models are static and cache world bounds at load time. The
    // fallback keeps standalone/dynamic meshes correct without stale caching.
    const box = mesh.userData.bounds || fallbackBounds.setFromObject(mesh);
    if (!raycaster.ray.intersectBox(box, entry)) continue;
    const distance = box.containsPoint(raycaster.ray.origin) ? 0 : entry.distanceTo(raycaster.ray.origin);
    if (distance <= raycaster.far) candidates.push({ mesh, distance });
  }
  candidates.sort((a, b) => a.distance - b.distance);
  if (stats) stats.candidates = candidates.length;
  let nearest = null;
  const hits = [];
  for (const candidate of candidates) {
    if (nearest && candidate.distance > nearest.distance + 1e-5) break;
    hits.length = 0;
    raycaster.intersectObject(candidate.mesh, false, hits);
    if (stats) stats.raycasts++;
    // Raycasting ignores material visibility and clipping. Test all hits on a
    // mesh because the front face may be clipped while its back face is visible.
    for (const hit of hits) {
      const material = Array.isArray(hit.object.material) ? hit.object.material[hit.face.materialIndex] : hit.object.material;
      if (!material || !material.visible) continue;
      const planes = material.clippingPlanes;
      const outside = plane => plane.distanceToPoint(hit.point) < -1e-5;
      if (planes?.length && (material.clipIntersection ? planes.every(outside) : planes.some(outside))) continue;
      if (!nearest || hit.distance < nearest.distance) nearest = hit;
      break;
    }
  }
  return nearest?.object || null;
}

export function wirePicking({ canvas, camera, meshes, enabled, onPick }) {
  const raycaster = new Raycaster();
  raycaster.layers.enable(ELEMENT_LAYER);
  const point = new Vector2();
  const pointers = new Set();
  let click = null;
  canvas.addEventListener('pointerdown', event => {
    if (!enabled()) { pointers.clear(); click = null; return; }
    pointers.add(event.pointerId);
    click = pointers.size === 1 && event.button === 0 ? { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false } : null;
  });
  canvas.addEventListener('pointermove', event => {
    if (click && Math.hypot(event.clientX - click.x, event.clientY - click.y) > 6) click.moved = true;
  });
  canvas.addEventListener('pointercancel', event => { pointers.delete(event.pointerId); click = null; });
  // OrbitControls can release capture during pointerup; preserve that pending tap.
  canvas.addEventListener('lostpointercapture', event => { pointers.delete(event.pointerId); });
  canvas.addEventListener('pointerup', event => {
    pointers.delete(event.pointerId);
    const pick = click;
    click = null;
    if (!enabled() || !pick || pick.id !== event.pointerId || pick.moved || pointers.size) return;
    const rect = canvas.getBoundingClientRect();
    point.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    const activeCamera = camera();
    activeCamera.updateMatrixWorld(true);
    raycaster.setFromCamera(point, activeCamera);
    const mesh = pickElement(raycaster, meshes());
    if (mesh) onPick(mesh);
  });
}

export function highlightElement(mesh, color = '#38d9ff', { frame: showFrame = true } = {}) {
  const original = mesh.material;
  const renderOrder = mesh.renderOrder;
  // Unlit opaque color remains readable on dark textures, glass and in sunlight.
  // Each placement owns its temporary material; linked family instances stay intact.
  const highlight = material => new MeshBasicMaterial({ color, toneMapped: false, fog: false,
    side: material.side, visible: material.visible, clippingPlanes: material.clippingPlanes,
    clipIntersection: material.clipIntersection, depthTest: material.depthTest,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const materials = Array.isArray(original) ? original.map(highlight) : [highlight(original)];
  mesh.material = Array.isArray(original) ? materials : materials[0];
  mesh.renderOrder = Math.max(1, renderOrder);
  if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
  const frame = new Box3Helper(mesh.geometry.boundingBox, color);
  frame.name = 'Selection bounds';
  frame.material.toneMapped = false;
  frame.material.fog = false;
  frame.material.depthTest = false;
  frame.material.depthWrite = false;
  frame.material.clippingPlanes = materials[0].clippingPlanes;
  frame.material.clipIntersection = materials[0].clipIntersection;
  frame.renderOrder = 1000;
  frame.raycast = () => {};
  if (showFrame) mesh.add(frame);
  let restored = false;
  return () => {
    if (restored) return;
    restored = true;
    mesh.material = original;
    mesh.renderOrder = renderOrder;
    frame.removeFromParent();
    frame.geometry.dispose(); frame.material.dispose();
    materials.forEach(material => material.dispose());
  };
}

export function highlightElements(meshes, color, parent, bounds) {
  const cleanups = meshes.map(mesh => highlightElement(mesh, color, { frame: false }));
  const box = bounds?.clone() || new Box3();
  if (!bounds) for (const mesh of meshes) box.union(mesh.userData.bounds || new Box3().setFromObject(mesh));
  const frame = new Box3Helper(box, color);
  frame.name = 'Whole product selection bounds'; frame.raycast = () => {};
  frame.material.toneMapped = false; frame.material.fog = false;
  frame.material.depthTest = false; frame.material.depthWrite = false;
  frame.material.clippingPlanes = (Array.isArray(meshes[0].material) ? meshes[0].material[0] : meshes[0].material).clippingPlanes;
  frame.material.clipIntersection = (Array.isArray(meshes[0].material) ? meshes[0].material[0] : meshes[0].material).clipIntersection;
  frame.renderOrder = 1000;
  parent.add(frame);
  // The caller supplies the world scene root, whose transform is identity.
  let restored = false;
  const clear = () => {
    if (restored) return; restored = true;
    cleanups.forEach(clear => clear()); frame.removeFromParent(); frame.geometry.dispose(); frame.material.dispose();
  };
  clear.syncVisibility = () => { if (!restored) frame.visible = meshes.some(mesh => mesh.visible); };
  clear.syncVisibility();
  return clear;
}
