import { test, expect } from '@playwright/test';
import * as THREE from 'three';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { flights, flightFraming, revealFraming, targetCameraSettling, ballAt, cameraAt, cameraUp, DURATION, entryLead, entrySpeed, exitSpeed, fallEnd, fieldEntries, fieldSpeed, fieldVelocityBound, pinContacts, releases, sourceAngleAt, sourceBall, targetAngleAt, timing, tubeDistanceAt, tubeMotion } from '../src/animation/timeline';
import { add, BALL_RADIUS, fields, flightCurveBreaks, flightPoint, helixLength, PIN_HEIGHT, PIN_RADIUS, segmentDistance, sourcePosition, SOURCE_SCALE, STAR_RING, sub, length, unit, dot, cross, mix, mul, targetFrame, TARGET, TUBE, tubeBlend, tubeLength, tubeParameterSpeedBound, tubePoint, tubeTangent, type Cubic, type Vec3 } from '../src/animation/mechanism';
import { tubeGeometry, wallSorter } from '../src/animation/tubeGeometry';
import { fanCamera } from '../src/animation/fanCamera';
import { inletCamera } from '../src/animation/inletCamera';

// Spatial index of the actual render triangles, not a second idealized tube.
function wallIndex(geometry: THREE.BufferGeometry) {
  const p = geometry.attributes.position, ids = geometry.index!;
  const triangles: THREE.Triangle[] = [], bins = new Map<string, number[]>(), cell = 1.6;
  const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
  for (let i = 0; i < ids.count; i += 3) {
    const vs = [0,1,2].map(k => new THREE.Vector3().fromBufferAttribute(p, ids.getX(i+k)));
    const tri = new THREE.Triangle(vs[0], vs[1], vs[2]), n = triangles.push(tri) - 1;
    const box = new THREE.Box3().setFromPoints(vs).expandByScalar(BALL_RADIUS + .17);
    for (let x=Math.floor(box.min.x/cell); x<=Math.floor(box.max.x/cell); x++)
      for (let y=Math.floor(box.min.y/cell); y<=Math.floor(box.max.y/cell); y++)
        for (let z=Math.floor(box.min.z/cell); z<=Math.floor(box.max.z/cell); z++) {
          const k=key(x,y,z); if (!bins.has(k)) bins.set(k, []); bins.get(k)!.push(n);
        }
  }
  const point = new THREE.Vector3(), closest = new THREE.Vector3();
  return (p: Vec3) => {
    point.fromArray(p);
    let minimum = .17; // Everything outside this bin is farther than r + .17.
    for (const i of bins.get(key(...p.map(v => Math.floor(v/cell)) as [number,number,number])) ?? []) {
      triangles[i].closestPointToPoint(point, closest);
      minimum = Math.min(minimum, point.distanceTo(closest) - BALL_RADIUS);
    }
    return minimum;
  };
}

// A Bezier lies inside the convex hull of its controls. Subdivision tightens
// that hull, so this covers the complete curved corridor, not only samples.
function certifiedCurveGap(curve: Cubic, pins: readonly {position:Vec3}[], depth=0): number {
  const turn=(a:Vec3,b:Vec3,c:Vec3)=>(b[0]-a[0])*(c[2]-a[2])-(b[2]-a[2])*(c[0]-a[0]);
  const points=curve.map(p=>[p[0],0,p[2]] as Vec3).sort((a,b)=>a[0]-b[0]||a[2]-b[2]);
  const half=(values:Vec3[])=>{const hull:Vec3[]=[];for(const p of values){while(hull.length>1&&turn(hull.at(-2)!,hull.at(-1)!,p)<=0)hull.pop();hull.push(p);}return hull;};
  const lower=half(points),upper=half([...points].reverse()),hull=[...lower.slice(0,-1),...upper.slice(0,-1)];
  const radius=BALL_RADIUS+PIN_RADIUS;
  const gap=Math.min(...pins.map(pin=>{
    const p:Vec3=[pin.position[0],0,pin.position[2]];
    if(hull.length>2&&hull.every((a,i)=>turn(a,hull[(i+1)%hull.length],p)>=0))return -radius;
    return Math.min(...hull.map((a,i)=>{
      const b=hull[(i+1)%hull.length];return length(sub(b,a))<1e-14?length(sub(p,a)):segmentDistance(p,a,b);
    }))-radius;
  }));
  if(gap>=-1e-10)return gap;
  if(depth>=26)throw new Error(`Curved corridor has no clearance certificate: ${gap}`);
  const a=mix(curve[0],curve[1],.5),b=mix(curve[1],curve[2],.5),c=mix(curve[2],curve[3],.5);
  const d=mix(a,b,.5),e=mix(b,c,.5),middle=mix(d,e,.5);
  return Math.min(certifiedCurveGap([curve[0],a,d,middle],pins,depth+1),certifiedCurveGap([middle,e,c,curve[3]],pins,depth+1));
}

test('geometry: entire swept sphere clears pins, bore, lips and target in both branches', async () => {
  test.setTimeout(120_000);
  const report: Record<string, unknown> = {};
  for (const outcome of ['yes','no'] as const) {
    const field = fields[outcome], t = timing[outcome], entry = fieldEntries[outcome];
    // Exact segment/cylinder check covers the intervals between samples and the
    // tangent contact itself (which has zero clearance by design).
    let segmentGap = Infinity;
    for (let i=2; i<field.points.length; i++) if(!field.curves.has(i)) for (const pin of field.pins) {
      // Project onto XZ for an exact swept-cylinder corridor. A 3D distance
      // to one cap-height point could miss a collision on a descending path.
      const flat=(p: Vec3):Vec3=>[p[0],0,p[2]];
      segmentGap = Math.min(segmentGap, segmentDistance(flat(pin.position), flat(field.points[i-1]), flat(field.points[i])) - BALL_RADIUS - PIN_RADIUS);
    }
    expect(segmentGap, outcome + ' swept pin corridor').toBeGreaterThan(-1e-10);
    const curveGap=Math.min(...[...field.curves.values()].map(curve=>certifiedCurveGap(curve,field.pins)));
    expect(curveGap, outcome+' continuous curved pin corridor').toBeGreaterThanOrEqual(-1e-10);
    // The first approach is polar, not a line. Its Bernstein controls certify
    // clearance from the first cylinder continuously. For every other pin,
    // the derivative bound closes the gaps between the samples below.
    expect(entry.minimumRadius).toBeGreaterThanOrEqual(BALL_RADIUS+PIN_RADIUS-1e-12);
    let entryOtherPinGap=Infinity;
    const firstHit=pinContacts[outcome][0][0], entrySteps=Math.ceil((firstHit-t.fieldStart)/.001);
    const entryDt=(firstHit-t.fieldStart)/entrySteps;
    for(let i=0;i<=entrySteps;i++) {
      const p=entry.at(t.fieldStart+i*entryDt);
      for(let j=0;j<field.pins.length;j++) if(j!==field.contacts[0]) {
        const pin=field.pins[j].position;
        entryOtherPinGap=Math.min(entryOtherPinGap,Math.hypot(p[0]-pin[0],p[2]-pin[2])-BALL_RADIUS-PIN_RADIUS);
      }
    }
    expect(entryOtherPinGap).toBeGreaterThan(entry.speedBound*entryDt/2);
    for (const [contact, [hit, index]] of pinContacts[outcome].entries()) {
      const p = ballAt(hit, outcome), pin = field.pins[index];
      expect(Math.hypot(p[0]-pin.position[0],p[2]-pin.position[2]) - BALL_RADIUS - PIN_RADIUS).toBeCloseTo(0, 8);
      const h = .00001, measuredIncoming = mul(sub(p,ballAt(hit-h,outcome)),1/h);
      if(contact===0) {
        const curvedH=.0000001;
        expect(length(sub(mul(sub(p,ballAt(hit-curvedH,outcome)),1/curvedH),entry.incoming))).toBeLessThan(.001);
      }
      const incomingCurve=field.curves.get(contact+1),outgoingCurve=field.curves.get(contact+2);
      const incoming = unit(contact===0?entry.incoming:incomingCurve?sub(p,incomingCurve[2]):measuredIncoming);
      const outgoing = unit(outgoingCurve?sub(outgoingCurve[1],p):sub(ballAt(hit+h,outcome),p));
      if(incomingCurve||outgoingCurve) {
        const curvedH=.0000001,left=mul(sub(p,ballAt(hit-curvedH,outcome)),1/curvedH),right=mul(sub(ballAt(hit+curvedH,outcome),p),1/curvedH);
        expect(length(sub(unit(left),incoming))).toBeLessThan(.00002);
        expect(length(sub(unit(right),outgoing))).toBeLessThan(.00002);
        expect(Math.abs(length(left)-length(right))).toBeLessThan(.001);
      }
      const normal = unit(sub(p,[pin.position[0],p[1],pin.position[2]]));
      const reflected = sub(incoming,mul(normal,2*dot(incoming,normal)));
      expect(length(sub(reflected,outgoing))).toBeLessThan(1e-8);
    }
    const mesh = tubeGeometry(outcome), original = Array.from(mesh.index!.array);
    const triangles = (indices: number[]) => Array.from({length:indices.length/3},(_,i)=>indices.slice(i*3,i*3+3).join(',')).sort();
    const sort = wallSorter(mesh), direction = new THREE.Vector3(.4,-.2,-1).normalize();
    sort(direction);
    expect(triangles(Array.from(mesh.index!.array))).toEqual(triangles(original));
    const sorted = Buffer.from(mesh.index!.array.buffer).toString('base64');
    sort(new THREE.Vector3(0,-1,0)); sort(direction);
    expect(Buffer.from(mesh.index!.array.buffer).toString('base64')).toBe(sorted);
    const clearance = wallIndex(mesh);
    // Derivative control hulls certify both the cubic free path and quintic
    // tube timing. Include the spatial C2 blends' parameter-speed bound too.
    const travelBound=(a: Vec3,b: Vec3,va: Vec3,vb: Vec3,dt:number)=>Math.max(length(va),length(vb),length(sub(mul(sub(b,a),3/dt),add(va,vb))));
    const v=fieldSpeed(outcome), inletVelocity=mul(tubeTangent(0,outcome),entrySpeed);
    const releaseBound=releases[outcome].speedBound;
    expect(releases[outcome].minimumHeight).toBeGreaterThan(BALL_RADIUS);
    const preTubeBound=Math.max(v,fieldVelocityBound(outcome),entrySpeed,
      releaseBound,
      travelBound(field.points.at(-1)!,add(tubePoint(0,outcome),mul(tubeTangent(0,outcome),-entryLead)),mul(unit(sub(field.points.at(-1)!,field.points.at(-2)!)),v),inletVelocity,t.approach-t.fieldEnd));
    const tubeBound=tubeMotion(outcome).speedBound*tubeParameterSpeedBound;
    const flightBound=flights[outcome].speedBound;
    expect(flights[outcome].minimumVelocityControl).toBeGreaterThanOrEqual(0);
    expect(tubeMotion(outcome).minimumVelocityControl).toBeGreaterThanOrEqual(-1e-10);
    // Source holds also occur after the outlet. The curved flight covers more
    // world distance between those poses than the former constant cruise.
    // Bound it independently; preserve the field/release guard and use the
    // largest analytic bound for the full-radius interval certificate below.
    expect(preTubeBound).toBeLessThan(150);
    expect(flightBound).toBeLessThan(450);
    expect(tubeBound).toBeLessThan(900);
    const nonTubeBound=Math.max(preTubeBound,flightBound);
    const speedBound=Math.max(nonTubeBound,tubeBound);
    let wallGap=Infinity, pinGap=Infinity, outsideFieldGap=Infinity, floorGap=Infinity, targetGap=Infinity, ringGap=Infinity, maxStep=0, minimumAt=0;
    const source=sourcePosition(outcome);
    const ringClearance=(radius:number,z:number,scale:number)=>{
      // This closed annular cylinder contains every triangle of the real
      // flattened torus. Separation from it also proves mesh separation.
      const radial=Math.max(0,(STAR_RING.radius-STAR_RING.radial)*scale-radius,radius-(STAR_RING.radius+STAR_RING.radial)*scale);
      const axial=Math.max(0,(STAR_RING.z-STAR_RING.axial)*scale-z,z-(STAR_RING.z+STAR_RING.axial)*scale);
      return Math.hypot(radial,axial)-BALL_RADIUS;
    };
    const dt=.0001;
    let previous=ballAt(t.release,outcome);
    for (let time=t.release;time<=DURATION;time+=dt) {
      const p=ballAt(time,outcome), gap=clearance(p);
      if(gap<wallGap) {wallGap=gap;minimumAt=time;}
      floorGap=Math.min(floorGap,p[1]-BALL_RADIUS);
      maxStep=Math.max(maxStep,length(sub(p,previous))); previous=p;
      for (const pin of field.pins) {
        const radial=Math.max(0,Math.hypot(p[0]-pin.position[0],p[2]-pin.position[2])-PIN_RADIUS);
        const vertical=Math.max(0,-p[1],p[1]-PIN_HEIGHT);
        pinGap=Math.min(pinGap,Math.hypot(radial,vertical)-BALL_RADIUS);
        if(time<t.fieldStart||time>t.fieldEnd) outsideFieldGap=Math.min(outsideFieldGap,Math.hypot(radial,vertical)-BALL_RADIUS);
      }
      const frame=targetFrame(outcome);
      const local=sub(p,frame.center),sourceLocal=sub(p,source);
      ringGap=Math.min(ringGap,
        ringClearance(Math.hypot(dot(local,frame.right),dot(local,frame.up)),dot(local,frame.normal),TARGET.scale),
        ringClearance(Math.hypot(sourceLocal[0],sourceLocal[1]),sourceLocal[2],SOURCE_SCALE));
      // The curved approach must stay in front of the target plane. Its last
      // straight portion reaches below the disc centre, tangent to the plate.
      const faceGap=dot(sub(p,frame.center),frame.normal)-TARGET.face*TARGET.scale-BALL_RADIUS;
      if(time>=t.exit) targetGap=Math.min(targetGap,faceGap);
    }
    // Distance is 1-Lipschitz. The analytic derivative bound above gives the
    // maximum travel to the nearest sample. The fast, measured advances
    // between held poses require .1 ms samples against the actual wall mesh.
    const intervalBound=speedBound*dt/2;
    expect(maxStep/dt).toBeLessThan(speedBound);
    expect(wallGap).toBeGreaterThan(intervalBound);
    expect(ringGap).toBeGreaterThan(intervalBound);
    expect(pinGap).toBeGreaterThan(-1e-9);
    expect(outsideFieldGap).toBeGreaterThan(intervalBound);
    expect(floorGap).toBeGreaterThan(nonTubeBound*dt/2);
    expect(targetGap).toBeGreaterThan(-1e-10);
    // Inside the tube, height grows monotonically from the inlet.
    expect(tubePoint(0,outcome)[1]-BALL_RADIUS).toBeGreaterThan(intervalBound);
    for (const distance of [0,tubeLength]) {
      const time=distance===0?t.entry:t.exit, p=ballAt(time,outcome);
      expect(length(sub(p,tubePoint(distance,outcome)))).toBeLessThan(1e-8);
      const velocity=unit(sub(ballAt(time+.00001,outcome),ballAt(time-.00001,outcome)));
      expect(dot(velocity,tubeTangent(distance,outcome))).toBeGreaterThan(.99999);
    }
    mesh.dispose();
    report[outcome]={samples:Math.floor((DURATION-t.release)/dt)+1,stepSeconds:dt,pins:field.pins.length,contacts:field.contacts.length,curvedSegments:field.curves.size,certifiedCurveGap:curveGap,entryMinimumRadius:entry.minimumRadius,entryOtherPinGap,entrySpeedBound:entry.speedBound,exactSegmentGap:segmentGap,minimumPinGap:pinGap,minimumPinGapOutsideField:outsideFieldGap,minimumWallGap:wallGap,minimumWallTime:minimumAt,minimumFloorGap:floorGap,minimumTargetGap:targetGap,minimumRingGap:ringGap,maxSampleSpeed:maxStep/dt,analyticTubeSpeedBound:tubeBound,analyticOtherSpeedBound:nonTubeBound,analyticFlightSpeedBound:flightBound,analyticPreTubeSpeedBound:preTubeBound,wallIntervalBound:intervalBound,ballRadius:BALL_RADIUS,boreRadius:TUBE.inner};
  }
  await writeFile(path.join(process.env.MD_REVIEW_DIR||'.review','geometry-check.json'),JSON.stringify(report,null,2));
});

test('motion continuity: acceleration joins the open mouths and rounded helix without a step', async () => {
  const report=[];
  const second=(sample:(t:number)=>Vec3,t:number,h:number) => mul(add(sub(sample(t+h),mul(sample(t),2)),sample(t-h)),1/(h*h));
  for(const outcome of ['yes','no'] as const) {
    const t=timing[outcome], profile=tubeMotion(outcome), h=.0000025;
    // The entire sphere crosses each open annulus before any centre-line bend.
    // This includes the front/back hemispheres, not only the centre at t.entry.
    expect(TUBE.lead-tubeBlend).toBeGreaterThan(BALL_RADIUS);
    for(const end of [0,tubeLength]) {
      const axis=tubeTangent(end,outcome), mouth=tubePoint(end,outcome);
      for(let offset=-BALL_RADIUS;offset<=BALL_RADIUS;offset+=.01) {
        const centre=tubePoint(end+offset,outcome);
        const lateral=sub(sub(centre,mouth),mul(axis,offset));
        expect(length(lateral)+BALL_RADIUS).toBeLessThan(TUBE.inner);
      }
    }
    // Exact one-sided derivatives of every quintic join. Finite differencing
    // alone can mistake high but continuous jerk at a one-frame advance for
    // an acceleration step. The spatial C2 joins are checked separately below.
    for(const [i,segment] of profile.segments.entries()) {
      expect(Math.abs(segment.acceleration[0])).toBeLessThan(1e-6);
      expect(Math.abs(segment.acceleration.at(-1)!)).toBeLessThan(1e-6);
      if(i) {
        const previous=profile.segments[i-1];
        expect(Math.abs(segment.controls[0]-previous.controls.at(-1)!)).toBeLessThan(1e-10);
        expect(Math.abs(segment.velocity[0]-previous.velocity.at(-1)!)).toBeLessThan(1e-8);
      }
    }
    for(const [i,segment] of flights[outcome].segments.entries()) {
      expect(Math.abs(segment.acceleration[0])).toBeLessThan(1e-6);
      expect(Math.abs(segment.acceleration.at(-1)!)).toBeLessThan(1e-6);
      if(i) {
        const previous=flights[outcome].segments[i-1];
        expect(Math.abs(segment.points[0]-previous.points.at(-1)!)).toBeLessThan(1e-10);
        expect(Math.abs(segment.velocity[0]-previous.velocity.at(-1)!)).toBeLessThan(1e-8);
      }
    }
    const temporal=[];
    for(const join of [t.entry,t.exit]) {
      const sample=(time:number)=>ballAt(time,outcome);
      const jump=length(sub(second(sample,join-2*h,h),second(sample,join+2*h,h)));
      const widerJump=length(sub(second(sample,join-4*h,2*h),second(sample,join+4*h,2*h)));
      const segment=join===t.entry?profile.segments[0]:profile.segments.at(-1)!;
      const jerkBound=Math.max(...segment.acceleration.slice(1).map((a,i)=>
        Math.abs(3*(a-segment.acceleration[i])/(segment.to-segment.from))));
      // Both mouth neighbourhoods are straight. The derivative hull bounds
      // how much a continuous acceleration can change across this stencil.
      expect(jump,`${outcome} acceleration at ${join}`).toBeLessThan(6*h*jerkBound+.04);
      // A real acceleration discontinuity persists as the interval shrinks.
      // The finite difference across a smooth, fast ramp converges instead.
      expect(jump,`${outcome} acceleration converges at ${join}`).toBeLessThan(widerJump*.65+.04);
      temporal.push({time:join,stepSeconds:h,accelerationDifference:jump,jerkBound,widerStepSeconds:2*h,widerAccelerationDifference:widerJump});
    }
    const spatial=[];
    for(const join of [TUBE.lead-tubeBlend,TUBE.lead+tubeBlend,TUBE.lead+helixLength-tubeBlend,TUBE.lead+helixLength+tubeBlend]) {
      const sample=(distance:number)=>tubePoint(distance,outcome);
      const jump=length(sub(second(sample,join-.0002,.0001),second(sample,join+.0002,.0001)));
      expect(jump,`${outcome} centre-line curvature at ${join}`).toBeLessThan(.002);
      spatial.push({distance:join,curvatureDifference:jump});
    }
    let previous=0;
    for(let time=t.entry;time<=t.exit;time+=.001) {
      const distance=tubeDistanceAt(time,outcome);
      expect(distance).toBeGreaterThanOrEqual(previous);
      expect(distance).toBeLessThanOrEqual(tubeLength);
      previous=distance;
    }
    expect(tubeDistanceAt(t.entry,outcome)).toBe(0);
    expect(tubeDistanceAt(t.exit,outcome)).toBeCloseTo(tubeLength,10);
    const heldFrames=outcome==='yes'?[[132,133],[134,136],[138,140],[141,142],[143,144]]:
      [[132,133],[134,135],[136,137],[138,139],[140,141],[143,145]];
    for(const [first,last] of heldFrames) {
      const pose=ballAt(first/30,outcome);
      for(const time of [(first+last)/60,last/30])
        expect(length(sub(ballAt(time,outcome),pose))).toBeLessThan(1e-10);
    }
    const flightHolds=outcome==='yes'?[[147,149],[151,152],[153,155]]:
      [[147,148],[149,151],[153,154],[155,157]];
    for(const [first,last] of flightHolds) {
      const pose=ballAt(first/30,outcome);
      for(const time of [(first+last)/60,last/30])
        expect(length(sub(ballAt(time,outcome),pose))).toBeLessThan(1e-10);
    }
    const flightSpatial=flightCurveBreaks.map(join=>{
      const sample=(distance:number)=>flightPoint(distance,outcome);
      const jump=length(sub(second(sample,join-.0002,.0001),second(sample,join+.0002,.0001)));
      expect(jump,`${outcome} flight curvature at ${join}`).toBeLessThan(.002);
      return {distance:join,curvatureDifference:jump};
    });
    report.push({outcome,profile,temporal,spatial,flightSpatial});
  }
  await writeFile(path.join(process.env.MD_REVIEW_DIR||'.review','continuity-check.json'),JSON.stringify(report,null,2));
});

test('motion continuity: source holds complete observed poses and rejoins its later turn', () => {
  for(const outcome of ['yes','no'] as const) {
    const direction=outcome==='yes'?-1:1;
    let previous=sourceAngleAt(0,outcome);
    for(let time=.0005;time<=1;time+=.0005) {
      const angle=sourceAngleAt(time,outcome);
      expect((angle-previous)*direction).toBeGreaterThanOrEqual(-1e-10);
      previous=angle;
    }
    const holds=outcome==='yes'?[[1,2],[3,5],[9,11],[15,16]]:[[0,2],[3,4],[5,7],[9,10],[11,13],[15,16]];
    for(const [first,last] of holds) for(const u of [.13,.5,.87,1])
      expect(sourceAngleAt((first+(last-first)*u)/30,outcome)).toBeCloseTo(sourceAngleAt(first/30,outcome),10);
    const camera=cameraAt(.5,outcome);
    for(const time of [.505,.52,16/30]) cameraAt(time,outcome).forEach((v,i)=>expect(v).toBeCloseTo(camera[i],9));
    for(const time of [...Array.from({length:25},(_,i)=>i/30),(outcome==='yes'?16:17)/30+.25]) {
      const h=1e-6,a=sourceAngleAt(time,outcome);
      const jump=(s:number)=>Math.abs((-3*a+4*sourceAngleAt(time+s,outcome)-sourceAngleAt(time+2*s,outcome))/(2*s)
        -(3*a-4*sourceAngleAt(time-s,outcome)+sourceAngleAt(time-2*s,outcome))/(2*s));
      expect(jump(h)).toBeLessThan(.001);
      expect(jump(h)).toBeLessThan(jump(2*h)*.35+.00001);
    }
  }
});

test('motion continuity: target holds and turns without reversing or jumping', () => {
  for(const outcome of ['yes','no'] as const) {
    const direction=outcome==='yes'?-1:1;
    let previous=targetAngleAt(5,outcome);
    for(let time=5.0005;time<=DURATION;time+=.0005) {
      const angle=targetAngleAt(time,outcome);
      expect((angle-previous)*direction,`${outcome} reverses at ${time}`).toBeGreaterThanOrEqual(-1e-10);
      previous=angle;
    }
    // Source holds constrain a whole interval, including arbitrary seeks.
    const holds=outcome==='yes'?[[163,166],[167,169],[171,173],[176,178]]:[[165,166],[168,170],[172,173],[174,175],[176,177]];
    for(const [first,last] of holds) for(const u of [.13,.5,.87,1])
      expect(targetAngleAt((first+(last-first)*u)/30,outcome)).toBeCloseTo(targetAngleAt(first/30,outcome),10);
    const cameraHolds=outcome==='yes'?[[171,173]]:[[172,173],[174,175],[176,177]];
    for(const [first,last] of cameraHolds) for(const u of [.13,.5,.87,1]) {
      const start=cameraAt(first/30,outcome),pose=cameraAt((first+(last-first)*u)/30,outcome);
      pose.forEach((v,i)=>expect(v).toBeCloseTo(start[i],10));
    }
    for(let frame=159;frame<=196;frame++) {
      const time=frame/30,h=1e-6,a=targetAngleAt(time,outcome);
      const jump=(step:number)=>Math.abs(
        (-3*a+4*targetAngleAt(time+step,outcome)-targetAngleAt(time+2*step,outcome))/(2*step)
        -(3*a-4*targetAngleAt(time-step,outcome)+targetAngleAt(time-2*step,outcome))/(2*step));
      expect(jump(h),`${outcome} angular velocity at ${frame}`).toBeLessThan(.001);
      expect(jump(h)).toBeLessThan(jump(2*h)*.35+.00001);
    }
  }
});

test('geometry: joins preserve position and velocity; impact stops at the target surface', async () => {
  const report: Record<string,unknown>={};
  for(const outcome of ['yes','no'] as const) {
    const t=timing[outcome], h=.000001;
    for(const join of [...releases[outcome].joins,fallEnd(outcome),t.fieldStart,fieldEntries[outcome].join,t.fieldEnd,t.approach,t.entry,t.exit,...flights[outcome].joins]) {
      // Resolve the fast C2 exit ramp with the same convergence check used
      // for the camera below. Keep the velocity and position limits intact.
      const step=h/4, p=ballAt(join,outcome), before=ballAt(join-step,outcome), after=ballAt(join+step,outcome);
      expect(length(sub(after,before)),`${outcome} position at ${join}`).toBeLessThan(.001);
      const left=mul(sub(p,before),1/step), right=mul(sub(after,p),1/step);
      const jump=length(sub(right,left));
      const wider=length(sub(mul(sub(ballAt(join+h,outcome),p),1/h),mul(sub(p,ballAt(join-h,outcome)),1/h)));
      expect(jump,`${outcome} velocity at ${join}`).toBeLessThan(.01);
      expect(jump,`${outcome} velocity converges at ${join}`).toBeLessThan(wider*.35+.0001);
    }
    expect(length(sub(ballAt(t.hit,outcome),targetFrame(outcome).impact))).toBeLessThan(1e-9);
    expect(ballAt(6.9,outcome)).toEqual(ballAt(t.hit,outcome));
    const impactOffset=sub(ballAt(t.hit,outcome),targetFrame(outcome).center);
    expect(dot(impactOffset,targetFrame(outcome).up)).toBeCloseTo(-TARGET.impactDrop,9);
    // The lower strike clears the real raised rim and stays on the disc.
    expect(TARGET.impactDrop+BALL_RADIUS).toBeLessThan(1.08*TARGET.scale);
    for(const [radius,depth,width] of [[.62,.21,.035]]) {
      const ringGap=Math.hypot(radius*TARGET.scale-TARGET.impactDrop,BALL_RADIUS+(TARGET.face-depth)*TARGET.scale)-width*TARGET.scale-BALL_RADIUS;
      expect(ringGap).toBeGreaterThan(.1);
    }
    for(const join of [6.03,188/30,t.hit-.02,t.hit,t.hit+.17,t.color,t.settled,...flights[outcome].joins,...flightFraming[outcome].map(k=>k[0]),...revealFraming[outcome].map(k=>k[0]),...targetCameraSettling[outcome].map(k=>k[0]),...fanCamera[outcome].map(k=>k[0]),...inletCamera[outcome].map(k=>k[0]),t.exit,t.pulseEnd,t.pulseEnd+1/30,.45,.49,.70,.95,1.40,1.65,1.70,1.90,1.95,2.40,2.60,2.72,2.90,3.20,3.65,3.70,4.15,4.30,4.40,4.50,4.57,4.70,4.91,4.94,5.05,5.18,5.20,5.34,5.35,5.40,5.45,5.48,5.55,5.60,5.70,5.8,5.97,6.03,6.16,6.76]) {
      // Second-order one-sided derivatives cancel each side's acceleration.
      // A first-order secant mistook the measured fast zoom's finite
      // acceleration for a velocity jump. Keep the .02 limit and additionally
      // require convergence against the doubled derivative stencil.
      const cameraStep=h/4;
      const a=cameraAt(join-cameraStep,outcome), b=cameraAt(join,outcome), c=cameraAt(join+cameraStep,outcome);
      const samples=[-4,-2,-1,1,2,4].map(n=>cameraAt(join+n*h,outcome));
      for(let i=0;i<8;i++) {
        const [left4,left2,left1,right1,right2,right4]=samples.map(p=>p[i]);
        const jump=Math.abs((-3*b[i]+4*right1-right2)/(2*h)-(3*b[i]-4*left1+left2)/(2*h));
        const wider=Math.abs((-3*b[i]+4*right2-right4)/(4*h)-(3*b[i]-4*left2+left4)/(4*h));
        expect(Math.abs(c[i]-a[i]),`${outcome} camera position at ${join}`).toBeLessThan(.001);
        expect(jump,`${outcome} camera velocity at ${join}`).toBeLessThan(.02);
        expect(jump,`${outcome} camera velocity converges at ${join}`).toBeLessThan(wider*.35+.0005);
      }
    }
    const f=targetFrame(outcome);
    // The final pullback used to retreat inside the outlet after impact. Check
    // the whole camera move as well as the ball, including the result reveal.
    const axis=Array.from({length:257},(_,i)=>tubePoint(i/256*tubeLength,outcome));
    let cameraGap=Infinity, cameraTime=0, cameraPinGap=Infinity, cameraFloorGap=Infinity, frustumGap=Infinity, frustumTime=0, samples=0;
    for(let time=0;time<=DURATION;time+=.001) {
      samples++;
      const c=cameraAt(time,outcome), position=c.slice(0,3) as unknown as Vec3;
      const distance=Math.min(...axis.slice(1).map((b,i)=>segmentDistance(position,axis[i],b)));
      if(distance<cameraGap) {cameraGap=distance;cameraTime=time;}

      cameraFloorGap=Math.min(cameraFloorGap,position[1]);
      for(const pin of fields[outcome].pins) {
        const radial=Math.max(0,Math.hypot(position[0]-pin.position[0],position[2]-pin.position[2])-PIN_RADIUS);
        const vertical=Math.max(0,-position[1],position[1]-PIN_HEIGHT);
        const gap=Math.hypot(radial,vertical);
        cameraPinGap=Math.min(cameraPinGap,gap);

      }

      if(time>=t.release&&time<=t.hit) {
        const forward=unit(sub(c.slice(3,6) as unknown as Vec3,position));
        const right=unit(cross(forward,cameraUp(c))), up=cross(right,forward), ball=sub(ballAt(time,outcome),position);
        const depth=dot(ball,forward), vertical=Math.tan(c[6]*Math.PI/360), horizontal=vertical*1241/688;
        const gap=Math.min((depth*horizontal-Math.abs(dot(ball,right)))/Math.hypot(1,horizontal),(depth*vertical-Math.abs(dot(ball,up)))/Math.hypot(1,vertical))-BALL_RADIUS;
        if(gap<frustumGap) {frustumGap=gap;frustumTime=time;}

      }
    }
    expect(cameraGap,`${outcome} nearest camera/channel at ${cameraTime}`).toBeGreaterThan(TUBE.rim+.2);
    expect(frustumGap,`${outcome} tightest full ball framing at ${frustumTime}`).toBeGreaterThan(.015);
    expect(cameraFloorGap,outcome+' camera clears floor').toBeGreaterThan(.2);
    expect(cameraPinGap,outcome+' camera clears every pin').toBeGreaterThan(.2);
    for(let time=5.04;time<=5.8;time+=.001) {
      const position=cameraAt(time,outcome).slice(0,3) as unknown as Vec3;
      const normalDistance=dot(sub(position,f.center),f.normal);
      const radial=length(sub(sub(position,f.center),mul(f.normal,normalDistance)));
      if(radial<6) expect(normalDistance).toBeGreaterThan(TARGET.face*TARGET.scale+.1);
    }
    for(let closeTime=5.4;closeTime<=5.550001;closeTime+=.01) {
    const close=cameraAt(closeTime,outcome), view=new THREE.PerspectiveCamera(close[6],1241/688,.1,150);
    view.position.fromArray(close.slice(0,3)); view.up.fromArray(cameraUp(close));
    view.lookAt(...close.slice(3,6) as [number,number,number]); view.updateMatrixWorld();
    const frustum=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(view.projectionMatrix,view.matrixWorldInverse));
    expect(frustum.intersectsSphere(new THREE.Sphere(new THREE.Vector3(...sub(sourceBall(outcome),[0,0,TARGET.face+BALL_RADIUS])),3))).toBe(false);
    for(const pin of fields[outcome].pins) {
      const centre=new THREE.Vector3(pin.position[0],PIN_HEIGHT/2,pin.position[2]);
      expect(frustum.intersectsSphere(new THREE.Sphere(centre,Math.hypot(PIN_HEIGHT/2,PIN_RADIUS)))).toBe(false);
    }
    {
      // Both 5.4 s close-ups have no coil edge. Cover the complete
      // volume with spheres, bounding half an interval of the blended axis.
      const intrusions=Array.from({length:513},(_,i)=>i).filter(i=>frustum.intersectsSphere(new THREE.Sphere(new THREE.Vector3(...tubePoint(i/512*tubeLength,outcome)),TUBE.rim+tubeParameterSpeedBound*tubeLength/1024)));
      expect(intrusions,`${outcome} coil in close-up at ${closeTime}`).toEqual([]);
    }
    }
    report[outcome]={samples,stepSeconds:.001,minimumCameraPinDistance:cameraPinGap,closeupWindow:[5.4,5.55],backgroundOutsideCloseup:true,coilOutsideCloseup:true,minimumCameraAxisDistance:cameraGap,minimumCameraTime:cameraTime,minimumFullBallFrustumGap:frustumGap,minimumFrustumTime:frustumTime};
  }
  await writeFile(path.join(process.env.MD_REVIEW_DIR||'.review','camera-check.json'),JSON.stringify(report,null,2));
});
