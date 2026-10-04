import { Box3, MathUtils, Vector3 } from 'three';

export function boxCorners(box) {
  const result = [];
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) result.push(new Vector3(x, y, z));
  return result;
}

// Keep full-site coverage at a distance, with hysteresis to avoid oscillating
// between map sizes near the threshold. A pan away also requests site coverage.
export function shadowCoverage({ building, site, camera, target, previous = 'building' }) {
  if (!site || camera.isOrthographicCamera) return 'building';
  const radius = Math.max(1, building.getSize(new Vector3()).length() / 2);
  const halfFov = MathUtils.degToRad(camera.getEffectiveFOV() / 2);
  const fitFov = Math.min(halfFov, Math.atan(Math.tan(halfFov) * camera.aspect));
  const distance = camera.position.distanceTo(building.getCenter(new Vector3()));
  const scale = distance * Math.sin(fitFov) / radius;
  const offBuilding = building.distanceToPoint(target || camera.position) / radius;
  return scale > (previous === 'site' ? 3.2 : 4) || offBuilding > (previous === 'site' ? 0.4 : 0.75) ? 'site' : 'building';
}

// Fit XY to the receivers, but depth to every potential caster. Nearby context
// can therefore cast onto the building without diluting the map over the city.
export function fitDirectionalShadow(light, receivers, casters = receivers, padding = 4) {
  if (receivers.isEmpty() || casters.isEmpty()) return;
  const direction = light.position.clone().sub(light.target.position).normalize();
  const center = receivers.getCenter(new Vector3());
  const casterCorners = boxCorners(casters);
  const distance = Math.max(...casterCorners.map(point => point.distanceTo(center))) + padding + 10;
  light.target.position.copy(center);
  light.position.copy(center).addScaledVector(direction, distance);
  light.updateMatrixWorld(true);
  light.target.updateMatrixWorld(true);
  light.shadow.updateMatrices(light);
  const camera = light.shadow.camera;
  const receiverBox = new Box3().setFromPoints(boxCorners(receivers).map(point => point.applyMatrix4(camera.matrixWorldInverse)));
  const casterBox = new Box3().setFromPoints(casterCorners.map(point => point.applyMatrix4(camera.matrixWorldInverse)));
  // Round outwards and snap to texels; never trim an edge while snapping.
  const width = Math.ceil(receiverBox.max.x - receiverBox.min.x + 2 * padding);
  const height = Math.ceil(receiverBox.max.y - receiverBox.min.y + 2 * padding);
  const texelX = width / Math.max(1, light.shadow.mapSize.x - 2);
  const texelY = height / Math.max(1, light.shadow.mapSize.y - 2);
  camera.left = Math.floor((receiverBox.min.x - padding) / texelX) * texelX;
  camera.right = camera.left + width + 2 * texelX;
  camera.bottom = Math.floor((receiverBox.min.y - padding) / texelY) * texelY;
  camera.top = camera.bottom + height + 2 * texelY;
  camera.near = Math.max(0.1, -casterBox.max.z - padding);
  camera.far = Math.max(camera.near + 1, -casterBox.min.z + padding);
  camera.updateProjectionMatrix();
  light.shadow.updateMatrices(light);
}
