import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GestureRecognizer } from '../src/gestureRecognition/GestureRecognizer.ts';
import { GestureMotionDetector } from '../src/gestureRecognition/GestureMotionDetector.ts';
import { DEFAULT_GESTURE_TUNING } from '../src/gestureRecognition/GestureTuning.ts';
import { XunCastInputController } from '../src/gestureRecognition/XunCastInputController.ts';
import { GestureStateMachine } from '../src/gestureRecognition/GestureStateMachine.ts';
import { SectorFocusController } from '../src/gestureRecognition/SectorFocusController.ts';
import { GesturePriorityResolver } from '../src/gestureRecognition/GesturePriorityResolver.ts';
import { SpellCastController } from '../src/spells/SpellCastController.ts';
import { SPELL_DEFINITIONS } from '../src/spells/SpellDefinition.ts';
import { screenXFromLandmark, screenDirectionToSpell } from '../src/handTracking/CameraCoordinates.ts';
import { intersectPlateLocal, sectorFromLocalPoint, sectorPoint } from '../src/qimen/FormationPicking.ts';
import { QimenFormation } from '../src/qimen/QimenFormation.ts';
import { SpellVisuals } from '../src/spells/SpellVisuals.ts';
import { SpellSystem } from '../src/spells/SpellSystem.ts';
import { readRuntimeMode } from '../src/app/runtimeMode.ts';

globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => new Proxy({}, { get: () => () => {} }) }) };
const empty = new GestureRecognizer().update({ hands: [], timestamp: 0, fps: 0 });
const snap = (x = .5, y = .5, z = 0) => ({ ...empty, handCount: 1, palmCenter: { x, y, z }, handScale: .12,
  normalizedPinchDistance: .5, openPalm: true, palmFacingCamera: true, name: 'OPEN_PALM' });
const wind = SPELL_DEFINITIONS.find(s => s.id === 'XUN_WIND');
const ctx = (motion, sector = 7) => ({ selectedSector: sector, lockedSector: sector, earthPlateAngle: 0, humanPlateAngle: 0,
  heavenPlateAngle: 0, spiritPlateAngle: 0, dominantHand: 'Right', currentGesture: 'OPEN_PALM', handVelocity: motion.velocity,
  handDepthVelocity: motion.depthVelocity, formationScale: 1, formationState: 'ACTIVE', castStage: 'READY', action: motion.action,
  castIntensity: motion.intensity, castDirection: screenDirectionToSpell(motion.direction), chargeScale: 1, handSnapshot: snap() });
const gate = c => ({ lockedSector: c.lockedSector, spellId: c.activeSpell?.id ?? null, stage: c.stage, formationActive: true });
const detector = () => new GestureMotionDetector({ values: DEFAULT_GESTURE_TUNING });
function prepared(ready = true) {
  const c = new SpellCastController(), still = detector().update(snap(), 0);
  c.lockSector(7, wind, 900);
  c.update(ctx(still), 1080); c.update(ctx(still), 1090);
  if (ready) c.update(ctx(still), 1450);
  return c;
}
function stroke(sign = 1, start = 1500, noiseZ = false) {
  const d = detector();
  for (let age = 0; age <= 240; age += 20) {
    const s = snap(.5 - sign * age / 1000, .5, noiseZ ? -age / 2000 : 0);
    const m = d.update(s, start + age);
    if (m.swipe.action) return { d, m, s };
  }
  assert.fail('short swipe was not recognized');
}

for (const [label, sign] of [['LEFT', -1], ['RIGHT', 1]]) {
  test(`XUN LOCKED + READY + natural ${label} swipe casts in that screen direction`, () => {
    const c = prepared(), input = new XunCastInputController(), { m, s } = stroke(sign);
    const result = input.update(gate(c), s, m, m.timestamp, true, 360);
    assert.equal(result.motion.action, `SWIPE_${label}`);
    const events = c.update(ctx(result.motion), m.timestamp);
    const cast = events.find(e => e.type === 'cast');
    assert.equal(cast.spell.id, 'XUN_WIND');
    assert.equal(cast.context.castDirection.x, sign);
    assert.equal(c.stage, 'CASTING');
  });
}

for (const [label, move] of [
  ['slow horizontal translation', age => snap(.5 - age / 10000)],
  ['vertical translation', age => snap(.5, .5 - age / 1000)],
  ['left/right jitter', (age, i) => snap(.5 + (i % 2 ? .035 : -.035))],
]) {
  test(`${label} cannot cast wind`, () => {
    const c = prepared(), input = new XunCastInputController(), d = detector();
    for (let age = 0, i = 0; age <= 800; age += 20, i++) {
      const s = move(age, i), m = d.update(s, 1500 + age);
      assert.equal(m.swipe.action, null);
      const result = input.update(gate(c), s, m, m.timestamp, true, 360);
      assert.ok(!c.update(ctx(result.motion), m.timestamp).some(e => e.type === 'cast'));
    }
  });
}

test('unlocked XUN cannot buffer or cast a swipe that later leaks into READY', () => {
  const input = new XunCastInputController(), c = new SpellCastController(), { m, s } = stroke();
  input.update(gate(c), s, m, m.timestamp, true, 360);
  assert.ok(!c.update(ctx(m), m.timestamp).some(e => e.type === 'cast'));
  c.lockSector(7, wind, m.timestamp + 1); c.forceReady(7, wind, m.timestamp + 2);
  const duplicate = { ...m, action: null, swipe: { ...m.swipe, action: null } };
  assert.equal(input.update(gate(c), s, duplicate, m.timestamp + 3, false, 360).motion.action, null);
});

test('XUN charging swipe is deferred, then consumed once within the unchanged 360ms buffer', () => {
  const c = prepared(false), input = new XunCastInputController(), { m, s } = stroke(1, 1000);
  const early = input.update(gate(c), s, m, m.timestamp, true, 360);
  assert.equal(early.motion.action, null);
  assert.ok(!c.update(ctx(early.motion), m.timestamp).some(e => e.type === 'cast'));
  c.update(ctx(early.motion), 1450); assert.equal(c.stage, 'READY');
  const duplicate = { ...m, action: null, swipe: { ...m.swipe, action: null } };
  const result = input.update(gate(c), s, duplicate, 1451, false, 360);
  assert.equal(result.sourceTimestamp, m.timestamp);
  assert.equal(result.motion.action, 'SWIPE_RIGHT');
  assert.equal(result.buffered, true);
  assert.ok(c.update(ctx(result.motion), 1451).some(e => e.type === 'cast'));
  assert.equal(input.update(gate(c), s, duplicate, 1452, false, 360).motion.action, null);
});

test('an expired pre-READY swipe cannot cast', () => {
  const c = prepared(false), input = new XunCastInputController(), { m, s } = stroke(1, 1000);
  input.update(gate(c), s, m, m.timestamp, true, 360);
  c.update(ctx(m), 1500);
  const result = input.update(gate(c), s, { ...m, action: null, swipe: { ...m.swipe, action: null } }, m.timestamp + 361, false, 360);
  assert.equal(result.failure, 'BUFFER_EXPIRED'); assert.equal(result.motion.action, null);
  assert.ok(!c.update(ctx(result.motion), m.timestamp + 361).some(e => e.type === 'cast'));
});

test('depth-noise PUSH cannot steal an independently valid XUN swipe or buffered cast', () => {
  const c = prepared(), input = new XunCastInputController(), { m, s } = stroke(-1, 1500, true);
  assert.equal(m.action, 'PUSH'); assert.equal(m.swipe.action, 'SWIPE_LEFT');
  const result = input.update(gate(c), s, m, m.timestamp, true, 360);
  assert.equal(result.motion.action, 'SWIPE_LEFT');
  assert.ok(c.update(ctx(result.motion), m.timestamp).some(e => e.type === 'cast'));
});

test('a valid queued swipe is consumed even when the READY frame is labelled PUSH', () => {
  const c = prepared(false), input = new XunCastInputController(), { m, s } = stroke(-1, 1000);
  input.update(gate(c), s, m, m.timestamp, true, 360);
  c.update(ctx(m), 1450);
  const noisy = { ...m, timestamp: 1451, action: 'PUSH', swipe: { ...m.swipe, action: null }, direction: { x: 0, y: 0, z: -1 } };
  const result = input.update(gate(c), s, noisy, 1451, true, 360);
  assert.equal(result.motion.action, 'SWIPE_LEFT'); assert.equal(result.motion.direction.x, -1);
  assert.equal(result.sourceTimestamp, m.timestamp);
  assert.ok(c.update(ctx(result.motion), 1451).some(e => e.type === 'cast'));
});

test('vertical zigzags are rejected even if their final Y displacement cancels out', () => {
  const d = detector();
  for (let age = 0, i = 0; age <= 240; age += 20, i++) {
    const m = d.update(snap(.5 - age / 1000, .5 + (i % 2 ? .04 : 0)), 1500 + age);
    assert.equal(m.swipe.action, null);
    if (age >= 120) assert.equal(m.swipe.failure, 'TOO_MUCH_VERTICAL_DRIFT');
  }
});

test('direction locks across a recoil, then rearms only after rest for a new opposite stroke', () => {
  const { d, m, s } = stroke(1);
  const rawStart = s.palmCenter.x;
  for (let age = 20; age <= 100; age += 20) {
    const back = d.update(snap(rawStart + age / 1500), m.timestamp + age);
    assert.equal(back.swipe.action, null); assert.equal(back.swipe.direction, 'RIGHT');
    assert.equal(back.swipe.failure, 'DIRECTION_REVERSAL');
  }
  const restX = rawStart + 100 / 1500;
  for (let age = 120; age <= 300; age += 20) d.update(snap(restX), m.timestamp + age);
  let next = null;
  for (let age = 20; age <= 220; age += 20) {
    const out = d.update(snap(restX + age / 1000), m.timestamp + 300 + age);
    if (out.swipe.action) next = out.swipe.action;
  }
  assert.equal(next, 'SWIPE_LEFT');
});

test('hand loss discards a queued swipe; sparse samples and closed poses cannot form a stroke', () => {
  const input = new XunCastInputController(), c = prepared(false), { d, m, s } = stroke();
  input.update(gate(c), s, m, m.timestamp, true, 360);
  const missing = d.update(empty, m.timestamp + 20);
  assert.equal(missing.swipe.failure, 'HAND_LOST');
  input.update(gate(c), empty, missing, missing.timestamp, true, 360);
  c.forceReady(7, wind, m.timestamp + 40);
  assert.equal(input.update(gate(c), s, { ...m, action: null, swipe: { ...m.swipe, action: null } }, m.timestamp + 60, false, 360).motion.action, null);
  const sparse = detector(); sparse.update(snap(.5), 1000);
  assert.equal(sparse.update(snap(.2), 1400).swipe.failure, 'HAND_LOST');
  const closed = detector(); closed.update({ ...snap(), openPalm: false }, 1000);
  assert.equal(closed.update({ ...snap(.2), openPalm: false }, 1160).swipe.action, null);
});

test('one-frame horizontal jumps and repeated camera samples cannot become repeated swipe events', () => {
  const d = detector(); d.update(snap(.5), 1000);
  assert.equal(d.update(snap(.25), 1120).swipe.action, null);
  const { d: moving, m, s } = stroke();
  assert.equal(moving.update(s, m.timestamp).swipe.action, null);
  assert.equal(moving.update(s, m.timestamp).action, null);
});

test('mirroring happens once: raw camera X, screen X and spell X agree', () => {
  assert.equal(Math.sign(screenXFromLandmark(.7) - screenXFromLandmark(.5)), -1);
  assert.equal(Math.sign(screenXFromLandmark(.7, false) - screenXFromLandmark(.5, false)), 1);
  for (const sign of [-1, 1]) {
    const { m, s } = stroke(sign);
    const input = new XunCastInputController(), c = prepared();
    const result = input.update(gate(c), s, m, m.timestamp, true, 360);
    assert.equal(screenDirectionToSpell(result.motion.direction).x, sign);
  }
});

test('moving, rotating, splitting and scaling the real front plate still maps its XUN glyph to sector 7', () => {
  const formation = new QimenFormation(), plate = formation.heavenPlate;
  formation.group.position.set(.3, 1.2, -2); formation.group.rotation.set(1.42, .07, -.12); formation.group.scale.setScalar(1.4);
  plate.position.y = .25; plate.rotation.y = .63; plate.scale.setScalar(1.04);
  formation.group.updateMatrixWorld(true);
  const point = plate.localToWorld(sectorPoint(7, 3.8, .117)), origin = new THREE.Vector3(0, 1.4, 3);
  const local = intersectPlateLocal(new THREE.Ray(origin, point.clone().sub(origin).normalize()), plate, .117);
  assert.ok(local); assert.equal(sectorFromLocalPoint(local.x, local.z), 7);
});

test('POINT XUN + PINCH stays LOCK; READY swipe outranks grab, scale, rotation and targeting', () => {
  const focus = new SectorFocusController(), machine = new GestureStateMachine(); machine.state = 'ACTIVE';
  focus.update(7, 1000, true); focus.update(7, 1160, true); focus.update(null, 1280, false);
  const stabilized = { raw: snap(), openPalm: false, fist: false, pointing: false, pinch: true, twoHandsOpen: false, twoHandsPinch: false };
  assert.equal(machine.update(stabilized, 'ACTIVE', 1280, 0, { manipulation: true, space: true, suppressFistCollapse: false, lockSector: focus.focusedSector === 7 })[0].type, 'LOCK');
  const c = prepared(), input = new XunCastInputController(), { m, s } = stroke();
  const result = input.update(gate(c), s, m, m.timestamp, true, 360);
  const priority = new GesturePriorityResolver().resolve({ fist: false, spellStage: 'READY', motion: result.motion, locking: true, rotating: true, pointing: true, spaceGesture: true });
  assert.equal(priority, 'CAST');
  assert.deepEqual(machine.update({ ...stabilized, twoHandsPinch: true }, 'ACTIVE', m.timestamp, 2, { manipulation: false, space: false, suppressFistCollapse: false }), []);
});

test('wind ribbons start at XUN and all travel in the accepted direction', () => {
  const formation = new QimenFormation(), visuals = new SpellVisuals();
  formation.group.updateMatrixWorld(true);
  for (const sign of [-1, 1]) {
    const { m, s } = stroke(sign), c = prepared(), input = new XunCastInputController();
    const result = input.update(gate(c), s, m, m.timestamp, true, 360);
    visuals.cast('XUN_WIND', ctx(result.motion), formation);
    const ribbons = visuals.active.filter(item => item.poolKey === 'XUN_WIND:ribbon');
    const anchor = formation.sectorWorldPoint(7);
    assert.ok(ribbons.length > 0);
    for (const item of ribbons) {
      const p = item.object.geometry.getAttribute('position');
      assert.ok(Math.abs(p.getX(0) - anchor.x) < 1e-5);
      assert.equal(Math.sign(p.getX(p.count - 1) - p.getX(0)), sign);
      assert.equal(Math.sign(item.velocity.x), sign);
    }
    visuals.clear();
  }
  visuals.dispose();
});

test('wind follow-through cannot reverse the cast direction on a trailing hand recoil', () => {
  const formation = new QimenFormation(), system = new SpellSystem(formation, { pulse() {} });
  const { m, s } = stroke(1), c = prepared(), input = new XunCastInputController();
  const result = input.update(gate(c), s, m, m.timestamp, true, 360);
  system.controller.forceReady(7, wind, m.timestamp);
  system.update(ctx(result.motion), result.motion, m.timestamp, 0, 0, null);
  const ribbons = system.visuals.active.filter(item => item.poolKey === 'XUN_WIND:ribbon');
  const before = ribbons.map(item => item.object.position.x);
  const recoil = { ...m, action: null, direction: { x: -1, y: 0, z: 0 }, swipe: { ...m.swipe, action: null } };
  system.update(ctx(recoil), recoil, m.timestamp + 20, 0, 0, null);
  ribbons.forEach((item, i) => assert.ok(item.object.position.x >= before[i]));
  system.dispose();
});

test('qa=xun enables the real QA path without enabling demos', () => {
  const mode = readRuntimeMode({ search: '?qa=xun', pathname: '/' });
  assert.equal(mode.xunQa, true); assert.equal(mode.realQa, true);
  assert.equal(mode.presentationDemo, false); assert.equal(mode.formationDemo, false);
});
