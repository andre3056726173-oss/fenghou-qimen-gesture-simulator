import * as THREE from 'three';
import { QimenFormation } from '../qimen/QimenFormation';
import {
  FRONT_FORMATION_CENTER,
  FRONT_FORMATION_PITCH,
  FRONT_FORMATION_YAW,
  FRONT_MIN_SPACE_SCALE,
  FRONT_MAX_SPACE_SCALE,
} from '../qimen/FormationStyle';

export interface HandSpaceTarget {
  center: THREE.Vector3;
  depth: number;
  scale: number;
  rotation: number;
  tilt: number;
  yaw: number;
}

/** A damped chest-front coordinate system. It only moves the field while explicitly grabbed. */
export class HandSpaceController {
  readonly target: HandSpaceTarget = {
    center: FRONT_FORMATION_CENTER.clone(),
    depth: FRONT_FORMATION_CENTER.z,
    scale: 1,
    rotation: 0,
    tilt: FRONT_FORMATION_PITCH, yaw: FRONT_FORMATION_YAW,
  };
  private readonly current: HandSpaceTarget = {
    center: this.target.center.clone(), depth: this.target.depth, scale: 1, rotation: 0, tilt: this.target.tilt, yaw: 0,
  };
  private grabOffset = new THREE.Vector3();
  private grabRotationOffset = 0;
  private previousGrabMidpoint = new THREE.Vector3();
  private grabVelocity = new THREE.Vector3();
  private grabbed = false;

  get isGrabbed() { return this.grabbed; }

  setSummonTarget(center: THREE.Vector3) {
    this.target.center.copy(center);
    this.target.depth = center.z;
    this.current.center.copy(center);
    this.current.depth = center.z;
  }

  resetOrientation() {
    this.target.rotation = 0;
    this.target.tilt = FRONT_FORMATION_PITCH;
    this.target.yaw = 0;
    this.current.rotation = 0;
    this.current.tilt = this.target.tilt;
    this.current.yaw = 0;
  }

  beginGrab(midpoint: THREE.Vector3, axisAngle: number) {
    this.grabbed = true;
    this.grabOffset.copy(this.current.center).sub(midpoint);
    this.grabRotationOffset = this.current.rotation - axisAngle;
    this.previousGrabMidpoint.copy(midpoint);
    this.grabVelocity.set(0, 0, 0);
  }

  moveGrab(midpoint: THREE.Vector3, axisAngle: number) {
    if (!this.grabbed) return;
    this.grabVelocity.subVectors(midpoint, this.previousGrabMidpoint).multiplyScalar(0.6);
    this.previousGrabMidpoint.copy(midpoint);
    this.target.center.copy(midpoint).add(this.grabOffset);
    this.target.depth = this.target.center.z;
    this.target.rotation = THREE.MathUtils.clamp(this.grabRotationOffset + axisAngle, -Math.PI / 6, Math.PI / 6);
    this.target.tilt = THREE.MathUtils.clamp(FRONT_FORMATION_PITCH + (midpoint.y - FRONT_FORMATION_CENTER.y) * 0.08, -Math.PI / 6, Math.PI / 6);
    this.target.yaw = THREE.MathUtils.clamp((midpoint.x - this.current.center.x) * 0.06, -Math.PI / 12, Math.PI / 12);
  }

  endGrab() {
    if (!this.grabbed) return;
    this.grabbed = false;
    // A tiny release carry gives the floating formation weight without making it drift.
    this.target.center.add(this.grabVelocity.multiplyScalar(0.8));
    this.target.depth = this.target.center.z;
  }

  setScale(scale: number, velocity = 0) {
    this.target.scale = THREE.MathUtils.clamp(scale + THREE.MathUtils.clamp(velocity, -2.5, 2.5) * 0.035, FRONT_MIN_SPACE_SCALE, FRONT_MAX_SPACE_SCALE);
  }

  reset() {
    this.grabbed = false;
    this.grabVelocity.set(0, 0, 0);
    this.target.scale = this.current.scale = 1;
    this.setSummonTarget(FRONT_FORMATION_CENTER);
    this.resetOrientation();
  }

  update(delta: number, formation: QimenFormation) {
    const positionAlpha = 1 - Math.pow(0.001, delta * 5.4);
    const rotationAlpha = 1 - Math.pow(0.001, delta * 6.2);
    this.current.center.lerp(this.target.center, positionAlpha);
    this.current.depth += (this.target.depth - this.current.depth) * positionAlpha;
    this.current.scale += (this.target.scale - this.current.scale) * positionAlpha;
    this.current.rotation = THREE.MathUtils.lerp(this.current.rotation, this.target.rotation, rotationAlpha);
    this.current.tilt = THREE.MathUtils.lerp(this.current.tilt, this.target.tilt, rotationAlpha);
    this.current.yaw = THREE.MathUtils.lerp(this.current.yaw, this.target.yaw, rotationAlpha);
    formation.setSpaceScale(this.current.scale);
    formation.setWorldTransform(this.current.center, this.current.tilt, this.current.rotation, this.current.yaw);
  }
}
