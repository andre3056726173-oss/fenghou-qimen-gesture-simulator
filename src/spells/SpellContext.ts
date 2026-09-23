import type { GestureSnapshot } from '../types';

export type SpellCastStage = 'NONE' | 'PREPARING' | 'ALIGNED' | 'CHARGING' | 'READY' | 'CASTING' | 'COOLDOWN';
export type SpellAction = 'PUSH' | 'PULL' | 'SWIPE_LEFT' | 'SWIPE_RIGHT' | 'FLICK' | 'HOLD';

export interface SpellVector3 {
  x: number;
  y: number;
  z: number;
}

export interface SpellContext {
  selectedSector: number | null;
  lockedSector: number | null;
  earthPlateAngle: number;
  humanPlateAngle: number;
  heavenPlateAngle: number;
  spiritPlateAngle: number;
  dominantHand: 'Left' | 'Right' | 'Unknown';
  currentGesture: string;
  handVelocity: SpellVector3;
  handDepthVelocity: number;
  formationScale: number;
  formationState: string;
  castStage: SpellCastStage;
  action: SpellAction | null;
  castIntensity: number;
  castDirection: SpellVector3;
  chargeScale: number;
  handSnapshot?: GestureSnapshot;
}
