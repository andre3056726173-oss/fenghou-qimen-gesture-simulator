import * as THREE from 'three';
import { FORMATION_COLORS, circle, radial, stroke, textSprite, type FormationStroke } from './FormationMaterials';
import { PALACES } from './palaces';

export class HumanPlate extends THREE.Group {
  readonly strokes: FormationStroke[] = [];
  readonly palaceLabels: THREE.Sprite[] = [];

  constructor() {
    super();
    this.name = 'humanPlate';
    const y = 0.04;
    [1.62, 2.55, 3.42].forEach((radius, index) => {
      const entry = circle(radius, y, index === 1 ? FORMATION_COLORS.bone : FORMATION_COLORS.line, index === 1 ? 0.46 : 0.23);
      this.strokes.push(entry);
      this.add(entry.object);
    });

    PALACES.forEach((palace, index) => {
      const angle = Math.PI / 2 - index * Math.PI / 4;
      const boundary = radial(angle - Math.PI / 8, 1.6, 3.42, y + 0.004, FORMATION_COLORS.line, 0.38);
      this.strokes.push(boundary);
      this.add(boundary.object);

      const gate = textSprite(palace.gate, '#b8ae91', 55, 0.38);
      gate.position.set(Math.cos(angle) * 2.18, y + 0.045, Math.sin(angle) * 2.18);
      this.palaceLabels.push(gate);
      this.add(gate);
    });

    const square = stroke([
      new THREE.Vector3(-1.28, y + 0.006, -1.28), new THREE.Vector3(1.28, y + 0.006, -1.28),
      new THREE.Vector3(1.28, y + 0.006, -1.28), new THREE.Vector3(1.28, y + 0.006, 1.28),
      new THREE.Vector3(1.28, y + 0.006, 1.28), new THREE.Vector3(-1.28, y + 0.006, 1.28),
      new THREE.Vector3(-1.28, y + 0.006, 1.28), new THREE.Vector3(-1.28, y + 0.006, -1.28),
    ], FORMATION_COLORS.bone, 0.18, true);
    this.strokes.push(square);
    this.add(square.object);
  }
}
