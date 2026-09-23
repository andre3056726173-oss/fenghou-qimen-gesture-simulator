import type { GestureTuningStore, GestureTuningValues } from '../gestureRecognition/GestureTuning';

const controls: Array<[keyof GestureTuningValues, string, number, number, number]> = [
  ['pushThreshold', 'PUSH', 0.2, 0.8, 0.01],
  ['pullThreshold', 'PULL', 0.2, 0.8, 0.01],
  ['swipeThreshold', 'SWIPE', 0.05, 0.25, 0.01],
  ['flickThreshold', 'FLICK', 0.5, 1.8, 0.05],
  ['holdMs', 'HOLD ms', 120, 500, 10],
  ['inputBufferMs', 'BUFFER ms', 160, 500, 10],
  ['gracePeriodMs', 'GRACE ms', 100, 500, 10],
  ['snapDamping', 'SNAP DAMP', 0.9, 0.995, 0.005],
  ['chargeScale', 'CHARGE', 0.65, 1.35, 0.05],
  ['pushZWeight', 'PUSH Z W', 0, 1, 0.01],
  ['pushScaleWeight', 'PUSH S W', 0, 1, 0.01],
  ['pushFacingWeight', 'PUSH F W', 0, 1, 0.01],
  ['pullZWeight', 'PULL Z W', 0, 1, 0.01],
  ['pullScaleWeight', 'PULL S W', 0, 1, 0.01],
  ['pullFacingWeight', 'PULL F W', 0, 1, 0.01],
];

/** Minimal debug-only tuning surface. It does not appear in normal experience mode. */
export class GestureTuningPanel {
  private readonly element = document.createElement('aside');

  constructor(private readonly tuning: GestureTuningStore) {
    this.element.className = 'gesture-tuning-panel';
    this.element.innerHTML = '<p>GESTURE TUNING</p>';
    controls.forEach(([key, label, min, max, step]) => {
      const row = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'range'; input.min = String(min); input.max = String(max); input.step = String(step); input.value = String(this.tuning.values[key]);
      const value = document.createElement('b'); value.textContent = input.value;
      input.addEventListener('input', () => { this.tuning.update({ [key]: Number(input.value) }); value.textContent = input.value; });
      row.append(`${label} `, input, value);
      this.element.append(row);
    });
    const save = document.createElement('button');
    save.textContent = 'Save Calibration';
    save.addEventListener('click', () => this.tuning.save());
    this.element.append(save);
    document.body.append(this.element);
  }

  setVisible(visible: boolean) { this.element.classList.toggle('active', visible); }
  dispose() { this.element.remove(); }
}
