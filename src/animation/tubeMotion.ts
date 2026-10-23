import { tubeLength, type Outcome } from './mechanism.ts';
import { bernsteinAt, bernsteinUpperBound } from './motionCurve.ts';

// Original 30 fps frames hold these poses. Fractions are reconstructed on the
// fixed tube from cameras fitted to its mouths, silhouette and distant source.
// The two occluded poses (.84 YES / .79 NO) interpolate the visible neighbours;
// they are not independently measured ball positions. No frame quantization.
export const tubePoses: Record<Outcome, readonly (readonly [number, number])[]> = {
  yes: [[130/30,.004], [131/30,.05704], [132/30,.235765], [133/30,.235765],
    [134/30,.41432], [136/30,.41432], [137/30,.483555],
    [138/30,.667095], [140/30,.667095], [141/30,.84], [142/30,.84],
    [143/30,.94744], [144/30,.94744]],
  no: [[132/30,.10416], [133/30,.10416], [134/30,.208875], [135/30,.208875],
    [136/30,.3197], [137/30,.3197], [138/30,.45985], [139/30,.45985],
    [140/30,.58368], [141/30,.58368], [142/30,.79],
    [143/30,.93281], [145/30,.93281]],
};

export function buildTubeMotion(route: Outcome, start: number, end: number, entrySpeed: number, exitSpeed: number) {
  const keys = [[start, 0], ...tubePoses[route].map(([time, fraction]) => [time, fraction * tubeLength]), [end, tubeLength]];
  const slopes = keys.slice(1).map(([time, distance], i) => (distance - keys[i][1]) / (time - keys[i][0]));
  const speeds = keys.map((_, i) => i === 0 ? entrySpeed : i === keys.length - 1 ? exitSpeed : Math.min(slopes[i - 1], slopes[i]));
  // Endpoint velocities are inherited from the adjoining paths. Limit the
  // adjacent interior speed so every derivative control remains nonnegative.
  speeds[1] = Math.min(speeds[1], Math.max(0, 2.5 * slopes[0] - entrySpeed));
  speeds[speeds.length - 2] = Math.min(speeds.at(-2)!, Math.max(0, 2.5 * slopes.at(-1)! - exitSpeed));
  const segments = slopes.map((_, i) => {
    const [from, a] = keys[i], [to, b] = keys[i + 1], dt = to - from;
    // Quintic Hermite in Bernstein form: specified velocity, zero acceleration
    // at every end. Repeated distances produce an exact stationary interval.
    const controls = [a, a + dt * speeds[i] / 5, a + 2 * dt * speeds[i] / 5,
      b - 2 * dt * speeds[i + 1] / 5, b - dt * speeds[i + 1] / 5, b];
    const velocity = controls.slice(1).map((value, j) => 5 * (value - controls[j]) / dt);
    const acceleration = velocity.slice(1).map((value, j) => 4 * (value - velocity[j]) / dt);
    return { from, to, controls, velocity, acceleration, speedBound: bernsteinUpperBound(velocity) };
  });
  const distanceAt = (time: number) => {
    if (time <= start) return 0;
    if (time >= end) return tubeLength;
    const segment = segments.find(s => time <= s.to)!;
    return bernsteinAt(segment.controls, (time - segment.from) / (segment.to - segment.from));
  };
  return { distanceAt, segments, joins: keys.map(k => k[0]),
    duration: end - start, speedBound: Math.max(...segments.map(s => s.speedBound)),
    minimumVelocityControl: Math.min(...segments.flatMap(s => s.velocity)) };
}
