// Default ("studio") lighting shared by every building page. Change it here, not per building.
//
// Goal: a clear sunny day that reads well WITHOUT shadow maps (shadows are an opt-in in the Lighting panel;
// they cost a depth pass per update and are fragile on phones). Contrast therefore comes from three
// sources that are free at draw time:
//   1. a warm directional sun, so faces turned to the sun are clearly brighter than faces turned away;
//   2. an outdoor sky as image-based light (blue zenith, bright horizon, dark warm ground, prefiltered once
//      with PMREM), so up-facing surfaces receive more sky than walls and undersides almost none - the
//      vertical gradient of real daylight - plus sky-coloured reflections on glass and metal. It replaces
//      the RoomEnvironment (an indoor light box) and the hemisphere fill used before;
//   3. Khronos PBR Neutral tone mapping, which keeps base colours and texture saturation up to its
//      highlight shoulder (ACES, used before, scaled exposure by 1/0.6 and bleached light materials).
//
// Units are three.js physical light units (r155+). For a Lambert surface of albedo a:
//   sun        a * sun.intensity / PI * cos(incidence)
//   sky (IBL)  a * environmentIntensity * mean sky radiance seen by the normal
// With plausible albedos (painted white ~0.80, lime plaster ~0.70, stone 0.4-0.5, clay tile ~0.26, grass
// ~0.15) a sunlit plaster facade lands just below the tone-mapping shoulder and a facade in shade at about
// 40 % of it - the contrast of a sunny photograph - while roofs and lawns keep their colour. Models author
// base colours in those ranges (docs/model-handoff.md); the lighting does not compensate for bright albedo.
import { BackSide, Color, Float32BufferAttribute, MathUtils, Mesh, MeshBasicMaterial, NeutralToneMapping, PMREMGenerator,
  Scene, SphereGeometry, Vector3 } from 'three';

export const STUDIO = Object.freeze({
  toneMapping: NeutralToneMapping,
  exposure: 1,
  environmentIntensity: 0.9,
  // Linear radiance of the sky dome used as environment light.
  sky: Object.freeze({ zenith: [0.42, 0.52, 0.78], horizon: [0.88, 0.90, 0.94], ground: [0.24, 0.22, 0.19] }),
  // Not needed with the sky environment; Daylight uses it for a faint blue fill at dusk and night.
  fill: Object.freeze({ sky: 0xdde6f5, ground: 0x8a7d6c, intensity: 0 }),
  // Key light from the model's south-east (+x/+z; -z is the model's north facade). The default orbit view
  // (main.js frameView, camera on +x/-z) sees one lit and one shaded facade; the south facade gets raking light.
  sun: Object.freeze({ color: 0xfff4e5, intensity: 3.3, azimuth: 55, elevation: 42, distance: 140 }),
  shadows: false,
});

// Direction from the scene towards the studio sun. Azimuth in degrees around +y, measured from +z
// (model south) towards +x (east); elevation above the horizon.
export function studioSunDirection(sun = STUDIO.sun) {
  const az = MathUtils.degToRad(sun.azimuth), el = MathUtils.degToRad(sun.elevation);
  return new Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
}

// Linear sky radiance for the y component of a unit direction (y up).
export function skyRadiance(y, sky = STUDIO.sky) {
  const lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  if (y >= 0) return lerp(sky.horizon, sky.zenith, Math.sqrt(y));
  return lerp(sky.horizon, sky.ground, Math.min(1, -y * 6)); // short blend into the ground below the horizon
}

// Prefiltered outdoor environment: one PMREM pass at start-up.
export function createSkyEnvironment(renderer, sky = STUDIO.sky) {
  const geometry = new SphereGeometry(1, 48, 24);
  const position = geometry.attributes.position;
  const colors = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) colors.set(skyRadiance(position.getY(i), sky), i * 3);
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  const material = new MeshBasicMaterial({ vertexColors: true, side: BackSide, toneMapped: false });
  const scene = new Scene();
  scene.add(new Mesh(geometry, material));
  const pmrem = new PMREMGenerator(renderer);
  const target = pmrem.fromScene(scene, 0, 0.05, 10);
  pmrem.dispose(); geometry.dispose(); material.dispose();
  return target;
}

export function applyStudioLights({ scene, sun, fillLight }) {
  scene.environmentIntensity = STUDIO.environmentIntensity;
  fillLight.color.set(STUDIO.fill.sky);
  fillLight.groundColor.set(STUDIO.fill.ground);
  fillLight.intensity = STUDIO.fill.intensity;
  sun.color.set(STUDIO.sun.color);
  sun.intensity = STUDIO.sun.intensity;
  sun.castShadow = true; // takes effect only when the user enables Shadows (renderer.shadowMap.enabled)
}

// Daylight (Sun & sky) uses the studio budget at full daylight so toggling it keeps exposure.
export const DAYLIGHT = Object.freeze({
  sunIntensity: 3.3,
  sunLow: new Color(0xffbb7d), sunHigh: new Color(0xfff4e5),
  fillNight: 0.25, fillDay: 0,
  fillColorNight: new Color(0x879fc9), fillColorDay: new Color(0xdde8ff), ground: 0x8a7d6c,
  environmentNight: 0.05, environmentDay: 0.9,
});
