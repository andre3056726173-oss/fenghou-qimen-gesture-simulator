import type { GestureSnapshot } from '../types';
import { landmarkToViewport } from '../handTracking/CameraCoordinates';

export interface SpellDebugState {
  lockedSector: string;
  spellCandidate: string;
  spellState: string;
  castGesture: string;
  palmVelocity: string;
  depthVelocity: string;
  swipeVelocity: string;
  holdTime: string;
  cooldown: string;
  activeSpell: string;
}

const connections = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];

export class DebugOverlay {
  enabled = false;
  private context: CanvasRenderingContext2D;
  private spellState: SpellDebugState | null = null;
  private qaLines: string[] = [];
  private performanceLine = '';
  private readonly onResize = () => this.resize();

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.context = canvas.getContext('2d')!;
    window.addEventListener('resize', this.onResize);
    this.resize();
  }

  toggle(force?: boolean) {
    this.enabled = force ?? !this.enabled;
    this.canvas.classList.toggle('active', this.enabled);
    document.body.classList.toggle('debug-active', this.enabled);
    if (!this.enabled) this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    return this.enabled;
  }

  draw(snapshot: GestureSnapshot) {
    if (!this.enabled) return;
    const { width, height } = this.canvas;
    this.context.clearRect(0, 0, width, height);
    snapshot.landmarks.forEach((hand, handIndex) => {
      const screen = hand.map((p) => landmarkToViewport(p.x, p.y, width, height));
      this.context.strokeStyle = handIndex ? 'rgba(228,188,93,.72)' : 'rgba(72,255,214,.72)';
      this.context.fillStyle = handIndex ? '#e7bd62' : '#65ffe0';
      this.context.lineWidth = 1.4 * devicePixelRatio;
      connections.forEach(([a, b]) => {
        this.context.beginPath();
        this.context.moveTo(screen[a].x * width, screen[a].y * height);
        this.context.lineTo(screen[b].x * width, screen[b].y * height);
        this.context.stroke();
      });
      hand.forEach((point, index) => {
        this.context.beginPath();
        this.context.arc(screen[index].x * width, screen[index].y * height, (index % 4 === 0 ? 4.2 : 2.4) * devicePixelRatio, 0, Math.PI * 2);
        this.context.fill();
      });
    });
    if (this.spellState) this.drawSpellTelemetry(this.spellState);
    if (this.qaLines.length) this.drawQaTelemetry(this.qaLines);
    if (this.performanceLine) {
      this.context.font = `${11 * devicePixelRatio}px monospace`;
      this.context.fillStyle = '#e0d4ab';
      this.context.fillText(this.performanceLine, 18 * devicePixelRatio, height - 18 * devicePixelRatio);
    }
  }

  updateSpell(state: SpellDebugState) {
    this.spellState = state;
  }

  updateQa(lines: string[]) { this.qaLines = lines; }
  updatePerformance(line: string) { this.performanceLine = line; }
  dispose() { window.removeEventListener('resize', this.onResize); this.toggle(false); }

  private drawSpellTelemetry(state: SpellDebugState) {
    const lines = [
      `SPELL / 锁定宫位: ${state.lockedSector}`,
      `候选: ${state.spellCandidate}  当前术式: ${state.activeSpell}`,
      `状态: ${state.spellState}  发动动作: ${state.castGesture}`,
      `Palm v: ${state.palmVelocity}  Depth v: ${state.depthVelocity}`,
      `Swipe v: ${state.swipeVelocity}  Hold: ${state.holdTime}`,
      `Cooldown: ${state.cooldown}`,
    ];
    this.context.save();
    this.context.font = `${12 * devicePixelRatio}px ui-monospace, Consolas, monospace`;
    this.context.fillStyle = 'rgba(210, 239, 226, .86)';
    this.context.shadowColor = 'rgba(0, 0, 0, .9)';
    this.context.shadowBlur = 5 * devicePixelRatio;
    lines.forEach((line, index) => this.context.fillText(line, 18 * devicePixelRatio, (26 + index * 18) * devicePixelRatio));
    this.context.restore();
  }

  private drawQaTelemetry(lines: string[]) {
    this.context.save();
    this.context.font = `${10 * devicePixelRatio}px ui-monospace, Consolas, monospace`;
    this.context.fillStyle = 'rgba(235, 210, 149, .86)';
    lines.slice(-15).forEach((line, index) => this.context.fillText(line, 18 * devicePixelRatio, (156 + index * 14) * devicePixelRatio));
    this.context.restore();
  }

  private resize() {
    this.canvas.width = Math.floor(window.innerWidth * devicePixelRatio);
    this.canvas.height = Math.floor(window.innerHeight * devicePixelRatio);
    this.canvas.style.width = `${window.innerWidth}px`;
    this.canvas.style.height = `${window.innerHeight}px`;
  }
}
