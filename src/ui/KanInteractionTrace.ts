import type { KanPullStatus } from '../gestureRecognition/KanPullController';
import type { MotionState } from '../gestureRecognition/GestureMotionDetector';
import type { GestureSnapshot } from '../types';
import { PALACES } from '../qimen/palaces';
import { InteractionEventTimeline } from './InteractionEventTimeline';

/** ?qa=kan only. Fixed-size diagnostics; no camera/video recording. */
export class KanInteractionTrace {
  private timeline = new InteractionEventTimeline();
  private readonly edges = new Map<string, string>();
  reset() { this.timeline = new InteractionEventTimeline(); this.edges.clear(); }
  event(timestamp: number, key: string, value: string) {
    if (this.edges.get(key) === value) return;
    this.edges.set(key, value); this.timeline.push(timestamp, `${key} ${value}`);
  }
  lines(input: { snapshot: GestureSnapshot; motion: MotionState; candidate: string; stable: string;
    focused: number | null; locked: number | null; spell: string | null; spellStage: string; charge: number;
    status: KanPullStatus; threshold: number; timestamp: number }) {
    const { snapshot: s, motion: m, status: k, timestamp: now } = input;
    const name = (index: number | null) => index === null ? '—' : index === 4 ? 'KAN / 坎' : PALACES[index]?.name ?? String(index);
    this.event(now, 'FOCUS', name(input.focused)); this.event(now, 'LOCK', name(input.locked));
    this.event(now, 'KAN_STATE', k.kanPullState);
    if (k.freshSample) this.event(now, 'FAILURE', k.failure);
    return [
      `KAN QA · Candidate ${input.candidate} · Stable ${input.stable} · Open ${s.openPalmScore.toFixed(2)}`,
      `Focus ${name(input.focused)} · Lock ${name(input.locked)} · Spell ${input.spell ?? '—'}`,
      `Spell ${input.spellStage} · Charge ${(input.charge * 100).toFixed(0)}% · Kan ${k.kanPullState}`,
      `Lock cycle consumed ${k.lockCycleConsumed} · READY Neutral ${k.readyNeutral} · Armed ${k.kanPullState === 'READY_FOR_PULL'}`,
      `Fresh ${k.freshSample ? 'YES' : 'NO'} · Depth v ${m.depthVelocity.toFixed(3)} · Scale ${s.handScale.toFixed(3)} · Scale rate ${m.scaleRate.toFixed(3)}`,
      `Evidence Z ${m.pullZEvidence.toFixed(3)} · Scale ${m.pullScaleEvidence.toFixed(3)} · Facing ${m.pullFacingEvidence.toFixed(3)}`,
      `Pull evidence ${m.pullEvidence.toFixed(3)} · Score ${m.pullScore.toFixed(2)} · Threshold ${input.threshold.toFixed(2)} · Speed ${m.speed.toFixed(3)}`,
      `Direction consistency ${k.directionConsistency.toFixed(2)} · New Edge ${k.newPullEdge} · Candidate ${k.kanPullState === 'PULL_CANDIDATE'}`,
      `Confirmed ${k.kanPullState === 'PULL_CONFIRMED'} · Cast Gate ${k.castGate ? 'YES' : 'NO'} · Failure ${k.failure}`,
      ...this.timeline.lines(now).slice(-6),
    ];
  }
}
