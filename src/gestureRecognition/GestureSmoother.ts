import type { GestureSnapshot } from '../types';

export interface StabilizedGesture {
  raw: GestureSnapshot;
  openPalm: boolean;
  fist: boolean;
  fistCandidate: boolean;
  gestureCandidate: string;
  stableGesture: string;
  pointing: boolean;
  pinch: boolean;
  twoHandsOpen: boolean;
  twoHandsPinch: boolean;
  handAxisAngle: number;
  pinchDistance: number;
  handDistance: number;
  confidence: number;
}

interface StabilityEntry {
  active: boolean;
  since: number | null;
  absentSince: number | null;
  samples: number;
}

/** Time hysteresis for visual hand tracking. It prevents one bad MediaPipe frame becoming an action. */
export class GestureSmoother {
  private readonly entries = new Map<string, StabilityEntry>();
  private smoothedHandDistance = 0;
  private lastTimestamp = 0;

  update(snapshot: GestureSnapshot, timestamp: number): StabilizedGesture {
    const dt = this.lastTimestamp ? Math.min(0.1, Math.max(1 / 120, (timestamp - this.lastTimestamp) / 1000)) : 1 / 60;
    this.lastTimestamp = timestamp;
    // A camera frame with no hand may preserve the spell grace period, but cannot hold an actionable gesture.
    if (!snapshot.handCount) this.entries.clear();
    this.smoothedHandDistance += (snapshot.handDistance - this.smoothedHandDistance) * Math.min(1, dt * 8);

    const openPalm = this.stable('openPalm', snapshot.openPalm, timestamp, 300, 130);
    // Three clearly extended long fingers veto even a previously confirmed fist immediately.
    if (snapshot.extendedFingerCount > 0 || snapshot.pointing || snapshot.openPalm) this.entries.delete('fist');
    const fist = this.stable('fist', snapshot.fist && snapshot.extendedFingerCount === 0 && snapshot.fistScore >= 0.72, timestamp, 300, 150, 4);
    const pointing = this.stable('pointing', snapshot.pointing, timestamp, 190, 110);
    const pinch = this.stableHysteresis('pinch', snapshot.handCount > 0 ? snapshot.normalizedPinchDistance : Number.POSITIVE_INFINITY, timestamp, 0.18, 0.25, 150, 100);
    const twoHandsOpen = this.stable('twoHandsOpen', snapshot.twoHandsOpen, timestamp, 240, 140);
    const twoHandsPinch = this.stableHysteresis('twoHandsPinch', snapshot.handCount >= 2 && snapshot.twoHandsPinch ? snapshot.normalizedPinchDistance : Number.POSITIVE_INFINITY, timestamp, 0.18, 0.25, 160, 110);
    const fistEntry = this.entries.get('fist');
    const fistCandidate = Boolean(snapshot.fist && fistEntry?.since !== null && !fist);
    const gestureCandidate = fistCandidate ? 'FIST_CANDIDATE' : snapshot.name;
    const stableGesture = fist ? 'FIST_CONFIRMED' : pointing ? 'POINTING' : pinch ? 'PINCH' : openPalm ? 'OPEN_PALM' : 'NEUTRAL';

    return {
      raw: snapshot,
      openPalm,
      fist,
      fistCandidate,
      gestureCandidate,
      stableGesture,
      pointing,
      pinch,
      twoHandsOpen,
      twoHandsPinch,
      handAxisAngle: snapshot.handAxisAngle,
      pinchDistance: snapshot.normalizedPinchDistance,
      handDistance: this.smoothedHandDistance,
      confidence: snapshot.confidence,
    };
  }

  reset() {
    this.entries.clear();
    this.smoothedHandDistance = 0;
    this.lastTimestamp = 0;
  }

  private stable(key: string, condition: boolean, timestamp: number, enterMs: number, exitMs: number, minSamples = 1) {
    const state = this.entries.get(key) ?? { active: false, since: null, absentSince: null, samples: 0 };
    if (condition) {
      state.absentSince = null;
      if (state.since === null) state.since = timestamp;
      state.samples += 1;
      if (!state.active && timestamp - state.since >= enterMs && state.samples >= minSamples) state.active = true;
    } else {
      state.since = null;
      state.samples = 0;
      if (state.absentSince === null) state.absentSince = timestamp;
      if (state.active && timestamp - state.absentSince >= exitMs) state.active = false;
    }
    this.entries.set(key, state);
    return state.active;
  }

  private stableHysteresis(key: string, value: number, timestamp: number, enter: number, exit: number, enterMs: number, exitMs: number) {
    const state = this.entries.get(key) ?? { active: false, since: null, absentSince: null, samples: 0 };
    const condition = state.active ? value < exit : value < enter;
    return this.stableEntry(state, condition, timestamp, enterMs, exitMs, key);
  }

  private stableEntry(state: StabilityEntry, condition: boolean, timestamp: number, enterMs: number, exitMs: number, key: string) {
    if (condition) {
      state.absentSince = null;
      if (state.since === null) state.since = timestamp;
      state.samples += 1;
      if (!state.active && timestamp - state.since >= enterMs) state.active = true;
    } else {
      state.since = null;
      state.samples = 0;
      if (state.absentSince === null) state.absentSince = timestamp;
      if (state.active && timestamp - state.absentSince >= exitMs) state.active = false;
    }
    this.entries.set(key, state);
    return state.active;
  }
}
