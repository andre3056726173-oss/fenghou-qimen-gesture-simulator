import type { PalaceDefinition } from '../types';

export const PALACES: PalaceDefinition[] = [
  { name: '离', trigram: '☲', gate: '景门', element: '火 · 光明', spell: '离火流焰', color: 0xff5b2d, cssColor: '#ff6b38' },
  { name: '坤', trigram: '☷', gate: '死门', element: '土 · 承载', spell: '坤岳镇尘', color: 0xd9a441, cssColor: '#e7b95e' },
  { name: '兑', trigram: '☱', gate: '惊门', element: '泽 · 悦动', spell: '兑泽鸣光', color: 0x6fe5c1, cssColor: '#7aefd0' },
  { name: '乾', trigram: '☰', gate: '开门', element: '金 · 天行', spell: '乾穹剑炁', color: 0xf5d889, cssColor: '#f7dd91' },
  { name: '坎', trigram: '☵', gate: '休门', element: '水 · 潜藏', spell: '坎水回澜', color: 0x39a8ff, cssColor: '#4ab6ff' },
  { name: '艮', trigram: '☶', gate: '生门', element: '山 · 止定', spell: '艮山封界', color: 0xd1b169, cssColor: '#dfc178' },
  { name: '震', trigram: '☳', gate: '伤门', element: '雷 · 动变', spell: '震雷天引', color: 0x8c7cff, cssColor: '#9a8aff' },
  { name: '巽', trigram: '☴', gate: '杜门', element: '风 · 入微', spell: '巽风千流', color: 0x25e0b0, cssColor: '#35e9ba' },
];

export const HEAVENLY_STEMS_AND_BRANCHES = [
  '甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸',
  '子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥',
];
