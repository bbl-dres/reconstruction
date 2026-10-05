import { MeshoptDecoder } from '../vendor/meshoptimizer/meshopt_decoder.mjs';

export async function resolveMeshoptDecoder(native, fallback = () => import('../vendor/meshoptimizer/meshopt_decoder_reference.mjs')) {
  try {
    if (native.supported) { await native.ready; return native; }
  } catch { /* A browser policy may expose WebAssembly but block compilation. */ }
  // A slower local JavaScript decoder keeps the same assets usable when WASM
  // is disabled (for example by a browser's enhanced security settings).
  const { MeshoptDecoder: portable } = await fallback();
  await portable.ready;
  if (!portable.supported) throw new Error('The local model decoder could not start. Refresh the page to update viewer files.');
  return portable;
}

// Attach the WASM rejection handler immediately, before a long model download.
export const meshoptDecoderReady = resolveMeshoptDecoder(MeshoptDecoder);
meshoptDecoderReady.catch(() => {}); // loadGLB presents initialization failures.
