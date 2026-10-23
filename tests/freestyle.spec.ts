import { test, expect } from '@playwright/test';
import { createFreestyle } from '../src/animation/freestyle';
import { BALL_RADIUS, fields, length, sub, dot, PIN_HEIGHT, PIN_RADIUS, targetFrame } from '../src/animation/mechanism';
import { timing, tubeDistanceAt, flights, cameraUp } from '../src/animation/timeline';
import * as THREE from 'three';
import { decisionNotes } from '../src/audio/DecisionAudio';

test('freestyle: seeded trajectories reflect real contacts, keep momentum and clear every pin', () => {
  const fingerprints = new Set<string>();
  for (let seed = 0; seed < 100; seed++) {
    const run = createFreestyle(seed, 'left');
    expect(run.duration).toBeLessThan(16);
    expect(run.contacts.length).toBeGreaterThanOrEqual(4);
    fingerprints.add(run.contacts.map(c => c.index).join(','));
    for (const contact of run.contacts) {
      const pin = fields.yes.pins[contact.index].position;
      expect(Math.hypot(contact.point[0] - pin[0], contact.point[2] - pin[2])).toBeCloseTo(BALL_RADIUS + PIN_RADIUS, 8);
      expect(length(contact.incoming)).toBeCloseTo(length(contact.outgoing), 9);
      expect(dot(contact.incoming, contact.normal)).toBeLessThan(0);
      expect(dot(contact.outgoing, contact.normal)).toBeCloseTo(-dot(contact.incoming, contact.normal), 9);
      expect(run.rotationAt(contact.time - 1e-6).angleTo(run.rotationAt(contact.time + 1e-6))).toBeLessThan(.001);
    }
    let clearance = Infinity;
    for (let time = run.events.release; time < run.events.entry; time += .01) {
      const p = run.ballAt(time);
      for (const pin of fields.yes.pins) {
        const radial = Math.max(0, Math.hypot(p[0] - pin.position[0], p[2] - pin.position[2]) - PIN_RADIUS);
        const axial = Math.max(0, -p[1], p[1] - PIN_HEIGHT);
        clearance = Math.min(clearance, Math.hypot(radial, axial) - BALL_RADIUS);
      }
    }
    expect(clearance, `seed ${seed}`).toBeGreaterThanOrEqual(-1e-7);
    expect(run.ballAt(run.duration)).toEqual(targetFrame('yes').impact);
    expect(run.rotationAt(run.duration).toArray()).toEqual(run.rotationAt(run.events.hit).toArray());
  }
  expect(fingerprints.size).toBeGreaterThan(90);
});

test('freestyle: both routes retain the same seed on reverse seek and join without a speed jump', () => {
  for (const seed of [0, 1, 2, 7, 60, 1024]) {
    const left = createFreestyle(seed, 'left'), right = createFreestyle(seed, 'right');
    expect(Math.abs(left.duration - right.duration)).toBeLessThan(.04);
    const repeats = createFreestyle(seed, 'left');
    for (let time = 0; time <= left.duration; time += .037) {
      const p = left.ballAt(time), q = right.ballAt(time);
      expect(p.every(Number.isFinite)).toBe(true);
      expect(repeats.ballAt(time)).toEqual(p);
      expect(q[0]).toBeCloseTo(-p[0], 8);
      expect(q[1]).toBeCloseTo(p[1], 8);
      expect(q[2]).toBeCloseTo(p[2], 8);
    }
    for (const time of [left.events.fieldStart, left.events.fieldEnd, left.events.entry, left.events.exit]) {
      const h = 1e-6, a = left.ballAt(time - h), b = left.ballAt(time), c = left.ballAt(time + h);
      expect(length(sub(sub(c, b), sub(b, a))) / h).toBeLessThan(.25);
    }
  }
});

test('freestyle: moving ball stays in the camera throughout pins, guide, coil and flight', () => {
  for (const scenario of ['left', 'right'] as const) for (const seed of [0, 1, 2, 60]) {
    const run = createFreestyle(seed, scenario);
    for (let time = run.events.fieldStart; time < run.events.hit; time += .025) {
      const c = run.cameraAt(time), camera = new THREE.PerspectiveCamera(c[6], 1241 / 688, .1, 2000);
      camera.position.fromArray(c); camera.up.fromArray(cameraUp(c)); camera.lookAt(c[3], c[4], c[5]); camera.updateMatrixWorld();
      const p = new THREE.Vector3(...run.ballAt(time)).project(camera);
      expect(Math.abs(p.x), `${scenario} seed ${seed} at ${time}`).toBeLessThan(.95);
      expect(Math.abs(p.y), `${scenario} seed ${seed} at ${time}`).toBeLessThan(.95);
      expect(p.z).toBeGreaterThan(-1); expect(p.z).toBeLessThan(1);
    }
  }
});

test('movie: the ball keeps moving through the coil and free flight between photographed poses', () => {
  for (const route of ['yes', 'no'] as const) {
    const t = timing[route], h = 1 / 240;
    for (let time = t.entry + h; time < t.exit - h; time += h) expect(tubeDistanceAt(time + h, route) - tubeDistanceAt(time, route)).toBeGreaterThan(1e-5);
    for (let time = t.exit + h; time < t.hit - h; time += h) expect(flights[route].distanceAt(time + h) - flights[route].distanceAt(time)).toBeGreaterThan(1e-5);
  }
});

test('freestyle sound follows actual contacts and keeps the result chord after impact', () => {
  for (const scenario of ['left', 'right'] as const) {
    const run = createFreestyle(60, scenario), notes = decisionNotes(scenario, 'yes', run);
    expect(notes.slice(1, 1 + run.contacts.length).map(note => note.time)).toEqual(run.contacts.map(contact => contact.time));
    expect(notes.at(-4)!.time).toBeCloseTo(run.events.hit, 8);
    expect(notes.at(-3)!.time).toBeGreaterThan(run.events.color);
    expect(notes.at(-1)!.time).toBeLessThan(run.duration);
  }
});
