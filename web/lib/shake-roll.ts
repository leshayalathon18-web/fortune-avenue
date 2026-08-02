export const SHAKE_DELTA_THRESHOLD = 7.5;
export const SHAKE_ROTATION_THRESHOLD = 115;
export const SHAKE_HITS_REQUIRED = 3;
export const SHAKE_HIT_WINDOW_MS = 850;
export const SHAKE_SETTLE_MS = 560;

export type MotionVector = {
  x: number;
  y: number;
  z: number;
};

export type RotationVector = {
  alpha: number;
  beta: number;
  gamma: number;
};

export function motionDelta(previous: MotionVector, current: MotionVector) {
  return Math.hypot(
    current.x - previous.x,
    current.y - previous.y,
    current.z - previous.z,
  );
}

export function rotationMagnitude(rotation: RotationVector) {
  return Math.hypot(rotation.alpha, rotation.beta, rotation.gamma);
}

export function isShakeImpulse(
  previous: MotionVector,
  current: MotionVector,
  rotation: RotationVector,
) {
  return motionDelta(previous, current) >= SHAKE_DELTA_THRESHOLD
    || rotationMagnitude(rotation) >= SHAKE_ROTATION_THRESHOLD;
}
