import * as THREE from 'three';

/** A restrained center-to-palace qi path used by the formation demo. */
export class EnergyFlow {
  readonly group = new THREE.Group();
  private readonly line: THREE.Line;
  private readonly points: THREE.Points;
  private readonly positionAttribute: THREE.BufferAttribute;
  private path: THREE.Vector3[] = [];
  private activeProgress = 0;
  private targetProgress = 0;
  private phase = 0;
  private activeSector: number | null = null;
  private readonly sample = new THREE.Vector3();

  constructor() {
    this.group.name = 'energyFlow';
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0xa6eee0, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    lineMaterial.userData.baseOpacity = 0.72;
    this.line = new THREE.Line(new THREE.BufferGeometry(), lineMaterial);
    this.group.add(this.line);

    const positions = new Float32Array(36 * 3);
    const geometry = new THREE.BufferGeometry();
    this.positionAttribute = new THREE.BufferAttribute(positions, 3);
    geometry.setAttribute('position', this.positionAttribute);
    const material = new THREE.PointsMaterial({ color: 0xd8b562, size: 0.07, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
    this.points = new THREE.Points(geometry, material);
    this.group.add(this.points);
  }

  activate(sector: number, progress: number) {
    this.targetProgress = THREE.MathUtils.clamp(progress, 0, 1);
    if (this.activeSector === sector && this.path.length > 1) return;
    this.activeProgress *= 0.3;
    this.activeSector = sector;
    const angle = Math.PI / 2 - sector * Math.PI / 4;
    const direction = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    const side = new THREE.Vector3(-direction.z, 0, direction.x);
    this.path = [
      new THREE.Vector3(0, 0.14, 0),
      direction.clone().multiplyScalar(0.72).add(new THREE.Vector3(0, 0.15, 0)),
      direction.clone().multiplyScalar(2.25).add(side.clone().multiplyScalar(0.12)).add(new THREE.Vector3(0, 0.13, 0)),
      direction.clone().multiplyScalar(4.35).add(new THREE.Vector3(0, 0.12, 0)),
    ];
    this.line.geometry.dispose();
    this.line.geometry = new THREE.BufferGeometry().setFromPoints(this.path);
    this.line.geometry.setDrawRange(0, 0);
    this.phase = 0;
  }

  update(delta: number, elapsed: number) {
    this.activeProgress += (this.targetProgress - this.activeProgress) * Math.min(1, delta * 5.2);
    const visible = this.activeProgress > 0.002 && this.path.length > 1;
    this.line.visible = visible;
    this.points.visible = visible;
    if (!visible) return;

    const drawCount = Math.max(2, Math.ceil(this.path.length * THREE.MathUtils.smoothstep(this.activeProgress, 0, 1)));
    this.line.geometry.setDrawRange(0, drawCount);
    (this.line.material as THREE.LineBasicMaterial).opacity = 0.65 * this.activeProgress;
    (this.points.material as THREE.PointsMaterial).opacity = 0.55 * this.activeProgress;
    this.phase += delta * (1.1 + this.activeProgress * 2.6);

    for (let i = 0; i < 36; i += 1) {
      const t = (i / 36 + this.phase * 0.08) % 1;
      const point = this.samplePath(t);
      const wobble = Math.sin(elapsed * 1.8 + i * 0.7) * 0.015 * this.activeProgress;
      this.positionAttribute.setXYZ(i, point.x, point.y + wobble, point.z);
    }
    this.positionAttribute.needsUpdate = true;
  }

  reset() {
    this.activeProgress = 0;
    this.targetProgress = 0;
    this.activeSector = null;
    this.line.visible = false;
    this.points.visible = false;
  }

  deactivate() {
    this.targetProgress = 0;
  }

  private samplePath(t: number) {
    const segments = this.path.length - 1;
    const scaled = t * segments;
    const index = Math.min(segments - 1, Math.floor(scaled));
    const local = scaled - index;
    return this.sample.copy(this.path[index]).lerp(this.path[index + 1], local);
  }
}
