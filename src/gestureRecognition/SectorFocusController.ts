export type SectorFocusStage = 'NONE' | 'HOVER' | 'FOCUSED' | 'LOCKED';

export interface SectorFocusState {
  sector: number | null;
  stage: SectorFocusStage;
  confidence: number;
}

/** Keeps a ray near a sector boundary from rapidly toggling between two palaces. */
export class SectorFocusController {
  private candidate: number | null = null;
  private candidateSince = 0;
  private focused: number | null = null;
  private locked: number | null = null;

  update(sector: number | null, timestamp: number, pointing: boolean): SectorFocusState {
    if (!pointing || sector === null) {
      this.candidate = null;
      this.candidateSince = 0;
      this.focused = null;
      this.locked = null;
      return { sector: null, stage: 'NONE', confidence: 0 };
    }
    if (sector !== this.candidate) {
      this.candidate = sector;
      this.candidateSince = timestamp;
      this.focused = null;
    }
    const age = Math.max(0, timestamp - this.candidateSince);
    const confidence = Math.min(1, age / 160);
    if (age >= 150) this.focused = sector;
    return {
      sector,
      stage: this.locked === sector ? 'LOCKED' : this.focused === sector ? 'FOCUSED' : 'HOVER',
      confidence,
    };
  }

  lock(sector: number | null) {
    this.locked = sector;
  }

  get focusedSector() { return this.focused; }

  reset() {
    this.candidate = null;
    this.candidateSince = 0;
    this.focused = null;
    this.locked = null;
  }
}
