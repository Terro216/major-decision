import { add, BALL_RADIUS, cross, cubicAt, cubicSpeedBound, fields, flightPoint, mix, mul, PIN_HEIGHT, side, SOURCE_SCALE, sourcePosition, sub, TARGET, targetFrame, tubeLength, tubePoint, tubeTangent, unit, type Outcome, type Vec3 } from './mechanism.ts';
import { fanCamera } from './fanCamera.ts';
import { inletCamera } from './inletCamera.ts';
import { fanEntry } from './fanEntry.ts';
import { releasePath } from './releasePath.ts';
import { flightMotion } from './flightMotion.ts';
import { buildTubeMotion } from './tubeMotion.ts';
import { exitViews } from './exitViews.ts';
import { bernsteinAt, bernsteinSplit, bernsteinUpperBound } from './motionCurve.ts';
import { exposureKeys } from './exposureKeys.ts';
import { smoothCamera } from './cameraSmoothing.ts';
import { ballSpin } from './ballSpin.ts';
export { helixPoint, type Outcome, type Vec3 } from './mechanism.ts';
export type Phase = 'idle' | 'preparing' | 'running' | 'result';
export type Key = readonly [number, ...number[]];
export const DURATION = 6.9;
// Native range inputs round rational frame times. A nanosecond tolerance keeps
// discrete colour/visibility events on the intended frame; motion stays exact.
export const reached = (time: number, event: number) => time + 1e-9 >= event;
export const clamp = (n: number, min = 0, max = 1) => Math.min(max, Math.max(min, n));
export const smooth = (n: number) => { const v = clamp(n); return v * v * (3 - 2 * v); };

// The star gains speed continuously. Repeated source exposures are camera
// samples, not mechanical stops in a motor's rotation.
export function sourceAngleAt(time: number, path: Outcome) {
  const elapsed = Math.max(0, time - (path === 'no' ? 2/30 : 0));
  const duration = .48, u = Math.min(1, elapsed / duration), rate = 5.4;
  return -side(path) * rate * (duration * (u ** 3 - u ** 4 / 2) + Math.max(0, elapsed - duration));
}

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
  // entry is the centre crossing. The leading hemisphere reaches the open
  // mouth about .045 s earlier; the film's inletCrossing marks that surface.
  // The colour is a separate measured frame, during that crossing.
  // exit is the physical centre crossing; pulseEnd is the first violet frame,
  // when the sphere is already fully ahead of the open mouth.
  yes: { release: .50, fieldStart: 1.20, fieldEnd: 3.85, approach: 4.20, entry: 4.30, pulseStart: 128/30, exit: 144.5/30, pulseEnd: 145/30, hit: 171/30, color: 175/30, settled: 204/30 },
  no: { release: 17/30, fieldStart: 38/30, fieldEnd: 3.95, approach: 128/30, entry: 131/30, pulseStart: 130/30, exit: 145.5/30, pulseEnd: 146/30, hit: 172/30, color: 176/30, settled: 203/30 },
} as const;
export const sourceBall = (outcome: Outcome): Vec3 => add(sourcePosition(outcome), [0, 0, TARGET.face * SOURCE_SCALE + BALL_RADIUS]);
export const fallEnd = (outcome: Outcome) => timing[outcome].fieldStart;
export const entryLead = 1.3;
export const entrySpeed = entryLead / .10;
// Contacts are reconstructed from the ball and pin colours in consecutive
// source frames. Repeated strikes on an already red pin need ball evidence;
// colour changes alone previously misordered the late rebounds.
export function fieldSpeed(_outcome: Outcome) { return 5.5; }
const fanEntrySpeed=2;
const earlyContactTimes = [44/30,1.5333,1.60,1.667,1.7333,1.80,1.90,1.9667,2.0333,2.10,2.1667,2.2333,2.30,2.40];
const contactBeats: Record<Outcome, readonly number[]> = {
  yes: [...earlyContactTimes,75/30,77/30,79/30,82/30,84/30,85/30,87/30,2.98,3.055,95/30,98/30,3.28,102/30,103/30,3.58],
  no: [...earlyContactTimes.map(time=>time+2/30),76/30,78/30,81/30,83/30,85/30,86/30,3.05,3.08,3.155,98/30,100/30,3.35,3.45,3.545,3.65],
};
// The authored collision sequence keeps its film rhythm. Do not add the
// held intermediate poses from the recording as extra stops between strikes.
function fieldTrack(outcome: Outcome) {
  const t=timing[outcome], pathDistances=fields[outcome].distances;
  const knots=[t.fieldStart,...contactBeats[outcome],t.fieldEnd].map((time,i)=>({time,distance:pathDistances[i]}));
  knots.sort((a,b)=>a.time-b.time);
  const times=knots.map(k=>k.time),distances=knots.map(k=>k.distance);
  const slopes=times.slice(1).map((time,i)=>(distances[i+1]-distances[i])/(time-times[i]));
  const velocities=times.map((_,i)=>i===0?fanEntrySpeed:i===times.length-1?fieldSpeed(outcome):Math.min(slopes[i-1],slopes[i]));
  return {times,distances,velocities};
}
const fieldTracks={yes:fieldTrack('yes'),no:fieldTrack('no')};
export const fieldEntries=Object.fromEntries((['yes','no'] as const).map(path=>[path,
  fanEntry(path,timing[path].fieldStart,contactBeats[path][0],fieldTracks[path].velocities[1],fanEntrySpeed),
])) as Record<Outcome, ReturnType<typeof fanEntry>>;
export const releases=Object.fromEntries((['yes','no'] as const).map(path=>[path,
  releasePath(sourceBall(path),fields[path].points[0],timing[path].release,timing[path].fieldStart,fanEntrySpeed,path),
])) as Record<Outcome, ReturnType<typeof releasePath>>;
export function fieldDistanceAt(time: number, outcome: Outcome) {
  const {times,distances,velocities}=fieldTracks[outcome];
  if(time<=times[0]) return 0;
  const i=times.findIndex(t=>t>=time);
  if(i<0) return distances.at(-1)!;
  return travel([distances[i-1],0,0],[distances[i],0,0],[velocities[i-1],0,0],[velocities[i],0,0],times[i-1],times[i],time)[0];
}
export function fieldVelocityBound(outcome: Outcome) {
  const {times,distances,velocities}=fieldTracks[outcome];
  const field=fields[outcome];
  return Math.max(fieldEntries[outcome].speedBound,...times.slice(1).map((t,i)=>{
    // Every contact is a time knot. Each interval therefore lies within one
    // spatial segment; a free curve's factor must not multiply earlier legs.
    const middle=(distances[i]+distances[i+1])/2;
    const end=field.distances.findIndex(d=>d>middle),curve=field.curves.get(end);
    const span=field.distances[end]-field.distances[end-1];
    const dt=t-times[i],start=distances[i],endDistance=distances[i+1];
    const controls=[start,start+dt*velocities[i]/3,endDistance-dt*velocities[i+1]/3,endDistance];
    const velocity=controls.slice(1).map((value,j)=>3*(value-controls[j])/dt);
    const bound=(p:number[],v:number[],depth=6):number=>{
      if(!curve)return bernsteinUpperBound(v);
      if(!depth)return Math.max(...v)*cubicSpeedBound(curve,
        (Math.min(...p)-field.distances[end-1])/span,
        (Math.max(...p)-field.distances[end-1])/span)/span;
      const ps=bernsteinSplit(p),vs=bernsteinSplit(v);
      return Math.max(bound(ps[0],vs[0],depth-1),bound(ps[1],vs[1],depth-1));
    };
    return bound(controls,velocity);
  }));
}
export function exitSpeed(_outcome: Outcome) { return 100; }
export const flights = {
  yes: flightMotion('yes', timing.yes.exit, timing.yes.pulseEnd, timing.yes.hit, exitSpeed('yes')),
  no: flightMotion('no', timing.no.exit, timing.no.pulseEnd, timing.no.hit, exitSpeed('no')),
};
const tubeTracks = {
  yes: buildTubeMotion('yes', timing.yes.entry, timing.yes.exit, entrySpeed, exitSpeed('yes')),
  no: buildTubeMotion('no', timing.no.entry, timing.no.exit, entrySpeed, exitSpeed('no')),
};
export function tubeMotion(outcome: Outcome) { return tubeTracks[outcome]; }
export function tubeDistanceAt(time: number, outcome: Outcome) {
  return tubeTracks[outcome].distanceAt(time);
}
export const pinContacts = Object.fromEntries((['yes', 'no'] as const).map(outcome => {
  const f = fields[outcome], t = timing[outcome];
  return [outcome, f.contacts.map((index, contact) => {
    let left=t.fieldStart as number,right=t.fieldEnd as number;
    for(let i=0;i<48;i++) {const mid=(left+right)/2;if(fieldDistanceAt(mid,outcome)<f.distances[contact+1])left=mid;else right=mid;}
    const color: Outcome = [8,9,10,14,17,21,26,27,28].includes(contact)?'yes':'no';
    return [(left+right)/2,index,color];
  })];
})) as Record<Outcome, [number, number, Outcome][]>;

// A pin changes at its physical strike, including the formerly held late
// exposures. Lighting and sound now share the same collision timeline.
export const pinColorEvents = pinContacts;

export function ballAt(time: number, outcome: Outcome): Vec3 {
  const t = timing[outcome], f = fields[outcome], speed = fieldSpeed(outcome);
  if (time <= t.release) return sourceBall(outcome);
  if (time < t.fieldStart) return releases[outcome].at(time);
  if (time < contactBeats[outcome][0]) return fieldEntries[outcome].at(time);
  if (time <= t.fieldEnd) {
    const distance = clamp(fieldDistanceAt(time,outcome), 0, f.length);
    const i = Math.min(f.points.length - 1, f.distances.findIndex(d => d >= distance));
    if (i <= 0) return f.points[0];
    const u=(distance-f.distances[i-1])/(f.distances[i]-f.distances[i-1]),curve=f.curves.get(i);
    return curve?cubicAt(curve,u):mix(f.points[i-1],f.points[i],u);
  }
  const inlet = tubePoint(0, outcome), axis = tubeTangent(0, outcome), aligned = add(inlet, mul(axis, -entryLead));
  if (time < t.approach) return travel(f.points.at(-1)!, aligned, mul(unit(sub(f.points.at(-1)!, f.points.at(-2)!)), speed), mul(axis, entrySpeed), t.fieldEnd, t.approach, time);
  if (time < t.entry) return add(inlet, mul(axis, (time - t.entry) * entrySpeed));
  if (time < t.exit) return tubePoint(tubeDistanceAt(time, outcome), outcome);
  if (time < t.hit) return flightPoint(flights[outcome].distanceAt(time),outcome);
  return targetFrame(outcome).impact;
}
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
  // Opening and release views are jointly constrained by the source and caps.
  const keys: Key[] = [];
  for(const [time,px,py,pz,ax,ay,az,fov,roll] of fanCamera[outcome]) {
    const s=side(outcome);
    keys.push([time,s*px-s*1.5,py+PIN_HEIGHT,pz-7.65,s*ax-s*1.5,ay+PIN_HEIGHT,az-7.65,fov,s*roll]);
  }
  keys.push(...inletCamera[outcome]);
  keys.sort((a,b)=>a[0]-b[0]);
  return keys;
}
const cameras: Record<Outcome, readonly Key[]> = { yes: earlyCameraKeys('yes'), no: earlyCameraKeys('no') };

// Approximate screen-space observations of the supplied MP4s, relative to the
// stage rectangle. See scripts/measure-film-framing.py and FRAMING_REVIEW.md.
// These guide the CAMERA only. The sphere and its world-space path stay fixed.
// Measurements of every source frame 146 through impact, including held poses.
// Fixed measurements from rectified 30 fps frames. Diameters include a small
// allowance for the dark antialiased edge missed by the orange mask. These
// observations affect the camera only; flight and sphere geometry are separate.
export const flightFraming: Record<Outcome, readonly Key[]> = {
  yes: [
    [4.7, 0.4, 0.32, 0.15],
    [146/30, 0.420110887, 0.312386364, 0.160072823],
    [147/30, 0.425647991, 0.330658106, 0.181889697],
    [148/30, 0.425647991, 0.330658106, 0.181889697],
    [149/30, 0.425647991, 0.330658106, 0.181889697],
    [150/30, 0.449318517, 0.355346193, 0.207192819],
    [151/30, 0.537717896, 0.378688886, 0.229830765],
    [152/30, 0.537717896, 0.378688886, 0.229830765],
    [153/30, 0.647393077, 0.413636790, 0.267297889],
    [154/30, 0.647393077, 0.413636790, 0.267297889],
    [155/30, 0.647393077, 0.413636790, 0.267297889],
    [156/30, 0.619126647, 0.402610348, 0.318997455],
    [157/30, 0.565244930, 0.362601336, 0.370358235],
    [158/30, 0.565244930, 0.362601336, 0.370358235],
    [159/30, 0.668850806, 0.379090909, 0.436581818],
    [160/30, 0.668850806, 0.379090909, 0.436581818],
    [161/30, 0.712701613, 0.477272727, 0.449754545],
    [162/30, 0.712701613, 0.477272727, 0.449754545],
    [163/30, 0.587701613, 0.517272727, 0.400827273],
    [164/30, 0.587701613, 0.515454545, 0.400827273],
    [165/30, 0.587701613, 0.517272727, 0.400827273],
    [166/30, 0.587701613, 0.517272727, 0.400827273],
    [167/30, 0.525705645, 0.490000000, 0.342490909],
    [168/30, 0.525705645, 0.488181818, 0.342490909],
    [169/30, 0.525705645, 0.490000000, 0.342490909],
    [170/30, 0.561995968, 0.424545455, 0.203236364],
    [171/30, 0.524697581, 0.437272727, 0.169363636],
  ],
  no: [
    [4.7, 0.64, 0.31, 0.14],
    [147/30, 0.618053319, 0.309366441, 0.160140065],
    [148/30, 0.618053319, 0.309366441, 0.160140065],
    [149/30, 0.610522928, 0.326243640, 0.176071586],
    [150/30, 0.610522928, 0.326243640, 0.176071586],
    [151/30, 0.610522928, 0.326243640, 0.176071586],
    [152/30, 0.596428132, 0.351606906, 0.200590447],
    [153/30, 0.525404921, 0.369692966, 0.218394927],
    [154/30, 0.525404921, 0.369692966, 0.218394927],
    [155/30, 0.407373761, 0.407246885, 0.255856052],
    [156/30, 0.407373761, 0.407246885, 0.255856052],
    [157/30, 0.407373761, 0.407246885, 0.255856052],
    [158/30, 0.400649794, 0.415442062, 0.306057093],
    [159/30, 0.473286290, 0.373636364, 0.368836364],
    [160/30, 0.473286290, 0.371818182, 0.368836364],
    [161/30, 0.406754032, 0.348181818, 0.414000000],
    [162/30, 0.318044355, 0.457272727, 0.436581818],
    [163/30, 0.318044355, 0.458181818, 0.436581818],
    [164/30, 0.318044355, 0.457272727, 0.436581818],
    [165/30, 0.416834677, 0.515454545, 0.406472727],
    [166/30, 0.416834677, 0.515454545, 0.406472727],
    [167/30, 0.510584677, 0.510000000, 0.350018182],
    [168/30, 0.492943548, 0.437272727, 0.284154545],
    [169/30, 0.492943548, 0.437272727, 0.284154545],
    [170/30, 0.492943548, 0.437272727, 0.284154545],
    [171/30, 0.470262097, 0.420909091, 0.207000000],
    [172/30, 0.501512097, 0.437272727, 0.169363636],
  ],
};

// Monotone cubic interpolation avoids both overshoot and a stop at every
// observation. Neighbouring segments share derivatives, including extrema.
function framingAt(keys: readonly Key[], time: number, c2 = false) {
  if (time <= keys[0][0]) return keys[0].slice(1);
  if (time >= keys.at(-1)![0]) return keys.at(-1)!.slice(1);
  const i = keys.findIndex(k => k[0] >= time), a = keys[i-1], b = keys[i];
  return a.slice(1).map((value, j) => {
    const slope = (n: number) => (keys[n+1][j+1]-keys[n][j+1])/(keys[n+1][0]-keys[n][0]);
    const tangent = (n: number) => {
      if (n === 0 || n === keys.length-1) return 0;
      const left = slope(n-1), right = slope(n);
      return left*right <= 0 ? 0 : c2
        ? Math.sign(left)*Math.min(Math.abs(left),Math.abs(right))
        : 2*left*right/(left+right);
    };
    if(c2) {
      const dt=b[0]-a[0],end=b[j+1],va=tangent(i-1),vb=tangent(i);
      return bernsteinAt([value,value+dt*va/5,value+2*dt*va/5,
        end-2*dt*vb/5,end-dt*vb/5,end],(time-a[0])/dt);
    }
    return travel([value,0,0],[b[j+1],0,0],[tangent(i-1),0,0],[tangent(i),0,0],a[0],b[0],time)[0];
  });
}

function flightCamera(time: number, outcome: Outcome) {
  const f = targetFrame(outcome), ball = ballAt(time, outcome);
  const [x,y,diameter] = framingAt(exposureKeys(flightFraming[outcome], (a,b) => Math.abs(a[3]-b[3]) < 1e-8) as Key[],time,true);
  const [angle,elevation,fov,unmirroredRoll] = framingAt(
    exposureKeys(exitViews[outcome].map(([frame,a,e,fov,roll])=>[frame/30,a,e,fov,roll])) as Key[],time,true);
  const forward = mul(unit(add(add(mul(f.forward,Math.cos(angle)),mul(f.right,side(outcome)*Math.sin(angle))),mul(f.up,elevation))),-1);
  return frameBall(ball,forward,x,y,diameter,fov,side(outcome)*unmirroredRoll);
}

// The rectified film holds the plate size while the answer enters at its final
// size. A vertical move fits both; the former late dolly made the letters swell.
// These are measured exposures. Playback interpolates their group midpoints,
// so duplicated film frames do not turn the final rise into 100 ms pauses.
const revealWordScale = 22*Math.tan(38*Math.PI/360)/550;
const revealWords = (frames: readonly (readonly [number, number])[], bottom: number): Key[] =>
  frames.map(([frame,y])=>[frame/30,9.2+(y-bottom)*revealWordScale]);
export const revealFraming: Record<Outcome, readonly Key[]> = {
  yes: [[timing.yes.hit,0],[173/30,0],[174/30,-.3804555924],[175/30,.1847929696],[176/30,.40],[178/30,.40],[179/30,.74],[180/30,1.35],[181/30,1.35],[182/30,2.25],[185/30,2.25],[186/30,3.20],[187/30,3.20],
    ...revealWords([[188,27],[191,27],[192,117],[193,117],[194,205],[197,205],[198,281],[199,339],[200,339],[201,375],[203,375],[204,393]],393)],
  no: [[timing.no.hit,0],[173/30,0],[174/30,-.4206404831],[175/30,-.4206404831],[176/30,.1080067931],[177/30,.1080067931],[178/30,.32],[179/30,.32],[180/30,.70],[181/30,.70],[182/30,1.20],[183/30,1.20],[184/30,1.86],[185/30,1.86],[186/30,2.83],[187/30,2.83],[188/30,3.66],[189/30,3.66],
    ...revealWords([[190,101],[191,189],[193,189],[194,267],[195,267],[196,329],[197,371],[199,371],[200,393],[201,399],[203,399]],399)],
};
const revealMotion = {
  yes: exposureKeys(revealFraming.yes),
  no: exposureKeys(revealFraming.no),
};

// Whole source poses hold after contact. These inferred settling parameters
// fit the stationary disc and full sphere together; no geometry follows them.
// Columns: time, normal-view blend, normal distance, lateral aim.
export const targetCameraSettling: Record<Outcome, readonly Key[]> = {
  yes: [[timing.yes.hit,0,11,-.27],[173/30,0,11,-.27],
    [174/30,1,11.0742213294,-.2398806540],[175/30,1,11.0024984499,-.3034720089],
    [176/30,1,11,-.27]],
  no: [[timing.no.hit,0,11,-.17],[173/30,0,11,-.17],
    [174/30,.7807843665,11.1205287822,-.3169927445],[175/30,.7807843665,11.1205287822,-.3169927445],
    [176/30,1,10.9434110838,-.1846214260],[177/30,1,10.9434110838,-.1846214260],
    [178/30,1,11,-.17]],
};

// Keep the same measured rise for lighting and framing, including reverse seek.
export function revealRise(time: number, outcome: Outcome) {
  const observed = track(revealFraming[outcome],time)[0];
  const continuous = framingAt(revealMotion[outcome],time,true)[0];
  // Retain the brief impact/settling shot, then make one uninterrupted lift.
  return observed + (continuous-observed)*smooth((time-5.95)/.10)
    + .50*smooth((time-6.03)/(188/30-6.03));
}

// A single motor turn approaches the target. YES eases to its final pose;
// the mirrored route continues to accelerate as the result rises.
export function targetAngleAt(time: number, outcome: Outcome) {
  const t = timing[outcome], rate = 2.3;
  if (outcome === 'no') {
    const duration = .8, elapsed = Math.max(0, time - t.hit), u = Math.min(1, elapsed / duration);
    return -.17 + Math.PI / 4 + rate * (time - t.color)
      + 3 * (duration * (u ** 3 - u ** 4 / 2) + Math.max(0, elapsed - duration));
  }
  const stop = t.color + .20, start = t.hit - .28, duration = stop - start;
  const final = -.28 - Math.PI / 4, u = clamp((time - start) / duration);
  if (time <= start) return final + rate * (duration / 2 + start - time);
  return final + rate * duration * (.5 - u + u ** 3 - u ** 4 / 2);
}

export const ballRotation = {
  yes: ballSpin([0, 0, 11], timing.yes.release, timing.yes.fieldStart, timing.yes.hit),
  no: ballSpin([0, 0, 11], timing.no.release, timing.no.fieldStart, timing.no.hit),
};

// Continue around the flying ball to the actual target. No camera/world cut.
function observedCameraAt(time: number, outcome: Outcome) {
  const base = framingAt(cameras[outcome], time);
  if (time <= timing[outcome].pulseEnd) return base;
  const t = timing[outcome], f = targetFrame(outcome), impact = flightCamera(t.hit,outcome);
  let position: Vec3, aim: Vec3, roll=0, fov=38;
  if (time < t.hit) {
    const shot = flightCamera(time,outcome), settle = smooth((time-(t.hit-.02))/.02);
    position = mix(shot.position,impact.position,settle);
    roll = shot.roll * (1-settle);
    fov = shot.fov + (38-shot.fov)*settle;
    aim = mix(shot.aim,impact.aim,settle);
  } else {
    const rise = revealRise(time,outcome), [pull,distance,lateral] = track(targetCameraSettling[outcome],time);
    const centre = add(f.center,mul(f.right,lateral));
    aim = add(mix(impact.aim,centre,pull),mul(f.up,rise));
    position = add(aim,mix(sub(impact.position,impact.aim),mul(f.normal,distance),pull));
  }
  const close = [...position, ...aim, fov, roll], blend = smooth((time - timing[outcome].pulseEnd) * 30);
  return base.map((value, i) => value + (close[i] - value) * blend);
}

const cameraRails: Partial<Record<Outcome, (time: number) => number[]>> = {};
export function cameraAt(time: number, outcome: Outcome) {
  const rail = cameraRails[outcome] ??= smoothCamera(t => [...observedCameraAt(t, outcome), ...ballAt(t, outcome)], DURATION);
  // Smooth the orbit without letting the rapidly moving flight ball escape
  // its close-up. Fade the tracking correction before impact so the camera
  // does not inherit the ball's sudden stop against the target.
  const values = rail(time), camera = values.slice(0, 8), t = timing[outcome];
  const anchor = ballAt(time, outcome), blend = smooth((time - (t.exit - .04)) / .14) * (1 - smooth((time - (t.hit - .16)) / .16));
  for (let i = 0; i < 6; i++) camera[i] += (anchor[i % 3] - values[8 + i % 3]) * blend;
  return camera;
}

// The separate oval indicator has its own reference beats, not the pin colors.
// First visible frames in the fixed-perspective 30 fps originals. The balls
// switch in place. Only the last coil YES overlaps the outgoing NO (one
// source frame in the left route, two in the right route).
const beats: Record<Outcome, readonly (readonly [number, Outcome])[]> = {
  yes: [[42/30,'yes'],[51/30,'no'],[61/30,'yes'],[71/30,'no'],[80/30,'yes'],[87/30,'no'],[98/30,'yes'],[108/30,'no'],[116/30,'yes'],[127/30,'no'],[137/30,'yes'],[156/30,'no'],[167/30,'yes']],
  no: [[44/30,'yes'],[53/30,'no'],[63/30,'yes'],[72/30,'no'],[82/30,'yes'],[89/30,'no'],[100/30,'yes'],[110/30,'no'],[118/30,'yes'],[129/30,'no'],[138/30,'yes'],[158/30,'no'],[167/30,'yes']],
};
const indicatorEnd = 174/30;
export function indicatorAt(time: number, outcome: Outcome): Outcome | null {
  if (reached(time,indicatorEnd)) return null;
  return [...beats[outcome]].reverse().find(([t]) => reached(time,t))?.[1] ?? null;
}
export function indicatorBallsAt(time: number, outcome: Outcome) {
  return beats[outcome].flatMap(([start, value], i, all) => {
    const end = i===9 ? (outcome==='yes'?138:140)/30 : all[i+1]?.[0] ?? indicatorEnd;
    if (!reached(time,start) || reached(time,end)) return [];
    return [{ key: start, outcome: value, x: value==='yes'?217.5:68.5, y: value==='yes'?32:49, tilt: 0 }];
  });
}
export function phaseAt(time: number, outcome: Outcome = 'yes') {
  const t = timing[outcome];
  if (!reached(time,t.release)) return 'star';
  if (!reached(time,pinContacts[outcome][0][0])) return 'release';
  if (!reached(time,t.fieldEnd)) return 'pins';
  if (!reached(time,t.pulseStart)) return 'spiral-entry';
  if (!reached(time,t.pulseEnd)) return 'spiral-color';
  if (!reached(time,t.hit)) return 'exit';
  if (!reached(time,t.color)) return 'target';
  if (!reached(time,6.2)) return 'target-color';
  if (!reached(time,DURATION)) return 'answer-entry';
  return 'result';
}
