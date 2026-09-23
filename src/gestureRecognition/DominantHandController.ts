import type { TrackedHand } from '../types';

/** Keeps the interaction hand first without making left-handed users unusable. */
export class DominantHandController {
  constructor(public preferred: 'Left' | 'Right' = 'Right') {}

  order(hands: TrackedHand[]) {
    return [...hands].sort((a, b) => {
      if (a.handedness === this.preferred && b.handedness !== this.preferred) return -1;
      if (b.handedness === this.preferred && a.handedness !== this.preferred) return 1;
      return b.confidence - a.confidence;
    });
  }

  primary(hands: TrackedHand[]) {
    return this.order(hands)[0];
  }
}
