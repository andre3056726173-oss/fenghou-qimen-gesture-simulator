import type { Landmark } from '../types';

export interface HandRotationSample {
  palmAngle: number;
  palmRoll: number;
  palmYaw: number;
  deltaAngle: number;
  velocity: number;
  active: boolean;
}

const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));

/** Stable palm-roll measurement used only while the rotation clutch is held. */
export class HandRotationController {
  private previousAngle: number | null = null;
  private filteredVelocity = 0;
  private lastTimestamp = 0;
  private readonly deadZone = 1.4 * Math.PI / 180;
  private quietFrames = 0;

  update(points: Landmark[] | undefined, timestamp: number): HandRotationSample {
    if (!points || points.length < 18) {
      this.reset();
      return { palmAngle: 0, palmRoll: 0, palmYaw: 0, deltaAngle: 0, velocity: 0, active: false };
    }
    const wrist = points[0];
    const indexMcp = points[5];
    const middleMcp = points[9];
    const pinkyMcp = points[17];
    const palmX = (indexMcp.x + middleMcp.x + pinkyMcp.x) / 3 - wrist.x;
    const palmY = (indexMcp.y + middleMcp.y + pinkyMcp.y) / 3 - wrist.y;
    const angle = Math.atan2(palmY, palmX);
    const palmYaw = Math.atan2(middleMcp.z - wrist.z, Math.hypot(middleMcp.x - wrist.x, middleMcp.y - wrist.y));
    if (this.previousAngle === null) {
      this.previousAngle = angle;
      this.lastTimestamp = timestamp;
      return { palmAngle: angle, palmRoll: angle, palmYaw, deltaAngle: 0, velocity: 0, active: false };
    }
    const dt = Math.min(0.1, Math.max(1 / 120, (timestamp - this.lastTimestamp) / 1000 || 1 / 60));
    const deltaAngle = Math.max(-0.22, Math.min(0.22, wrap(angle - this.previousAngle)));
    this.previousAngle = angle;
    this.lastTimestamp = timestamp;
    if (Math.abs(deltaAngle) < this.deadZone) this.quietFrames += 1; else this.quietFrames = 0;
    const signal = this.quietFrames >= 3 ? 0 : deltaAngle / dt;
    this.filteredVelocity += (Math.max(-5.2, Math.min(5.2, signal)) - this.filteredVelocity) * 0.2;
    return { palmAngle: angle, palmRoll: angle, palmYaw, deltaAngle, velocity: this.filteredVelocity, active: Math.abs(this.filteredVelocity) > 0.045 };
  }

  reset() {
    this.previousAngle = null;
    this.filteredVelocity = 0;
    this.lastTimestamp = 0;
    this.quietFrames = 0;
  }
}
