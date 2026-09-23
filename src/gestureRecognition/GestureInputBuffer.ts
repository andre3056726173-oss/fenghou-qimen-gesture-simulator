import type { SpellAction, SpellVector3 } from '../spells/SpellContext';

export type BufferedIntent = SpellAction | 'POINT' | 'PINCH' | 'OPEN_PALM' | 'FIST';

export interface BufferedInput {
  intent: BufferedIntent;
  timestamp: number;
  intensity: number;
  direction?: SpellVector3;
}

/** Small intent buffer: it bridges natural overlaps without turning old motion into a cast. */
export class GestureInputBuffer {
  private readonly entries: BufferedInput[] = [];

  push(intent: BufferedIntent, timestamp: number, intensity = 1, direction?: SpellVector3) {
    const latest = this.entries[this.entries.length - 1];
    if (latest?.intent === intent && timestamp - latest.timestamp < 70) return;
    this.entries.push({ intent, timestamp, intensity, direction: direction ? { ...direction } : undefined });
    this.prune(timestamp, 700);
  }

  consume(intents: BufferedIntent[], timestamp: number, maxAgeMs: number) {
    this.prune(timestamp, maxAgeMs);
    for (let index = this.entries.length - 1; index >= 0; index -= 1) {
      const entry = this.entries[index];
      if (intents.includes(entry.intent) && timestamp - entry.timestamp <= maxAgeMs) {
        this.entries.splice(index, 1);
        return entry;
      }
    }
    return null;
  }

  peek(intents: BufferedIntent[], timestamp: number, maxAgeMs: number) {
    this.prune(timestamp, maxAgeMs);
    return [...this.entries].reverse().find((entry) => intents.includes(entry.intent) && timestamp - entry.timestamp <= maxAgeMs) ?? null;
  }

  clear() { this.entries.length = 0; }

  private prune(timestamp: number, maxAgeMs: number) {
    while (this.entries.length && timestamp - this.entries[0].timestamp > maxAgeMs) this.entries.shift();
  }
}
