import * as THREE from 'three';

/** Disposes owned scene resources once. Sprite geometry is shared internally by Three.js. */
export function disposeObjectTrees(roots: THREE.Object3D[]) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  roots.forEach((root) => root.traverse((child) => {
    const renderable = child as THREE.Mesh;
    if (!(child as THREE.Sprite).isSprite && renderable.geometry) geometries.add(renderable.geometry);
    const material = renderable.material;
    if (material) (Array.isArray(material) ? material : [material]).forEach((item) => materials.add(item));
  }));
  materials.forEach((material) => {
    Object.values(material).forEach((value) => { if (value?.isTexture) textures.add(value); });
    const uniforms = (material as THREE.ShaderMaterial).uniforms;
    if (uniforms) Object.values(uniforms).forEach(({ value }) => { if (value?.isTexture) textures.add(value); });
  });
  textures.forEach((texture) => texture.dispose());
  materials.forEach((material) => material.dispose());
  geometries.forEach((geometry) => geometry.dispose());
}

export function resetPooledTransform(object: THREE.Object3D) {
  object.removeFromParent();
  object.position.set(0, 0, 0);
  object.quaternion.identity();
  object.scale.set(1, 1, 1);
  object.visible = true;
  object.updateMatrix();
}
