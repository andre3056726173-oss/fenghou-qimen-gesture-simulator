import * as THREE from 'three';
import { QimenFormation } from './QimenFormation';
import { FRONT_FORMATION_CENTER, FRONT_FORMATION_PITCH } from './FormationStyle';

export type FormationPhase = 'IDLE' | 'SUMMONING' | 'ACTIVE' | 'COLLAPSING';

export interface FormationCameraCue {
  reveal: number;
  lockPulse: number;
}

/** Owns the summon/collapse timelines. Interaction never mutates reveal opacity directly. */
export class FormationAnimator {
  readonly summonDuration = 2.5;
  readonly collapseDuration = 1.05;
  phase: FormationPhase = 'IDLE';
  private elapsed = 0;
  private demo = false;
  private holdDemo = false;
  private demoClock = 0;
  private lockSent = false;
  private summonOrigin = FRONT_FORMATION_CENTER.clone();
  private summonTarget = FRONT_FORMATION_CENTER.clone();

  constructor(private readonly formation: QimenFormation, private readonly cameraCue: (cue: FormationCameraCue) => void) {
    this.formation.reset();
  }

  summon(origin?: THREE.Vector3, target?: THREE.Vector3) {
    if (this.phase !== 'IDLE') return false;
    this.phase = 'SUMMONING';
    this.elapsed = 0;
    this.demo = false;
    this.holdDemo = false;
    this.lockSent = false;
    this.summonOrigin.copy(origin ?? this.summonTarget);
    this.summonTarget.copy(target ?? FRONT_FORMATION_CENTER);
    this.formation.reset();
    this.formation.setWorldTransform(this.summonOrigin, FRONT_FORMATION_PITCH, 0, 0);
    return true;
  }

  collapse() {
    if (this.phase === 'IDLE' || this.phase === 'COLLAPSING') return false;
    this.phase = 'COLLAPSING';
    this.elapsed = 0;
    this.formation.beginCollapse();
    return true;
  }

  restart() {
    this.phase = 'IDLE';
    this.elapsed = 0;
    this.demo = false;
    this.holdDemo = false;
    this.demoClock = 0;
    this.lockSent = false;
    this.formation.reset();
  }

  startDemo(hold = false) {
    this.phase = 'SUMMONING';
    this.elapsed = 0;
    this.demoClock = 0;
    this.demo = true;
    this.holdDemo = hold;
    this.lockSent = false;
    this.formation.reset();
  }

  update(delta: number) {
    if (this.phase === 'IDLE') {
      this.cameraCue({ reveal: 0, lockPulse: 0 });
      return;
    }
    this.elapsed += delta;

    if (this.phase === 'SUMMONING') this.updateSummon();
    else if (this.phase === 'COLLAPSING') this.updateCollapse();
    else this.updateActive(delta);

    if (this.demo) this.updateDemo(delta);
  }

  private updateSummon() {
    const t = this.elapsed;
    const center = this.range(t, 0, 0.2);
    const axes = this.range(t, 0.12, 0.48);
    const earth = this.range(t, 0.22, 0.82);
    const human = this.range(t, 0.34, 1.02);
    const heaven = this.range(t, 0.48, 1.22);
    const spirit = this.range(t, 0.66, 1.42);
    const expansion = this.easeInOut(this.range(t, 0.16, 1.82));
    const rearrange = this.range(t, 1.35, 2.02);
    const locked = this.range(t, 1.96, 2.34);
    const travel = this.easeOut(this.range(t, 0.03, 1.16));
    this.formation.setWorldTransform(this.summonOrigin.clone().lerp(this.summonTarget, travel), FRONT_FORMATION_PITCH, 0, 0);
    this.formation.setReveal(Math.max(center * 0.025, expansion));
    this.formation.setLayerStrokeProgress(0, Math.max(axes, earth));
    this.formation.setLayerStrokeProgress(1, human);
    this.formation.setLayerStrokeProgress(2, heaven);
    this.formation.setLayerStrokeProgress(3, spirit);
    this.formation.setRotationVelocity(rearrange > 0 && rearrange < 1 ? 2.8 * (1 - rearrange * 0.5) : 0);
    this.formation.setLayerOffset(0, 0);
    this.formation.setLayerOffset(1, 0);
    this.formation.setLayerOffset(2, 0);
    this.formation.setLayerOffset(3, 0);
    this.formation.setLayerDepthOffset(0, 0);
    this.formation.setLayerDepthOffset(1, rearrange * 0.02);
    this.formation.setLayerDepthOffset(2, rearrange * 0.05);
    this.formation.setLayerDepthOffset(3, rearrange * 0.08);
    const lockPulse = locked > 0 && !this.lockSent ? 1 : 0;
    if (lockPulse) this.lockSent = true;
    this.cameraCue({ reveal: expansion, lockPulse });
    if (this.elapsed >= this.summonDuration) {
      this.phase = 'ACTIVE';
      this.elapsed = 0;
      if (this.demo) this.demoClock = 0;
      this.formation.holdOpen();
    }
  }

  private updateActive(delta: number) {
    this.formation.holdOpen();
    this.cameraCue({ reveal: 1, lockPulse: 0 });
    // Active formation motion is driven by QimenFormation; this timeline stays paused.
    void delta;
  }

  private updateCollapse() {
    const progress = THREE.MathUtils.clamp(this.elapsed / this.collapseDuration, 0, 1);
    this.formation.setCollapse(progress);
    this.cameraCue({ reveal: 1 - progress, lockPulse: 0 });
    if (progress >= 1) {
      this.phase = 'IDLE';
      this.elapsed = 0;
      this.formation.reset();
    }
  }

  private updateDemo(delta: number) {
    this.demoClock += delta;
    if (this.phase === 'ACTIVE' && this.demoClock > 1.2 && this.demoClock < 1.24) {
      this.formation.activate(6, 1);
      this.cameraCue({ reveal: 1, lockPulse: 1 });
    }
    if (!this.holdDemo && this.phase === 'ACTIVE' && this.demoClock > 4.8) this.collapse();
    if (this.phase === 'IDLE' && this.demoClock > 6.1) {
      this.demoClock = 0;
      this.startDemo();
    }
  }

  private range(value: number, start: number, end: number) {
    return THREE.MathUtils.clamp((value - start) / (end - start), 0, 1);
  }

  private easeInOut(value: number) {
    return value * value * (3 - 2 * value);
  }

  private easeOut(value: number) {
    return 1 - (1 - value) ** 3;
  }
}
