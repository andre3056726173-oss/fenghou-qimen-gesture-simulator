import type { GestureSnapshot } from '../types';
import type { MotionState } from './GestureMotionDetector';
import type { ZhenFlickStatus } from './ZhenFlickController';

export interface GestureRecord {
  timestamp: number;
  gesture: string;
  intent: string | null;
  palm: { x: number; y: number; z: number } | null;
  handScale: number;
  pinchDistance: number;
  velocity: { x: number; y: number; z: number };
  depthVelocity: number;
  spellState: string;
  sector: number | null;
  confidence: number;
  zhenFlick?: ZhenFlickStatus;
}

/** Records numerical landmark/gesture telemetry only — never camera frames. */
export class GestureDebugRecorder {
  recording = false;
  private startedAt = 0;
  private readonly entries: GestureRecord[] = [];

  toggle(timestamp: number) {
    if (this.recording) {
      this.recording = false;
      this.download();
      return 'stopped' as const;
    }
    this.recording = true;
    this.startedAt = timestamp;
    this.entries.length = 0;
    return 'started' as const;
  }

  record(snapshot: GestureSnapshot, motion: MotionState, spellState: string, sector: number | null, timestamp: number, zhenFlick?: ZhenFlickStatus) {
    if (!this.recording) return;
    if (timestamp - this.startedAt > 10_000) {
      this.recording = false;
      this.download();
      return;
    }
    this.entries.push({
      timestamp,
      gesture: snapshot.name,
      intent: motion.action,
      palm: snapshot.palmCenter ? { ...snapshot.palmCenter } : null,
      handScale: snapshot.handScale,
      pinchDistance: snapshot.normalizedPinchDistance,
      velocity: { ...motion.velocity },
      depthVelocity: motion.depthVelocity,
      spellState,
      sector,
      confidence: snapshot.confidence,
      zhenFlick: zhenFlick ? { ...zhenFlick } : undefined,
    });
  }

  private download() {
    if (!this.entries.length) return;
    const blob = new Blob([JSON.stringify(this.entries, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `qimen-gesture-record-${Date.now()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }
}
