import { test, expect } from '@playwright/test';
import * as THREE from 'three';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ballAt, cameraAt, cameraUp, indicatorAt, indicatorBallsAt, pinContacts } from '../src/animation/timeline';
import { add, BALL_RADIUS, cross, dot, fields, mul, PIN_HEIGHT, PIN_RADIUS, sourcePosition, sub, TARGET, targetFrame, TUBE, tubeLength, tubeParameterSpeedBound, tubePoint, unit, type Outcome, type Vec3 } from '../src/animation/mechanism';

function projection(time: number, outcome: Outcome, point = ballAt(time,outcome)) {
  const camera=cameraAt(time,outcome), position=camera.slice(0,3) as unknown as Vec3;
  const forward=unit(sub(camera.slice(3,6) as unknown as Vec3,position));
  const right=unit(cross(forward,cameraUp(camera))), up=cross(right,forward), ball=sub(point,position);
  const depth=dot(ball,forward), tangent=Math.tan(camera[6]*Math.PI/360);
  return { x:(1+dot(ball,right)/(depth*tangent*1241/688))/2, y:(1-dot(ball,up)/(depth*tangent))/2, diameter:BALL_RADIUS/(Math.sqrt(depth*depth-BALL_RADIUS*BALL_RADIUS)*tangent) };
}

test('film framing: late enlargement and target approach agree with observed screen landmarks', async () => {
  // Independent source observations from the original MP4s, not a snapshot of
  // camera keys. Cropped screen perspective and orange segmentation are only
  // approximate: .04 tolerances are framing guards, not a similarity score.
  const observed: Record<Outcome, number[][]> = {
    yes:[[4.94,.415,.324,.157],[5.20,.638,.416,.253],[5.45,.705,.477,.410],[5.70,.517,.490,.320],[5.80,.515,.440,.157]],
    no:[[4.94,.607,.308,.137],[5.20,.515,.372,.224],[5.40,.462,.372,.334],[5.70,.481,.438,.273],[5.80,.490,.436,.166]],
  };
  const report=[];
  for(const outcome of ['yes','no'] as const) {
    for(const [time,x,y,diameter] of observed[outcome]) {
      const actual=projection(time,outcome);
      expect(Math.abs(actual.x-x)).toBeLessThan(.04);
      expect(Math.abs(actual.y-y)).toBeLessThan(.04);
      expect(Math.abs(actual.diameter-diameter)).toBeLessThan(.04);
      report.push({outcome,time,observed:{x,y,diameter},actual});
    }
    const ball=projection(5.7,outcome), target=projection(5.7,outcome,targetFrame(outcome).center);
    expect((target.x-ball.x)*(outcome==='yes'?1:-1)).toBeGreaterThan(.12);
    expect(target.y).toBeLessThan(ball.y);
    // The supplied coloured-target stills show a plate about 55% of the stage
    // height. An immediate 18-unit pullback made it only about 36%, although
    // the earlier ball landmarks and the final answer still passed.
    const time=outcome==='yes'?5.95:6.15, frame=targetFrame(outcome);
    const centre=add(frame.center,mul(frame.normal,TARGET.face*TARGET.scale));
    const plate=projection(time,outcome,centre);
    const top=projection(time,outcome,add(centre,mul(frame.up,1.10*TARGET.scale)));
    const bottom=projection(time,outcome,add(centre,mul(frame.up,-1.10*TARGET.scale)));
    const observedPlate={x:.50,y:outcome==='yes'?.56:.66,diameter:.55};
    const actualPlate={x:plate.x,y:plate.y,diameter:bottom.y-top.y};
    expect(Math.abs(actualPlate.x-observedPlate.x)).toBeLessThan(.04);
    expect(Math.abs(actualPlate.y-observedPlate.y)).toBeLessThan(.04);
    expect(Math.abs(actualPlate.diameter-observedPlate.diameter)).toBeLessThan(.04);
    report.push({outcome,time,observed:observedPlate,actual:actualPlate});
  }
  await writeFile(path.join(process.env.MD_REVIEW_DIR||'.review','framing-check.json'),JSON.stringify(report,null,2));
});

test('film indicator: independent branch beats, closer positions and darkness at impact', () => {
  for(const [time,yes,no] of [[1.35,null,null],[1.48,'yes',null],[1.77,'no','yes'],[2.10,'yes','no'],[3.32,'yes','no'],[5.26,'no','yes'],[5.75,'yes','yes'],[5.95,null,null]] as const) {
    expect(indicatorAt(time,'yes')).toBe(yes);
    expect(indicatorAt(time,'no')).toBe(no);
  }
  for(const outcome of ['yes','no'] as const) {
    const green=indicatorBallsAt(5.75,outcome);
    expect(green).toHaveLength(1);
    // Measured centre in the film oval: about 64% horizontally, 66% down.
    expect((green[0].x+59.5)/384).toBeCloseTo(.64,2);
    expect((green[0].y+59.5)/165).toBeCloseTo(.66,2);
    expect(indicatorBallsAt(5.95,outcome)).toHaveLength(0);
    expect(indicatorBallsAt(4.64,outcome)).toHaveLength(2);
  }
});

test('film late fan: rebounds continue beside a large inlet before the entry shot', () => {
  // Approximate observations from 01_tie_09 and 02_competition_09. These
  // screen landmarks exposed the early stop and the coil outside the frame.
  for (const [outcome,time,x,y] of [['yes',3.65,.745,.40],['no',3.70,.24,.38]] as const) {
    const mouth=projection(time,outcome,tubePoint(0,outcome));
    expect(Math.abs(mouth.x-x)).toBeLessThan(.04);
    expect(Math.abs(mouth.y-y)).toBeLessThan(.04);
    const last=pinContacts[outcome].at(-1)![0];
    expect(last).toBeGreaterThan(3.5);
    expect(last).toBeLessThan(3.85);
  }
});

// These coordinates are independent observations from the supplied MP4/PNGs.
// Protect composition, not a claimed pixel match or exact recovered 3D scene.
test('film framing: early ball scale, low field composition and inlet side', async () => {
  const observed: Record<Outcome, number[][]> = {
    yes: [[.95,.462,.346,.119],[1.2,.456,.455,.128],[1.65,.552,.594,.140],
      [2.4,.428,.866,.148],[2.6,.438,.778,.151],[2.9,.388,.823,.172],[4.15,.45,.485,.13]],
    no: [[.95,.552,.282,.119],[1.2,.557,.452,.128],[1.7,.528,.615,.140],
      [2.4,.622,.810,.145],[2.6,.585,.769,.157],[2.9,.551,.797,.166],[4.15,.65,.51,.132]],
  };
  const report=[];
  for(const outcome of ['yes','no'] as const) {
    for(const [time,x,y,diameter] of observed[outcome]) {
      const actual=projection(time,outcome);
      expect(Math.abs(actual.x-x)).toBeLessThan(.06);
      expect(Math.abs(actual.y-y)).toBeLessThan(.06);
      expect(Math.abs(actual.diameter-diameter)).toBeLessThan(.035);
      report.push({outcome,time,observed:{x,y,diameter},actual});
    }
    const ball=projection(4.15,outcome), inlet=projection(4.15,outcome,tubePoint(0,outcome));
    expect((inlet.x-ball.x)*(outcome==='yes'?1:-1)).toBeGreaterThan(.005);
  }
  await writeFile(path.join(process.env.MD_REVIEW_DIR||'.review','early-framing-check.json'),JSON.stringify(report,null,2));
});

test('film layout: turns enter behind the fan and the whole field clears the inlet shot', async () => {
  const report=[];
  for(const outcome of ['yes','no'] as const) {
    // In the supplied 2.9 s frames a broad part of the coil is already visible
    // behind the pins, on the right for YES and left for NO. Loose screen
    // bounds protect that composition, not a pixel match to the filmed monitor.
    const coil=Array.from({length:257},(_,i)=>projection(2.9,outcome,tubePoint(i/256*tubeLength,outcome)).x);
    const left=Math.min(...coil), right=Math.max(...coil);
    expect(right-left).toBeGreaterThan(.30);
    if(outcome==='yes') { expect(left).toBeLessThan(.60); expect(right).toBeGreaterThan(.78); }
    else { expect(left).toBeLessThan(.22); expect(right).toBeGreaterThan(.40); }
    // At the mouth the fan must leave through the side of the real camera.
    // Check full cylinder bounds, not just centres or a renderer visibility flag.
    const shot=cameraAt(4.15,outcome), camera=new THREE.PerspectiveCamera(shot[6],1241/688,.1,150);
    camera.position.fromArray(shot.slice(0,3)); camera.up.fromArray(cameraUp(shot));
    camera.lookAt(...shot.slice(3,6) as [number,number,number]); camera.updateMatrixWorld();
    const frustum=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
    for(const pin of fields[outcome].pins) {
      const [x,,z]=pin.position;
      expect(frustum.intersectsBox(new THREE.Box3(new THREE.Vector3(x-PIN_RADIUS,0,z-PIN_RADIUS),new THREE.Vector3(x+PIN_RADIUS,PIN_HEIGHT,z+PIN_RADIUS))),`${outcome} field beside inlet`).toBe(false);
    }
    const ball=projection(4.15,outcome), mouth=projection(4.15,outcome,tubePoint(0,outcome));
    expect((mouth.x-ball.x)*(outcome==='yes'?1:-1)).toBeGreaterThan(.06);
    // By .95 s the film shows at most a tip of the source at the top edge.
    // Include the full eight-ray silhouette with a small bevel allowance.
    const sourceBottom=Math.max(...Array.from({length:8},(_,i)=> {
      const angle=i*Math.PI/4-.035;
      return projection(.95,outcome,add(sourcePosition(outcome),[-Math.sin(angle)*3.05,Math.cos(angle)*3.05,.2])).y;
    }));
    expect(sourceBottom).toBeLessThan(.06);
    report.push({outcome,coilAt2_9:{left,right},inletAt4_15:mouth,fullFieldOutsideInletShot:true,sourceBottomAt0_95:sourceBottom});
  }
  await writeFile(path.join(process.env.MD_REVIEW_DIR||'.review','layout-framing-check.json'),JSON.stringify(report,null,2));
});

test('film regressions: opening tips, release field and lateral distant source stay visible in a coherent world', async () => {
  const report=[];
  for(const outcome of ['yes','no'] as const) {
    const source=projection(.4,outcome,sourcePosition(outcome));
    expect(Math.abs(source.x-.5)).toBeLessThan(.035);
    expect(Math.abs(source.y-.35)).toBeLessThan(.04);
    const tips=fields[outcome].pins.map(pin=>projection(.4,outcome,add(pin.position,[0,PIN_HEIGHT,0]))).filter(p=>p.x>.08&&p.x<.98&&p.y>0&&p.y<1);
    expect(tips.length).toBeGreaterThanOrEqual(7);
    expect(Math.min(...tips.map(p=>p.y))).toBeGreaterThan(.72);
    expect(Math.min(...tips.map(p=>p.y))).toBeLessThan(.87);
    // Being outside the wall is insufficient: the opening must not look
    // through it. Protect the entire coil volume against the opening cone.
    const shot=cameraAt(.4,outcome), camera=new THREE.PerspectiveCamera(shot[6],1241/688,.1,2000);
    camera.position.fromArray(shot.slice(0,3));camera.up.fromArray(cameraUp(shot));
    camera.lookAt(...shot.slice(3,6) as [number,number,number]);camera.updateMatrixWorld();
    const frustum=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
    for(let i=0;i<=512;i++) expect(frustum.intersectsSphere(new THREE.Sphere(new THREE.Vector3(...tubePoint(i/512*tubeLength,outcome)),TUBE.rim+tubeParameterSpeedBound*tubeLength/1024))).toBe(false);
    const releaseTips=fields[outcome].pins.map(pin=>projection(.95,outcome,add(pin.position,[0,PIN_HEIGHT,0]))).filter(p=>p.x>0&&p.x<1&&p.y>0&&p.y<1);
    expect(releaseTips.length).toBeGreaterThanOrEqual(7);
    expect(Math.min(...releaseTips.map(p=>p.y))).toBeLessThan(.56);
    const distant=[4.7,5.2,5.25].map(time=>({time,...projection(time,outcome,sourcePosition(outcome))}));
    for(const point of distant) {
      if(outcome==='yes') expect(point.x,`source side at ${point.time}`).toBeLessThan(.25);
      else expect(point.x,`source side at ${point.time}`).toBeGreaterThan(.75);
    }
    // The eventual target is already visible beside the coil in the inlet
    // shot. Moving the exit must not fix the distant source by losing it.
    const inletTarget=projection(4.15,outcome,targetFrame(outcome).center);
    expect(inletTarget.y).toBeGreaterThan(-.12);
    expect(inletTarget.y).toBeLessThan(.20);
    if(outcome==='yes') expect(inletTarget.x).toBeGreaterThan(.75);
    else expect(inletTarget.x).toBeLessThan(.32);
    expect(inletTarget.x).toBeGreaterThan(-.1);
    expect(inletTarget.x).toBeLessThan(1.1);
    report.push({outcome,source,openingTips:tips,releaseTips,distantSource:distant,inletTarget,openingCoilOutsideView:true});
  }
  await writeFile(path.join(process.env.MD_REVIEW_DIR||'.review','visual-regression-check.json'),JSON.stringify(report,null,2));
});
