import * as THREE from 'three';
import type { GestureSnapshot, Landmark, PalaceDefinition } from '../types';
import type { MotionState } from '../gestureRecognition/GestureMotionDetector';
import type { SpellContext } from '../spells/SpellContext';
import type { SpellControllerEvent } from '../spells/SpellCastController';
import { SpellSystem } from '../spells/SpellSystem';
import { QimenFormation } from '../qimen/QimenFormation';
import { FormationAnimator } from '../qimen/FormationAnimator';
import { CameraController } from './CameraController';
import { HandSpaceController } from './HandSpaceController';
import { PerformanceGovernor, type PerformanceTier } from './PerformanceGovernor';
import { HandOcclusionSystem } from './HandOcclusionSystem';
import { PostProcessingPipeline } from './PostProcessingPipeline';
import { VISUAL_QUALITY, qualityFromPerformanceTier, type VisualQualityLevel } from './VisualQualityConfig';
import { landmarkToViewport, screenDirectionToSpell } from '../handTracking/CameraCoordinates';
import { FORMATION_STYLE, FRONT_FORMATION_CENTER, FRONT_MAX_SPACE_SCALE, FRONT_MIN_SPACE_SCALE } from '../qimen/FormationStyle';
import { intersectPlateLocal, sectorFromLocalPoint } from '../qimen/FormationPicking';
import { disposeObjectTrees } from './ResourceLifecycle';

/** Chest-front floating formation stage. Hand landmarks are projected into this space, never onto a floor. */
export class QimenScene {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(45, 1, 0.1, 120);
  readonly renderer: THREE.WebGLRenderer;
  readonly formation = new QimenFormation();
  readonly animator: FormationAnimator;
  readonly handSpace = new HandSpaceController();
  readonly spellSystem: SpellSystem;
  private readonly cameraController: CameraController;
  private readonly post: PostProcessingPipeline;
  readonly handOcclusion = new HandOcclusionSystem();
  private readonly performanceGovernor = new PerformanceGovernor();
  private readonly timer = new THREE.Timer();
  private readonly dust: THREE.Points;
  private readonly ground: THREE.Mesh;
  private readonly handCore: THREE.Mesh;
  private readonly handTrace: THREE.Line;
  private readonly supportTrace: THREE.Line;
  private readonly raycaster = new THREE.Raycaster();
  private readonly formationPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly tetherLines: THREE.Line[] = [];
  private tetherOpacity = 0;
  private tetherTargetOpacity = 0;
  private stablePointingSector: number | null = null;
  private stableHoveredPlate: number | null = null;
  private hoverCandidate: number | null = null;
  private hoverCandidateSince = 0;
  private lastHandSeenAt = 0;
  renderFps = 60;
  performanceTier: PerformanceTier = 'HIGH';
  visualQuality: VisualQualityLevel = 'HIGH';
  private readonly onResize = () => this.resize();
  private disposed = false;

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, VISUAL_QUALITY.HIGH.pixelRatioCap));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.9;
    container.appendChild(this.renderer.domElement);

    this.scene.background = null;
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.info.autoReset = false;
    this.scene.fog = new THREE.FogExp2(0x030907, 0.035);
    this.timer.connect(document);
    this.cameraController = new CameraController(this.camera);
    this.animator = new FormationAnimator(this.formation, (cue) => this.cameraController.cue(cue));
    this.spellSystem = new SpellSystem(this.formation, this.cameraController);

    this.ground = new THREE.Mesh(
      new THREE.PlaneGeometry(46, 46),
      new THREE.MeshBasicMaterial({ color: 0x020504, transparent: true, opacity: 0.16, depthWrite: true }),
    );
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.set(0, -0.14, -1.2);
    this.ground.visible = FORMATION_STYLE !== 'FRONT_CIRCLE';
    this.dust = this.createDust();
    this.handCore = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 16, 10),
      new THREE.MeshBasicMaterial({ color: 0xa6eee0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.handTrace = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineBasicMaterial({ color: 0x8adbc7, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.supportTrace = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineBasicMaterial({ color: 0xd8b562, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    for (let i = 0; i < 3; i += 1) {
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
        new THREE.LineBasicMaterial({ color: i === 1 ? 0xd8b562 : 0x8adbc7, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      this.tetherLines.push(line);
    }
    this.scene.add(this.ground, this.dust, this.formation.group, this.spellSystem.group, this.handOcclusion.group, this.handTrace, this.supportTrace, this.handCore, ...this.tetherLines);

    this.post = new PostProcessingPipeline(this.renderer, this.scene, this.camera, VISUAL_QUALITY.HIGH);
    this.spellSystem.setVisualQuality(VISUAL_QUALITY.HIGH);
    window.addEventListener('resize', this.onResize);
    this.resize();
  }

  private createDust() {
    const count = window.innerWidth < 700 ? 180 : 360;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      const radius = 3 + Math.random() * 17;
      const angle = Math.random() * Math.PI * 2;
      positions[i * 3] = Math.cos(angle) * radius;
      positions[i * 3 + 1] = 0.02 + Math.random() * 1.6;
      positions[i * 3 + 2] = Math.sin(angle) * radius - 1.4;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0x7b9f91, size: 0.026, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending }));
  }

  cast(_palace?: PalaceDefinition) {
    this.cameraController.pulse(0.06);
  }

  /** Visual only; safe for a future menu or PerformanceGovernor to call. */
  setVisualQuality(level: VisualQualityLevel) {
    this.visualQuality = level;
    const quality = VISUAL_QUALITY[level];
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality.pixelRatioCap));
    this.post.setPixelRatio(this.renderer.getPixelRatio());
    this.post.setQuality(quality);
    this.spellSystem.setVisualQuality(quality);
    this.dust.visible = level !== 'LOW';
    this.resize();
  }

  getPerformanceDebug() {
    const info = this.renderer.info;
    return {
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      activeSpellObjects: this.spellSystem.visuals.activeObjectCount,
      pooledSpellObjects: this.spellSystem.visuals.pooledObjectCount,
      post: this.post.capabilities,
    };
  }

  lockSpellSector(sector: number | null, timestamp: number) {
    if (this.animator.phase !== 'ACTIVE') return [];
    return this.spellSystem.lockSector(sector, timestamp);
  }

  resetSpellSystem() {
    this.spellSystem.reset();
    this.formation.clearSpellPreparation();
  }

  pauseSpellSystem(paused: boolean, timestamp: number) {
    this.spellSystem.setPaused(paused, timestamp);
  }

  cancelPreparedSpell(timestamp: number) {
    this.formation.clearSpellPreparation();
    return this.spellSystem.cancel(timestamp);
  }

  debugCastSpell(sector: number, timestamp: number) {
    if (this.animator.phase !== 'ACTIVE') return [];
    this.formation.activate(sector, 1);
    return this.spellSystem.debugCast(sector, timestamp);
  }

  createSpellContext(snapshot: GestureSnapshot, motion: MotionState, selectedSector: number | null, dominant: 'Left' | 'Right' | 'Unknown' = 'Right', chargeScale = 1): SpellContext {
    const [earthPlateAngle, humanPlateAngle, heavenPlateAngle, spiritPlateAngle] = this.formation.plateAngles;
    return {
      selectedSector,
      lockedSector: this.spellSystem.lockedSector,
      earthPlateAngle,
      humanPlateAngle,
      heavenPlateAngle,
      spiritPlateAngle,
      dominantHand: dominant,
      currentGesture: snapshot.name,
      handVelocity: motion.velocity,
      handDepthVelocity: motion.depthVelocity,
      formationScale: this.formation.formationScale,
      formationState: this.animator.phase,
      castStage: this.spellSystem.stage,
      action: motion.action,
      castIntensity: motion.intensity,
      castDirection: screenDirectionToSpell(motion.direction),
      chargeScale,
      handSnapshot: snapshot,
    };
  }

  updateSpellSystem(snapshot: GestureSnapshot, motion: MotionState, selectedSector: number | null, timestamp: number, dominant: 'Left' | 'Right' | 'Unknown' = 'Right', chargeScale = 1): SpellControllerEvent[] {
    const handWorld = snapshot.palmCenter ? this.spacePoint(snapshot.palmCenter.x, snapshot.palmCenter.y, snapshot.palmCenter.z) : null;
    const context = this.createSpellContext(snapshot, motion, selectedSector, dominant, chargeScale);
    const events = this.spellSystem.update(context, motion, timestamp, 0, timestamp / 1000, handWorld);
    return events;
  }

  summonFromHand(snapshot: GestureSnapshot) {
    const origin = snapshot.palmCenter ? this.spacePoint(snapshot.palmCenter.x, snapshot.palmCenter.y, snapshot.palmCenter.z) : this.handSpace.target.center.clone();
    const target = FRONT_FORMATION_CENTER.clone();
    this.handSpace.reset();
    this.handSpace.setSummonTarget(target);
    this.animator.summon(origin, target);
  }

  beginSpaceGrab(snapshot: GestureSnapshot) {
    const centers = this.spacePoints(snapshot);
    if (centers.length < 2) return;
    const midpoint = centers[0].clone().add(centers[1]).multiplyScalar(0.5);
    this.handSpace.beginGrab(midpoint, snapshot.handAxisAngle);
    this.formation.pulseGrab();
  }

  moveSpaceGrab(snapshot: GestureSnapshot) {
    const centers = this.spacePoints(snapshot);
    if (centers.length < 2) return;
    const midpoint = centers[0].clone().add(centers[1]).multiplyScalar(0.5);
    this.handSpace.moveGrab(midpoint, snapshot.handAxisAngle);
  }

  endSpaceGrab() {
    this.handSpace.endGrab();
  }

  setSpaceScale(distance: number, velocity = 0) {
    const scale = THREE.MathUtils.clamp(
      THREE.MathUtils.mapLinear(distance, 0.16, 0.78, FRONT_MIN_SPACE_SCALE, FRONT_MAX_SPACE_SCALE),
      FRONT_MIN_SPACE_SCALE,
      FRONT_MAX_SPACE_SCALE,
    );
    this.handSpace.setScale(scale, velocity);
    this.formation.setScaleTensionVelocity(velocity);
    this.formation.setSplitProgress(THREE.MathUtils.clamp((distance - 0.42) / 0.36, 0, 1));
  }

  updateRotationTether(snapshot: GestureSnapshot, rotating: boolean, plateIndex: number | null = null) {
    this.tetherTargetOpacity = rotating && snapshot.landmarks.length ? 0.35 : 0;
    this.tetherLines.forEach((line, i) => (line.material as THREE.LineBasicMaterial).color.setHex(i === 1 ? 0xd8b562 : 0x8adbc7));
    if (!snapshot.landmarks.length) return;
    this.formation.group.updateMatrixWorld(true);
    const points = snapshot.landmarks[0];
    const sourceIds = [4, 8, 12];
    const targetAngles = [0.72, 0.95, 1.18];
    const plateRadius = [1.08, 2.5, 3.78, 4.72][plateIndex ?? 3];
    for (let i = 0; i < this.tetherLines.length; i += 1) {
      const source = this.spacePoint(points[sourceIds[i]].x, points[sourceIds[i]].y, points[sourceIds[i]].z);
      const plate = this.formation.plates[plateIndex ?? 3];
      plate.updateWorldMatrix(true, false);
      const localTarget = new THREE.Vector3(Math.cos(targetAngles[i]) * plateRadius, [0.015, 0.04, 0.072, 0.105][plateIndex ?? 3], Math.sin(targetAngles[i]) * plateRadius);
      const target = plate.localToWorld(localTarget);
      const attr = this.tetherLines[i].geometry.getAttribute('position') as THREE.BufferAttribute;
      attr.setXYZ(0, source.x, source.y, source.z);
      attr.setXYZ(1, target.x, target.y, target.z);
      attr.needsUpdate = true;
    }
  }

  /** Functional armed cue; reuses the three existing tether segments, no new GPU resources. */
  updateZhenFlickFeedback(snapshot: GestureSnapshot, armed: boolean) {
    const points = snapshot.landmarks[0];
    if (!armed || !points || points.length !== 21) return;
    this.tetherTargetOpacity = 0.45;
    const thumb = this.spacePoint(points[4].x, points[4].y, points[4].z);
    const index = this.spacePoint(points[8].x, points[8].y, points[8].z);
    for (let i = 0; i < 3; i += 1) {
      const attr = this.tetherLines[i].geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let end = 0; end < 2; end += 1) {
        const t = (i + end) / 3;
        attr.setXYZ(end, thumb.x + (index.x - thumb.x) * t,
          thumb.y + (index.y - thumb.y) * t + Math.sin(t * Math.PI * 3) * 0.018,
          thumb.z + (index.z - thumb.z) * t);
      }
      attr.needsUpdate = true;
      (this.tetherLines[i].material as THREE.LineBasicMaterial).color.setHex(0xd5eaff);
    }
  }

  updateHandAnchor(snapshot: GestureSnapshot, timestamp = performance.now()) {
    const center = snapshot.palmCenter;
    if (!center || !snapshot.handCount) {
      if (timestamp - this.lastHandSeenAt <= 250) return;
      this.handCore.visible = false;
      this.handTrace.visible = false;
      this.supportTrace.visible = false;
      return;
    }
    this.lastHandSeenAt = timestamp;
    const world = this.spacePoint(center.x, center.y, center.z);
    this.handCore.visible = true;
    this.handTrace.visible = snapshot.pointing || snapshot.pinchActive;
    this.handCore.position.lerp(world, 0.24);
    this.handCore.scale.setScalar(snapshot.pinchActive ? 1.35 : snapshot.openPalm ? 1 : 0.78);
    const tracePosition = this.handTrace.geometry.getAttribute('position') as THREE.BufferAttribute;
    tracePosition.setXYZ(0, this.handCore.position.x, this.handCore.position.y + 0.02, this.handCore.position.z);
    tracePosition.setXYZ(1, this.formation.group.position.x, this.formation.group.position.y + 0.02, this.formation.group.position.z);
    tracePosition.needsUpdate = true;
    (this.handCore.material as THREE.MeshBasicMaterial).opacity = snapshot.openPalm || snapshot.pinchActive ? 0.72 : 0.22;
    (this.handTrace.material as THREE.LineBasicMaterial).opacity = snapshot.pointing ? 0.08 : 0.035;
    const primed = ['PREPARING', 'ALIGNED', 'CHARGING', 'READY'].includes(this.spellSystem.stage);
    const support = snapshot.palmCenters[1];
    this.supportTrace.visible = Boolean(support && primed);
    if (support && primed) {
      const supportWorld = this.spacePoint(support.x, support.y, support.z);
      const supportPosition = this.supportTrace.geometry.getAttribute('position') as THREE.BufferAttribute;
      supportPosition.setXYZ(0, supportWorld.x, supportWorld.y, supportWorld.z);
      supportPosition.setXYZ(1, this.formation.group.position.x, this.formation.group.position.y, this.formation.group.position.z);
      supportPosition.needsUpdate = true;
      (this.supportTrace.material as THREE.LineBasicMaterial).opacity = 0.12;
    }
  }

  pointingHit(snapshot: GestureSnapshot, handSpeed = 0) {
    if (!snapshot.landmarks.length || !snapshot.pointing) {
      this.stablePointingSector = null;
      return { hit: false, sector: null, localX: null, localY: null, localZ: null, angle: null, reason: 'NOT_POINTING' };
    }
    const points = snapshot.landmarks[0];
    const hit = this.rayFromFinger(points);
    if (!hit) return { hit: false, sector: null, localX: null, localY: null, localZ: null, angle: null, reason: 'PLANE_MISS' };
    const localHit = this.formation.heavenPlate.worldToLocal(hit.clone());
    const radius = Math.hypot(localHit.x, localHit.z);
    const angle = Math.atan2(localHit.z, localHit.x);
    const location = { hit: true, localX: localHit.x, localY: localHit.y, localZ: localHit.z, angle };
    if (radius < 0.25 || radius > 5.35) return { ...location, sector: null, reason: 'OUTSIDE_FORMATION' };
    const best = sectorFromLocalPoint(localHit.x, localHit.z);
    if (this.stablePointingSector !== null && this.stablePointingSector !== best) {
      const stableAngle = Math.PI / 2 - this.stablePointingSector * Math.PI / 4;
      const difference = Math.abs(Math.atan2(Math.sin(angle - stableAngle), Math.cos(angle - stableAngle)));
      // Slow pointing favours a wider buffer; fast sweeps can cross sectors responsively.
      const extra = THREE.MathUtils.degToRad(THREE.MathUtils.clamp(10 - handSpeed * 10, 3, 10));
      if (difference < Math.PI / 8 + extra) return { ...location, sector: this.stablePointingSector, reason: 'SECTOR_HYSTERESIS' };
    }
    this.stablePointingSector = best;
    return { ...location, sector: best, reason: 'HIT' };
  }

  pointingSector(snapshot: GestureSnapshot, handSpeed = 0) {
    return this.pointingHit(snapshot, handSpeed).sector;
  }

  /** Chooses the plate whose radial band is nearest the hand/finger contact point. */
  updatePlateHover(snapshot: GestureSnapshot, timestamp = performance.now()) {
    if (this.formation.grabbedPlate !== null) {
      this.formation.setHoverPlate(this.formation.grabbedPlate);
      return this.formation.grabbedPlate;
    }
    if (!snapshot.landmarks.length || !snapshot.handCount) {
      this.formation.setHoverPlate(null);
      this.stableHoveredPlate = null;
      this.hoverCandidate = null;
      return null;
    }
    const points = snapshot.landmarks[0];
    let worldPoint: THREE.Vector3 | null = null;
    if (snapshot.pointing) worldPoint = this.rayFromFinger(points);
    if (!worldPoint) {
      const contact = snapshot.pinchActive
        ? { x: (points[4].x + points[8].x) * 0.5, y: (points[4].y + points[8].y) * 0.5, z: (points[4].z + points[8].z) * 0.5 }
        : snapshot.palmCenter;
      if (contact) worldPoint = this.spacePoint(contact.x, contact.y, contact.z);
    }
    if (!worldPoint) {
      this.formation.setHoverPlate(null);
      return null;
    }
    // The ray is set by rayFromFinger/spacePoint. Each band lives in its own floating plate.
    const radii = this.formation.plates.map((plate, index) => {
      const hit = intersectPlateLocal(this.raycaster.ray, plate, [0.015, 0.04, 0.072, 0.105][index]);
      return hit ? Math.hypot(hit.x, hit.z) : Infinity;
    });
    const matched = radii.findIndex((radius, index) => this.isWithinHoverBand(index, radius, 0));
    const plate = matched === -1 ? null : matched;
    // Keep the existing band until the hand clearly crosses its radial boundary.
    if (this.stableHoveredPlate !== null && this.isWithinHoverBand(this.stableHoveredPlate, radii[this.stableHoveredPlate], 0.16)) {
      this.hoverCandidate = this.stableHoveredPlate;
      this.hoverCandidateSince = timestamp;
    } else if (plate !== this.hoverCandidate) {
      this.hoverCandidate = plate;
      this.hoverCandidateSince = timestamp;
    }
    if (this.hoverCandidate !== this.stableHoveredPlate && timestamp - this.hoverCandidateSince >= 110) this.stableHoveredPlate = this.hoverCandidate;
    this.formation.setHoverPlate(this.stableHoveredPlate);
    return this.stableHoveredPlate;
  }

  private isWithinHoverBand(plate: number, radius: number, hysteresis: number) {
    const bands = [[0, 1.55], [1.55, 3.5], [3.5, 4.3], [4.3, 5.45]];
    const [min, max] = bands[plate] ?? [0, 0];
    return radius >= min - hysteresis && radius <= max + hysteresis;
  }

  pointingDepthIntensity(snapshot: GestureSnapshot) {
    const tip = snapshot.landmarks[0]?.[8];
    if (!tip) return 0.6;
    return THREE.MathUtils.clamp(0.62 + (-tip.z) * 0.9, 0.42, 1);
  }

  private rayFromFinger(points: Landmark[]) {
    const mcp = points[5];
    const tip = points[8];
    const mirroredMcp = landmarkToViewport(mcp.x, mcp.y, window.innerWidth, window.innerHeight);
    const mirroredTip = landmarkToViewport(tip.x, tip.y, window.innerWidth, window.innerHeight);
    const extension = 2.4;
    const projectedX = THREE.MathUtils.clamp(mirroredTip.x + (mirroredTip.x - mirroredMcp.x) * extension, 0.01, 0.99);
    const projectedY = THREE.MathUtils.clamp(mirroredTip.y + (mirroredTip.y - mirroredMcp.y) * extension, 0.01, 0.99);
    this.raycaster.setFromCamera(new THREE.Vector2(projectedX * 2 - 1, -(projectedY * 2 - 1)), this.camera);
    const hit = intersectPlateLocal(this.raycaster.ray, this.formation.heavenPlate, 0.117);
    return hit ? this.formation.heavenPlate.localToWorld(hit) : null;
  }

  spacePoint(x: number, y: number, z = 0) {
    const viewport = landmarkToViewport(x, y, window.innerWidth, window.innerHeight);
    this.raycaster.setFromCamera(new THREE.Vector2(viewport.x * 2 - 1, -(viewport.y * 2 - 1)), this.camera);
    const spacePlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -FRONT_FORMATION_CENTER.z);
    const hit = new THREE.Vector3();
    const result = this.raycaster.ray.intersectPlane(spacePlane, hit) ? hit : new THREE.Vector3(0, 1.35, -1.85);
    result.z += THREE.MathUtils.clamp(-z * 1.8, -0.42, 0.42);
    return result;
  }

  private spacePoints(snapshot: GestureSnapshot) {
    return snapshot.palmCenters.slice(0, 2).map((center, index) => this.spacePoint(center.x, center.y, snapshot.landmarks[index]?.[0]?.z ?? 0));
  }

  update() {
    if (this.disposed) return;
    this.timer.update();
    const rawDelta = this.timer.getDelta();
    const delta = Math.min(rawDelta, 0.05);
    const elapsed = this.timer.getElapsed();
    const performance = this.performanceGovernor.update(rawDelta);
    this.renderFps = performance.fps;
    this.performanceTier = performance.tier;
    if (performance.changed) this.setVisualQuality(qualityFromPerformanceTier(performance.tier));
    this.animator.update(delta);
    if (this.animator.phase === 'ACTIVE' || this.animator.phase === 'COLLAPSING') this.handSpace.update(delta, this.formation);
    this.formation.update(delta, elapsed);
    this.spellSystem.visuals.update(delta, elapsed);
    this.tetherOpacity += (this.tetherTargetOpacity - this.tetherOpacity) * Math.min(1, delta * 8);
    this.tetherLines.forEach((line) => {
      line.visible = this.tetherOpacity > 0.005;
      (line.material as THREE.LineBasicMaterial).opacity = this.tetherOpacity;
    });
    this.dust.rotation.y += delta * 0.004;
    this.cameraController.update(delta, elapsed);
    this.renderer.info.reset();
    this.post.render();
  }

  setPresentationCamera(enabled: boolean) { this.cameraController.setFixed(enabled); }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    window.removeEventListener('resize', this.onResize);
    this.timer.dispose();
    this.cameraController.dispose();
    this.spellSystem.dispose();
    this.handOcclusion.dispose();
    disposeObjectTrees([this.scene]);
    this.scene.clear();
    this.post.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.post.setSize(width, height);
  }
}
