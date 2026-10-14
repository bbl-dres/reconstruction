import { MathUtils, Vector3 } from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { solarState } from './solar-time.js?v=calendar-2';
import { fitDirectionalShadow } from './shadow-fit.js?v=fit-1';
import { DAYLIGHT } from './lighting.js?v=sky-ibl-1';

export class Daylight {
  constructor({ scene, sun, fillLight, renderer, bounds }) {
    Object.assign(this, { scene, sun, fillLight, renderer, bounds });
    this.sky = null;
    this.enabled = false;
    const camera = sun.shadow.camera;
    this.studio = {
      color: sun.color.clone(), intensity: sun.intensity, position: sun.position.clone(), target: sun.target.position.clone(),
      fillColor: fillLight.color.clone(), groundColor: fillLight.groundColor.clone(), fillIntensity: fillLight.intensity,
      environment: scene.environmentIntensity,
      shadow: Object.fromEntries(['left', 'right', 'top', 'bottom', 'near', 'far'].map(key => [key, camera[key]])),
    };
  }

  update(options) {
    if (!options.enabled) {
      if (this.sky) this.sky.visible = false;
      if (this.enabled) {
        const base = this.studio;
        this.sun.color.copy(base.color); this.sun.intensity = base.intensity;
        this.sun.position.copy(base.position); this.sun.target.position.copy(base.target);
        this.fillLight.color.copy(base.fillColor); this.fillLight.groundColor.copy(base.groundColor); this.fillLight.intensity = base.fillIntensity;
        this.scene.environmentIntensity = base.environment;
        Object.assign(this.sun.shadow.camera, base.shadow);
        this.sun.shadow.camera.updateProjectionMatrix();
        this.renderer.shadowMap.needsUpdate = true;
      }
      this.enabled = false;
      return null;
    }
    const result = solarState(options);
    if (!this.sky) {
      this.sky = new Sky();
      this.sky.scale.setScalar(450000);
      this.sky.frustumCulled = false;
      this.sky.renderOrder = -1;
      this.sky.material.uniforms.turbidity.value = 3;
      this.sky.material.uniforms.rayleigh.value = 1.6;
      this.sky.material.uniforms.cloudCoverage.value = 0;
      this.scene.add(this.sky);
    }
    this.enabled = true;
    this.sky.visible = options.showSky;
    const direction = new Vector3().fromArray(result.direction);
    this.sky.material.uniforms.sunPosition.value.copy(direction).multiplyScalar(450000);
    this.sky.material.uniforms.showSunDisc.value = result.altitude > -0.8;
    const daylight = MathUtils.smoothstep(result.altitude, -6, 15);
    const direct = MathUtils.smoothstep(result.altitude, -0.5, 12);
    this.sun.intensity = direct * DAYLIGHT.sunIntensity;
    this.sun.color.copy(DAYLIGHT.sunLow).lerp(DAYLIGHT.sunHigh, direct);
    // castShadow stays as the studio set it: switching it at the horizon would recompile every
    // material. Below the horizon the sun has no intensity, so its shadows simply vanish.
    this.fillLight.intensity = MathUtils.lerp(DAYLIGHT.fillNight, DAYLIGHT.fillDay, daylight);
    this.fillLight.color.copy(DAYLIGHT.fillColorNight).lerp(DAYLIGHT.fillColorDay, daylight);
    this.fillLight.groundColor.set(DAYLIGHT.ground);
    this.scene.environmentIntensity = MathUtils.lerp(DAYLIGHT.environmentNight, DAYLIGHT.environmentDay, daylight);
    this.sun.position.copy(this.sun.target.position).add(direction);
    if (this.renderer.shadowMap.enabled && result.altitude > 0) {
      const bounds = this.bounds();
      fitDirectionalShadow(this.sun, bounds.receivers || bounds, bounds.casters || bounds);
      this.renderer.shadowMap.needsUpdate = true;
    }
    return result;
  }
}
