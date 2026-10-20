import type { Outcome } from './mechanism';

// These are the two collision-checked, authored worlds. A route has no answer:
// either result can use either route, including the final camera movement.
export type Scenario = 'left' | 'right';
export const pathFor = (scenario: Scenario): Outcome => scenario === 'left' ? 'yes' : 'no';
// Only reference review pairs the original film's route with its answer.
export const filmScenario = (outcome: Outcome): Scenario => outcome === 'yes' ? 'left' : 'right';
export const randomScenario = (): Scenario => (crypto.getRandomValues(new Uint32Array(1))[0] & 1) ? 'right' : 'left';
