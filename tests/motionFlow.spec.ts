import { test, expect } from '@playwright/test';
import * as THREE from 'three';
import { createFreestyle } from '../src/animation/freestyle';
import { guideGeometries } from '../src/animation/guideGeometry';
import { tubeGeometry } from '../src/animation/tubeGeometry';
import { cameraAt, cameraUp, DURATION } from '../src/animation/timeline';
import { wallIndex } from './wallClearance';

test('freestyle: the complete ball clears the actual metal guides, collars and coil on both routes', () => {
  test.setTimeout(180_000);
  // Include the worst old guide intersections and unsigned seed boundaries.
  const seeds = [...Array.from({ length: 24 }, (_, i) => i), 44, 50, 58, 84, 92, 94, 0x80000000, 0xffffffff];
  for (const scenario of ['left', 'right'] as const) {
    const tube = tubeGeometry(scenario === 'left' ? 'yes' : 'no'), tubeGap = wallIndex(tube);
    for (const seed of seeds) {
      const run = createFreestyle(seed, scenario), rails = guideGeometries(run), gaps = rails.map(wallIndex);
      let minimum = Infinity;
      for (let time = run.events.release; time <= run.events.hit; time += .001) {
        const point = run.ballAt(time);
        minimum = Math.min(minimum, tubeGap(point), ...gaps.map(gap => gap(point)));
      }
      // A positive margin, not merely absence of a negative sample. The old
      // rails crossed the sphere by almost its whole radius on these seeds.
      expect(minimum, `${scenario} seed ${seed}`).toBeGreaterThan(.08);
      rails.forEach(rail => rail.dispose());
    }
    tube.dispose();
  }
});

test('freestyle: pin impulses preserve a steady spin instead of reversing the texture at every impact', () => {
  for (const scenario of ['left', 'right'] as const) for (const seed of [0, 2, 3, 50, 60, 92, 0xffffffff]) {
    const run = createFreestyle(seed, scenario), h = .001;
    const velocity = (t: number) => run.rotationAt(t + h).multiply(run.rotationAt(t).invert());
    for (const contact of run.contacts) {
      expect(velocity(contact.time - h).angleTo(velocity(contact.time))).toBeLessThan(1e-6);
      expect(run.rotationAt(contact.time).angleTo(run.rotationAt(contact.time + h)) / h).toBeLessThan(7.01);
    }
    expect(velocity(run.events.entry).angleTo(velocity(run.events.exit))).toBeLessThan(1e-6);
    expect(run.rotationAt(run.duration).toArray()).toEqual(run.rotationAt(run.events.hit).toArray());
  }
});

test('movie: the continuous camera rail limits pan and dolly jolts throughout the shot', () => {
  const hz = 240;
  for (const route of ['yes', 'no'] as const) {
    const camera = new THREE.PerspectiveCamera();
    let position: THREE.Vector3 | undefined, rotation: THREE.Quaternion | undefined;
    let velocity: THREE.Vector3 | undefined, angularVelocity: THREE.Vector3 | undefined;
    let acceleration = 0, panSpeed = 0, panAcceleration = 0;
    for (let time = 0; time <= DURATION; time += 1 / hz) {
      const pose = cameraAt(time, route);
      camera.position.fromArray(pose); camera.up.fromArray(cameraUp(pose)); camera.lookAt(pose[3], pose[4], pose[5]);
      if (position && rotation) {
        const nextVelocity = camera.position.clone().sub(position).multiplyScalar(hz);
        const delta = camera.quaternion.clone().multiply(rotation.clone().invert());
        if (delta.w < 0) delta.set(-delta.x, -delta.y, -delta.z, -delta.w);
        const axis = new THREE.Vector3(delta.x, delta.y, delta.z);
        const nextAngular = axis.clone().normalize().multiplyScalar(2 * Math.atan2(axis.length(), delta.w) * hz);
        panSpeed = Math.max(panSpeed, nextAngular.length());
        if (velocity) acceleration = Math.max(acceleration, nextVelocity.clone().sub(velocity).length() * hz);
        if (angularVelocity) panAcceleration = Math.max(panAcceleration, nextAngular.clone().sub(angularVelocity).length() * hz);
        velocity = nextVelocity; angularVelocity = nextAngular;
      }
      position = camera.position.clone(); rotation = camera.quaternion.clone();
    }
    expect(acceleration, route).toBeLessThan(3000);
    expect(panSpeed, route).toBeLessThan(8);
    expect(panAcceleration, route).toBeLessThan(40);
  }
});
