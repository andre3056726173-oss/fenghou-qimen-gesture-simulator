import type { GestureSnapshot } from '../types';
import type { MotionState } from './GestureMotionDetector';
import type { SpellCastStage } from '../spells/SpellContext';

export type ReadyMotionStage = 'WAIT_RELEASE_AFTER_LOCK' | 'WAIT_READY' | 'WAIT_READY_NEUTRAL' | 'ARMED' | 'CANDIDATE' | 'CONFIRMED' | 'COOLDOWN';
export interface ReadyMotionInput {
  snapshot: GestureSnapshot; motion: MotionState; timestamp: number; freshSample: boolean;
  stage: SpellCastStage; stableOpen?: boolean; stablePinch?: boolean; stablePoint?: boolean;
  rotating?: boolean; space?: boolean; threshold: number;
}

/** Shared KUN/XUN cycle admission. No cast-intent buffer: all edges start after READY + neutral. */
export class ReadyMotionCastController {
  state: ReadyMotionStage = 'WAIT_READY';
  failure = 'WAIT_READY';
  neutral = false;
  castGate = false;
  private lastTimestamp = -Infinity;
  private lastStage: SpellCastStage = 'NONE';
  private releaseSince: number | null = null;
  private neutralSince: number | null = null;
  private lockConsumed = false;
  private candidate: MotionState | null = null;
  constructor(private readonly kind: 'PUSH' | 'SWIPE') {}
  reset() {
    this.state = 'WAIT_READY'; this.failure = 'WAIT_READY'; this.neutral = false; this.castGate = false;
    this.lastTimestamp = -Infinity; this.lastStage = 'NONE'; this.releaseSince = null;
    this.neutralSince = null; this.lockConsumed = false; this.candidate = null;
  }
  consumeLock() { this.reset(); this.lockConsumed = true; this.state = 'WAIT_RELEASE_AFTER_LOCK'; }
  acknowledge(accepted: boolean) {
    if (!this.castGate) return;
    this.state = 'COOLDOWN'; this.failure = accepted ? 'NONE' : 'CAST_REJECTED';
    this.castGate = false; this.candidate = null; this.neutral = false;
  }
  update(input: ReadyMotionInput): MotionState {
    const { snapshot: s, motion: m, timestamp: now } = input;
    const blocked = { ...m, action: m.action === 'HOLD' ? 'HOLD' as const : null };
    this.castGate = false;
    if (!s.handCount || !s.palmCenter) { this.disarm('HAND_LOST'); this.releaseSince = null; return blocked; }
    if (!input.freshSample || now <= this.lastTimestamp) { this.failure = 'STALE_SAMPLE'; return blocked; }
    const continuous = this.lastTimestamp !== -Infinity && now - this.lastTimestamp <= 120;
    this.lastTimestamp = now;
    if (this.state === 'COOLDOWN' || input.stage === 'CASTING' || input.stage === 'COOLDOWN') {
      this.state = 'COOLDOWN'; this.failure = 'CAST_COOLDOWN'; return blocked;
    }
    if (!continuous) this.disarm('HAND_LOST');
    const released = !s.pinchActive && !input.stablePinch && !s.pointing && !input.stablePoint && s.normalizedPinchDistance > .25;
    if (this.lockConsumed) {
      if (!released) this.releaseSince = null;
      else if (this.releaseSince === null) this.releaseSince = now;
      if (this.releaseSince === null || now - this.releaseSince < 80) {
        this.state = 'WAIT_RELEASE_AFTER_LOCK'; this.failure = 'INPUT_CONSUMED_BY_LOCK'; return blocked;
      }
      this.lockConsumed = false;
    }
    if (input.stage !== 'READY') { this.disarm('ACTION_BEFORE_READY'); this.state = 'WAIT_READY'; this.lastStage = input.stage; return blocked; }
    if (this.lastStage !== 'READY') this.disarm('WAIT_READY_NEUTRAL');
    this.lastStage = 'READY';
    const open = s.openPalm && input.stableOpen !== false && released;
    if (!open || input.rotating || input.space || s.twoHandsOpen || s.twoHandsPinch) { this.disarm('STATE_CONFLICT'); return blocked; }
    if (!this.neutral) {
      const quiet = m.speed < .13 && Math.abs(m.scaleRate ?? 0) < .03 && m.pushEvidence < .28 && m.pullEvidence < .28 && !m.swipe.action;
      if (!quiet) this.neutralSince = null;
      else if (this.neutralSince === null) this.neutralSince = now;
      if (this.neutralSince === null || now - this.neutralSince < 120) { this.failure = 'WAIT_READY_NEUTRAL'; return blocked; }
      this.neutral = true; this.state = 'ARMED'; this.failure = 'NO_NEW_ACTION'; return blocked;
    }
    const action = this.kind === 'SWIPE' ? m.swipe.action : m.action === 'PUSH' ? 'PUSH' : null;
    const valid = this.kind === 'PUSH'
      ? m.action !== 'PULL' && m.pushEvidence >= input.threshold && m.pullEvidence < input.threshold && (m.depthVelocity < 0 || (m.scaleRate ?? 0) > 0)
      : m.action !== 'FLICK' && m.swipe.failure === 'NONE' && m.swipe.consistency >= .8 && m.swipe.horizontalRatio > .5 &&
        Math.abs(m.swipe.horizontal) >= input.threshold && m.swipe.verticalTravel < Math.abs(m.swipe.horizontal) / 1.15;
    if (this.state === 'CANDIDATE') {
      const prior = this.candidate!;
      const sameDirection = this.kind === 'PUSH' || Math.sign(m.swipe.horizontal) === Math.sign(prior.swipe.horizontal);
      if (valid && sameDirection && now - prior.timestamp <= 120) {
        this.state = 'CONFIRMED'; this.castGate = true; this.failure = 'NONE';
        return { ...m, action: prior.action, timestamp: prior.timestamp, direction: prior.direction, intensity: prior.intensity };
      }
      this.disarm('ACTION_NOT_CONFIRMED'); return blocked;
    }
    if (this.state === 'CONFIRMED') { this.state = 'COOLDOWN'; this.failure = 'CAST_COOLDOWN'; return blocked; }
    if (valid && action) {
      this.state = 'CANDIDATE'; this.failure = 'NONE';
      this.candidate = { ...m, action, timestamp: now, direction: this.kind === 'SWIPE' ? { x: action === 'SWIPE_LEFT' ? -1 : 1, y: 0, z: 0 } : m.direction };
    } else this.failure = this.kind === 'SWIPE' ? m.swipe.failure : m.action && m.action !== 'HOLD' ? 'WRONG_CAST_ACTION' : 'PUSH_BELOW_THRESHOLD';
    return blocked;
  }
  private disarm(reason: string) {
    this.state = 'WAIT_READY_NEUTRAL'; this.failure = reason; this.neutral = false; this.castGate = false;
    this.neutralSince = null; this.candidate = null;
  }
}
