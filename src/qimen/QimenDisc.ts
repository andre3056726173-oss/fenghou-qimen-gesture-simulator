import * as THREE from 'three';
import { HEAVENLY_STEMS_AND_BRANCHES, PALACES } from './palaces';

function textSprite(text: string, color = '#ead79b', size = 68, weight = 500) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d')!;
  context.clearRect(0, 0, 256, 256);
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.shadowColor = color;
  context.shadowBlur = 11;
  context.fillStyle = color;
  context.font = `${weight} ${size}px "STKaiti", "KaiTi", "Noto Serif SC", serif`;
  context.fillText(text, 128, 132);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(0.72, 0.72, 1);
  return sprite;
}

function circleLine(radius: number, color: number, opacity = 0.65, segments = 160) {
  const points = Array.from({ length: segments + 1 }, (_, i) => {
    const angle = (i / segments) * Math.PI * 2;
    return new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, 0);
  });
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  return new THREE.Line(geometry, new THREE.LineBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending }));
}

function taijiTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  const c = 256;
  const r = 214;
  ctx.clearRect(0, 0, 512, 512);
  ctx.save();
  ctx.beginPath();
  ctx.arc(c, c, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = '#020504';
  ctx.fillRect(0, 0, 512, 512);
  ctx.fillStyle = '#9f967a';
  ctx.beginPath();
  ctx.arc(c, c, r, -Math.PI / 2, Math.PI / 2);
  ctx.arc(c, c + r / 2, r / 2, Math.PI / 2, Math.PI * 1.5, true);
  ctx.arc(c, c - r / 2, r / 2, Math.PI / 2, -Math.PI / 2, false);
  ctx.fill();
  ctx.fillStyle = '#020504';
  ctx.beginPath(); ctx.arc(c, c - r / 2, 28, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#9f967a';
  ctx.beginPath(); ctx.arc(c, c + r / 2, 28, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.strokeStyle = '#cda856';
  ctx.lineWidth = 6;
  ctx.shadowColor = '#d5ad57';
  ctx.shadowBlur = 12;
  ctx.beginPath(); ctx.arc(c, c, r, 0, Math.PI * 2); ctx.stroke();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export class QimenDisc {
  readonly group = new THREE.Group();
  readonly outer = new THREE.Group();
  readonly middle = new THREE.Group();
  readonly inner = new THREE.Group();
  private sectorMeshes: THREE.Mesh[] = [];
  private sectorLabels: THREE.Sprite[] = [];
  private targetScale = 0.08;
  private currentScale = 0.08;
  private targetOpacity = 0.18;
  private selectedSector: number | null = null;
  private rotationVelocity = 0.08;
  private confirmedPulse = 0;

  constructor() {
    this.group.add(this.outer, this.middle, this.inner);
    this.group.rotation.x = -Math.PI / 2;
    this.group.position.z = -0.6;
    this.group.scale.setScalar(this.currentScale);
    this.buildOuterLayer();
    this.buildMiddleLayer();
    this.buildInnerLayer();
  }

  private buildOuterLayer() {
    const cyan = 0x45cdb5;
    const gold = 0xd2ac59;
    [3.15, 3.42, 3.74, 3.92].forEach((radius, index) => this.outer.add(circleLine(radius, index % 2 ? gold : cyan, 0.34 + index * 0.06)));

    const tickGeometry = new THREE.BoxGeometry(0.012, 0.17, 0.012);
    const tickMaterial = new THREE.MeshBasicMaterial({ color: gold, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending });
    const ticks = new THREE.InstancedMesh(tickGeometry, tickMaterial, 96);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < 96; i += 1) {
      const angle = (i / 96) * Math.PI * 2;
      dummy.position.set(Math.cos(angle) * 3.83, Math.sin(angle) * 3.83, 0);
      dummy.rotation.z = angle - Math.PI / 2;
      dummy.scale.y = i % 4 === 0 ? 1.7 : 0.7;
      dummy.updateMatrix();
      ticks.setMatrixAt(i, dummy.matrix);
    }
    this.outer.add(ticks);

    HEAVENLY_STEMS_AND_BRANCHES.forEach((character, index) => {
      const angle = Math.PI / 2 - (index / HEAVENLY_STEMS_AND_BRANCHES.length) * Math.PI * 2;
      const label = textSprite(character, index < 10 ? '#e1bd6b' : '#8bcfbd', 58, 500);
      label.position.set(Math.cos(angle) * 3.56, Math.sin(angle) * 3.56, 0.04);
      label.scale.setScalar(0.33);
      this.outer.add(label);
    });
  }

  private buildMiddleLayer() {
    const arc = Math.PI / 4;
    PALACES.forEach((palace, index) => {
      const start = Math.PI / 2 - arc / 2 - index * arc;
      const geometry = new THREE.RingGeometry(2.2, 3.04, 40, 1, start - arc, arc * 0.94);
      const material = new THREE.MeshBasicMaterial({
        color: 0x183832,
        transparent: true,
        opacity: 0.018,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const sector = new THREE.Mesh(geometry, material);
      sector.position.z = -0.02;
      this.middle.add(sector);
      this.sectorMeshes.push(sector);

      const angle = Math.PI / 2 - index * arc;
      const trigram = textSprite(palace.trigram, index % 2 ? '#ddb968' : '#8cd8c4', 92, 600);
      trigram.position.set(Math.cos(angle) * 2.68, Math.sin(angle) * 2.68, 0.09);
      trigram.scale.set(0.62, 0.62, 1);
      this.middle.add(trigram);
      this.sectorLabels.push(trigram);

      const gate = textSprite(palace.gate, '#d9c78d', 54, 500);
      gate.position.set(Math.cos(angle) * 1.91, Math.sin(angle) * 1.91, 0.11);
      gate.scale.set(0.48, 0.48, 1);
      this.middle.add(gate);

      const radial = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(Math.cos(start) * 1.56, Math.sin(start) * 1.56, 0.02),
        new THREE.Vector3(Math.cos(start) * 3.05, Math.sin(start) * 3.05, 0.02),
      ]);
      this.middle.add(new THREE.Line(radial, new THREE.LineBasicMaterial({ color: 0xc7a65d, transparent: true, opacity: 0.32 })));
    });
    [1.55, 2.15, 3.07].forEach((radius, index) => this.middle.add(circleLine(radius, index === 1 ? 0xcda958 : 0x54cbb4, 0.34)));
  }

  private buildInnerLayer() {
    const gridMaterial = new THREE.LineBasicMaterial({ color: 0xd9b867, transparent: true, opacity: 0.44, blending: THREE.AdditiveBlending });
    const points: THREE.Vector3[] = [];
    [-0.55, 0.55].forEach((offset) => {
      points.push(new THREE.Vector3(offset, -1.55, 0.02), new THREE.Vector3(offset, 1.55, 0.02));
      points.push(new THREE.Vector3(-1.55, offset, 0.02), new THREE.Vector3(1.55, offset, 0.02));
    });
    const grid = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points), gridMaterial);
    this.inner.add(grid, circleLine(1.48, 0xdab866, 0.7), circleLine(1.22, 0x54f5d3, 0.32));

    const taiji = new THREE.Mesh(
      new THREE.PlaneGeometry(1.25, 1.25),
      new THREE.MeshBasicMaterial({ map: taijiTexture(), transparent: true, opacity: 0.82, depthWrite: false, blending: THREE.NormalBlending }),
    );
    taiji.position.z = 0.12;
    this.inner.add(taiji);

    const core = new THREE.Mesh(
      new THREE.TorusGeometry(0.78, 0.018, 8, 96),
      new THREE.MeshBasicMaterial({ color: 0xd4ad5d, transparent: true, opacity: 0.68, blending: THREE.AdditiveBlending }),
    );
    core.position.z = 0.08;
    this.inner.add(core);

    ['九', '星', '遁', '甲'].forEach((char, index) => {
      const angle = Math.PI / 4 + index * Math.PI / 2;
      const rune = textSprite(char, '#e4c26e', 60, 500);
      rune.position.set(Math.cos(angle) * 1.02, Math.sin(angle) * 1.02, 0.08);
      rune.scale.setScalar(0.32);
      this.inner.add(rune);
    });
  }

  summon(expanded = false) {
    this.targetScale = expanded ? 1.34 : 1.02;
    this.targetOpacity = 1;
  }

  dismiss() {
    this.targetScale = 0.08;
    this.targetOpacity = 0.16;
  }

  setScaleVelocity(velocity: number) {
    if (Math.abs(velocity) > 0.04) this.targetScale = THREE.MathUtils.clamp(this.targetScale + velocity * 0.018, 0.55, 1.36);
  }

  setRotationVelocity(velocity: number) {
    const desired = Math.abs(velocity) > 0.08 ? velocity : 0.08;
    this.rotationVelocity += (desired - this.rotationVelocity) * 0.2;
  }

  select(index: number | null, confirmed = false) {
    this.selectedSector = index;
    if (confirmed) this.confirmedPulse = 1;
  }

  update(delta: number, elapsed: number) {
    this.currentScale += (this.targetScale - this.currentScale) * Math.min(1, delta * 6.5);
    const breath = 1 + Math.sin(elapsed * 1.7) * 0.008;
    this.group.scale.setScalar(this.currentScale * breath);
    this.group.position.y = Math.sin(elapsed * 0.65) * 0.055;

    const speed = this.rotationVelocity * delta;
    this.outer.rotation.z -= speed;
    this.middle.rotation.z -= speed * 0.7;
    this.inner.rotation.z += speed * 0.4;
    this.rotationVelocity *= Math.pow(0.968, delta * 60);
    if (Math.abs(this.rotationVelocity) < 0.08) this.rotationVelocity = 0.08;

    this.confirmedPulse = Math.max(0, this.confirmedPulse - delta * 1.8);
    this.sectorMeshes.forEach((mesh, index) => {
      const material = mesh.material as THREE.MeshBasicMaterial;
      const selected = index === this.selectedSector;
      const palace = PALACES[index];
      material.color.setHex(selected ? palace.color : 0x183832);
      const pulse = selected ? 0.13 + Math.sin(elapsed * 7) * 0.035 + this.confirmedPulse * 0.22 : 0.015;
      material.opacity += (pulse * this.targetOpacity - material.opacity) * Math.min(1, delta * 10);
      const label = this.sectorLabels[index];
      const target = selected ? 0.78 + this.confirmedPulse * 0.18 : 0.62;
      label.scale.lerp(new THREE.Vector3(target, target, 1), Math.min(1, delta * 9));
      label.position.z = selected ? 0.18 + Math.sin(elapsed * 5) * 0.025 : 0.09;
    });
  }
}
