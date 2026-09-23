export interface Landmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

export interface TrackedHand {
  landmarks: Landmark[];
  handedness: 'Left' | 'Right' | 'Unknown';
  confidence: number;
}

export interface TrackingFrame {
  hands: TrackedHand[];
  timestamp: number;
  fps: number;
}

export type GestureName =
  | 'NO_HAND'
  | 'OPEN_PALM'
  | 'FIST'
  | 'POINTING'
  | 'PINCH'
  | 'PUSH'
  | 'TWO_HANDS_OPEN'
  | 'TWO_HANDS_SCALE'
  | 'NEUTRAL';

export interface GestureSnapshot {
  name: GestureName;
  confidence: number;
  handCount: number;
  palmCenter: { x: number; y: number; z: number } | null;
  palmCenters: Array<{ x: number; y: number; z: number }>;
  landmarks: Landmark[][];
  selectedSector: number | null;
  pinchDistance: number;
  pinchConfirmed: boolean;
  wristAngle: number;
  rotationVelocity: number;
  scaleVelocity: number;
  pushTriggered: boolean;
  /** Raw normalized measurements used by the stability/state layers. */
  openPalm: boolean;
  fist: boolean;
  pointing: boolean;
  openPalmScore: number;
  fistScore: number;
  pointScore: number;
  extendedFingerCount: number;
  curledFingerCount: number;
  pinchActive: boolean;
  twoHandsOpen: boolean;
  twoHandsPinch: boolean;
  handAxisAngle: number;
  palmFacingCamera: boolean;
  handScale: number;
  normalizedPinchDistance: number;
  handDistance: number;
  palmAngle: number;
  indexDirection: { x: number; y: number } | null;
}

export interface PalaceDefinition {
  name: string;
  trigram: string;
  gate: string;
  element: string;
  spell: string;
  color: number;
  cssColor: string;
}
