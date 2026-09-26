import test from 'node:test';
import assert from 'node:assert/strict';
import { GestureRecognizer } from '../src/gestureRecognition/GestureRecognizer.ts';
import { GestureMotionDetector } from '../src/gestureRecognition/GestureMotionDetector.ts';
import { KanPullController } from '../src/gestureRecognition/KanPullController.ts';
import { DEFAULT_GESTURE_TUNING } from '../src/gestureRecognition/GestureTuning.ts';
import { GestureStateMachine } from '../src/gestureRecognition/GestureStateMachine.ts';
import { GesturePriorityResolver } from '../src/gestureRecognition/GesturePriorityResolver.ts';
import { SpellCastController } from '../src/spells/SpellCastController.ts';
import { SPELL_DEFINITIONS } from '../src/spells/SpellDefinition.ts';
import { readRuntimeMode } from '../src/app/runtimeMode.ts';
import { GestureDebugRecorder } from '../src/gestureRecognition/GestureDebugRecorder.ts';

const tuning = { values: { ...DEFAULT_GESTURE_TUNING } };
const kan = SPELL_DEFINITIONS.find(s => s.id === 'KAN_WATER');
const empty = () => new GestureRecognizer().update({ hands: [], timestamp: 0, fps: 0 });
function hand({ x = .5, y = .5, z = -.04, scale = .16, pinch = false, point = false, angle = -Math.PI / 2, aspect = 1.2 } = {}) {
  const points = Array.from({ length: 21 }, () => ({ x, y, z }));
  points[0] = { x, y: y + scale / 2, z: 0 };
  points[9] = { x, y: y - scale / 2, z };
  points[5] = { x: x - scale * aspect / 2, y, z };
  points[17] = { x: x + scale * aspect / 2, y, z };
  return { ...empty(), name: pinch ? 'PINCH' : point ? 'POINTING' : 'OPEN_PALM', handCount: 1,
    landmarks: [points], palmCenter: { x, y, z }, handScale: scale, normalizedPinchDistance: pinch ? .1 : .6,
    pinchActive: pinch, pointing: point, openPalm: !pinch && !point, openPalmScore: pinch || point ? 0 : 1,
    palmFacingCamera: true, palmAngle: angle };
}
const context = (s, motion) => ({ selectedSector: 4, lockedSector: 4, earthPlateAngle: 0, humanPlateAngle: 0,
  heavenPlateAngle: 0, spiritPlateAngle: 0, dominantHand: 'Right', currentGesture: s.name,
  handSnapshot: s, handVelocity: motion.velocity, handDepthVelocity: motion.depthVelocity,
  formationScale: 1, formationState: 'ACTIVE', castStage: 'READY', action: motion.action,
  castIntensity: motion.intensity, castDirection: motion.direction, chargeScale: 1 });
function harness(ready = true) {
  const gate = new KanPullController(), detector = new GestureMotionDetector(tuning), spell = new SpellCastController();
  let now = 1000, casts = 0;
  let pose = { x: .5, y: .5, z: -.04, scale: .16, pinch: false, point: false };
  if (ready) spell.forceReady(4, kan, now); else spell.lockSector(4, kan, now);
  const step = (patch = {}, options = {}) => {
    now += options.dt ?? 33; pose = { ...pose, ...patch };
    const s = options.snapshot ?? hand(pose);
    const raw = detector.update(s, now);
    const input = { snapshot: s, motion: raw, timestamp: options.timestamp ?? now, freshSample: options.fresh !== false,
      stableOpenPalm: s.openPalm, stablePinch: s.pinchActive, stablePoint: s.pointing,
      rotating: options.rotating ?? false, spaceManipulation: options.space ?? false,
      lockedSector: spell.lockedSector, activeSpell: spell.activeSpell?.id ?? null, spellStage: spell.stage,
      formationActive: true, pullThreshold: tuning.values.pullThreshold };
    const output = gate.update(input), status = { ...gate.status };
    const events = spell.update(context(s, output), now);
    const accepted = events.some(e => e.type === 'cast');
    if (accepted) casts++;
    if (gate.status.castGate) gate.acknowledgeCast(accepted);
    return { s, raw, input, output, status, events };
  };
  const neutral = () => { for (let i = 0; i < 8; i++) step(); };
  const pull = () => step({ z: pose.z + .006, scale: pose.scale - .0033 });
  return { gate, detector, spell, step, neutral, pull, get now() { return now; }, get pose() { return pose; }, get casts() { return casts; } };
}

test('POINT KAN + PINCH only locks; subsequent natural return before READY cannot cast', () => {
  const machine = new GestureStateMachine(), priority = new GesturePriorityResolver(), h = harness(false);
  machine.state = 'POINTING';
  const s = hand({ pinch: true });
  const stabilized = { raw: s, openPalm: false, fist: false, pinch: true, pointing: false, twoHandsOpen: false, twoHandsPinch: false };
  assert.equal(priority.resolve({ fist: false, spellStage: 'NONE', motion: { action: null }, locking: true, rotating: false, pointing: true, spaceGesture: false }), 'LOCK');
  assert.deepEqual(machine.update(stabilized, 'ACTIVE', 1000, 1, { manipulation: true, space: true, suppressFistCollapse: false, lockSector: true }).map(e => e.type), ['LOCK']);
  h.step({ pinch: true }); h.gate.consumeLock(4);
  h.step({ pinch: false }); h.pull(); h.pull();
  assert.equal(h.casts, 0); assert.equal(h.gate.status.lockCycleConsumed, true);
});

test('PULL during PREPARING/CHARGING is consumed, never deferred into READY', () => {
  const h = harness(false); h.gate.consumeLock(4);
  for (let i = 0; i < 24; i++) h.pull();
  assert.equal(h.spell.stage, 'READY'); assert.equal(h.casts, 0);
  assert.equal(h.gate.status.readyNeutral, false);
});

test('READY boundary during an ongoing pull requires a new post-READY neutral', () => {
  const h = harness(false);
  for (let i = 0; i < 25; i++) h.pull();
  assert.equal(h.casts, 0); assert.equal(h.gate.status.failure, 'WAIT_READY_NEUTRAL');
  h.neutral(); assert.equal(h.gate.status.kanPullState, 'READY_FOR_PULL');
  h.pull(); h.pull(); assert.equal(h.casts, 1);
});

test('READY -> real 120ms open neutral -> new pull -> next fresh sample confirms KAN cast', () => {
  const h = harness(); h.neutral();
  assert.equal(h.gate.status.kanPullState, 'READY_FOR_PULL');
  const candidate = h.pull(); assert.equal(candidate.status.kanPullState, 'PULL_CANDIDATE');
  assert.equal(candidate.status.newPullEdge, true); assert.equal(h.casts, 0);
  const confirmed = h.pull();
  assert.equal(confirmed.status.kanPullState, 'PULL_CONFIRMED'); assert.equal(confirmed.status.castGate, true);
  assert.equal(confirmed.events.find(e => e.type === 'cast').spell.id, 'KAN_WATER');
  assert.equal(h.casts, 1);
});

test('horizontal open-palm translation cannot cast even with shrinking palm/depth evidence', () => {
  const h = harness(); h.neutral();
  h.step({ x: .55, z: -.034, scale: .1567 }); h.step({ x: .6, z: -.028, scale: .1534 });
  assert.equal(h.casts, 0); assert.equal(h.gate.status.readyNeutral, false);
});

test('vertical open-palm translation cannot cast water', () => {
  const h = harness(); h.neutral();
  for (let i = 0; i < 10; i++) h.step({ y: .5 + i * .02 });
  assert.equal(h.casts, 0);
});

test('single-frame Z spike cannot cast without sustained palm shrink', () => {
  const h = harness(); h.neutral();
  const spike = h.step({ z: .08 }); assert.ok(spike.raw.pullEvidence > .42);
  h.step({ z: -.04 }); assert.equal(h.casts, 0);
});

test('single-frame scale anomaly cannot pass next-frame confirmation', () => {
  const h = harness(); h.neutral();
  h.step({ scale: .10 }); h.step({ scale: .16 });
  assert.equal(h.casts, 0); assert.equal(h.gate.status.readyNeutral, false);
});

test('hand loss clears association; reappearing with a position/scale jump requires new neutral', () => {
  const h = harness(); h.neutral(); h.pull();
  assert.equal(h.step({}, { snapshot: empty() }).status.failure, 'HAND_LOST');
  h.step({ z: .05, scale: .10 }); h.pull();
  assert.equal(h.casts, 0); h.neutral(); h.pull(); h.pull(); assert.equal(h.casts, 1);
});

test('stale RAF and identical sample timestamp cannot advance pull candidate or confirm', () => {
  const h = harness(); h.neutral(); const candidate = h.pull();
  for (let i = 0; i < 4; i++) {
    const result = h.gate.update({ ...candidate.input, freshSample: false });
    assert.equal(result.action, null); assert.equal(h.gate.status.failure, 'STALE_SAMPLE');
    assert.equal(h.gate.status.kanPullState, 'PULL_CANDIDATE');
  }
  assert.equal(h.gate.update({ ...candidate.input, freshSample: true }).action, null);
  assert.equal(h.casts, 0); h.pull(); assert.equal(h.casts, 1);
});

test('one pull and persistent above-threshold evidence produces only one cast', () => {
  const h = harness(); h.neutral(); h.pull(); h.pull();
  for (let i = 0; i < 30; i++) h.pull();
  assert.equal(h.casts, 1);
});

test('KAN locked sector persists through lock release, READY, neutral and casting', () => {
  const h = harness(false); h.step({ pinch: true }); h.gate.consumeLock(4);
  h.step({ pinch: false });
  for (let i = 0; i < 35; i++) { h.step(); assert.equal(h.spell.lockedSector, 4); }
  h.pull(); h.pull(); assert.equal(h.casts, 1); assert.equal(h.spell.lockedSector, 4);
});

test('POINT another sector disarms PULL without preventing ordinary PINCH LOCK', () => {
  const h = harness(); h.neutral(); h.step({ point: true });
  assert.equal(h.gate.status.failure, 'NOT_OPEN_PALM');
  const machine = new GestureStateMachine(); machine.state = 'POINTING';
  const s = hand({ pinch: true });
  assert.deepEqual(machine.update({ raw: s, pinch: true, fist: false, pointing: false, twoHandsOpen: false, twoHandsPinch: false },
    'ACTIVE', 2000, 0, { manipulation: true, space: false, suppressFistCollapse: false, lockSector: true }).map(e => e.type), ['LOCK']);
  h.spell.lockSector(1, SPELL_DEFINITIONS.find(s => s.id === 'KUN_EARTH'), h.now);
  h.gate.consumeLock(1); assert.equal(h.gate.status.kanPullState, 'IDLE');
});

test('default pull threshold/weights and other spell thresholds remain unchanged', () => {
  const d = DEFAULT_GESTURE_TUNING;
  assert.deepEqual([d.pullThreshold, d.pullZWeight, d.pullScaleWeight, d.pullFacingWeight], [.42, .56, .30, .14]);
  assert.deepEqual([d.pushThreshold, d.swipeThreshold, d.flickThreshold], [.42, .12, 1.1]);
});

test('coordinate sign and unchanged evidence decomposition: positive Z/shrink is pull, negative Z/growth is push', () => {
  const detector = new GestureMotionDetector(tuning);
  detector.update(hand(), 1000);
  const pull = detector.update(hand({ z: -.02, scale: .15 }), 1100);
  assert.ok(Math.abs(pull.depthVelocity - .2) < 1e-9); assert.ok(pull.scaleRate < 0);
  assert.equal(pull.action, 'PULL');
  assert.ok(Math.abs(pull.pullZEvidence - .2 / .3 * .56) < 1e-9);
  assert.ok(Math.abs(pull.pullScaleEvidence - .1 / .22 * .30) < 1e-9);
  assert.equal(pull.pullFacingEvidence, .14);
  assert.equal(pull.pullEvidence, pull.pullZEvidence + pull.pullScaleEvidence + pull.pullFacingEvidence);
  assert.equal(detector.update(hand({ z: -.04, scale: .16 }), 1200).action, 'PUSH');
});

test('facing-only noise, slow rotation and changing palm aspect cannot cast', () => {
  const quiet = harness(); quiet.neutral();
  for (let i = 0; i < 10; i++) quiet.step({ z: -.04 + (i % 2 ? .0001 : 0) });
  assert.equal(quiet.casts, 0);
  const rotated = harness(); rotated.neutral(); rotated.step({ angle: -.8 }); rotated.pull();
  assert.equal(rotated.casts, 0);
  const aspect = harness(); aspect.neutral(); aspect.step({ aspect: .9 }); aspect.pull();
  assert.equal(aspect.casts, 0);
});

test('scale-led sustained pull can be admitted when wrist-relative Z remains unchanged', () => {
  const h = harness(); h.neutral();
  h.step({ scale: .1525 }); h.step({ scale: .145 });
  assert.equal(h.casts, 1);
});

test('PINCH, ROTATE, and double-hand space interaction cannot become a PULL', () => {
  for (const options of [{ rotating: true }, { space: true }]) {
    const h = harness(); h.neutral();
    h.step({ z: -.02, scale: .15 }, options); h.pull(); assert.equal(h.casts, 0);
  }
  const h = harness(); h.neutral(); h.step({ pinch: true, z: -.02, scale: .15 }); h.pull(); assert.equal(h.casts, 0);
});

test('neutral and confirmation require distinct camera samples, and failed confirmation requires rearming', () => {
  const h = harness(); const first = h.step();
  h.gate.update({ ...first.input, timestamp: first.input.timestamp + 500, freshSample: false });
  assert.equal(h.gate.status.readyNeutral, false);
  h.neutral(); h.pull(); const stopped = h.step();
  assert.equal(stopped.status.failure, 'PULL_DIRECTION_INVALID'); assert.equal(h.casts, 0);
  h.pull(); h.pull(); assert.equal(h.casts, 0);
  h.neutral(); h.pull(); h.pull(); assert.equal(h.casts, 1);
});

test('qa=kan preserves qa=kun and recording contains copied KAN numeric evidence only', () => {
  const mode = readRuntimeMode({ search: '?qa=kan', pathname: '/' });
  assert.equal(mode.kanQa, true); assert.equal(mode.realQa, true); assert.equal(mode.presentationDemo, false);
  assert.equal(readRuntimeMode({ search: '?qa=kun', pathname: '/' }).kunQa, true);
  const h = harness(); h.neutral(); const sample = h.pull();
  const recorder = new GestureDebugRecorder(); recorder.toggle(h.now);
  recorder.record(sample.s, sample.output, h.spell.stage, 4, h.now, sample.status);
  const record = recorder.entries[0];
  assert.equal(record.kanPull.kanPullState, 'PULL_CANDIDATE'); assert.ok(record.kanPull.scaleRate < 0);
  assert.equal(record.kanPull.castGate, false); assert.equal('video' in record, false);
  sample.status.failure = 'CAST_REJECTED'; assert.notEqual(record.kanPull.failure, 'CAST_REJECTED');
});
