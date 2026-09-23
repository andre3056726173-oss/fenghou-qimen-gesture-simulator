import * as THREE from 'three';

function makeGroundTexture() {
  const size = 2048;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const center = size / 2;

  const wash = ctx.createRadialGradient(center, center, 40, center, center, center);
  wash.addColorStop(0, '#102825');
  wash.addColorStop(0.35, '#071512');
  wash.addColorStop(0.78, '#020806');
  wash.addColorStop(1, '#000302');
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, size, size);

  // Stone and ink grain: deterministic-looking but intentionally irregular.
  for (let i = 0; i < 2200; i += 1) {
    const alpha = Math.random() * 0.055;
    ctx.fillStyle = `rgba(177, 203, 185, ${alpha})`;
    const x = Math.random() * size;
    const y = Math.random() * size;
    const length = 2 + Math.random() * 24;
    ctx.fillRect(x, y, length, Math.random() * 1.4 + 0.3);
  }

  ctx.save();
  ctx.translate(center, center);
  ctx.strokeStyle = 'rgba(198, 160, 76, .22)';
  ctx.lineWidth = 2;
  [470, 610, 760, 915].forEach((radius, index) => {
    ctx.setLineDash(index % 2 ? [14, 20] : []);
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.stroke();
  });

  ctx.setLineDash([]);
  for (let i = 0; i < 8; i += 1) {
    const angle = i * Math.PI / 4;
    ctx.beginPath();
    ctx.moveTo(Math.cos(angle) * 430, Math.sin(angle) * 430);
    ctx.lineTo(Math.cos(angle) * 955, Math.sin(angle) * 955);
    ctx.stroke();
  }

  const directions = ['离', '坤', '兑', '乾', '坎', '艮', '震', '巽'];
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '500 96px "STKaiti", "KaiTi", serif';
  directions.forEach((label, index) => {
    const angle = Math.PI / 2 - index * Math.PI / 4;
    ctx.save();
    ctx.translate(Math.cos(angle) * 850, -Math.sin(angle) * 850);
    ctx.shadowColor = '#d7ad57';
    ctx.shadowBlur = 18;
    ctx.fillStyle = 'rgba(224, 190, 107, .62)';
    ctx.fillText(label, 0, 0);
    ctx.restore();
  });
  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function mistTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 62);
  gradient.addColorStop(0, 'rgba(187,255,239,.42)');
  gradient.addColorStop(0.3, 'rgba(67,220,193,.17)');
  gradient.addColorStop(1, 'rgba(6,42,38,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

export class DomainField {
  readonly group = new THREE.Group();
  private mist: THREE.Points;
  private beaconMaterials: THREE.MeshBasicMaterial[] = [];
  private energyColumn: THREE.Mesh;

  constructor() {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(24, 24),
      new THREE.MeshBasicMaterial({ map: makeGroundTexture(), color: 0x9bbdb1, transparent: true, opacity: 0.94, depthWrite: true }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.22;
    ground.position.z = -0.6;
    this.group.add(ground);

    const boundaryMaterial = new THREE.MeshBasicMaterial({ color: 0xcaa65b, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending });
    [4.8, 5.45, 6.4].forEach((radius, index) => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, index === 0 ? 0.018 : 0.009, 5, 220), boundaryMaterial.clone());
      ring.rotation.x = Math.PI / 2;
      ring.position.y = -0.13;
      ring.position.z = -0.6;
      this.group.add(ring);
    });

    for (let i = 0; i < 8; i += 1) {
      const angle = Math.PI / 2 - i * Math.PI / 4;
      const material = new THREE.MeshBasicMaterial({ color: i % 2 ? 0x45d9bc : 0xd3af61, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending });
      const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.09, 2.8, 8, 1, true), material);
      beacon.position.set(Math.cos(angle) * 5.15, 1.15, Math.sin(angle) * 5.15 - 0.6);
      this.beaconMaterials.push(material);
      this.group.add(beacon);
    }

    const mistCount = 720;
    const positions = new Float32Array(mistCount * 3);
    for (let i = 0; i < mistCount; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 1.2 + Math.random() * 8.5;
      positions[i * 3] = Math.cos(angle) * radius;
      positions[i * 3 + 1] = -0.05 + Math.random() * 0.9;
      positions[i * 3 + 2] = Math.sin(angle) * radius - 0.6;
    }
    const mistGeometry = new THREE.BufferGeometry();
    mistGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.mist = new THREE.Points(mistGeometry, new THREE.PointsMaterial({
      map: mistTexture(), color: 0x5ce6ca, size: 0.14, transparent: true, opacity: 0.28,
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
    }));
    this.group.add(this.mist);

    this.energyColumn = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.46, 6.2, 48, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x81ffe1, transparent: true, opacity: 0.028, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    this.energyColumn.position.set(0, 2.75, -0.6);
    this.group.add(this.energyColumn);
  }

  pulse(strength = 1) {
    this.energyColumn.userData.pulse = Math.max(this.energyColumn.userData.pulse ?? 0, strength);
  }

  update(delta: number, elapsed: number) {
    this.mist.rotation.y += delta * 0.018;
    this.beaconMaterials.forEach((material, index) => {
      material.opacity = 0.18 + Math.max(0, Math.sin(elapsed * 2.2 - index * 0.72)) * 0.26;
    });
    const pulse = Math.max(0, (this.energyColumn.userData.pulse ?? 0) - delta * 0.9);
    this.energyColumn.userData.pulse = pulse;
    this.energyColumn.scale.setScalar(1 + pulse * 0.42);
    (this.energyColumn.material as THREE.MeshBasicMaterial).opacity = 0.024 + pulse * 0.07 + Math.sin(elapsed * 2) * 0.007;
  }
}
