import type { FormationPhase } from '../qimen/FormationAnimator';
import type { StabilizedGesture } from './GestureSmoother';

export type GestureState = 'IDLE' | 'SUMMONING' | 'ACTIVE' | 'ROTATING' | 'POINTING' | 'LOCKING' | 'GRAB_SPACE' | 'COLLAPSING';
export interface InteractionAdmission {
  manipulation: boolean;
  space: boolean;
  suppressFistCollapse: boolean;
  lockSector?: boolean;
}

export type GestureEvent =
  | { type: 'SUMMON'; snapshot: StabilizedGesture }
  | { type: 'COLLAPSE' }
  | { type: 'BEGIN_ROTATION' }
  | { type: 'ROTATE'; velocity: number }
  | { type: 'END_ROTATION' }
  | { type: 'POINT'; snapshot: StabilizedGesture }
  | { type: 'LOCK'; snapshot: StabilizedGesture }
  | { type: 'BEGIN_GRAB'; snapshot: StabilizedGesture }
  | { type: 'MOVE_GRAB'; snapshot: StabilizedGesture }
  | { type: 'END_GRAB' }
  | { type: 'SCALE'; distance: number };

/** Explicit gesture transitions. No single MediaPipe frame can summon or collapse the field. */
export class GestureStateMachine {
  state: GestureState = 'IDLE';
  private lastPointTimestamp = 0;
  private lockArmed = false;
  private summonArmed = true;

  /** Used by choreography after a short fist cancels only the prepared spell. */
  recoverActive() {
    if (this.state === 'COLLAPSING' || this.state === 'LOCKING') this.state = 'ACTIVE';
    this.lockArmed = false;
  }

  reset() {
    this.state = 'IDLE'; this.lockArmed = false; this.summonArmed = true; this.lastPointTimestamp = 0;
  }

  private interrupt(next: GestureState): GestureEvent[] {
    const events: GestureEvent[] = this.state === 'ROTATING' ? [{ type: 'END_ROTATION' }] : this.state === 'GRAB_SPACE' ? [{ type: 'END_GRAB' }] : [];
    this.state = next;
    this.lockArmed = false;
    return events;
  }

  update(input: StabilizedGesture, formationPhase: FormationPhase, timestamp: number, rotationVelocity: number,
    admission: InteractionAdmission = { manipulation: true, space: true, suppressFistCollapse: false }): GestureEvent[] {
    const events: GestureEvent[] = [];
    const { raw } = input;
    if (formationPhase === 'COLLAPSING') return this.interrupt('COLLAPSING');
    if (formationPhase === 'IDLE' && this.state !== 'IDLE' && this.state !== 'SUMMONING') return this.interrupt('IDLE');
    if (input.fist && !admission.suppressFistCollapse && this.state !== 'IDLE' && this.state !== 'COLLAPSING') return [...this.interrupt('COLLAPSING'), { type: 'COLLAPSE' }];
    if ((!admission.manipulation || admission.suppressFistCollapse) && formationPhase === 'ACTIVE') return this.interrupt('ACTIVE');
    if (!admission.space && this.state === 'GRAB_SPACE') return this.interrupt('ACTIVE');

    if (this.state === 'IDLE') {
      if (!input.openPalm && !input.fist) this.summonArmed = true;
      if (input.openPalm && this.summonArmed) {
        this.summonArmed = false;
        this.state = 'SUMMONING';
        events.push({ type: 'SUMMON', snapshot: input });
      }
      return events;
    }

    if (this.state === 'SUMMONING') {
      if (input.fist && !admission.suppressFistCollapse) {
        this.state = 'COLLAPSING';
        events.push({ type: 'COLLAPSE' });
      } else if (formationPhase === 'ACTIVE') {
        this.state = 'ACTIVE';
      }
      return events;
    }

    if (input.fist && this.state !== 'COLLAPSING') {
      this.state = 'COLLAPSING';
      this.lockArmed = false;
      events.push({ type: 'COLLAPSE' });
      return events;
    }

    if (this.state === 'COLLAPSING') {
      if (formationPhase === 'IDLE') this.state = 'IDLE';
      return events;
    }

    if (admission.space && input.twoHandsOpen && Math.abs(raw.scaleVelocity) > 0.04) {
      events.push({ type: 'SCALE', distance: input.handDistance });
    }

    if (this.state === 'LOCKING') {
      if (!input.pinch) {
        this.lockArmed = false;
        this.state = input.pointing ? 'POINTING' : 'ACTIVE';
      }
      return events;
    }

    if (this.state === 'GRAB_SPACE') {
      if (input.twoHandsPinch) events.push({ type: 'MOVE_GRAB', snapshot: input });
      else {
        this.state = 'ACTIVE';
        events.push({ type: 'END_GRAB' });
      }
      return events;
    }

    if (this.state === 'POINTING') {
      if (input.pinch && admission.lockSector && !this.lockArmed) {
        this.lockArmed = true;
        this.state = 'LOCKING';
        events.push({ type: 'LOCK', snapshot: input });
      } else if (!input.pointing) {
        this.state = 'ACTIVE';
      } else {
        this.lastPointTimestamp = timestamp;
        events.push({ type: 'POINT', snapshot: input });
      }
      return events;
    }

    if (this.state === 'ROTATING') {
      if (input.pinch) {
        events.push({ type: 'ROTATE', velocity: rotationVelocity });
      } else {
        this.state = 'ACTIVE';
        events.push({ type: 'END_ROTATION' });
      }
      return events;
    }

    // ACTIVE: two-hand pinch grabs the floating formation before single-hand controls.
    if (admission.space && input.twoHandsPinch) {
      this.state = 'GRAB_SPACE';
      events.push({ type: 'BEGIN_GRAB', snapshot: input });
    } else if (input.pointing && !input.pinch) {
      this.state = 'POINTING';
      this.lastPointTimestamp = timestamp;
      events.push({ type: 'POINT', snapshot: input });
    } else if (input.pinch && admission.lockSector) {
      this.lockArmed = true;
      this.state = 'LOCKING';
      events.push({ type: 'LOCK', snapshot: input });
    } else if (input.pinch && !input.pointing) {
      this.state = 'ROTATING';
      events.push({ type: 'BEGIN_ROTATION' });
    }
    return events;
  }
}
