import { test, expect } from '@playwright/test';
import * as THREE from 'three';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ballAt, cameraAt, cameraUp, DURATION, entryLead, entrySpeed, exitSpeed, fallEnd, fieldSpeed, fieldVelocityBound, pinContacts, sourceBall, timing, tubeDistanceAt, tubeMotion } from '../src/animation/timeline';
import { add, BALL_RADIUS, fields, helixLength, PIN_HEIGHT, PIN_RADIUS, RUN_HEIGHT, segmentDistance, sub, length, unit, dot, cross, mul, targetFrame, TARGET, TUBE, tubeBlend, tubeLength, tubeParameterSpeedBound, tubePoint, tubeTangent, type Vec3 } from '../src/animation/mechanism';
import { tubeGeometry, wallSorter } from '../src/animation/tubeGeometry';

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

test('geometry: entire swept sphere clears pins, bore, lips and target in both branches', async () => {
  test.setTimeout(120_000);
  const report: Record<string, unknown> = {};
  for (const outcome of ['yes','no'] as const) {
    const field = fields[outcome], t = timing[outcome];
    // Exact segment/cylinder check covers the intervals between samples and the
    // tangent contact itself (which has zero clearance by design).
    let segmentGap = Infinity;
    for (let i=1; i<field.points.length; i++) for (const pin of field.pins) {
      const p: Vec3 = [pin.position[0], field.points[i][1], pin.position[2]];
      segmentGap = Math.min(segmentGap, segmentDistance(p, field.points[i-1], field.points[i]) - BALL_RADIUS - PIN_RADIUS);
    }
    expect(segmentGap, outcome + ' swept pin corridor').toBeGreaterThan(-1e-10);
    for (const [hit, index] of pinContacts[outcome]) {
      const p = ballAt(hit, outcome), pin = field.pins[index];
      expect(Math.hypot(p[0]-pin.position[0],p[2]-pin.position[2]) - BALL_RADIUS - PIN_RADIUS).toBeCloseTo(0, 8);
      const h = .00001, incoming = unit(sub(p, ballAt(hit-h,outcome))), outgoing = unit(sub(ballAt(hit+h,outcome),p));
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
    // The derivative of a cubic Bezier lies in the convex hull of its three
    // derivative controls. In the tube the scalar speed never exceeds cruise;
    // account for the short C2 blends' conservative parameter-speed bound too.
    const travelBound=(a: Vec3,b: Vec3,va: Vec3,vb: Vec3,dt:number)=>Math.max(length(va),length(vb),length(sub(mul(sub(b,a),3/dt),add(va,vb))));
    const v=fieldSpeed(outcome), inletVelocity=mul(tubeTangent(0,outcome),entrySpeed);
    const flat=(p:Vec3):Vec3=>[p[0],0,p[2]];
    const releaseBound=Math.hypot(travelBound(flat(sourceBall(outcome)),flat(field.points[0]),[0,0,0],mul(unit(sub(field.points[1],field.points[0])),v),t.fieldStart-t.release),1.5*(sourceBall(outcome)[1]-RUN_HEIGHT)/(fallEnd(outcome)-t.release));
    const nonTubeBound=Math.max(v,fieldVelocityBound(outcome),exitSpeed(outcome),entrySpeed,
      releaseBound,
      travelBound(field.points.at(-1)!,add(tubePoint(0,outcome),mul(tubeTangent(0,outcome),-entryLead)),mul(unit(sub(field.points.at(-1)!,field.points.at(-2)!)),v),inletVelocity,t.approach-t.fieldEnd));
    const tubeBound=Math.max(entrySpeed,exitSpeed(outcome),tubeMotion(outcome).cruise)*tubeParameterSpeedBound;
    expect(nonTubeBound).toBeLessThan(100); expect(tubeBound).toBeLessThan(160);
    let wallGap=Infinity, pinGap=Infinity, outsideFieldGap=Infinity, floorGap=Infinity, maxStep=0, minimumAt=0;
    const dt=.001;
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
      // The flight is parallel to the target normal, below the disc centre.
      // It reaches the plate before any ray and stops tangent to its plane.
      const faceGap=dot(sub(p,frame.center),frame.normal)-TARGET.face*TARGET.scale-BALL_RADIUS;
      if(time>=t.exit) expect(faceGap).toBeGreaterThan(-1e-10);
    }
    // Distance is 1-Lipschitz. A deliberately conservative 160 units/s bound
    // gives <=.08 travel to the closest sample. This certifies the unsampled
    // intervals too, including the fast helix, against the actual wall mesh.
    expect(maxStep/dt).toBeLessThan(160);
    expect(wallGap).toBeGreaterThan(160*dt/2);
    expect(pinGap).toBeGreaterThan(-1e-9);
    expect(outsideFieldGap).toBeGreaterThan(160*dt/2);
    expect(floorGap).toBeGreaterThan(nonTubeBound*dt/2);
    // Inside the tube, height grows monotonically from the inlet.
    expect(tubePoint(0,outcome)[1]-BALL_RADIUS).toBeGreaterThan(160*dt/2);
    for (const distance of [0,tubeLength]) {
      const time=distance===0?t.entry:t.exit, p=ballAt(time,outcome);
      expect(length(sub(p,tubePoint(distance,outcome)))).toBeLessThan(1e-8);
      const velocity=unit(sub(ballAt(time+.00001,outcome),ballAt(time-.00001,outcome)));
      expect(dot(velocity,tubeTangent(distance,outcome))).toBeGreaterThan(.99999);
    }
    mesh.dispose();
    report[outcome]={samples:Math.floor((DURATION-t.release)/dt)+1,stepSeconds:dt,pins:field.pins.length,exactSegmentGap:segmentGap,minimumPinGap:pinGap,minimumPinGapOutsideField:outsideFieldGap,minimumWallGap:wallGap,minimumWallTime:minimumAt,minimumFloorGap:floorGap,maxSampleSpeed:maxStep/dt,analyticTubeSpeedBound:tubeBound,analyticOtherSpeedBound:nonTubeBound,wallIntervalBound:.08,ballRadius:BALL_RADIUS,boreRadius:TUBE.inner};
  }
  await writeFile(path.join(process.env.MD_REVIEW_DIR||'.review','geometry-check.json'),JSON.stringify(report,null,2));
});

test('motion continuity: acceleration joins the open mouths and rounded helix without a step', async () => {
  const report=[];
  const second=(sample:(t:number)=>Vec3,t:number,h:number) => mul(add(sub(sample(t+h),mul(sample(t),2)),sample(t-h)),1/(h*h));
  for(const outcome of ['yes','no'] as const) {
    const t=timing[outcome], profile=tubeMotion(outcome), h=.000005;
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
    const temporal=[];
    for(const join of [t.entry,t.entry+profile.ramp,t.exit-profile.ramp,t.exit]) {
      const sample=(time:number)=>ballAt(time,outcome);
      const jump=length(sub(second(sample,join-2*h,h),second(sample,join+2*h,h)));
      // Before: 745..1012 units/s² at the two mouths. This also checks the
      // internal ramp boundaries, where a velocity-only test missed the kink.
      expect(jump,`${outcome} acceleration at ${join}`).toBeLessThan(5);
      temporal.push({time:join,accelerationDifference:jump});
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
    report.push({outcome,profile,temporal,spatial});
  }
  await writeFile(path.join(process.env.MD_REVIEW_DIR||'.review','continuity-check.json'),JSON.stringify(report,null,2));
});

test('geometry: joins preserve position and velocity; impact stops at the target surface', async () => {
  const report: Record<string,unknown>={};
  for(const outcome of ['yes','no'] as const) {
    const t=timing[outcome], h=.000001;
    for(const join of [t.release,fallEnd(outcome),t.fieldStart,t.fieldEnd,t.approach,t.entry,t.exit]) {
      const p=ballAt(join,outcome), before=ballAt(join-h,outcome), after=ballAt(join+h,outcome);
      expect(length(sub(after,before)),`${outcome} position at ${join}`).toBeLessThan(.001);
      const left=mul(sub(p,before),1/h), right=mul(sub(after,p),1/h);
      expect(length(sub(right,left)),`${outcome} velocity at ${join}`).toBeLessThan(.01);
    }
    expect(length(sub(ballAt(TARGET.hit,outcome),targetFrame(outcome).impact))).toBeLessThan(1e-9);
    expect(ballAt(6.9,outcome)).toEqual(ballAt(TARGET.hit,outcome));
    const impactOffset=sub(ballAt(TARGET.hit,outcome),targetFrame(outcome).center);
    expect(dot(impactOffset,targetFrame(outcome).up)).toBeCloseTo(-TARGET.impactDrop,9);
    // The lower strike clears the real raised rim and stays on the disc.
    expect(TARGET.impactDrop+BALL_RADIUS).toBeLessThan(1.08*TARGET.scale);
    for(const [radius,depth,width] of [[.62,.21,.035]]) {
      const ringGap=Math.hypot(radius*TARGET.scale-TARGET.impactDrop,BALL_RADIUS+(TARGET.face-depth)*TARGET.scale)-width*TARGET.scale-BALL_RADIUS;
      expect(ringGap).toBeGreaterThan(.1);
    }
    for(const join of [.45,.49,.70,.95,1.40,1.65,1.70,1.90,1.95,2.40,2.60,2.72,2.90,3.20,3.65,3.70,4.15,4.30,4.40,4.50,4.57,4.70,4.91,4.94,5.05,5.18,5.20,5.34,5.35,5.40,5.45,5.48,5.55,5.60,5.70,5.8,5.97,6.03,6.16,6.76]) {
      const a=cameraAt(join-h,outcome), b=cameraAt(join,outcome), c=cameraAt(join+h,outcome);
      for(let i=0;i<8;i++) {
        expect(Math.abs(c[i]-a[i])).toBeLessThan(.001);
        expect(Math.abs((c[i]-b[i])/h-(b[i]-a[i])/h)).toBeLessThan(.02);
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

      if(time>=t.release&&time<=TARGET.hit) {
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
