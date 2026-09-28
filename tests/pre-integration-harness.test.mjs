import test from 'node:test';
import assert from 'node:assert/strict';
import { SectorFocusController } from '../src/gestureRecognition/SectorFocusController.ts';
import { GestureStateMachine } from '../src/gestureRecognition/GestureStateMachine.ts';
import { GestureMotionDetector } from '../src/gestureRecognition/GestureMotionDetector.ts';
import { GestureInputBuffer } from '../src/gestureRecognition/GestureInputBuffer.ts';
import { DEFAULT_GESTURE_TUNING } from '../src/gestureRecognition/GestureTuning.ts';
import { SpellCastController } from '../src/spells/SpellCastController.ts';
import { SPELL_DEFINITIONS } from '../src/spells/SpellDefinition.ts';

// Stable-main seam harness: real focus/state-machine, spell lifecycle and motion
// classification. Branch-specific READY gates live in the unmerged branches and
// are verified by their own suites before integration.
const context = (sector, action = 'HOLD') => ({ selectedSector: sector, lockedSector: sector,
  earthPlateAngle: 0, humanPlateAngle: 0, heavenPlateAngle: 0, spiritPlateAngle: 0,
  dominantHand: 'Right', currentGesture: 'OPEN_PALM', handVelocity: { x: 0, y: 0, z: 0 },
  handDepthVelocity: 0, formationScale: 1, formationState: 'ACTIVE', castStage: 'NONE',
  action, castIntensity: 1, castDirection: { x: 1, y: 0, z: 0 }, chargeScale: 1 });
const gesture = (patch = {}) => ({ raw: { normalizedPinchDistance: 0.16 }, openPalm: false,
  fist: false, pointing: false, pinch: false, twoHandsOpen: false, twoHandsPinch: false, ...patch });
const pose = (patch = {}) => ({ handCount: 1, palmCenter: { x: .5, y: .5, z: 0 },
  handScale: .12, normalizedPinchDistance: .5, openPalm: true, palmFacingCamera: true,
  pinchActive: false, pointing: false, ...patch });

function readyChain(sector) {
  const focus = new SectorFocusController(), machine = new GestureStateMachine(),
    lifecycle = new SpellCastController();
  const definition = SPELL_DEFINITIONS.find(spell => spell.sector === sector);
  assert.ok(definition);
  machine.state = 'ACTIVE';
  focus.update(sector, 1000, true);
  assert.equal(focus.update(sector, 1160, true).stage, 'FOCUSED');
  focus.update(null, 1200, false);
  assert.equal(focus.focusedSector, sector);
  const lockEvents = machine.update(gesture({ pinch: true }), 'ACTIVE', 1300, 0,
    { manipulation: true, space: false, suppressFistCollapse: false, lockSector: true });
  assert.deepEqual(lockEvents.map(event => event.type), ['LOCK']);
  assert.equal(lifecycle.lockSector(focus.focusedSector, definition, 1300)[0].stage, 'PREPARING');
  focus.lock(sector);
  lifecycle.update(context(sector), 1480);
  assert.equal(lifecycle.stage, 'ALIGNED');
  lifecycle.update(context(sector), 1500);
  assert.equal(lifecycle.stage, 'CHARGING');
  const readyAt = 1500 + definition.chargeMs;
  lifecycle.update(context(sector), readyAt);
  assert.equal(lifecycle.stage, 'READY');
  assert.equal(lifecycle.lockedSector, sector);
  return { focus, machine, lifecycle, definition, readyAt };
}

for (const [sector, action, id] of [
  [1, 'PUSH', 'KUN_EARTH'], [7, 'SWIPE_LEFT', 'XUN_WIND'],
  [6, 'FLICK', 'ZHEN_LIGHTNING'], [4, 'PULL', 'KAN_WATER'],
]) {
  test(`${id}: synthetic POINT -> FOCUS -> LOCK -> CHARGING -> READY -> ${action} casts once`, () => {
    const { lifecycle, readyAt } = readyChain(sector);
    const cast = lifecycle.update(context(sector, action), readyAt + 33).filter(event => event.type === 'cast');
    assert.equal(cast.length, 1); assert.equal(cast[0].spell.id, id);
    assert.equal(lifecycle.stage, 'CASTING');
    assert.equal(lifecycle.update(context(sector, action), readyAt + 66).filter(event => event.type === 'cast').length, 0);
    lifecycle.update(context(sector), readyAt + 250);
    assert.equal(lifecycle.stage, 'COOLDOWN');
    assert.equal(lifecycle.update(context(sector, action), readyAt + 300).filter(event => event.type === 'cast').length, 0);
  });
}

for (const [sector, wrong, correct] of [
  [1, 'PULL', 'PUSH'], [4, 'PUSH', 'PULL'],
  [7, 'FLICK', 'SWIPE_RIGHT'], [6, 'SWIPE_LEFT', 'FLICK'],
]) {
  test(`locked sector ${sector} rejects ${wrong}, then accepts only its own action`, () => {
    const { lifecycle, readyAt } = readyChain(sector);
    assert.equal(lifecycle.update(context(sector, wrong), readyAt + 33).filter(event => event.type === 'cast').length, 0);
    assert.equal(lifecycle.stage, 'READY');
    assert.equal(lifecycle.update(context(sector, correct), readyAt + 66).filter(event => event.type === 'cast').length, 1);
  });
}

test('main input buffer retains pre-READY spell actions: a documented integration hazard', () => {
  const buffer = new GestureInputBuffer();
  for (const action of ['PUSH', 'PULL', 'SWIPE_LEFT', 'FLICK']) buffer.push(action, 1000);
  assert.ok(buffer.consume(['PUSH'], 1120, 360));
  assert.ok(buffer.consume(['PULL'], 1120, 360));
  assert.ok(buffer.consume(['SWIPE_LEFT'], 1120, 360));
  assert.ok(buffer.consume(['FLICK'], 1120, 360));
  assert.equal(buffer.consume(['LOCK'], 1120, 360), null);
  buffer.push('PUSH', 1000);
  assert.equal(buffer.consume(['PUSH'], 1400, 360), null);
});

test('opposite depth motion does not classify both PUSH and PULL', () => {
  for (const [z, scale, expected] of [[-.05, .14, 'PUSH'], [.05, .10, 'PULL'], [-.001, .12, null]]) {
    const detector = new GestureMotionDetector({ values: DEFAULT_GESTURE_TUNING });
    detector.update(pose(), 1000);
    const motion = detector.update(pose({ palmCenter: { x: .5, y: .5, z }, handScale: scale }), 1033);
    assert.equal(motion.action, expected);
    if (expected === 'PUSH') assert.ok(motion.pushScore > motion.pullScore);
    if (expected === 'PULL') assert.ok(motion.pullScore > motion.pushScore);
  }
});

test('stale camera timestamp and hand loss cannot mint a fresh motion action', () => {
  const detector = new GestureMotionDetector({ values: DEFAULT_GESTURE_TUNING });
  detector.update(pose(), 1000);
  const forward = detector.update(pose({ palmCenter: { x: .5, y: .5, z: -.05 }, handScale: .14 }), 1033);
  assert.equal(forward.action, 'PUSH');
  assert.equal(detector.update(pose({ palmCenter: { x: .5, y: .5, z: -.05 }, handScale: .14 }), 1033).action, null);
  assert.equal(detector.update({ ...pose(), palmCenter: null, handCount: 0 }, 1066).action, null);
  const reacquired = detector.update(pose({ palmCenter: { x: .5, y: .5, z: .2 }, handScale: .08 }), 1100);
  assert.equal(reacquired.action, null);
});

test('ordinary open-palm lateral movement cannot become a FLICK', () => {
  const detector = new GestureMotionDetector({ values: DEFAULT_GESTURE_TUNING });
  for (let i = 0; i <= 8; i++) {
    const motion = detector.update(pose({ palmCenter: { x: .5 - .025 * i, y: .5, z: 0 } }), 1000 + i * 33);
    assert.notEqual(motion.action, 'FLICK');
  }
});

test('a held pinch release with lateral residual emits FLICK, not a second SWIPE action', () => {
  const detector = new GestureMotionDetector({ values: DEFAULT_GESTURE_TUNING });
  for (let i = 0; i <= 8; i++) detector.update(pose({
    palmCenter: { x: .5 - .01 * i, y: .5, z: 0 }, pinchActive: true,
    normalizedPinchDistance: .15,
  }), 1000 + i * 40);
  const release = detector.update(pose({
    palmCenter: { x: .35, y: .5, z: 0 }, normalizedPinchDistance: .5,
  }), 1353);
  assert.equal(release.action, 'FLICK');
});
