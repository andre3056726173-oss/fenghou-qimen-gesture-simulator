export const AUDIO_EVENTS = [
  'summon_start', 'summon_lock', 'plate_hover', 'plate_grab', 'plate_rotate',
  'plate_snap', 'sector_focus', 'sector_lock', 'formation_scale', 'formation_collapse',
  'spell_prepare', 'spell_ready', 'spell_cast', 'earth_cast', 'wind_cast',
  'lightning_cast', 'water_cast',
] as const;

export type AudioEventName = typeof AUDIO_EVENTS[number];
export type AudioCategory = 'MASTER' | 'FORMATION' | 'GESTURE' | 'SPELL' | 'AMBIENCE';
export interface AudioEventDetail { name: AudioEventName; category: AudioCategory; volume: number; }
export type AudioEventListener = (event: AudioEventName, detail: AudioEventDetail) => void;

const EVENT_CATEGORY: Record<AudioEventName, AudioCategory> = {
  summon_start: 'FORMATION', summon_lock: 'FORMATION', formation_scale: 'FORMATION', formation_collapse: 'FORMATION',
  plate_hover: 'GESTURE', plate_grab: 'GESTURE', plate_rotate: 'GESTURE', plate_snap: 'GESTURE', sector_focus: 'GESTURE', sector_lock: 'GESTURE',
  spell_prepare: 'SPELL', spell_ready: 'SPELL', spell_cast: 'SPELL', earth_cast: 'SPELL', wind_cast: 'SPELL', lightning_cast: 'SPELL', water_cast: 'SPELL',
};

/** Event-only audio seam. A WebAudio/sampled implementation can subscribe later without touching gesture code. */
export class AudioEventBus {
  private readonly listeners = new Set<AudioEventListener>();
  private master = 1;
  private readonly categories: Record<AudioCategory, number> = { MASTER: 1, FORMATION: 1, GESTURE: 1, SPELL: 1, AMBIENCE: 1 };

  on(listener: AudioEventListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setMasterVolume(volume: number) { this.master = Math.max(0, Math.min(1, volume)); }
  setCategoryVolume(category: AudioCategory, volume: number) {
    if (category === 'MASTER') this.setMasterVolume(volume);
    else this.categories[category] = Math.max(0, Math.min(1, volume));
  }
  getVolume(category: AudioCategory) { return this.master * this.categories[category]; }

  emit(event: AudioEventName) {
    const category = EVENT_CATEGORY[event];
    const detail: AudioEventDetail = { name: event, category, volume: this.getVolume(category) };
    this.listeners.forEach((listener) => listener(event, detail));
  }
  dispose() { this.listeners.clear(); }
}
