import { Box3, EdgesGeometry, LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial, Raycaster, Vector2, Vector3 } from 'three';
import { ELEMENT_LAYER } from './render-instances.js?v=sync-2';
import { isShown, materialsOf } from './scene-utils.js?v=1';

export function pickElement(raycaster, meshes, stats) {
  return pickHit(raycaster, meshes, stats)?.object || null;
}

// The nearest visible, unclipped intersection, including its world point.
export function pickHit(raycaster, meshes, stats) {
  const candidates = [];
  const entry = new Vector3();
  const fallbackBounds = new Box3();
  if (stats) Object.assign(stats, { candidates: 0, raycasts: 0 });
  for (const mesh of meshes) {
    if (!isShown(mesh) || !mesh.layers.test(raycaster.layers)) continue;
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
  return nearest;
}

export function wirePicking({ canvas, camera, meshes, enabled, onPick, onMiss = () => {} }) {
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
    const hit = pickHit(raycaster, meshes());
    if (hit) onPick(hit.object, { point: hit.point });
    else onMiss();
  });
}

// Visible edges sit exactly on their faces; drawing them slightly towards the eye keeps
// them from flickering against the surface. Floor plan's orthographic camera moves along z.
function liftTowardsEye(material) {
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
  mvPosition.xyz = isOrthographic ? mvPosition.xyz + vec3(0.0, 0.0, 0.02) : mvPosition.xyz * 0.997;
  gl_Position = projectionMatrix * mvPosition;`);
  };
  material.customProgramCacheKey = () => 'selection-edges';
  return material;
}

// Selection keeps the element's own look: a light tint over its surfaces, its edges in the
// selection color and its hidden edges faintly through whatever covers them. The overlay
// is a child of the source node, so it follows the node's visibility, and the node's
// materials, shared with other placements, are never changed.
// edgeCache lets the members of one product share the edge geometry of a shared mesh geometry;
// its owner disposes the cached edges.
export function highlightElement(mesh, color = '#38d9ff', edgeCache = null) {
  const sources = materialsOf(mesh);
  const tints = sources.map(material => new MeshBasicMaterial({ color, transparent: true, opacity: 0.22, depthWrite: false,
    toneMapped: false, fog: false, side: material.side, visible: material.visible,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
  const shown = sources.some(material => material.visible);
  const edgeMaterial = liftTowardsEye(new LineBasicMaterial({ color, toneMapped: false, fog: false, visible: shown }));
  const hiddenMaterial = new LineBasicMaterial({ color, transparent: true, opacity: 0.25, depthTest: false, depthWrite: false,
    toneMapped: false, fog: false, visible: shown });
  // Floor plan switches the element's clipping while it stays selected: copy it before each draw.
  // Floor plan may also give the element unclipped copies of its materials.
  const followClipping = () => {
    const current = materialsOf(mesh);
    tints.forEach((tint, i) => { const source = current[i] ?? current[0]; tint.clippingPlanes = source.clippingPlanes; tint.clipIntersection = source.clipIntersection; });
    for (const line of [edgeMaterial, hiddenMaterial]) { line.clippingPlanes = current[0].clippingPlanes; line.clipIntersection = current[0].clipIntersection; }
  };
  followClipping();
  let edges = edgeCache?.get(mesh.geometry);
  if (!edges) { edges = new EdgesGeometry(mesh.geometry, 25); edgeCache?.set(mesh.geometry, edges); }
  const overlay = [
    Object.assign(new Mesh(mesh.geometry, Array.isArray(mesh.material) ? tints : tints[0]), { name: 'Selection tint', renderOrder: 1 }),
    Object.assign(new LineSegments(edges, edgeMaterial), { name: 'Selection edges', renderOrder: 2 }),
    Object.assign(new LineSegments(edges, hiddenMaterial), { name: 'Selection hidden edges', renderOrder: 1000 }),
  ];
  for (const part of overlay) { part.raycast = () => {}; part.onBeforeRender = followClipping; mesh.add(part); }
  let restored = false;
  return () => {
    if (restored) return;
    restored = true;
    for (const part of overlay) part.removeFromParent();
    if (!edgeCache) edges.dispose();
    edgeMaterial.dispose(); hiddenMaterial.dispose();
    tints.forEach(material => material.dispose());
  };
}

// A whole product: every member part is highlighted the same way.
export function highlightElements(meshes, color) {
  const edgeCache = new Map();
  const cleanups = meshes.map(mesh => highlightElement(mesh, color, edgeCache));
  return () => {
    cleanups.forEach(clear => clear());
    for (const edges of edgeCache.values()) edges.dispose();
    edgeCache.clear();
  };
}
