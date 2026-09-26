import type { GestureSnapshot } from '../types';
import type { ZhenFlickStatus } from '../gestureRecognition/ZhenFlickController';
import { InteractionEventTimeline } from './InteractionEventTimeline';
import { PALACES } from '../qimen/palaces';

/** Collected only in ?qa=zhen. Numerical evidence is also available in the R download. */
export class ZhenInteractionTrace {
  private timeline = new InteractionEventTimeline();
  private readonly edges = new Map<string, string>();
  event(timestamp: number, key: string, value: string) {
    if (this.edges.get(key) === value) return;
    this.edges.set(key, value); this.timeline.push(timestamp, `${key} ${value}`);
  }
  reset() { this.timeline = new InteractionEventTimeline(); this.edges.clear(); }
  lines(input: { snapshot: GestureSnapshot; candidate: string; stable: string; focused: number | null; locked: number | null; spell: string | null; spellStage: string; charge: number; status: ZhenFlickStatus; threshold: number; timestamp: number }) {
    const { snapshot: s, status: f, timestamp: now } = input;
    const name = (index: number | null) => index === null ? '—' : index === 6 ? 'ZHEN / 震' : PALACES[index]?.name ?? String(index);
    this.event(now, 'FOCUS', name(input.focused));
    this.event(now, 'LOCK', name(input.locked));
    this.event(now, 'FLICK_STATE', f.stage);
    if (f.pinchEnter) this.event(now, 'PINCH_ENTER', String(now));
    if (f.pinchRelease) this.event(now, 'PINCH_RELEASE', String(now));
    if (f.freshSample) this.event(now, 'FAILURE', f.failure);
    return [
      `ZHEN QA · Candidate ${input.candidate} · Stable ${input.stable}`,
      `Focus ${name(input.focused)} · Lock ${name(input.locked)} · Spell ${input.spell ?? '—'}`,
      `Spell ${input.spellStage} · Charge ${(input.charge * 100).toFixed(0)}% · Flick ${f.stage}`,
      `Pinch ${s.pinchActive ? 'ON' : 'OFF'} · gap ${s.normalizedPinchDistance.toFixed(3)} · Enter ${f.pinchEnter} · Release ${f.pinchRelease}`,
      `Lock consumed ${f.lockPinchConsumed} · Waiting ${f.stage === 'WAIT_RELEASE_AFTER_LOCK'} · Armed ${f.stage === 'FLICK_ARMED'} · Hold ${f.holdMs.toFixed(0)}ms`,
      `Separation v ${f.separationVelocity.toFixed(2)} · Index v ${f.indexTipVelocity.toFixed(2)} · Thumb v ${f.thumbTipVelocity.toFixed(2)} (palm units/s)`,
      `Hand speed ${f.handSpeed.toFixed(2)} · Score ${f.score.toFixed(2)} · Threshold ${input.threshold.toFixed(2)} (separation/s)`,
      `Fresh ${f.freshSample ? 'YES' : 'NO'} · Cast Gate ${f.castGate ? 'YES' : 'NO'} · Failure ${f.failure}`,
      ...this.timeline.lines(now).slice(-7),
    ];
  }
}
