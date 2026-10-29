import { flightCurveBreaks, flightParameterSpeedBound, TARGET, type Outcome } from './mechanism.ts';
import { bernsteinAt, bernsteinSplit, bernsteinUpperBound } from './motionCurve.ts';

// Bound temporal speed and spatial stretch on the same subinterval. Their
// separate maxima can be far apart during an advance out of the curved leg.
// Bernstein hulls keep this a continuous certificate, not sampled maxima.
function worldSpeedBound(points: readonly number[], velocity: readonly number[], route: Outcome, depth=7): number {
  if(!depth) return Math.max(...velocity)*flightParameterSpeedBound(Math.min(...points),Math.max(...points),route);
  const p=bernsteinSplit(points),v=bernsteinSplit(velocity);
  return Math.max(worldSpeedBound(p[0],v[0],route,depth-1),worldSpeedBound(p[1],v[1],route,depth-1));
}

// Keep the film's fast departure, brief suspended close-up and final drive
// into the target. A few continuous beats replace per-exposure depth pulses.
export function flightMotion(route: Outcome, start: number, _visibleExit: number, end: number, initialSpeed: number) {
  const keys = [[start, 0], [start + .08, 3.6], [start + .30, 5.7],
    [start + .53, 9.4], [end, TARGET.flight]];
  const speeds = [initialSpeed, 10, 12, 25, 38];
  const slopes = keys.slice(1).map(([time, distance], i) => (distance-keys[i][1])/(time-keys[i][0]));
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
