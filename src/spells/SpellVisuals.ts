import * as THREE from 'three';
import type { QimenFormation } from '../qimen/QimenFormation';
import type { SpellContext } from './SpellContext';
import type { SpellId } from './SpellDefinition';
import { SPELL_VISUALS } from './SpellVisualConfig';
import { disposeObjectTrees, resetPooledTransform } from '../threeScene/ResourceLifecycle';

interface TimedVisual {
  object: THREE.Object3D;
  age: number;
  life: number;
  kind: SpellId;
  poolKey: string;
  velocity?: THREE.Vector3;
}

/** Procedural spell visuals. Every cast is anchored at a formation sector, never at a screen edge. */
export class SpellVisuals {
  readonly group = new THREE.Group();
  private readonly active: TimedVisual[] = [];
  private readonly pool = new Map<string, THREE.Object3D[]>();
  private readonly palmSeal = new THREE.Group();
  private sealSpell: SpellId | null = null;
  private sealTargetOpacity = 0;
  private anticipation = 0;
  private particleMultiplier = 1;
  private detailMultiplier = 1;

  get activeObjectCount() { return this.active.length; }
  get pooledObjectCount() { return [...this.pool.values()].reduce((total, objects) => total + objects.length, 0); }

  setQuality(particleMultiplier: number, detailMultiplier: number) {
    this.particleMultiplier = THREE.MathUtils.clamp(particleMultiplier, 0.25, 1.5);
    this.detailMultiplier = THREE.MathUtils.clamp(detailMultiplier, 0.45, 1.5);
  }

  constructor() {
    this.group.name = 'spellSystem';
    this.palmSeal.name = 'palmSeal';
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.055, 0.068, 18),
      new THREE.MeshBasicMaterial({ color: 0xd9f8ed, transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.palmSeal.add(ring);
    this.group.add(this.palmSeal);
  }

  setPalmSeal(world: THREE.Vector3 | null, spell: SpellId | null, ready: boolean, elapsed: number) {
    this.sealSpell = spell;
    this.sealTargetOpacity = ready && spell ? 0.74 : 0;
    if (world) this.palmSeal.position.lerp(world, 0.24);
    this.palmSeal.visible = Boolean(world && spell);
    const material = (this.palmSeal.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial;
    material.color.setHex(spell ? SPELL_VISUALS[spell].color : 0xd9f8ed);
    material.opacity += (this.sealTargetOpacity - material.opacity) * 0.16;
    this.palmSeal.scale.setScalar(1 + Math.sin(elapsed * 4.4) * 0.08);
  }

  setAnticipation(value: number) {
    this.anticipation += (THREE.MathUtils.clamp(value, 0, 1) - this.anticipation) * 0.22;
    this.palmSeal.scale.setScalar(1 + this.anticipation * 0.16);
  }

  /** The brief post-cast hand trajectory continues shaping the active effect. */
  applyFollowThrough(direction: THREE.Vector3, intensity: number, spell: SpellId) {
    const amount = 0.008 * intensity;
    this.active.forEach((item) => {
      if (item.kind !== spell || item.age > 0.24) return;
      if (spell === 'XUN_WIND' || spell === 'KAN_WATER') item.object.position.addScaledVector(direction, amount * 2.3);
      else if (spell === 'KUN_EARTH') item.object.position.addScaledVector(direction, amount);
    });
  }

  cast(spell: SpellId, context: SpellContext, formation: QimenFormation) {
    const sector = context.lockedSector ?? context.selectedSector ?? 0;
    const target = formation.sectorWorldPoint(sector);
    const center = formation.sectorWorldPoint(sector, 0);
    const intensity = context.castIntensity;
    this.addPath(spell, center, target);
    if (spell === 'KUN_EARTH') this.castEarth(spell, target, intensity);
    else if (spell === 'XUN_WIND') this.castWind(spell, target, intensity, context.castDirection);
    else if (spell === 'ZHEN_LIGHTNING') this.castLightning(spell, target);
    else if (spell === 'KAN_WATER') this.castWater(spell, center, target, intensity);
    else { const unhandled: never = spell; throw new Error(`Missing spell visual: ${unhandled}`); }
  }

  update(delta: number, elapsed: number) {
    for (let index = this.active.length - 1; index >= 0; index -= 1) {
      const item = this.active[index];
      item.age += delta;
      if (item.velocity) item.object.position.addScaledVector(item.velocity, delta);
      const progress = THREE.MathUtils.clamp(item.age / item.life, 0, 1);
      const opacity = Math.sin(Math.PI * progress) * (item.kind === 'ZHEN_LIGHTNING' ? 1.35 : SPELL_VISUALS[item.kind].baseOpacity);
      item.object.traverse((child) => {
        const material = (child as THREE.Mesh | THREE.Line | THREE.Points).material as THREE.Material & { opacity?: number } | undefined;
        if (material && typeof material.opacity === 'number') material.opacity = opacity;
      });
      if (item.kind === 'KUN_EARTH') item.object.scale.setScalar(0.45 + progress * 1.1);
      if (item.kind === 'KAN_WATER') item.object.rotation.z += delta * 0.6;
      if (item.age >= item.life) {
        this.group.remove(item.object);
        item.object.visible = false;
        const available = this.pool.get(item.poolKey) ?? [];
        available.push(item.object);
        this.pool.set(item.poolKey, available);
        this.active.splice(index, 1);
      }
    }
    this.palmSeal.position.y += Math.sin(elapsed * 2.8) * delta * 0.002;
  }

  private localToWorld(formation: QimenFormation, local: THREE.Vector3) {
    formation.group.updateMatrixWorld(true);
    return formation.group.localToWorld(local);
  }

  private sectorPoint(sector: number, radius: number, depth: number) {
    const angle = Math.PI / 2 - sector * Math.PI / 4;
    return new THREE.Vector3(Math.cos(angle) * radius, depth, Math.sin(angle) * radius);
  }

  private material(spell: SpellId, opacity = 0.8) {
    return new THREE.LineBasicMaterial({ color: SPELL_VISUALS[spell].color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
  }

  private acquire(poolKey: string, factory: () => THREE.Object3D) {
    const available = this.pool.get(poolKey);
    const object = available?.pop() ?? factory();
    resetPooledTransform(object);
    return object;
  }

  private line(poolKey: string, spell: SpellId, points: THREE.Vector3[], opacity: number) {
    const line = this.acquire(poolKey, () => new THREE.Line(new THREE.BufferGeometry(), this.material(spell, opacity))) as THREE.Line;
    // BufferGeometry.setFromPoints does not resize an existing position buffer.
    if (line.geometry.getAttribute('position')?.count !== points.length) {
      line.geometry.dispose();
      line.geometry = new THREE.BufferGeometry();
    }
    line.geometry.setFromPoints(points);
    line.geometry.setDrawRange(0, points.length);
    line.geometry.computeBoundingSphere();
    const material = line.material as THREE.LineBasicMaterial;
    material.color.setHex(SPELL_VISUALS[spell].color);
    material.opacity = opacity;
    return line;
  }

  private addPath(spell: SpellId, center: THREE.Vector3, target: THREE.Vector3) {
    const mid = center.clone().lerp(target, 0.52);
    mid.y += spell === 'KUN_EARTH' ? -0.015 : 0.04;
    const curve = new THREE.CatmullRomCurve3([center, mid, target]);
    const poolKey = `${spell}:path`;
    const line = this.line(poolKey, spell, curve.getPoints(24), 0.72);
    this.group.add(line);
    this.active.push({ object: line, age: 0, life: SPELL_VISUALS[spell].pathLife, kind: spell, poolKey });
  }

  private castEarth(spell: SpellId, target: THREE.Vector3, intensity: number) {
    const visual = SPELL_VISUALS[spell];
    for (let i = 0; i < Math.round((visual.earthShardCount + intensity * 3) * this.particleMultiplier); i += 1) {
      const poolKey = `${spell}:shard`;
      const shard = this.acquire(poolKey, () => new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.16, 0),
        new THREE.MeshBasicMaterial({ color: visual.color, transparent: true, opacity: visual.baseOpacity, blending: THREE.AdditiveBlending, depthWrite: false }),
      )) as THREE.Mesh;
      const angle = (i / 7) * Math.PI * 2;
      shard.position.copy(target).add(new THREE.Vector3(Math.cos(angle) * (0.15 + i * 0.02), -0.12, Math.sin(angle) * (0.15 + i * 0.02)));
      shard.rotation.set(angle, angle * 1.7, 0);
      shard.scale.setScalar((0.12 + (i % 3) * 0.04) / 0.16);
      (shard.material as THREE.MeshBasicMaterial).color.setHex(visual.color);
      (shard.material as THREE.MeshBasicMaterial).opacity = visual.baseOpacity;
      this.group.add(shard);
      this.active.push({ object: shard, age: 0, life: visual.earthLife, kind: spell, poolKey, velocity: new THREE.Vector3(0, 0.16 + (i % 2) * 0.06, 0) });
    }
  }

  private castWind(spell: SpellId, target: THREE.Vector3, intensity: number, direction: { x: number; y: number; z: number }) {
    const visual = SPELL_VISUALS[spell];
    const sign = direction.x < 0 ? -1 : 1;
    for (let i = 0; i < Math.max(1, Math.round(visual.windRibbonCount * this.detailMultiplier)); i += 1) {
      const side = i % 2 ? 1 : -1;
      // Every ribbon originates in XUN and travels in the accepted screen direction.
      const points = [target.clone(), target.clone().add(new THREE.Vector3(sign * .7 * intensity, side * .15, .25)),
        target.clone().add(new THREE.Vector3(sign * 1.8 * intensity, side * .08, .5))];
      const curve = new THREE.CatmullRomCurve3(points);
      const poolKey = `${spell}:ribbon`;
      const ribbon = this.line(poolKey, spell, curve.getPoints(Math.round(20 * this.detailMultiplier)), visual.baseOpacity);
      this.group.add(ribbon);
      this.active.push({ object: ribbon, age: i * 0.04, life: visual.windLife, kind: spell, poolKey, velocity: new THREE.Vector3(sign * .65 * intensity, 0, 0) });
    }
  }

  private castLightning(spell: SpellId, target: THREE.Vector3) {
    const visual = SPELL_VISUALS[spell];
    for (let i = 0; i < Math.max(1, Math.round(visual.lightningBoltCount * this.detailMultiplier)); i += 1) {
      const points = [target.clone(), target.clone().add(new THREE.Vector3((i - 1) * 0.2, 0.25, 0.05)), target.clone().add(new THREE.Vector3((i - 1) * 0.42, 0.02, 0.45)), target.clone().add(new THREE.Vector3((i - 1) * 0.72, 0.32, 0.75))];
      const poolKey = `${spell}:bolt`;
      const bolt = this.line(poolKey, spell, points, 1);
      this.group.add(bolt);
      this.active.push({ object: bolt, age: i * 0.025, life: visual.lightningLife, kind: spell, poolKey });
    }
  }

  private castWater(spell: SpellId, center: THREE.Vector3, target: THREE.Vector3, intensity: number) {
    const mid = target.clone().lerp(center, 0.5).add(new THREE.Vector3(0, 0.18 + intensity * 0.08, 0));
    const curve = new THREE.CatmullRomCurve3([target, mid, center]);
    const visual = SPELL_VISUALS[spell];
    const poolKey = `${spell}:water`;
    const tube = this.acquire(poolKey, () => new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshBasicMaterial({ color: visual.color, transparent: true, opacity: visual.baseOpacity, blending: THREE.AdditiveBlending, depthWrite: false }),
    )) as THREE.Mesh;
    tube.geometry.dispose();
    tube.geometry = new THREE.TubeGeometry(curve, Math.round(24 * this.detailMultiplier), 0.04 * intensity, 8, false);
    const waterMaterial = tube.material as THREE.MeshBasicMaterial;
    waterMaterial.color.setHex(visual.color);
    waterMaterial.opacity = visual.baseOpacity;
    this.group.add(tube);
    this.active.push({ object: tube, age: 0, life: visual.waterLife, kind: spell, poolKey });
  }

  clear() {
    for (const item of this.active) {
      item.object.removeFromParent(); item.object.visible = false;
      const available = this.pool.get(item.poolKey) ?? [];
      available.push(item.object); this.pool.set(item.poolKey, available);
    }
    this.active.length = 0;
    this.setPalmSeal(null, null, false, 0);
  }

  dispose() {
    disposeObjectTrees([this.group, ...[...this.pool.values()].flat()]);
    this.active.length = 0;
    this.pool.clear();
    this.group.clear();
    this.group.removeFromParent();
  }
}
