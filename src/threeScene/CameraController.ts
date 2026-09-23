import * as THREE from 'three';
import type { SpellId } from '../spells/SpellDefinition';

export interface CameraCue {
  reveal: number;
  lockPulse: number;
}

export class CameraController {
  // A shallow downward pitch keeps the formation front-facing while still giving it depth.
  private readonly base = new THREE.Vector3(0, 3.1, 9.2);
  private readonly target = new THREE.Vector3(0, 1.38, -1.85);
  private readonly pointer = new THREE.Vector2();
  private shake = 0;
  private reveal = 0;
  private spellDrift = 0;
  private spellRefraction = 0;
  private spellFovPulse = 0;
  private fixed = false;
  private readonly destination = new THREE.Vector3();
  private readonly onPointerMove = (event: PointerEvent) => {
    if (!this.fixed) this.pointer.set((event.clientX / window.innerWidth) * 2 - 1, -(event.clientY / window.innerHeight) * 2 + 1);
  };

  constructor(private readonly camera: THREE.PerspectiveCamera) {
    camera.position.copy(this.base);
    camera.lookAt(this.target);
    window.addEventListener('pointermove', this.onPointerMove);
  }

  cue(value: CameraCue) {
    this.reveal = value.reveal;
    if (value.lockPulse > 0) this.pulse(0.09);
  }

  pulse(amount = 0.06) {
    this.shake = Math.max(this.shake, amount);
  }

  spellEffect(spell: SpellId, intensity = 1) {
    if (spell === 'XUN_WIND') this.spellDrift = Math.max(this.spellDrift, 0.045 * intensity);
    if (spell === 'KAN_WATER') this.spellRefraction = Math.max(this.spellRefraction, 0.032 * intensity);
    if (spell === 'ZHEN_LIGHTNING') this.spellFovPulse = Math.max(this.spellFovPulse, 0.8 * intensity);
  }

  update(delta: number, elapsed: number) {
    const shakeX = (Math.sin(elapsed * 51.3) * 0.65 + Math.sin(elapsed * 83.7) * 0.35) * this.shake;
    const shakeY = (Math.sin(elapsed * 67.1) * 0.65 + Math.sin(elapsed * 93.2) * 0.35) * this.shake;
    const windDrift = Math.sin(elapsed * 5.6) * this.spellDrift;
    const destination = this.destination.copy(this.base);
    destination.x += this.pointer.x * 0.16 + shakeX + windDrift;
    destination.y += this.pointer.y * 0.08 + shakeY;
    destination.z += Math.abs(this.pointer.x) * 0.12;
    this.camera.position.lerp(destination, 1 - Math.pow(0.001, delta));
    const refraction = Math.sin(elapsed * 4.1) * this.spellRefraction;
    const targetFov = THREE.MathUtils.lerp(45, 55, this.reveal) + Math.sin(elapsed * 32) * this.spellFovPulse * 0.08;
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, delta * 4.5);
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(this.target);
    this.camera.rotation.z += refraction * 0.012;
    this.shake *= Math.pow(0.08, delta);
    this.spellDrift *= Math.pow(0.015, delta);
    this.spellRefraction *= Math.pow(0.04, delta);
    this.spellFovPulse *= Math.pow(0.001, delta);
  }
  setFixed(fixed: boolean) { this.fixed = fixed; this.pointer.set(0, 0); }
  dispose() { window.removeEventListener('pointermove', this.onPointerMove); }
}
