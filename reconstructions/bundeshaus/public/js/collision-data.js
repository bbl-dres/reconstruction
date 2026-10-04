// Explicit relative imports: shared by the page and a native module worker.
import { Box3, Matrix4, Triangle, Vector3 } from '../vendor/three/build/three.core.js';
import { Octree } from '../vendor/three/examples/jsm/math/Octree.js';
import { collisionCandidate } from './model-policy.js?v=v019-galleries';

const yieldTask = () => new Promise(resolve => setTimeout(resolve, 0));

// Copy only collision positions/indices; never transfer/detach render buffers.
export async function collisionInput(meshes, signal) {
  signal?.throwIfAborted();
  const objects = [], geometries = [], shared = new Map(), transfer = [];
  for (const mesh of meshes) {
    signal?.throwIfAborted();
    if (!collisionCandidate(mesh)) continue;
    if (!shared.has(mesh.geometry)) {
      const attribute = mesh.geometry.attributes.position;
      const positions = new Float32Array(attribute.count * 3);
      for (let i = 0; i < attribute.count; i++) {
        positions[i * 3] = attribute.getX(i); positions[i * 3 + 1] = attribute.getY(i); positions[i * 3 + 2] = attribute.getZ(i);
      }
      const indices = mesh.geometry.index ? mesh.geometry.index.array.slice() : null;
      shared.set(mesh.geometry, geometries.length);
      geometries.push({ positions, indices });
      transfer.push(positions.buffer);
      if (indices) transfer.push(indices.buffer);
    }
    objects.push({ geometry: shared.get(mesh.geometry), matrix: mesh.matrixWorld.toArray() });
    if (objects.length % 8 === 0) await yieldTask();
  }
  return { data: { geometries, objects }, transfer };
}

export function buildCollisionData({ geometries, objects }) {
  const count = objects.reduce((sum, object) => { const g = geometries[object.geometry]; return sum + (g.indices ? g.indices.length : g.positions.length / 3) / 3; }, 0);
  const vertices = new Float64Array(count * 9);
  const order = Uint32Array.from({ length: count }, (_, i) => i);
  const faceBounds = new Float64Array(count * 6);
  let face = 0;
  for (const object of objects) {
    const { positions, indices } = geometries[object.geometry];
    const matrix = new Matrix4().fromArray(object.matrix);
    const length = indices ? indices.length : positions.length / 3;
    for (let i = 0; i < length; i += 3) {
      const vertex = offset => new Vector3().fromArray(positions, (indices ? indices[i + offset] : i + offset) * 3).applyMatrix4(matrix);
      const points = [vertex(0), vertex(1), vertex(2)];
      points.forEach((point, index) => point.toArray(vertices, face * 9 + index * 3));
      for (let axis = 0; axis < 3; axis++) {
        const values = points.map(point => point.getComponent(axis));
        faceBounds[face * 6 + axis] = Math.min(...values);
        faceBounds[face * 6 + axis + 3] = Math.max(...values);
      }
      face++;
    }
  }
  // A binary BVH stores each face once. Octree subdivision replicated large
  // floors/walls across many leaves and used gigabytes on the latest model.
  const boxes = [], layout = [];
  function split(start, end) {
    const index = layout.length / 4;
    const minimum = [Infinity, Infinity, Infinity], maximum = [-Infinity, -Infinity, -Infinity];
    for (let i = start; i < end; i++) for (let axis = 0; axis < 3; axis++) {
      minimum[axis] = Math.min(minimum[axis], faceBounds[order[i] * 6 + axis]);
      maximum[axis] = Math.max(maximum[axis], faceBounds[order[i] * 6 + axis + 3]);
    }
    boxes.push(...minimum, ...maximum);
    layout.push(0, 0, start, end - start);
    if (end - start <= 16) return index;
    const extents = maximum.map((value, axis) => value - minimum[axis]);
    const axis = extents.indexOf(Math.max(...extents));
    const midpoint = minimum[axis] + extents[axis] / 2;
    let middle = start;
    for (let i = start; i < end; i++) {
      const offset = order[i] * 6 + axis;
      if ((faceBounds[offset] + faceBounds[offset + 3]) / 2 < midpoint) {
        const temp = order[middle]; order[middle++] = order[i]; order[i] = temp;
      }
    }
    // A median fallback bounds tree depth for coplanar/coincident geometry.
    if (middle - start < (end - start) / 8 || end - middle < (end - start) / 8) {
      order.subarray(start, end).sort((a, b) => (faceBounds[a * 6 + axis] + faceBounds[a * 6 + axis + 3]) - (faceBounds[b * 6 + axis] + faceBounds[b * 6 + axis + 3]));
      middle = (start + end) >>> 1;
    }
    layout[index * 4] = split(start, middle);
    layout[index * 4 + 1] = split(middle, end);
    layout[index * 4 + 3] = 0;
    return index;
  }
  split(0, count);
  return { boxes: Float64Array.from(boxes), layout: Uint32Array.from(layout), refs: order, vertices, meshes: objects.length, triangles: count };
}

export function packCollision(data) { return data; }

export async function unpackCollision(data) {
  return { world: new CollisionWorld(data), meshes: data.meshes, triangles: data.triangles };
}

// Reuse Three's tested capsule/triangle contact solver, replacing only spatial
// candidate lookup. Transferred arrays are used directly, with no heap rebuild.
class CollisionWorld extends Octree {
  constructor(data) { super(); this.data = data; this.queryBox = new Box3(); this.rayPoint = new Vector3(); this.pool = []; }
  query(intersects, triangles) {
    const { boxes, layout, refs, vertices } = this.data;
    const stack = [0];
    while (stack.length) {
      const node = stack.pop();
      this.queryBox.min.fromArray(boxes, node * 6); this.queryBox.max.fromArray(boxes, node * 6 + 3);
      if (!intersects(this.queryBox)) continue;
      const count = layout[node * 4 + 3];
      if (!count) { if (layout[node * 4]) stack.push(layout[node * 4], layout[node * 4 + 1]); continue; }
      const start = layout[node * 4 + 2];
      for (let i = start; i < start + count; i++) {
        const triangle = this.pool[triangles.length] ||= new Triangle();
        const offset = refs[i] * 9;
        triangle.a.fromArray(vertices, offset); triangle.b.fromArray(vertices, offset + 3); triangle.c.fromArray(vertices, offset + 6);
        triangles.push(triangle);
      }
    }
  }
  getCapsuleTriangles(capsule, triangles) { this.query(box => capsule.intersectsBox(box), triangles); }
  getRayTriangles(ray, triangles) { this.query(box => ray.intersectBox(box, this.rayPoint) !== null, triangles); }
  getSphereTriangles(sphere, triangles) { this.query(box => sphere.intersectsBox(box), triangles); }
  getBoxTriangles(box, triangles) { this.query(candidate => box.intersectsBox(candidate), triangles); }
}
