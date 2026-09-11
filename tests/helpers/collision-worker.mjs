// Runs the production collision algorithms in a real Node worker thread.
// This does not emulate a browser, WebGL, or browser worker delivery policy.
import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import { collisionInput, buildCollisionData, packCollision, unpackCollision } from '../../public/js/collision-data.js';

if (!isMainThread) parentPort.once('message', data => {
  const start = performance.now();
  const result = packCollision(buildCollisionData(data));
  result.buildAndPackMs = performance.now() - start;
  parentPort.postMessage(result, [result.boxes.buffer, result.layout.buffer, result.refs.buffer, result.vertices.buffer]);
});

export async function collisionThroughWorker(meshes) {
  const start = performance.now();
  const input = await collisionInput(meshes);
  const inputMs = performance.now() - start;
  const packed = await new Promise((resolve, reject) => {
    const worker = new Worker(new URL(import.meta.url));
    worker.once('message', data => { worker.terminate(); resolve(data); });
    worker.once('error', error => { worker.terminate(); reject(error); });
    worker.postMessage(input.data, input.transfer);
  });
  const unpackStart = performance.now();
  const result = await unpackCollision(packed);
  return { ...result, timings: { inputMs, buildAndPackMs: packed.buildAndPackMs, unpackMs: performance.now() - unpackStart,
    transferBytes: packed.boxes.byteLength + packed.layout.byteLength + packed.refs.byteLength + packed.vertices.byteLength } };
}
