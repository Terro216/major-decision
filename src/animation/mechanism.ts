// World dimensions and centre lines used by BOTH the renderer and choreography.
// These are a reconstruction, not measurements recovered from the film.
export type Outcome = 'yes' | 'no';
export type Vec3 = readonly [number, number, number];
export const BALL_RADIUS = .58;
export const PIN_RADIUS = .13;
// Film pins are visibly taller than the ball diameter. Their height is a
// reconstructed proportion, not a measured mesh, and stays constant in time.
export const PIN_HEIGHT = 2.50;
export const RUN_HEIGHT = .78;
// The lower mouth faces diagonally toward the end of the pin field. The
// free approach turns onto that axis before entering the straight open lip.
// This is one fixed layout; neither pins nor turns move with the camera.
export const TUBE = { inner: .70, outer: .78, rim: 1.04, radius: 4.5, rise: 5.4, angle: Math.PI * 3.95, lead: 1, x: 7, y: 1.08, z: 11, yaw: 1.1 } as const;
// Leave room behind the impact for the reference camera's pullback. With a
// short flight that camera retreated into the outlet and looked through it.
export const TARGET = { scale: 2, face: .20, impactDrop: .25, flight: 20.2, hit: 5.80, color: 5.93 } as const;
export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a: Vec3, n: number): Vec3 => [a[0] * n, a[1] * n, a[2] * n];
export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const length = (a: Vec3) => Math.hypot(...a);
export const unit = (a: Vec3): Vec3 => mul(a, 1 / length(a));
export const mix = (a: Vec3, b: Vec3, u: number): Vec3 => add(a, mul(sub(b, a), u));
export const cross = (a: Vec3, b: Vec3): Vec3 => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
export const side = (outcome: Outcome) => outcome === 'yes' ? 1 : -1;
export const fieldOffset = (outcome: Outcome): Vec3 => [-side(outcome) * 1.5, 0, -2.15];
// The raised source belongs to the same fixed assembly as the fan. The camera
// leaves the star above the frame without hiding its mesh or spreading the fan.
export const sourcePosition = (outcome: Outcome): Vec3 => add([side(outcome)*.775, 5.2, -13], fieldOffset(outcome));
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
  const impact = add(tubePoint(tubeLength, outcome), mul(forward, TARGET.flight));
  // The film's ball lands below the disc centre. Move the plate, not the
  // already tangent flight: the same full sphere still meets its front plane.
  const center = add(add(impact, mul(forward, BALL_RADIUS + TARGET.face * TARGET.scale)), mul(up, TARGET.impactDrop));
  return { forward, normal, right, up, impact, center };
}

const hitXs: Record<Outcome, readonly number[]> = {
  // The last two contacts leave the side of the fan, rather than ending
  // among the neutral rows. The inlet remains fixed in the same world.
  yes: [-1.0, 1.0, -1.3, .9, -1.5, 1.2, -3.0, -5.3],
  no: [1.0, -1.1, 1.3, -.9, 1.5, -1.2, 3.0, 5.3],
};
export type Pin = { position: Vec3; contact?: number; color?: Outcome };
function makeField(outcome: Outcome) {
  // Move the complete fan as one assembly, leaving a clear exit toward the
  // lower mouth. Contacts and surrounding cylinders share this transform.
  const offset = fieldOffset(outcome);
  const points: Vec3[] = ([[0, RUN_HEIGHT, -5.5], ...hitXs[outcome].map((x, row): Vec3 => [x, RUN_HEIGHT, -2.5 + row * .85]), [side(outcome) * .35, RUN_HEIGHT, 6.0]] as Vec3[]).map(p => add(p,offset));
  const colors: Outcome[] = ['no', 'no', 'no', 'yes', 'no', 'yes', 'no', outcome];
  // Place each contacted cylinder on the bisector of the elastic rebound.
  // The adjacent straight segments are outside its Minkowski-expanded surface.
  const pins: Pin[] = points.slice(1, -1).map((p, i) => {
    const incoming = unit(sub(p, points[i])), outgoing = unit(sub(points[i + 2], p));
    const normal = unit(sub(outgoing, incoming));
    const center = sub(p, mul(normal, BALL_RADIUS + PIN_RADIUS));
    return { position: [center[0], 0, center[2]], contact: i + 1, color: colors[i] };
  });
  // Fill the surrounding triangular fan. Keep the swept sphere corridor clear;
  // the old 1.25 grid left gaps narrower than the ball's diameter.
  for (let row = 0; row < 8; row++) {
    const count = row + 2;
    for (let col = 0; col < count; col++) {
      // The surrounding fan ends before the final contact. The previous
      // longer rows continued beside the ball all the way toward the mouth.
      const p: Vec3 = add([(col - (count - 1) / 2) * 1.55, RUN_HEIGHT, -3.4 + row * .95],offset);
      if (points.slice(1).some((b, i) => segmentDistance(p, points[i], b) < BALL_RADIUS + PIN_RADIUS + .12)) continue;
      if (pins.some(pin => Math.hypot(pin.position[0] - p[0], pin.position[2] - p[2]) < .65)) continue;
      pins.push({ position: [p[0], 0, p[2]] });
    }
  }
  const distances = [0];
  for (let i = 1; i < points.length; i++) distances.push(distances[i - 1] + length(sub(points[i], points[i - 1])));
  return { points, pins, distances, length: distances.at(-1)! };
}
export const fields = { yes: makeField('yes'), no: makeField('no') };
