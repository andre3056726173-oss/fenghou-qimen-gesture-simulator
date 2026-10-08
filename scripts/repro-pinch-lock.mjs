// Replays point -> pinch attempts through the real TargetSelection / StateMachine / Smoother wiring of main.ts.
// Run: node --import ./scripts/test-loader.mjs scripts/repro-pinch-lock.mjs
import { TargetSelectionController } from '../src/gestureRecognition/TargetSelectionController.ts';
import { GestureStateMachine } from '../src/gestureRecognition/GestureStateMachine.ts';
import { GestureSmoother } from '../src/gestureRecognition/GestureSmoother.ts';

const lerp = (t, a, b, from, to) => t <= a ? from : t >= b ? to : from + (to - from) * (t - a) / (b - a);

function attempt({ dist, point, sector, end = 2500, fps = 30 }) {
  const target = new TargetSelectionController();
  const machine = new GestureStateMachine();
  const smoother = new GestureSmoother();
  machine.state = 'ACTIVE';
  const trail = [];
  for (let t = 0; t < end; t += 1000 / fps) {
    const d = dist(t), p = point(t);
    const snapshot = { handCount: 1, name: 'X', pointing: p, pointScore: p ? 0.9 : 0.3, pinchActive: d < 0.18,
      normalizedPinchDistance: d, openPalm: false, fist: false, extendedFingerCount: p ? 1 : 0, fistScore: 0,
      twoHandsOpen: false, twoHandsPinch: false, handDistance: 0, handAxisAngle: 0, confidence: 0.9, scaleVelocity: 0 };
    const stable = smoother.update(snapshot, t);
    const pointingActive = p && !snapshot.pinchActive;
    target.update({ timestamp: t, now: t, fresh: true, hasHand: true, active: true, pointing: pointingActive,
      pointScore: snapshot.pointScore, sector: pointingActive ? sector(t) : null, boundaryDistance: 10, aimSpeed: 0.2,
      pinchDistance: d, graceMs: 250 });
    for (const e of target.events) if (/EXPIRED|LOCK_TIMEOUT/.test(e.event)) trail.push(e.event);
    const armed = target.armedSector !== null;
    const events = machine.update({ ...stable, pointing: pointingActive }, 'ACTIVE', t, 0, { manipulation: true, space: true,
      suppressFistCollapse: false, lockSector: armed && target.pinch.confirmed, targetArmed: armed, lockConfirmed: target.pinch.confirmed });
    for (const e of events) {
      if (e.type === 'LOCK') return `LOCK 宫${target.armedSector}`;
      if (e.type === 'BEGIN_ROTATION') return `转盘 (${[...new Set(trail)].join(', ')})`;
    }
  }
  return `无反应 (${[...new Set(trail)].join(', ') || '—'})`;
}

const cases = [
  ['A 指宫后直接捏（300ms）', { dist: (t) => lerp(t, 600, 900, 0.8, 0.08), point: (t) => t < 700, sector: () => 3 }, 'LOCK 宫3'],
  ['B 指完停 500ms 再捏', { dist: (t) => t < 1100 ? 0.8 : lerp(t, 1100, 1400, 0.8, 0.08), point: (t) => t < 600, sector: () => 3 }, 'LOCK 宫3'],
  ['C 捏到 0.25 犹豫 500ms 再捏紧', { dist: (t) => t < 700 ? lerp(t, 600, 700, 0.8, 0.25) : t < 1200 ? 0.25 : lerp(t, 1200, 1300, 0.25, 0.1), point: (t) => t < 650, sector: () => 3 }, 'LOCK 宫3'],
  ['D 捏紧时距离只到 0.21', { dist: (t) => lerp(t, 600, 900, 0.8, 0.21), point: (t) => t < 700, sector: () => 3 }, 'LOCK 宫3'],
  ['E 弯指时指尖漂到隔壁宫', { dist: (t) => lerp(t, 600, 1000, 0.8, 0.08), point: (t) => t < 900, sector: (t) => t < 650 ? 3 : 5 }, 'LOCK 宫3'],
];

let failed = 0;
for (const [name, input, expected] of cases) {
  const actual = attempt(input);
  const ok = actual === expected;
  if (!ok) failed += 1;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name.padEnd(22)} 期望 ${expected.padEnd(8)} 实际 ${actual}`);
}
process.exitCode = failed ? 1 : 0;
