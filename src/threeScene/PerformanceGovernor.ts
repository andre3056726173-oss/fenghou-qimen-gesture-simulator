export type PerformanceTier = 'HIGH' | 'MEDIUM' | 'LOW';

/** Prioritises tracking and dial responsiveness when rendering pressure rises. */
export class PerformanceGovernor {
  tier: PerformanceTier = 'HIGH';
  private fps = 60;
  private candidate: PerformanceTier = 'HIGH';
  private candidateSeconds = 0;

  update(delta: number) {
    if (!Number.isFinite(delta) || delta <= 0) return { fps: this.fps, tier: this.tier, changed: false };
    const frameFps = 1 / Math.max(delta, 0.001);
    this.fps += (frameFps - this.fps) * 0.08;
    const next: PerformanceTier = this.tier === 'HIGH' ? (this.fps < 48 ? 'MEDIUM' : 'HIGH')
      : this.tier === 'MEDIUM' ? (this.fps < 33 ? 'LOW' : this.fps > 55 ? 'HIGH' : 'MEDIUM')
      : (this.fps > 40 ? 'MEDIUM' : 'LOW');
    if (next !== this.candidate) { this.candidate = next; this.candidateSeconds = 0; }
    this.candidateSeconds += Math.min(delta, 0.1);
    const upgrading = next === 'HIGH' || (this.tier === 'LOW' && next === 'MEDIUM');
    const changed = next !== this.tier && this.candidateSeconds >= (upgrading ? 3 : 1);
    if (changed) { this.tier = next; this.candidateSeconds = 0; }
    return { fps: this.fps, tier: this.tier, changed };
  }
}
