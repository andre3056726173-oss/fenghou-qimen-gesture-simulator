import type { SpellAction, SpellCastStage, SpellContext } from './SpellContext';
import type { SpellDefinition } from './SpellDefinition';
import { SpellResolver } from './SpellResolver';

export type SpellControllerEvent =
  | { type: 'stage'; stage: SpellCastStage; spell: SpellDefinition | null; progress: number }
  | { type: 'cast'; spell: SpellDefinition; context: SpellContext };

/** The ritual timing gate: lock -> align -> hold/charge -> release. */
export class SpellCastController {
  readonly resolver = new SpellResolver();
  stage: SpellCastStage = 'NONE';
  lockedSector: number | null = null;
  activeSpell: SpellDefinition | null = null;
  private stageSince = 0;
  private cooldownUntil = 0;
  private pausedAt = 0;
  get isPaused() { return this.pausedAt !== 0; }

  cooldownRemaining(timestamp: number) {
    return Math.max(0, this.cooldownUntil - timestamp);
  }

  lockSector(sector: number | null, spell: SpellDefinition | null, timestamp: number): SpellControllerEvent[] {
    if (this.stage === 'CASTING' || timestamp < this.cooldownUntil) return [];
    if (sector !== null && (!Number.isInteger(sector) || sector < 0 || sector > 7 || (spell && spell.sector !== sector))) return [];
    this.lockedSector = sector;
    this.activeSpell = spell;
    this.stageSince = timestamp;
    this.pausedAt = 0;
    this.stage = spell ? 'PREPARING' : 'NONE';
    return [{ type: 'stage', stage: this.stage, spell, progress: 0 }];
  }

  forceReady(sector: number, spell: SpellDefinition, timestamp: number): SpellControllerEvent[] {
    this.lockedSector = sector;
    this.activeSpell = spell;
    this.stage = 'READY';
    this.stageSince = timestamp;
    this.cooldownUntil = 0;
    return [{ type: 'stage', stage: 'READY', spell, progress: 1 }];
  }

  setPaused(paused: boolean, timestamp: number) {
    if (paused && !this.pausedAt) this.pausedAt = timestamp;
    if (!paused && this.pausedAt) {
      const pausedFor = timestamp - this.pausedAt;
      this.stageSince += pausedFor;
      this.cooldownUntil += pausedFor;
      this.pausedAt = 0;
    }
  }

  cancel(timestamp: number): SpellControllerEvent[] {
    if (!this.activeSpell || !['PREPARING', 'ALIGNED', 'CHARGING', 'READY'].includes(this.stage)) return [];
    this.stage = 'NONE';
    this.activeSpell = null;
    // Cancelling the prepared spell keeps the user's confirmed sector.
    this.stageSince = timestamp;
    this.pausedAt = 0;
    return [{ type: 'stage', stage: 'NONE', spell: null, progress: 0 }];
  }

  update(context: SpellContext, timestamp: number): SpellControllerEvent[] {
    const events: SpellControllerEvent[] = [];
    if (context.formationState !== 'ACTIVE') {
      if (this.stage !== 'NONE') { this.reset(); events.push({ type: 'stage', stage: 'NONE', spell: null, progress: 0 }); }
      return events;
    }
    if (this.pausedAt) return events;
    if (this.stage === 'CASTING') {
      // CASTING owns the already existing follow-through interval. Cooldown still ends at the original timestamp.
      const castMs = this.activeSpell?.id === 'ZHEN_LIGHTNING' ? 90 : 210;
      if (timestamp - this.stageSince >= castMs) {
        this.stage = 'COOLDOWN';
        events.push({ type: 'stage', stage: 'COOLDOWN', spell: this.activeSpell, progress: 0 });
      }
      return events;
    }
    if (this.stage === 'COOLDOWN') {
      if (timestamp < this.cooldownUntil) return events;
      this.stage = 'NONE';
      this.activeSpell = null;
      events.push({ type: 'stage', stage: 'NONE', spell: null, progress: 0 });
      return events;
    }
    const spell = this.activeSpell;
    if (!spell || this.lockedSector === null) return events;
    // Raw display labels such as PUSH / TWO_HANDS_OPEN do not mean the palm closed.
    const chargingPose = context.action === 'HOLD' || (context.handSnapshot
      ? context.handSnapshot.openPalm || context.handSnapshot.pinchActive
      : context.currentGesture === 'OPEN_PALM' || context.currentGesture === 'PINCH');
    const elapsed = timestamp - this.stageSince;
    if (this.stage === 'PREPARING' && elapsed >= 180) {
      this.stage = 'ALIGNED'; this.stageSince = timestamp;
      events.push({ type: 'stage', stage: this.stage, spell, progress: 0.34 });
    } else if (this.stage === 'ALIGNED') {
      if (chargingPose) {
        this.stage = 'CHARGING'; this.stageSince = timestamp;
        events.push({ type: 'stage', stage: this.stage, spell, progress: 0.58 });
      }
    } else if (this.stage === 'CHARGING') {
      if (!chargingPose) {
        this.stage = 'ALIGNED'; this.stageSince = timestamp;
        events.push({ type: 'stage', stage: this.stage, spell, progress: 0.38 });
      } else {
        const progress = Math.min(1, (timestamp - this.stageSince) / (spell.chargeMs * context.chargeScale));
        if (progress >= 1) {
          this.stage = 'READY'; this.stageSince = timestamp;
          events.push({ type: 'stage', stage: this.stage, spell, progress: 1 });
        }
      }
    } else if (this.stage === 'READY' && this.resolver.canCast(spell, context.action as SpellAction | null)) {
      this.stage = 'CASTING';
      events.push({ type: 'stage', stage: this.stage, spell, progress: 1 });
      events.push({ type: 'cast', spell, context: { ...context, castStage: 'CASTING' } });
      this.cooldownUntil = timestamp + spell.cooldownMs;
      this.stageSince = timestamp;
    }
    return events;
  }

  reset() {
    this.stage = 'NONE';
    this.lockedSector = null;
    this.activeSpell = null;
    this.cooldownUntil = 0;
    this.stageSince = 0;
    this.pausedAt = 0;
  }
}
