import type { GestureSnapshot } from '../types';
import type { MotionState } from './GestureMotionDetector';
import type { GestureTuningValues } from './GestureTuning';
import type { SpellCastStage } from '../spells/SpellContext';
import { ReadyMotionCastController } from './ReadyMotionCastController';
import { XunCastInputController, type XunInputResult } from './XunCastInputController';
import { ZhenFlickController } from './ZhenFlickController';
import { KanPullController } from './KanPullController';

export interface RealCastInput {
  snapshot: GestureSnapshot; motion: MotionState; timestamp: number; freshSample: boolean;
  sector: number | null; spell: string | null; stage: SpellCastStage; formationActive: boolean;
  stableOpen: boolean; stablePinch: boolean; stablePoint: boolean; rotating: boolean; space: boolean;
  tuning: GestureTuningValues;
}
const sectors: Record<string, number> = { KUN_EARTH: 1, XUN_WIND: 7, ZHEN_LIGHTNING: 6, KAN_WATER: 4 };
const actions: Record<string, string> = { KUN_EARTH: 'PUSH', ZHEN_LIGHTNING: 'FLICK', KAN_WATER: 'PULL' };

/** Single real-input router. Only the current spell controller may propose a cast this frame. */
export class RealSpellCastGate {
  readonly kun = new ReadyMotionCastController('PUSH');
  readonly xun = new XunCastInputController();
  readonly zhen = new ZhenFlickController();
  readonly kan = new KanPullController();
  private spell: string | null = null;
  phase = 'IDLE'; failure = 'NO_LOCK'; neutral = false; armed = false; candidate = false; confirmed = false; castGate = false;
  xunInput: XunInputResult | null = null;
  reset() {
    this.kun.reset(); this.xun.reset(); this.zhen.reset(); this.kan.reset();
    this.spell = null; this.phase = 'IDLE'; this.failure = 'NO_LOCK'; this.neutral = false;
    this.armed = false; this.candidate = false; this.confirmed = false; this.castGate = false; this.xunInput = null;
  }
  consumeLock(sector: number, spell: string | null) {
    this.reset(); this.spell = spell;
    if (sector === 1) this.kun.consumeLock();
    if (sector === 7) this.xun.consumeLock();
    if (sector === 6) this.zhen.consumeLock(sector);
    if (sector === 4) this.kan.consumeLock(sector);
  }
  consumeRotation() { this.zhen.consumeRotation(); }
  update(input: RealCastInput): MotionState {
    const { snapshot: s, motion: m, tuning: t } = input;
    const blocked = { ...m, action: m.action === 'HOLD' ? 'HOLD' as const : null };
    if (input.spell !== this.spell) { this.reset(); this.spell = input.spell; }
    this.castGate = false; this.confirmed = false; this.xunInput = null;
    if (!input.formationActive || !input.spell || sectors[input.spell] !== input.sector) { this.reset(); this.failure = 'NO_LOCK'; return blocked; }
    let result: MotionState = blocked;
    if (input.spell === 'KUN_EARTH') {
      result = this.kun.update({ ...input, threshold: t.pushThreshold });
      this.phase = this.kun.state; this.failure = this.kun.failure; this.neutral = this.kun.neutral; this.castGate = this.kun.castGate;
    } else if (input.spell === 'XUN_WIND') {
      this.xunInput = this.xun.update({ lockedSector: input.sector, spellId: input.spell, stage: input.stage, formationActive: input.formationActive },
        s, m, input.timestamp, input.freshSample, t.inputBufferMs, { ...input, threshold: t.swipeThreshold });
      result = this.xunInput.motion;
      this.phase = this.xun.cycle.state; this.failure = this.xunInput.failure; this.neutral = this.xun.cycle.neutral; this.castGate = this.xun.cycle.castGate;
    } else if (input.spell === 'ZHEN_LIGHTNING') {
      if (input.freshSample && (input.space || s.twoHandsPinch || s.twoHandsOpen)) this.zhen.consumeRotation();
      result = this.zhen.update({ snapshot: s, motion: m, sampleTimestamp: input.timestamp, freshSample: input.freshSample,
        lockedSector: input.sector, activeSpell: input.spell, spellStage: input.stage, formationActive: input.formationActive,
        flickThreshold: t.flickThreshold, holdMs: t.holdMs });
      this.phase = this.zhen.status.stage; this.failure = this.zhen.status.failure;
      this.neutral = this.phase === 'READY_FOR_CAST_PINCH'; this.castGate = this.zhen.status.castGate;
    } else {
      result = this.kan.update({ snapshot: s, motion: m, timestamp: input.timestamp, freshSample: input.freshSample,
        stableOpenPalm: input.stableOpen, stablePinch: input.stablePinch, stablePoint: input.stablePoint,
        rotating: input.rotating, spaceManipulation: input.space, lockedSector: input.sector, activeSpell: input.spell,
        spellStage: input.stage, formationActive: input.formationActive, pullThreshold: t.pullThreshold });
      this.phase = this.kan.status.kanPullState; this.failure = this.kan.status.failure;
      this.neutral = this.kan.status.readyNeutral; this.castGate = this.kan.status.castGate;
    }
    this.armed = ['ARMED', 'READY_FOR_PULL', 'FLICK_ARMED', 'READY_FOR_CAST_PINCH'].includes(this.phase);
    this.candidate = ['CANDIDATE', 'PULL_CANDIDATE', 'RELEASE_CANDIDATE'].includes(this.phase);
    this.confirmed = this.castGate;
    const expected = input.spell === 'XUN_WIND' ? result.action?.startsWith('SWIPE') : result.action === actions[input.spell];
    return input.freshSample && s.handCount > 0 && input.stage === 'READY' && this.castGate && expected ? result : blocked;
  }
  acknowledge(accepted: boolean) {
    if (!this.castGate) return;
    if (this.spell === 'KUN_EARTH') this.kun.acknowledge(accepted);
    if (this.spell === 'XUN_WIND') this.xun.cycle.acknowledge(accepted);
    if (this.spell === 'ZHEN_LIGHTNING') this.zhen.acknowledgeCast(accepted);
    if (this.spell === 'KAN_WATER') this.kan.acknowledgeCast(accepted);
    this.failure = accepted ? 'NONE' : 'CAST_REJECTED'; this.phase = 'COOLDOWN'; this.castGate = false;
    this.neutral = false; this.armed = false; this.candidate = false;
  }
}
