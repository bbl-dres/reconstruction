import { MathUtils, Spherical, Vector3 } from 'three';

// Camera snapshots are shared across modes and serializable in view links.
export function captureView(camera, control, level) {
  return {
    position: camera.position.clone(), target: control.target.clone(),
    zoom: camera.zoom, level,
    halfHeight: camera.isOrthographicCamera ? camera.top : null,
  };
}

export function restoreView(saved, camera, control, aspect) {
  settle(control);
  camera.position.copy(saved.position);
  control.target.copy(saved.target);
  camera.zoom = saved.zoom;
  if (camera.isOrthographicCamera) {
    camera.top = saved.halfHeight;
    camera.bottom = -saved.halfHeight;
    camera.left = -saved.halfHeight * aspect;
    camera.right = saved.halfHeight * aspect;
  }
  camera.updateProjectionMatrix();
  control.update();
}

export function settle(control) {
  // Discard residual drag momentum before a discrete navigation action.
  const damping = control.enableDamping;
  control.enableDamping = false;
  control.update();
  control.enableDamping = damping;
}

export function viewHeight(camera, target) {
  return camera.isOrthographicCamera ? (camera.top - camera.bottom) / camera.zoom
    : 2 * camera.position.distanceTo(target) * Math.tan(MathUtils.degToRad(camera.getEffectiveFOV() / 2));
}

export function toPlan(source, target, camera, control, aspect, top = 150) {
  const height = viewHeight(source, target);
  restoreView({ position: target.clone().add(new Vector3(0, Math.max(150, top - target.y), 0)),
    target, zoom: 1, halfHeight: height / 2 }, camera, control, aspect);
}

export function fromPlan(source, target, direction, camera, control, aspect) {
  const distance = viewHeight(source, target) / (2 * Math.tan(MathUtils.degToRad(camera.getEffectiveFOV() / 2)));
  restoreView({ position: target.clone().addScaledVector(direction.clone().normalize(), distance),
    target, zoom: camera.zoom }, camera, control, aspect);
}

// Keep the same lens as well as position when moving between orbit and POV.
export function copyPerspective(source, destination) {
  destination.position.copy(source.position);
  destination.quaternion.copy(source.quaternion);
  destination.zoom = Math.tan(MathUtils.degToRad(destination.fov / 2)) / Math.tan(MathUtils.degToRad(source.getEffectiveFOV() / 2));
  destination.updateProjectionMatrix();
}

export function navigateView(camera, control, { zoom = 1, horizontal = 0, vertical = 0, pan = false }) {
  settle(control);
  const offset = camera.position.clone().sub(control.target);
  if (zoom !== 1) {
    if (camera.isOrthographicCamera) {
      camera.zoom = MathUtils.clamp(camera.zoom / zoom, control.minZoom, control.maxZoom);
      camera.updateProjectionMatrix();
    } else {
      offset.setLength(MathUtils.clamp(offset.length() * zoom, control.minDistance, control.maxDistance));
      camera.position.copy(control.target).add(offset);
    }
  }
  if (horizontal || vertical) {
    if (pan || camera.isOrthographicCamera) {
      const height = viewHeight(camera, control.target);
      const shift = new Vector3(horizontal, vertical, 0).applyQuaternion(camera.quaternion).multiplyScalar(height * 0.05);
      camera.position.add(shift);
      control.target.add(shift);
    } else {
      const spherical = new Spherical().setFromVector3(offset);
      spherical.theta -= horizontal * 0.12;
      spherical.phi = MathUtils.clamp(spherical.phi - vertical * 0.12, Math.max(0.01, control.minPolarAngle), control.maxPolarAngle);
      camera.position.copy(control.target).add(offset.setFromSpherical(spherical));
    }
  }
  control.update();
}
