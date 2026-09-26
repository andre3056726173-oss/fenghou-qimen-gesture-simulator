import type { GestureSnapshot } from '../types';
import type { SpellCastStage } from '../spells/SpellContext';
import type { MotionState } from './GestureMotionDetector';
import { GestureInputBuffer } from './GestureInputBuffer';

export interface XunInputGate {
  lockedSector: number | null;
  spellId: string | null;
  stage: SpellCastStage;
  formationActive: boolean;
}
export interface XunInputResult {
  motion: MotionState;
  failure: string;
  sourceTimestamp: number | null;
  buffered: boolean;
}

/** A swipe can cross the charge/READY boundary, but never a sector lock or a lost-hand boundary. */
export class XunCastInputController {
  private readonly buffer = new GestureInputBuffer();
  private lastSwipeAt: number | null = null;

  update(gate: XunInputGate, snapshot: GestureSnapshot, motion: MotionState, timestamp: number, freshSample: boolean, bufferMs: number): XunInputResult {
    const inactive = !gate.formationActive || gate.lockedSector !== 7 || gate.spellId !== 'XUN_WIND' || !['PREPARING', 'ALIGNED', 'CHARGING', 'READY'].includes(gate.stage);
    if (inactive || !snapshot.handCount) {
      this.reset();
      return { motion, failure: !snapshot.handCount ? 'HAND_LOST' : gate.lockedSector !== 7 ? 'NO_XUN_LOCK' : 'SPELL_NOT_READY', sourceTimestamp: null, buffered: false };
    }
    const neutralMotion = { ...motion, action: motion.action === 'HOLD' ? motion.action : null };
    if (freshSample && motion.swipe.action && snapshot.openPalm && !snapshot.pinchActive && !snapshot.pointing) {
      const direction = { x: motion.swipe.action === 'SWIPE_LEFT' ? -1 : 1, y: 0, z: 0 };
      this.buffer.push(motion.swipe.action, motion.timestamp, Math.min(1.25, .75 + motion.swipe.score * .5), direction);
      this.lastSwipeAt = motion.timestamp;
    }
    if (gate.stage !== 'READY') return { motion: neutralMotion, failure: 'SPELL_NOT_READY', sourceTimestamp: null, buffered: false };
    if (!snapshot.openPalm || snapshot.pinchActive || snapshot.pointing) {
      return { motion: neutralMotion, failure: 'STATE_CONFLICT', sourceTimestamp: null, buffered: false };
    }
    const buffered = this.buffer.consume(['SWIPE_LEFT', 'SWIPE_RIGHT'], timestamp, bufferMs);
    if (buffered) {
      // Consume once, including during a depth-noise PUSH/PULL frame. Keep the action-time direction.
      this.buffer.clear();
      return { motion: { ...motion, action: buffered.intent as 'SWIPE_LEFT' | 'SWIPE_RIGHT', intensity: buffered.intensity,
        direction: buffered.direction!, anticipation: Math.max(motion.anticipation, motion.swipe.score) }, failure: 'NONE',
        sourceTimestamp: buffered.timestamp, buffered: buffered.timestamp < timestamp };
    }
    const failure = this.lastSwipeAt !== null && timestamp - this.lastSwipeAt > bufferMs ? 'BUFFER_EXPIRED' : motion.swipe.failure;
    return { motion: neutralMotion, failure, sourceTimestamp: null, buffered: false };
  }

  reset() { this.buffer.clear(); this.lastSwipeAt = null; }
}
