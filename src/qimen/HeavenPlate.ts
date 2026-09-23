import * as THREE from 'three';
import { FORMATION_COLORS, circle, radial, textSprite, type FormationStroke } from './FormationMaterials';
import { PALACES } from './palaces';

export class HeavenPlate extends THREE.Group {
  readonly strokes: FormationStroke[] = [];
  readonly trigramLabels: THREE.Sprite[] = [];

  constructor() {
    super();
    this.name = 'heavenPlate';
    const y = 0.072;
    [3.56, 3.82].forEach((radius, index) => {
      const entry = circle(radius, y, index ? FORMATION_COLORS.bone : FORMATION_COLORS.line, index ? 0.38 : 0.26);
      this.strokes.push(entry);
      this.add(entry.object);
    });
    PALACES.forEach((palace, index) => {
      const angle = Math.PI / 2 - index * Math.PI / 4;
      const line = radial(angle, 3.03, 4.18, y + 0.004, FORMATION_COLORS.line, 0.24);
      this.strokes.push(line);
      this.add(line.object);
      const trigram = textSprite(palace.trigram, '#cfc7a6', 90, 0.56);
      trigram.position.set(Math.cos(angle) * 3.66, y + 0.045, Math.sin(angle) * 3.66);
      this.trigramLabels.push(trigram);
      this.add(trigram);
    });
    const stems = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸', '子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
    stems.forEach((stem, index) => {
      const angle = Math.PI / 2 - index * Math.PI * 2 / stems.length;
      const label = textSprite(stem, index < 10 ? '#b6a66e' : '#799d91', 50, 0.25);
      label.position.set(Math.cos(angle) * 4.02, y + 0.04, Math.sin(angle) * 4.02);
      this.add(label);
    });
  }
}
