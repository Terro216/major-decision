import * as THREE from 'three';
import { BALL_RADIUS } from './mechanism.ts';
import type { FreestyleRun } from './freestyle.ts';

// The rails and their collision checks share these exact triangles. Leave a
// real clearance around the complete ball, including the inside of bends,
// and end before the rolled mouth rather than threading metal into its bore.
export function guideGeometries(run: Pick<FreestyleRun, 'guidePoint' | 'guideLength'>) {
  const end = run.guideLength - 1.1, clearance = BALL_RADIUS + .10 + .14;
  return [-1, 1].map(side => {
    const points = Array.from({ length: 129 }, (_, i) => {
      const d = end * i / 128, p = new THREE.Vector3(...run.guidePoint(d));
      const a = new THREE.Vector3(...run.guidePoint(Math.max(0, d - .01)));
      const b = new THREE.Vector3(...run.guidePoint(Math.min(run.guideLength, d + .01)));
      const normal = b.sub(a).cross(new THREE.Vector3(0, 1, 0)).normalize();
      return p.addScaledVector(normal, side * clearance);
    });
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 192, .10, 12, false);
  });
}
