import type { MotionState } from './GestureMotionDetector';
import type { SpellCastStage } from '../spells/SpellContext';

export type GesturePriority = 'COLLAPSE' | 'CAST' | 'LOCK' | 'SPELL_ARM' | 'ROTATE' | 'TARGET' | 'SPACE' | 'HOVER';

export class GesturePriorityResolver {
  resolve(options: { fist: boolean; spellStage: SpellCastStage; motion: MotionState; locking: boolean; spellArming?: boolean; rotating: boolean; pointing: boolean; spaceGesture: boolean }): GesturePriority {
    if (options.fist) return 'COLLAPSE';
    if (options.locking) return 'LOCK';
    if (options.spellStage === 'READY' && options.motion.action && options.motion.action !== 'HOLD') return 'CAST';
    if (options.spellArming) return 'SPELL_ARM';
    if (options.rotating) return 'ROTATE';
    if (options.pointing) return 'TARGET';
    if (options.spaceGesture) return 'SPACE';
    return 'HOVER';
  }
}
