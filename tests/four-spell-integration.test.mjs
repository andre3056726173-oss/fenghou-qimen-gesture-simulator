import test from 'node:test';
import assert from 'node:assert/strict';
import { GestureRecognizer } from '../src/gestureRecognition/GestureRecognizer.ts';
import { GestureMotionDetector } from '../src/gestureRecognition/GestureMotionDetector.ts';
import { RealSpellCastGate } from '../src/gestureRecognition/RealSpellCastGate.ts';
import { DEFAULT_GESTURE_TUNING } from '../src/gestureRecognition/GestureTuning.ts';
import { SpellCastController } from '../src/spells/SpellCastController.ts';
import { SPELL_DEFINITIONS } from '../src/spells/SpellDefinition.ts';
import { GesturePriorityResolver } from '../src/gestureRecognition/GesturePriorityResolver.ts';
import { GestureStateMachine } from '../src/gestureRecognition/GestureStateMachine.ts';
import { readRuntimeMode } from '../src/app/runtimeMode.ts';

const empty = () => new GestureRecognizer().update({ hands: [], timestamp: 0, fps: 0 });
const sectors = { KUN_EARTH: 1, XUN_WIND: 7, ZHEN_LIGHTNING: 6, KAN_WATER: 4 };
function hand(p) {
  const { x, y, z, scale, gap } = p;
  const points = Array.from({ length: 21 }, () => ({ x, y, z }));
  points[0] = { x, y: y + scale / 2, z: 0 };
  points[9] = { x, y: y - scale / 2, z };
  points[5] = { x: x - scale * .6, y, z }; points[17] = { x: x + scale * .6, y, z };
  points[4] = { x: x - gap * scale / 2, y: y - scale, z };
  points[8] = { x: x + gap * scale / 2, y: y - scale, z };
  return { ...empty(), name: gap < .25 ? 'PINCH' : 'OPEN_PALM', handCount: 1, landmarks: [points],
    palmCenter: { x, y, z }, handScale: scale, normalizedPinchDistance: gap, pinchActive: gap < .25,
    openPalm: gap >= .25, openPalmScore: gap >= .25 ? 1 : 0, palmFacingCamera: true, palmAngle: -Math.PI / 2 };
}
function harness(id, ready = true) {
  const gate = new RealSpellCastGate(), detector = new GestureMotionDetector({ values: DEFAULT_GESTURE_TUNING });
  const lifecycle = new SpellCastController(), definition = SPELL_DEFINITIONS.find(s => s.id === id);
  const sector = sectors[id]; let now = 1000, casts = [];
  let pose = { x: .5, y: .5, z: -.04, scale: .16, gap: .6 };
  if (ready) lifecycle.forceReady(sector, definition, now); else lifecycle.lockSector(sector, definition, now);
  function step(patch = {}, options = {}) {
    now += options.dt ?? 33; pose = { ...pose, ...patch };
    const snapshot = options.lost ? empty() : hand(pose);
    if (options.point) { snapshot.pointing = true; snapshot.openPalm = false; }
    if (options.twoHands) { snapshot.twoHandsPinch = true; snapshot.handCount = 2; }
    const raw = options.motion ?? detector.update(snapshot, now);
    const output = gate.update({ snapshot, motion: raw, timestamp: options.timestamp ?? now,
      freshSample: options.fresh !== false, sector: lifecycle.lockedSector, spell: lifecycle.activeSpell?.id ?? null,
      stage: lifecycle.stage, formationActive: options.active !== false, stableOpen: snapshot.openPalm,
      stablePinch: snapshot.pinchActive, stablePoint: snapshot.pointing, rotating: options.rotating ?? false,
      space: options.twoHands ?? false, tuning: DEFAULT_GESTURE_TUNING });
    const state = { phase: gate.phase, failure: gate.failure, castGate: gate.castGate };
    const context = { selectedSector: sector, lockedSector: lifecycle.lockedSector, earthPlateAngle: 0, humanPlateAngle: 0,
      heavenPlateAngle: 0, spiritPlateAngle: 0, dominantHand: 'Right', currentGesture: snapshot.name,
      handSnapshot: snapshot, handVelocity: output.velocity, handDepthVelocity: output.depthVelocity,
      formationScale: 1, formationState: options.active === false ? 'IDLE' : 'ACTIVE', castStage: lifecycle.stage,
      action: output.action, castIntensity: output.intensity, castDirection: output.direction, chargeScale: 1 };
    const events = lifecycle.update(context, now), accepted = events.some(e => e.type === 'cast');
    casts.push(...events.filter(e => e.type === 'cast'));
    if (gate.castGate) gate.acknowledge(accepted);
    return { raw, output, state, events, snapshot };
  }
  const neutral = () => { for (let i = 0; i < 12; i++) step({ gap: .6 }); };
  const push = () => step({ z: pose.z - .006, scale: pose.scale + .0033 });
  const pull = () => step({ z: pose.z + .006, scale: pose.scale - .0033 });
  const swipe = (sign = 1) => { for (let i = 0; i < 9; i++) step({ x: pose.x - sign * .035 }); };
  const flick = () => { for (let i = 0; i < 11; i++) step({ gap: .1 }); step({ gap: .55 }); return step({ gap: .6 }); };
  return { gate, lifecycle, step, neutral, push, pull, swipe, flick, get casts() { return casts; }, get now() { return now; }, get pose() { return pose; } };
}

for (const id of Object.keys(sectors)) {
  test(id + ': only its new post-READY action casts, once through the real lifecycle', () => {
    const h = harness(id); h.neutral();
    if (id === 'KUN_EARTH') { h.push(); h.push(); }
    if (id === 'KAN_WATER') { h.pull(); h.pull(); }
    if (id === 'XUN_WIND') h.swipe();
    if (id === 'ZHEN_LIGHTNING') h.flick();
    assert.equal(h.casts.length, 1); assert.equal(h.casts[0].spell.id, id);
    assert.equal(h.lifecycle.stage, 'CASTING');
    for (let i = 0; i < 8; i++) h.step();
    assert.equal(h.casts.length, 1);
    assert.equal(h.lifecycle.lockedSector, sectors[id]);
  });
  test(id + ': motion that began before READY cannot leak through the old intent window', () => {
    const h = harness(id, false);
    h.gate.consumeLock(sectors[id], id);
    for (let i = 0; i < 30; i++) {
      if (id === 'KUN_EARTH') h.push();
      if (id === 'KAN_WATER') h.pull();
      if (id === 'XUN_WIND') h.step({ x: h.pose.x - .01 });
      if (id === 'ZHEN_LIGHTNING') h.step({ gap: i < 24 ? .1 : .6 });
    }
    assert.equal(h.lifecycle.stage, 'READY'); assert.equal(h.casts.length, 0);
  });
  test(id + ': loss/reacquire and stale samples cannot cast without rearming', () => {
    const h = harness(id); h.neutral(); h.step({}, { lost: true });
    const a = h.step({ z: .05, scale: .1, gap: .6 });
    for (let i = 0; i < 5; i++) {
      const out = h.step({}, { motion: a.raw, timestamp: a.raw.timestamp, fresh: false });
      assert.ok(out.output.action === null || out.output.action === 'HOLD');
    }
    assert.equal(h.casts.length, 0);
  });
}
test('KUN READY + PULL never casts earth', () => {
  const h = harness('KUN_EARTH'); h.neutral(); for (let i = 0; i < 6; i++) h.pull(); assert.equal(h.casts.length, 0);
});
test('KAN READY + PUSH never casts water', () => {
  const h = harness('KAN_WATER'); h.neutral(); for (let i = 0; i < 6; i++) h.push(); assert.equal(h.casts.length, 0);
});
test('XUN READY + FLICK never casts wind', () => {
  const h = harness('XUN_WIND'); h.neutral(); h.flick(); assert.equal(h.casts.length, 0);
});
test('ZHEN READY + ordinary lock release never casts lightning', () => {
  const h = harness('ZHEN_LIGHTNING'); h.step({ gap: .1 }); h.gate.consumeLock(6, 'ZHEN_LIGHTNING');
  for (let i = 0; i < 11; i++) h.step({ gap: .1 });
  h.step({ gap: .6 }); h.neutral(); assert.equal(h.casts.length, 0);
});
test('ZHEN READY + open-palm SWIPE is not FLICK', () => {
  const h = harness('ZHEN_LIGHTNING'); h.neutral(); h.swipe(); assert.equal(h.casts.length, 0);
});
for (const sign of [-1, 1]) test('XUN accepted mirrored screen direction ' + sign + ' is never flipped twice', () => {
  const h = harness('XUN_WIND'); h.neutral(); h.swipe(sign);
  assert.equal(h.casts.length, 1); assert.equal(h.casts[0].context.castDirection.x, sign);
});
test('stale and identical timestamp cannot confirm a PUSH candidate', () => {
  const h = harness('KUN_EARTH'); h.neutral(); const first = h.push();
  assert.equal(first.state.phase, 'CANDIDATE');
  for (const fresh of [false, true]) h.step({}, { motion: first.raw, timestamp: first.raw.timestamp, fresh, dt: 0 });
  assert.equal(h.casts.length, 0);
  h.push(); assert.equal(h.casts.length, 1);
});
test('one-frame PUSH spike followed by opposite evidence is rejected', () => {
  const h = harness('KUN_EARTH'); h.neutral(); h.push(); h.pull(); assert.equal(h.casts.length, 0);
});
test('switching spells during a candidate clears the old action and preserves new sector lock', () => {
  const h = harness('KUN_EARTH'); h.neutral(); h.push();
  const kan = SPELL_DEFINITIONS.find(s => s.id === 'KAN_WATER');
  h.lifecycle.forceReady(4, kan, h.now); h.gate.consumeLock(4, 'KAN_WATER');
  h.pull(); h.pull(); assert.equal(h.casts.length, 0);
  h.neutral(); h.pull(); h.pull(); assert.equal(h.casts.length, 1);
  assert.equal(h.casts[0].spell.id, 'KAN_WATER'); assert.equal(h.lifecycle.lockedSector, 4);
});
test('POINT + PINCH stays LOCK even alongside a cast intent; ordinary pinch can still rotate', () => {
  const resolver = new GesturePriorityResolver();
  assert.equal(resolver.resolve({ fist: false, spellStage: 'READY', motion: { action: 'PUSH' },
    locking: true, rotating: true, pointing: true, spaceGesture: false }), 'LOCK');
  const machine = new GestureStateMachine(); machine.state = 'ACTIVE';
  const s = hand({ x: .5, y: .5, z: 0, scale: .16, gap: .1 });
  const stable = { raw: s, pinch: true, openPalm: false, fist: false, pointing: false, twoHandsOpen: false, twoHandsPinch: false };
  const admission = { manipulation: true, space: true, suppressFistCollapse: false, lockSector: false };
  assert.equal(machine.update(stable, 'ACTIVE', 1000, 0, admission)[0].type, 'BEGIN_ROTATION');
  machine.reset(); machine.state = 'ACTIVE';
  assert.equal(machine.update({ ...stable, twoHandsPinch: true }, 'ACTIVE', 1100, 0, admission)[0].type, 'BEGIN_GRAB');
});
test('double pinch cannot arm a spell; space control remains separate', () => {
  for (const id of Object.keys(sectors)) {
    const h = harness(id); h.neutral(); h.step({ gap: .1 }, { twoHands: true });
    h.step({ gap: .6 }, { twoHands: true }); assert.equal(h.casts.length, 0); assert.equal(h.gate.armed, false);
  }
});
test('inactive formation invalidates the unified gate', () => {
  const h = harness('KUN_EARTH'); h.neutral(); h.step({}, { active: false });
  assert.equal(h.gate.phase, 'IDLE'); assert.equal(h.gate.armed, false);
});
test('multi-signal frame is routed once: inactive spell controllers cannot emit another cast', () => {
  const h = harness('KUN_EARTH'); h.neutral(); const first = h.push();
  const mixed = { ...first.raw, timestamp: h.now + 33, action: 'PUSH', flickScore: 1,
    swipe: { ...first.raw.swipe, action: 'SWIPE_RIGHT', horizontal: .2, horizontalRatio: 1,
      consistency: 1, verticalTravel: 0, failure: 'NONE' } };
  h.step({}, { motion: mixed });
  assert.equal(h.casts.length, 1); assert.equal(h.casts[0].spell.id, 'KUN_EARTH');
  assert.equal(h.gate.xun.cycle.state, 'WAIT_READY');
  assert.equal(h.gate.zhen.status.castGate, false); assert.equal(h.gate.kan.status.castGate, false);
});
test('horizontal translation cannot bypass KAN direction checks via an independent SWIPE', () => {
  const h = harness('KAN_WATER'); h.neutral(); h.swipe(); assert.equal(h.casts.length, 0);
});
test('wind candidate with a reversal on the confirming sample is rejected', () => {
  const h = harness('XUN_WIND'); h.neutral(); let first;
  for (let i = 0; i < 8; i++) {
    first = h.step({ x: h.pose.x - .035 });
    if (first.state.phase === 'CANDIDATE') break;
  }
  assert.equal(first.state.phase, 'CANDIDATE');
  h.step({ x: h.pose.x + .04 }); assert.equal(h.casts.length, 0);
});
test('qa=spells preserves all four dedicated modes without enabling demos', () => {
  for (const qa of ['spells', 'kun', 'xun', 'zhen', 'kan']) {
    const m = readRuntimeMode({ search: '?qa=' + qa, pathname: '/' });
    assert.equal(m.realQa, true); assert.equal(m[qa + 'Qa'], true);
    assert.equal(m.presentationDemo, false); assert.equal(m.formationDemo, false);
  }
});
test('all frozen action defaults and the 360ms non-cast intent buffer are unchanged', () => {
  const t = DEFAULT_GESTURE_TUNING;
  assert.equal(t.pushThreshold, .42); assert.equal(t.pullThreshold, .42);
  assert.equal(t.swipeThreshold, .12); assert.equal(t.flickThreshold, 1.1);
  assert.equal(t.inputBufferMs, 360);
  assert.equal(t.pullZWeight, .56); assert.equal(t.pullScaleWeight, .30); assert.equal(t.pullFacingWeight, .14);
});
