import type { Landmark, TrackingFrame } from '../types';

/** Sample time belongs to camera inference, not to requestAnimationFrame. */
export class FrameSampleGate {
  private lastTimestamp = -Infinity;
  accept(frame: TrackingFrame) {
    if (!Number.isFinite(frame.timestamp) || frame.timestamp <= this.lastTimestamp) return false;
    this.lastTimestamp = frame.timestamp;
    return true;
  }
  reset() { this.lastTimestamp = -Infinity; }
}

export function validHandLandmarks(points: Landmark[]) {
  return points.length === 21 && points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z));
}
