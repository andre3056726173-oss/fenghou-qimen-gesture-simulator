import * as THREE from 'three';
import { FORMATION_COLORS, circle, radial, stroke, textSprite, type FormationStroke } from './FormationMaterials';

export class EarthPlate extends THREE.Group {
  readonly strokes: FormationStroke[] = [];

  constructor() {
    super();
    this.name = 'earthPlate';
    const lowY = 0.015;
    [0.34, 0.72, 1.25, 2.02, 3.02, 4.2].forEach((radius, index) => {
      const entry = circle(radius, lowY, index === 4 ? FORMATION_COLORS.bone : FORMATION_COLORS.line, index === 4 ? 0.5 : 0.22);
      this.strokes.push(entry);
      this.add(entry.object);
    });

    [-1.52, -0.5, 0.5, 1.52].forEach((offset) => {
      const vertical = stroke([new THREE.Vector3(offset, lowY, -1.52), new THREE.Vector3(offset, lowY, 1.52)], FORMATION_COLORS.lineDim, 0.2);
      const horizontal = stroke([new THREE.Vector3(-1.52, lowY, offset), new THREE.Vector3(1.52, lowY, offset)], FORMATION_COLORS.lineDim, 0.2);
      this.strokes.push(vertical, horizontal);
      this.add(vertical.object, horizontal.object);
    });

    for (let i = 0; i < 4; i += 1) {
      const angle = i * Math.PI / 2 + Math.PI / 4;
      const entry = radial(angle, 0.34, 4.2, lowY + 0.002, FORMATION_COLORS.bone, 0.31);
      this.strokes.push(entry);
      this.add(entry.object);
    }

    const center = new THREE.Mesh(
      new THREE.RingGeometry(0.23, 0.27, 64),
      new THREE.MeshBasicMaterial({ color: FORMATION_COLORS.active, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
    );
    center.rotation.x = -Math.PI / 2;
    center.position.y = lowY + 0.008;
    center.userData.baseOpacity = 0.66;
    this.add(center);

    const taiji = new THREE.Mesh(
      new THREE.PlaneGeometry(0.48, 0.48),
      new THREE.MeshBasicMaterial({ color: 0x9e967d, transparent: true, opacity: 0, blending: THREE.NormalBlending, depthWrite: false }),
    );
    taiji.rotation.x = -Math.PI / 2;
    taiji.position.y = lowY + 0.02;
    taiji.userData.baseOpacity = 0.58;
    const taijiCanvas = document.createElement('canvas');
    taijiCanvas.width = taijiCanvas.height = 128;
    const ctx = taijiCanvas.getContext('2d')!;
    ctx.fillStyle = '#8d846b';
    ctx.beginPath(); ctx.arc(64, 64, 48, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#111613';
    ctx.beginPath(); ctx.arc(64, 64, 48, -Math.PI / 2, Math.PI / 2); ctx.arc(64, 88, 24, Math.PI / 2, Math.PI * 1.5, true); ctx.arc(64, 40, 24, Math.PI / 2, -Math.PI / 2); ctx.fill();
    const texture = new THREE.CanvasTexture(taijiCanvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    (taiji.material as THREE.MeshBasicMaterial).map = texture;
    this.add(taiji);

    const label = textSprite('中', '#cfc7a6', 64, 0.36);
    label.position.set(0, lowY + 0.035, 0);
    this.add(label);
  }
}
