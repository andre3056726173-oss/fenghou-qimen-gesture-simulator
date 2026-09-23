import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { VisualQualitySettings } from './VisualQualityConfig';

/**
 * Stable post-process seam.  Future distortion, chromatic aberration, vignette,
 * exposure pulse and radial blur passes attach here instead of QimenScene.
 */
export class PostProcessingPipeline {
  readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  private quality: VisualQualitySettings;
  private readonly reserved = {
    chromaticAberration: false,
    vignette: false,
    distortion: false,
    exposurePulse: false,
    radialBlur: false,
  };

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, quality: VisualQualitySettings) {
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), quality.bloomStrength, quality.bloomRadius, quality.bloomThreshold);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.quality = quality;
  }

  setQuality(quality: VisualQualitySettings) {
    this.quality = quality;
    this.bloom.strength = quality.bloomStrength;
    this.bloom.radius = quality.bloomRadius;
    this.bloom.threshold = quality.bloomThreshold;
  }

  get capabilities() {
    return { ...this.reserved, bloom: true, distortionRequested: this.quality.distortion, motionBlurRequested: this.quality.motionBlur };
  }

  render() { this.composer.render(); }
  setSize(width: number, height: number) { this.composer.setSize(width, height); }
  setPixelRatio(ratio: number) { this.composer.setPixelRatio(ratio); }
  dispose() {
    this.composer.passes.forEach((pass) => pass.dispose());
    this.composer.dispose();
  }
}
