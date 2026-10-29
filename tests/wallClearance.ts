import * as THREE from 'three';
import { BALL_RADIUS, type Vec3 } from '../src/animation/mechanism.ts';
// Spatial index of the actual render triangles, not a second idealized tube.
export function wallIndex(geometry: THREE.BufferGeometry) {
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
