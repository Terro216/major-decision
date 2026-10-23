// World dimensions and centre lines used by BOTH the renderer and choreography.
// These are a reconstruction, not measurements recovered from the film.
import { fanCurves, fanPins, fanPoints } from './fanPath.ts';
export type Outcome = 'yes' | 'no';
export type Vec3 = readonly [number, number, number];
export type Cubic = readonly [Vec3, Vec3, Vec3, Vec3];
export const BALL_RADIUS = .58;
export const PIN_RADIUS = .13;
// Cap-to-base length measured independently of the reflected lower stem.
export const PIN_HEIGHT = 1.70;
export const RUN_HEIGHT = .80;
export const SOURCE_SCALE = 1.13;
// The raised ring is a flattened torus. These dimensions also define a
// containing annular volume for conservative full-sphere clearance checks.
export const STAR_RING = { radius: .62, radial: .055, axial: .0275, z: .21 } as const;
// The lower mouth faces diagonally toward the end of the pin field. The
// free approach turns onto that axis before entering the straight open lip.
// This is one fixed layout; neither pins nor turns move with the camera.
export const TUBE = { inner: .70, outer: .78, rim: 1.68, radius: 5.2613648857, rise: 5.1546241097, angle: Math.PI * 3.95, lead: 1.2352442705, x: 10.3643724692, y: 1.2339671542, z: 1.6403363918, yaw: 1.6317500420 } as const;
// The fixed target is constrained by its direct image and floor reflection.
// `flight` is the progress coordinate used by the measured timing, not the
// length of the curved world-space route. The last eight units are straight.
export const TARGET = { scale: 1.9, face: .20, impactDrop: .25, flight: 20.2, center: [50.9738360956, 6.2515538554, 2.5508490987] } as const;
export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a: Vec3, n: number): Vec3 => [a[0] * n, a[1] * n, a[2] * n];
export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const length = (a: Vec3) => Math.hypot(...a);
export const unit = (a: Vec3): Vec3 => mul(a, 1 / length(a));
export const mix = (a: Vec3, b: Vec3, u: number): Vec3 => add(a, mul(sub(b, a), u));
export const cross = (a: Vec3, b: Vec3): Vec3 => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
export function cubicAt(p: Cubic, u: number): Vec3 {
  const v=1-u;
  return add(add(mul(p[0],v*v*v),mul(p[1],3*v*v*u)),add(mul(p[2],3*v*u*u),mul(p[3],u*u*u)));
}
export function cubicSpeedBound(p: Cubic, from=0, to=1) {
  const controls=[mul(sub(p[1],p[0]),3),mul(sub(p[2],p[1]),3),mul(sub(p[3],p[2]),3)];
  const at=(u:number)=>mix(mix(controls[0],controls[1],u),mix(controls[1],controls[2],u),u);
  const first=at(from),last=at(to);
  // Exact quadratic derivative controls restricted to this parameter range.
  // Their convex hull bounds every velocity between the sampled endpoints.
  const tangent=mul(mix(sub(controls[1],controls[0]),sub(controls[2],controls[1]),from),2);
  const middle=add(first,mul(tangent,(to-from)/2));
  return Math.max(length(first),length(middle),length(last));
}
export const side = (outcome: Outcome) => outcome === 'yes' ? 1 : -1;
export const fieldOffset = (outcome: Outcome): Vec3 => [-side(outcome) * 1.5, 0, -2.15];
// The raised source belongs to the same fixed assembly as the fan. The camera
// leaves the star above the frame without hiding its mesh or spreading the fan.
export const sourcePosition = (outcome: Outcome): Vec3 => add([0, 5.245373494, -11], fieldOffset(outcome));
export function segmentDistance(p: Vec3, a: Vec3, b: Vec3) {
  const ab = sub(b, a);
  return length(sub(p, mix(a, b, Math.max(0, Math.min(1, dot(sub(p, a), ab) / dot(ab, ab))))));
}

export const helixLength = Math.hypot(TUBE.radius * TUBE.angle, TUBE.rise);
export const tubeLength = helixLength + 2 * TUBE.lead;
// Blend the straight mouths into the helix over a short fixed length. Matching
// only tangents left an instantaneous change of lateral acceleration here.
export const tubeBlend = .4;
const helixCurvature = TUBE.radius * TUBE.angle ** 2 / helixLength ** 2;
// |H(s)-L(s)| <= curvature*s^2/2 and max smootherstep' = 1.875.
// The blended coordinate is almost arc length, but use this conservative bound
// when certifying all the unsampled intervals against the actual wall mesh.
export const tubeParameterSpeedBound = 1 + helixCurvature * tubeBlend * 1.875 / 4;
export function helixPoint(u: number, outcome: Outcome): Vec3 {
  const a = -Math.PI / 2 + u * TUBE.angle;
  return [side(outcome) * (TUBE.x + Math.sin(a + TUBE.yaw) * TUBE.radius), TUBE.y + u * TUBE.rise, TUBE.z + Math.cos(a + TUBE.yaw) * TUBE.radius];
}
export function helixTangent(u: number, outcome: Outcome): Vec3 {
  const a = -Math.PI / 2 + u * TUBE.angle;
  return unit([side(outcome) * Math.cos(a + TUBE.yaw) * TUBE.radius * TUBE.angle, TUBE.rise, -Math.sin(a + TUBE.yaw) * TUBE.radius * TUBE.angle]);
}
function tubeSample(distance: number, outcome: Outcome): { point: Vec3; derivative: Vec3 } {
  const s = distance - TUBE.lead;
  const end = s < helixLength / 2 ? 0 : 1;
  const offset = s - end * helixLength;
  const axis = helixTangent(end, outcome);
  const straight = add(helixPoint(end, outcome), mul(axis, offset));
  if (s <= -tubeBlend || s >= helixLength + tubeBlend) return { point: straight, derivative: axis };
  const point = helixPoint(s / helixLength, outcome), derivative = helixTangent(s / helixLength, outcome);
  if (s >= tubeBlend && s <= helixLength - tubeBlend) return { point, derivative };
  const u = (offset + tubeBlend) / (2 * tubeBlend);
  const w = u ** 3 * (10 + u * (-15 + 6 * u));
  const dw = 30 * u ** 2 * (u - 1) ** 2 / (2 * tubeBlend);
  const a = end === 0 ? straight : point, b = end === 0 ? point : straight;
  const da = end === 0 ? axis : derivative, db = end === 0 ? derivative : axis;
  return { point: mix(a, b, w), derivative: add(mix(da, db, w), mul(sub(b, a), dw)) };
}
// One C2 centre line for both the wall and the full-radius sphere. Outside the
// two blends this is exact arc length; endpoints and their axes are unchanged.
export const tubePoint = (distance: number, outcome: Outcome): Vec3 => tubeSample(distance, outcome).point;
export function tubeTangent(distance: number, outcome: Outcome) {
  return unit(tubeSample(distance, outcome).derivative);
}
export function targetFrame(outcome: Outcome) {
  const forward = tubeTangent(tubeLength, outcome), normal = mul(forward, -1);
  const right = unit(cross([0, 1, 0], normal)), up = cross(normal, right);
  const center: Vec3 = [side(outcome)*TARGET.center[0],TARGET.center[1],TARGET.center[2]];
  const impact = sub(sub(center,mul(forward,BALL_RADIUS+TARGET.face*TARGET.scale)),mul(up,TARGET.impactDrop));
  return { forward, normal, right, up, impact, center };
}

// Let the whole sphere clear the real outlet before bending. Quintic blending
// joins both straight portions with equal position, tangent and curvature.
export const flightCurveBreaks = [1.2, TARGET.flight-8] as const;
function flightOffset(outcome: Outcome) {
  return sub(targetFrame(outcome).impact,add(tubePoint(tubeLength,outcome),mul(tubeTangent(tubeLength,outcome),TARGET.flight)));
}
export function flightPoint(distance: number, outcome: Outcome): Vec3 {
  const [start,end]=flightCurveBreaks, u=Math.max(0,Math.min(1,(distance-start)/(end-start)));
  const w=u**3*(10+u*(-15+6*u));
  return add(add(tubePoint(tubeLength,outcome),mul(tubeTangent(tubeLength,outcome),distance)),mul(flightOffset(outcome),w));
}
// Bound |dP/dd| over a progress interval. Smootherstep's derivative increases
// to u=.5, then decreases; outside the bend it is exactly zero.
export function flightParameterSpeedBound(from: number, to: number, outcome: Outcome) {
  const [start,end]=flightCurveBreaks;
  if(to<=start||from>=end) return 1;
  const low=Math.max(0,(from-start)/(end-start)),high=Math.min(1,(to-start)/(end-start));
  const u=Math.max(low,Math.min(.5,high));
  const peak=30*u*u*(1-u)*(1-u)/(end-start);
  // The norm of axis + offset*w' is convex in w'. Its maximum over [0,peak]
  // is at an endpoint; unlike the triangle inequality this retains direction.
  return Math.max(1,length(add(tubeTangent(tubeLength,outcome),mul(flightOffset(outcome),peak))));
}

export type Pin = { position: Vec3; contact?: number; color?: Outcome };
function makeField(outcome: Outcome) {
  const place = (p: readonly [number, number]): Vec3 => add([side(outcome)*p[0],RUN_HEIGHT,p[1]-5.5],fieldOffset(outcome));
  const points=fanPoints.map(place);
  const curves = new Map<number, Cubic>(fanCurves.map(({endPoint,handles}) =>
    [endPoint,[points[endPoint-1],place(handles[0]),place(handles[1]),points[endPoint]]]));
  const pins: Pin[]=[];
  for(let row=0;row<6;row++) for(let col=0;col<6;col++) {
    const p=place([(row-col)*1.3,(row+col)*1.3]);
    pins.push({position:[p[0],0,p[2]]});
  }
  const contacts=fanPins.map(([r,c])=>r*6+c);
  const distances=[0];
  for(let i=1;i<points.length;i++) {
    const curve=curves.get(i);
    // The departure has equal endpoint derivative magnitudes. Scaling its
    // progress to that derivative preserves physical speed at both joins.
    const span=curve?3*length(sub(curve[1],curve[0])):length(sub(points[i],points[i-1]));
    distances.push(distances[i-1]+span);
  }
  return {points,curves,pins,contacts,distances,length:distances.at(-1)!};
}
export const fields = { yes: makeField('yes'), no: makeField('no') };
