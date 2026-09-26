import * as THREE from 'three';
import type { QimenFormation } from '../qimen/QimenFormation';
import type { MotionState } from '../gestureRecognition/GestureMotionDetector';
import type { SpellContext, SpellCastStage, SpellAction } from './SpellContext';
import { SPELL_BY_SECTOR, type SpellId } from './SpellDefinition';
import { SpellCastController, type SpellControllerEvent } from './SpellCastController';
import { SpellCameraEffects, type CameraImpulseTarget } from './SpellCameraEffects';
import { SpellVisuals } from './SpellVisuals';
import type { VisualQualitySettings } from '../threeScene/VisualQualityConfig';
import { screenDirectionToSpell } from '../handTracking/CameraCoordinates';
import { emptySwipe } from '../gestureRecognition/HandSwipeDetector';

export class SpellSystem {
  readonly group = new THREE.Group();
  readonly controller = new SpellCastController();
  readonly visuals = new SpellVisuals();
  private readonly cameraEffects: SpellCameraEffects;
  private followUntil = 0;
  private followSpell: SpellId | null = null;
  private windDirection = 1;

  constructor(private readonly formation: QimenFormation, camera: CameraImpulseTarget) {
    this.group.name = 'spellSystemRoot';
    this.group.add(this.visuals.group);
    this.cameraEffects = new SpellCameraEffects(camera);
  }

  get stage(): SpellCastStage { return this.controller.stage; }
  get lockedSector() { return this.controller.lockedSector; }
  get activeSpell() { return this.controller.activeSpell; }

  setVisualQuality(quality: VisualQualitySettings) {
    this.visuals.setQuality(quality.particleMultiplier, quality.spellDetail);
    this.cameraEffects.setIntensity(quality.cameraEffects);
  }

  lockSector(sector: number | null, timestamp: number) {
    return this.controller.lockSector(sector, sector === null ? null : SPELL_BY_SECTOR.get(sector) ?? null, timestamp);
  }

  setPaused(paused: boolean, timestamp: number) {
    this.controller.setPaused(paused, timestamp);
  }

  cancel(timestamp: number) {
    this.formation.clearSpellPreparation();
    return this.controller.cancel(timestamp);
  }

  update(context: SpellContext, motion: MotionState, timestamp: number, delta: number, elapsed: number, handWorld: THREE.Vector3 | null): SpellControllerEvent[] {
    if (this.controller.isPaused && context.formationState === 'ACTIVE') return [];
    const nextContext: SpellContext = { ...context, action: motion.action, handVelocity: motion.velocity, handDepthVelocity: motion.depthVelocity, castStage: this.stage };
    const events = this.controller.update(nextContext, timestamp);
    const spell = this.controller.activeSpell?.id ?? null;
    this.visuals.setPalmSeal(handWorld, spell, this.stage === 'READY', elapsed);
    if (spell && ['PREPARING', 'ALIGNED', 'CHARGING', 'READY'].includes(this.stage)) {
      const progress = this.stage === 'READY' ? 0.84 + motion.anticipation * 0.14 : this.stage === 'CHARGING' ? 0.78 : this.stage === 'ALIGNED' ? 0.5 : 0.28;
      this.formation.prepareSpell(this.controller.lockedSector ?? 0, progress);
    } else this.formation.clearSpellPreparation();
    this.visuals.setAnticipation(this.stage === 'READY' ? motion.anticipation : 0);
    const windReady = spell === 'XUN_WIND' && this.stage === 'READY';
    this.formation.energyFlow.setWindAnticipation(windReady ? Math.sign(motion.swipe.horizontal) : 0, windReady ? motion.swipe.score : 0);
    if (this.followSpell && timestamp < this.followUntil) {
      const direction = screenDirectionToSpell(motion.direction);
      if (this.followSpell === 'XUN_WIND') direction.x = this.windDirection * Math.max(0, direction.x * this.windDirection);
      this.visuals.applyFollowThrough(new THREE.Vector3(direction.x, direction.y, direction.z), motion.intensity, this.followSpell);
    }
    events.forEach((event) => {
      if (event.type === 'cast') {
        this.formation.prepareSpell(event.spell.sector, 1);
        this.formation.releaseSpellPulse();
        this.visuals.cast(event.spell.id, event.context, this.formation);
        this.cameraEffects.trigger(event.spell.id as SpellId);
        this.followSpell = event.spell.id;
        if (event.spell.id === 'XUN_WIND') this.windDirection = event.context.castDirection.x < 0 ? -1 : 1;
        this.followUntil = timestamp + (event.spell.id === 'ZHEN_LIGHTNING' ? 90 : 210);
      }
    });
    return events;
  }

  debugCast(sector: number, timestamp: number): SpellControllerEvent[] {
    const spell = SPELL_BY_SECTOR.get(sector);
    if (!spell) return [];
    this.formation.prepareSpell(sector, 1);
    const stageEvents = this.controller.forceReady(sector, spell, timestamp);
    return [...stageEvents, ...this.demoUpdate(timestamp, spell.action)];
  }

  /** Semantic demo input passes through alignment, charge, resolver and cooldown. */
  demoUpdate(timestamp: number, action: SpellAction | null = 'HOLD'): SpellControllerEvent[] {
    const spell = this.activeSpell;
    const sector = this.lockedSector;
    if (!spell || sector === null) return [];
    const direction = action === 'SWIPE_LEFT' ? { x: -1, y: 0, z: 0 } : action === 'SWIPE_RIGHT' ? { x: 1, y: 0, z: 0 } : { x: 0, y: 0, z: -1 };
    const context: SpellContext = {
      selectedSector: sector,
      lockedSector: sector,
      earthPlateAngle: this.formation.earthPlate.rotation.y,
      humanPlateAngle: this.formation.humanPlate.rotation.y,
      heavenPlateAngle: this.formation.heavenPlate.rotation.y,
      spiritPlateAngle: this.formation.spiritPlate.rotation.y,
      dominantHand: 'Right',
      currentGesture: spell.id === 'ZHEN_LIGHTNING' ? 'PINCH' : 'OPEN_PALM',
      handVelocity: { x: 0, y: 0, z: 0 },
      handDepthVelocity: 0,
      formationScale: this.formation.formationScale,
      formationState: 'ACTIVE',
      castStage: this.stage,
      action,
      castIntensity: 1,
      castDirection: direction,
      chargeScale: 1,
    };
    const motion: MotionState = { action, velocity: { x: 0, y: 0, z: 0 }, depthVelocity: 0, swipeVelocity: 0, speed: 0, stableMs: 500, holdTime: 500, intensity: 1, direction, anticipation: 1, pushScore: 1, pullScore: 1, swipeScore: 1, flickScore: 1, swipeDirectionConsistency: 1, pushEvidence: 0, pullEvidence: 0, swipeDisplacement: 0, pinchSeparationVelocity: 0, timestamp, swipe: emptySwipe(), scaleRate: 0, pullZEvidence: 0, pullScaleEvidence: 0, pullFacingEvidence: 0 };

    return this.update(context, motion, timestamp, 0, timestamp / 1000, null);
  }

  reset() {
    this.controller.reset();
    this.visuals.setPalmSeal(null, null, false, 0);
    this.followSpell = null;
    this.followUntil = 0;
    this.formation.energyFlow.setWindAnticipation(0, 0);
  }

  dispose() { this.reset(); this.visuals.dispose(); this.group.removeFromParent(); }
}
