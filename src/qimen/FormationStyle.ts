import * as THREE from 'three';

/** Visual layout switch. Keep the old ground-domain option available for later experiments. */
export type FormationStyle = 'FRONT_CIRCLE' | 'GROUND_DOMAIN';

export const FORMATION_STYLE: FormationStyle = 'FRONT_CIRCLE';
export const FRONT_FLOATING_FORMATION = 'FRONT_FLOATING_FORMATION' as const;

/** Local XZ artwork becomes a camera-facing XY disc after this base rotation. */
export const FRONT_PLANE_ROTATION = Math.PI / 2;
export const FRONT_FORMATION_PITCH = THREE.MathUtils.degToRad(-8);
export const FRONT_FORMATION_YAW = 0;
export const FRONT_FORMATION_ROLL = 0;

export const FRONT_FORMATION_CENTER = new THREE.Vector3(0, 1.38, -1.85);
export const FRONT_FORMATION_SCALE = 1.0;
export const FRONT_MIN_SPACE_SCALE = 0.72;
export const FRONT_MAX_SPACE_SCALE = 1.82;
export const FRONT_PLATE_DEPTHS = [0, 0.02, 0.05, 0.08] as const;
