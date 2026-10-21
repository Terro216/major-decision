import * as THREE from 'three';
import { TUBE, tubeLength, tubePoint, tubeTangent, type Outcome } from './mechanism.ts';

export class Channel extends THREE.Curve<THREE.Vector3> {
  outcome: Outcome;
  distances?: number[];
  constructor(outcome: Outcome, distances?: number[]) { super(); this.outcome = outcome; this.distances = distances; }
  distanceAt(u: number) {
    if (!this.distances) return u * tubeLength;
    const index = Math.min(this.distances.length - 2, Math.floor(u * (this.distances.length - 1)));
    const fraction = u * (this.distances.length - 1) - index;
    return this.distances[index] + fraction * (this.distances[index + 1] - this.distances[index]);
  }
  getPoint(u: number, target = new THREE.Vector3()) { return target.fromArray(tubePoint(this.distanceAt(u), this.outcome)); }
  getTangent(u: number, target = new THREE.Vector3()) { return target.fromArray(tubeTangent(this.distanceAt(u), this.outcome)); }
  // Frenet frames must use the same parameter as the vertex centres. The base
  // Curve implementation remaps getTangentAt through a separate length table.
  override getTangentAt(u: number, target = new THREE.Vector3()) { return this.getTangent(u, target); }
}

// One hollow wall: outer surface, inward-facing bore, open annular ends.
// Tests measure the ball against these exact triangles, including both mouths.
export function tubeGeometry(outcome: Outcome) {
  // Resolve the two rolled collars without multiplying the entire helix mesh.
  // Both collars are part of the collision-tested wall; the bore stays .70.
  const distances = new Set(Array.from({ length: 257 }, (_, i) => i / 256 * tubeLength));
  for (let i = 0; i <= 24; i++) {
    distances.add(i * .025);
    distances.add(tubeLength - i * .025);
  }
  const samples = [...distances].sort((a, b) => a - b);
  const path = new Channel(outcome, samples), segments = samples.length - 1, sides = 24;
  const frames = path.computeFrenetFrames(segments, false);
  const positions: number[] = [], normals: number[] = [], indices: number[] = [];
  for (const radius of [TUBE.outer, TUBE.inner]) {
    const inward = radius === TUBE.inner ? -1 : 1;
    for (let i = 0; i <= segments; i++) {
      const center = path.getPoint(i / segments);
      // Rolled outer lips, with the complete .70 bore continuing to the edge.
      // The rings belong to this tested mesh, not decorative sealed caps.
      const distance = Math.min(samples[i], tubeLength - samples[i]);
      const first = (TUBE.rim - TUBE.outer) * Math.exp(-(((distance - .08) / .065) ** 2));
      const second = .16 * Math.exp(-(((distance - .34) / .075) ** 2));
      const lip = radius === TUBE.outer ? first + second : 0;
      const slope = radius === TUBE.outer ? (-first * 2 * (distance - .08) / .065 ** 2 - second * 2 * (distance - .34) / .075 ** 2) * (i < segments / 2 ? 1 : -1) : 0;
      for (let j = 0; j <= sides; j++) {
        const angle = j / sides * Math.PI * 2;
        const n = frames.normals[i].clone().multiplyScalar(Math.cos(angle)).addScaledVector(frames.binormals[i], Math.sin(angle));
        positions.push(...center.clone().addScaledVector(n, radius + lip).toArray());
        normals.push(...n.addScaledVector(path.getTangent(i/segments),-slope).normalize().multiplyScalar(inward).toArray());
      }
    }
  }
  const stride = sides + 1, layer = (segments + 1) * stride;
  for (let i = 0; i < segments; i++) for (let j = 0; j < sides; j++) {
    const a = i * stride + j, b = a + stride;
    indices.push(a, a+1, b, b, a+1, b+1);
    indices.push(a+layer, b+layer, a+1+layer, b+layer, b+1+layer, a+1+layer);
  }
  for (const end of [0, segments]) {
    const offset = positions.length / 3;
    const n = path.getTangent(end / segments).multiplyScalar(end === 0 ? -1 : 1);
    // Separate normals on the rim avoid shading it as a sealed cap.
    for (const base of [end * stride, end * stride + layer]) for (let j = 0; j <= sides; j++) {
      positions.push(...positions.slice((base + j) * 3, (base + j) * 3 + 3));
      normals.push(...n.toArray());
    }
    for (let j = 0; j < sides; j++) {
      const a = offset+j, b = a+stride;
      if (end === 0) indices.push(a,b,a+1,b,b+1,a+1);
      else indices.push(a,a+1,b,b,a+1,b+1);
    }
  }
  return new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)).setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3)).setIndex(indices);
}

// Three.js sorts transparent objects, not the triangles of a hollow object.
// Sort the actual bore/wall/rim triangles back-to-front on camera changes; a
// single unsorted mesh produced dark stripes at the overlap of its two skins.
export function wallSorter(geometry: THREE.BufferGeometry) {
  const index = geometry.index!, original = Array.from(index.array);
  const count = original.length / 3, order = Array.from({ length: count }, (_, i) => i);
  const centers = new Float32Array(count * 3), depths = new Float64Array(count);
  const p = geometry.attributes.position;
  for (let i = 0; i < count; i++) for (let j = 0; j < 3; j++) {
    const v = original[i * 3 + j];
    centers[i*3] += p.getX(v) / 3; centers[i*3+1] += p.getY(v) / 3; centers[i*3+2] += p.getZ(v) / 3;
  }
  return (direction: THREE.Vector3) => {
    for (let i=0;i<count;i++) depths[i]=centers[i*3]*direction.x+centers[i*3+1]*direction.y+centers[i*3+2]*direction.z;
    order.sort((a,b)=>depths[b]-depths[a] || a-b);
    for (let i=0;i<count;i++) for(let j=0;j<3;j++) index.array[i*3+j]=original[order[i]*3+j];
    index.needsUpdate=true;
  };
}
