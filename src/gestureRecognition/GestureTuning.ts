export interface GestureTuningValues {
  pushThreshold: number;
  pullThreshold: number;
  swipeThreshold: number;
  flickThreshold: number;
  holdMs: number;
  inputBufferMs: number;
  gracePeriodMs: number;
  snapDamping: number;
  chargeScale: number;
  handScaleBaseline: number;
  pushZWeight: number;
  pushScaleWeight: number;
  pushFacingWeight: number;
  pullZWeight: number;
  pullScaleWeight: number;
  pullFacingWeight: number;
}

export const DEFAULT_GESTURE_TUNING: GestureTuningValues = {
  pushThreshold: 0.42,
  pullThreshold: 0.42,
  swipeThreshold: 0.12,
  flickThreshold: 1.1,
  holdMs: 260,
  inputBufferMs: 360,
  gracePeriodMs: 250,
  snapDamping: 0.965,
  chargeScale: 1,
  handScaleBaseline: 0.12,
  pushZWeight: 0.52,
  pushScaleWeight: 0.33,
  pushFacingWeight: 0.15,
  pullZWeight: 0.56,
  pullScaleWeight: 0.30,
  pullFacingWeight: 0.14,
};

/** Runtime tuning source shared by motion, choreography and the debug panel. */
export class GestureTuningStore {
  values: GestureTuningValues;
  private readonly listeners = new Set<(values: GestureTuningValues) => void>();

  constructor() {
    this.values = this.load();
  }

  update(patch: Partial<GestureTuningValues>) {
    this.values = { ...this.values, ...patch };
    this.listeners.forEach((listener) => listener(this.values));
  }

  onChange(listener: (values: GestureTuningValues) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  save() {
    localStorage.setItem('qimen.gestureCalibration', JSON.stringify(this.values));
  }

  reset() {
    this.values = { ...DEFAULT_GESTURE_TUNING };
    localStorage.removeItem('qimen.gestureCalibration');
    this.listeners.forEach((listener) => listener(this.values));
  }

  private load(): GestureTuningValues {
    try {
      const saved = JSON.parse(localStorage.getItem('qimen.gestureCalibration') ?? '{}') as Partial<GestureTuningValues>;
      return { ...DEFAULT_GESTURE_TUNING, ...saved };
    } catch {
      return { ...DEFAULT_GESTURE_TUNING };
    }
  }
}
