import type { GestureTuningValues } from './GestureTuning';

export interface SpellQaCounters { attempts: number; success: number; failures: Record<string, number>; }

export const REAL_QA_CHECKLIST = [
  '光照：明亮 / 普通 / 偏暗 / 背光',
  '手位：胸前 / 近镜头 / 远镜头 / 画面边缘',
  '手数：右手 / 左手 / 双手',
  '手速：慢 / 正常 / 稍快',
  '距离：近 / 正常 / 稍远',
  '连续：召阵收阵 ×5、拨盘 ×10、四术各 ×10、持续运行 5 分钟',
] as const;

export class RealInteractionQA {
  enabled = false;
  session = false;
  private startedAt = 0;
  private readonly spell: Record<string, SpellQaCounters> = {};
  private lostHands = 0;
  private falsePositive = 0;
  private readonly latencies: number[] = [];
  private readonly frames: number[] = [];
  private lastTuning: GestureTuningValues | null = null;
  private environment: Record<string, unknown> = {};

  setEnabled(value: boolean) { this.enabled = value; }
  toggleSession(timestamp: number, tuning: GestureTuningValues) {
    this.lastTuning = tuning;
    this.session = !this.session;
    if (this.session) {
      this.startedAt = timestamp; this.frames.length = 0; this.latencies.length = 0;
      Object.keys(this.spell).forEach((key) => delete this.spell[key]);
      this.lostHands = 0; this.falsePositive = 0; this.environment = {};
    }
    else this.download();
    return this.session;
  }
  frame(timestamp: number, renderFps: number) {
    if (this.session) this.frames.push(renderFps);
    if (this.session && timestamp - this.startedAt >= 60_000) { this.session = false; this.download(); }
  }
  setEnvironment(environment: Record<string, unknown>) { if (this.session) this.environment = environment; }
  lostHand() { if (this.session) this.lostHands += 1; }
  falseCast() { if (this.session) this.falsePositive += 1; }
  attempt(id: string) { if (!this.session) return; const counter = this.counter(id); counter.attempts += 1; }
  success(id: string, latencyMs: number) { if (!this.session) return; const counter = this.counter(id); counter.success += 1; this.latencies.push(latencyMs); }
  failure(id: string, reason: string) { if (!this.session) return; const counter = this.counter(id); counter.failures[reason] = (counter.failures[reason] ?? 0) + 1; }
  snapshot(tuning: GestureTuningValues) {
    const averageFps = this.frames.length ? this.frames.reduce((sum, value) => sum + value, 0) / this.frames.length : 0;
    const averageLatency = this.latencies.length ? this.latencies.reduce((sum, value) => sum + value, 0) / this.latencies.length : 0;
    return { startedAt: this.startedAt, averageFps, actionSampleToDispatchMs: averageLatency, latencyScope: 'CPU sample-to-dispatch only; not physical hand-to-photon latency', spell: this.spell, lostHands: this.lostHands, labelledFalsePositive: this.falsePositive, falsePositiveCoverage: 'No automatic ground-truth labels', environment: this.environment, tuning };
  }
  private counter(id: string) { return this.spell[id] ??= { attempts: 0, success: 0, failures: {} }; }
  private download() {
    if (!this.startedAt) return;
    const payload = JSON.stringify(this.snapshot(this.lastTuning ?? ({} as GestureTuningValues)), null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `qimen-qa-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  }
}
