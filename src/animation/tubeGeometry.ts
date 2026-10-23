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
  for (let i = 0; i <= 44; i++) {
    distances.add(i * .025);
    distances.add(tubeLength - i * .025);
  }
  const samples = [...distances].sort((a, b) => a - b);
  const path = new Channel(outcome, samples), segments = samples.length - 1, sides = 24;
  const frames = path.computeFrenetFrames(segments, false);
  const positions: number[] = [], normals: number[] = [], indices: number[] = [], thicknesses: number[] = [], interiors: number[] = [];
  for (const radius of [TUBE.outer, TUBE.inner]) {
    const inward = radius === TUBE.inner ? -1 : 1;
    for (let i = 0; i <= segments; i++) {
      const center = path.getPoint(i / segments);
      // A flared open mouth with two rolled lips, as in the film. The bore
      // widens at the opening; the internal minimum stays .70 throughout.
      // Every surface belongs to this collision-tested mesh.
      const distance = Math.min(samples[i], tubeLength - samples[i]);
      const outlet = samples[i] > tubeLength / 2;
      const outer = radius === TUBE.outer;
      // A short sleeve with two rounded collars. The source shows their
      // separated shoulders, not a single thin flared disc. The inner radius
      // still widens from the same collision-tested .70 bore.
      const collar = outlet ? .72 : .65;
      const shoulder = outlet ? .30 : .14;
      const roll = outlet ? .56 : .28;
      const rollWidth = outlet ? .10 : .09;
      const sleeveEnd = collar + .11;
      const sleeveU = Math.max(0, Math.min(1, (distance - sleeveEnd) / .20));
      const taperU = Math.min(1, distance / collar);
      const taper = 1 - .70 * taperU * taperU * (3 - 2 * taperU);
      const taperSlope = -.70 * 6 * taperU * (1 - taperU) / collar;
      const fade = 1 - sleeveU * sleeveU * (3 - 2 * sleeveU);
      const sleeve = shoulder * taper * fade;
      const sleeveSlope = shoulder * (taperSlope * fade - taper * 6 * sleeveU * (1 - sleeveU) / .20);
      const first = roll * Math.exp(-(((distance - .06) / rollWidth) ** 2));
      const second = (outlet ? .24 : .22) * Math.exp(-(((distance - collar) / rollWidth) ** 2));
      const flareWidth = outlet ? .22 : .55;
      const flare = (outlet ? .55 : .20) * Math.exp(-((distance / flareWidth) ** 2));
      const lip = outer ? sleeve + first + second : flare;
      const derivative = outer
        ? sleeveSlope - first * 2 * (distance - .06) / rollWidth ** 2 - second * 2 * (distance - collar) / rollWidth ** 2
        : -flare * 2 * distance / flareWidth ** 2;
      const slope = derivative * (i < segments / 2 ? 1 : -1);
      for (let j = 0; j <= sides; j++) {
        const angle = j / sides * Math.PI * 2;
        const n = frames.normals[i].clone().multiplyScalar(Math.cos(angle)).addScaledVector(frames.binormals[i], Math.sin(angle));
        positions.push(...center.clone().addScaledVector(n, radius + lip).toArray());
        thicknesses.push(TUBE.outer + sleeve + first + second - TUBE.inner - flare);
        interiors.push(outer ? 0 : 1);
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
      thicknesses.push(thicknesses[base+j]);
      interiors.push(0);
    }
    for (let j = 0; j < sides; j++) {
      const a = offset+j, b = a+stride;
      if (end === 0) indices.push(a,b,a+1,b,b+1,a+1);
      else indices.push(a,a+1,b,b,a+1,b+1);
    }
  }
  return new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)).setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3)).setAttribute('wallThickness', new THREE.Float32BufferAttribute(thicknesses, 1)).setAttribute('innerSurface', new THREE.Float32BufferAttribute(interiors, 1)).setIndex(indices);
}

// Three.js sorts transparent objects, not the triangles of a hollow object.
// Sort the actual bore/wall/rim triangles back-to-front on camera changes; a
// single unsorted mesh produced dark stripes at the overlap of its two skins.
export function wallSorter(geometry: THREE.BufferGeometry) {
  const index = geometry.index!, original = Array.from(index.array);
  const count = original.length / 3;
  let order = new Uint32Array(count), scratch = new Uint32Array(count);
  const centers = new Float32Array(count * 3), depths = new Float64Array(count);
  const words = new Uint32Array(depths.buffer), low = new Uint32Array(count), high = new Uint32Array(count), buckets = new Uint32Array(256);
  const littleEndian = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;
  // The live and reflected cameras alternate on every frame. Keep their
  // independent orders: a fixed viewing direction needs no new triangle sort
  // while the ball, pins and lights move. Quantization is below raster precision
  // and is applied to the sort itself, so reverse seeks remain deterministic.
  const cache = new Map<string, Uint16Array | Uint32Array>();
  const p = geometry.attributes.position;
  for (let i = 0; i < count; i++) for (let j = 0; j < 3; j++) {
    const v = original[i * 3 + j];
    centers[i*3] += p.getX(v) / 3; centers[i*3+1] += p.getY(v) / 3; centers[i*3+2] += p.getZ(v) / 3;
  }
  return (direction: THREE.Vector3) => {
    const components = [direction.x,direction.y,direction.z].map(v => Number(v.toFixed(10)));
    const key = components.join(',');
    const cached = cache.get(key);
    if (cached) { index.array.set(cached); index.needsUpdate=true; return; }
    for (let i=0;i<count;i++) {
      const depth = centers[i*3]*components[0]+centers[i*3+1]*components[1]+centers[i*3+2]*components[2];
      depths[i] = depth === 0 ? 0 : depth; // +0 and -0 are the same depth.
      const hi = words[i*2+(littleEndian?1:0)], lo = words[i*2+(littleEndian?0:1)];
      // Transform IEEE-754 doubles into descending unsigned keys. Keep all
      // 64 bits: rounding depth to float32 can reorder nearly coplanar faces.
      high[i] = hi & 0x80000000 ? hi : (~hi ^ 0x80000000) >>> 0;
      low[i] = hi & 0x80000000 ? lo : ~lo >>> 0;
      order[i] = i;
    }
    // Stable byte-wise radix ordering avoids two large comparator sorts per
    // moving frame. Original triangle order breaks exact depth ties, just as
    // the former depth[b]-depth[a] || a-b comparator did.
    for (let pass=0;pass<8;pass++) {
      const keys = pass < 4 ? low : high, shift = (pass%4)*8;
      buckets.fill(0);
      for (let i=0;i<count;i++) buckets[(keys[order[i]]>>>shift)&255]++;
      let offset=0;
      for (let byte=0;byte<256;byte++) { const size=buckets[byte]; buckets[byte]=offset; offset+=size; }
      for (let i=0;i<count;i++) { const id=order[i]; scratch[buckets[(keys[id]>>>shift)&255]++]=id; }
      [order,scratch]=[scratch,order];
    }
    for (let i=0;i<count;i++) for(let j=0;j<3;j++) index.array[i*3+j]=original[order[i]*3+j];
    if (cache.size >= 4) cache.delete(cache.keys().next().value!);
    cache.set(key, index.array.slice() as Uint16Array | Uint32Array);
    index.needsUpdate=true;
  };
}
