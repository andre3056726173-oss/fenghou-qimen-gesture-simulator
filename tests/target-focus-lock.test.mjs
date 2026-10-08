import test from 'node:test';
import assert from 'node:assert/strict';
import { TargetSelectionController } from '../src/gestureRecognition/TargetSelectionController.ts';
import { GestureStateMachine } from '../src/gestureRecognition/GestureStateMachine.ts';
import { RealInteractionQA, hasTargetQaSchema } from '../src/gestureRecognition/RealInteractionQA.ts';
import { fingertipToNdc, setCameraDimensions } from '../src/handTracking/CameraCoordinates.ts';
import { intersectPlateLocal, sectorFromLocalPoint } from '../src/qimen/FormationPicking.ts';
import { QimenFormation } from '../src/qimen/QimenFormation.ts';
import * as THREE from 'three';
import { SpellCastController } from '../src/spells/SpellCastController.ts';
import { SPELL_DEFINITIONS } from '../src/spells/SpellDefinition.ts';

const sample = (timestamp, extra = {}) => ({ timestamp, fresh: true, hasHand: true, active: true,
  pointing: true, pointScore: 0.9, sector: 1, boundaryDistance: 15, aimSpeed: 0,
  pinchDistance: 0.6, graceMs: 250, ...extra });
function focused(pinchDistance = 0.6) {
  const c = new TargetSelectionController();
  for (const t of [1000, 1033, 1066, 1100]) c.update(sample(t, { pinchDistance }));
  return c;
}
const pinch = (c, t = 1133) => {
  c.update(sample(t, { pointing: false, sector: null, pinchDistance: 0.23 }));
  c.update(sample(t + 33, { pointing: false, sector: null, pinchDistance: 0.16 }));
};
test('two fresh camera samples produce immediate target preview', () => {
  const c = new TargetSelectionController(); c.update(sample(1000)); assert.equal(c.previewSector, null);
  c.update(sample(1033)); assert.equal(c.stage, 'TARGET_PREVIEW'); assert.equal(c.previewSector, 1);
});
test('100% POINT and mirrored fingertip aimed at KUN yields screen-space KUN preview', () => {
  setCameraDimensions(1280, 720);
  const ndc = fingertipToNdc(0.25, 0.75, 1280, 720);
  const camera = new THREE.PerspectiveCamera(90, 1280 / 720, 0.1, 100);
  camera.position.set(0, 0, 5); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
  const plate = new THREE.Group(); plate.rotation.x = Math.PI / 2; plate.updateMatrixWorld();
  const raycaster = new THREE.Raycaster(); raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera);
  const hit = intersectPlateLocal(raycaster.ray, plate, 0);
  assert.ok(hit); assert.equal(sectorFromLocalPoint(hit.x, hit.z), 1);
  const c = new TargetSelectionController();
  c.update(sample(1000, { pointScore: 1, sector: 1 }));
  c.update(sample(1033, { pointScore: 1, sector: 1 }));
  assert.equal(c.previewSector, 1);
});
test('slow central aim focuses and arms in 100ms', () => {
  const c = focused(); assert.equal(c.focusedSector, 1); assert.equal(c.armedSector, 1);
  assert.equal(c.focusDwellMs, 100);
});
test('Focus immediately owns an armed target even as POINT disappears', () => {
  const c = focused(); assert.equal(c.stage, 'TARGET_ARMED');
  c.update(sample(1133, { pointing: false, sector: null, pointScore: 0, pinchDistance: 0.5 }));
  assert.equal(c.armedSector, 1);
});
test('moving/boundary aim uses a longer 200ms dwell', () => {
  const c = new TargetSelectionController();
  for (const t of [1000, 1033, 1100]) c.update(sample(t, { boundaryDistance: 2, aimSpeed: 2 }));
  assert.equal(c.armedSector, null); c.update(sample(1200, { boundaryDistance: 2, aimSpeed: 2 }));
  assert.equal(c.armedSector, 1);
});
test('point disappears while index bends: armed target remains and new pinch locks', () => {
  const c = focused(); c.update(sample(1133, { pointing: false, sector: null, pinchDistance: 0.5 }));
  assert.equal(c.armedSector, 1); pinch(c, 1166); assert.equal(c.pinch.confirmed, true);
  c.confirmLock(1199, 0.2); assert.equal(c.stage, 'LOCKED'); assert.equal(c.lockedSector, 1);
  assert.equal(c.armedSector, null);
});
test('armed window expires after 1500ms and cannot lock', () => {
  const c = focused(); c.update(sample(2601, { pointing: false, sector: null }));
  assert.equal(c.armedSector, null); pinch(c, 2634); assert.equal(c.pinch.confirmed, false);
});
test('pinch already active before focus cannot pass through; release and a new edge required', () => {
  const c = focused(0.16); pinch(c); assert.equal(c.pinch.confirmed, false);
  c.update(sample(1200, { pointing: false, sector: null, pinchDistance: 0.6 }));
  pinch(c, 1233); assert.equal(c.pinch.confirmed, true);
});
test('armed lock beats rotate and two-hand grab, without global stable PINCH', () => {
  const m = new GestureStateMachine(); m.state = 'ACTIVE';
  const input = { raw: { normalizedPinchDistance: 0.16 }, fist: false, pinch: false, pointing: false, twoHandsPinch: true, twoHandsOpen: false };
  assert.deepEqual(m.update(input, 'ACTIVE', 1000, 0, { manipulation: true, space: true,
    suppressFistCollapse: false, targetArmed: true, lockSector: true, lockConfirmed: true }).map(e => e.type), ['LOCK']);
  assert.equal(m.state, 'LOCKING');
  assert.deepEqual(m.update(input, 'ACTIVE', 1033, 0).map(e => e.type), []);
  assert.equal(m.state, 'LOCKING');
});
test('ordinary pinch without armed target still rotates', () => {
  const m = new GestureStateMachine(); m.state = 'ACTIVE';
  const events = m.update({ raw: {}, fist: false, pinch: true, pointing: false, twoHandsPinch: false, twoHandsOpen: false }, 'ACTIVE', 1000, 0);
  assert.equal(events[0].type, 'BEGIN_ROTATION');
});
test('stale timestamps / RAF cannot advance preview, focus or confirm pinch', () => {
  const c = new TargetSelectionController(); c.update(sample(1000));
  for (let i = 0; i < 10; i++) c.update(sample(1000));
  assert.equal(c.previewSector, null);
  c.update(sample(1200, { fresh: false })); assert.equal(c.armedSector, null);
  const armed = focused(); armed.update(sample(1133, { pointing: false, pinchDistance: 0.23 }));
  for (let i = 0; i < 10; i++) armed.update(sample(1133, { pinchDistance: 0.16 }));
  assert.equal(armed.pinch.confirmed, false);
});
test('long hand loss clears target; brief loss cannot turn reacquired pinch into lock', () => {
  const c = focused(); c.update(sample(1133, { hasHand: false }));
  c.update(sample(1200, { pointing: false, pinchDistance: 0.16 }));
  assert.equal(c.armedSector, 1); assert.equal(c.pinch.confirmed, false);
  c.update(sample(1233, { hasHand: false })); c.update(sample(1500, { hasHand: false }));
  assert.equal(c.armedSector, null);
});
test('brief sector boundary jitter does not replace the armed target', () => {
  const c = focused();
  for (let i = 0; i < 6; i++) c.update(sample(1133 + 33 * i, { sector: i % 2 ? 1 : 2, boundaryDistance: 1 }));
  assert.equal(c.armedSector, 1);
});
test('focusing a different sector replaces the armed target only after dwell', () => {
  const c = focused(); c.update(sample(1133, { sector: 2 })); assert.equal(c.armedSector, 1);
  c.update(sample(1233, { sector: 2 })); assert.equal(c.armedSector, 2);
});
test('POINT alone never locks; a single abnormal pinch sample does not confirm', () => {
  const c = focused(); c.update(sample(1133, { pointing: false, pinchDistance: 0.10 }));
  assert.equal(c.pinch.confirmed, false); c.update(sample(1166, { pointing: false, pinchDistance: 0.6 }));
  assert.equal(c.pinch.confirmed, false); assert.equal(c.lockedSector, null);
});
test('QA report keeps focus/lock counts, latency and diagnostic timeline', () => {
  const qa = new RealInteractionQA(); qa.toggleSession(1000, {});
  const c = new TargetSelectionController();
  for (const t of [1000, 1033, 1066, 1100]) { c.update(sample(t)); c.events.forEach(e => qa.targetEvent(e)); }
  c.update(sample(1133, { pointing: false, pinchDistance: 0.23 })); c.events.forEach(e => qa.targetEvent(e));
  c.update(sample(1166, { pointing: false, pinchDistance: 0.16 })); c.events.forEach(e => qa.targetEvent(e));
  c.confirmLock(1166, 0); qa.targetEvent(c.events.at(-1));
  const report = qa.snapshot({});
  assert.equal(report.targetSelection.focusSuccess, 1); assert.equal(report.targetSelection.lockSuccess, 1);
  assert.deepEqual(report.targetSelection.lockLatencyMs, [33]);
  assert.ok(report.targetTimeline.some(e => e.event === 'LOCK_SUCCESS'));
  assert.equal(hasTargetQaSchema(report), true);
  assert.equal(hasTargetQaSchema({ spell: {}, environment: {} }), false);
});

test('locked sector persists across a new POINT preview until another lock or cancel', () => {
  const c = focused(); pinch(c); c.confirmLock(1166, 0.2);
  c.update(sample(1200, { sector: 2, pinchDistance: 0.6 }));
  c.update(sample(1233, { sector: 2, pinchDistance: 0.6 }));
  assert.equal(c.previewSector, 2); assert.equal(c.lockedSector, 1);
});
test('visual plate preview/focus cannot erase an existing locked palace', () => {
  const previousDocument = globalThis.document;
  globalThis.document = { createElement: () => ({ width: 0, height: 0,
    getContext: () => new Proxy({}, { get: () => () => {} }) }) };
  try {
    const formation = new QimenFormation();
    formation.activate(1, 1);
    formation.preview(2, 0.3);
    formation.focus(2, 0.8);
    assert.equal(formation.lockedSector, 1);
    formation.activate(2, 1);
    assert.equal(formation.lockedSector, 2);
  } finally { globalThis.document = previousDocument; }
});

test('camera stall expires target on wall time without advancing sample evidence', () => {
  const c = focused(); c.update(sample(1133, { pointing: false, hasHand: false }));
  c.update(sample(1133, { fresh: false, hasHand: false, now: 1400 }));
  assert.equal(c.armedSector, null); assert.equal(c.pinch.confirmed, false);
});

test('POINT -> bent index -> early lock pinch enters real spell PREPARING without stable global PINCH', () => {
  const c = focused(), machine = new GestureStateMachine(), spell = new SpellCastController();
  machine.state = 'POINTING'; pinch(c);
  const input = { raw: { normalizedPinchDistance: 0.16 }, fist: false, pinch: false, pointing: false,
    twoHandsOpen: false, twoHandsPinch: false };
  const events = machine.update(input, 'ACTIVE', 1166, 0, { manipulation: true, space: false,
    suppressFistCollapse: false, targetArmed: true, lockSector: c.armedSector !== null, lockConfirmed: c.pinch.confirmed });
  assert.equal(events[0].type, 'LOCK');
  const definition = SPELL_DEFINITIONS.find(s => s.sector === c.armedSector);
  const spellEvents = spell.lockSector(c.armedSector, definition, 1166);
  assert.equal(spellEvents[0].stage, 'PREPARING');
  c.confirmLock(1166, 0.2); assert.equal(spell.lockedSector, 1);
  for (const t of [1199, 1232]) {
    c.update(sample(t, { pointing: false, pinchDistance: 0.16 }));
    assert.equal(machine.update(input, 'ACTIVE', t, 0).length, 0);
    assert.equal(machine.state, 'LOCKING'); assert.equal(spell.lockedSector, 1);
  }
});

test('suppressed fist candidate during curved lock fingers cannot silently reject confirmed LOCK', () => {
  const m = new GestureStateMachine(); m.state = 'POINTING';
  const events = m.update({ raw: { normalizedPinchDistance: 0.19 }, fist: true, pinch: false,
    pointing: false, twoHandsOpen: false, twoHandsPinch: false }, 'ACTIVE', 1166, 0,
    { manipulation: true, space: false, suppressFistCollapse: true, targetArmed: true,
      lockSector: true, lockConfirmed: true });
  assert.deepEqual(events.map(e => e.type), ['LOCK']); assert.equal(m.state, 'LOCKING');
});
