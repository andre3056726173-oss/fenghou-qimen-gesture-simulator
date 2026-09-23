import './styles.css';
import { HandTracker, type TrackerStatus } from './handTracking/HandTracker';
import { GestureRecognizer } from './gestureRecognition/GestureRecognizer';
import { GestureSmoother } from './gestureRecognition/GestureSmoother';
import { GestureStateMachine } from './gestureRecognition/GestureStateMachine';
import { HandRotationController } from './gestureRecognition/HandRotationController';
import { DominantHandController } from './gestureRecognition/DominantHandController';
import { QimenScene } from './threeScene/QimenScene';
import { DebugOverlay } from './ui/DebugOverlay';
import { Hud } from './ui/Hud';
import { PALACES } from './qimen/palaces';
import { AudioEventBus } from './audio/AudioEventBus';
import { SectorFocusController } from './gestureRecognition/SectorFocusController';
import { GestureMotionDetector } from './gestureRecognition/GestureMotionDetector';
import { GestureTuningStore } from './gestureRecognition/GestureTuning';
import { GestureInputBuffer } from './gestureRecognition/GestureInputBuffer';
import { GesturePriorityResolver } from './gestureRecognition/GesturePriorityResolver';
import { GestureChoreographyController } from './gestureRecognition/GestureChoreographyController';
import { GestureDebugRecorder } from './gestureRecognition/GestureDebugRecorder';
import { GestureCalibration } from './gestureRecognition/GestureCalibration';
import { RealInteractionQA } from './gestureRecognition/RealInteractionQA';
import { GestureTuningPanel } from './ui/GestureTuningPanel';
import { InteractionEventTimeline } from './ui/InteractionEventTimeline';
import { SpellDemoDirector } from './showcase/SpellDemoDirector';
import { FrameSampleGate } from './handTracking/FrameSampleGate';
import { StateInvariantGuard } from './StateInvariantGuard';
import type { SpellControllerEvent } from './spells/SpellCastController';
import type { SpellAction } from './spells/SpellContext';
import type { GestureSnapshot, TrackingFrame } from './types';
import { CameraSession } from './app/CameraSession';
import { readRuntimeMode, DEMO_MODE } from './app/runtimeMode';

const root = document.querySelector<HTMLElement>('#scene-root')!;
const video = document.querySelector<HTMLVideoElement>('#camera')!;
const startPanel = document.querySelector<HTMLElement>('#start-panel')!;
const cameraButton = document.querySelector<HTMLButtonElement>('#camera-button')!;
const demoButton = document.querySelector<HTMLButtonElement>('#demo-button')!;
const debugButton = document.querySelector<HTMLButtonElement>('#debug-button')!;
const debugCanvas = document.querySelector<HTMLCanvasElement>('#debug-canvas')!;

const qimen = new QimenScene(root);
const tracker = new HandTracker(video);
const recognizer = new GestureRecognizer();
const smoother = new GestureSmoother();
const stateMachine = new GestureStateMachine();
const rotationController = new HandRotationController();
const dominantHand = new DominantHandController('Right');
const hud = new Hud();
const debug = new DebugOverlay(debugCanvas);
const audioBus = new AudioEventBus();
const sectorFocus = new SectorFocusController();
const tuning = new GestureTuningStore();
const motionDetector = new GestureMotionDetector(tuning);
const inputBuffer = new GestureInputBuffer();
const priorityResolver = new GesturePriorityResolver();
const choreography = new GestureChoreographyController();
const recorder = new GestureDebugRecorder();
const calibration = new GestureCalibration(tuning);
const tuningPanel = new GestureTuningPanel(tuning);
const qa = new RealInteractionQA();
const timeline = new InteractionEventTimeline();
const sampleGate = new FrameSampleGate();
const invariantGuard = new StateInvariantGuard();
const appEvents = new AbortController();
let disposed = false;
let animationFrame = 0;
let lastActionSampleAt = 0;
let lastPrimaryHand: string | null = null;
let cachedSnapshot = recognizer.update({ hands: [], timestamp: 0, fps: 0 });
let cachedMotion = motionDetector.update(cachedSnapshot, 0);
let cachedRotation = rotationController.update(undefined, 0);
const unsubscribeTuning = tuning.onChange((values) => qimen.formation.setSnapDamping(values.snapDamping));
qimen.formation.setSnapDamping(tuning.values.snapDamping);

let demoMode = DEMO_MODE;
let selectedSector: number | null = null;
let latestFps = 0;
let previousHoveredPlate: number | null = null;
let previousFocusedSector: number | null = null;
let previousSpellStage = qimen.spellSystem.stage;
let ignoreFistCollapseUntilRelease = false;
let lastCalibrationInstruction = '';
let currentInteractionTimestamp = 0;
let handWasMissing = false;
const mode = readRuntimeMode();
const showcaseMode = mode.showcase;
const showcaseCameraBackground = mode.showcaseCameraBackground;
const presentationDemoMode = mode.presentationDemo;
const realQaMode = mode.realQa;
const cameraDebugMode = mode.cameraDebug;
const camera = new CameraSession(video, appEvents.signal, () => disposed);
if (cameraDebugMode) document.body.classList.add('camera-debug');
if (showcaseMode) {
  document.body.classList.add('showcase-mode');
  if (!showcaseCameraBackground) document.body.classList.add('showcase-dark');
}

const emptyFrame = (timestamp: number): TrackingFrame => ({ hands: [], timestamp, fps: 0 });

function activateExperience(message: string) {
  startPanel.classList.add('dismissed');
  document.body.classList.add('experience-active');
  if (message) hud.toast(message);
}

function emitSpellEvents(events: SpellControllerEvent[]) {
  events.forEach((event) => {
    if (event.type === 'stage') {
      if (debug.enabled) timeline.push(currentInteractionTimestamp, `${event.stage}${event.spell ? ` ${event.spell.id}` : ''}`);
      if (!demoMode && event.stage === 'PREPARING' && event.spell) qa.attempt(event.spell.id);
      if (event.stage === 'PREPARING' && previousSpellStage !== 'PREPARING') audioBus.emit('spell_prepare');
      if (event.stage === 'READY' && previousSpellStage !== 'READY') audioBus.emit('spell_ready');
      previousSpellStage = event.stage;
      return;
    }
    audioBus.emit('spell_cast');
    if (debug.enabled) timeline.push(currentInteractionTimestamp, `CAST ${event.spell.id}`);
    if (!demoMode) qa.success(event.spell.id, Math.max(0, currentInteractionTimestamp - lastActionSampleAt));
    if (event.spell.id === 'KUN_EARTH') audioBus.emit('earth_cast');
    if (event.spell.id === 'XUN_WIND') audioBus.emit('wind_cast');
    if (event.spell.id === 'ZHEN_LIGHTNING') audioBus.emit('lightning_cast');
    if (event.spell.id === 'KAN_WATER') audioBus.emit('water_cast');
    hud.toast(`${event.spell.name} · 术式成立`);
  });
}

function debugCastSpell(sector: number, timestamp = performance.now()) {
  emitSpellEvents(qimen.debugCastSpell(sector, timestamp));
}

const spellDemoDirector = new SpellDemoDirector(qimen, {
  events: emitSpellEvents,
  cue: (label) => hud.toast(label),
});

function resetInteractionRuntime() {
  stateMachine.reset(); smoother.reset(); recognizer.reset(); motionDetector.reset(); rotationController.reset();
  choreography.reset(); sectorFocus.reset(); inputBuffer.clear(); sampleGate.reset();
  selectedSector = null; ignoreFistCollapseUntilRelease = false;
  previousFocusedSector = null; previousHoveredPlate = null;
  qimen.handSpace.reset(); qimen.resetSpellSystem(); qimen.spellSystem.visuals.clear();
  qimen.animator.restart();
  cachedSnapshot = recognizer.update(emptyFrame(0));
  cachedMotion = motionDetector.update(cachedSnapshot, 0);
  cachedRotation = rotationController.update(undefined, 0);
}

async function startCamera(preserveDemo = false) {
  if (disposed || cameraButton.disabled) return;
  camera.stop();
  const requestId = camera.currentRequest;
  cameraButton.disabled = true;
  cameraButton.textContent = '正在启阵…';
  try {
    await camera.open(requestId);
    tracker.setVideoSource(video);
    if (!preserveDemo) await tracker.initialize((status: TrackerStatus, message: string) => hud.setTrackerStatus(status, message));
    camera.assertCurrent(requestId);
    resetInteractionRuntime();
    qimen.setPresentationCamera(preserveDemo);
    demoMode = preserveDemo;
    if (!preserveDemo) document.body.classList.remove('demo-mode');
    if (preserveDemo) spellDemoDirector.start();
    else qimen.animator.restart();
    sectorFocus.reset();
    activateExperience(preserveDemo ? '展示模式 · 摄像头背景已就绪' : '摄像头已就绪 · 张开手掌召唤阵法');
    if (!preserveDemo) hud.toast('摄像头已固定 · 请确认镜头中能看到双手');
  } catch (error) {
    if (disposed || requestId !== camera.currentRequest) return;
    camera.release();
    console.error(error);
    hud.setTrackerStatus(tracker.status, tracker.status === 'denied' ? '权限被拒 · 可用演示' : '模型载入失败 · 可用演示');
    if (preserveDemo) spellDemoDirector.start();
    else hud.toast('摄像头未启用，可检查设备或权限');
  } finally {
    cameraButton.disabled = false;
    cameraButton.textContent = '启用摄像头';
  }
}

cameraButton.addEventListener('click', () => { void startCamera(); }, { signal: appEvents.signal });
demoButton.addEventListener('click', () => {
  camera.stop();
  resetInteractionRuntime();
  qimen.setPresentationCamera(true);
  demoMode = true;
  document.body.classList.add('demo-mode');
  activateExperience('纯阵局演示');
  qimen.animator.startDemo();
}, { signal: appEvents.signal });

debugButton.addEventListener('click', () => {
  if (showcaseMode) return;
  const enabled = debug.toggle();
  debugButton.querySelector('span')!.textContent = enabled ? 'ON' : 'OFF';
  tuningPanel.setVisible(enabled);
  qa.setEnabled(enabled && realQaMode);
}, { signal: appEvents.signal });

window.addEventListener('keydown', (event) => {
  if (showcaseMode || event.repeat || (event.target instanceof HTMLElement && ['INPUT', 'TEXTAREA'].includes(event.target.tagName))) return;
  if (event.code === 'KeyD') debugButton.click();
  if (!debug.enabled) return;
  const debugSector = event.code === 'Digit1' ? 1 : event.code === 'Digit2' ? 7 : event.code === 'Digit3' ? 6 : event.code === 'Digit4' ? 4 : null;
  if (debugSector !== null) debugCastSpell(debugSector);
  if (event.code === 'KeyR') {
    const result = recorder.toggle(performance.now());
    hud.toast(result === 'started' ? '手势数据录制：10 秒' : '手势数据已导出 JSON');
  }
  if (event.code === 'KeyC') {
    lastCalibrationInstruction = calibration.start();
    hud.toast(lastCalibrationInstruction);
  }
  if (event.code === 'KeyT') {
    const active = qa.toggleSession(performance.now(), tuning.values);
    hud.toast(active ? '真人 QA Session 开始' : 'QA 报告已导出');
  }
}, { signal: appEvents.signal });

function handleGestureFrame(snapshot: GestureSnapshot, timestamp: number, sampleTimestamp: number, freshSample: boolean) {
  currentInteractionTimestamp = timestamp;
  const stabilized = smoother.update(snapshot, timestamp);
  if (freshSample) {
    cachedMotion = motionDetector.update(snapshot, sampleTimestamp);
    cachedRotation = rotationController.update(snapshot.landmarks[0], sampleTimestamp);
  }
  // Keep temporal state ticking between camera samples, without replaying a release/push event.
  const motion = freshSample ? cachedMotion : { ...cachedMotion, action: cachedMotion.action === 'HOLD' ? 'HOLD' as const : null };
  if (stabilized.pointing) inputBuffer.push('POINT', timestamp);
  if (stabilized.pinch) inputBuffer.push('PINCH', timestamp);
  if (stabilized.openPalm) inputBuffer.push('OPEN_PALM', timestamp);
  if (snapshot.fist) inputBuffer.push('FIST', timestamp);
  if (motion.action) inputBuffer.push(motion.action, freshSample ? sampleTimestamp : timestamp, motion.intensity, motion.direction);
  if (freshSample && motion.action && motion.action !== 'HOLD') lastActionSampleAt = sampleTimestamp;
  if (!snapshot.handCount && !handWasMissing) { if (debug.enabled) timeline.push(timestamp, 'HAND_LOST'); qa.lostHand(); }
  if (debug.enabled && snapshot.handCount && handWasMissing) timeline.push(timestamp, 'HAND_REACQUIRED');
  handWasMissing = !snapshot.handCount;
  const choreographyState = choreography.update({
    timestamp,
    formationActive: qimen.animator.phase === 'ACTIVE',
    state: stateMachine.state,
    spellStage: qimen.spellSystem.stage,
    hasHand: snapshot.handCount > 0,
    fist: snapshot.fist,
    pointing: stabilized.pointing,
    rotating: stateMachine.state === 'ROTATING',
    gracePeriodMs: tuning.values.gracePeriodMs,
  });
  qimen.pauseSpellSystem(!snapshot.handCount && ['PREPARING', 'ALIGNED', 'CHARGING', 'READY'].includes(qimen.spellSystem.stage), timestamp);
  if (choreographyState.cancelSpell) {
    if (qimen.spellSystem.activeSpell) qa.failure(qimen.spellSystem.activeSpell.id, snapshot.handCount ? 'CANCELLED' : 'LOST_HAND');
    emitSpellEvents(qimen.cancelPreparedSpell(timestamp));
    stateMachine.recoverActive();
    ignoreFistCollapseUntilRelease = snapshot.fist;
    hud.toast('术式撤销 · 阵局仍维持');
  }
  if (choreographyState.collapseFormation && qimen.animator.phase === 'ACTIVE') {
    qimen.animator.collapse();
    qimen.resetSpellSystem();
    qimen.endSpaceGrab();
    selectedSector = null;
    sectorFocus.reset();
    inputBuffer.clear();
    ignoreFistCollapseUntilRelease = false;
    audioBus.emit('formation_collapse');
  }
  const rotation = cachedRotation;
  const pointingSnapshot = { ...snapshot, pointing: stabilized.pointing };
  const hoveredPlate = qimen.updatePlateHover(pointingSnapshot, timestamp);
  if (hoveredPlate !== previousHoveredPlate) {
    if (hoveredPlate !== null) audioBus.emit('plate_hover');
    previousHoveredPlate = hoveredPlate;
  }
  const candidateSector = stabilized.pointing ? qimen.pointingSector(pointingSnapshot, motion.speed) : null;
  const focusState = sectorFocus.update(candidateSector, timestamp, stabilized.pointing);
  if (focusState.stage === 'FOCUSED' && focusState.sector !== previousFocusedSector) {
    audioBus.emit('sector_focus');
    if (debug.enabled) timeline.push(timestamp, `SECTOR_FOCUS ${PALACES[focusState.sector ?? 0]?.name ?? '—'}`);
    if (qimen.spellSystem.activeSpell && focusState.sector !== qimen.spellSystem.lockedSector) emitSpellEvents(qimen.cancelPreparedSpell(timestamp));
    previousFocusedSector = focusState.sector;
  }
  if (focusState.stage !== 'FOCUSED' && focusState.stage !== 'LOCKED') previousFocusedSector = null;
  let spellMotion = motion;
  if (snapshot.handCount && qimen.spellSystem.stage === 'READY' && (!motion.action || motion.action === 'HOLD')) {
    const spell = qimen.spellSystem.activeSpell;
    const accepted: SpellAction[] = spell?.id === 'XUN_WIND' ? ['SWIPE_LEFT', 'SWIPE_RIGHT'] : spell ? [spell.action] : [];
    const buffered = inputBuffer.consume(accepted, timestamp, tuning.values.inputBufferMs);
    if (buffered) { spellMotion = { ...motion, action: buffered.intent as SpellAction, intensity: buffered.intensity, direction: buffered.direction ?? motion.direction }; lastActionSampleAt = buffered.timestamp; }
  }
  const actionPriority = priorityResolver.resolve({
    fist: snapshot.fist,
    spellStage: qimen.spellSystem.stage,
    motion: spellMotion,
    locking: stateMachine.state === 'LOCKING',
    rotating: stateMachine.state === 'ROTATING',
    pointing: stabilized.pointing || choreographyState.pointPrewarm,
    spaceGesture: stabilized.twoHandsOpen || stabilized.twoHandsPinch,
  });
  const admission = {
    manipulation: actionPriority !== 'CAST' && qimen.spellSystem.stage !== 'CASTING',
    space: !['READY', 'CASTING'].includes(qimen.spellSystem.stage) && actionPriority !== 'CAST',
    suppressFistCollapse: snapshot.fist && (ignoreFistCollapseUntilRelease || ['PREPARING', 'ALIGNED', 'CHARGING', 'READY'].includes(qimen.spellSystem.stage)),
  };
  const events = stateMachine.update(stabilized, qimen.animator.phase, timestamp, rotation.velocity, admission);

  events.forEach((event) => {
    if (event.type === 'SUMMON') {
      if (debug.enabled) timeline.push(timestamp, 'SUMMON_START');
      qimen.summonFromHand(event.snapshot.raw);
      qimen.resetSpellSystem();
      inputBuffer.clear();
      choreography.reset();
      previousSpellStage = qimen.spellSystem.stage;
      audioBus.emit('summon_start');
      hud.toast('张掌 · 阵局展开');
    } else if (event.type === 'COLLAPSE') {
      if (ignoreFistCollapseUntilRelease && snapshot.fist) {
        stateMachine.recoverActive();
        return;
      }
      qimen.animator.collapse();
      qimen.endSpaceGrab();
      if (debug.enabled) timeline.push(timestamp, 'FORMATION_COLLAPSE');
      audioBus.emit('formation_collapse');
      selectedSector = null;
      sectorFocus.reset();
      motionDetector.reset();
      qimen.resetSpellSystem();
      inputBuffer.clear();
      choreography.reset();
      previousSpellStage = qimen.spellSystem.stage;
      hud.toast('握拳 · 阵局收束');
    } else if (event.type === 'BEGIN_ROTATION') {
      qimen.formation.beginRotationOn(hoveredPlate ?? 3);
      if (debug.enabled) timeline.push(timestamp, `GRAB Plate ${hoveredPlate ?? 3}`);
      audioBus.emit('plate_grab');
    } else if (event.type === 'ROTATE') {
      qimen.formation.setRotationVelocity(event.velocity);
      if (debug.enabled) timeline.push(timestamp, `ROTATE ${event.velocity.toFixed(2)}`);
      audioBus.emit('plate_rotate');
    } else if (event.type === 'END_ROTATION') {
      if (qimen.animator.phase === 'ACTIVE') qimen.formation.settleRotation();
    } else if (event.type === 'SCALE') {
      // Both open/pinch scaling are applied once in the shared space-update block below.
    } else if (event.type === 'BEGIN_GRAB') {
      qimen.beginSpaceGrab(event.snapshot.raw);
      audioBus.emit('plate_grab');
    } else if (event.type === 'MOVE_GRAB') {
      qimen.moveSpaceGrab(event.snapshot.raw);
    } else if (event.type === 'END_GRAB') {
      qimen.endSpaceGrab();
    } else if (event.type === 'POINT') {
      const sector = focusState.sector ?? qimen.pointingSector(event.snapshot.raw);
      if (sector !== null) {
        selectedSector = sector;
        if (debug.enabled) timeline.push(timestamp, `POINT ${PALACES[sector]?.name ?? sector}`);
        if (focusState.stage === 'FOCUSED' || focusState.stage === 'LOCKED') qimen.formation.focus(sector, focusState.confidence);
        else qimen.formation.preview(sector, 0.32);
        hud.setPalace(PALACES[sector]);
      }
    } else if (event.type === 'LOCK') {
      const sector = sectorFocus.focusedSector ?? selectedSector ?? qimen.pointingSector(event.snapshot.raw);
      if (sector !== null) {
        const lockEvents = qimen.lockSpellSector(sector, timestamp);
        if (!lockEvents.length) return;
        selectedSector = sector;
        if (debug.enabled) timeline.push(timestamp, `LOCK ${PALACES[sector]?.name ?? sector}`);
        sectorFocus.lock(sector);
        qimen.formation.activate(sector, 1);
        inputBuffer.clear();
        emitSpellEvents(lockEvents);
        audioBus.emit('sector_lock');
        hud.setPalace(PALACES[sector], true);
      }
    }
  });

  // Keep the visual focus alive between state-machine event edges; lock remains a stronger state.
  if (stateMachine.state === 'POINTING' && qimen.animator.phase === 'ACTIVE' && focusState.sector !== null && focusState.stage !== 'LOCKED') {
    if (focusState.stage === 'FOCUSED') qimen.formation.focus(focusState.sector, Math.max(0.72, focusState.confidence));
    else qimen.formation.preview(focusState.sector, 0.32);
  }

  if (!snapshot.fist && !stabilized.fist) ignoreFistCollapseUntilRelease = false;

  if (qimen.animator.phase === 'ACTIVE' && admission.manipulation && admission.space && !admission.suppressFistCollapse && (stabilized.twoHandsOpen || stabilized.twoHandsPinch)) {
    qimen.setSpaceScale(stabilized.handDistance, snapshot.scaleVelocity);
    if (Math.abs(snapshot.scaleVelocity) > 0.12) audioBus.emit('formation_scale');
  } else qimen.formation.setSplitProgress(0);
  qimen.updateHandAnchor(snapshot, timestamp);
  qimen.updateRotationTether(snapshot, stateMachine.state === 'ROTATING', qimen.formation.grabbedPlate);
  const spellEvents = choreographyState.spellPaused
    ? []
    : qimen.updateSpellSystem(snapshot, spellMotion, selectedSector, timestamp, dominantHand.preferred, tuning.values.chargeScale);
  emitSpellEvents(spellEvents);
  if (freshSample) recorder.record(snapshot, spellMotion, qimen.spellSystem.stage, qimen.spellSystem.lockedSector, sampleTimestamp);
  if (qa.session) qa.setEnvironment({
    camera: camera.label,
    cameraFps: camera.frameRate,
    handTrackingFps: latestFps,
    renderFps: qimen.renderFps,
    detectedHands: snapshot.handCount,
    choreography: choreography.stage,
    spellState: qimen.spellSystem.stage,
  });
  const calibrationInstruction = freshSample ? calibration.update(snapshot, motion) : null;
  if (calibrationInstruction && calibrationInstruction !== lastCalibrationInstruction) {
    lastCalibrationInstruction = calibrationInstruction;
    hud.toast(calibrationInstruction);
  }
  if (!debug.enabled) return;
  debug.updateSpell({
    lockedSector: qimen.spellSystem.lockedSector === null ? '—' : (PALACES[qimen.spellSystem.lockedSector]?.name ?? String(qimen.spellSystem.lockedSector)),
    spellCandidate: selectedSector === null ? '—' : (PALACES[selectedSector]?.name ?? String(selectedSector)),
    spellState: qimen.spellSystem.stage,
    castGesture: motion.action ?? snapshot.name,
    palmVelocity: `${motion.velocity.x.toFixed(2)}, ${motion.velocity.y.toFixed(2)}, ${motion.velocity.z.toFixed(2)}`,
    depthVelocity: motion.depthVelocity.toFixed(2),
    swipeVelocity: motion.swipeVelocity.toFixed(2),
    holdTime: `${Math.round(motion.holdTime)}ms`,
    cooldown: `${Math.round(qimen.spellSystem.controller.cooldownRemaining(timestamp))}ms`,
    activeSpell: qimen.spellSystem.activeSpell?.name ?? '—',
  });
  const renderStats = qimen.getPerformanceDebug();
  debug.updateQa(debug.enabled ? [
    `QA Camera ${camera.active ? 'ON' : 'OFF'} · Hand ${latestFps.toFixed(0)}fps · Render ${qimen.renderFps.toFixed(0)}fps/${qimen.performanceTier}`,
    `Hands ${snapshot.handCount} · Dominant ${dominantHand.preferred} · Gesture ${snapshot.name} · Intent ${spellMotion.action ?? '—'}`,
    `Choreo ${choreography.stage} · GestureState ${stateMachine.state} · Hover ${hoveredPlate ?? '—'} · Focus ${focusState.sector ?? '—'} · Selected ${selectedSector ?? '—'}`,
    `Scores O:${snapshot.openPalm ? '1.00' : '0.00'} F:${snapshot.fist ? '1.00' : '0.00'} P:${snapshot.pointing ? '1.00' : '0.00'} Pin:${Math.max(0, 1 - snapshot.normalizedPinchDistance / 0.25).toFixed(2)}`,
    `Motion Push:${motion.pushScore.toFixed(2)} Pull:${motion.pullScore.toFixed(2)} Swipe:${motion.swipeScore.toFixed(2)} Flick:${motion.flickScore.toFixed(2)}`,
    `Swipe consistency:${motion.swipeDirectionConsistency.toFixed(2)} · Grace:${choreographyState.spellPaused ? 'PAUSED' : 'LIVE'} · Buffer:${tuning.values.inputBufferMs}ms`,
    `Sample age:${Math.max(0, timestamp - sampleTimestamp).toFixed(0)}ms · physical Hand/Rotate/Cast latency: unmeasured`,
    `Render draw:${renderStats.drawCalls} tri:${renderStats.triangles} geo:${renderStats.geometries} tex:${renderStats.textures} spell:${renderStats.activeSpellObjects}/${renderStats.pooledSpellObjects}`,
    ...timeline.lines(timestamp),
  ] : []);
  hud.update(snapshot, latestFps);
  camera.updateDiagnostics();
}

function loop(timestamp: number) {
  if (disposed) return;
  currentInteractionTimestamp = timestamp;
  const detected = tracker.status === 'ready' && !demoMode ? tracker.detect(timestamp) : emptyFrame(timestamp);
  const frame = detected.hands.length > 1 ? { ...detected, hands: dominantHand.order(detected.hands) } : detected;
  latestFps = frame.fps;
  const freshSample = sampleGate.accept(frame);
  if (freshSample) {
    const primary = frame.hands[0]?.handedness ?? null;
    if (primary && lastPrimaryHand && primary !== lastPrimaryHand) {
      recognizer.reset(); motionDetector.reset(); rotationController.reset(); smoother.reset(); inputBuffer.clear();
    }
    if (primary) lastPrimaryHand = primary;
    cachedSnapshot = recognizer.update(frame);
  }
  const snapshot = cachedSnapshot;
  if (!demoMode) {
    handleGestureFrame(snapshot, timestamp, frame.timestamp, freshSample);
  }
  else qimen.updateHandAnchor(snapshot, timestamp);
  if (presentationDemoMode && demoMode) spellDemoDirector.update(timestamp);
  const phaseBeforeUpdate = qimen.animator.phase;
  const plateMotionBeforeUpdate = qimen.formation.plateMotionState;
  qimen.update();
  if (plateMotionBeforeUpdate === 'SNAPPING' && qimen.formation.plateMotionState === 'IDLE') { audioBus.emit('plate_snap'); qimen.cast(); }
  if (!demoMode && (import.meta.env.DEV || debug.enabled)) invariantGuard.check({
    formation: qimen.animator.phase, gesture: stateMachine.state, spell: qimen.spellSystem.stage,
    grabbedPlate: qimen.formation.grabbedPlate, spaceGrabbed: qimen.handSpace.isGrabbed, lockedSector: qimen.spellSystem.lockedSector,
  });
  if (debug.enabled) {
    const stats = qimen.getPerformanceDebug();
    debug.updatePerformance(`Draw calls ${stats.drawCalls} · triangles ${stats.triangles} · geometries ${stats.geometries} · textures ${stats.textures} · spells ${stats.activeSpellObjects} · pool ${stats.pooledSpellObjects}`);
    debug.draw(snapshot);
  }
  qa.frame(timestamp, qimen.renderFps);
  if (phaseBeforeUpdate === 'SUMMONING' && qimen.animator.phase === 'ACTIVE') {
    audioBus.emit('summon_lock');
    if (debug.enabled) timeline.push(timestamp, 'SUMMON_LOCK');
  }
  animationFrame = requestAnimationFrame(loop);
}

hud.setTrackerStatus('idle', '等待摄像头');
animationFrame = requestAnimationFrame(loop);

function disposeApp() {
  if (disposed) return;
  disposed = true;
  cancelAnimationFrame(animationFrame);
  appEvents.abort(); camera.stop(); tracker.dispose(); qimen.dispose(); debug.dispose(); tuningPanel.dispose(); hud.dispose(); audioBus.dispose(); unsubscribeTuning();
}
window.addEventListener('pagehide', (event) => { if (!event.persisted) disposeApp(); }, { signal: appEvents.signal });
import.meta.hot?.dispose(disposeApp);

if (presentationDemoMode) {
  demoMode = true;
  if (!showcaseMode) document.body.classList.add('demo-mode');
  activateExperience('术式演示 · 坤巽震坎');
  spellDemoDirector.start();
  if (showcaseCameraBackground) void startCamera(true);
} else if (mode.formationDemo) demoButton.click();
if (cameraDebugMode || (!presentationDemoMode && !mode.formationDemo)) void startCamera();
