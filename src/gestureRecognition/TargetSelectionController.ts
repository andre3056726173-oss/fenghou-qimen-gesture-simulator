import { TargetLockPinchDetector } from './TargetLockPinchDetector';

export type TargetStage = 'NONE' | 'TARGET_PREVIEW' | 'TARGET_FOCUSED' | 'TARGET_ARMED' | 'LOCK_CANDIDATE' | 'LOCKED';
export interface TargetSample {
  now?: number;
  timestamp: number; fresh: boolean; hasHand: boolean; active: boolean;
  pointing: boolean; pointScore: number; sector: number | null;
  boundaryDistance: number; aimSpeed: number; pinchDistance: number; graceMs: number;
}
export interface TargetEvent { timestamp: number; event: string; sector: number | null; pointScore: number; pinchScore: number; state: TargetStage; latencyMs?: number; }

/** Owns the selected target across POINT -> bent index -> PINCH, on camera time only. */
export class TargetSelectionController {
  stage: TargetStage = 'NONE';
  previewSector: number | null = null;
  focusedSector: number | null = null;
  armedSector: number | null = null;
  lockedSector: number | null = null;
  armedAt = 0;
  focusDwellMs = 100;
  failure = 'POINT_NOT_CONFIRMED';
  readonly pinch = new TargetLockPinchDetector();
  readonly armedWindowMs: number;
  readonly events: TargetEvent[] = [];
  private candidate: number | null = null;
  private candidateAt = 0;
  private samples = 0;
  private missingAt: number | null = null;
  private lastAt = -Infinity;
  private lastFailure = '';

  constructor(options: { armedWindowMs?: number } = {}) {
    this.armedWindowMs = Math.max(600, Math.min(800, options.armedWindowMs ?? 700));
  }

  update(input: TargetSample) {
    this.events.length = 0;
    // Expiry may run on wall time when the camera stops. Evidence still uses sample time.
    const now = input.now ?? input.timestamp;
    if (!input.hasHand) this.missingAt ??= now;
    if (this.armedSector !== null && now - this.armedAt > this.armedWindowMs) {
      this.clearTarget(); this.failure = 'FOCUS_EXPIRED'; this.emit({ ...input, timestamp: now }, 'FOCUS_EXPIRED');
    }
    if (this.missingAt !== null && now - this.missingAt > input.graceMs && this.armedSector !== null) {
      this.clearTarget(); this.failure = 'HAND_LOST'; this.emit({ ...input, timestamp: now }, 'HAND_LOST');
    }
    if (!input.fresh || input.timestamp <= this.lastAt) return;
    this.lastAt = input.timestamp;
    if (!input.active) { this.reset(); return; }
    if (!input.hasHand) {
      this.missingAt ??= input.timestamp;
      this.pinch.reset();
      this.candidate = null; this.samples = 0;
      if (input.timestamp - this.missingAt > input.graceMs) this.clearTarget();
      this.failure = 'HAND_LOST'; this.emitFailure(input); return;
    }
    this.missingAt = null;
    if (input.pointing && input.sector !== null) {
      if (this.candidate !== input.sector) {
        if (this.candidate !== null && this.focusedSector !== this.candidate) this.emit(input, 'SECTOR_UNSTABLE');
        this.candidate = input.sector; this.candidateAt = input.timestamp; this.samples = 0;
        this.emit(input, 'PREVIEW_ATTEMPT');
      }
      this.samples += 1;
      // Slow, central aim locks attention sooner; moving/boundary aim earns a longer dwell.
      this.focusDwellMs = input.aimSpeed < 0.8 && input.boundaryDistance >= 8 ? 100 :
        input.aimSpeed < 1.6 && input.boundaryDistance >= 4 ? 150 : 200;
      if (this.samples >= 2) {
        if (this.previewSector !== input.sector) {
          this.previewSector = input.sector; this.stage = 'TARGET_PREVIEW';
          this.emit(input, 'TARGET_PREVIEW', input.timestamp - this.candidateAt);
          this.emit(input, 'FOCUS_ATTEMPT');
        }
        if (input.timestamp - this.candidateAt >= this.focusDwellMs) {
          if (this.armedSector !== input.sector) {
            this.focusedSector = input.sector; this.armedSector = input.sector;
            this.pinch.reset(); this.stage = 'TARGET_FOCUSED';
            this.emit(input, 'TARGET_FOCUSED', input.timestamp - this.candidateAt);
            this.emit(input, 'TARGET_ARMED');
          }
          this.armedAt = input.timestamp;
          this.stage = 'TARGET_ARMED';
        }
      }
    } else {
      if (this.candidate !== null && this.armedSector === null && this.previewSector !== null) this.emit(input, 'FOCUS_TIMEOUT');
      this.candidate = null; this.samples = 0;
      if (this.armedSector === null && this.stage !== 'LOCKED') {
        this.previewSector = null; this.stage = 'NONE';
        this.failure = input.pointing ? 'RAY_MISS' : 'POINT_NOT_CONFIRMED';
      }
    }
    this.pinch.update(input.pinchDistance, input.timestamp, this.armedSector !== null);
    if (this.pinch.downEdge) { this.stage = 'LOCK_CANDIDATE'; this.emit(input, 'PINCH_DOWN_EDGE'); this.emit(input, 'LOCK_ATTEMPT'); }
    if (this.pinch.candidate) this.stage = 'LOCK_CANDIDATE';
    else if (this.armedSector !== null) this.stage = 'TARGET_ARMED';
    if (this.pinch.confirmed) this.emit(input, 'LOCK_CONFIRMED', input.timestamp - this.pinch.candidateAt);
    if (this.armedSector !== null) this.failure = this.pinch.waitingNeutral ? 'PINCH_ALREADY_ACTIVE' : this.pinch.candidate ? 'PINCH_NOT_CONFIRMED' : '—';
    if (this.pinch.timedOut) this.failure = 'LOCK_TIMEOUT';
    this.emitFailure(input);
  }

  confirmLock(timestamp: number, pointScore: number) {
    if (this.armedSector === null || !this.pinch.confirmed) return;
    this.lockedSector = this.armedSector; this.stage = 'LOCKED'; this.failure = 'LOCK_SUCCESS';
    this.events.push({ timestamp, event: 'LOCK_SUCCESS', sector: this.lockedSector, pointScore,
      pinchScore: this.pinch.score, state: this.stage, latencyMs: timestamp - this.pinch.candidateAt });
    this.armedSector = null; this.focusedSector = null;
  }
  rejectLock() {
    this.failure = 'LOCK_TIMEOUT'; this.stage = 'TARGET_ARMED';
    this.events.push({ timestamp: this.lastAt, event: 'LOCK_TIMEOUT', sector: this.armedSector,
      pointScore: 0, pinchScore: this.pinch.score, state: this.stage });
  }
  private emitFailure(input: TargetSample) {
    if (this.failure !== this.lastFailure && this.failure !== '—') this.emit(input, this.failure);
    this.lastFailure = this.failure;
  }
  private emit(input: TargetSample, event: string, latencyMs?: number) {
    this.events.push({ timestamp: input.timestamp, event, sector: this.armedSector ?? input.sector,
      pointScore: input.pointScore, pinchScore: this.pinch.score, state: this.stage, latencyMs });
  }
  clearTarget() {
    this.armedSector = null; this.focusedSector = null; this.previewSector = null;
    this.candidate = null; this.samples = 0; this.pinch.reset(); this.stage = 'NONE';
  }
  reset() { this.clearTarget(); this.lockedSector = null; this.missingAt = null; this.lastAt = -Infinity; this.lastFailure = ''; this.events.length = 0; }
}
