import type { SpellId } from './SpellDefinition';

export interface CameraImpulseTarget {
  pulse(amount: number): void;
  spellEffect?(spell: SpellId, intensity?: number): void;
}

/** Small, deliberately restrained camera impulses used only after the formation responds. */
export class SpellCameraEffects {
  private intensity = 1;
  constructor(private readonly camera: CameraImpulseTarget) {}

  setIntensity(intensity: number) { this.intensity = Math.max(0, Math.min(1.25, intensity)); }

  trigger(spell: SpellId) {
    const amount = spell === 'ZHEN_LIGHTNING' ? 0.1 : spell === 'KUN_EARTH' ? 0.045 : spell === 'XUN_WIND' ? 0.025 : 0.03;
    this.camera.pulse(amount * this.intensity);
    this.camera.spellEffect?.(spell, this.intensity);
  }
}
