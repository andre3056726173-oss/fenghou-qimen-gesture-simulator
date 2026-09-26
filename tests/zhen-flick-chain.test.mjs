import test from 'node:test';
import assert from 'node:assert/strict';
import { GestureRecognizer } from '../src/gestureRecognition/GestureRecognizer.ts';
import { GestureMotionDetector } from '../src/gestureRecognition/GestureMotionDetector.ts';
import { ZhenFlickController } from '../src/gestureRecognition/ZhenFlickController.ts';
import { DEFAULT_GESTURE_TUNING } from '../src/gestureRecognition/GestureTuning.ts';
import { GesturePriorityResolver } from '../src/gestureRecognition/GesturePriorityResolver.ts';
import { GestureStateMachine } from '../src/gestureRecognition/GestureStateMachine.ts';
import { SpellCastController } from '../src/spells/SpellCastController.ts';
import { SPELL_DEFINITIONS } from '../src/spells/SpellDefinition.ts';
import { readRuntimeMode } from '../src/app/runtimeMode.ts';

const zhen = SPELL_DEFINITIONS.find(s => s.id === 'ZHEN_LIGHTNING');
const tuning = { values: { ...DEFAULT_GESTURE_TUNING } };
const empty = () => new GestureRecognizer().update({ hands: [], timestamp: 1, fps: 0 });
function snapshot(gap = .1, x = .5, scale = .12) {
  const points = Array.from({ length: 21 }, () => ({ x, y: .5, z: 0 }));
  points[4] = { x: x - gap * scale / 2, y: .4, z: 0 };
  points[8] = { x: x + gap * scale / 2, y: .4, z: 0 };
  return { ...empty(), handCount: 1, landmarks: [points], palmCenter: { x, y: .5, z: 0 }, handScale: scale,
    normalizedPinchDistance: gap, pinchActive: gap < .25, openPalm: gap >= .25, palmFacingCamera: true,
    name: gap < .25 ? 'PINCH' : 'OPEN_PALM' };
}
const context = (s, motion) => ({ selectedSector: 6, lockedSector: 6, earthPlateAngle: 0, humanPlateAngle: 0,
  heavenPlateAngle: 0, spiritPlateAngle: 0, dominantHand: 'Right', currentGesture: s.name,
  handSnapshot: s, handVelocity: motion.velocity, handDepthVelocity: motion.depthVelocity,
  formationScale: 1, formationState: 'ACTIVE', castStage: 'READY', action: motion.action,
  castIntensity: motion.intensity, castDirection: motion.direction, chargeScale: 1 });
function harness(ready = true) {
  const gate = new ZhenFlickController(), detector = new GestureMotionDetector(tuning), spell = new SpellCastController();
  let now = 1000, casts = 0;
  if (ready) spell.forceReady(6, zhen, now); else spell.lockSector(6, zhen, now);
  const step = (gap, options = {}) => {
    now += options.dt ?? 33;
    const s = options.snapshot ?? snapshot(gap, options.x ?? .5, options.scale ?? .12);
    const raw = detector.update(s, now);
    if (options.rawAction) raw.action = options.rawAction;
    const output = gate.update({ snapshot: s, motion: raw, sampleTimestamp: now,
      freshSample: options.fresh !== false, lockedSector: spell.lockedSector, activeSpell: spell.activeSpell?.id ?? null,
      spellStage: spell.stage, formationActive: true, flickThreshold: tuning.values.flickThreshold, holdMs: tuning.values.holdMs });
    const status = { ...gate.status };
    const events = spell.update(context(s, output), now);
    const accepted = events.some(e => e.type === 'cast');
    if (accepted) casts++;
    if (gate.status.castGate) gate.acknowledgeCast(accepted);
    return { raw, output, status, events, s };
  };
  const neutral = () => { for (let i = 0; i < 5; i++) step(.5); };
  const arm = () => { neutral(); const enter = step(.1); assert.equal(enter.status.stage, 'FLICK_ARMED'); for (let i = 0; i < 9; i++) step(.1); };
  return { gate, spell, detector, step, neutral, arm, get now() { return now; }, get casts() { return casts; } };
}

test('POINT ZHEN + PINCH is exclusively LOCK, and consumed cycle cannot rotate or cast', () => {
  const h = harness();
  const machine = new GestureStateMachine(), priority = new GesturePriorityResolver();
  machine.state = 'POINTING';
  const s = snapshot(.1), raw = h.detector.update(s, 1000);
  assert.equal(priority.resolve({ fist: false, spellStage: 'NONE', motion: raw, locking: true,
    spellArming: false, rotating: false, pointing: true, spaceGesture: true }), 'LOCK');
  const input = { raw: s, pinch: true, fist: false, openPalm: false, pointing: false, twoHandsOpen: false, twoHandsPinch: false };
  assert.deepEqual(machine.update(input, 'ACTIVE', 1000, 1, { manipulation: true, space: true, suppressFistCollapse: false, lockSector: true }).map(e => e.type), ['LOCK']);
  h.step(.1); h.gate.consumeLock(6);
  const owned = h.gate.ownsPinch(6, 'ZHEN_LIGHTNING', 'READY');
  assert.equal(owned, true);
  assert.equal(priority.resolve({ fist: false, spellStage: 'READY', motion: { ...raw, action: null }, locking: false,
    spellArming: owned, rotating: true, pointing: false, spaceGesture: true }), 'SPELL_ARM');
  assert.deepEqual(machine.update(input, 'ACTIVE', 1033, 1, { manipulation: false, space: false, suppressFistCollapse: false }).map(e => e.type), []);
  assert.equal(machine.state, 'ACTIVE');
  assert.equal(h.casts, 0);
});

test('first fast lock-pinch release is consumed even when raw motion reports FLICK', () => {
  const h = harness(); h.step(.1); h.gate.consumeLock(6);
  for (let i = 0; i < 10; i++) h.step(.1);
  assert.equal(h.step(.6, { rawAction: 'FLICK' }).output.action, null);
  h.step(.65); h.neutral();
  assert.equal(h.casts, 0); assert.equal(h.gate.status.stage, 'READY_FOR_CAST_PINCH');
});

test('READY without a new pinch cannot cast from rapid finger movement or raw FLICK', () => {
  const h = harness(); h.neutral();
  for (let i = 0; i < 5; i++) h.step(i % 2 ? .8 : .4, { rawAction: 'FLICK' });
  assert.equal(h.casts, 0);
});

test('new cast pinch followed by slow release cannot cast lightning', () => {
  const h = harness(); h.arm();
  for (let i = 1; i <= 24; i++) h.step(.1 + i * .01);
  assert.equal(h.casts, 0);
  assert.equal(h.gate.status.failure === 'NO_NEW_PINCH' || h.gate.status.failure === 'WAITING_RELEASE_AFTER_LOCK', true);
});

test('READY + new held pinch + fast release confirms then casts ZHEN_LIGHTNING', () => {
  const h = harness(); h.arm();
  const release = h.step(.55);
  assert.equal(release.status.stage, 'RELEASE_CANDIDATE'); assert.equal(h.casts, 0);
  assert.ok(release.status.indexTipVelocity > 0); assert.ok(release.status.separationVelocity > 1.1);
  const confirmed = h.step(.6);
  assert.equal(confirmed.status.stage, 'FLICK_CONFIRMED'); assert.equal(confirmed.status.castGate, true);
  assert.equal(confirmed.events.find(e => e.type === 'cast').spell.id, 'ZHEN_LIGHTNING');
  assert.equal(h.casts, 1); assert.equal(h.spell.stage, 'CASTING');
});

test('plate rotation pinch already held on READY entry cannot arm or cast on release', () => {
  const h = harness(false); h.step(.1); h.gate.consumeRotation();
  for (let i = 0; i < 40; i++) h.step(.1);
  assert.equal(h.spell.stage, 'READY'); assert.notEqual(h.gate.status.stage, 'FLICK_ARMED');
  h.step(.6, { rawAction: 'FLICK' }); h.step(.65);
  assert.equal(h.casts, 0);
});

test('hand loss while armed and reacquisition while open never generates release or FLICK', () => {
  const h = harness(); h.arm();
  const lost = h.step(.6, { snapshot: empty() });
  assert.equal(lost.status.failure, 'HAND_LOST'); assert.equal(lost.status.pinchRelease, false);
  assert.equal(h.step(.7).status.pinchRelease, false); assert.equal(h.casts, 0);
});

test('stale RAF samples cannot advance derivatives, edges or a release candidate', () => {
  const h = harness(); h.arm();
  h.step(.6); const prior = h.gate.status.separationVelocity;
  const stale = h.step(.65, { fresh: false });
  assert.equal(stale.status.failure, 'STALE_SAMPLE'); assert.equal(stale.status.pinchRelease, false);
  assert.equal(stale.status.separationVelocity, prior); assert.equal(h.casts, 0);
  h.step(.65, { dt: 150 }); assert.equal(h.casts, 0);
});

test('one fast release has exactly one CAST event despite repeated release history', () => {
  const h = harness(); h.arm(); h.step(.6); h.step(.65);
  for (let i = 0; i < 80; i++) h.step(.65, { rawAction: 'FLICK' });
  assert.equal(h.casts, 1);
});

test('ZHEN lock persists through prepare, lock release, READY and second cast pinch', () => {
  const h = harness(false); h.step(.1); h.gate.consumeLock(6);
  for (let i = 0; i < 12; i++) { h.step(.1); assert.equal(h.spell.lockedSector, 6); }
  for (let i = 0; i < 30; i++) { h.step(.5); assert.equal(h.spell.lockedSector, 6); }
  assert.equal(h.spell.stage, 'READY');
  h.arm(); h.step(.6); h.step(.65);
  assert.equal(h.spell.lockedSector, 6); assert.equal(h.casts, 1);
});

test('release before READY cannot inherit a buffered FLICK across the READY boundary', () => {
  const h = harness(false); h.step(.1); h.gate.consumeLock(6);
  for (let i = 0; i < 9; i++) h.step(.1);
  h.step(.6, { rawAction: 'FLICK' });
  for (let i = 0; i < 30; i++) h.step(.6, { rawAction: 'FLICK' });
  assert.equal(h.spell.stage, 'READY'); assert.equal(h.casts, 0);
});

test('whole-hand translation and palm-size changes are not fingertip separation', () => {
  const h = harness(); h.arm();
  const s = snapshot(.6, .7); s.landmarks[0] = snapshot(.1, .7).landmarks[0];
  const release = h.step(.6, { snapshot: s });
  assert.equal(release.status.failure, 'TIP_SPEED_TOO_LOW'); assert.equal(h.casts, 0);
  const scale = harness(); scale.arm();
  const r = scale.step(.1, { scale: .18, x: .6 });
  assert.equal(r.status.pinchRelease, false); assert.equal(scale.casts, 0);
});

test('invalid landmarks, sparse camera samples and too-short holds disarm safely', () => {
  const h = harness(); h.arm();
  const invalid = snapshot(.6); invalid.landmarks[0][8].x = NaN;
  assert.equal(h.step(.6, { snapshot: invalid }).status.failure, 'HAND_LOST'); assert.equal(h.casts, 0);
  const sparse = harness(); sparse.arm();
  assert.equal(sparse.step(.6, { dt: 200 }).status.pinchRelease, false); assert.equal(sparse.casts, 0);
  const short = harness(); short.neutral(); short.step(.1); short.step(.6); short.step(.65);
  assert.equal(short.casts, 0);
});

test('qa=zhen enables real QA, not demo; FLICK default threshold remains 1.1', () => {
  const mode = readRuntimeMode({ search: '?qa=zhen', pathname: '/' });
  assert.equal(mode.zhenQa, true); assert.equal(mode.realQa, true);
  assert.equal(mode.presentationDemo, false); assert.equal(mode.formationDemo, false);
  assert.equal(DEFAULT_GESTURE_TUNING.flickThreshold, 1.1);
});

test('READY arm admission does not suppress pointing; POINT + PINCH still re-locks the same sector', () => {
  const gate = new ZhenFlickController();
  const base = { lockedSector: 6, activeSpell: 'ZHEN_LIGHTNING', stage: 'READY', focusedSector: 6,
    lockingCandidate: false, pointingState: true, pinchActive: false, stablePinch: false };
  assert.deepEqual(gate.interactionPriority(base), { locking: false, spellArming: false });
  const locking = gate.interactionPriority({ ...base, lockingCandidate: true, pinchActive: true, stablePinch: true });
  assert.equal(locking.locking, true);
  const priority = new GesturePriorityResolver();
  assert.equal(priority.resolve({ ...locking, fist: false, spellStage: 'READY', motion: { action: null }, rotating: false, pointing: true, spaceGesture: true }), 'LOCK');
  gate.consumeLock(6);
  assert.deepEqual(gate.interactionPriority({ ...base, lockingCandidate: true, pointingState: false, pinchActive: true, stablePinch: true }),
    { locking: false, spellArming: true });
  assert.deepEqual(gate.interactionPriority({ ...base, activeSpell: 'KUN_EARTH', lockedSector: 1, lockingCandidate: true, pinchActive: true }),
    { locking: true, spellArming: false });
});
