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
import { KanPullController } from './gestureRecognition/KanPullController';
import { KanInteractionTrace } from './ui/KanInteractionTrace';
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
let cachedFocusState = sectorFocus.update(null, 0, false);
const tuning = new GestureTuningStore();
const motionDetector = new GestureMotionDetector(tuning);
const kanPull = new KanPullController();
const kanTrace = new KanInteractionTrace();
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
let cachedStabilized = smoother.update(cachedSnapshot, 0);
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
let lastCalibrationInstruction = '';
let currentInteractionTimestamp = 0;
let handWasMissing = false;
const mode = readRuntimeMode();
const showcaseMode = mode.showcase;
const showcaseCameraBackground = mode.showcaseCameraBackground;
const presentationDemoMode = mode.presentationDemo;
const realQaMode = mode.realQa;
const kunQaMode = mode.kunQa;
const kanQaMode = mode.kanQa;
const cameraDebugMode = mode.cameraDebug;
const camera = new CameraSession(video, appEvents.signal, () => disposed);
const kunTimeline = new InteractionEventTimeline();
const kunTraceEdges = new Map<string, string>();
let kunFailure = '—';
function traceKun(key: string, value: string, timestamp: number) {
  if (!kunQaMode || kunTraceEdges.get(key) === value) return;
  kunTraceEdges.set(key, value);
  kunTimeline.push(timestamp, `${key} ${value}`);
}
if (kunQaMode || kanQaMode) {
  debug.toggle(true);
  debugButton.querySelector('span')!.textContent = 'ON';
  qa.setEnabled(true);
}
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
      if (kanQaMode && event.spell?.id === 'KAN_WATER') kanTrace.event(currentInteractionTimestamp, 'SPELL_STAGE', event.stage);
      if (debug.enabled) timeline.push(currentInteractionTimestamp, `${event.stage}${event.spell ? ` ${event.spell.id}` : ''}`);
      if (event.spell?.id === 'KUN_EARTH') {
        traceKun('SPELL_STAGE', event.stage, currentInteractionTimestamp);
        if (event.stage === 'READY') kunFailure = '—';
      }
      if (!demoMode && event.stage === 'PREPARING' && event.spell) qa.attempt(event.spell.id);
      if (event.stage === 'PREPARING' && previousSpellStage !== 'PREPARING') audioBus.emit('spell_prepare');
      if (event.stage === 'READY' && previousSpellStage !== 'READY') audioBus.emit('spell_ready');
      previousSpellStage = event.stage;
      return;
    }
    audioBus.emit('spell_cast');
    if (debug.enabled) timeline.push(currentInteractionTimestamp, `CAST ${event.spell.id}`);
    if (kanQaMode && event.spell.id === 'KAN_WATER') kanTrace.event(currentInteractionTimestamp, 'CAST', 'KAN_WATER');
    if (event.spell.id === 'KUN_EARTH') traceKun('CAST', 'KUN_EARTH', currentInteractionTimestamp);
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
  kanPull.reset(); kanTrace.reset();
  cachedFocusState = sectorFocus.update(null, 0, false);
  selectedSector = null;
  previousFocusedSector = null; previousHoveredPlate = null;
  kunTraceEdges.clear(); kunFailure = '—';
  qimen.handSpace.reset(); qimen.resetSpellSystem(); qimen.spellSystem.visuals.clear();
  qimen.animator.restart();
  cachedSnapshot = recognizer.update(emptyFrame(0));
  cachedStabilized = smoother.update(cachedSnapshot, 0);
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
  // Stability advances on camera samples, never by replaying one misclassified frame on RAF ticks.
  if (freshSample) cachedStabilized = smoother.update(snapshot, sampleTimestamp);
  const stabilized = cachedStabilized;
  const confirmedFist = stabilized.fist && snapshot.fist && !snapshot.pointing && snapshot.extendedFingerCount === 0 && timestamp - sampleTimestamp <= 150;
  if (freshSample) {
    cachedMotion = motionDetector.update(snapshot, sampleTimestamp);
    cachedRotation = rotationController.update(snapshot.landmarks[0], sampleTimestamp);
  }
  // Keep temporal state ticking between camera samples, without replaying a release/push event.
  const motion = freshSample ? cachedMotion : { ...cachedMotion, action: cachedMotion.action === 'HOLD' ? 'HOLD' as const : null };
  if (stabilized.pointing) inputBuffer.push('POINT', timestamp);
  if (stabilized.pinch) inputBuffer.push('PINCH', timestamp);
  if (stabilized.openPalm) inputBuffer.push('OPEN_PALM', timestamp);
  if (confirmedFist) inputBuffer.push('FIST', timestamp);
  // KAN admission never consumes a PULL buffered before READY or during lock-return motion.
  if (motion.action && !(motion.action === 'PULL' && qimen.spellSystem.lockedSector === 4)) inputBuffer.push(motion.action, freshSample ? sampleTimestamp : timestamp, motion.intensity, motion.direction);
  if (freshSample && motion.action && motion.action !== 'HOLD') lastActionSampleAt = sampleTimestamp;
  if (!snapshot.handCount && !handWasMissing) { if (debug.enabled) timeline.push(timestamp, 'HAND_LOST'); qa.lostHand(); }
  if (debug.enabled && snapshot.handCount && handWasMissing) timeline.push(timestamp, 'HAND_REACQUIRED');
  handWasMissing = !snapshot.handCount;
  if (freshSample) {
    traceKun('GESTURE_CANDIDATE', stabilized.gestureCandidate, timestamp);
    traceKun('STABLE_GESTURE', stabilized.stableGesture, timestamp);
    traceKun('PINCH_RAW', snapshot.pinchActive ? 'ON' : 'OFF', timestamp);
    traceKun('PINCH_STABLE', stabilized.pinch ? 'ON' : 'OFF', timestamp);
  }
  const choreographyState = choreography.update({
    timestamp,
    formationActive: qimen.animator.phase === 'ACTIVE',
    state: stateMachine.state,
    spellStage: qimen.spellSystem.stage,
    hasHand: snapshot.handCount > 0,
    fist: confirmedFist,
    pointing: stabilized.pointing,
    rotating: stateMachine.state === 'ROTATING',
    gracePeriodMs: tuning.values.gracePeriodMs,
  });
  qimen.pauseSpellSystem(!snapshot.handCount && ['PREPARING', 'ALIGNED', 'CHARGING', 'READY'].includes(qimen.spellSystem.stage), timestamp);
  if (choreographyState.cancelSpell) {
    if (qimen.spellSystem.activeSpell) qa.failure(qimen.spellSystem.activeSpell.id, snapshot.handCount ? 'CANCELLED' : 'LOST_HAND');
    emitSpellEvents(qimen.cancelPreparedSpell(timestamp));
    kanPull.reset();
    stateMachine.recoverActive();
    hud.toast('术式撤销 · 阵局仍维持');
  }
  const rotation = cachedRotation;
  // Freeze the target while the index bends into a pinch; that transition is not a new ray aim.
  const pointingActive = stabilized.pointing && !snapshot.pinchActive;
  const pointingSnapshot = { ...snapshot, pointing: pointingActive };
  const hoveredPlate = qimen.updatePlateHover(pointingSnapshot, timestamp);
  if (hoveredPlate !== previousHoveredPlate) {
    if (hoveredPlate !== null) audioBus.emit('plate_hover');
    previousHoveredPlate = hoveredPlate;
  }
  const rayHit = pointingActive ? qimen.pointingHit(pointingSnapshot, motion.speed) : null;
  const candidateSector = rayHit?.sector ?? null;
  if (freshSample && !snapshot.handCount) sectorFocus.clearFocus();
  const focusState = freshSample
    ? (cachedFocusState = sectorFocus.update(candidateSector, sampleTimestamp, pointingActive))
    : cachedFocusState;
  if (kunQaMode && freshSample && pointingActive) {
    traceKun('FINGER_RAY', rayHit?.hit ? `${rayHit.reason} ${candidateSector === null ? '—' : PALACES[candidateSector]?.name}` : rayHit?.reason ?? 'NO_RAY', timestamp);
    if (!rayHit?.hit || candidateSector === null) kunFailure = `RAY_${rayHit?.reason ?? 'NO_RAY'}`;
    else if (candidateSector !== 1) kunFailure = `RAY_SECTOR_${PALACES[candidateSector]?.name ?? candidateSector}`;
  }
  if (kunQaMode && freshSample && snapshot.pointing && !stabilized.pointing) {
    kunFailure = 'POINT_WAIT_STABILITY';
    traceKun('POINT_PENDING', 'WAIT_STABILITY', timestamp);
  }
  if (kunQaMode && freshSample && pointingActive && candidateSector === 1 && focusState.stage === 'HOVER') {
    kunFailure = 'KUN_FOCUS_WAIT_STABILITY';
    traceKun('KUN_FOCUS', 'WAIT_STABILITY', timestamp);
  }
  if (focusState.stage === 'FOCUSED' && focusState.sector !== previousFocusedSector) {
    audioBus.emit('sector_focus');
    if (debug.enabled) timeline.push(timestamp, `SECTOR_FOCUS ${PALACES[focusState.sector ?? 0]?.name ?? '—'}`);
    traceKun('SECTOR_FOCUS', PALACES[focusState.sector ?? 0]?.name ?? '—', timestamp);
    if (focusState.sector === 1) kunFailure = '—';
    previousFocusedSector = focusState.sector;
  }
  if (focusState.stage !== 'FOCUSED' && focusState.stage !== 'LOCKED') previousFocusedSector = null;
  const lockAvailable = snapshot.handCount > 0 && timestamp - sampleTimestamp <= 150 &&
    sectorFocus.focusedSector !== null && qimen.animator.phase === 'ACTIVE';
  if (kunQaMode && freshSample && stabilized.pinch && !lockAvailable && selectedSector === 1 && qimen.spellSystem.lockedSector !== 1) {
    kunFailure = 'PINCH_NO_STABLE_KUN_FOCUS';
    traceKun('LOCK_FAILED', kunFailure, timestamp);
  }
  let spellMotion = kanPull.update({ snapshot, motion, timestamp: sampleTimestamp, freshSample,
    stableOpenPalm: stabilized.openPalm, stablePinch: stabilized.pinch, stablePoint: stabilized.pointing,
    rotating: stateMachine.state === 'ROTATING', spaceManipulation: stateMachine.state === 'GRAB_SPACE',
    lockedSector: qimen.spellSystem.lockedSector, activeSpell: qimen.spellSystem.activeSpell?.id ?? null,
    spellStage: qimen.spellSystem.stage, formationActive: qimen.animator.phase === 'ACTIVE', pullThreshold: tuning.values.pullThreshold });
  if (snapshot.handCount && qimen.spellSystem.activeSpell?.id !== 'KAN_WATER' && qimen.spellSystem.stage === 'READY' && (!motion.action || motion.action === 'HOLD')) {
    const spell = qimen.spellSystem.activeSpell;
    const accepted: SpellAction[] = spell?.id === 'XUN_WIND' ? ['SWIPE_LEFT', 'SWIPE_RIGHT'] : spell ? [spell.action] : [];
    const buffered = inputBuffer.consume(accepted, timestamp, tuning.values.inputBufferMs);
    if (buffered) { spellMotion = { ...motion, action: buffered.intent as SpellAction, intensity: buffered.intensity, direction: buffered.direction ?? motion.direction }; lastActionSampleAt = buffered.timestamp; }
  }
  const actionPriority = priorityResolver.resolve({
    fist: confirmedFist && choreographyState.collapseFormation,
    spellStage: qimen.spellSystem.stage,
    motion: spellMotion,
    locking: stateMachine.state === 'LOCKING' || (stabilized.pinch && lockAvailable),
    rotating: stateMachine.state === 'ROTATING',
    pointing: pointingActive || choreographyState.pointPrewarm,
    spaceGesture: stabilized.twoHandsOpen || stabilized.twoHandsPinch,
  });
  const admission = {
    manipulation: actionPriority !== 'CAST' && qimen.spellSystem.stage !== 'CASTING',
    space: !['READY', 'CASTING'].includes(qimen.spellSystem.stage) && actionPriority !== 'CAST',
    suppressFistCollapse: (snapshot.fist || stabilized.fist) && !choreographyState.collapseFormation,
    lockSector: lockAvailable,
  };
  const events = stateMachine.update(stabilized, qimen.animator.phase, timestamp, rotation.velocity, admission);

  events.forEach((event) => {
    if (event.type === 'SUMMON') {
      if (debug.enabled) timeline.push(timestamp, 'SUMMON_START');
      qimen.summonFromHand(event.snapshot.raw);
      qimen.resetSpellSystem();
      kanPull.reset();
      inputBuffer.clear();
      choreography.reset();
      previousSpellStage = qimen.spellSystem.stage;
      audioBus.emit('summon_start');
      hud.toast('张掌 · 阵局展开');
    } else if (event.type === 'COLLAPSE') {
      qimen.animator.collapse();
      qimen.endSpaceGrab();
      if (debug.enabled) timeline.push(timestamp, 'FORMATION_COLLAPSE');
      traceKun('FORMATION', 'COLLAPSE_CONFIRMED', timestamp);
      audioBus.emit('formation_collapse');
      selectedSector = null;
      sectorFocus.reset();
      cachedFocusState = sectorFocus.update(null, 0, false);
      motionDetector.reset();
      kanPull.reset();
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
      const sector = focusState.sector;
      if (sector !== null) {
        selectedSector = sector;
        if (debug.enabled) timeline.push(timestamp, `POINT ${PALACES[sector]?.name ?? sector}`);
        traceKun('POINT', PALACES[sector]?.name ?? String(sector), timestamp);
        if (focusState.stage === 'FOCUSED' || focusState.stage === 'LOCKED') qimen.formation.focus(sector, focusState.confidence);
        else qimen.formation.preview(sector, 0.32);
        hud.setPalace(PALACES[sector]);
      }
    } else if (event.type === 'LOCK') {
      const sector = sectorFocus.focusedSector;
      traceKun('LOCK_INTENT', sector === null ? 'NO_FOCUSED_SECTOR' : PALACES[sector]?.name ?? String(sector), timestamp);
      if (sector !== null) {
        const lockEvents = qimen.lockSpellSector(sector, timestamp);
        if (!lockEvents.length) {
          kunFailure = qimen.animator.phase !== 'ACTIVE' ? 'LOCK_FORMATION_INACTIVE' : 'LOCK_CASTING_OR_COOLDOWN';
          traceKun('LOCK_FAILED', kunFailure, timestamp);
          return;
        }
        selectedSector = sector;
        kanPull.consumeLock(sector);
        if (sector === 4) {
          spellMotion = { ...motion, action: motion.action === 'HOLD' ? 'HOLD' : null };
          if (kanQaMode) kanTrace.event(timestamp, 'LOCK_CYCLE_CONSUMED', 'KAN');
        }
        if (debug.enabled) timeline.push(timestamp, `LOCK ${PALACES[sector]?.name ?? sector}`);
        traceKun('LOCKED_SECTOR', PALACES[sector]?.name ?? String(sector), timestamp);
        traceKun('SPELL_CANDIDATE', qimen.spellSystem.activeSpell?.id ?? 'NONE', timestamp);
        kunFailure = '—';
        sectorFocus.lock(sector);
        qimen.formation.activate(sector, 1);
        inputBuffer.clear();
        emitSpellEvents(lockEvents);
        audioBus.emit('sector_lock');
        hud.setPalace(PALACES[sector], true);
      } else {
        kunFailure = 'LOCK_NO_FOCUSED_SECTOR';
        traceKun('LOCK_FAILED', kunFailure, timestamp);
      }
    }
  });

  // Keep the visual focus alive between state-machine event edges; lock remains a stronger state.
  if (stateMachine.state === 'POINTING' && qimen.animator.phase === 'ACTIVE' && focusState.sector !== null && focusState.stage !== 'LOCKED') {
    if (focusState.stage === 'FOCUSED') qimen.formation.focus(focusState.sector, Math.max(0.72, focusState.confidence));
    else qimen.formation.preview(focusState.sector, 0.32);
  }

  if (qimen.animator.phase === 'ACTIVE' && admission.manipulation && admission.space && !admission.suppressFistCollapse && (stabilized.twoHandsOpen || stabilized.twoHandsPinch)) {
    qimen.setSpaceScale(stabilized.handDistance, snapshot.scaleVelocity);
    if (Math.abs(snapshot.scaleVelocity) > 0.12) audioBus.emit('formation_scale');
  } else qimen.formation.setSplitProgress(0);
  qimen.updateHandAnchor(snapshot, timestamp);
  qimen.updateRotationTether(snapshot, stateMachine.state === 'ROTATING', qimen.formation.grabbedPlate);
  const spellStageBeforeUpdate = qimen.spellSystem.stage;
  const spellEvents = choreographyState.spellPaused
    ? []
    : qimen.updateSpellSystem(snapshot, spellMotion, selectedSector, timestamp, dominantHand.preferred, tuning.values.chargeScale);
  const kanDiagnostics = { ...kanPull.status };
  if (kanPull.status.castGate) lastActionSampleAt = spellMotion.timestamp;
  emitSpellEvents(spellEvents);
  if (kanPull.status.castGate) {
    kanPull.acknowledgeCast(spellEvents.some(event => event.type === 'cast' && event.spell.id === 'KAN_WATER'));
    if (kanPull.status.failure === 'CAST_REJECTED') kanDiagnostics.failure = 'CAST_REJECTED';
  }
  if (freshSample && kunQaMode && spellMotion.action === 'PUSH') {
    traceKun('PUSH', `score=${motion.pushScore.toFixed(2)} stage=${spellStageBeforeUpdate}`, timestamp);
    if (qimen.spellSystem.lockedSector !== 1) kunFailure = 'PUSH_WITHOUT_KUN_LOCK';
    else if (spellStageBeforeUpdate !== 'READY') kunFailure = `PUSH_BEFORE_READY_${spellStageBeforeUpdate}`;
    else if (!spellEvents.some((event) => event.type === 'cast' && event.spell.id === 'KUN_EARTH')) kunFailure = 'PUSH_NOT_CAST';
    else kunFailure = '—';
    if (kunFailure !== '—') traceKun('CAST_FAILED', kunFailure, timestamp);
  }
  if (freshSample) recorder.record(snapshot, spellMotion, qimen.spellSystem.stage, qimen.spellSystem.lockedSector, sampleTimestamp, kanDiagnostics);
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
  const rayLocal = rayHit?.hit ? `${rayHit.localX?.toFixed(2)}, ${rayHit.localY?.toFixed(2)}, ${rayHit.localZ?.toFixed(2)}` : '—';
  const rayAngle = rayHit?.angle === null || rayHit?.angle === undefined ? '—' : `${(rayHit.angle * 180 / Math.PI).toFixed(1)}°`;
  debug.updateQa(kanQaMode ? kanTrace.lines({ snapshot, motion, candidate: stabilized.gestureCandidate, stable: stabilized.stableGesture,
    focused: sectorFocus.focusedSector, locked: qimen.spellSystem.lockedSector,
    spell: qimen.spellSystem.activeSpell?.id ?? null, spellStage: qimen.spellSystem.stage,
    charge: qimen.spellSystem.controller.chargeProgress(timestamp, tuning.values.chargeScale),
    status: kanDiagnostics, threshold: tuning.values.pullThreshold, timestamp }) : kunQaMode ? [
    `KUN QA · Candidate ${stabilized.gestureCandidate} · Stable ${stabilized.stableGesture}`,
    `Open ${snapshot.openPalmScore.toFixed(2)} · Fist ${snapshot.fistScore.toFixed(2)} · Point ${snapshot.pointScore.toFixed(2)} · Pinch ${Math.max(0, 1 - snapshot.normalizedPinchDistance / 0.25).toFixed(2)}`,
    `Fingers extended ${snapshot.extendedFingerCount}/4 · curled ${snapshot.curledFingerCount}/4 · Fist candidate ${stabilized.fistCandidate ? 'YES' : 'NO'} · confirmed ${confirmedFist ? 'YES' : 'NO'}`,
    `Ray hit ${rayHit?.hit ? 'YES' : 'NO'} (${rayHit?.reason ?? 'NOT_POINTING'}) · local ${rayLocal} · angle ${rayAngle}`,
    `Ray sector ${candidateSector === null ? '—' : PALACES[candidateSector]?.name} · confidence ${focusState.confidence.toFixed(2)} · focus ${sectorFocus.focusedSector === null ? '—' : PALACES[sectorFocus.focusedSector]?.name}`,
    `Lock ${qimen.spellSystem.lockedSector === null ? '—' : PALACES[qimen.spellSystem.lockedSector]?.name} · Spell ${qimen.spellSystem.activeSpell?.id ?? '—'} · ${qimen.spellSystem.stage} · Charge ${(qimen.spellSystem.controller.chargeProgress(timestamp, tuning.values.chargeScale) * 100).toFixed(0)}%`,
    `PUSH score ${motion.pushScore.toFixed(2)} · evidence ${motion.pushEvidence.toFixed(2)} · Z v ${motion.depthVelocity.toFixed(2)} · scale ${snapshot.handScale.toFixed(3)} · facing ${snapshot.palmFacingCamera ? 'YES' : 'NO'} · age ${Math.max(0, timestamp - sampleTimestamp).toFixed(0)}ms`,
    `Failure ${kunFailure}`,
    ...kunTimeline.lines(timestamp).slice(-7),
  ] : [
    `QA Camera ${camera.active ? 'ON' : 'OFF'} · Hand ${latestFps.toFixed(0)}fps · Render ${qimen.renderFps.toFixed(0)}fps/${qimen.performanceTier}`,
    `Hands ${snapshot.handCount} · Dominant ${dominantHand.preferred} · Gesture ${snapshot.name} · Intent ${spellMotion.action ?? '—'}`,
    `Choreo ${choreography.stage} · GestureState ${stateMachine.state} · Hover ${hoveredPlate ?? '—'} · Focus ${focusState.sector ?? '—'} · Selected ${selectedSector ?? '—'}`,
    `Scores O:${snapshot.openPalmScore.toFixed(2)} F:${snapshot.fistScore.toFixed(2)} P:${snapshot.pointScore.toFixed(2)} Pin:${Math.max(0, 1 - snapshot.normalizedPinchDistance / 0.25).toFixed(2)} · fingers extended:${snapshot.extendedFingerCount} curled:${snapshot.curledFingerCount}`,
    `Candidate ${stabilized.gestureCandidate} · Stable ${stabilized.stableGesture} · Ray ${rayHit?.hit ? 'HIT' : rayHit?.reason ?? '—'} local ${rayLocal} angle ${rayAngle} sector ${candidateSector === null ? '—' : PALACES[candidateSector]?.name} confidence ${focusState.confidence.toFixed(2)}`,
    `Motion Push:${motion.pushScore.toFixed(2)} Pull:${motion.pullScore.toFixed(2)} Swipe:${motion.swipeScore.toFixed(2)} Flick:${motion.flickScore.toFixed(2)}`,
    `Swipe consistency:${motion.swipeDirectionConsistency.toFixed(2)} · Grace:${choreographyState.spellPaused ? 'PAUSED' : 'LIVE'} · Buffer:${tuning.values.inputBufferMs}ms`,
    `Sample age:${Math.max(0, timestamp - sampleTimestamp).toFixed(0)}ms · physical Hand/Rotate/Cast latency: unmeasured`,
    `Render draw:${renderStats.drawCalls} tri:${renderStats.triangles} geo:${renderStats.geometries} tex:${renderStats.textures} spell:${renderStats.activeSpellObjects}/${renderStats.pooledSpellObjects}`,
    ...timeline.lines(timestamp),
  ]);
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
      kanPull.reset();
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
