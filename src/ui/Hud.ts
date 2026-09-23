import type { GestureSnapshot, PalaceDefinition } from '../types';
import type { TrackerStatus } from '../handTracking/HandTracker';

const gestureLabels: Record<string, string> = {
  NO_HAND: '未检测到手', OPEN_PALM: 'OPEN PALM / 张掌', FIST: 'FIST / 握拳', POINTING: 'POINTING / 指向',
  PINCH: 'PINCH / 捏合', PUSH: 'PUSH / 前推', TWO_HANDS_OPEN: 'DUAL OPEN / 双掌', TWO_HANDS_SCALE: 'DUAL SCALE / 合阵', NEUTRAL: '识别中',
};

export class Hud {
  private cameraStatus = document.querySelector<HTMLElement>('#camera-status')!;
  private trackingFps = document.querySelector<HTMLElement>('#tracking-fps')!;
  private statusDot = document.querySelector<HTMLElement>('#status-dot')!;
  private gestureName = document.querySelector<HTMLElement>('#gesture-name')!;
  private confidenceMeter = document.querySelector<HTMLElement>('#confidence-meter')!;
  private confidenceValue = document.querySelector<HTMLElement>('#confidence-value')!;
  private palaceName = document.querySelector<HTMLElement>('#palace-name')!;
  private palaceSymbol = document.querySelector<HTMLElement>('#palace-symbol')!;
  private palaceElement = document.querySelector<HTMLElement>('#palace-element')!;
  private palaceSpell = document.querySelector<HTMLElement>('#palace-spell')!;
  private toastElement = document.querySelector<HTMLElement>('#toast')!;
  private toastTimer = 0;

  setTrackerStatus(status: TrackerStatus, message: string) {
    this.cameraStatus.textContent = message;
    this.statusDot.dataset.status = status;
  }

  update(snapshot: GestureSnapshot, fps: number) {
    this.trackingFps.textContent = String(fps);
    this.gestureName.textContent = gestureLabels[snapshot.name] ?? snapshot.name;
    const percent = Math.round(snapshot.confidence * 100);
    this.confidenceMeter.style.width = `${percent}%`;
    this.confidenceValue.textContent = `${percent}%`;
    document.querySelector('#debug-landmarks')!.textContent = `${snapshot.landmarks.length * 21} / 42`;
    document.querySelector('#debug-angle')!.textContent = `${(snapshot.wristAngle * 180 / Math.PI).toFixed(1)}°`;
    document.querySelector('#debug-pinch')!.textContent = snapshot.normalizedPinchDistance.toFixed(3);
    document.querySelector('#debug-rotation')!.textContent = `${snapshot.rotationVelocity.toFixed(2)} rad/s`;
    document.querySelector('#debug-hands')!.textContent = String(snapshot.handCount);
  }

  setPalace(palace: PalaceDefinition | null, confirmed = false) {
    if (!palace) return;
    this.palaceName.textContent = palace.name;
    this.palaceSymbol.textContent = palace.trigram;
    this.palaceElement.textContent = palace.element;
    this.palaceSpell.textContent = palace.spell;
    this.palaceSymbol.style.color = palace.cssColor;
    document.documentElement.style.setProperty('--selection-color', palace.cssColor);
    if (confirmed) this.toast(`已定宫 · ${palace.name}宫 · ${palace.spell}`);
  }

  toast(message: string) {
    this.toastElement.textContent = message;
    this.toastElement.classList.add('visible');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastElement.classList.remove('visible'), 1900);
  }
  dispose() { window.clearTimeout(this.toastTimer); }
}
