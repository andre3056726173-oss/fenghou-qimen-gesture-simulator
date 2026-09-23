import * as THREE from 'three';

/** Pick the actual moving plate in its own coordinates, including parent and local transforms. */
export function intersectPlateLocal(ray: THREE.Ray, plate: THREE.Object3D, localY: number, target = new THREE.Vector3()) {
  plate.updateWorldMatrix(true, false);
  const inverse = new THREE.Matrix4().copy(plate.matrixWorld).invert();
  const localRay = ray.clone().applyMatrix4(inverse);
  return localRay.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -localY), target);
}

export function sectorPoint(sector: number, radius: number, depth: number, target = new THREE.Vector3()) {
  const angle = Math.PI / 2 - sector * Math.PI / 4;
  return target.set(Math.cos(angle) * radius, depth, Math.sin(angle) * radius);
}

export function sectorFromLocalPoint(x: number, z: number) {
  const angle = Math.atan2(z, x);
  return ((Math.round((Math.PI / 2 - angle) / (Math.PI / 4)) % 8) + 8) % 8;
}
