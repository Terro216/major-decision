import { BALL_RADIUS, PIN_RADIUS, fields, side, sub, unit, mul, dot, type Outcome, type Vec3 } from './mechanism.ts';

type Span = { start: number; end: number; a: number; b: number; va: number; vb: number };
const controls = (s: Span) => [s.a, s.a + s.va*(s.end-s.start)/3, s.b - s.vb*(s.end-s.start)/3, s.b];
const speedBound = (s: Span) => Math.max(Math.abs(s.va), Math.abs(s.vb), Math.abs(3*(s.b-s.a)/(s.end-s.start)-s.va-s.vb));
function sample(s: Span, time: number) {
  const u=Math.max(0,Math.min(1,(time-s.start)/(s.end-s.start))), v=1-u, c=controls(s);
  return { value:c[0]*v*v*v+3*c[1]*v*v*u+3*c[2]*v*u*u+c[3]*u*u*u,
    velocity:3*((c[1]-c[0])*v*v+2*(c[2]-c[1])*v*u+(c[3]-c[2])*u*u)/(s.end-s.start) };
}

// The filmed approach arrives in front of the first pin, then turns around its
// left side (mirrored on RIGHT). A polar curve preserves the full radial gap
// during that turn; its endpoint velocity is the exact incoming reflection.
export function fanEntry(path: Outcome, start: number, contact: number, contactSpeed: number, startSpeed: number) {
  const f=fields[path], s=side(path), center=f.pins[f.contacts[0]].position;
  const hit=f.points[1], outgoing=unit(sub(f.points[2],hit));
  const normal=unit([hit[0]-center[0],0,hit[2]-center[2]]);
  const incoming=mul(sub(outgoing,mul(normal,2*dot(outgoing,normal))),contactSpeed);
  const radius=BALL_RADIUS+PIN_RADIUS, middle=contact-2/30;
  const startRadius=Math.hypot(f.points[0][0]-center[0],f.points[0][2]-center[2]);
  const middleRadius=Math.hypot(.060453210003,-1.069133494921);
  const middleAngle=Math.atan2(-1.069133494921,.060453210003);
  const endAngle=Math.atan2(hit[2]-center[2],s*(hit[0]-center[0]))-2*Math.PI;
  const radialSpeed=dot(incoming,normal);
  const angularSpeed=(-normal[2]*s*incoming[0]+s*normal[0]*incoming[2])/radius;
  const radial: Span[]=[
    {start,end:middle,a:startRadius,b:middleRadius,va:-startSpeed,vb:-startSpeed},
    {start:middle,end:contact,a:middleRadius,b:radius,va:-startSpeed,vb:radialSpeed},
  ];
  const angular: Span[]=[
    {start,end:middle,a:-Math.PI/2,b:middleAngle,va:0,vb:0},
    {start:middle,end:contact,a:middleAngle,b:endAngle,va:0,vb:angularSpeed},
  ];
  return {
    incoming,
    join: middle,
    startVelocity:[0,0,startSpeed] as Vec3,
    // A cubic lies in the convex hull of its controls. This certifies the
    // first cylinder continuously, including the exact zero-gap contact.
    minimumRadius:Math.min(...radial.flatMap(controls)),
    // Radial and tangential derivatives are orthogonal, so their Euclidean
    // norm is a tighter continuous bound than summing their magnitudes.
    speedBound:Math.max(...radial.map((r,i)=>Math.hypot(speedBound(r),Math.max(...controls(r))*speedBound(angular[i])))),
    at(time: number): Vec3 {
      const i=time<middle?0:1, r=sample(radial[i],time).value, a=sample(angular[i],time).value;
      return [center[0]+s*r*Math.cos(a),hit[1],center[2]+r*Math.sin(a)];
    },
  };
}
