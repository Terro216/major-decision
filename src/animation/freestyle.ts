import { Quaternion, Vector3 } from 'three';
import { add, BALL_RADIUS, cubicAt, fields, flightPoint, length, mix, mul, PIN_RADIUS, side, sub, TARGET, tubeLength, tubePoint, tubeTangent, unit, type Vec3 } from './mechanism.ts';
import { ballAt as filmBallAt, cameraAt as filmCameraAt, DURATION, smooth, sourceBall, timing as filmTiming, travel } from './timeline.ts';
import { pathFor, type Scenario } from './scenario.ts';

export type PlaybackMode = 'movie' | 'freestyle';
type Leg = { from: number; to: number; start: Vec3; end: Vec3; velocity: Vec3 };
export type Contact = { time: number; index: number; point: Vec3; incoming: Vec3; outgoing: Vec3; normal: Vec3; color: 'yes' | 'no' };
const radius = BALL_RADIUS + PIN_RADIUS;

function randomFrom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ state >>> 15, 1 | state);
    value ^= value + Math.imul(value ^ value >>> 7, 61 | value);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

// Event-driven sphere/cylinder collisions. Motion between impacts is linear;
// each impact reflects the incoming velocity about the actual contact normal.
// A seed selects a successful launch, never a new random direction mid-flight.
function launch(seed: number) {
  const random = randomFrom(seed);
  for (let attempt = 0; attempt < 512; attempt++) {
    const entry: Vec3 = [-1.5 + (random() - .5) * 1.6, BALL_RADIUS, -8.95];
    const velocity: Vec3 = [(random() - .5) * 6, 0, 9 + random() * 3];
    let p = entry, v = velocity, elapsed = 0;
    const legs: Leg[] = [], contacts: Contact[] = [];
    for (let bounce = 0; bounce < 100 && elapsed < 7; bounce++) {
      let next = Infinity, index = -1;
      for (let i = 0; i < fields.yes.pins.length; i++) {
        const pin = fields.yes.pins[i].position;
        const x = p[0] - pin[0], z = p[2] - pin[2];
        const a = v[0] ** 2 + v[2] ** 2, b = x * v[0] + z * v[2];
        const c = x * x + z * z - radius * radius;
        const discriminant = b * b - a * c;
        if (b >= 0 || discriminant <= 0) continue;
        const hit = (-b - Math.sqrt(discriminant)) / a;
        if (hit > 1e-7 && hit < next) { next = hit; index = i; }
      }
      const exit = v[2] > 0 ? (6.5 - p[2]) / v[2] : Infinity;
      const sideExit = v[0] > 0 ? (7.5 - p[0]) / v[0] : v[0] < 0 ? (-10.5 - p[0]) / v[0] : Infinity;
      const backExit = v[2] < 0 ? (-9.5 - p[2]) / v[2] : Infinity;
      const dt = Math.min(next, exit, sideExit, backExit);
      if (!Number.isFinite(dt) || elapsed + dt > 7) break;
      const end = add(p, mul(v, dt));
      legs.push({ from: elapsed, to: elapsed + dt, start: p, end, velocity: v });
      elapsed += dt;
      if (dt === exit) {
        if (contacts.length >= 4 && contacts.length <= 32) return { entry, velocity, legs, contacts, end, endVelocity: v, elapsed, attempt };
        break;
      }
      if (dt === sideExit || dt === backExit) {
        p = end;
        v = dt === sideExit ? [-v[0], 0, v[2]] : [v[0], 0, -v[2]];
        continue;
      }
      const pin = fields.yes.pins[index].position;
      const normal = unit([end[0] - pin[0], 0, end[2] - pin[2]]);
      const projection = v[0] * normal[0] + v[2] * normal[2];
      const outgoing = sub(v, mul(normal, 2 * projection));
      contacts.push({ time: elapsed, index, point: end, incoming: v, outgoing, normal, color: random() > .5 ? 'yes' : 'no' });
      p = end; v = outgoing;
    }
  }
  throw new Error('No complete freestyle launch found.');
}

function arc(point: (u: number) => Vec3, count = 384) {
  const points = Array.from({ length: count + 1 }, (_, i) => point(i / count));
  const distances = [0];
  for (let i = 1; i < points.length; i++) distances.push(distances[i - 1] + length(sub(points[i], points[i - 1])));
  const total = distances.at(-1)!;
  const at = (distance: number) => {
    if (distance <= 0) return points[0];
    if (distance >= total) return points.at(-1)!;
    let lo = 0, hi = count;
    while (hi - lo > 1) { const mid = (lo + hi) >>> 1; if (distances[mid] < distance) lo = mid; else hi = mid; }
    const u = (lo + (distance - distances[lo]) / (distances[hi] - distances[lo])) / count;
    return point(u);
  };
  return { at, length: total };
}

export function createFreestyle(seed: number, scenario: Scenario) {
  const path = pathFor(scenario), sign = side(path), run = launch(seed);
  const mirror = (p: Vec3): Vec3 => [p[0] * sign, p[1], p[2]];
  const entry = mirror(run.entry), end = mirror(run.end);
  const entryVelocity = mirror(run.velocity), endVelocity = mirror(run.endVelocity);
  const speed = length(entryVelocity);
  const release = .50, fieldStart = 1.20, fieldEnd = fieldStart + run.elapsed;
  const inlet = tubePoint(0, path), axis = tubeTangent(0, path);
  const gate = sub(inlet, mul(axis, 2));
  const handle = Math.min(2.5, length(sub(gate, end)) / 3);
  const curve = [end, add(end, mul(unit(endVelocity), handle)), sub(gate, mul(axis, handle)), gate] as const;
  const guide = arc(u => cubicAt(curve, u));
  const approachLength = guide.length + 2;
  const inletTime = fieldEnd + approachLength / speed;
  const coilDuration = 1.65, exit = inletTime + coilDuration, exitSpeed = 24;
  const flight = arc(u => flightPoint(u * TARGET.flight, path));
  const hit = exit + flight.length / exitSpeed;
  const duration = hit + (DURATION - filmTiming[path].hit);
  const events = { release, fieldStart, fieldEnd, entry: inletTime, exit, hit, color: hit + (filmTiming[path].color - filmTiming[path].hit), duration };
  const contacts = run.contacts.map(c => ({ ...c, time: c.time + fieldStart, point: mirror(c.point), incoming: mirror(c.incoming), outgoing: mirror(c.outgoing), normal: mirror(c.normal) }));
  const clock = [[0, 0], [release, filmTiming[path].release], [fieldStart, filmTiming[path].fieldStart],
    [fieldEnd, filmTiming[path].fieldEnd], [inletTime, filmTiming[path].entry], [exit, filmTiming[path].exit],
    [hit, filmTiming[path].hit], [duration, DURATION]];
  const mapClock = (value: number, from: number, to: number) => {
    if (value <= 0) return 0;
    const i = clock.findIndex(key => key[from] >= value);
    if (i < 0) return clock.at(-1)![to];
    if (i === 0) return clock[0][to];
    const a = clock[i - 1], b = clock[i];
    return a[to] + (b[to] - a[to]) * (value - a[from]) / (b[from] - a[from]);
  };
  const filmTime = (time: number) => mapClock(time, 0, 1);
  const timeAtFilm = (time: number) => mapClock(time, 1, 0);
  const guidePoint = (distance: number): Vec3 => distance < guide.length
    ? guide.at(distance) : add(gate, mul(axis, Math.min(2, distance - guide.length)));
  const ballAt = (time: number): Vec3 => {
    if (time <= release) return sourceBall(path);
    if (time < fieldStart) return travel(sourceBall(path), entry, [0, 0, 0], entryVelocity, release, fieldStart, time);
    if (time < fieldEnd) {
      const local = time - fieldStart, leg = run.legs.find(leg => local <= leg.to)!;
      return mirror(add(leg.start, mul(leg.velocity, local - leg.from)));
    }
    if (time < inletTime) return guidePoint((time - fieldEnd) * speed);
    if (time < exit) {
      // A powered coil accelerates continuously, with matching endpoint
      // velocities; there are no measured-frame holds in live motion.
      const distance = travel([0, 0, 0], [tubeLength, 0, 0], [speed, 0, 0], [exitSpeed, 0, 0], inletTime, exit, time)[0];
      return tubePoint(distance, path);
    }
    if (time < hit) return flight.at((time - exit) * exitSpeed);
    return filmBallAt(filmTime(time), path);
  };
  // Integrate rolling orientation along the actual path once, including exact
  // impact times. Reversing a seek restores the same rotation; impacts change
  // the angular velocity without snapping the texture to a new orientation.
  const spinTimes = [...new Set([fieldStart, inletTime, ...run.legs.map(leg => fieldStart + leg.to),
    ...Array.from({ length: Math.ceil((inletTime - fieldStart) * 120) }, (_, i) => fieldStart + i / 120)])].sort((a,b) => a-b);
  const rotations = [new Quaternion()];
  let previousPoint = ballAt(fieldStart);
  for (const time of spinTimes.slice(1)) {
    const point = ballAt(time), delta = sub(point, previousPoint);
    const normal = new Vector3(delta[2], 0, -delta[0]).normalize();
    rotations.push(rotations.at(-1)!.clone().premultiply(new Quaternion().setFromAxisAngle(normal, length(delta) / BALL_RADIUS)).normalize());
    previousPoint = point;
  }
  const rotationAt = (time: number) => {
    if (time <= fieldStart) return new Quaternion();
    if (time >= inletTime) return rotations.at(-1)!.clone().premultiply(new Quaternion().setFromAxisAngle(
      new Vector3(axis[2],0,-axis[0]).normalize(), (Math.min(time,hit)-inletTime)*speed/BALL_RADIUS));
    let lo = 0, hi = spinTimes.length - 1;
    while (hi-lo > 1) { const mid = (lo+hi) >>> 1; if (spinTimes[mid] < time) lo = mid; else hi = mid; }
    return new Quaternion().slerpQuaternions(rotations[lo],rotations[hi],(time-spinTimes[lo])/(spinTimes[hi]-spinTimes[lo]));
  };
  // Retain the film's lens, orbit, roll and ball composition. Translate that
  // rig to the seeded path instead of switching to a wide overhead camera.
  // A short symmetric filter absorbs the velocity reversals at impacts.
  // Bake it once so live frames and reverse seeks need no stateful tracking.
  const cameraHz = 120, filterRadius = 18;
  const offsets = Array.from({ length: Math.ceil(inletTime * cameraHz) + 1 }, (_, i) => {
    const time = Math.min(inletTime, i / cameraHz);
    return sub(ballAt(time), filmBallAt(filmTime(time), path));
  });
  const follow = offsets.map((_, i) => {
    let sum: Vec3 = [0, 0, 0], total = 0;
    for (let k = -filterRadius; k <= filterRadius; k++) {
      const weight = 1 + Math.cos(Math.PI * k / (filterRadius + 1));
      sum = add(sum, mul(offsets[Math.max(0, Math.min(offsets.length - 1, i + k))], weight));
      total += weight;
    }
    return mul(sum, 1 / total);
  });
  const followAt = (time: number) => {
    const i = Math.min(follow.length - 2, Math.max(0, Math.floor(time * cameraHz)));
    const velocity = (n: number) => mul(sub(follow[Math.min(follow.length - 1,n+1)],follow[Math.max(0,n-1)]),cameraHz/2);
    return mul(travel(follow[i],follow[i+1],velocity(i),velocity(i+1),i/cameraHz,(i+1)/cameraHz,time),
      1 - smooth((time - (inletTime - .30)) / .30));
  };
  const cameraAt = (time: number): number[] => {
    const visual = filmTime(time), p = ballAt(time);
    const original = filmCameraAt(visual, path);
    if (time < inletTime) {
      const offset = followAt(time);
      // Leave a little room for the filtered camera to follow a random
      // rebound while keeping the whole sphere inside the film-style shot.
      const room = .10 * smooth((time - .65) / .45)
        * (1 - smooth((time - (inletTime - .60)) / .60));
      return original.map((value, i) => i < 6
        ? value + offset[i % 3] + (i < 3 ? (value - original[i + 3]) * room : 0)
        : value);
    }
    if (time < exit) return original;
    if (time < hit) {
      const u = smooth((time - exit) / (hit - exit));
      const endView = filmCameraAt(filmTiming[path].hit, path);
      const startView = filmCameraAt(filmTiming[path].exit, path);
      const startBall = ballAt(exit), endBall = ballAt(hit);
      const offset = mix(sub(startView.slice(0, 3) as unknown as Vec3, startBall), sub(endView.slice(0, 3) as unknown as Vec3, endBall), u);
      const targetOffset = mix(sub(startView.slice(3, 6) as unknown as Vec3, startBall), sub(endView.slice(3, 6) as unknown as Vec3, endBall), u);
      return [...add(p, offset), ...add(p, targetOffset), startView[6] + (endView[6] - startView[6]) * u, 0];
    }
    return original;
  };
  return { seed: seed >>> 0, scenario, duration, events, contacts, ballAt, rotationAt, cameraAt, filmTime, timeAtFilm,
    guidePoint, guideLength: approachLength, launchAttempts: run.attempt + 1, speed };
}

export type FreestyleRun = ReturnType<typeof createFreestyle>;
