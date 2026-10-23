import { flightCurveBreaks, flightParameterSpeedBound, TARGET, type Outcome } from './mechanism.ts';
import { bernsteinAt, bernsteinSplit, bernsteinUpperBound } from './motionCurve.ts';
import { exitViews } from './exitViews.ts';
import { exposureKeys } from './exposureKeys.ts';

// Bound temporal speed and spatial stretch on the same subinterval. Their
// separate maxima can be far apart during an advance out of the curved leg.
// Bernstein hulls keep this a continuous certificate, not sampled maxima.
function worldSpeedBound(points: readonly number[], velocity: readonly number[], route: Outcome, depth=7): number {
  if(!depth) return Math.max(...velocity)*flightParameterSpeedBound(Math.min(...points),Math.max(...points),route);
  const p=bernsteinSplit(points),v=bernsteinSplit(velocity);
  return Math.max(worldSpeedBound(p[0],v[0],route,depth-1),worldSpeedBound(p[1],v[1],route,depth-1));
}

// The final filmed poses repeat, then close the remaining distance rapidly.
// The last two depths are fitted jointly from the sphere and target disc,
// keeping their physical sizes fixed. Intermediate depth is inferred.
export function flightMotion(route: Outcome, start: number, visibleExit: number, end: number, initialSpeed: number) {
  // The first violet source frame already puts the sphere in front of the
  // mouth. Fit that distance after fitting the static camera; keep the colour
  // frame separate from the centre's earlier physical crossing.
  const clearDistance = route === 'yes' ? 1.392 : 1.125;
  // The static landmarks constrain depth and camera together, through the
  // last approach. Interpolate through each exposure group's midpoint so a
  // duplicated photograph does not become a pause in the live scene.
  const keys = [[start, 0], [visibleExit, clearDistance],
    ...exposureKeys(exitViews[route].filter(([frame])=>frame/30<end).map(([frame,,,,,distance])=>[frame/30,distance])),
    [end, TARGET.flight]];
  const slopes = keys.slice(1).map(([time, distance], i) => (distance-keys[i][1])/(time-keys[i][0]));
  const speeds = keys.map((_, i) => {
    if (i === 0) return initialSpeed;
    if (i === keys.length-1) return slopes.at(-1)!;
    const a=slopes[i-1], b=slopes[i];
    return Math.max(0,Math.min(a,b));
  });
  const segments=slopes.map((_,i)=>{
    const dt=keys[i+1][0]-keys[i][0],a=keys[i][1],b=keys[i+1][1];
    const points=[a,a+dt*speeds[i]/5,a+2*dt*speeds[i]/5,
      b-2*dt*speeds[i+1]/5,b-dt*speeds[i+1]/5,b];
    const velocity=points.slice(1).map((v,j)=>5*(v-points[j])/dt);
    const acceleration=velocity.slice(1).map((v,j)=>4*(v-velocity[j])/dt);
    return {from:keys[i][0],to:keys[i+1][0],points,velocity,acceleration,dt,speedBound:bernsteinUpperBound(velocity),worldSpeedBound:worldSpeedBound(points,velocity,route)};
  });
  const distanceAt = (time: number) => {
    if (time <= start) return 0;
    if (time >= end) return TARGET.flight;
    const i=keys.findIndex(key => key[0]>=time)-1, a=keys[i], b=keys[i+1];
    return bernsteinAt(segments[i].points,(time-a[0])/(b[0]-a[0]));
  };
  const curveJoins=flightCurveBreaks.map(distance=>{
    let left=start,right=end;
    for(let i=0;i<48;i++){const time=(left+right)/2;if(distanceAt(time)<distance)left=time;else right=time;}
    return (left+right)/2;
  });
  return { distanceAt, segments, joins: [...keys.slice(1,-1).map(key=>key[0]),...curveJoins],
    speedBound: Math.max(...segments.map(segment=>segment.worldSpeedBound)),
    minimumVelocityControl: Math.min(...segments.map(q=>-bernsteinUpperBound(q.velocity.map(v=>-v)))) };
}
