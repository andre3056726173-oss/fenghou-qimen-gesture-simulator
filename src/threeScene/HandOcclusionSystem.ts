import * as THREE from 'three';

/**
 * Phase 5 integration point for hand segmentation/depth masks. It intentionally
 * has no active mask yet, so it cannot affect MediaPipe or current AR rendering.
 */
export class HandOcclusionSystem {
  readonly group = new THREE.Group();
  enabled = false;

  constructor() {
    this.group.name = 'handOcclusionReservedLayer';
    this.group.visible = false;
    this.group.renderOrder = 10;
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    this.group.visible = enabled;
  }

  /** Reserved for a future segmentation texture / depth mask upload. */
  updateMask(_mask: ImageBitmap | HTMLCanvasElement | null) {
    // Deliberately inert in Phase 4.9.
  }

  dispose() { this.group.clear(); }
}
