// Glass drawn as blended glass, without the transmission pass (viewer/js/glass.js).
import { registerHooks } from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'three') return { url: new URL('../viewer/vendor/three/build/three.module.js', import.meta.url).href, shortCircuit: true };
  return next(specifier, context);
} });
const THREE = await import('three');
const { blendGlass } = await import('../viewer/js/glass.js');
const { createRenderInstances } = await import('../viewer/js/render-instances.js');
const { createRenderBatches } = await import('../viewer/js/render-batches.js');

test('transmissive glass becomes blended glass that keeps its colour, roughness and reflections', () => {
  const material = new THREE.MeshPhysicalMaterial({ color: 0xdde8f0, roughness: 0.045, ior: 1.46, transmission: 1, side: THREE.DoubleSide });
  const version = material.version;
  assert.equal(blendGlass(material), true);
  assert.equal(material.transmission, 0, 'no transmission pass');
  assert.equal(material.transparent, true);
  assert.equal(material.depthWrite, false);
  assert.equal(material.forceSinglePass, true, 'two-sided glass draws once, without a program change per side');
  assert.ok(material.opacity >= 0.2 && material.opacity <= 0.3, `clear glass stays faint: ${material.opacity}`);
  assert.equal(material.roughness, 0.045);
  assert.equal(material.ior, 1.46);
  // A faint tint of its colour: lit like a wall, the full colour would turn clear glass milky.
  const tint = new THREE.Color(0xdde8f0);
  assert.ok(material.color.r < tint.r * 0.3 && material.color.b < tint.b * 0.3);
  assert.ok(Math.abs(material.color.r / material.color.b - tint.r / tint.b) < 1e-6, 'same hue');
  assert.equal(material.side, THREE.DoubleSide);
  assert.ok(material.version > version, 'recompiled once, before the first frame');
  assert.deepEqual(material.userData.blendedGlass, { transmission: 1 });
});

test('frosted, partly transmissive, textured and already blended glass keep reading as glass', () => {
  const clear = new THREE.MeshPhysicalMaterial({ roughness: 0.05, transmission: 1 });
  const frosted = new THREE.MeshPhysicalMaterial({ roughness: 0.42, transmission: 1 });
  blendGlass(clear); blendGlass(frosted);
  assert.ok(frosted.opacity > clear.opacity + 0.25, 'frosted glass is denser than clear glass');
  assert.equal(frosted.roughness, 0.42, 'frosted glass stays rough');
  assert.ok(frosted.color.r > clear.color.r * 4, 'frosted glass keeps its milky colour');
  const partly = new THREE.MeshPhysicalMaterial({ roughness: 0.5, transmission: 0.3 });
  blendGlass(partly);
  assert.ok(partly.opacity > 0.8, 'mostly opaque glass stays mostly opaque');
  const photographic = new THREE.MeshPhysicalMaterial({ roughness: 0.35, transmission: 0.8, map: new THREE.Texture() });
  blendGlass(photographic);
  assert.ok(photographic.opacity >= 0.7, 'an image on the glass stays visible');
  assert.equal(photographic.color.getHex(), 0xffffff, 'with its own colours');
  const blended = new THREE.MeshPhysicalMaterial({ roughness: 0.05, transmission: 0.9, transparent: true, opacity: 0.25 });
  blendGlass(blended);
  assert.ok(blended.opacity >= 0.2 && blended.opacity <= 0.26, 'already faint glass stays faint');
});

test('materials without transmission are left untouched', () => {
  for (const material of [new THREE.MeshStandardMaterial(), new THREE.MeshPhysicalMaterial({ transparent: true, opacity: 0.4 }), null]) {
    const before = material && { ...material };
    assert.equal(blendGlass(material), false);
    if (material) assert.deepEqual({ ...material }, before);
  }
});

test('blended glass stays an ordinary, sorted mesh: render instances and batches leave it out', () => {
  const scene = new THREE.Scene(), geometry = new THREE.BoxGeometry();
  const glass = new THREE.MeshPhysicalMaterial({ transmission: 1 });
  blendGlass(glass);
  const panes = Array.from({ length: 4 }, (_, i) => { const mesh = new THREE.Mesh(geometry, glass); mesh.position.x = i; scene.add(mesh); return mesh; });
  scene.updateMatrixWorld(true);
  const instances = createRenderInstances(panes, scene, { cellSize: 1000 });
  assert.equal(instances.placements, 0); instances.dispose();
  const batches = createRenderBatches(panes, scene);
  assert.equal(batches.placements, 0); batches.dispose();
  assert.ok(panes.every(mesh => mesh.layers.isEnabled(0)));
});
