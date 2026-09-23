import type { SpellAction } from './SpellContext';
import type { SpellDefinition } from './SpellDefinition';

/** Keeps gesture-to-spell rules separate from the spell state machine. */
export class SpellResolver {
  canCast(definition: SpellDefinition, action: SpellAction | null) {
    if (!action) return false;
    if (definition.id === 'XUN_WIND') return action === 'SWIPE_LEFT' || action === 'SWIPE_RIGHT';
    return action === definition.action;
  }
}
