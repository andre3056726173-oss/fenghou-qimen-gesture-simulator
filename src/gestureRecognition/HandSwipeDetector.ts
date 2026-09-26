import type { SpellVector3 } from '../spells/SpellContext';

export type SwipeAction = 'SWIPE_LEFT' | 'SWIPE_RIGHT';
export type SwipeFailure = 'NONE' | 'SWIPE_TOO_SLOW' | 'SWIPE_TOO_SHORT' | 'LOW_DIRECTION_CONSISTENCY' | 'TOO_MUCH_VERTICAL_DRIFT' | 'DIRECTION_REVERSAL' | 'HAND_LOST' | 'NOT_OPEN_PALM';
export interface SwipeSample { timestamp: number; position: SpellVector3; openPalm: boolean; pinch: boolean }
export interface SwipeState {
  action: SwipeAction | null;
  direction: 'LEFT' | 'RIGHT' | 'NONE';
  horizontal: number;
  vertical: number;
  total: number;
  verticalTravel: number;
  totalTravel: number;
  windowMs: number;
  velocityX: number;
  horizontalRatio: number;
  consistency: number;
  score: number;
  failure: SwipeFailure;
}

export function emptySwipe(failure: SwipeFailure = 'SWIPE_TOO_SHORT'): SwipeState {
  return { action: null, direction: 'NONE', horizontal: 0, vertical: 0, total: 0, verticalTravel: 0, totalTravel: 0, windowMs: 0, velocityX: 0, horizontalRatio: 0, consistency: 0, score: 0, failure };
}

/** One directional stroke per open-palm movement; all positions are already in mirrored screen space. */
export class HandSwipeDetector {
  private direction: 'LEFT' | 'RIGHT' | null = null;
  private quietSince: number | null = null;
  private armedAfter = -Infinity;

  update(history: readonly SwipeSample[], displacementThreshold: number): SwipeState {
    const end = history.at(-1);
    const previous = history.at(-2);
    if (!end) return emptySwipe('HAND_LOST');
    if (!end.openPalm || end.pinch) {
      this.reset(); this.armedAfter = end.timestamp;
      return emptySwipe('NOT_OPEN_PALM');
    }
    if (previous && end.timestamp - previous.timestamp > 120) {
      this.reset(); this.armedAfter = end.timestamp;
      return emptySwipe('HAND_LOST');
    }
    const instantX = previous ? (end.position.x - previous.position.x) / Math.max(.001, (end.timestamp - previous.timestamp) / 1000) : 0;
    if (this.direction) {
      if (Math.abs(instantX) < .14) this.quietSince ??= end.timestamp;
      else this.quietSince = null;
      if (this.quietSince !== null && end.timestamp - this.quietSince >= 120) {
        this.direction = null; this.quietSince = null; this.armedAfter = end.timestamp;
      }
    }
    let startIndex = -1;
    for (let i = history.length - 1; i >= 0; i--) {
      const age = end.timestamp - history[i].timestamp;
      if (history[i].timestamp < this.armedAfter || age > 250) break;
      if (age >= 120) startIndex = i;
      if (age >= 160) break;
    }
    if (startIndex < 0 || history.length - startIndex < 3) return { ...emptySwipe(), direction: this.direction ?? 'NONE' };
    const start = history[startIndex];
    const dx = end.position.x - start.position.x, dy = end.position.y - start.position.y;
    let horizontalPath = 0, verticalPath = 0, path = 0;
    for (let i = startIndex + 1; i < history.length; i++) {
      const a = history[i - 1], b = history[i];
      if (b.timestamp - a.timestamp > 120) return emptySwipe('HAND_LOST');
      const x = b.position.x - a.position.x, y = b.position.y - a.position.y;
      horizontalPath += Math.abs(x); verticalPath += Math.abs(y); path += Math.hypot(x, y);
    }
    const windowMs = end.timestamp - start.timestamp;
    const velocityX = dx / (windowMs / 1000);
    const consistency = Math.min(1, Math.abs(dx) / Math.max(.001, horizontalPath));
    const horizontalRatio = Math.abs(dx) / Math.max(.001, path);
    const reversedDistance = (horizontalPath - Math.abs(dx)) / 2;
    const score = Math.min(1, Math.abs(dx) / Math.max(.01, displacementThreshold)) *
      Math.min(1, Math.abs(velocityX) / Math.max(.01, displacementThreshold / .16)) * consistency * horizontalRatio;
    const stats: SwipeState = { action: null, direction: this.direction ?? 'NONE', horizontal: dx, vertical: dy,
      total: Math.hypot(dx, dy), verticalTravel: verticalPath, totalTravel: path, windowMs, velocityX, horizontalRatio, consistency, score, failure: 'NONE' };
    // A lock only ends after the hand rests. A trailing recoil cannot create an opposite stroke.
    if (this.direction && Math.sign(instantX) !== (this.direction === 'RIGHT' ? 1 : -1) && Math.abs(instantX) >= .14) stats.failure = 'DIRECTION_REVERSAL';
    else if (history.slice(startIndex).some(sample => !sample.openPalm || sample.pinch)) stats.failure = 'NOT_OPEN_PALM';
    else if (reversedDistance > Math.max(.015, Math.abs(dx) * .15)) stats.failure = 'DIRECTION_REVERSAL';
    else if (consistency < .8) stats.failure = 'LOW_DIRECTION_CONSISTENCY';
    else if (verticalPath > .001 && Math.abs(dx) <= verticalPath * 1.15) stats.failure = 'TOO_MUCH_VERTICAL_DRIFT';
    else if (Math.abs(velocityX) < .14 || Math.abs(instantX) < .14) stats.failure = 'SWIPE_TOO_SLOW';
    else if (Math.abs(dx) < displacementThreshold) stats.failure = 'SWIPE_TOO_SHORT';
    else if (!this.direction) {
      this.direction = dx > 0 ? 'RIGHT' : 'LEFT';
      stats.direction = this.direction;
      stats.action = this.direction === 'RIGHT' ? 'SWIPE_RIGHT' : 'SWIPE_LEFT';
    }
    return stats;
  }

  reset() { this.direction = null; this.quietSince = null; this.armedAfter = -Infinity; }
}
