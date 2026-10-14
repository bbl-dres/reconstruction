import { BackSide, BufferGeometry, DoubleSide, Float32BufferAttribute, FrontSide, Group, Mesh, MeshBasicMaterial, MeshDepthMaterial,
  OrthographicCamera, Plane, Scene, Vector3, WebGLRenderTarget } from 'three';

// Shader programs compiled in the background (KHR_parallel_shader_compile) instead of on first use,
// where the page would wait for the driver: at load, and before shadows are switched on.

// One object per material and object kind: besides the renderer's own state, these are what select a
// shader program (instancing, batching, skinning and the geometry's optional attributes). Compiling
// them covers the whole scene for a fraction of the cost of visiting every mesh.
export function representatives(root) {
  const chosen = new Map();
  root.traverse(object => {
    if (!(object.isMesh || object.isLine || object.isPoints) || !object.material) return;
    const attributes = Object.keys(object.geometry?.attributes || {}).sort().join(',');
    const kind = `${object.isInstancedMesh ? 'i' : ''}${object.isBatchedMesh ? 'b' : ''}${object.isSkinnedMesh ? 's' : ''}|${attributes}`;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      const key = `${material.id}|${kind}`;
      if (!chosen.has(key)) chosen.set(key, object);
    }
  });
  return [...new Set(chosen.values())];
}

// The number of clipping planes a material draws with (in the shadow pass, only with clipShadows).
const planeCount = (renderer, material, shadowPass = false) => renderer.localClippingEnabled && material?.clippingPlanes?.length
  && (!shadowPass || material.clipShadows) ? material.clippingPlanes.length : 0;

// renderer.compile() takes the number of clipping planes from the renderer's clipping state, which
// only a draw sets: compiled straight away, every material would get the plane count of whatever
// was drawn last, and the right variant would be compiled again, blocking, on first use. One
// invisible triangle with that many planes, drawn into a 1 × 1 target, sets the state first.
const primers = new Map();
let primerTarget = null;
export function primeClipping(renderer, count) {
  let primer = primers.get(count);
  if (!primer) {
    const geometry = new BufferGeometry().setAttribute('position', new Float32BufferAttribute(new Float32Array(9), 3));
    const planes = Array.from({ length: count }, () => new Plane(new Vector3(0, 1, 0), 1e9));
    const mesh = new Mesh(geometry, new MeshBasicMaterial({ clippingPlanes: planes }));
    mesh.frustumCulled = false;
    primer = { scene: new Scene().add(mesh), camera: new OrthographicCamera() };
    primers.set(count, primer);
  }
  primerTarget ||= new WebGLRenderTarget(1, 1);
  const previous = renderer.getRenderTarget();
  renderer.setRenderTarget(primerTarget);
  renderer.render(primer.scene, primer.camera);
  renderer.setRenderTarget(previous);
}

// Compiles the objects' materials in groups of equal plane count, each after priming the state.
function compileGroups(renderer, objects, camera, scene, shadowPass = false) {
  const groups = new Map(), materials = new Set(), holder = new Group();
  for (const object of objects) {
    const count = planeCount(renderer, Array.isArray(object.material) ? object.material[0] : object.material, shadowPass);
    if (!groups.has(count)) groups.set(count, []);
    groups.get(count).push(object);
  }
  try {
    for (const [count, list] of groups) {
      primeClipping(renderer, count);
      // Borrowed, not adopted: the objects keep their parents.
      holder.children = list;
      for (const material of renderer.compile(holder, camera, scene)) materials.add(material);
    }
  } finally { holder.children = []; }
  return materials;
}

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function linked(renderer, materials, wait) {
  const programs = [...materials].map(material => renderer.properties.get(material).currentProgram).filter(Boolean);
  while (programs.some(program => !program.isReady())) await wait(16);
  return programs.length;
}

// Compiles what `root` needs to draw now, as WebGLRenderer.compileAsync does, with the clipping
// planes of each material taken into account. Resolves once the driver reports the programs linked.
export async function compileScene(renderer, root, camera, scene, { wait = pause } = {}) {
  return linked(renderer, compileGroups(renderer, representatives(root), camera, scene), wait);
}

// The depth material the shadow pass derives from a material (getDepthMaterial in three's
// WebGLShadowMap, r185): the same faces, alpha test, colour map, displacement and clipping. The
// renderer shares programs between materials with equal settings, so compiling this stand-in
// compiles the shadow pass's program. Stand-ins are not disposed: that would release the program.
const shadowSide = { [FrontSide]: BackSide, [BackSide]: FrontSide, [DoubleSide]: DoubleSide };
export function depthStandIn(material) {
  return Object.assign(new MeshDepthMaterial(), {
    side: material.shadowSide ?? shadowSide[material.side],
    alphaMap: material.alphaMap, alphaTest: material.alphaToCoverage === true ? 0.5 : material.alphaTest, map: material.map,
    clipShadows: material.clipShadows, clippingPlanes: material.clippingPlanes, clipIntersection: material.clipIntersection,
    displacementMap: material.displacementMap, displacementScale: material.displacementScale, displacementBias: material.displacementBias,
  });
}

// Compiles the programs another renderer state needs, such as shadows switched on, while frames
// keep drawing with the current ones. `configure` applies that state for the compile and returns a
// function that restores it. With `shadowDepth`, the shadow pass's depth programs are compiled too:
// it draws into a render target, which selects their variant. Resolves once the driver reports the
// programs linked, so switching to the state afterwards does not stall the page.
export async function compileVariants(renderer, scene, camera, configure, { shadowDepth = false, wait = pause } = {}) {
  const objects = representatives(scene);
  const restore = configure();
  const swapped = [];
  let materials, depthMaterials = new Set(), target = null, previous = null;
  try {
    materials = compileGroups(renderer, objects, camera, scene);
    if (shadowDepth) {
      const casters = objects.filter(object => object.castShadow);
      for (const object of casters) {
        swapped.push([object, object.material]);
        object.material = Array.isArray(object.material) ? object.material.map(depthStandIn) : depthStandIn(object.material);
      }
      target = new WebGLRenderTarget(1, 1);
      previous = renderer.getRenderTarget();
      renderer.setRenderTarget(target);
      depthMaterials = compileGroups(renderer, casters, camera, scene, true);
    }
  } finally {
    for (const [object, material] of swapped) object.material = material;
    if (target) { renderer.setRenderTarget(previous); target.dispose(); }
    restore();
  }
  // The materials now point at the new programs: the next frame picks the current ones again.
  for (const material of materials) material.needsUpdate = true;
  return linked(renderer, new Set([...materials, ...depthMaterials]), wait);
}
