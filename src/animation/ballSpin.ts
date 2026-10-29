import { Quaternion, Vector3 } from 'three';
import { BALL_RADIUS, length, type Vec3 } from './mechanism.ts';

// The polished ball slips across the mechanism. Normal collision impulses
// pass through its centre, so they do not reverse its angular momentum with
// every rebound. Integrate one launch spin instead of changing Euler axes or
// forcing no-slip rolling at each pin. Seeking is independent of frame rate.
export function ballSpin(velocity: Vec3, release: number, launched: number, hit: number) {
  const axis = new Vector3(velocity[2], 0, -velocity[0]).normalize();
  const rate = Math.min(7, length(velocity) / BALL_RADIUS * .32);
  const ramp = launched - release;
  return (time: number) => {
    const elapsed = Math.max(0, Math.min(time, hit) - release);
    const u = Math.min(1, elapsed / ramp);
    // Integral of smoothstep: angular speed starts at rest and joins cruise
    // with zero acceleration. The target catches and holds the same pose.
    const angle = rate * (ramp * (u ** 3 - u ** 4 / 2) + Math.max(0, elapsed - ramp));
    return new Quaternion().setFromAxisAngle(axis, angle);
  };
}
