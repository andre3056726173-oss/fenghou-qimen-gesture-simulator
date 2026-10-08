import test from 'node:test';
import assert from 'node:assert/strict';
import { GestureRecognizer } from '../src/gestureRecognition/GestureRecognizer.ts';
import { GestureMotionDetector } from '../src/gestureRecognition/GestureMotionDetector.ts';
import { DEFAULT_GESTURE_TUNING } from '../src/gestureRecognition/GestureTuning.ts';
import { TargetSelectionController } from '../src/gestureRecognition/TargetSelectionController.ts';
import { TargetLockPinchDetector } from '../src/gestureRecognition/TargetLockPinchDetector.ts';
import { ReadyMotionCastController } from '../src/gestureRecognition/ReadyMotionCastController.ts';
import { HandSwipeDetector } from '../src/gestureRecognition/HandSwipeDetector.ts';

function openHand(scale = 1, side = false) {
  const points = Array.from({ length: 21 }, () => ({ x: .5, y: .6, z: 0 }));
  const coords = [[0, .5, .82], [1, .4, .68], [2, .35, .62], [3, .3, .56], [4, .24, .52],
    [5, .42, .58], [9, .5, .56], [13, .58, .58], [17, .66, .62],
    [6, .4, .45], [7, .39, .35], [8, .38, .26], [10, .5, .43], [11, .5, .33], [12, .5, .24],
    [14, .6, .45], [15, .61, .36], [16, .62, .27], [18, .7, .52], [19, .72, .44], [20, .74, .37]];
  for (const [id, x, y] of coords) points[id] = {
    x: .5 + (x - .5) * scale * (side ? .05 : 1), y: .5 + (y - .5) * scale,
    z: side ? (x - .5) * scale : 0,
  };
  return { landmarks: points, handedness: 'Right', confidence: .95 };
}
const recognize = (hand, timestamp = 1000) => new GestureRecognizer().update({ timestamp, fps: 15, hands: [hand] });
const sample = (timestamp, extra = {}) => ({ timestamp, fresh: true, hasHand: true, active: true,
  pointing: true, pointScore: .99, sector: 1, boundaryDistance: 15, aimSpeed: 0, pinchDistance: .6, graceMs: 250, ...extra });
function focused(gap = .6) {
  const target = new TargetSelectionController();
  for (const t of [1000, 1033, 1066, 1100]) target.update(sample(t, { pinchDistance: gap }));
  assert.equal(target.armedSector, 1);
  return target;
}
const close = (target, timestamp, gap) => target.update(sample(timestamp, { pointing: false, sector: null, pinchDistance: gap }));

for (const scale of [1, .35]) {
  test('A: front-facing open palm remains OPEN at scale ' + scale, () => {
    const s = recognize(openHand(scale));
    assert.equal(s.palmFacingCamera, true); assert.equal(s.openPalm, true); assert.equal(s.fist, false);
  });
  test('A: side-facing palm is rejected at scale ' + scale, () => {
    const s = recognize(openHand(scale, true));
    assert.equal(s.palmFacingCamera, false); assert.equal(s.openPalm, false);
  });
}
test('A: at the typical .12 palm size, front and side keep their prior classifications', () => {
  for (const side of [false, true]) {
    const hand = openHand(.12 / .26, side), points = hand.landmarks;
    const a = points[5], b = points[17], w = points[0];
    const prior = Math.abs((a.x - w.x) * (b.y - w.y) - (a.y - w.y) * (b.x - w.x)) > .008;
    assert.equal(recognize(hand).palmFacingCamera, prior);
  }
});
test('A: two small open palms still support the existing two-hand gesture', () => {
  const s = new GestureRecognizer().update({ timestamp: 1000, fps: 15, hands: [openHand(.35), openHand(.35)] });
  assert.equal(s.twoHandsOpen, true);
});

for (const dropout of [{ pointing: false, pointScore: .4 }, { sector: null }]) {
  test('B: same-sector dwell survives one raw ' + (dropout.sector === null ? 'sector' : 'POINT') + ' dropout at 30fps', () => {
    const target = new TargetSelectionController();
    for (let i = 0; i < 8; i++) target.update(sample(1000 + i * 1000 / 30, i % 4 === 3 ? dropout : {}));
    assert.equal(target.armedSector, 1);
  });
}
test('B: dropout does not add samples or focus until a new valid sample arrives', () => {
  const target = new TargetSelectionController(); target.update(sample(1000));
  target.update(sample(1100, { pointing: false }));
  target.update(sample(1133, { pointing: false }));
  assert.equal(target.previewSector, null); assert.equal(target.armedSector, null);
  target.update(sample(1133, { fresh: false })); assert.equal(target.armedSector, null);
  target.update(sample(1166)); assert.equal(target.armedSector, 1);
});
test('B: a POINT dropout longer than 150ms restarts dwell, even without intermediate ticks', () => {
  for (const tickDuringDropout of [false, true]) {
    const target = new TargetSelectionController();
    target.update(sample(1000)); target.update(sample(1033));
    target.update(sample(1066, { pointing: false }));
    if (tickDuringDropout) target.update(sample(1233, { pointing: false }));
    target.update(sample(1266)); assert.equal(target.armedSector, null); assert.equal(target.previewSector, null);
    target.update(sample(1366)); assert.equal(target.armedSector, 1);
  }
});
test('B: a different palace still starts its own dwell after a dropout', () => {
  const target = new TargetSelectionController(); target.update(sample(1000)); target.update(sample(1033));
  target.update(sample(1066, { pointing: false })); target.update(sample(1100, { sector: 2 }));
  assert.equal(target.armedSector, null);
  target.update(sample(1200, { sector: 2 })); assert.equal(target.armedSector, 2);
});

test('C: recent pre-Armed open fingers permit the half-closed transition to lock', () => {
  const target = new TargetSelectionController();
  for (const t of [1000, 1033, 1066]) target.update(sample(t, { pinchDistance: .31 }));
  target.update(sample(1100, { pinchDistance: .29 }));
  close(target, 1133, .23); close(target, 1166, .16);
  assert.equal(target.pinch.confirmed, true);
});
test('C: slow closing can confirm after the former 180ms deadline', () => {
  const target = focused();
  const gaps = [.35, .29, .27, .25, .23, .22, .21, .19, .15];
  const confirmations = [];
  for (const [i, gap] of gaps.entries()) {
    close(target, 1133 + i * 33, gap);
    confirmations.push(...target.events.filter(e => e.event === 'LOCK_CONFIRMED'));
    assert.notEqual(target.failure, 'LOCK_TIMEOUT');
  }
  assert.equal(confirmations.length, 1); assert.equal(confirmations[0].latencyMs, 198);
});
test('C: small contact rebound keeps contact evidence for the next strong sample', () => {
  const target = focused();
  close(target, 1133, .23); close(target, 1166, .241); close(target, 1199, .225);
  close(target, 1232, .236); close(target, 1265, .195);
  assert.equal(target.pinch.confirmed, true);
});
test('C: brief hand loss keeps recent neutral but requires fresh contact evidence', () => {
  const target = focused(); target.update(sample(1133, { hasHand: false }));
  close(target, 1200, .23); assert.equal(target.pinch.confirmed, false);
  close(target, 1233, .16); close(target, 1266, .15);
  assert.equal(target.pinch.confirmed, true);
});
test('C: a pinch held throughout pre-Armed and brief loss remains an old pinch', () => {
  const target = focused(.16); target.update(sample(1133, { hasHand: false }));
  for (const t of [1200, 1233, 1266]) close(target, t, .15);
  assert.equal(target.pinch.confirmed, false); assert.equal(target.failure, 'PINCH_ALREADY_ACTIVE');
});
test('C: pre-Armed neutral older than 500ms cannot revive a held pinch', () => {
  const detector = new TargetLockPinchDetector();
  detector.update(.6, 1000, false); detector.update(.29, 1066, false);
  for (const [i, gap] of [.23, .16, .15].entries()) detector.update(gap, 1533 + i * 33, true);
  assert.equal(detector.confirmed, false); assert.equal(detector.waitingNeutral, true);
});
test('C: an over-400ms closure still times out and requires a new release', () => {
  const detector = new TargetLockPinchDetector(); detector.update(.6, 1000, true);
  detector.update(.29, 1033, true);
  for (const t of [1100, 1200, 1300, 1400]) detector.update(.27, t, true);
  detector.update(.19, 1434, true); assert.equal(detector.timedOut, true);
  detector.update(.15, 1467, true); detector.update(.14, 1500, true);
  assert.equal(detector.confirmed, false); assert.equal(detector.waitingNeutral, true);
});
test('C: confirmed pinch is consumed once until another genuine open sample', () => {
  const target = focused(); close(target, 1133, .23); close(target, 1166, .16);
  assert.equal(target.pinch.confirmed, true);
  for (const [i, gap] of [.17, .15, .16, .14].entries()) {
    close(target, 1199 + i * 33, gap); assert.equal(target.pinch.confirmed, false);
  }
});

function rescale(hand, ratio) {
  const center = recognize(hand).palmCenter;
  return { ...hand, landmarks: hand.landmarks.map(p => ({
    x: center.x + (p.x - center.x) * ratio, y: center.y + (p.y - center.y) * ratio,
    z: center.z + (p.z - center.z) * ratio,
  })) };
}
for (const [action, delta] of [['PUSH', .02], ['PULL', -.02]]) {
  test('D: fixed-center apparent palm-size change emits ' + action, () => {
    const hand = openHand(1), first = recognize(hand);
    const detector = new GestureMotionDetector({ values: DEFAULT_GESTURE_TUNING });
    detector.update(first, 1000);
    const next = recognize(rescale(hand, (first.handScale + delta) / first.handScale), 1066.6667);
    const motion = detector.update(next, 1066.6667);
    assert.ok(motion.speed < 1e-10);
    assert.ok((action === 'PUSH' ? motion.pushEvidence : motion.pullEvidence) > .42);
    assert.equal(motion.action, action);
  });
}
test('D: static-palm scale noise stays neutral and cannot cast from READY', () => {
  const detector = new GestureMotionDetector({ values: DEFAULT_GESTURE_TUNING });
  const gate = new ReadyMotionCastController('PUSH'), hand = openHand(1), first = recognize(hand);
  for (let i = 0; i < 30; i++) {
    const timestamp = 1000 + i * 1000 / 15;
    const s = recognize(rescale(hand, (first.handScale + (i % 2 ? .001 : 0)) / first.handScale), timestamp);
    const motion = detector.update(s, timestamp);
    assert.ok(motion.action === null || motion.action === 'HOLD');
    const output = gate.update({ snapshot: s, motion, timestamp, freshSample: true, stage: 'READY',
      stableOpen: true, stablePinch: false, stablePoint: false, threshold: .42 });
    assert.ok(output.action === null || output.action === 'HOLD'); assert.equal(gate.castGate, false);
  }
  assert.equal(gate.state, 'ARMED');
});

for (const kind of ['PUSH', 'SWIPE']) {
  test('E: ' + kind + ' remains armed and confirms across one missing 15fps sample', () => {
    const gate = new ReadyMotionCastController(kind), s = recognize(openHand(1));
    const detector = new GestureMotionDetector({ values: DEFAULT_GESTURE_TUNING });
    const tick = (timestamp, motion = detector.update(s, timestamp)) => gate.update({ snapshot: s, motion, timestamp,
      freshSample: true, stage: 'READY', stableOpen: true, stablePinch: false, stablePoint: false, threshold: kind === 'PUSH' ? .42 : .12 });
    for (let i = 0; i < 5; i++) tick(1000 + i * 1000 / 15);
    assert.equal(gate.state, 'ARMED'); tick(1400); assert.equal(gate.state, 'ARMED');
    const motion = { ...detector.update(s, 1466.6667), action: kind === 'PUSH' ? 'PUSH' : 'SWIPE_RIGHT',
      pushEvidence: kind === 'PUSH' ? .6 : .15, pullEvidence: .14, scaleRate: kind === 'PUSH' ? .3 : 0,
      swipe: { action: kind === 'SWIPE' ? 'SWIPE_RIGHT' : null, failure: 'NONE', consistency: 1,
        horizontal: .2, horizontalRatio: 1, verticalTravel: 0 } };
    tick(1466.6667, motion); assert.equal(gate.state, 'CANDIDATE');
    const output = tick(1600, { ...motion, timestamp: 1600 });
    assert.equal(gate.castGate, true); assert.equal(output.action, motion.action);
  });
}
test('E: PUSH continuity still resets beyond 250ms and neutral still needs 120ms', () => {
  const gate = new ReadyMotionCastController('PUSH'), s = recognize(openHand(1));
  const detector = new GestureMotionDetector({ values: DEFAULT_GESTURE_TUNING });
  const tick = timestamp => gate.update({ snapshot: s, motion: detector.update(s, timestamp), timestamp,
    freshSample: true, stage: 'READY', stableOpen: true, stablePinch: false, stablePoint: false, threshold: .42 });
  tick(1000); tick(1066); assert.equal(gate.neutral, false);
  tick(1133); assert.equal(gate.state, 'ARMED');
  tick(1383); assert.equal(gate.state, 'ARMED');
  tick(1634); assert.equal(gate.state, 'WAIT_READY_NEUTRAL');
});

test('E: XUN swipe survives one dropped 15fps sample but not a long gap', () => {
  const swipeAt = (times) => {
    const detector = new HandSwipeDetector();
    const history = [];
    const states = times.map((t) => {
      history.push({ timestamp: t, position: { x: t * .0007, y: 0, z: 0 }, openPalm: true, pinch: false });
      return detector.update(history, DEFAULT_GESTURE_TUNING.swipeThreshold);
    });
    return { action: states.find((state) => state.action)?.action ?? null, last: states.at(-1) };
  };
  // Too short before the dropped sample; the stroke completes only across the 133ms gap.
  assert.equal(swipeAt([0, 67, 133]).action, null);
  assert.equal(swipeAt([0, 67, 133, 267]).action, 'SWIPE_RIGHT');
  assert.equal(swipeAt([0, 67, 133, 400]).last.failure, 'HAND_LOST');
});
