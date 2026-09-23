import * as THREE from 'three';
import { EnergyFlow } from '../effects/EnergyFlow';
import { sectorPoint } from './FormationPicking';
import { FORMATION_COLORS, setGroupOpacity, setStrokeProgress, type FormationStroke } from './FormationMaterials';
import { EarthPlate } from './EarthPlate';
import { HeavenPlate } from './HeavenPlate';
import { HumanPlate } from './HumanPlate';
import { SpiritPlate } from './SpiritPlate';
import {
  FORMATION_STYLE,
  FRONT_FORMATION_CENTER,
  FRONT_FORMATION_PITCH,
  FRONT_FORMATION_ROLL,
  FRONT_FORMATION_SCALE,
  FRONT_FORMATION_YAW,
  FRONT_MAX_SPACE_SCALE,
  FRONT_MIN_SPACE_SCALE,
  FRONT_PLATE_DEPTHS,
  FRONT_PLANE_ROTATION,
} from './FormationStyle';

export type FormationPlate = EarthPlate | HumanPlate | HeavenPlate | SpiritPlate;

export class QimenFormation {
  readonly group = new THREE.Group();
  readonly earthPlate = new EarthPlate();
  readonly humanPlate = new HumanPlate();
  readonly heavenPlate = new HeavenPlate();
  readonly spiritPlate = new SpiritPlate();
  readonly plates: FormationPlate[] = [this.earthPlate, this.humanPlate, this.heavenPlate, this.spiritPlate];
  readonly energyFlow = new EnergyFlow();
  private rotationVelocity = 0;
  private selectedSector: number | null = null;
  private lockedSector: number | null = null;
  private selectionRing: THREE.Mesh;
  private targetScale = 0.035;
  private currentScale = 0.035;
  private layerOffsets = [0, 0, 0, 0];
  private layerDepthOffsets = [0, 0, 0, 0];
  private rotationSnapTargets: number[] | null = null;
  private rotationSnapOvershootTargets: number[] | null = null;
  private rotationSnapDelay = 0;
  private rotationSnapElapsed = 0;
  private rotationOwner = 3;
  private rotationHeld = false;
  private settling = false;
  private readonly qiColor = new THREE.Color(FORMATION_COLORS.qi);
  private collapseProgress = 0;
  private collapseStartScale = FRONT_FORMATION_SCALE;
  private spaceScale = 1;
  private spaceTension = 0;
  private targetSpaceTension = 0;
  private scaleElastic = 0;
  private splitProgress = 0;
  private targetSplitProgress = 0;
  private hoverPlateIndex: number | null = null;
  private hoverIntensity = 0;
  private targetHoverIntensity = 0;
  private readonly hoverDepths = [0.012, 0.018, 0.024, 0.032];
  private readonly splitDepths = [0, 0.04, 0.1, 0.17];
  private readonly grabDepths = [0.03, 0.04, 0.06, 0.1];
  private grabPulse = 0;
  private snapDamping = 0.965;
  private spellAlignment = 0;
  private targetSpellAlignment = 0;
  private spellSector: number | null = null;

  private get selectionMaterial() {
    return this.selectionRing.material as THREE.MeshBasicMaterial;
  }

  constructor() {
    this.group.name = 'qimenFormation';
    this.group.position.copy(FRONT_FORMATION_CENTER);
    this.group.add(this.earthPlate, this.humanPlate, this.heavenPlate, this.spiritPlate, this.energyFlow.group);
    this.plates.forEach((plate) => {
      plate.visible = true;
      setGroupOpacity(plate, 0);
    });
    this.selectionRing = new THREE.Mesh(
      new THREE.RingGeometry(0.56, 0.59, 72),
      new THREE.MeshBasicMaterial({ color: FORMATION_COLORS.active, transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }),
    );
    this.selectionRing.rotation.x = -Math.PI / 2;
    this.selectionRing.position.y = 0.16;
    this.group.add(this.selectionRing);
  }

  setReveal(progress: number) {
    const value = THREE.MathUtils.clamp(progress, 0, 1);
    this.targetScale = THREE.MathUtils.lerp(0.035, FRONT_FORMATION_SCALE, value);
    this.plates.forEach((plate, index) => {
      const plateProgress = THREE.MathUtils.clamp((value - index * 0.09) / 0.75, 0, 1);
      setGroupOpacity(plate, plateProgress);
    });
    this.selectionMaterial.opacity = Math.max(0, value - 0.2) * 0.42;
  }

  setLayerStrokeProgress(layerIndex: number, progress: number) {
    const plate = this.plates[layerIndex];
    if (!plate) return;
    const value = THREE.MathUtils.clamp(progress, 0, 1);
    plate.strokes.forEach((entry) => setStrokeProgress(entry, value));
    setGroupOpacity(plate, value);
  }

  setRotationVelocity(velocity: number) {
    this.rotationVelocity = THREE.MathUtils.clamp(velocity, -5.5, 5.5);
  }

  beginRotation() {
    this.beginRotationOn(this.hoverPlateIndex ?? 3);
  }

  beginRotationOn(owner: number) {
    this.rotationHeld = true;
    this.settling = false;
    this.rotationSnapTargets = null;
    this.rotationSnapOvershootTargets = null;
    this.rotationSnapDelay = 0;
    this.rotationSnapElapsed = 0;
    this.rotationOwner = THREE.MathUtils.clamp(Math.round(owner), 0, 3);
    this.setLayerOffset(0, 0);
    this.setLayerOffset(1, 0);
    this.setLayerOffset(2, 0);
    this.setLayerOffset(3, 0);
    FRONT_PLATE_DEPTHS.forEach((depth, index) => this.setLayerDepthOffset(index, depth));
    this.rotationOwner = THREE.MathUtils.clamp(this.rotationOwner, 0, 3);
  }

  settleRotation() {
    this.rotationHeld = false;
    this.settling = true;
    this.rotationSnapTargets = null;
    this.rotationSnapOvershootTargets = null;
    this.rotationSnapDelay = 0.22;
    this.rotationSnapElapsed = 0;
    this.layerDepthOffsets.fill(0);
    this.layerOffsets.fill(0);
  }

  private chooseSnapTarget() {
    const ownerAngles = [this.earthPlate.rotation.y, this.humanPlate.rotation.y, this.heavenPlate.rotation.y, this.spiritPlate.rotation.y];
    const baseFactors = [0.06, 0.32, 0.7, 1];
    const signs = [1, 1, -1, 1];
    const ownerRatio = baseFactors[this.rotationOwner];
    const ownerSign = signs[this.rotationOwner];
    const snap = Math.round(ownerAngles[this.rotationOwner] / (Math.PI / 4)) * (Math.PI / 4);
    const correction = snap - ownerAngles[this.rotationOwner];
    this.rotationSnapTargets = baseFactors.map((factor, index) => ownerAngles[index] + correction * (factor / ownerRatio) * (signs[index] / ownerSign));
    const overshoot = THREE.MathUtils.clamp(this.rotationVelocity * 0.012, -0.035, 0.035);
    this.rotationSnapOvershootTargets = this.rotationSnapTargets.map((target) => target + overshoot);
    this.rotationVelocity = 0; // Snap now owns the angular update; no simultaneous inertial writer.
    this.rotationSnapDelay = 0;
    this.rotationSnapElapsed = 0;
    this.grabPulse = 1;
    this.setLayerOffset(0, 0);
    this.setLayerOffset(1, 0);
    this.setLayerOffset(2, 0);
    this.setLayerOffset(3, 0);
    this.setLayerDepthOffset(0, 0);
    this.setLayerDepthOffset(1, 0);
    this.setLayerDepthOffset(2, 0);
    this.setLayerDepthOffset(3, 0);
  }

  setRadius(radius: number) {
    const scale = THREE.MathUtils.clamp(radius / 5.08, 1.96, 5.5);
    this.targetScale = THREE.MathUtils.clamp(scale, 0.72, FRONT_FORMATION_SCALE * FRONT_MAX_SPACE_SCALE);
  }

  setSpaceScale(scale: number) {
    this.spaceScale = THREE.MathUtils.clamp(scale, FRONT_MIN_SPACE_SCALE, FRONT_MAX_SPACE_SCALE);
    this.targetSpaceTension = THREE.MathUtils.clamp((this.spaceScale - FRONT_MIN_SPACE_SCALE) / (FRONT_MAX_SPACE_SCALE - FRONT_MIN_SPACE_SCALE), 0, 1);
  }

  setSpaceScaleWithVelocity(scale: number, velocity = 0) {
    this.setSpaceScale(scale);
    this.setScaleTensionVelocity(velocity);
  }

  setScaleTensionVelocity(velocity: number) {
    this.scaleElastic = THREE.MathUtils.clamp(velocity * 0.018, -0.06, 0.08);
  }

  setSplitProgress(progress: number) {
    this.targetSplitProgress = THREE.MathUtils.clamp(progress, 0, 1);
  }

  setHoverPlate(index: number | null) {
    const next = index === null ? null : THREE.MathUtils.clamp(Math.round(index), 0, 3);
    const changed = next !== this.hoverPlateIndex;
    this.hoverPlateIndex = next;
    this.targetHoverIntensity = next === null ? 0 : 1;
    return changed;
  }

  get hoveredPlate() { return this.hoverPlateIndex; }
  get grabbedPlate() { return this.rotationHeld ? this.rotationOwner : null; }
  get plateMotionState() { return this.rotationHeld ? 'ROTATING' : this.settling ? (this.rotationSnapTargets ? 'SNAPPING' : 'INERTIA') : 'IDLE'; }

  sectorWorldPoint(sector: number, radius = 4.15, depth = 0.117) {
    this.heavenPlate.updateWorldMatrix(true, false);
    return this.heavenPlate.localToWorld(sectorPoint(sector, radius, depth));
  }

  pulseGrab() {
    this.grabPulse = 1;
  }

  setSnapDamping(value: number) {
    this.snapDamping = THREE.MathUtils.clamp(value, 0.9, 0.995);
  }

  /** A restrained pre-cast response: the formation computes before the effect appears. */
  prepareSpell(sector: number, progress = 0.7) {
    this.spellSector = sector;
    this.targetSpellAlignment = THREE.MathUtils.clamp(progress, 0, 1);
    // Keep the sector locked while the formation performs its pre-cast calculation.
    this.activate(sector, 0.68 + this.targetSpellAlignment * 0.28);
    this.energyFlow.activate(sector, 0.48 + this.targetSpellAlignment * 0.38);
  }

  releaseSpellPulse() {
    this.grabPulse = 1;
    this.targetSpellAlignment = 0;
  }

  clearSpellPreparation() {
    this.targetSpellAlignment = 0;
    this.spellSector = null;
  }

  get formationScale() {
    return this.currentScale * this.spaceScale;
  }

  get plateAngles() {
    return [this.earthPlate.rotation.y, this.humanPlate.rotation.y, this.heavenPlate.rotation.y, this.spiritPlate.rotation.y] as const;
  }

  get preparedSpellSector() { return this.spellSector; }

  setWorldTransform(position: THREE.Vector3, tilt: number, roll: number, yaw: number) {
    this.group.position.copy(position);
    if (FORMATION_STYLE === 'FRONT_CIRCLE') {
      this.group.rotation.set(FRONT_PLANE_ROTATION + tilt, yaw, roll);
    } else {
      this.group.rotation.set(tilt, yaw, roll);
    }
  }

  holdOpen() {
    this.collapseProgress = 0;
    this.plates.forEach((plate) => setGroupOpacity(plate, 1));
  }

  beginCollapse() {
    this.rotationHeld = false;
    this.settling = false;
    this.collapseProgress = 0;
    this.collapseStartScale = this.currentScale;
    this.rotationVelocity = 0;
    this.rotationSnapTargets = null;
    this.energyFlow.deactivate();
  }

  setCollapse(progress: number) {
    this.collapseProgress = THREE.MathUtils.clamp(progress, 0, 1);
    const reveal = 1 - this.collapseProgress;
    this.targetScale = THREE.MathUtils.lerp(this.collapseStartScale, 0.035, this.collapseProgress);
    this.plates.forEach((plate, index) => {
      const layerReveal = THREE.MathUtils.clamp(reveal * (1.12 - index * 0.09), 0, 1);
      setGroupOpacity(plate, layerReveal);
      plate.strokes.forEach((entry) => setStrokeProgress(entry, layerReveal));
    });
    this.selectionMaterial.opacity = 0.22 * reveal;
  }

  setLayerOffset(index: number, amount: number) {
    this.layerOffsets[index] = amount;
  }

  setLayerDepthOffset(index: number, amount: number) {
    this.layerDepthOffsets[index] = amount;
  }

  select(sector: number | null, progress = 1) {
    this.selectedSector = sector;
    if (sector === null) {
      this.lockedSector = null;
      this.selectionMaterial.opacity = 0;
      return;
    }
    const angle = Math.PI / 2 - sector * Math.PI / 4;
    this.selectionRing.position.set(Math.cos(angle) * 2.18, 0.15, Math.sin(angle) * 2.18);
    this.selectionMaterial.opacity = 0.22 * progress;
  }

  activate(sector: number, progress: number) {
    this.lockedSector = sector;
    this.select(sector, progress);
    this.energyFlow.activate(sector, progress);
    const label = this.heavenPlate.trigramLabels[sector];
    if (label) {
      label.position.y = 0.1 + Math.sin(progress * Math.PI) * 0.18;
      label.scale.setScalar(0.56 + Math.sin(progress * Math.PI) * 0.12);
    }
  }

  preview(sector: number, intensity = 0.65) {
    this.lockedSector = null;
    this.select(sector, intensity);
    this.energyFlow.activate(sector, intensity * 0.42);
    const label = this.heavenPlate.trigramLabels[sector];
    if (label) {
      label.position.y = 0.1 + intensity * 0.06;
      label.scale.setScalar(0.56 + intensity * 0.04);
    }
  }

  focus(sector: number, intensity = 0.88) {
    this.lockedSector = null;
    this.select(sector, intensity);
    this.energyFlow.activate(sector, intensity * 0.72);
    const label = this.heavenPlate.trigramLabels[sector];
    if (label) {
      label.position.y = 0.1 + intensity * 0.1;
      label.scale.setScalar(0.56 + intensity * 0.08);
    }
  }

  update(delta: number, elapsed: number) {
    this.currentScale += (this.targetScale - this.currentScale) * Math.min(1, delta * 4.6);
    this.spaceTension += (this.targetSpaceTension - this.spaceTension) * Math.min(1, delta * 7);
    this.splitProgress += (this.targetSplitProgress - this.splitProgress) * Math.min(1, delta * 7);
    this.hoverIntensity += (this.targetHoverIntensity - this.hoverIntensity) * Math.min(1, delta * 10);
    this.spellAlignment += (this.targetSpellAlignment - this.spellAlignment) * Math.min(1, delta * 5);
    this.scaleElastic *= Math.pow(0.08, delta);
    this.grabPulse *= Math.pow(0.05, delta);
    this.group.scale.setScalar(this.currentScale * this.spaceScale * (1 + this.scaleElastic + this.grabPulse * 0.008));
    this.rotationVelocity *= Math.pow(this.snapDamping, delta * 60);
    const rotationFactors = [0.06, 0.32, 0.7, 1];
    const rotationSigns = [1, 1, -1, 1];
    const ownerFactor = rotationFactors[this.rotationOwner];
    const ownerSign = rotationSigns[this.rotationOwner];
    this.plates.forEach((plate, index) => {
      const factor = index === this.rotationOwner
        ? 1
        : (rotationFactors[index] / ownerFactor) * (rotationSigns[index] / ownerSign);
      plate.rotation.y += this.rotationVelocity * delta * factor;
    });
    this.rotationSnapDelay = Math.max(0, this.rotationSnapDelay - delta);
    if (this.settling && !this.rotationSnapTargets && this.rotationSnapDelay <= 0 && Math.abs(this.rotationVelocity) < 0.18) this.chooseSnapTarget();
    if (this.rotationSnapTargets && this.rotationSnapOvershootTargets && this.rotationSnapDelay <= 0 && Math.abs(this.rotationVelocity) < 0.18) {
      this.rotationSnapElapsed += delta;
      const snapProgress = THREE.MathUtils.clamp(this.rotationSnapElapsed / 0.72, 0, 1);
      const targetSet = snapProgress < 0.56 ? this.rotationSnapOvershootTargets : this.rotationSnapTargets;
      const frameEase = 1 - (1 - Math.min(1, delta * 8)) ** 3;
      this.plates.forEach((plate, index) => {
        plate.rotation.y += (targetSet[index] - plate.rotation.y) * frameEase;
      });
      if (snapProgress >= 1 && this.plates.every((plate, index) => Math.abs(plate.rotation.y - this.rotationSnapTargets![index]) < 0.004)) {
        this.plates.forEach((plate, index) => { plate.rotation.y = this.rotationSnapTargets![index]; });
        this.rotationSnapTargets = null;
        this.rotationSnapOvershootTargets = null;
        this.rotationVelocity = 0;
        this.settling = false;
      }
    }
    this.plates.forEach((plate, index) => {
      // In FRONT_CIRCLE local +Y is the view/depth axis after the base 90° rotation.
      const splitDepth = this.splitDepths[index] * this.splitProgress;
      const grabDepth = this.rotationOwner === index && this.rotationHeld ? this.grabDepths[index] : 0;
      const hoverDepth = this.hoverDepths[index] * (this.hoverPlateIndex === index ? this.hoverIntensity : 0);
      const spellDepth = this.spellAlignment * index * 0.014;
      const targetDepth = this.layerDepthOffsets[index] + splitDepth + grabDepth + hoverDepth + spellDepth;
      plate.position.z += (this.layerOffsets[index] - plate.position.z) * Math.min(1, delta * 7);
      plate.position.y += (targetDepth - plate.position.y) * Math.min(1, delta * 7);
      const radialTension = this.spaceTension * 0.014 * index;
      const hoverScale = this.hoverPlateIndex === index ? this.hoverIntensity * 0.006 : 0;
      plate.scale.setScalar(1 + radialTension + hoverScale);
      this.applyHoverColor(plate, this.hoverPlateIndex === index ? this.hoverIntensity : 0);
    });
    this.selectionRing.rotation.z += delta * 0.5;
    if (this.lockedSector === null) this.selectionMaterial.opacity *= Math.pow(0.995, delta * 60);
    this.energyFlow.update(delta, elapsed);
    // Sector identities belong to HeavenPlate. Keep the selection path in that same moving frame.
    this.energyFlow.group.position.copy(this.heavenPlate.position);
    this.energyFlow.group.quaternion.copy(this.heavenPlate.quaternion);
    this.energyFlow.group.scale.copy(this.heavenPlate.scale);
    if (this.selectedSector !== null) {
      this.heavenPlate.updateMatrix();
      sectorPoint(this.selectedSector, 2.18, 0.15, this.selectionRing.position).applyMatrix4(this.heavenPlate.matrix);
    }
  }

  private applyHoverColor(plate: THREE.Object3D, intensity: number) {
    plate.traverse((child) => {
      const material = (child as THREE.Mesh | THREE.Line | THREE.Sprite).material as THREE.Material & { color?: THREE.Color; userData?: Record<string, unknown> } | undefined;
      if (!material?.color) return;
      material.userData ??= {};
      const base = (material.userData.hoverBaseColor as THREE.Color | undefined) ?? material.color.clone();
      material.userData.hoverBaseColor = base;
      material.color.copy(base).lerp(this.qiColor, intensity * 0.16);
    });
  }

  reset() {
    this.rotationHeld = false;
    this.settling = false;
    this.selectedSector = null;
    this.rotationVelocity = 0;
    this.rotationSnapTargets = null;
    this.rotationSnapOvershootTargets = null;
    this.rotationSnapDelay = 0;
    this.rotationSnapElapsed = 0;
    this.rotationOwner = 3;
    this.collapseProgress = 0;
    this.currentScale = 0.035;
    this.targetScale = 0.035;
    this.group.scale.setScalar(this.currentScale);
    this.spaceScale = 1;
    this.spaceTension = 0;
    this.targetSpaceTension = 0;
    this.scaleElastic = 0;
    this.splitProgress = 0;
    this.targetSplitProgress = 0;
    this.hoverPlateIndex = null;
    this.hoverIntensity = 0;
    this.targetHoverIntensity = 0;
    this.grabPulse = 0;
    this.spellAlignment = 0;
    this.targetSpellAlignment = 0;
    this.spellSector = null;
    this.lockedSector = null;
    this.group.position.copy(FRONT_FORMATION_CENTER);
    this.group.rotation.set(FRONT_PLANE_ROTATION + FRONT_FORMATION_PITCH, FRONT_FORMATION_YAW, FRONT_FORMATION_ROLL);
    this.plates.forEach((plate, index) => {
      plate.rotation.y = 0;
      plate.position.y = 0;
      plate.position.z = 0;
      plate.scale.setScalar(1);
      this.layerDepthOffsets[index] = 0;
      this.layerOffsets[index] = 0;
      setGroupOpacity(plate, 0);
      plate.strokes.forEach((entry) => {
        entry.object.geometry.setDrawRange(0, 0);
        entry.material.opacity = 0;
      });
    });
    this.selectionMaterial.opacity = 0;
    this.energyFlow.reset();
  }
}
