import { collisionInput, unpackCollision } from './collision-data.js?v=v019-galleries';

export async function prepareCollisionWorld(meshes, signal) {
  if (typeof Worker === 'undefined') throw new Error('This browser cannot prepare walking surfaces. Try a browser with module worker support.');
  const input = await collisionInput(meshes, signal);
  signal?.throwIfAborted();
  const packed = await new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./collision-worker.js?v=v019-galleries', import.meta.url), { type: 'module' });
    const cleanup = () => { worker.terminate(); signal?.removeEventListener('abort', abort); };
    const abort = () => { cleanup(); reject(signal.reason); };
    signal?.addEventListener('abort', abort, { once: true });
    worker.onmessage = ({ data }) => { cleanup(); data.error ? reject(new Error(data.error)) : resolve(data); };
    worker.onerror = () => { cleanup(); reject(new Error('Walking surfaces could not be prepared. Reload the viewer and try again.')); };
    worker.onmessageerror = worker.onerror;
    try { worker.postMessage(input.data, input.transfer); }
    catch (error) { cleanup(); reject(error); }
  });
  signal?.throwIfAborted();
  return unpackCollision(packed);
}
