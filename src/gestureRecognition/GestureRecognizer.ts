import type { GestureName, GestureSnapshot, Landmark, TrackingFrame, TrackedHand } from '../types';

const tipIndices = [4, 8, 12, 16, 20];
const pipIndices = [3, 6, 10, 14, 18];
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const normalizeAngle = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));

function distance(a: Landmark, b: Landmark) {
  return Math.hypot(a.x - b.x, a.y - b.y, (a.z - b.z) * 0.45);
}

function centerOfPalm(points: Landmark[]) {
  const ids = [0, 5, 9, 13, 17];
  const total = ids.reduce((sum, id) => ({ x: sum.x + points[id].x, y: sum.y + points[id].y, z: sum.z + points[id].z }), { x: 0, y: 0, z: 0 });
  return { x: total.x / ids.length, y: total.y / ids.length, z: total.z / ids.length };
}

function fingerStates(hand: TrackedHand) {
  const wrist = hand.landmarks[0];
  const palm = centerOfPalm(hand.landmarks);
  return tipIndices.map((tipId, index) => {
    const tip = hand.landmarks[tipId];
    const pip = hand.landmarks[pipIndices[index]];
    const ratio = index === 0 ? 1.08 : 1.13;
    return distance(tip, wrist) > distance(pip, wrist) * ratio && distance(tip, palm) > distance(pip, palm) * 1.05;
  });
}

function palmFacingCamera(points: Landmark[]) {
  const a = points[5];
  const b = points[17];
  const wrist = points[0];
  const area = (a.x - wrist.x) * (b.y - wrist.y) - (a.y - wrist.y) * (b.x - wrist.x);
  return Math.abs(area) > 0.008;
}

function normalizedPinch(hand: TrackedHand) {
  const scale = Math.max(distance(hand.landmarks[0], hand.landmarks[9]), 0.035);
  return distance(hand.landmarks[4], hand.landmarks[8]) / scale;
}

export class GestureRecognizer {
  private lastTimestamp = 0;
  private lastPalmScale = 0;
  private lastTwoHandDistance = 0;
  private pushCooldownUntil = 0;

  update(frame: TrackingFrame): GestureSnapshot {
    const dt = clamp((frame.timestamp - this.lastTimestamp) / 1000 || 1 / 60, 1 / 120, 0.1);
    this.lastTimestamp = frame.timestamp;

    if (!frame.hands.length) {
      this.lastPalmScale = 0;
      this.lastTwoHandDistance = 0;
      return this.emptySnapshot();
    }

    const primary = frame.hands[0];
    const points = primary.landmarks;
    const states = fingerStates(primary);
    const extendedCount = states.filter(Boolean).length;
    const palmCenter = centerOfPalm(points);
    const palmCenters = frame.hands.map((hand) => centerOfPalm(hand.landmarks));
    const handScale = Math.max(distance(points[0], points[9]), 0.035);
    const pinchDistance = distance(points[4], points[8]);
    const normalizedPinchDistance = pinchDistance / handScale;
    const pinchActive = normalizedPinchDistance < 0.18;
    const openPalm = extendedCount >= 4 && palmFacingCamera(points);
    const fist = extendedCount <= 1 && tipIndices.slice(1).every((id) => distance(points[id], palmCenter) / handScale < 2.1);
    const pointing = states[1] && !states[2] && !states[3] && !states[4];
    const bothOpen = frame.hands.length >= 2 && frame.hands.slice(0, 2).every((hand) => {
      const handStates = fingerStates(hand);
      return handStates.filter(Boolean).length >= 4 && palmFacingCamera(hand.landmarks);
    });
    const twoHandsPinch = frame.hands.length >= 2 && frame.hands.slice(0, 2).every((hand) => normalizedPinch(hand) < 0.18);

    const wrist = points[0];
    const middle = points[9];
    const palmAngle = Math.atan2(middle.y - wrist.y, middle.x - wrist.x);
    const scaleRate = this.lastPalmScale ? (handScale - this.lastPalmScale) / dt : 0;
    this.lastPalmScale = handScale;
    const pushTriggered = openPalm && scaleRate > 0.35 && frame.timestamp > this.pushCooldownUntil;
    if (pushTriggered) this.pushCooldownUntil = frame.timestamp + 900;

    let handDistance = 0;
    let scaleVelocity = 0;
    const handAxisAngle = frame.hands.length >= 2
      ? Math.atan2(palmCenters[1].y - palmCenters[0].y, palmCenters[1].x - palmCenters[0].x)
      : 0;
    if (frame.hands.length >= 2) {
      handDistance = Math.hypot(palmCenters[0].x - palmCenters[1].x, palmCenters[0].y - palmCenters[1].y);
      scaleVelocity = this.lastTwoHandDistance ? clamp((handDistance - this.lastTwoHandDistance) / dt, -2.5, 2.5) : 0;
      this.lastTwoHandDistance = handDistance;
    } else {
      this.lastTwoHandDistance = 0;
    }

    let name: GestureName = 'NEUTRAL';
    if (twoHandsPinch) name = 'PINCH';
    else if (bothOpen && Math.abs(scaleVelocity) > 0.12) name = 'TWO_HANDS_SCALE';
    else if (bothOpen) name = 'TWO_HANDS_OPEN';
    else if (pushTriggered) name = 'PUSH';
    else if (pinchActive) name = 'PINCH';
    else if (pointing) name = 'POINTING';
    else if (openPalm) name = 'OPEN_PALM';
    else if (fist) name = 'FIST';

    return {
      name,
      confidence: primary.confidence,
      handCount: frame.hands.length,
      palmCenter,
      palmCenters,
      landmarks: frame.hands.map((hand) => hand.landmarks),
      selectedSector: null,
      pinchDistance,
      pinchConfirmed: pinchActive,
      wristAngle: palmAngle,
      rotationVelocity: 0,
      scaleVelocity,
      pushTriggered,
      openPalm,
      fist,
      pointing,
      pinchActive,
      twoHandsOpen: bothOpen,
      twoHandsPinch,
      handAxisAngle,
      palmFacingCamera: palmFacingCamera(points),
      handScale,
      normalizedPinchDistance,
      handDistance,
      palmAngle,
      indexDirection: { x: points[8].x - points[5].x, y: points[8].y - points[5].y },
    };
  }

  reset() {
    this.lastTimestamp = 0;
    this.lastPalmScale = 0;
    this.lastTwoHandDistance = 0;
    this.pushCooldownUntil = 0;
  }

  private emptySnapshot(): GestureSnapshot {
    return {
      name: 'NO_HAND', confidence: 0, handCount: 0, palmCenter: null, palmCenters: [], landmarks: [],
      selectedSector: null, pinchDistance: 0, pinchConfirmed: false, wristAngle: 0,
      rotationVelocity: 0, scaleVelocity: 0, pushTriggered: false,
      openPalm: false, fist: false, pointing: false, pinchActive: false, twoHandsOpen: false,
      twoHandsPinch: false, handAxisAngle: 0,
      palmFacingCamera: false, handScale: 0, normalizedPinchDistance: 0, handDistance: 0,
      palmAngle: 0, indexDirection: null,
    };
  }
}
