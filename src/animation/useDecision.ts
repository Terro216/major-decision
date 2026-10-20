import { useEffect, useRef, useState } from 'react';
import { clamp, DURATION, type Outcome, type Phase } from './timeline';
import { randomScenario, type Scenario } from './scenario';
import { externalOutcome, localOutcome, type RandomMode } from './randomness';

export type Decision = { phase: Phase; outcome: Outcome; scenario: Scenario; time: number; playing: boolean; error: string | null };
const initial: Decision = { phase: 'idle', outcome: 'yes', scenario: 'left', time: 0, playing: false, error: null };

export function useDecision(rate = 1) {
  const [state, setState] = useState<Decision>(initial);
  const current = useRef(state);
  const frame = useRef(0);
  const generation = useRef(0);
  const request = useRef<AbortController | null>(null);
  const commit = (next: Decision) => { current.current = next; setState(next); };
  const stop = () => { generation.current++; cancelAnimationFrame(frame.current); request.current?.abort(); request.current = null; };

  const play = (outcome: Outcome, from = 0, scenario = current.current.scenario) => {
    stop();
    const run = generation.current;
    let origin: number | undefined;
    const chosen = { outcome, scenario, error: null };
    commit({ ...chosen, phase: 'running', time: from, playing: true });
    const tick = (now: number) => {
      if (run !== generation.current) return;
      // Start after the first scene render, so shader compilation cannot eat the opening shot.
      origin ??= now - from * 1000 / rate;
      const time = clamp((now - origin) * rate / 1000, 0, DURATION);
      commit({ ...chosen, phase: time >= DURATION ? 'result' : 'running', time, playing: time < DURATION });
      if (time < DURATION) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  };
  useEffect(() => () => { generation.current++; cancelAnimationFrame(frame.current); request.current?.abort(); }, []);

  return {
    ...state,
    ask: async (mode: RandomMode = 'local') => {
      // The ref also guards two submits before React has committed the next render.
      if (current.current.phase !== 'idle') return;
      const scenario = randomScenario();
      if (mode === 'local') { play(localOutcome(), 0, scenario); return; }
      stop();
      const run = generation.current;
      const controller = new AbortController();
      request.current = controller;
      commit({ ...initial, phase: 'preparing', scenario });
      try {
        const outcome = await externalOutcome(controller.signal);
        if (run === generation.current) play(outcome, 0, scenario);
      } catch (error) {
        if (run === generation.current) {
          request.current = null;
          commit({ ...initial, error: error instanceof Error ? error.message : 'Random-number request failed. Please retry or choose LOCAL.' });
        }
      }
    },
    reset: () => { stop(); commit(initial); },
    seek: (outcome: Outcome, seconds: number, scenario = current.current.scenario) => {
      stop();
      const time = Number.isFinite(seconds) ? clamp(seconds, 0, DURATION) : 0;
      commit({ phase: time >= DURATION ? 'result' : 'running', outcome, scenario, time, playing: false, error: null });
    },
    finish: () => { stop(); commit({ ...current.current, phase: 'result', time: DURATION, playing: false }); },
    pause: () => { stop(); commit({ ...current.current, playing: false }); },
    play: (outcome: Outcome) => play(outcome, current.current.phase === 'running' ? current.current.time : 0),
  };
}
