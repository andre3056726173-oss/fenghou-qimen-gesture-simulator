import type { SpellCastStage } from '../spells/SpellContext';

export type ChoreographyStage = 'FORMATION_ACTIVE' | 'PLATE_MANIPULATION' | 'SECTOR_TARGETING' | 'SECTOR_CONFIRMED' | 'SPELL_PRIMED' | 'CAST_WINDOW' | 'CASTING' | 'RECOVERY' | 'PAUSED_GRACE';

export interface ChoreographyInput {
  timestamp: number;
  formationActive: boolean;
  state: string;
  spellStage: SpellCastStage;
  hasHand: boolean;
  fist: boolean;
  pointing: boolean;
  rotating: boolean;
  gracePeriodMs: number;
}

export interface ChoreographyOutput {
  stage: ChoreographyStage;
  spellPaused: boolean;
  cancelSpell: boolean;
  collapseFormation: boolean;
  pointPrewarm: boolean;
}

/** High-level rhythm layer; lower state machines still own their individual mechanics. */
export class GestureChoreographyController {
  stage: ChoreographyStage = 'FORMATION_ACTIVE';
  private missingSince = 0;
  private fistSince = 0;
  private cancelledFist = false;

  update(input: ChoreographyInput): ChoreographyOutput {
    const primed = ['PREPARING', 'ALIGNED', 'CHARGING', 'READY'].includes(input.spellStage);
    let cancelSpell = false;
    let collapseFormation = false;
    if (!input.hasHand && primed) {
      if (!this.missingSince) this.missingSince = input.timestamp;
    } else this.missingSince = 0;
    const missingMs = this.missingSince ? input.timestamp - this.missingSince : 0;
    // Never resume in the 650–900ms gap while the hand is still absent.
    const spellPaused = primed && missingMs > input.gracePeriodMs;
    if (primed && missingMs > input.gracePeriodMs + 650) cancelSpell = true;

    if (input.fist) {
      if (!this.fistSince) this.fistSince = input.timestamp;
      const fistMs = input.timestamp - this.fistSince;
      if (primed && fistMs >= 280 && fistMs < 800 && !this.cancelledFist) {
        cancelSpell = true;
        this.cancelledFist = true;
      }
      if (fistMs >= 800) collapseFormation = true;
    } else {
      this.fistSince = 0;
      this.cancelledFist = false;
    }

    if (!input.formationActive) this.stage = 'RECOVERY';
    else if (spellPaused) this.stage = 'PAUSED_GRACE';
    else if (input.spellStage === 'CASTING') this.stage = 'CASTING';
    else if (input.spellStage === 'READY') this.stage = 'CAST_WINDOW';
    else if (primed) this.stage = 'SPELL_PRIMED';
    else if (input.state === 'LOCKING') this.stage = 'SECTOR_CONFIRMED';
    else if (input.pointing || input.state === 'POINTING') this.stage = 'SECTOR_TARGETING';
    else if (input.rotating) this.stage = 'PLATE_MANIPULATION';
    else this.stage = 'FORMATION_ACTIVE';
    return {
      stage: this.stage,
      spellPaused,
      cancelSpell,
      collapseFormation,
      // Lets pointing begin during the last part of a dial settle without forcing a hard state change.
      pointPrewarm: input.rotating && input.pointing,
    };
  }

  reset() {
    this.stage = 'FORMATION_ACTIVE';
    this.missingSince = 0;
    this.fistSince = 0;
    this.cancelledFist = false;
  }
}
