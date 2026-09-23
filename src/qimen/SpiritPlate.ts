import * as THREE from 'three';
import { FORMATION_COLORS, circle, radial, textSprite, type FormationStroke } from './FormationMaterials';

export class SpiritPlate extends THREE.Group {
  readonly strokes: FormationStroke[] = [];
  readonly outerRim: THREE.Mesh;

  constructor() {
    super();
    this.name = 'spiritPlate';
    const y = 0.105;
    this.outerRim = new THREE.Mesh(
      new THREE.TorusGeometry(5.12, 0.026, 6, 192),
      new THREE.MeshBasicMaterial({ color: FORMATION_COLORS.bone, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    this.outerRim.rotation.x = -Math.PI / 2;
    this.outerRim.position.y = y + 0.006;
    this.outerRim.userData.baseOpacity = 0.56;
    this.add(this.outerRim);
    [4.34, 4.7, 5.08].forEach((radius, index) => {
      const entry = circle(radius, y, index === 1 ? FORMATION_COLORS.bone : FORMATION_COLORS.lineDim, index === 1 ? 0.32 : 0.18);
      this.strokes.push(entry);
      this.add(entry.object);
    });
    for (let i = 0; i < 72; i += 1) {
      const angle = i * Math.PI * 2 / 72;
      const long = i % 9 === 0;
      const entry = radial(angle, 4.96, long ? 5.19 : 5.08, y + 0.004, long ? FORMATION_COLORS.bone : FORMATION_COLORS.lineDim, long ? 0.42 : 0.18);
      this.strokes.push(entry);
      this.add(entry.object);
    }
    const symbols = ['天', '地', '人', '神', '门', '星', '奇', '仪', '阴', '阳', '遁', '局'];
    symbols.forEach((symbol, index) => {
      const angle = Math.PI / 2 - index * Math.PI * 2 / symbols.length;
      const label = textSprite(symbol, index % 3 === 0 ? '#c8af6d' : '#789c90', 48, 0.28);
      label.position.set(Math.cos(angle) * 4.66, y + 0.045, Math.sin(angle) * 4.66);
      this.add(label);
    });
  }
}
