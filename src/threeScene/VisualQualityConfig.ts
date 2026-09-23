export type VisualQualityLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CINEMATIC';

/**
 * One source of truth for render-cost decisions.  Gesture smoothing never reads
 * this object: quality can change without changing recognition behaviour.
 */
export interface VisualQualitySettings {
  bloomStrength: number;
  bloomRadius: number;
  bloomThreshold: number;
  glow: number;
  particleMultiplier: number;
  distortion: boolean;
  motionBlur: boolean;
  formationDetail: number;
  spellDetail: number;
  cameraEffects: number;
  pixelRatioCap: number;
}

export const VISUAL_QUALITY: Record<VisualQualityLevel, VisualQualitySettings> = {
  LOW: {
    bloomStrength: 0.10, bloomRadius: 0.28, bloomThreshold: 0.56,
    glow: 0.55, particleMultiplier: 0.45, distortion: false, motionBlur: false,
    formationDetail: 0.68, spellDetail: 0.55, cameraEffects: 0.55, pixelRatioCap: 1,
  },
  MEDIUM: {
    bloomStrength: 0.17, bloomRadius: 0.32, bloomThreshold: 0.54,
    glow: 0.78, particleMultiplier: 0.72, distortion: false, motionBlur: false,
    formationDetail: 0.84, spellDetail: 0.78, cameraEffects: 0.78, pixelRatioCap: 1.35,
  },
  HIGH: {
    // Mirrors the previous shipped appearance.
    bloomStrength: 0.24, bloomRadius: 0.36, bloomThreshold: 0.52,
    glow: 1, particleMultiplier: 1, distortion: true, motionBlur: false,
    formationDetail: 1, spellDetail: 1, cameraEffects: 1, pixelRatioCap: 1.7,
  },
  CINEMATIC: {
    bloomStrength: 0.30, bloomRadius: 0.40, bloomThreshold: 0.48,
    glow: 1.18, particleMultiplier: 1.3, distortion: true, motionBlur: true,
    formationDetail: 1.15, spellDetail: 1.28, cameraEffects: 1.1, pixelRatioCap: 2,
  },
};

export function qualityFromPerformanceTier(tier: 'HIGH' | 'MEDIUM' | 'LOW'): VisualQualityLevel {
  return tier;
}
