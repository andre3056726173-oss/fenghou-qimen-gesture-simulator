import type { SpellAction } from './SpellContext';

export type SpellId = 'KUN_EARTH' | 'XUN_WIND' | 'ZHEN_LIGHTNING' | 'KAN_WATER';

export interface SpellDefinition {
  id: SpellId;
  sector: number;
  name: string;
  action: SpellAction;
  color: number;
  chargeMs: number;
  cooldownMs: number;
}

// PALACES order is 离、坤、兑、乾、坎、艮、震、巽.
export const SPELL_DEFINITIONS: SpellDefinition[] = [
  { id: 'KUN_EARTH', sector: 1, name: '坤 · 厚载', action: 'PUSH', color: 0xd7a84e, chargeMs: 420, cooldownMs: 900 },
  { id: 'XUN_WIND', sector: 7, name: '巽 · 入微', action: 'SWIPE_RIGHT', color: 0x41dcb5, chargeMs: 360, cooldownMs: 760 },
  { id: 'ZHEN_LIGHTNING', sector: 6, name: '震 · 天引', action: 'FLICK', color: 0xb7a4ff, chargeMs: 340, cooldownMs: 1100 },
  { id: 'KAN_WATER', sector: 4, name: '坎 · 回澜', action: 'PULL', color: 0x4ba9ed, chargeMs: 450, cooldownMs: 900 },
];

export const SPELL_BY_SECTOR = new Map(SPELL_DEFINITIONS.map((spell) => [spell.sector, spell]));
