import { type Outcome, type Vec3 } from './mechanism.ts';

type Span = { start: number; end: number; controls: readonly number[] };
function scalarTrack(times: readonly number[], values: readonly number[], velocities: readonly number[]) {
  const spans: Span[] = times.slice(1).map((end,i)=>({start:times[i],end,
    controls:[values[i],values[i]+velocities[i]*(end-times[i])/3,
      values[i+1]-velocities[i+1]*(end-times[i])/3,values[i+1]],
  }));
  const bound=Math.max(...spans.flatMap(s=>s.controls.slice(1).map((v,i)=>3*Math.abs(v-s.controls[i])/(s.end-s.start))));
  return {bound,spans,derivative(time:number){
    const s=spans.find(s=>time<=s.end)??spans.at(-1)!,u=Math.max(0,Math.min(1,(time-s.start)/(s.end-s.start))),v=1-u,c=s.controls;
    return 3*((c[1]-c[0])*v*v+2*(c[2]-c[1])*v*u+(c[3]-c[2])*u*u)/(s.end-s.start);
  },minimum:Math.min(...spans.flatMap(s=>s.controls)),at(time:number){
    const s=spans.find(s=>time<=s.end)??spans.at(-1)!,u=Math.max(0,Math.min(1,(time-s.start)/(s.end-s.start))),v=1-u,c=s.controls;
    return c[0]*v*v*v+3*c[1]*v*v*u+3*c[2]*v*u*u+c[3]*u*u*u;
  }};
}

// Independent cap-row camera fits show the sphere reaching the first-row
// approach quickly, then descending in front of it. These fixed C1 curves
// reconstruct that ejection; they do not change the sphere or follow a camera.
export function releasePath(source: Vec3, arrival: Vec3, start: number, end: number, arrivalSpeed: number, route: Outcome) {
  const duration=end-start, times=route==='yes'?[0,.10,.20,.45,duration]:[0,1/30,2/15,.20,.45,duration];
  // The delayed NO release catches up during its first visible frame. These
  // height observations come from the pin-calibrated views, not camera tracking.
  const heights=route==='yes'?[source[1],4.42,2.07,1.4,arrival[1]]:[source[1],4.15,3.3227,2.4,1.4,arrival[1]];
  const slopes=times.slice(1).map((t,i)=>(heights[i+1]-heights[i])/(t-times[i]));
  const harmonic=(a:number,b:number)=>a*b<=0?0:2*a*b/(a+b);
  const height=scalarTrack(times,heights,times.map((_,i)=>i===0||i===times.length-1?0:harmonic(slopes[i-1],slopes[i])));
  const approach=arrival[2]-.20;
  const depth=scalarTrack([0,.13,.45,duration],[source[2],approach,approach,arrival[2]],[0,0,0,arrivalSpeed]);
  const breaks=[...new Set([...times,.13])].sort((a,b)=>a-b);
  // On each shared interval the velocity is a quadratic Bezier. Its vector
  // control hull bounds the combined speed, tighter than unrelated axis maxima.
  const speedBound=Math.max(...breaks.slice(1).flatMap((right,i)=>{
    const left=breaks[i],sample=(t:number)=>[height.derivative(t),depth.derivative(t)];
    const a=sample(left),b=sample(right),m=sample((left+right)/2);
    return [a,m.map((v,j)=>2*v-(a[j]+b[j])/2),b].map(v=>Math.hypot(...v));
  }));
  return {
    joins:breaks.map(t=>start+t),
    minimumHeight:height.minimum,
    speedBound,
    at(time:number):Vec3 {return [source[0],height.at(time-start),depth.at(time-start)];},
  };
}
