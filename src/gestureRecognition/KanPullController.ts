import type { GestureSnapshot } from '../types';
import type { SpellCastStage } from '../spells/SpellContext';
import type { MotionState } from './GestureMotionDetector';
import { validHandLandmarks } from '../handTracking/FrameSampleGate';

export type KanPullStage = 'IDLE' | 'WAIT_RELEASE_AFTER_LOCK' | 'WAIT_READY' | 'WAIT_READY_NEUTRAL' | 'READY_FOR_PULL' | 'PULL_CANDIDATE' | 'PULL_CONFIRMED' | 'COOLDOWN';
export type KanPullFailure = 'NONE' | 'NO_KAN_LOCK' | 'SPELL_NOT_READY' | 'WAIT_RELEASE_AFTER_LOCK' | 'WAIT_READY' | 'WAIT_READY_NEUTRAL' | 'NOT_OPEN_PALM' | 'PULL_BEFORE_READY' | 'NO_NEW_PULL' | 'PULL_BELOW_THRESHOLD' | 'PULL_DIRECTION_INVALID' | 'PULL_NOT_CONFIRMED' | 'STALE_SAMPLE' | 'HAND_LOST' | 'INPUT_CONSUMED' | 'CAST_REJECTED' | 'CAST_COOLDOWN';
export interface KanPullStatus {
  kanPullState: KanPullStage;
  failure: KanPullFailure;
  lockCycleConsumed: boolean;
  readyNeutral: boolean;
  freshSample: boolean;
  castGate: boolean;
  newPullEdge: boolean;
  directionConsistency: number;
  depthVelocity: number;
  scaleRate: number;
  pullEvidence: number;
  pullScore: number;
}
export interface KanPullInput {
  snapshot: GestureSnapshot;
  motion: MotionState;
  timestamp: number;
  freshSample: boolean;
  stableOpenPalm: boolean;
  stablePinch: boolean;
  stablePoint: boolean;
  rotating: boolean;
  spaceManipulation: boolean;
  lockedSector: number | null;
  activeSpell: string | null;
  spellStage: SpellCastStage;
  formationActive: boolean;
  pullThreshold: number;
}
interface PullSample { timestamp: number; scale: number; z: number; angle: number; aspect: number }
const initial = (): KanPullStatus => ({ kanPullState: 'IDLE', failure: 'NO_KAN_LOCK', lockCycleConsumed: false,
  readyNeutral: false, freshSample: false, castGate: false, newPullEdge: false, directionConsistency: 0,
  depthVelocity: 0, scaleRate: 0, pullEvidence: 0, pullScore: 0 });

/** Admission, not classification: consumes lock return motion and requires a new post-READY pull. */
export class KanPullController {
  status = initial();
  private lastTimestamp = -Infinity;
  private lastStage: SpellCastStage = 'NONE';
  private releaseSince: number | null = null;
  private neutralSince: number | null = null;
  private readonly history: PullSample[] = [];
  private baseline: PullSample | null = null;
  private candidateAt = 0;
  private belowThreshold = false;

  reset() {
    this.status = initial(); this.lastTimestamp = -Infinity; this.lastStage = 'NONE';
    this.releaseSince = null; this.neutralSince = null; this.history.length = 0;
    this.baseline = null; this.candidateAt = 0; this.belowThreshold = false;
  }

  consumeLock(sector: number) {
    if (sector !== 4) { this.reset(); return; }
    this.disarm('WAIT_RELEASE_AFTER_LOCK');
    this.status.kanPullState = 'WAIT_RELEASE_AFTER_LOCK'; this.status.lockCycleConsumed = true;
    this.releaseSince = null; this.lastStage = 'NONE';
  }

  acknowledgeCast(accepted: boolean) {
    if (!this.status.castGate) return;
    this.status.castGate = false; this.status.kanPullState = 'COOLDOWN';
    this.status.failure = accepted ? 'NONE' : 'CAST_REJECTED';
    this.history.length = 0; this.status.readyNeutral = false;
  }

  update(input: KanPullInput): MotionState {
    const { snapshot: s, motion: m, timestamp: now } = input;
    const kan = input.lockedSector === 4 && input.activeSpell === 'KAN_WATER';
    const blocked = () => ({ ...m, action: m.action === 'HOLD' ? 'HOLD' as const : null });
    this.status.castGate = false; this.status.newPullEdge = false; this.status.freshSample = false;
    if (!kan || !input.formationActive) {
      this.disarm(kan ? 'SPELL_NOT_READY' : 'NO_KAN_LOCK'); this.status.kanPullState = 'IDLE';
      this.lastStage = input.spellStage; return m;
    }
    if (!s.handCount || !s.palmCenter || !validHandLandmarks(s.landmarks[0] ?? []) ||
      !Number.isFinite(s.handScale) || s.handScale <= 0 || !Number.isFinite(m.pullEvidence + m.scaleRate + m.depthVelocity + m.speed)) {
      this.disarm('HAND_LOST'); this.releaseSince = null; return blocked();
    }
    if (!input.freshSample || now <= this.lastTimestamp) { this.status.failure = 'STALE_SAMPLE'; return blocked(); }
    this.status.freshSample = true;
    const continuous = this.lastTimestamp !== -Infinity && now - this.lastTimestamp <= 120;
    this.lastTimestamp = now;
    this.status.depthVelocity = m.depthVelocity; this.status.scaleRate = m.scaleRate;
    this.status.pullEvidence = m.pullEvidence; this.status.pullScore = m.pullScore;
    if (input.spellStage === 'CASTING' || input.spellStage === 'COOLDOWN' || this.status.kanPullState === 'COOLDOWN') {
      this.status.kanPullState = 'COOLDOWN'; this.status.failure = 'CAST_COOLDOWN'; return blocked();
    }
    if (!continuous) { this.disarm('HAND_LOST'); this.releaseSince = null; }
    const released = !s.pinchActive && !input.stablePinch && s.normalizedPinchDistance > 0.25 && !s.pointing && !input.stablePoint;
    if (this.status.lockCycleConsumed) {
      if (!released) this.releaseSince = null;
      else if (this.releaseSince === null) this.releaseSince = now;
      if (this.releaseSince !== null && now - this.releaseSince >= 80) this.status.lockCycleConsumed = false;
      else { this.status.kanPullState = 'WAIT_RELEASE_AFTER_LOCK'; this.status.failure = 'WAIT_RELEASE_AFTER_LOCK'; return blocked(); }
    }
    if (input.spellStage !== 'READY') {
      this.disarm(m.pullEvidence >= input.pullThreshold ? 'PULL_BEFORE_READY' : 'WAIT_READY');
      this.status.kanPullState = 'WAIT_READY'; this.lastStage = input.spellStage; return blocked();
    }
    if (this.lastStage !== 'READY') this.disarm('WAIT_READY_NEUTRAL');
    this.lastStage = 'READY';
    const open = s.openPalm && input.stableOpenPalm && released;
    if (!open || input.rotating || input.spaceManipulation || s.twoHandsPinch || s.twoHandsOpen) {
      this.disarm(!open ? 'NOT_OPEN_PALM' : 'INPUT_CONSUMED'); return blocked();
    }
    const points = s.landmarks[0];
    const width = Math.hypot(points[5].x - points[17].x, points[5].y - points[17].y);
    const height = Math.hypot(points[0].x - points[9].x, points[0].y - points[9].y);
    const sample: PullSample = { timestamp: now, scale: s.handScale, z: s.palmCenter.z, angle: s.palmAngle, aspect: width / Math.max(height, 0.001) };
    if (!this.status.readyNeutral) {
      // The 120ms clock starts only AFTER READY. Facing alone (default .14) cannot satisfy an edge.
      const quiet = m.speed < 0.13 && Math.abs(m.scaleRate) < 0.03 && m.pullEvidence < input.pullThreshold * 0.65;
      if (!quiet) this.neutralSince = null;
      else if (this.neutralSince === null) this.neutralSince = now;
      if (this.neutralSince === null || now - this.neutralSince < 120) {
        this.status.failure = 'WAIT_READY_NEUTRAL'; return blocked();
      }
      this.status.readyNeutral = true; this.status.kanPullState = 'READY_FOR_PULL';
      this.status.failure = 'NO_NEW_PULL'; this.baseline = sample; this.history.length = 0;
      this.history.push(sample); this.belowThreshold = true; return blocked();
    }
    this.history.push(sample);
    while (this.history.length > 6 || now - this.history[0].timestamp > 180) this.history.shift();
    let zForward = 0, zTotal = 0, shrink = 0, scaleTotal = 0;
    for (let i = 1; i < this.history.length; i++) {
      const dz = this.history[i].z - this.history[i - 1].z;
      const ds = this.history[i - 1].scale - this.history[i].scale;
      zForward += Math.max(0, dz); zTotal += Math.abs(dz);
      shrink += Math.max(0, ds); scaleTotal += Math.abs(ds);
    }
    // Z is wrist-relative: sustained apparent shrink is mandatory corroboration, never Z jitter alone.
    const scaleConsistency = scaleTotal > 0.00001 ? shrink / scaleTotal : 0;
    const depthConsistency = zTotal > 0.002 ? zForward / zTotal : 1;
    this.status.directionConsistency = Math.min(scaleConsistency, depthConsistency);
    const lateral = Math.hypot(m.velocity.x, m.velocity.y);
    const angleDelta = Math.atan2(Math.sin(sample.angle - this.baseline!.angle), Math.cos(sample.angle - this.baseline!.angle));
    const aspectStable = this.baseline!.aspect > 0 && Math.abs(sample.aspect / this.baseline!.aspect - 1) < 0.12;
    const directionValid = m.scaleRate < -0.003 && m.depthVelocity >= -0.03 && s.palmFacingCamera &&
      this.status.directionConsistency >= 0.8 && lateral <= Math.max(0.06, m.depthVelocity * 0.7, -m.scaleRate * 1.5) &&
      Math.abs(angleDelta) < 0.12 && aspectStable;
    const evidence = m.pullEvidence >= input.pullThreshold && m.pullZEvidence + m.pullScaleEvidence > 0;
    if (this.status.kanPullState === 'PULL_CANDIDATE') {
      if (directionValid && evidence && now > this.candidateAt && now - this.candidateAt <= 120) {
        this.status.kanPullState = 'PULL_CONFIRMED'; this.status.failure = 'NONE'; this.status.castGate = true;
        return { ...m, action: 'PULL', timestamp: this.candidateAt };
      }
      this.disarm(!directionValid ? 'PULL_DIRECTION_INVALID' : 'PULL_NOT_CONFIRMED'); return blocked();
    }
    if (this.status.kanPullState === 'PULL_CONFIRMED') {
      this.status.kanPullState = 'COOLDOWN'; this.status.failure = 'CAST_COOLDOWN'; return blocked();
    }
    if (evidence) {
      if (!this.belowThreshold) { this.status.failure = 'NO_NEW_PULL'; return blocked(); }
      if (!directionValid) { this.disarm('PULL_DIRECTION_INVALID'); return blocked(); }
      this.status.kanPullState = 'PULL_CANDIDATE'; this.status.newPullEdge = true;
      this.status.failure = 'NONE'; this.candidateAt = now; this.belowThreshold = false;
    } else { this.belowThreshold = true; this.status.failure = 'PULL_BELOW_THRESHOLD'; }
    return blocked();
  }

  private disarm(failure: KanPullFailure) {
    this.status.kanPullState = 'WAIT_READY_NEUTRAL'; this.status.failure = failure;
    this.status.castGate = false; this.status.readyNeutral = false; this.status.directionConsistency = 0;
    this.neutralSince = null; this.baseline = null; this.history.length = 0; this.belowThreshold = false;
  }
}
