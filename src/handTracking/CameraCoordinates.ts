/** The preview is mirrored like a normal selfie camera. All screen-space consumers use this helper. */
export const CAMERA_MIRROR_ENABLED = true;

export function screenXFromLandmark(x: number) {
  return CAMERA_MIRROR_ENABLED ? 1 - x : x;
}

let videoWidth = 1280;
let videoHeight = 720;
export function setCameraDimensions(width: number, height: number) {
  if (width > 0 && height > 0) { videoWidth = width; videoHeight = height; }
}

/** Matches the preview's object-fit:cover crop. Recognition remains in uncropped normalized coordinates. */
export function landmarkToViewport(x: number, y: number, width: number, height: number, sourceWidth = videoWidth, sourceHeight = videoHeight) {
  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  return {
    x: ((screenXFromLandmark(x) - 0.5) * sourceWidth * scale + width / 2) / width,
    y: ((y - 0.5) * sourceHeight * scale + height / 2) / height,
  };
}
