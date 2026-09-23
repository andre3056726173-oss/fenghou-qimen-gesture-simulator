import type { SpellId } from './SpellDefinition';

export interface SpellVisualDefinition {
  color: number;
  pathLife: number;
  earthShardCount: number;
  earthLife: number;
  windRibbonCount: number;
  windLife: number;
  lightningBoltCount: number;
  lightningLife: number;
  waterLife: number;
  baseOpacity: number;
}

/** Visual-only spell parameters. Gesture/cast thresholds intentionally live elsewhere. */
export const SPELL_VISUALS: Record<SpellId, SpellVisualDefinition> = {
  KUN_EARTH: { color: 0xd4a64a, pathLife: 1.15, earthShardCount: 5, earthLife: 1.25, windRibbonCount: 0, windLife: 0, lightningBoltCount: 0, lightningLife: 0, waterLife: 0, baseOpacity: 0.82 },
  XUN_WIND: { color: 0x43d9b0, pathLife: 1.15, earthShardCount: 0, earthLife: 0, windRibbonCount: 5, windLife: 1.35, lightningBoltCount: 0, lightningLife: 0, waterLife: 0, baseOpacity: 0.58 },
  ZHEN_LIGHTNING: { color: 0xbba9ff, pathLife: 0.38, earthShardCount: 0, earthLife: 0, windRibbonCount: 0, windLife: 0, lightningBoltCount: 3, lightningLife: 0.42, waterLife: 0, baseOpacity: 1 },
  KAN_WATER: { color: 0x4eb9f2, pathLife: 1.15, earthShardCount: 0, earthLife: 0, windRibbonCount: 0, windLife: 0, lightningBoltCount: 0, lightningLife: 0, waterLife: 1.55, baseOpacity: 0.64 },
};
