import { add, length, mul, side, sub, targetFrame, type Outcome, type Vec3 } from './mechanism.ts';
import { bernsteinAt } from './motionCurve.ts';
import { cameraAt as filmCameraAt, clamp, DURATION } from './timeline.ts';

type Events = { release: number; fieldStart: number; fieldEnd: number; entry: number; exit: number; hit: number; duration: number };
// Yaw/elevation (radians), distance, focus offset XYZ, vertical FOV, bank.
type Shot = { time: number; values: number[] };
const xyz = (values: readonly number[], from = 0): Vec3 => [values[from], values[from + 1], values[from + 2]];

// A baked cubic B-spline follows the known path without a stateful spring.
// A broad window moves the dolly; a shorter, slightly leading window aims it.
// Rebounds remain visible instead of translating the entire world with them.
function focusTrack(ballAt: (time: number) => Vec3, duration: number, radius: number, lead = 0) {
  const hz = 60, count = Math.ceil(duration * hz), window = Math.ceil(radius * hz);
  const weights = Array.from({ length: window * 2 + 1 }, (_, i) => {
    const u = (i - window) / (window + 1);
    return (1 + Math.cos(Math.PI * u)) ** 2;
  });
  const total = weights.reduce((a, b) => a + b, 0);
  const source = Array.from({ length: count + window * 2 + 1 }, (_, i) => ballAt(clamp((i - window) / hz + lead, 0, duration)));
  const samples = Array.from({ length: count + 1 }, (_, i) => {
    let point: Vec3 = [0, 0, 0];
    for (let j = 0; j < weights.length; j++) point = add(point, mul(source[i + j], weights[j] / total));
    return point;
  });
  return (time: number): Vec3 => {
    const value = clamp(time * hz, 0, count), index = Math.floor(value), u = value - index;
    const weights = [(1 - u) ** 3, 3 * u ** 3 - 6 * u * u + 4, -3 * u ** 3 + 3 * u * u + 3 * u + 1, u ** 3];
    let point: Vec3 = [0, 0, 0];
    for (let i = 0; i < 4; i++) point = add(point, mul(samples[clamp(index + i - 1, 0, count)], weights[i] / 6));
    return point;
  };
}

// Quintic spans share velocity AND acceleration. Passing a shot marker does
// not stop the camera, and changing physical phases cannot snap its speed.
function shotTrack(shots: Shot[]) {
  const curves = shots.slice(1).map((b, i) => {
    const a = shots[i], dt = b.time - a.time;
    const derivatives = (index: number, channel: number) => {
      if (index === 0 || index === shots.length - 1) return [0, 0];
      const before = shots[index - 1], current = shots[index], after = shots[index + 1];
      const left = current.time - before.time, right = after.time - current.time;
      const incoming = (current.values[channel] - before.values[channel]) / left;
      const outgoing = (after.values[channel] - current.values[channel]) / right;
      return [(incoming * right + outgoing * left) / (left + right), 2 * (outgoing - incoming) / (left + right)];
    };
    return a.values.map((value, channel) => {
      const [va, aa] = derivatives(i, channel), [vb, ab] = derivatives(i + 1, channel), end = b.values[channel];
      return [value, value + dt * va / 5, value + 2 * dt * va / 5 + dt * dt * aa / 20,
        end - 2 * dt * vb / 5 + dt * dt * ab / 20, end - dt * vb / 5, end];
    });
  });
  return (time: number) => {
    if (time <= shots[0].time) return shots[0].values;
    const index = shots.findIndex(shot => shot.time >= time);
    if (index < 0) return shots.at(-1)!.values;
    const a = shots[index - 1], b = shots[index];
    return curves[index - 1].map(controls => bernsteinAt(controls, (time - a.time) / (b.time - a.time)));
  };
}

export function createFreestyleCamera(seed: number, path: Outcome, events: Events, ballAt: (time: number) => Vec3) {
  const s = side(path), { release, fieldStart, fieldEnd, entry, exit, hit, duration } = events;
  const dolly = focusTrack(ballAt, duration, .8);
  const focus = focusTrack(ballAt, duration, .34, .09);
  // The camera has its own seed variation; it never consumes answer randomness.
  const variation = ((Math.imul(seed ^ 0x51ed270b, 0x45d9f3b) >>> 0) / 0xffffffff - .5) * 2;
  const pose = (time: number, camera: number[]): Shot => {
    const direction = sub(xyz(camera), xyz(camera, 3)), distance = length(direction);
    return { time, values: [Math.atan2(direction[0] * s, direction[2]), Math.asin(direction[1] / distance), distance,
      ...sub(xyz(camera, 3), ballAt(time)), camera[6], camera[7] / s] };
  };
  const shot = (time: number, yaw: number, elevation: number, distance: number, fov: number, roll: number, aim: Vec3 = [0, .5, 0]): Shot =>
    ({ time, values: [yaw, elevation, distance, ...aim, fov, roll] });
  const final = filmCameraAt(DURATION, path), frame = targetFrame(path);
  const landing = final.map((value, i) => i < 6 ? value - frame.up[i % 3] * 9.7 : value);
  const rail = shotTrack([
    pose(0, filmCameraAt(0, path)),
    pose(release, filmCameraAt(release, path)),
    shot(fieldStart + .2, -.24, .88, 21, 29, -.035),
    shot(fieldStart + (fieldEnd - fieldStart) * .56, -.78 + variation * .12, .63, 19.5 + variation, 31, -.055),
    // A lucky rebound can leave only a quarter-second of guide. Begin the
    // approach before that phase and finish inside the coil, so it still has
    // room to turn without whipping around on these short routes.
    shot(fieldEnd - .24, -1.17, .35, 20, 30, -.025),
    shot(entry + .18, -.56, .27, 20, 29, .015, [0, 1.4, 0]),
    shot(entry + (exit - entry) * .56, .18 + variation * .10, .34, 21, 30, .035, [0, .2, 0]),
    shot(exit, .30, .20, 20, 31, .015, [0, -.4, 0]),
    shot(exit + (hit - exit) * .52, -.70, .12, 16.5, 34, -.025, [0, -.2, 0]),
    pose(hit + .10, landing),
    pose(duration, final),
  ]);
  return (time: number): number[] => {
    const t = clamp(time, 0, duration), values = rail(t);
    const [yaw, elevation, distance] = values, offset = xyz(values, 3);
    const u = clamp(t / release), opening = u ** 3 * (10 + u * (-15 + 6 * u));
    const source = ballAt(0);
    const follow = (track: (time: number) => Vec3) => add(source, mul(sub(track(t), source), opening));
    const position = add(add(follow(dolly), offset), [s * Math.sin(yaw) * Math.cos(elevation) * distance,
      Math.sin(elevation) * distance, Math.cos(yaw) * Math.cos(elevation) * distance]);
    return [...position, ...add(follow(focus), offset), values[6], values[7] * s];
  };
}
