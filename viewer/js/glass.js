import { MathUtils } from 'three';

// Glass is drawn as ordinary blended glass. For a transmissive material, Three.js draws every opaque
// object a second time into a refraction buffer each frame, and compiles extra shader variants for
// that pass; the viewer does not need refraction. The material keeps its colour, texture, roughness,
// IOR and specular response, and its transmission becomes opacity: clear panes stay faint, frosted,
// diffusing and photographic glass denser, so each still reads as the glass it is.
const CLEAR = 0.25, FROSTED = 0.6, TEXTURED = 0.7, CLEAR_TINT = 0.15;

export function blendGlass(material) {
  if (!material || !(material.transmission > 0)) return false;
  const transmission = Math.min(1, material.transmission);
  // Rougher glass scatters more light: it reads denser.
  const frosted = MathUtils.smoothstep(material.roughness ?? 0, 0.1, 0.45);
  let pane = MathUtils.lerp(CLEAR, FROSTED, frosted);
  // An image on the glass (the photographic dome) must stay visible.
  if (material.map) pane = Math.max(pane, TEXTURED);
  // Clear glass reflects and lets light through but scatters almost none: its colour, lit like a wall,
  // would turn it milky. It keeps a faint tint of that colour; frosted and printed glass keep more.
  else material.color.multiplyScalar(MathUtils.lerp(CLEAR_TINT, 1, frosted * transmission + (1 - transmission)));
  const base = material.transparent ? material.opacity : 1;
  material.opacity = MathUtils.lerp(base, pane, transmission);
  material.transmission = 0;
  material.transparent = true;
  material.depthWrite = false;
  // Both faces in one pass: a two-sided transparent material otherwise draws twice and flags a
  // program change for each of them.
  material.forceSinglePass = true;
  material.userData.blendedGlass = { transmission };
  material.needsUpdate = true;
  return true;
}
