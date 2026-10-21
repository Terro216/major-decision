import { add, BALL_RADIUS, cross, fields, mix, mul, RUN_HEIGHT, side, sourcePosition, sub, TARGET, TUBE, targetFrame, tubeLength, tubePoint, tubeTangent, unit, type Outcome, type Vec3 } from './mechanism.ts';
export { helixPoint, type Outcome, type Vec3 } from './mechanism.ts';
export type Phase = 'idle' | 'preparing' | 'running' | 'result';
export type Key = readonly [number, ...number[]];
export const DURATION = 6.9;
export const clamp = (n: number, min = 0, max = 1) => Math.min(max, Math.max(min, n));
export const smooth = (n: number) => { const v = clamp(n); return v * v * (3 - 2 * v); };

export function track(keys: readonly Key[], time: number): number[] {
  if (time <= keys[0][0]) return keys[0].slice(1);
  for (let i = 1; i < keys.length; i++) if (time <= keys[i][0]) {
    const a = keys[i - 1], b = keys[i], t = smooth((time - a[0]) / (b[0] - a[0]));
    return a.slice(1).map((value, n) => value + (b[n + 1] - value) * t);
  }
  return keys[keys.length - 1].slice(1);
}

// Velocities are in world units/second, not per-segment ease-to-stop.
export function travel(a: Vec3, b: Vec3, va: Vec3, vb: Vec3, start: number, end: number, time: number): Vec3 {
  const u = clamp((time - start) / (end - start)), u2 = u*u, u3 = u2*u, dt = end - start;
  return add(add(mul(a, 2*u3-3*u2+1), mul(b, -2*u3+3*u2)), add(mul(va, (u3-2*u2+u)*dt), mul(vb, (u3-u2)*dt)));
}
export const timing = {
  yes: { release: .53, fieldStart: 1.12, fieldEnd: 3.85, approach: 4.20, entry: 4.30, exit: 4.91 },
  no: { release: .59, fieldStart: 1.20, fieldEnd: 3.95, approach: 4.30, entry: 4.40, exit: 4.94 },
} as const;
export const sourceBall = (outcome: Outcome): Vec3 => add(sourcePosition(outcome), [0, 0, TARGET.face + BALL_RADIUS]);
export const fallEnd = (outcome: Outcome) => timing[outcome].release + .36;
export const entryLead = 1.3;
export const entrySpeed = entryLead / .10;
// The reference keeps rebounding until roughly 3.7 s. The previous single
// ease completed the fan much too early, followed by a long free glide.
// These approximate contact beats retime the same collision-safe corridor.
// Distances and endpoint tangents still join the release and approach in C1.
export function fieldSpeed(_outcome: Outcome) { return 5.5; }
const contactBeats: Record<Outcome, readonly number[]> = {
  yes: [1.42,1.59,1.74,2.08,2.40,2.75,3.20,3.65],
  no: [1.51,1.68,1.83,2.18,2.50,2.85,3.30,3.75],
};
function fieldTrack(outcome: Outcome) {
  const t=timing[outcome], distances=fields[outcome].distances;
  const times=[t.fieldStart,...contactBeats[outcome],t.fieldEnd];
  const slopes=times.slice(1).map((time,i)=>(distances[i+1]-distances[i])/(time-times[i]));
  const velocities=times.map((_,i)=>i===0||i===times.length-1?fieldSpeed(outcome):Math.min(slopes[i-1],slopes[i]));
  return {times,distances,velocities};
}
const fieldTracks={yes:fieldTrack('yes'),no:fieldTrack('no')};
export function fieldDistanceAt(time: number, outcome: Outcome) {
  const {times,distances,velocities}=fieldTracks[outcome];
  if(time<=times[0]) return 0;
  const i=times.findIndex(t=>t>=time);
  if(i<0) return distances.at(-1)!;
  return travel([distances[i-1],0,0],[distances[i],0,0],[velocities[i-1],0,0],[velocities[i],0,0],times[i-1],times[i],time)[0];
}
export function fieldVelocityBound(outcome: Outcome) {
  const {times,distances,velocities}=fieldTracks[outcome];
  return Math.max(...velocities,...times.slice(1).map((t,i)=>3*(distances[i+1]-distances[i])/(t-times[i])-velocities[i]-velocities[i+1]));
}
export function exitSpeed(outcome: Outcome) { return TARGET.flight / (TARGET.hit - timing[outcome].exit); }
export function tubeMotion(outcome: Outcome) {
  const duration = timing[outcome].exit - timing[outcome].entry;
  const ramp = duration * .2;
  // Integrating two smooth velocity ramps fixes the travelled distance exactly.
  // Most of the helix has a steady speed; both mouth accelerations are zero.
  const cruise = (tubeLength - .5 * ramp * (entrySpeed + exitSpeed(outcome))) / (duration - ramp);
  return { duration, ramp, cruise };
}
export function tubeDistanceAt(time: number, outcome: Outcome) {
  const { duration, ramp, cruise } = tubeMotion(outcome);
  const elapsed = clamp(time - timing[outcome].entry, 0, duration);
  const rampDistance = (seconds: number, speed: number) => {
    const u = seconds / ramp;
    return speed * seconds + (cruise - speed) * ramp * (u ** 3 - .5 * u ** 4);
  };
  if (elapsed < ramp) return rampDistance(elapsed, entrySpeed);
  if (elapsed > duration - ramp) return tubeLength - rampDistance(duration - elapsed, exitSpeed(outcome));
  return .5 * (entrySpeed + cruise) * ramp + cruise * (elapsed - ramp);
}
export const pinContacts = Object.fromEntries((['yes', 'no'] as const).map(outcome => {
  const f = fields[outcome], t = timing[outcome];
  return [outcome, f.pins.flatMap((pin, index) => {
    if(pin.contact===undefined) return [];
    let left=t.fieldStart as number,right=t.fieldEnd as number;
    for(let i=0;i<48;i++) {const mid=(left+right)/2;if(fieldDistanceAt(mid,outcome)<f.distances[pin.contact])left=mid;else right=mid;}
    return [[(left+right)/2,index,pin.color!]];
  })];
})) as Record<Outcome, [number, number, Outcome][]>;

export function ballAt(time: number, outcome: Outcome): Vec3 {
  const t = timing[outcome], f = fields[outcome], speed = fieldSpeed(outcome);
  const firstVelocity = mul(unit(sub(f.points[1], f.points[0])), speed);
  if (time <= t.release) return sourceBall(outcome);
  if (time < t.fieldStart) {
    const p = travel(sourceBall(outcome), f.points[0], [0,0,0], firstVelocity, t.release, t.fieldStart, time);
    // The drop settles before the first cylinder. Horizontal release continues
    // into the field with the same tangent velocity; there is no position cut.
    const y = travel([sourceBall(outcome)[1],0,0], [RUN_HEIGHT,0,0], [0,0,0], [0,0,0], t.release, fallEnd(outcome), time)[0];
    return [p[0], y, p[2]];
  }
  if (time <= t.fieldEnd) {
    const distance = clamp(fieldDistanceAt(time,outcome), 0, f.length);
    const i = Math.min(f.points.length - 1, f.distances.findIndex(d => d >= distance));
    if (i <= 0) return f.points[0];
    return mix(f.points[i - 1], f.points[i], (distance - f.distances[i - 1]) / (f.distances[i] - f.distances[i - 1]));
  }
  const inlet = tubePoint(0, outcome), axis = tubeTangent(0, outcome), aligned = add(inlet, mul(axis, -entryLead));
  if (time < t.approach) return travel(f.points.at(-1)!, aligned, mul(unit(sub(f.points.at(-1)!, f.points.at(-2)!)), speed), mul(axis, entrySpeed), t.fieldEnd, t.approach, time);
  if (time < t.entry) return add(inlet, mul(axis, (time - t.entry) * entrySpeed));
  if (time < t.exit) return tubePoint(tubeDistanceAt(time, outcome), outcome);
  if (time < TARGET.hit) return add(tubePoint(tubeLength, outcome), mul(tubeTangent(tubeLength, outcome), (time - t.exit) * exitSpeed(outcome)));
  return targetFrame(outcome).impact;
}
// Early screen landmarks from the original clips; yaw/elevation/roll are a
// reconstruction. Solve only these fixed camera keys, then interpolate the
// camera itself: it does not chase/cancel the ball's individual pin rebounds.
const earlyShots: Record<Outcome, readonly Key[]> = {
  // time, ball x/y/diameter in stage, camera azimuth/elevation, roll (radians)
  yes: [[.70,.494,.182,.099,0,.52,0],[.95,.462,.346,.119,-.04,.61,-.04],
    [1.20,.456,.455,.128,-.25,.78,-.20],[1.40,.472,.465,.137,-.45,.83,-.36],[1.65,.552,.594,.140,-.66,.81,-.42],[1.90,.570,.494,.137,-.85,.75,-.20],
    [2.40,.428,.82,.148,-1.4,.35,.10],[2.60,.438,.778,.151,-1.6,.30,.13],[2.90,.388,.823,.172,-1.85,.25,.12],
    [3.20,.30,.65,.18,-2.18,.25,.08],[3.65,.376,.72,.17,-2.09,.13,.04],[4.15,.450,.485,.130,-1.475,.10,0],
    [4.30,.50,.46,.125,-1.4,.10,0]],
  no: [[.70,.517,.153,.087,0,.49,0],[.95,.552,.282,.119,.04,.57,.04],
    [1.20,.557,.452,.128,.25,.78,.20],[1.40,.544,.461,.128,.45,.83,.36],[1.70,.528,.615,.140,.67,.81,.42],[1.95,.415,.541,.125,.85,.75,.20],
    [2.40,.622,.81,.145,1.4,.35,-.10],[2.60,.585,.769,.157,1.6,.30,-.13],[2.72,.575,.78,.16,1.80,.27,-.13],[2.90,.551,.797,.166,1.95,.25,-.12],
    [3.20,.64,.64,.18,2.14,.25,-.08],[3.70,.648,.749,.16,2.05,.17,-.04],[4.15,.650,.51,.132,1.80,.10,0],
    [4.40,.51,.46,.125,1.4,.10,0]],
};

function viewBasis(forward: Vec3, roll = 0) {
  const horizontal = unit(cross(forward,[0,1,0])), vertical = cross(horizontal,forward);
  return {
    right: sub(mul(horizontal,Math.cos(roll)),mul(vertical,Math.sin(roll))),
    up: add(mul(vertical,Math.cos(roll)),mul(horizontal,Math.sin(roll))),
  };
}
// Used by the renderer and projection diagnostics, including camera roll.
export function cameraUp(camera: readonly number[]): Vec3 {
  return viewBasis(unit(sub(camera.slice(3,6) as unknown as Vec3,camera.slice(0,3) as unknown as Vec3)),camera[7] ?? 0).up;
}
function frameBall(ball: Vec3, forward: Vec3, x: number, y: number, diameter: number, fov: number, roll = 0) {
  const {right,up} = viewBasis(forward,roll);
  const tangent = Math.tan(fov*Math.PI/360), depth = BALL_RADIUS*Math.sqrt(1+1/(diameter*tangent)**2);
  const aim = sub(ball,add(mul(right,(2*x-1)*depth*tangent*1241/688),mul(up,(1-2*y)*depth*tangent)));
  return { position: sub(aim,mul(forward,depth)), aim, depth, fov, roll };
}
function earlyCameraKeys(outcome: Outcome): readonly Key[] {
  // A lower opening lens includes the real fan below the source.
  // It joins the release orbit; no objects are repositioned for this shot.
  // Stay on the field side of the coil, including the entire viewing cone.
  const source = sourcePosition(outcome), position = add(source,[0,-.9,22]), aim = add(source,[0,-1.45,0]);
  const keys: Key[] = [[0,...position,...aim,24.45,0],[outcome==='yes'?.45:.49,...position,...aim,24.45,0]];
  for(const [time,x,y,diameter,azimuth,elevation,roll] of earlyShots[outcome]) {
    const forward: Vec3 = [-Math.sin(azimuth)*Math.cos(elevation),-Math.sin(elevation),-Math.cos(azimuth)*Math.cos(elevation)];
    // The inlet and sphere landmarks constrain the longer lens in the final
    // fan shot. The earlier 38-degree lens pushed the coil off the side.
    const fov = time === .70 ? 44 : time===3.20 ? 22 : time===3.65||time===3.70 ? 12 : 38;
    const shot = frameBall(ballAt(time,outcome),forward,x,y,diameter,fov,roll);
    keys.push([time,...shot.position,...shot.aim,fov,roll]);
  }
  // Stay outside the coil throughout the orbit. The lower mouth is approached
  // from the field side before circling toward the upper exit.
  keys.push([outcome==='yes'?4.50:4.57,side(outcome)*(TUBE.x-9),4.6,TUBE.z+10,side(outcome)*TUBE.x,3.0,TUBE.z,44,0],
    [4.70,side(outcome)*(TUBE.x-8),6.2,TUBE.z+12,side(outcome)*(TUBE.x-3),3.8,TUBE.z,42,0]);
  return keys;
}
const cameras: Record<Outcome, readonly Key[]> = { yes: earlyCameraKeys('yes'), no: earlyCameraKeys('no') };

// Approximate screen-space observations of the supplied MP4s, relative to the
// stage rectangle. See scripts/measure-film-framing.py and FRAMING_REVIEW.md.
// These guide the CAMERA only. The sphere and its world-space path stay fixed.
const flightFraming: Record<Outcome, readonly Key[]> = {
  yes: [[4.70,.40,.32,.15],[4.94,.415,.324,.157],[5.05,.46,.35,.19],[5.20,.638,.416,.253],[5.35,.662,.381,.398],[5.45,.705,.477,.410],[5.55,.578,.519,.372],[5.70,.517,.490,.320],[5.80,.515,.440,.157]],
  no: [[4.70,.64,.31,.14],[4.94,.607,.308,.137],[5.05,.60,.32,.18],[5.20,.515,.372,.224],[5.40,.462,.372,.334],[5.48,.306,.458,.413],[5.60,.406,.516,.384],[5.70,.481,.438,.273],[5.80,.490,.436,.166]],
};

// Monotone cubic interpolation avoids both overshoot and a stop at every
// observation. Neighbouring segments share derivatives, including extrema.
function framingAt(keys: readonly Key[], time: number) {
  if (time <= keys[0][0]) return keys[0].slice(1);
  if (time >= keys.at(-1)![0]) return keys.at(-1)!.slice(1);
  const i = keys.findIndex(k => k[0] >= time), a = keys[i-1], b = keys[i];
  return a.slice(1).map((value, j) => {
    const slope = (n: number) => (keys[n+1][j+1]-keys[n][j+1])/(keys[n+1][0]-keys[n][0]);
    const tangent = (n: number) => {
      if (n === 0 || n === keys.length-1) return 0;
      const left = slope(n-1), right = slope(n);
      return left*right <= 0 ? 0 : 2*left*right/(left+right);
    };
    return travel([value,0,0],[b[j+1],0,0],[tangent(i-1),0,0],[tangent(i),0,0],a[0],b[0],time)[0];
  });
}

function flightCamera(time: number, outcome: Outcome) {
  const f = targetFrame(outcome), ball = ballAt(time, outcome);
  const [x,y,diameter] = framingAt(flightFraming[outcome],time);
  // Both branches clear the clean 5.4 s close-up. Advance this orbit,
  // keeping the observed ball framing and the final target-side key unchanged.
  const [angle,elevation] = framingAt([[4.70,1.18,.18],[5.18,1.20,.15],[5.34,1.80,.07],[5.45,1.96,.04],[5.70,2.42,0],[5.80,Math.PI,0]],time);
  const forward = mul(unit(add(add(mul(f.forward,Math.cos(angle)),mul(f.right,side(outcome)*Math.sin(angle))),mul(f.up,elevation))),-1);
  const roll=side(outcome)*framingAt([[4.70,0],[5.20,0],[5.35,-.12],[5.45,-.22],[5.70,-.05],[5.80,0]],time)[0];
  return frameBall(ball,forward,x,y,diameter,38,roll);
}

// Continue around the flying ball to the actual target. No camera/world cut.
export function cameraAt(time: number, outcome: Outcome) {
  const base = framingAt(cameras[outcome], time);
  if (time <= 4.70) return base;
  const f = targetFrame(outcome), impact = flightCamera(TARGET.hit,outcome);
  let position: Vec3, aim: Vec3, roll=0;
  if (time < TARGET.hit) {
    const shot = flightCamera(time,outcome), settle = smooth((time-5.70)/.10);
    position = mix(shot.position,impact.position,settle);
    roll = shot.roll * (1-settle);
    aim = mix(shot.aim,impact.aim,settle);
  } else {
    const rise = 12.5 * smooth((time - 6.03) / .73), pull = smooth((time-5.80)/.17);
    // The coloured plate stays large and below centre in the film. Complete
    // the wider pullback while rising to the answer, not immediately at impact.
    const reveal = smooth((time-6.20)/.56), targetDepth = 12 + 6*reveal;
    aim = add(mix(impact.aim,add(f.center,mul(f.up,.5*(1-reveal))),pull),mul(f.up,rise));
    position = add(aim,mul(f.normal,impact.depth+(targetDepth-impact.depth)*pull));
  }
  const close = [...position, ...aim, 38, roll], blend = smooth((time - 4.70) / (timing[outcome].exit-4.70));
  return base.map((value, i) => value + (close[i] - value) * blend);
}

// The separate oval indicator has its own reference beats, not the pin colors.
// First full visibility was read from 24 fps samples of each original clip;
// the brief entry starts ~.04 s earlier. Exact sub-frame motion is inferred.
const beats: Record<Outcome, readonly (readonly [number, Outcome])[]> = {
  yes: [[1.40,'yes'],[1.70,'no'],[2.04,'yes'],[2.37,'no'],[2.71,'yes'],[2.92,'no'],[3.29,'yes'],[3.62,'no'],[3.87,'yes'],[4.24,'no'],[4.58,'yes'],[5.20,'no'],[5.58,'yes']],
  no: [[1.50,'yes'],[1.79,'no'],[2.12,'yes'],[2.41,'no'],[2.75,'yes'],[3.04,'no'],[3.33,'yes'],[3.66,'no'],[3.96,'yes'],[4.33,'no'],[4.62,'yes'],[5.29,'no'],[5.58,'yes']],
};
const indicatorEnd = 5.90;
export function indicatorAt(time: number, outcome: Outcome): Outcome | null {
  if (time >= indicatorEnd) return null;
  return [...beats[outcome]].reverse().find(([t]) => time >= t)?.[1] ?? null;
}
export function indicatorBallsAt(time: number, outcome: Outcome) {
  return beats[outcome].flatMap(([start, value], i, all) => {
    const end = all[i + 1]?.[0] ?? indicatorEnd - .07;
    if (time < start || time >= end + .07) return [];
    const enter = smooth((time - start) / .05), leave = smooth((time - end) / .07);
    const direction = value === 'yes' ? 1 : -1;
    const x = (value === 'yes' ? 186 : 63) + direction * (22 * (1-enter)**2 + 14 * leave**2);
    return [{ key: start, outcome: value, x, y: 49 + 80 * (1 - enter + leave), tilt: direction * (12*(1-enter)-9*leave) }];
  });
}
export function phaseAt(time: number, outcome: Outcome = 'yes') {
  const t = timing[outcome];
  if (time < t.release) return 'star';
  if (time < pinContacts[outcome][0][0]) return 'release';
  if (time < t.fieldEnd) return 'pins';
  if (time < t.entry) return 'spiral-entry';
  if (time < t.exit) return 'spiral-color';
  if (time < TARGET.hit) return 'exit';
  if (time < TARGET.color) return 'target';
  if (time < 6.2) return 'target-color';
  if (time < DURATION) return 'answer-entry';
  return 'result';
}
