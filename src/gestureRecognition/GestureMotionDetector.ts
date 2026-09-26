import type { GestureSnapshot } from '../types';
import type { SpellAction, SpellVector3 } from '../spells/SpellContext';
import type { GestureTuningStore } from './GestureTuning';
import { screenXFromLandmark } from '../handTracking/CameraCoordinates';
import { HandSwipeDetector, emptySwipe, type SwipeState } from './HandSwipeDetector';

export interface MotionState {
  action: SpellAction | null;
  velocity: SpellVector3;
  depthVelocity: number;
  swipeVelocity: number;
  speed: number;
  stableMs: number;
  holdTime: number;
  intensity: number;
  direction: SpellVector3;
  anticipation: number;
  pushScore: number;
  pullScore: number;
  swipeScore: number;
  flickScore: number;
  swipeDirectionConsistency: number;
  pushEvidence: number;
  pullEvidence: number;
  swipeDisplacement: number;
  pinchSeparationVelocity: number;
  timestamp: number;
  swipe: SwipeState;
}

interface MotionSample {
  timestamp: number;
  position: SpellVector3;
  velocity: SpellVector3;
  pinch: boolean;
  pinchGap: number;
  handScale: number;
  facing: boolean;
  openPalm: boolean;
}

/** Detects deliberate motion over a short history instead of trusting one frame. */
export class GestureMotionDetector {
  private readonly history: MotionSample[] = [];
  private previousPinch = false;
  private lastFlickAt = -Infinity;
  private lastActionAt = -Infinity;
  private stillSince = 0;
  private lastOutput: MotionState | null = null;
  private readonly swipeDetector = new HandSwipeDetector();

  constructor(private readonly tuning: GestureTuningStore) {}

  update(snapshot: GestureSnapshot, timestamp: number): MotionState {
    if (this.lastOutput && timestamp <= this.lastOutput.timestamp) return { ...this.lastOutput, action: null, swipe: { ...this.lastOutput.swipe, action: null } };
    const center = snapshot.palmCenter;
    if (!center) {
      this.reset();
      return { action: null, velocity: { x: 0, y: 0, z: 0 }, depthVelocity: 0, swipeVelocity: 0, speed: 0, stableMs: 0, holdTime: 0, intensity: 0.75, direction: { x: 0, y: 0, z: 0 }, anticipation: 0, pushScore: 0, pullScore: 0, swipeScore: 0, flickScore: 0, swipeDirectionConsistency: 0, pushEvidence: 0, pullEvidence: 0, swipeDisplacement: 0, pinchSeparationVelocity: 0, timestamp, swipe: emptySwipe('HAND_LOST') };
    }
    const previous = this.history[this.history.length - 1];
    const dt = Math.max(0.001, (timestamp - (previous?.timestamp ?? timestamp - 16)) / 1000);
    const position = { x: screenXFromLandmark(center.x), y: center.y, z: center.z };
    const velocity = previous
      ? { x: (position.x - previous.position.x) / dt, y: (position.y - previous.position.y) / dt, z: (position.z - previous.position.z) / dt }
      : { x: 0, y: 0, z: 0 };
    const sample: MotionSample = { timestamp, position, velocity, pinch: snapshot.pinchActive, pinchGap: snapshot.normalizedPinchDistance, handScale: snapshot.handScale, facing: snapshot.palmFacingCamera, openPalm: snapshot.openPalm };
    this.history.push(sample);
    while (this.history.length && timestamp - this.history[0].timestamp > 520) this.history.shift();

    const speed = Math.hypot(velocity.x, velocity.y, velocity.z);
    if (speed < 0.13) {
      if (!this.stillSince) this.stillSince = timestamp;
    } else this.stillSince = 0;
    const stableMs = this.stillSince ? timestamp - this.stillSince : 0;
    let action: SpellAction | null = null;

    const params = this.tuning.values;
    // Independent evidence: a noisy depth signal must not erase a valid XUN swipe.
    const swipe = this.swipeDetector.update(this.history, params.swipeThreshold);
    const scaleRate = previous ? (snapshot.handScale - previous.handScale) / dt : 0;
    // Webcams give noisy Z. A forward/back gesture uses Z, apparent palm size, wrist speed and facing together.
    const forwardEvidence = Math.max(0, -velocity.z / 0.3) * params.pushZWeight + Math.max(0, scaleRate / 0.22) * params.pushScaleWeight + (snapshot.palmFacingCamera ? params.pushFacingWeight : 0);
    const pullEvidence = Math.max(0, velocity.z / 0.3) * params.pullZWeight + Math.max(0, -scaleRate / 0.22) * params.pullScaleWeight + (snapshot.palmFacingCamera ? params.pullFacingWeight : 0);
    const pinchReleaseSpeed = previous ? (snapshot.normalizedPinchDistance - previous.pinchGap) / dt : 0;
    let pinchStartedAt = previous?.timestamp ?? timestamp;
    for (let i = this.history.length - 2; i >= 0 && this.history[i].pinch; i -= 1) pinchStartedAt = this.history[i].timestamp;
    const flickArmed = this.previousPinch && timestamp - pinchStartedAt >= params.holdMs;
    // Translation of the whole hand is not finger separation. A flick needs a real held pinch and release.
    const flick = flickArmed && !snapshot.pinchActive && pinchReleaseSpeed > params.flickThreshold && timestamp - this.lastFlickAt > 260;
    if (flick) {
      action = 'FLICK';
      this.lastFlickAt = timestamp;
    } else if (forwardEvidence >= params.pushThreshold && speed > 0.14) {
      action = 'PUSH';
    } else if (pullEvidence >= params.pullThreshold && speed > 0.14) {
      action = 'PULL';
    } else action = swipe.action;
    if (!action && stableMs >= params.holdMs) action = 'HOLD';
    if (action && action !== 'HOLD') this.lastActionAt = timestamp;
    this.previousPinch = snapshot.pinchActive;
    const swipeWindow = this.windowStart(timestamp);
    const swipeVelocity = swipeWindow ? (position.x - swipeWindow.position.x) / Math.max(0.16, (timestamp - swipeWindow.timestamp) / 1000) : velocity.x;
    const actionStrength = action === 'PUSH' ? forwardEvidence : action === 'PULL' ? pullEvidence : action?.startsWith('SWIPE') ? Math.abs(swipeVelocity) / Math.max(params.swipeThreshold, 0.01) : action === 'FLICK' ? Math.max(speed / 0.3, pinchReleaseSpeed / Math.max(params.flickThreshold, 0.01)) : speed;
    const swipeConsistency = swipe.consistency;
    const pushScore = Math.min(1, forwardEvidence / Math.max(params.pushThreshold, 0.01));
    const pullScore = Math.min(1, pullEvidence / Math.max(params.pullThreshold, 0.01));
    const swipeScore = swipe.score;
    const flickScore = flickArmed ? Math.min(1, Math.max(0, pinchReleaseSpeed / Math.max(params.flickThreshold, 0.01))) : 0;
    const intensity = Math.min(1.25, Math.max(0.75, 0.75 + actionStrength * 0.22));
    const directionLength = Math.max(0.001, Math.hypot(velocity.x, velocity.y, velocity.z));
    const direction = { x: velocity.x / directionLength, y: velocity.y / directionLength, z: velocity.z / directionLength };
    const anticipation = Math.min(1, Math.max(forwardEvidence, pullEvidence, Math.abs(swipeVelocity) / Math.max(params.swipeThreshold * 2, 0.01), pinchReleaseSpeed / Math.max(params.flickThreshold * 1.6, 0.01)));
    this.lastOutput = { action, velocity, depthVelocity: velocity.z, swipeVelocity, speed, stableMs, holdTime: stableMs, intensity, direction, anticipation, pushScore, pullScore, swipeScore, flickScore, swipeDirectionConsistency: swipeConsistency, pushEvidence: forwardEvidence, pullEvidence, swipeDisplacement: Math.abs(swipe.horizontal), pinchSeparationVelocity: pinchReleaseSpeed, timestamp, swipe };
    return this.lastOutput;
  }

  private windowStart(timestamp: number) {
    // Timestamps are milliseconds. Use the nearest sample at least 160ms old, not the oldest 520ms sample.
    for (let i = this.history.length - 1; i >= 0; i -= 1) if (timestamp - this.history[i].timestamp >= 160) return this.history[i];
    return undefined;
  }

  reset() {
    this.history.length = 0;
    this.previousPinch = false;
    this.stillSince = 0;
    this.lastActionAt = -Infinity;
    this.lastOutput = null;
    this.swipeDetector.reset();
  }
}
