import { Group, Mesh, Ray, Vector3 } from 'three';
import { Octree } from 'three/addons/math/Octree.js';
import { Capsule } from 'three/addons/math/Capsule.js';
import { collisionCandidate } from 'building-policy';

export function createCollisionWorld(meshes) {
  const group = new Group();
  let triangles = 0;
  for (const mesh of meshes) {
    if (!collisionCandidate(mesh)) continue;
    const proxy = new Mesh(mesh.geometry);
    proxy.matrix.copy(mesh.matrixWorld);
    proxy.matrixAutoUpdate = false;
    group.add(proxy);
    triangles += (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3;
  }
  const world = new Octree();
  world.maxLevel = 9;
  world.trianglesPerLeaf = 24;
  world.fromGraphNode(group);
  return { world, triangles, meshes: group.children.length };
}

// Several worlds walked as one, such as the building and the terrain around it: the contact
// solver sees the triangles of all of them.
export function combineWorlds(worlds) {
  const world = new Octree();
  world.getCapsuleTriangles = (capsule, triangles) => { for (const part of worlds) part.getCapsuleTriangles(capsule, triangles); };
  world.getRayTriangles = (ray, triangles) => { for (const part of worlds) part.getRayTriangles(ray, triangles); };
  return world;
}

export class Walker {
  constructor(camera, world) {
    this.camera = camera;
    this.world = world;
    this.radius = 0.28;
    this.eyeHeight = 1.65;
    this.capsule = new Capsule(new Vector3(), new Vector3(), this.radius);
    this.velocity = new Vector3();
    this.grounded = false;
    this.safePosition = new Vector3();
    this.forward = new Vector3();
    this.right = new Vector3();
    this.move = new Vector3();
    this.offset = new Vector3();
    this.down = new Ray(new Vector3(), new Vector3(0, -1, 0));
    this.normal = new Vector3();
    this.flying = false;
    this.hasPosition = false;
    this.hasSafePosition = false;
  }

  placeAt(feet) {
    this.capsule.start.copy(feet).add(new Vector3(0, this.radius + 0.02, 0));
    this.capsule.end.copy(feet).add(new Vector3(0, this.eyeHeight, 0));
    this.velocity.set(0, 0, 0);
    this.grounded = false;
    this.camera.position.copy(this.capsule.end);
  }

  // The surface straight below a point: where, how far, and whether it faces up enough to walk on.
  // Collision worlds reuse their triangles between queries, so the slope is read at once.
  ground(origin) {
    this.down.origin.copy(origin);
    const hit = this.world.rayIntersect(this.down);
    return hit ? { position: hit.position, distance: hit.distance, walkable: hit.triangle.getNormal(this.normal).y > 0.6 } : null;
  }

  spawn(position, target) {
    const base = new Vector3().fromArray(position);
    // Search nearby if the nominal bookmark lies inside furniture or a wall.
    for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0], [0, 2], [0, -2], [3, 0], [-3, 0]]) {
      const floor = this.ground(base.clone().add(new Vector3(dx, 0.6, dz)));
      if (!floor || floor.distance > 2.5 || !floor.walkable) continue;
      this.placeAt(floor.position);
      const hit = this.world.capsuleIntersect(this.capsule);
      if (hit && hit.depth > 0.03) continue;
      this.safePosition.copy(floor.position);
      this.camera.lookAt(new Vector3().fromArray(target));
      this.hasPosition = true;
      this.hasSafePosition = true;
      return true;
    }
    return false;
  }

  adoptView() {
    const feet = this.camera.position.clone().add(new Vector3(0, -this.eyeHeight, 0));
    this.placeAt(feet);
    const floor = this.ground(feet.clone().setY(feet.y + 0.35));
    const hit = this.world.capsuleIntersect(this.capsule);
    const supported = floor && Math.abs(floor.position.y - feet.y) < 0.1 && floor.walkable && (!hit || hit.depth <= 0.03);
    if (supported) { this.safePosition.copy(feet); this.hasSafePosition = true; }
    else if (!this.hasSafePosition) this.safePosition.copy(feet);
    this.flying = !supported;
    this.hasPosition = true;
  }

  // Walk on from where the camera is: straight down onto the first surface below it (a floor,
  // the terrain), facing the same way with a level gaze. False if there is nothing below.
  dropBelow() {
    const floor = this.ground(this.camera.position);
    if (!floor) return false;
    const heading = new Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    // Looking straight down, the top of the screen points the way ahead.
    if (Math.hypot(heading.x, heading.z) < 1e-3) heading.set(0, 1, 0).applyQuaternion(this.camera.quaternion);
    heading.setY(0).normalize();
    this.flying = false;
    this.placeAt(floor.position);
    this.camera.lookAt(this.camera.position.clone().add(heading));
    this.safePosition.copy(floor.position);
    this.hasSafePosition = true;
    this.hasPosition = true;
    return true;
  }

  setFlying(enabled) {
    this.flying = enabled;
    this.velocity.set(0, 0, 0);
    if (!enabled && this.hasSafePosition) this.placeAt(this.safePosition);
  }

  reset() { this.placeAt(this.safePosition); }

  update(delta, keys) {
    // Bound simulation steps so a tab pause cannot tunnel through a wall.
    const elapsed = Math.min(Math.max(delta, 0), 0.05);
    const steps = Math.max(1, Math.ceil(elapsed / (1 / 120)));
    for (let step = 0; step < steps; step++) this.step(elapsed / steps, keys);
    this.camera.position.copy(this.capsule.end);
    // Out of the world: fallen far below the last place stood on (terrain may lie well below the
    // building), or gone far beyond it. True when the walker was returned there.
    if ((!this.flying && this.capsule.end.y < this.safePosition.y - 30) || this.capsule.end.distanceTo(this.safePosition) > 10000) {
      this.reset();
      return true;
    }
    return false;
  }

  step(dt, keys) {
    this.camera.getWorldDirection(this.forward);
    if (!this.flying) this.forward.y = 0;
    this.forward.normalize();
    this.right.crossVectors(this.forward, this.camera.up).normalize();
    const front = Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown'));
    const side = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft'));
    this.move.copy(this.forward).multiplyScalar(front).addScaledVector(this.right, side);
    if (this.flying) this.move.y += Number(keys.has('KeyE')) - Number(keys.has('KeyQ'));
    if (this.move.lengthSq() > 1) this.move.normalize();
    const speed = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 5 : 2.5;
    if (this.flying) {
      this.capsule.translate(this.move.multiplyScalar(speed * 2 * dt));
      return;
    }
    const wasGrounded = this.grounded;
    const before = this.capsule.clone();
    this.velocity.x = this.move.x * speed;
    this.velocity.z = this.move.z * speed;
    if (this.grounded && keys.has('Space')) {
      this.velocity.y = 5;
      this.grounded = false;
      keys.delete('Space');
    }
    this.velocity.y -= 20 * dt;
    this.offset.copy(this.velocity).multiplyScalar(dt);
    this.capsule.translate(this.offset);
    this.grounded = false;
    let wallHit = false;
    for (let pass = 0; pass < 3; pass++) {
      const hit = this.world.capsuleIntersect(this.capsule);
      if (!hit || hit.depth < 1e-7) break;
      if (hit.normal.y > 0.5) this.grounded = true;
      if (Math.abs(hit.normal.y) < 0.5) wallHit = true;
      const into = this.velocity.dot(hit.normal);
      if (into < 0) this.velocity.addScaledVector(hit.normal, -into);
      this.capsule.translate(hit.normal.multiplyScalar(hit.depth + 1e-5));
    }
    // Step up small risers only when a supported, unobstructed landing exists.
    if (wallHit && wasGrounded && this.move.lengthSq() > 0 && !keys.has('Space')) {
      const candidate = before.clone();
      candidate.translate(new Vector3(this.offset.x, 0.32, this.offset.z));
      if (!this.world.capsuleIntersect(candidate)) {
        const ground = this.ground(candidate.start.clone().addScaledVector(this.move, this.radius));
        const previousFeet = before.start.y - this.radius;
        if (ground && ground.position.y > previousFeet + 0.01 && ground.position.y <= previousFeet + 0.32 && ground.walkable) {
          this.capsule.copy(candidate);
          this.velocity.y = 0;
        }
      }
    }
    // Stay attached to shallow descents; never snap down a full stairwell.
    if (wasGrounded && !this.grounded && this.velocity.y <= 0) {
      const ground = this.ground(this.capsule.start);
      if (ground && ground.distance <= this.radius + 0.18 && ground.walkable) {
        this.capsule.translate(new Vector3(0, this.radius - ground.distance + 1e-4, 0));
        this.grounded = true;
        this.velocity.y = 0;
      }
    }
    if (this.grounded) {
      this.velocity.y = Math.max(0, this.velocity.y);
      this.safePosition.copy(this.capsule.start).y -= this.radius;
      this.hasSafePosition = true;
    }
  }
}
