import type { GestureSnapshot, Landmark } from '../types';
import type { SpellCastStage } from '../spells/SpellContext';
import type { MotionState } from './GestureMotionDetector';

export type ZhenFlickStage = 'IDLE' | 'WAIT_RELEASE_AFTER_LOCK' | 'READY_FOR_CAST_PINCH' | 'FLICK_ARMED' | 'RELEASE_CANDIDATE' | 'FLICK_CONFIRMED' | 'COOLDOWN';
export type ZhenFlickFailure = 'NONE' | 'NO_ZHEN_LOCK' | 'SPELL_NOT_READY' | 'WAITING_RELEASE_AFTER_LOCK' | 'NO_NEW_PINCH' | 'FLICK_NOT_ARMED' | 'RELEASE_TOO_SLOW' | 'PINCH_SEPARATION_TOO_LOW' | 'TIP_SPEED_TOO_LOW' | 'STALE_SAMPLE' | 'HAND_LOST' | 'CAST_COOLDOWN' | 'INPUT_CONSUMED_BY_LOCK' | 'INPUT_CONSUMED_BY_ROTATE' | 'FLICK_BELOW_THRESHOLD' | 'CAST_REJECTED';
export interface ZhenFlickInput {
  snapshot: GestureSnapshot;
  motion: MotionState;
  sampleTimestamp: number;
  freshSample: boolean;
  lockedSector: number | null;
  activeSpell: string | null;
  spellStage: SpellCastStage;
  formationActive: boolean;
  flickThreshold: number;
  holdMs: number;
}
export interface ZhenFlickStatus {
  stage: ZhenFlickStage;
  failure: ZhenFlickFailure;
  pinchEnter: boolean;
  pinchRelease: boolean;
  lockPinchConsumed: boolean;
  separationVelocity: number;
  indexTipVelocity: number;
  thumbTipVelocity: number;
  handSpeed: number;
  holdMs: number;
  score: number;
  freshSample: boolean;
  castGate: boolean;
}
interface FingerSample { timestamp: number; pinch: boolean; gap: number; index: Landmark; thumb: Landmark }
const initialStatus = (): ZhenFlickStatus => ({ stage: 'IDLE', failure: 'NO_ZHEN_LOCK', pinchEnter: false, pinchRelease: false, lockPinchConsumed: false, separationVelocity: 0, indexTipVelocity: 0, thumbTipVelocity: 0, handSpeed: 0, holdMs: 0, score: 0, freshSample: false, castGate: false });

/** Owns only real-camera ZHEN cast pinch cycles. Raw FLICK and input-buffer history cannot arm it. */
export class ZhenFlickController {
  status = initialStatus();
  private previous: FingerSample | null = null;
  private lastSampleAt = -Infinity;
  private releaseSince: number | null = null;
  private neutral = false;
  private armedAt = 0;
  private candidateAt = 0;
  private candidateScore = 0;
  private lastSpellStage: SpellCastStage = 'NONE';

  reset() {
    this.status = initialStatus(); this.previous = null; this.lastSampleAt = -Infinity;
    this.releaseSince = null; this.neutral = false; this.lastSpellStage = 'NONE';
    this.armedAt = 0; this.candidateAt = 0; this.candidateScore = 0;
  }

  consumeLock(sector: number) {
    if (sector !== 6) { this.reset(); return; }
    this.waitRelease('INPUT_CONSUMED_BY_LOCK');
    this.status.lockPinchConsumed = true;
  }

  consumeRotation() {
    this.waitRelease('INPUT_CONSUMED_BY_ROTATE');
  }

  /** Admission is resolved before the lower state machine can grab a plate. LOCK still wins. */
  ownsPinch(lockedSector: number | null, activeSpell: string | null, stage: SpellCastStage) {
    return lockedSector === 6 && activeSpell === 'ZHEN_LIGHTNING' &&
      (stage === 'READY' || stage === 'CASTING' || stage === 'COOLDOWN' || this.status.lockPinchConsumed);
  }

  interactionPriority(input: { lockedSector: number | null; activeSpell: string | null; stage: SpellCastStage;
    lockingCandidate: boolean; pointingState: boolean; focusedSector: number | null; pinchActive: boolean; stablePinch: boolean }) {
    const owned = this.ownsPinch(input.lockedSector, input.activeSpell, input.stage);
    const newTarget = input.pointingState || input.focusedSector !== null && input.focusedSector !== input.lockedSector;
    return {
      locking: input.lockingCandidate && (!owned || newTarget),
      spellArming: owned && (input.pinchActive || input.stablePinch || ['FLICK_ARMED', 'RELEASE_CANDIDATE'].includes(this.status.stage)),
    };
  }

  acknowledgeCast(accepted: boolean) {
    if (!this.status.castGate) return;
    if (!accepted) this.status.failure = 'CAST_REJECTED';
    this.status.castGate = false;
    this.status.stage = 'COOLDOWN';
    this.neutral = false; this.releaseSince = null;
  }

  update(input: ZhenFlickInput): MotionState {
    const { snapshot, motion, sampleTimestamp: now } = input;
    const zhen = input.lockedSector === 6 && input.activeSpell === 'ZHEN_LIGHTNING';
    const blocked = { ...motion, action: motion.action === 'HOLD' ? 'HOLD' as const : null, flickScore: 0 };
    this.status.pinchEnter = false; this.status.pinchRelease = false;
    this.status.castGate = false; this.status.freshSample = false;
    if (!snapshot.handCount || !snapshot.palmCenter) {
      this.previous = null; this.waitRelease('HAND_LOST');
      return zhen ? blocked : motion;
    }
    if (!input.freshSample || now <= this.lastSampleAt) {
      this.status.failure = 'STALE_SAMPLE';
      return zhen ? blocked : motion;
    }
    this.lastSampleAt = now;
    this.status.freshSample = true;
    const points = snapshot.landmarks[0];
    if (!points || points.length !== 21 || !Number.isFinite(snapshot.handScale) || snapshot.handScale <= 0 ||
      !Number.isFinite(snapshot.normalizedPinchDistance) || points.some(p => !Number.isFinite(p.x + p.y + p.z))) {
      this.previous = null; this.waitRelease('HAND_LOST');
      return zhen ? blocked : motion;
    }
    // Relative to wrist and normalized by palm size: whole-hand translation is not finger motion.
    const relative = (point: Landmark): Landmark => ({ x: (point.x - points[0].x) / snapshot.handScale, y: (point.y - points[0].y) / snapshot.handScale, z: (point.z - points[0].z) / snapshot.handScale });
    const sample: FingerSample = { timestamp: now, pinch: snapshot.pinchActive, gap: snapshot.normalizedPinchDistance, index: relative(points[8]), thumb: relative(points[4]) };
    const old = this.previous;
    this.previous = sample;
    const dt = old ? (now - old.timestamp) / 1000 : 0;
    const continuous = old !== null && dt > 0 && dt <= 0.12;
    if (!continuous) this.waitRelease(old ? 'HAND_LOST' : 'NO_NEW_PINCH');
    const tipSpeed = (a: Landmark, b: Landmark) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) / dt;
    this.status.separationVelocity = continuous ? (sample.gap - old!.gap) / dt : 0;
    this.status.indexTipVelocity = continuous ? tipSpeed(sample.index, old!.index) : 0;
    this.status.thumbTipVelocity = continuous ? tipSpeed(sample.thumb, old!.thumb) : 0;
    this.status.handSpeed = motion.speed;
    this.status.pinchEnter = continuous && !old!.pinch && sample.pinch;
    this.status.pinchRelease = continuous && old!.pinch && !sample.pinch;
    if (!zhen || !input.formationActive) {
      this.waitRelease(zhen ? 'SPELL_NOT_READY' : 'NO_ZHEN_LOCK');
      this.lastSpellStage = input.spellStage;
      return motion;
    }
    const enteringReady = input.spellStage === 'READY' && this.lastSpellStage !== 'READY';
    this.lastSpellStage = input.spellStage;
    if (['CASTING', 'COOLDOWN'].includes(input.spellStage) || this.status.stage === 'COOLDOWN') {
      this.status.stage = 'COOLDOWN'; this.status.failure = 'CAST_COOLDOWN';
      // Do not reuse a confirmed cycle even if the lifecycle was cancelled/recreated.
      if (input.spellStage === 'NONE' && this.observeNeutral(sample, snapshot.pointing)) this.waitRelease('NO_NEW_PINCH');
      return blocked;
    }
    if (input.spellStage !== 'READY') {
      // No release before READY can become a future cast; neutral evidence may accumulate.
      this.observeNeutral(sample, snapshot.pointing);
      this.status.failure = this.status.lockPinchConsumed ? 'WAITING_RELEASE_AFTER_LOCK' : 'SPELL_NOT_READY';
      return blocked;
    }
    // A pinch already present across the READY boundary is never a cast pinch.
    if (enteringReady && sample.pinch && !this.status.pinchEnter) this.waitRelease('NO_NEW_PINCH');
    if (this.status.stage === 'RELEASE_CANDIDATE') {
      if (!sample.pinch && sample.gap > 0.25 && continuous && now - this.candidateAt <= 120) {
        this.status.stage = 'FLICK_CONFIRMED'; this.status.failure = 'NONE';
        this.status.castGate = true; this.status.score = this.candidateScore;
        return { ...blocked, action: 'FLICK', timestamp: this.candidateAt, flickScore: this.candidateScore,
          anticipation: 1, intensity: Math.max(0.75, Math.min(1.25, 0.75 + this.candidateScore * 0.5)) };
      }
      this.waitRelease('FLICK_BELOW_THRESHOLD');
    } else if (this.status.stage === 'FLICK_CONFIRMED') {
      this.status.stage = 'COOLDOWN'; this.status.failure = 'CAST_COOLDOWN'; return blocked;
    }
    if (this.status.stage === 'FLICK_ARMED') {
      this.status.holdMs = now - this.armedAt;
      if (this.status.pinchRelease) {
        const separation = this.status.separationVelocity;
        const tip = Math.max(this.status.indexTipVelocity, this.status.thumbTipVelocity);
        this.status.score = Math.min(1, Math.max(0, separation / input.flickThreshold)) * Math.min(1, tip / (input.flickThreshold * 0.5)) * Math.min(1, this.status.holdMs / input.holdMs);
        let failure: ZhenFlickFailure = 'NONE';
        if (this.status.holdMs < input.holdMs) failure = 'FLICK_NOT_ARMED';
        else if (sample.gap - old!.gap < 0.07) failure = 'PINCH_SEPARATION_TOO_LOW';
        else if (separation <= input.flickThreshold) failure = 'RELEASE_TOO_SLOW';
        else if (tip < input.flickThreshold * 0.5) failure = 'TIP_SPEED_TOO_LOW';
        else if (this.status.score < 0.99) failure = 'FLICK_BELOW_THRESHOLD';
        if (failure === 'NONE') {
          this.status.stage = 'RELEASE_CANDIDATE'; this.status.failure = 'NONE';
          this.candidateAt = now; this.candidateScore = this.status.score;
        } else this.waitRelease(failure);
      }
      return blocked;
    }
    if (this.status.pinchEnter && this.neutral && !enteringReady) {
      this.status.stage = 'FLICK_ARMED'; this.status.failure = 'NONE'; this.status.holdMs = 0; this.status.score = 0;
      this.armedAt = now; this.neutral = false; this.releaseSince = null;
      return blocked;
    }
    if (this.observeNeutral(sample, snapshot.pointing)) {
      this.status.stage = 'READY_FOR_CAST_PINCH'; this.status.failure = 'NO_NEW_PINCH';
    } else if (this.status.lockPinchConsumed) this.status.failure = 'WAITING_RELEASE_AFTER_LOCK';
    else this.status.failure = 'NO_NEW_PINCH';
    return blocked;
  }

  private observeNeutral(sample: FingerSample, pointing: boolean) {
    if (sample.pinch || sample.gap <= 0.25 || pointing) { this.releaseSince = null; return this.neutral; }
    if (this.releaseSince === null) this.releaseSince = sample.timestamp;
    if (sample.timestamp - this.releaseSince >= 80) {
      this.neutral = true; this.status.lockPinchConsumed = false;
    }
    return this.neutral;
  }

  private waitRelease(failure: ZhenFlickFailure) {
    this.status.stage = 'WAIT_RELEASE_AFTER_LOCK'; this.status.failure = failure;
    this.status.castGate = false; this.neutral = false; this.releaseSince = null;
  }
}
