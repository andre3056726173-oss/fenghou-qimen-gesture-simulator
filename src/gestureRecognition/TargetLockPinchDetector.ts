export class TargetLockPinchDetector {
  score = 0;
  closingVelocity = 0;
  downEdge = false;
  candidate = false;
  confirmed = false;
  candidateAt = 0;
  private neutral = false;
  private neutralAt = -Infinity;
  private samples = 0;
  private previousDistance = Infinity;
  private previousAt = -Infinity;

  update(distance: number, timestamp: number, armed: boolean) {
    if (timestamp <= this.previousAt) return;
    this.downEdge = false;
    this.confirmed = false;
    const dt = (timestamp - this.previousAt) / 1000;
    const closingDistance = this.previousDistance - distance;
    this.closingVelocity = Number.isFinite(this.previousDistance) && dt > 0 && dt < 0.2
      ? closingDistance / dt : 0;
    const proximity = Math.max(0, Math.min(1, (0.30 - distance) / 0.12));
    this.score = Math.min(1, proximity * 0.85 + Math.max(0, Math.min(1, this.closingVelocity / 2)) * 0.15);
    this.previousDistance = distance;
    this.previousAt = timestamp;
    if (distance > 0.30) this.neutralAt = timestamp;
    if (!armed) { this.neutral = false; this.candidate = false; this.samples = 0; return; }
    if (timestamp - this.neutralAt <= 500) this.neutral = true;
    if (distance > 0.30) { this.neutral = true; this.candidate = false; this.samples = 0; return; }
    if (!this.neutral) return;
    if (!this.candidate && distance < 0.30 && this.closingVelocity > 0) {
      this.downEdge = true;
      this.candidate = true;
      this.candidateAt = timestamp;
      this.samples = 0;
    }
    if (!this.candidate) return;
    // Two distinct camera samples, including one strong contact. A held old pinch never arms.
    if (distance <= 0.24 && (this.closingVelocity >= -0.3 || closingDistance >= -0.015)) this.samples += 1;
    else this.samples = 0;
    if (this.samples >= 2) {
      this.confirmed = true;
      this.candidate = false;
      this.neutral = false; this.neutralAt = -Infinity;
    }
  }

  get waitingNeutral() { return !this.neutral && !this.candidate; }
  reset(keepNeutralHistory = false) {
    this.score = 0; this.closingVelocity = 0; this.downEdge = false;
    this.candidate = false; this.confirmed = false; this.candidateAt = 0;
    this.neutral = false; this.samples = 0; this.previousDistance = Infinity; this.previousAt = -Infinity;
    if (!keepNeutralHistory) this.neutralAt = -Infinity;
  }
}
