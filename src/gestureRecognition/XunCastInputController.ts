import type { GestureSnapshot } from '../types';
import type { SpellCastStage } from '../spells/SpellContext';
import type { MotionState } from './GestureMotionDetector';
import { ReadyMotionCastController, type ReadyMotionInput } from './ReadyMotionCastController';

export interface XunInputGate { lockedSector: number | null; spellId: string | null; stage: SpellCastStage; formationActive: boolean }
export interface XunInputResult { motion: MotionState; failure: string; sourceTimestamp: number | null; buffered: boolean }

/** Phase 4.100 supersedes the earlier cross-READY swipe buffer; no cast intents are cached. */
export class XunCastInputController {
  readonly cycle = new ReadyMotionCastController('SWIPE');
  update(gate: XunInputGate, snapshot: GestureSnapshot, motion: MotionState, timestamp: number, freshSample: boolean,
    _bufferMs: number, controls?: Partial<ReadyMotionInput>): XunInputResult {
    if (!gate.formationActive || gate.lockedSector !== 7 || gate.spellId !== 'XUN_WIND') {
      this.reset(); return { motion, failure: 'NO_XUN_LOCK', sourceTimestamp: null, buffered: false };
    }
    const output = this.cycle.update({ ...controls, snapshot, motion, timestamp, freshSample, stage: gate.stage, threshold: controls?.threshold ?? .12 });
    return { motion: output, failure: this.cycle.failure, sourceTimestamp: this.cycle.castGate ? output.timestamp : null, buffered: false };
  }
  reset() { this.cycle.reset(); }
  consumeLock() { this.cycle.consumeLock(); }
}
