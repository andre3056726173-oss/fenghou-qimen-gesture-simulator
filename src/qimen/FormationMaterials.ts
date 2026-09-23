import * as THREE from 'three';

export const FORMATION_COLORS = {
  ink: 0x020504,
  line: 0x6b9e93,
  lineDim: 0x345c55,
  bone: 0xb59a5e,
  paper: 0xcfc7a6,
  qi: 0xa6eee0,
  active: 0xd8b562,
};

export interface FormationStroke {
  object: THREE.Line | THREE.LineSegments;
  material: THREE.LineBasicMaterial;
  count: number;
  baseOpacity: number;
}

export function stroke(points: THREE.Vector3[], color: number, opacity = 0.38, segments = false): FormationStroke {
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const object = segments ? new THREE.LineSegments(geometry, material) : new THREE.Line(geometry, material);
  geometry.setDrawRange(0, 0);
  material.userData.baseOpacity = opacity;
  return { object, material, count: points.length, baseOpacity: opacity };
}

export function circle(radius: number, y: number, color = FORMATION_COLORS.line, opacity = 0.42, divisions = 192) {
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= divisions; i += 1) {
    const angle = (i / divisions) * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(angle) * radius, y, Math.sin(angle) * radius));
  }
  return stroke(points, color, opacity);
}

export function radial(angle: number, start: number, end: number, y: number, color = FORMATION_COLORS.line, opacity = 0.34) {
  return stroke([
    new THREE.Vector3(Math.cos(angle) * start, y, Math.sin(angle) * start),
    new THREE.Vector3(Math.cos(angle) * end, y, Math.sin(angle) * end),
  ], color, opacity);
}

export function textSprite(text: string, color = '#cfc7a6', size = 70, scale = 0.44) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d')!;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = `500 ${size}px "STKaiti", "KaiTi", "Noto Serif SC", serif`;
  context.fillStyle = color;
  context.shadowColor = color;
  context.shadowBlur = 8;
  context.fillText(text, 128, 132);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  material.userData.baseOpacity = 0.72;
  const sprite = new THREE.Sprite(material);
  sprite.scale.setScalar(scale);
  return sprite;
}

export function setStrokeProgress(entry: FormationStroke, progress: number) {
  const value = THREE.MathUtils.clamp(progress, 0, 1);
  entry.object.geometry.setDrawRange(0, Math.max(0, Math.ceil(entry.count * value)));
  entry.material.opacity = entry.baseOpacity * value;
}

export function setGroupOpacity(group: THREE.Object3D, progress: number) {
  group.traverse((child) => {
    const material = (child as THREE.Mesh | THREE.Line | THREE.Sprite).material as THREE.Material & { opacity?: number; userData?: any } | undefined;
    if (!material || typeof material.opacity !== 'number') return;
    const base = material.userData?.baseOpacity ?? 0.72;
    material.opacity = base * THREE.MathUtils.clamp(progress, 0, 1);
  });
}

export function groundPoints(radius: number, y: number, divisions = 144) {
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= divisions; i += 1) {
    const angle = (i / divisions) * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(angle) * radius, y, Math.sin(angle) * radius));
  }
  return points;
}
