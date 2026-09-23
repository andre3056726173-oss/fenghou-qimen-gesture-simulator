export interface RuntimeStateSnapshot {
  formation: string; gesture: string; spell: string;
  grabbedPlate: number | null; spaceGrabbed: boolean; lockedSector: number | null;
}

export function stateViolations(s: RuntimeStateSnapshot): string[] {
  const errors: string[] = [];
  if (s.formation !== 'ACTIVE' && s.spell !== 'NONE') errors.push('INACTIVE_FORMATION_WITH_SPELL');
  if (s.spell === 'CASTING' && ['ROTATING', 'GRAB_SPACE'].includes(s.gesture)) errors.push('CASTING_WITH_MANIPULATION');
  if (s.formation === 'COLLAPSING' && ['ROTATING', 'GRAB_SPACE', 'POINTING', 'LOCKING'].includes(s.gesture)) errors.push('COLLAPSE_WITH_INTERACTION');
  if (s.spaceGrabbed && s.gesture !== 'GRAB_SPACE') errors.push('ORPHAN_SPACE_GRAB');
  if (s.grabbedPlate !== null && s.gesture !== 'ROTATING') errors.push('ORPHAN_PLATE_GRAB');
  if (s.spell !== 'NONE' && s.lockedSector === null) errors.push('SPELL_WITHOUT_LOCK');
  return errors;
}

/** Diagnostics only: reports edges, never repairs state or changes a gesture. */
export class StateInvariantGuard {
  private previous = '';
  check(snapshot: RuntimeStateSnapshot) {
    const violations = stateViolations(snapshot);
    const key = violations.join(',');
    if (key && key !== this.previous) console.warn('[Qimen invariant]', violations, snapshot);
    this.previous = key;
  }
}
