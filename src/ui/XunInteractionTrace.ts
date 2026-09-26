import type { MotionState } from '../gestureRecognition/GestureMotionDetector';
import type { XunInputResult } from '../gestureRecognition/XunCastInputController';
import { PALACES } from '../qimen/palaces';
import { InteractionEventTimeline } from './InteractionEventTimeline';

interface XunTraceFrame {
  timestamp: number;
  hasHand: boolean;
  candidate: string;
  stable: string;
  pinch: boolean;
  ray: { hit: boolean; sector: number | null; reason: string; localX: number | null; localZ: number | null } | null;
  focused: number | null;
  locked: number | null;
  spell: string | null;
  stage: string;
  charge: number;
  motion: MotionState;
  threshold: number;
  input: XunInputResult;
  cast: boolean;
}

const sectorName = (sector: number | null) => sector === null ? 'NONE' : sector === 7 ? 'XUN (巽)' : PALACES[sector]?.name ?? String(sector);

/** Debug-only trace, independent of recognition and cast decisions. */
export class XunInteractionTrace {
  private timeline = new InteractionEventTimeline();
  private readonly edges = new Map<string, string>();
  constructor(private readonly enabled: boolean) {}

  event(key: string, value: string, timestamp: number) {
    if (!this.enabled || this.edges.get(key) === value) return;
    this.edges.set(key, value);
    this.timeline.push(timestamp, `${key} ${value}`);
  }

  lines(frame: XunTraceFrame) {
    if (!this.enabled) return [];
    const m = frame.motion, swipe = m.swipe;
    let failure = frame.cast || frame.stage === 'CASTING' ? 'NONE' : !frame.hasHand ? 'HAND_LOST'
      : frame.locked !== 7 ? frame.focused === 7 ? 'NO_XUN_LOCK' : 'NO_XUN_FOCUS'
      : frame.spell !== 'XUN_WIND' ? 'STATE_CONFLICT' : frame.stage !== 'READY' ? 'SPELL_NOT_READY' : frame.input.failure;
    if (failure === 'NOT_OPEN_PALM') failure = 'STATE_CONFLICT';
    if (frame.input.sourceTimestamp !== null && !frame.cast && frame.stage === 'READY') failure = 'STATE_CONFLICT';
    this.event('GESTURE', `${frame.candidate} / ${frame.stable}`, frame.timestamp);
    this.event('FINGER_RAY', frame.ray ? `${frame.ray.reason} ${sectorName(frame.ray.sector)}` : 'NOT_POINTING', frame.timestamp);
    this.event('FOCUS', sectorName(frame.focused), frame.timestamp);
    this.event('PINCH', frame.pinch ? 'ON' : 'OFF', frame.timestamp);
    this.event('LOCK', sectorName(frame.locked), frame.timestamp);
    this.event('SPELL', `${frame.spell ?? 'NONE'} ${frame.stage}`, frame.timestamp);
    this.event('SWIPE', swipe.direction, frame.timestamp);
    this.event('FAILURE', failure, frame.timestamp);
    return [
      `XUN QA · Candidate ${frame.candidate} · Stable ${frame.stable}`,
      `Ray hit ${frame.ray?.hit ? 'YES' : 'NO'} ${frame.ray?.reason ?? 'NOT_POINTING'} · local ${frame.ray?.localX?.toFixed(2) ?? '—'}, ${frame.ray?.localZ?.toFixed(2) ?? '—'} · sector ${sectorName(frame.ray?.sector ?? null)}`,
      `Focused ${sectorName(frame.focused)} · Locked ${sectorName(frame.locked)}`,
      `Spell Candidate ${frame.spell ?? 'NONE'} · Stage ${frame.stage} · Charge ${(frame.charge * 100).toFixed(0)}%`,
      `Hand velocity X ${m.velocity.x.toFixed(3)} / Y ${m.velocity.y.toFixed(3)} · window ${swipe.windowMs.toFixed(0)}ms`,
      `Displacement H ${Math.abs(swipe.horizontal).toFixed(3)} / V ${Math.abs(swipe.vertical).toFixed(3)} / Total ${swipe.total.toFixed(3)} · Vertical travel ${swipe.verticalTravel.toFixed(3)} · horizontal ratio ${swipe.horizontalRatio.toFixed(2)}`,
      `Consistency ${swipe.consistency.toFixed(2)} · Score ${swipe.score.toFixed(2)} · Threshold ${frame.threshold.toFixed(2)} (horizontal distance)`,
      `Detected Swipe ${swipe.direction} · Cast intent ${frame.input.motion.action ?? 'NONE'} · buffered ${frame.input.buffered ? 'YES' : 'NO'}`,
      `Failure Reason ${failure}`,
      ...this.timeline.lines(frame.timestamp).slice(-6),
    ];
  }

  reset() { this.edges.clear(); this.timeline = new InteractionEventTimeline(); }
}
