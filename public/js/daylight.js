import { Color, MathUtils, Vector3 } from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { solarState } from './solar-time.js';
import { fitDirectionalShadow } from './shadow-fit.js';

export class Daylight {
  constructor({ scene, sun, fillLight, renderer, bounds }) {
    Object.assign(this, { scene, sun, fillLight, renderer, bounds });
    this.sky = null;
    this.enabled = false;
    const camera = sun.shadow.camera;
    this.studio = {
      color: sun.color.clone(), intensity: sun.intensity, position: sun.position.clone(), target: sun.target.position.clone(), castShadow: sun.castShadow,
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
        this.sun.position.copy(base.position); this.sun.target.position.copy(base.target); this.sun.castShadow = base.castShadow;
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
    this.sun.intensity = direct * 3.2;
    this.sun.color.copy(new Color(0xffbb7d).lerp(new Color(0xfff5e7), direct));
    this.sun.castShadow = result.altitude > 0;
    this.fillLight.intensity = MathUtils.lerp(0.12, 1.35, daylight);
    this.fillLight.color.copy(new Color(0x879fc9).lerp(new Color(0xe1ecff), daylight));
    this.fillLight.groundColor.set(0x8d8173);
    this.scene.environmentIntensity = MathUtils.lerp(0.04, 0.6, daylight);
    this.sun.position.copy(this.sun.target.position).add(direction);
    if (this.renderer.shadowMap.enabled && this.sun.castShadow) {
      const bounds = this.bounds();
      fitDirectionalShadow(this.sun, bounds.receivers || bounds, bounds.casters || bounds);
      this.renderer.shadowMap.needsUpdate = true;
    }
    return result;
  }
}
