import { test, expect } from '@playwright/test';
import * as THREE from 'three';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ballAt, cameraAt, cameraUp, indicatorAt, indicatorBallsAt, pinContacts, pinColorEvents } from '../src/animation/timeline';
import { add, BALL_RADIUS, cross, dot, fields, mul, PIN_HEIGHT, PIN_RADIUS, sourcePosition, SOURCE_SCALE, sub, TARGET, targetFrame, tubeLength, tubePoint, tubeTangent, unit, type Outcome, type Vec3 } from '../src/animation/mechanism';

import { tubeGeometry } from '../src/animation/tubeGeometry';

function projection(time: number, outcome: Outcome, point = ballAt(time,outcome)) {
  const camera=cameraAt(time,outcome), position=camera.slice(0,3) as unknown as Vec3;
  const forward=unit(sub(camera.slice(3,6) as unknown as Vec3,position));
  const right=unit(cross(forward,cameraUp(camera))), up=cross(right,forward), ball=sub(point,position);
  const depth=dot(ball,forward), tangent=Math.tan(camera[6]*Math.PI/360);
  return { x:(1+dot(ball,right)/(depth*tangent*1241/688))/2, y:(1-dot(ball,up)/(depth*tangent))/2, diameter:BALL_RADIUS/(Math.sqrt(depth*depth-BALL_RADIUS*BALL_RADIUS)*tangent) };
}

test('film framing: the fixed source disc stays aligned while the cap field advances', () => {
  const observations: [Outcome,number,number[]][] = [
    ['yes',0,[450,125,583,257]],['yes',14/30,[448,101,584,235]],
    ['yes',.5,[440,16,582,156]],['no',0,[442,125,575,256]],
    ['no',.5,[443,103,577,237]],['no',17/30,[444,20,586,159]],
  ];
  for(const [branch,time,bounds] of observations) {
    const points=Array.from({length:64},(_,i)=>{
      const a=i/64*2*Math.PI;
      return projection(time,branch,add(sourcePosition(branch),[Math.cos(a)*1.10*SOURCE_SCALE,Math.sin(a)*1.10*SOURCE_SCALE,.075*SOURCE_SCALE]));
    });
    const actual=[Math.min(...points.map(p=>p.x))*992,Math.min(...points.map(p=>p.y))*550,
      Math.max(...points.map(p=>p.x))*992,Math.max(...points.map(p=>p.y))*550];
    actual.forEach((v,i)=>expect(Math.abs(v-bounds[i]),`${branch} source edge ${i} at ${time}`).toBeLessThan(8));
  }
});

test('film framing: late enlargement and target approach agree with observed screen landmarks', async () => {
  // Fixed homography and exact original frame indices. Orange masks were
  // visually checked; clipped/occluded late-fan detections are excluded.
  // These bounds remain composition guards, not a similarity score.
  const observed: Record<Outcome, number[][]> = {
    // A repeated exposure now describes the middle of its interval, not a
    // stop lasting several frames. The measured positions/sizes are unchanged.
    yes: [[154/30,0.647681451613,0.415454545455,0.258181818182],[157.5/30,0.56502016129,0.360909090909,0.367272727273],[159.5/30,0.668850806452,0.379090909091,0.421818181818],[164.5/30,0.587701612903,0.517272727273,0.387272727273],[168/30,0.525705645161,0.49,0.330909090909]],
    no: [[153.5/30,0.524697580645,0.371818181818,0.214545454545],[156/30,0.407762096774,0.41,0.247272727273],[159.5/30,0.473286290323,0.373636363636,0.356363636364],[163/30,0.318044354839,0.458181818182,0.421818181818],[169/30,0.492943548387,0.437272727273,0.274545454545]],
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
    const approachTime=(outcome==='yes'?168:169)/30;
    const ball=projection(approachTime,outcome), target=projection(approachTime,outcome,targetFrame(outcome).center);
    expect((target.x-ball.x)*(outcome==='yes'?1:-1)).toBeGreaterThan(.12);
    expect(target.y).toBeLessThan(ball.y);
    // The disc and ball must agree in the SAME source frame. Matching the
    // sphere alone previously hid a target that entered far too close to it.
    const approachFrame=targetFrame(outcome);
    const approachCentre=add(approachFrame.center,mul(approachFrame.normal,TARGET.face*TARGET.scale));
    const approach=projection(approachTime,outcome,approachCentre);
    const expectedApproach=outcome==='yes'?{x:.805,y:.136,diameter:.676}:{x:.326,y:.180,diameter:.651};
    const approachTop=projection(approachTime,outcome,add(approachCentre,mul(approachFrame.up,1.10*TARGET.scale)));
    const approachBottom=projection(approachTime,outcome,add(approachCentre,mul(approachFrame.up,-1.10*TARGET.scale)));
    expect(Math.abs(approach.x-expectedApproach.x)).toBeLessThan(.04);
    expect(Math.abs(approach.y-expectedApproach.y)).toBeLessThan(.04);
    if(outcome==='yes') {
      expect(Math.abs(approachBottom.y-approachTop.y-expectedApproach.diameter)).toBeLessThan(.04);
    } else {
      // NO168-170 hold a disc clipped above the stage. The former .651 full
      // height was an extrapolation, not a visible film boundary. Compare the
      // measured left/right/bottom silhouette instead, at the same tolerance.
      // A projected vertical diameter is not an off-axis ellipse's bounds.
      const rimCentre=add(approachFrame.center,mul(approachFrame.normal,.075*TARGET.scale));
      const rim=Array.from({length:96},(_,i)=>{
        const angle=i*Math.PI/48;
        return projection(169/30,outcome,add(rimCentre,add(
          mul(approachFrame.right,1.10*TARGET.scale*Math.cos(angle)),
          mul(approachFrame.up,1.10*TARGET.scale*Math.sin(angle)))));
      });
      const bounds=[Math.min(...rim.map(p=>p.x)),Math.max(...rim.map(p=>p.x)),Math.max(...rim.map(p=>p.y))];
      const observedBounds=[138/992,507/992,276/550];
      for(let i=0;i<3;i++) expect(Math.abs(bounds[i]-observedBounds[i])).toBeLessThan(.04);
      report.push({outcome,time:169/30,observedVisibleDiscBounds:observedBounds,actualVisibleDiscBounds:bounds});
    }
    // The supplied coloured-target stills show a plate about 55% of the stage
    // height. An immediate 18-unit pullback made it only about 36%, although
    // the earlier ball landmarks and the final answer still passed.
    const time=6, frame=targetFrame(outcome);
    const centre=add(frame.center,mul(frame.normal,TARGET.face*TARGET.scale));
    const plate=projection(time,outcome,centre);
    const top=projection(time,outcome,add(centre,mul(frame.up,1.10*TARGET.scale)));
    const bottom=projection(time,outcome,add(centre,mul(frame.up,-1.10*TARGET.scale)));
    const observedPlate={x:outcome==='yes'?.525:.513,y:outcome==='yes'?.693:.595,diameter:.573};
    const actualPlate={x:plate.x,y:plate.y,diameter:bottom.y-top.y};
    expect(Math.abs(actualPlate.x-observedPlate.x)).toBeLessThan(.04);
    expect(Math.abs(actualPlate.y-observedPlate.y)).toBeLessThan(.04);
    expect(Math.abs(actualPlate.diameter-observedPlate.diameter)).toBeLessThan(.04);
    report.push({outcome,time,observed:observedPlate,actual:actualPlate});
  }
  await writeFile(path.join(process.env.MD_REVIEW_DIR||'.review','framing-check.json'),JSON.stringify(report,null,2));
});

test('film indicator: independent branch beats, closer positions and darkness at impact', () => {
  for(const [time,yes,no] of [[1.35,null,null],[1.48,'yes','yes'],[1.77,'no','no'],[2.10,'yes','yes'],[3.32,'yes','no'],[5.26,'no','yes'],[5.75,'yes','yes'],[5.8,null,null]] as const) {
    expect(indicatorAt(time,'yes')).toBe(yes);
    expect(indicatorAt(time,'no')).toBe(no);
  }
  for(const outcome of ['yes','no'] as const) {
    const green=indicatorBallsAt(5.75,outcome);
    expect(green).toHaveLength(1);
    // Fixed 1280x736 film calibration: green centre x 253-256, y 673-677.
    expect(Math.abs((41+green[0].x+59.5)*.8-254.5)).toBeLessThan(2);
    expect(Math.abs((752+green[0].y+59.5)*.8-675)).toBeLessThan(2);
    expect(indicatorBallsAt(5.8,outcome)).toHaveLength(0);
  }
  expect(indicatorBallsAt(137/30,'yes')).toHaveLength(2);
  expect(indicatorBallsAt(138/30,'yes')).toHaveLength(1);
  expect(indicatorBallsAt(138/30,'no')).toHaveLength(2);
  expect(indicatorBallsAt(140/30,'no')).toHaveLength(1);
  // Source frames 90 and 105 hold the ball while these pin colours are visible.
  const displayed=(time:number,index:number)=>pinColorEvents.no.filter(([t,p])=>t<=time && p===index).at(-1)?.[2];
  expect(displayed(3,3*6+5)).toBe('no');
  expect(displayed(3.5,4*6+4)).toBe('yes');
});

test('film late fan: rebounds continue beside a large inlet before the entry shot', () => {
  // Approximate observations from 01_tie_09 and 02_competition_09. These
  // screen landmarks exposed the early stop and the coil outside the frame.
  for (const [outcome,time,x,y] of [['yes',3.8,648/992,247/550],['no',3.8,367/992,245/550]] as const) {
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
test('film upper mouths: the orbit reveals the real bore instead of its edge', async () => {
  const report=[];
  for (const [outcome,time] of [['yes',4.70],['no',143/30]] as const) {
    const mouth=tubePoint(tubeLength,outcome), camera=cameraAt(time,outcome);
    const towardCamera=unit(sub(camera.slice(0,3) as unknown as Vec3,mouth));
    // The original coil frames show a broad ellipse. A frontal component
    // above .35 protects its visible width, independent of tube transparency.
    const facing=dot(tubeTangent(tubeLength,outcome),towardCamera);
    expect(facing).toBeGreaterThan(.35);
    const centre=projection(time,outcome,mouth);
    const observed=outcome==='yes' ? {x:425/992,y:122/550} : {x:622/992,y:145/550};
    expect(Math.abs(centre.x-observed.x)).toBeLessThan(.04);
    expect(Math.abs(centre.y-observed.y)).toBeLessThan(.04);
    report.push({outcome,time,facing,centre});
  }
  await writeFile(path.join(process.env.MD_REVIEW_DIR||'.review','outlet-framing-check.json'),JSON.stringify(report,null,2));
});

test('film framing: early ball scale, low field composition and inlet side', async () => {
  const observed: Record<Outcome, number[][]> = {
    yes: [[0.9,0.470262096774,0.344545454545,0.116363636364],[1.06666666667,0.468245967742,0.451818181818,0.127272727273],[1.3,0.481350806452,0.460909090909,0.130909090909],[1.73333333333,0.602318548387,0.528181818182,0.138181818182],[2.23333333333,0.402721774194,0.817272727273,0.152727272727],[2.53333333333,0.448084677419,0.779090909091,0.156363636364]],
    no: [[0.9,0.561995967742,0.28,0.110909090909],[1.06666666667,0.560987903226,0.442727272727,0.116363636364],[1.3,0.561995967742,0.460909090909,0.123636363636],[1.73333333333,0.484375,0.493636363636,0.134545454545],[2.23333333333,0.604334677419,0.764545454545,0.145454545455],[2.53333333333,0.595262096774,0.773636363636,0.152727272727]],
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

test('film layout: turns enter behind the fan and only edge pins remain at the inlet', async () => {
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
    // Exact entry frames retain a few pins at the outside edge. The old
    // assertion of an entirely empty fan contradicted the rectified film.
    const entry=outcome==='yes'?127/30:129/30;
    const visible=[];
    for(const pin of fields[outcome].pins) {
      const [x,,z]=pin.position, corners=[];
      for(const dx of [-PIN_RADIUS,PIN_RADIUS]) for(const dz of [-PIN_RADIUS,PIN_RADIUS]) for(const y of [0,PIN_HEIGHT])
        corners.push(projection(entry,outcome,[x+dx,y,z+dz]));
      const x0=Math.min(...corners.map(p=>p.x)),x1=Math.max(...corners.map(p=>p.x));
      const y0=Math.min(...corners.map(p=>p.y)),y1=Math.max(...corners.map(p=>p.y));
      if(x1<=0||x0>=1||y1<=0||y0>=1)continue;
      if(outcome==='yes') expect(x1).toBeLessThan(.18);
      else expect(x0).toBeGreaterThan(.88);
      visible.push({x0,x1,y0,y1});
    }
    const ball=projection(entry,outcome), mouth=projection(entry,outcome,tubePoint(0,outcome));
    expect((mouth.x-ball.x)*(outcome==='yes'?1:-1)).toBeGreaterThan(.005);
    // By .95 s the film shows at most a tip of the source at the top edge.
    // Include the full eight-ray silhouette with a small bevel allowance.
    const sourceBottom=Math.max(...Array.from({length:8},(_,i)=> {
      const angle=i*Math.PI/4-.035;
      return projection(.95,outcome,add(sourcePosition(outcome),[-Math.sin(angle)*3.05,Math.cos(angle)*3.05,.2])).y;
    }));
    expect(sourceBottom).toBeLessThan(.06);
    report.push({outcome,coilAt2_9:{left,right},inletAt:entry,mouth,visibleEdgePins:visible,sourceBottomAt0_95:sourceBottom});
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
    // Clip actual wall triangles, including the large outlet collar. A
    // sphere of the maximum rim radius around every body sample overestimated
    // the coil volume and rejected a genuinely empty opening frame.
    const mesh=tubeGeometry(outcome), vertices=mesh.getAttribute('position'), indices=mesh.index!;
    // Include the source-disc advance and the interpolation between poses:
    // matching only the static opening once allowed a collar into the next shot.
    for(let frame=0;frame<=60;frame++) {
      const time=frame/100, shot=cameraAt(time,outcome);
      const camera=new THREE.PerspectiveCamera(shot[6],1241/688,.1,2000);
      camera.position.fromArray(shot.slice(0,3));camera.up.fromArray(cameraUp(shot));
      camera.lookAt(...shot.slice(3,6) as [number,number,number]);camera.updateMatrixWorld();
      const frustum=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
      const intersectingTriangles=[];
      for(let i=0;i<indices.count;i+=3) {
        const triangle=[0,1,2].map(j=>new THREE.Vector3().fromBufferAttribute(vertices,indices.getX(i+j)));
        if(!frustum.planes.some(plane=>triangle.every(vertex=>plane.distanceToPoint(vertex)<0))) intersectingTriangles.push(i/3);
      }
      expect(intersectingTriangles,`${outcome} opening contains no wall triangles at ${time}`).toEqual([]);
    }
    mesh.dispose();
    const releaseTips=fields[outcome].pins.map(pin=>projection(.95,outcome,add(pin.position,[0,PIN_HEIGHT,0]))).filter(p=>p.x>0&&p.x<1&&p.y>0&&p.y<1);
    expect(releaseTips.length).toBeGreaterThanOrEqual(7);
    expect(Math.min(...releaseTips.map(p=>p.y))).toBeLessThan(.56);
    const distant=[4.7,5.2,5.25].map(time=>({time,...projection(time,outcome,sourcePosition(outcome))}));
    for(const point of distant) {
      if(outcome==='yes') {
        // The exact rectified source frame 141 centres the distant disc at
        // x=198/992. The preceding .25 estimate used an earlier camera fit.
        if(point.time===4.7) expect(Math.abs(point.x-198/992)).toBeLessThan(.04);
        else expect(point.x,`source side at ${point.time}`).toBeLessThan(.25);
      }
      else expect(point.x,`source side at ${point.time}`).toBeGreaterThan(.75);
    }
    // The eventual target is already visible beside the coil in the inlet
    // shot. Moving the exit must not fix the distant source by losing it.
    const inletTarget=projection(3.8,outcome,targetFrame(outcome).center);
    expect(inletTarget.y).toBeGreaterThan(-.18);
    expect(inletTarget.y).toBeLessThan(.20);
    if(outcome==='yes') expect(inletTarget.x).toBeGreaterThan(.75);
    else expect(inletTarget.x).toBeLessThan(.32);
    expect(inletTarget.x).toBeGreaterThan(-.1);
    expect(inletTarget.x).toBeLessThan(1.1);
    report.push({outcome,source,openingTips:tips,releaseTips,distantSource:distant,inletTarget,openingCoilOutsideView:true});
  }
  await writeFile(path.join(process.env.MD_REVIEW_DIR||'.review','visual-regression-check.json'),JSON.stringify(report,null,2));
});
