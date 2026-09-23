import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { FrameSampleGate, validHandLandmarks } from '../src/handTracking/FrameSampleGate.ts';
import { HandTracker } from '../src/handTracking/HandTracker.ts';
import { GestureMotionDetector } from '../src/gestureRecognition/GestureMotionDetector.ts';
import { DEFAULT_GESTURE_TUNING } from '../src/gestureRecognition/GestureTuning.ts';
import { GestureRecognizer } from '../src/gestureRecognition/GestureRecognizer.ts';
import { GestureStateMachine } from '../src/gestureRecognition/GestureStateMachine.ts';
import { GestureChoreographyController } from '../src/gestureRecognition/GestureChoreographyController.ts';
import { GesturePriorityResolver } from '../src/gestureRecognition/GesturePriorityResolver.ts';
import { SpellCastController } from '../src/spells/SpellCastController.ts';
import { SpellResolver } from '../src/spells/SpellResolver.ts';
import { SPELL_DEFINITIONS } from '../src/spells/SpellDefinition.ts';
import { PerformanceGovernor } from '../src/threeScene/PerformanceGovernor.ts';
import { intersectPlateLocal } from '../src/qimen/FormationPicking.ts';
import { landmarkToViewport } from '../src/handTracking/CameraCoordinates.ts';
import { stateViolations } from '../src/StateInvariantGuard.ts';
import { QimenFormation } from '../src/qimen/QimenFormation.ts';
import { FormationAnimator } from '../src/qimen/FormationAnimator.ts';
import { HandSpaceController } from '../src/threeScene/HandSpaceController.ts';
import { SpellSystem } from '../src/spells/SpellSystem.ts';
import { SpellVisuals } from '../src/spells/SpellVisuals.ts';
import { SpellDemoDirector } from '../src/showcase/SpellDemoDirector.ts';
import { disposeObjectTrees, resetPooledTransform } from '../src/threeScene/ResourceLifecycle.ts';
import { AudioEventBus } from '../src/audio/AudioEventBus.ts';
import { RealInteractionQA } from '../src/gestureRecognition/RealInteractionQA.ts';
import { GestureCalibration } from '../src/gestureRecognition/GestureCalibration.ts';
import { GestureInputBuffer } from '../src/gestureRecognition/GestureInputBuffer.ts';
import { PostProcessingPipeline } from '../src/threeScene/PostProcessingPipeline.ts';
import { VISUAL_QUALITY } from '../src/threeScene/VisualQualityConfig.ts';
import { CameraController } from '../src/threeScene/CameraController.ts';

// Only 2D glyph generation is stubbed. All Three.js geometry/matrix/pool code is real.
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => new Proxy({}, { get: () => () => {} }) }) };
globalThis.HTMLMediaElement = { HAVE_CURRENT_DATA: 2 };
const empty = () => new GestureRecognizer().update({ hands: [], timestamp: 1, fps: 0 });
const hand = () => Array.from({ length: 21 }, (_, i) => ({ x: .4 + i * .005, y: .6 - i * .006, z: -i * .002 }));
const snapshot = (x = .5, z = 0) => ({ ...empty(), handCount: 1, palmCenter: { x, y: .5, z }, handScale: .12, normalizedPinchDistance: .5, openPalm: true, palmFacingCamera: true, name: 'OPEN_PALM' });
const context = (action = 'HOLD') => ({ selectedSector: 1, lockedSector: 1, earthPlateAngle: 0, humanPlateAngle: 0, heavenPlateAngle: 0, spiritPlateAngle: 0, dominantHand: 'Right', currentGesture: 'OPEN_PALM', handVelocity: { x: 0, y: 0, z: 0 }, handDepthVelocity: 0, formationScale: 1, formationState: 'ACTIVE', castStage: 'NONE', action, castIntensity: 1, castDirection: { x: 1, y: 0, z: 0 }, chargeScale: 1 });
const stabilized = (patch = {}) => ({ raw: empty(), openPalm: false, fist: false, pointing: false, pinch: false, twoHandsOpen: false, twoHandsPinch: false, ...patch });

test('camera frame identity survives repeated RAF ticks and stalled video becomes unavailable', () => {
  const video = { readyState: 2, currentTime: 1 };
  const tracker = new HandTracker(video);
  tracker.status = 'ready'; tracker.detector = { detectForVideo: () => ({ landmarks: [hand()] }) };
  const a = tracker.detect(1000), b = tracker.detect(1016);
  assert.equal(b, a); assert.equal(b.timestamp, 1000);
  const gate = new FrameSampleGate(); assert.equal(gate.accept(a), true); assert.equal(gate.accept(b), false);
  video.currentTime = 2; assert.equal(gate.accept(tracker.detect(1033)), true);
  assert.equal(tracker.detect(1290).hands.length, 0);
  assert.equal(validHandLandmarks([{ x: NaN, y: 1, z: 0 }]), false);
});

test('sample-clock derivatives are not doubled by display FPS; duplicate samples emit no event', () => {
  const detector = new GestureMotionDetector({ values: DEFAULT_GESTURE_TUNING });
  detector.update(snapshot(.5), 1000);
  const one = detector.update(snapshot(.49), 1033);
  const duplicate = detector.update(snapshot(.49), 1033);
  const two = detector.update(snapshot(.48), 1066);
  assert.ok(Math.abs(one.velocity.x - .01 / .033) < 1e-8);
  assert.equal(duplicate.action, null); assert.ok(Math.abs(one.velocity.x - two.velocity.x) < 1e-8);
  assert.equal(detector.history.length, 3);
});

test('swipe uses a 160ms window rather than 0.16ms or the oldest 520ms sample', () => {
  const detector = new GestureMotionDetector({ values: DEFAULT_GESTURE_TUNING });
  for (let t = 1000; t <= 1600; t += 20) detector.update(snapshot(.5 - (t - 1000) / 4000), t);
  assert.equal(detector.windowStart(1600).timestamp, 1440);
});

test('CAST input is rejected before entering rotation or space state; exits release existing ownership', () => {
  const machine = new GestureStateMachine(); machine.state = 'ACTIVE';
  const denied = { manipulation: false, space: false, suppressFistCollapse: false };
  assert.deepEqual(machine.update(stabilized({ pinch: true, twoHandsPinch: true }), 'ACTIVE', 1000, 2, denied), []);
  assert.equal(machine.state, 'ACTIVE');
  machine.state = 'GRAB_SPACE';
  assert.equal(machine.update(stabilized({ twoHandsPinch: true }), 'ACTIVE', 1033, 2, denied)[0].type, 'END_GRAB');
  assert.equal(machine.state, 'ACTIVE');
  machine.state = 'ROTATING';
  assert.equal(machine.update(stabilized(), 'COLLAPSING', 1066, 0)[0].type, 'END_ROTATION');
  assert.equal(machine.state, 'COLLAPSING');
});

test('priority contract remains collapse > cast > lock > rotate > target > space', () => {
  const r = new GesturePriorityResolver();
  const base = { fist: false, spellStage: 'READY', motion: { action: 'PUSH' }, locking: true, rotating: true, pointing: true, spaceGesture: true };
  assert.equal(r.resolve(base), 'CAST'); assert.equal(r.resolve({ ...base, fist: true }), 'COLLAPSE');
  assert.equal(r.resolve({ ...base, spellStage: 'NONE' }), 'LOCK');
});

test('lost hand remains paused throughout grace; no 650–900ms resume gap', () => {
  const c = new GestureChoreographyController();
  const data = { formationActive: true, state: 'ACTIVE', spellStage: 'READY', hasHand: false, fist: false, pointing: false, rotating: false, gracePeriodMs: 250 };
  c.update({ ...data, timestamp: 1000 });
  assert.equal(c.update({ ...data, timestamp: 1700 }).spellPaused, true);
  assert.equal(c.update({ ...data, timestamp: 1910 }).cancelSpell, true);
});

test('spell lifecycle enforces charge, active formation, observed CASTING and cooldown admission', () => {
  const c = new SpellCastController(), spell = SPELL_DEFINITIONS[0];
  c.lockSector(1, spell, 1000); c.update(context(), 1180); c.update(context(), 1200);
  assert.equal(c.stage, 'CHARGING');
  c.setPaused(true, 1210); c.update(context(), 1700); c.setPaused(false, 1800);
  c.update(context(), 1810); assert.equal(c.stage, 'CHARGING');
  c.update(context(), 2220); assert.equal(c.stage, 'READY');
  const events = c.update(context('PUSH'), 2230);
  assert.equal(events.filter(e => e.type === 'cast').length, 1); assert.equal(c.stage, 'CASTING');
  assert.equal(c.lockSector(7, SPELL_DEFINITIONS[1], 2231).length, 0);
  c.update(context(), 2450); assert.equal(c.stage, 'COOLDOWN');
  assert.equal(c.lockSector(7, SPELL_DEFINITIONS[1], 2451).length, 0);
  c.update(context(), 3200); assert.equal(c.stage, 'NONE');
  c.forceReady(1, spell, 3300); assert.equal(c.update({ ...context('PUSH'), formationState: 'IDLE' }, 3301).some(e => e.type === 'cast'), false);
  assert.equal(c.stage, 'NONE');
});

test('resolver accepts both wind directions but rejects unrelated actions', () => {
  const r = new SpellResolver();
  assert.ok(r.canCast(SPELL_DEFINITIONS[1], 'SWIPE_LEFT')); assert.ok(r.canCast(SPELL_DEFINITIONS[1], 'SWIPE_RIGHT'));
  assert.equal(r.canCast(SPELL_DEFINITIONS[0], 'SWIPE_LEFT'), false);
});

test('invariant checks detect orphaned transform owners and spell on inactive formation', () => {
  const s = { formation: 'IDLE', gesture: 'ACTIVE', spell: 'READY', grabbedPlate: 3, spaceGrabbed: true, lockedSector: null };
  assert.deepEqual(stateViolations(s), ['INACTIVE_FORMATION_WITH_SPELL', 'ORPHAN_SPACE_GRAB', 'ORPHAN_PLATE_GRAB', 'SPELL_WITHOUT_LOCK']);
});

test('49/51 FPS alternation does not thrash quality; sustained load downgrades and recovery upgrades', () => {
  const g = new PerformanceGovernor(); let changes = 0;
  for (let i = 0; i < 400; i++) if (g.update(1 / (i % 2 ? 49 : 51)).changed) changes++;
  assert.equal(changes, 0);
  for (let i = 0; i < 150; i++) g.update(1 / 25);
  assert.equal(g.tier, 'LOW');
  for (let i = 0; i < 500; i++) g.update(1 / 60);
  assert.equal(g.tier, 'HIGH');
});

test('ray intersection follows parent position/scale/roll and moving, rotated, split plate', () => {
  const root = new THREE.Group(), plate = new THREE.Group(); root.add(plate);
  root.position.set(1, 2, -2); root.rotation.set(1.3, .13, -.22); root.scale.setScalar(1.7);
  plate.position.set(0, .27, 0); plate.rotation.y = 1.3; plate.scale.setScalar(1.04);
  root.updateMatrixWorld(true);
  const expected = new THREE.Vector3(2.7, .117, 1.2), world = plate.localToWorld(expected.clone());
  const origin = new THREE.Vector3(0, 3, 9), ray = new THREE.Ray(origin, world.clone().sub(origin).normalize());
  assert.ok(intersectPlateLocal(ray, plate, .117).distanceTo(expected) < 1e-8);
});

test('cover-cropped mirrored preview coordinates stay aligned in a portrait viewport', () => {
  const p = landmarkToViewport(.5, .25, 600, 1000, 1280, 720);
  assert.equal(p.x, .5); assert.equal(p.y, .25);
  assert.ok(landmarkToViewport(.2, .5, 600, 1000, 1280, 720).x > 1);
});

test('pool reset clears parent/position/rotation/scale; line resolution can grow without stale attributes', () => {
  const parent = new THREE.Group(), object = new THREE.Object3D(); parent.add(object);
  object.position.set(1, 2, 3); object.rotation.z = 2; object.scale.setScalar(4);
  resetPooledTransform(object);
  assert.equal(object.parent, null); assert.equal(object.position.length(), 0); assert.equal(Math.abs(object.rotation.z), 0); assert.equal(object.scale.x, 1);
  const visuals = new SpellVisuals(), formation = new QimenFormation(); formation.reset();
  visuals.setQuality(.5, .55); visuals.cast('XUN_WIND', context(), formation); visuals.update(2, 2);
  visuals.setQuality(1, 1.28); visuals.cast('XUN_WIND', context(), formation);
  for (const item of visuals.active.filter(item => item.poolKey.endsWith('ribbon'))) assert.equal(item.object.geometry.getAttribute('position').count, Math.round(20 * 1.28) + 1);
  visuals.update(2, 4); visuals.cast('KAN_WATER', context(), formation); visuals.update(2, 6);
  visuals.cast('KAN_WATER', context(), formation);
  assert.equal(Math.abs(visuals.active.find(item => item.poolKey.endsWith('water')).object.rotation.z), 0);
  visuals.dispose(); disposeObjectTrees([formation.group]);
});

test('snap uses end-of-inertia angle, and hover cannot impersonate an active plate grab', () => {
  const f = new QimenFormation(); f.beginRotationOn(3); f.setRotationVelocity(2); f.spiritPlate.rotation.y = .1;
  f.settleRotation(); let beforeSnap = null;
  for (let i = 0; i < 600; i++) {
    const state = f.plateMotionState; f.update(1 / 60, i / 60);
    if (state === 'INERTIA' && f.plateMotionState === 'SNAPPING') beforeSnap = f.spiritPlate.rotation.y;
  }
  assert.notEqual(beforeSnap, null);
  assert.ok(Math.abs(f.spiritPlate.rotation.y / (Math.PI / 4) - Math.round(beforeSnap / (Math.PI / 4))) < .001);
  f.setHoverPlate(1); assert.equal(f.grabbedPlate, null); assert.equal(f.plateMotionState, 'IDLE');
  disposeObjectTrees([f.group]);
});

test('shared GPU resources dispose once and Audio MASTER category actually scales emitted volume', () => {
  const g = new THREE.Group(), geo = new THREE.BoxGeometry(), mat = new THREE.MeshBasicMaterial();
  g.add(new THREE.Mesh(geo, mat), new THREE.Mesh(geo, mat)); let count = 0;
  geo.addEventListener('dispose', () => count++); mat.addEventListener('dispose', () => count++);
  disposeObjectTrees([g]); assert.equal(count, 2);
  const bus = new AudioEventBus(); bus.setCategoryVolume('MASTER', .5); bus.setCategoryVolume('SPELL', .4);
  bus.on((_, detail) => assert.equal(detail.volume, .2)); bus.emit('earth_cast'); bus.dispose();
});

test('QA ignores off-session casts and starts fresh counters each session', () => {
  const qa = new RealInteractionQA(); qa.success('KUN_EARTH', 5);
  assert.deepEqual(qa.snapshot(DEFAULT_GESTURE_TUNING).spell, {});
  qa.toggleSession(1000, DEFAULT_GESTURE_TUNING); qa.attempt('KUN_EARTH'); qa.success('KUN_EARTH', 5);
  qa.session = false; qa.toggleSession(2000, DEFAULT_GESTURE_TUNING);
  assert.deepEqual(qa.snapshot(DEFAULT_GESTURE_TUNING).spell, {});
});

test('300 simulated seconds of semantic demo exercise all stages without growing the warmed pool', () => {
  const formation = new QimenFormation(), animator = new FormationAnimator(formation, () => {}), handSpace = new HandSpaceController();
  const system = new SpellSystem(formation, { pulse() {} });
  const scene = { formation, animator, handSpace, spellSystem: system, resetSpellSystem: () => system.reset(), lockSpellSector: (s, t) => system.lockSector(s, t), setPresentationCamera() {} };
  const stages = new Set(), casts = new Map();
  const director = new SpellDemoDirector(scene, { cue() {}, events: events => events.forEach(e => { if (e.type === 'stage') stages.add(e.stage); else casts.set(e.spell.id, (casts.get(e.spell.id) ?? 0) + 1); }) });
  director.start(); let warmed = null;
  for (let i = 1; i <= 18000; i++) {
    const seconds = i / 60; director.update(seconds * 1000); animator.update(1 / 60);
    if (animator.phase === 'ACTIVE' || animator.phase === 'COLLAPSING') handSpace.update(1 / 60, formation);
    formation.update(1 / 60, seconds); system.visuals.update(1 / 60, seconds);
    const owned = system.visuals.activeObjectCount + system.visuals.pooledObjectCount;
    if (i === 3600) warmed = owned;
    if (i > 3600) assert.equal(owned, warmed);
  }
  assert.equal(casts.size, 4); assert.ok([...casts.values()].every(count => count >= 10));
  for (const s of ['PREPARING', 'ALIGNED', 'CHARGING', 'READY', 'CASTING', 'COOLDOWN', 'NONE']) assert.ok(stages.has(s), s);
  system.dispose(); disposeObjectTrees([formation.group]);
});

test('flick requires sustained pinch and actual finger separation, not translating the hand', () => {
  const d = new GestureMotionDetector({ values: DEFAULT_GESTURE_TUNING });
  d.update({ ...snapshot(), pinchActive: true, normalizedPinchDistance: .17 }, 1000);
  const unarmed = d.update({ ...snapshot(.2), pinchActive: false, normalizedPinchDistance: .18 }, 1010);
  assert.notEqual(unarmed.action, 'FLICK');
  for (let t = 1200; t <= 1500; t += 30) d.update({ ...snapshot(), pinchActive: true, normalizedPinchDistance: .1 }, t);
  const release = d.update({ ...snapshot(), pinchActive: false, normalizedPinchDistance: .5 }, 1530);
  assert.equal(release.action, 'FLICK');
});

test('calibration counts complete gestures, not 3 adjacent frames, and uses evidence units', () => {
  const changes = []; const store = { update: values => changes.push(values), save() {} };
  const c = new GestureCalibration(store); c.start();
  c.update(snapshot(), { timestamp: 1000 }); c.update(snapshot(), { timestamp: 2001 });
  assert.equal(c.step, 'PUSH');
  for (let i = 0; i < 20; i++) c.update(snapshot(), { timestamp: 2100 + i * 16, action: 'PUSH', pushEvidence: .6 });
  assert.equal(c.step, 'PUSH'); assert.equal(c.samples.PUSH.length, 0);
  c.update(snapshot(), { timestamp: 2500, action: null }); assert.equal(c.samples.PUSH.length, 1);
  for (const t of [2600, 2800]) { c.update(snapshot(), { timestamp: t, action: 'PUSH', pushEvidence: .6 }); c.update(snapshot(), { timestamp: t + 50, action: null }); }
  assert.equal(c.step, 'PULL'); assert.equal(changes.at(-1).pushThreshold, .6 * .78);
  assert.equal(DEFAULT_GESTURE_TUNING.pushThreshold, .42);
});

test('buffer preserves action-time trajectory and unchanged expiry', () => {
  const b = new GestureInputBuffer(), direction = { x: -1, y: 0, z: 0 };
  b.push('SWIPE_LEFT', 1000, 1, direction); direction.x = 0;
  assert.equal(b.consume(['SWIPE_LEFT'], 1300, 360).direction.x, -1);
  b.push('PUSH', 1400); assert.equal(b.consume(['PUSH'], 1761, 360), null);
});

test('postprocess DPR follows quality and all composer/bloom render targets dispose', () => {
  globalThis.window = { innerWidth: 1280, innerHeight: 720 };
  const renderer = { getPixelRatio: () => 1.7, getSize: target => target.set(1280, 720) };
  const pipeline = new PostProcessingPipeline(renderer, new THREE.Scene(), new THREE.PerspectiveCamera(), VISUAL_QUALITY.HIGH);
  pipeline.setPixelRatio(1); pipeline.setSize(1280, 720);
  assert.equal(pipeline.composer.renderTarget1.width, 1280);
  pipeline.setQuality(VISUAL_QUALITY.HIGH);
  assert.equal(pipeline.capabilities.distortion, false); assert.equal(pipeline.capabilities.distortionRequested, true);
  const targets = [pipeline.composer.renderTarget1, pipeline.composer.renderTarget2, pipeline.bloom.renderTargetBright, ...pipeline.bloom.renderTargetsHorizontal, ...pipeline.bloom.renderTargetsVertical];
  let disposed = 0; targets.forEach(target => target.addEventListener('dispose', () => disposed++));
  pipeline.dispose(); assert.equal(disposed, targets.length);
});

test('camera pointer listener is removed on disposal and fixed presentation ignores pointer offset', () => {
  let added, removed;
  globalThis.window = { innerWidth: 1280, innerHeight: 720, addEventListener: (_, fn) => { added = fn; }, removeEventListener: (_, fn) => { removed = fn; } };
  const camera = new THREE.PerspectiveCamera(), controller = new CameraController(camera);
  controller.setFixed(true); added({ clientX: 1280, clientY: 720 }); controller.update(1 / 60, 0);
  assert.equal(camera.position.x, 0);
  controller.dispose(); assert.equal(removed, added);
});

test('legacy PUSH / TWO_HANDS_OPEN display labels do not cancel an open-palm charge', () => {
  const c = new SpellCastController(); c.lockSector(1, SPELL_DEFINITIONS[0], 1000);
  const ctx = { ...context(null), currentGesture: 'PUSH', handSnapshot: snapshot() };
  c.update(ctx, 1180); c.update(ctx, 1200); c.update({ ...ctx, currentGesture: 'TWO_HANDS_OPEN' }, 1650);
  assert.equal(c.stage, 'READY');
});
