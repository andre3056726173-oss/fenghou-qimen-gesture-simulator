import type { GestureSnapshot } from '../types';
import type { MotionState } from './GestureMotionDetector';
import type { GestureTuningStore } from './GestureTuning';

type CalibrationStep = 'OPEN' | 'PUSH' | 'PULL' | 'SWIPE' | 'FLICK' | 'DONE';

const instructions: Record<CalibrationStep, string> = {
  OPEN: '校准：自然张掌并保持 1 秒',
  PUSH: '校准：轻轻向前推掌 3 次',
  PULL: '校准：轻轻向身体方向拉手 3 次',
  SWIPE: '校准：左右短扫各 2 次',
  FLICK: '校准：PINCH 后轻松松开 3 次',
  DONE: '个人手势校准已保存',
};

/** Optional, short calibration flow that derives forgiving personal thresholds. */
export class GestureCalibration {
  active = false;
  private step: CalibrationStep = 'OPEN';
  private readonly samples: Record<string, number[]> = { PUSH: [], PULL: [], SWIPE_LEFT: [], SWIPE_RIGHT: [], FLICK: [] };
  private openSince = 0;
  private pending: { action: string; peak: number } | null = null;
  private lastSampleAt = -Infinity;

  constructor(private readonly tuning: GestureTuningStore) {}

  start() {
    this.active = true;
    this.step = 'OPEN';
    Object.values(this.samples).forEach((values) => { values.length = 0; });
    this.openSince = 0;
    this.pending = null;
    this.lastSampleAt = -Infinity;
    return instructions[this.step];
  }

  update(snapshot: GestureSnapshot, motion: MotionState) {
    if (!this.active) return null;
    if (motion.timestamp <= this.lastSampleAt) return instructions[this.step];
    this.lastSampleAt = motion.timestamp;
    if (!snapshot.handCount) { this.pending = null; this.openSince = 0; return instructions[this.step]; }
    if (this.step === 'OPEN') {
      if (!snapshot.openPalm) { this.openSince = 0; return instructions[this.step]; }
      if (!this.openSince) this.openSince = motion.timestamp;
      if (motion.timestamp - this.openSince >= 1000) {
        this.tuning.update({ handScaleBaseline: snapshot.handScale });
        return this.advance('PUSH');
      }
      return instructions[this.step];
    }
    const expected = this.step === 'SWIPE' ? motion.action?.startsWith('SWIPE') : motion.action === this.step;
    const measurement = motion.action === 'PUSH' ? motion.pushEvidence : motion.action === 'PULL' ? motion.pullEvidence
      : motion.action === 'FLICK' ? motion.pinchSeparationVelocity : motion.swipeDisplacement;
    // Collect a peak per continuous gesture. A neutral/release interval finishes ONE attempt.
    if (expected && motion.action && (!this.pending || this.pending.action === motion.action)) {
      if (Number.isFinite(measurement)) this.pending = { action: motion.action, peak: Math.max(measurement, this.pending?.peak ?? 0) };
      return instructions[this.step];
    }
    if (!this.pending) return instructions[this.step];
    const completed = this.pending; this.pending = null;
    this.samples[completed.action].push(completed.peak);
    if (this.step === 'PUSH') {
      if (this.samples.PUSH.length >= 3) { this.tuning.update({ pushThreshold: this.threshold(this.samples.PUSH, 0.28, 0.56, 0.78) }); return this.advance('PULL'); }
    }
    if (this.step === 'PULL') {
      if (this.samples.PULL.length >= 3) { this.tuning.update({ pullThreshold: this.threshold(this.samples.PULL, 0.28, 0.56, 0.78) }); return this.advance('SWIPE'); }
    }
    if (this.step === 'SWIPE') {
      // Preserve the existing 0.16 factor via equivalent velocity for the 160ms detector window.
      if (this.samples.SWIPE_LEFT.length >= 2 && this.samples.SWIPE_RIGHT.length >= 2) { this.tuning.update({ swipeThreshold: this.threshold([...this.samples.SWIPE_LEFT, ...this.samples.SWIPE_RIGHT].map(distance => distance / 0.16), 0.07, 0.18, 0.16) }); return this.advance('FLICK'); }
    }
    if (this.step === 'FLICK') {
      if (this.samples.FLICK.length >= 3) { this.tuning.update({ flickThreshold: this.threshold(this.samples.FLICK, 0.65, 1.35, 0.9) }); this.tuning.save(); this.active = false; return this.advance('DONE'); }
    }
    return instructions[this.step];
  }

  private threshold(values: number[], min: number, max: number, multiplier: number) {
    const sorted = [...values].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    return Math.max(min, Math.min(max, median * multiplier));
  }

  private advance(step: CalibrationStep) {
    this.step = step;
    return instructions[step];
  }
}
