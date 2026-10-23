import { useEffect, useRef, useState } from 'react';
import { clamp, DURATION, type Outcome, type Phase } from './timeline';
import { randomScenario, type Scenario } from './scenario';
import { externalOutcome, localOutcome, type RandomMode } from './randomness';
import { createFreestyle, type FreestyleRun, type PlaybackMode } from './freestyle';

export type Decision = { phase: Phase; outcome: Outcome; scenario: Scenario; time: number; playing: boolean; error: string | null; mode: PlaybackMode; freestyle: FreestyleRun | null; duration: number };
const initial: Decision = { phase: 'idle', outcome: 'yes', scenario: 'left', time: 0, playing: false, error: null, mode: 'movie', freestyle: null, duration: DURATION };

export function useDecision(rate = 1, reducedMotion = false) {
  const [state, setState] = useState<Decision>(initial);
  const current = useRef(state);
  const reduce = useRef(reducedMotion);
  reduce.current = reducedMotion;
  const frame = useRef(0);
  const generation = useRef(0);
  const request = useRef<AbortController | null>(null);
  const resumeVisible = useRef<(() => void) | null>(null);
  const commit = (next: Decision) => { current.current = next; setState(next); };
  const stop = () => { generation.current++; cancelAnimationFrame(frame.current); resumeVisible.current = null; request.current?.abort(); request.current = null; };

  const play = (outcome: Outcome, from = 0, scenario = current.current.scenario, freestyle = current.current.freestyle) => {
    stop();
    const run = generation.current;
    let origin: number | undefined;
    const duration = freestyle?.duration ?? DURATION;
    const chosen = { outcome, scenario, error: null, freestyle, duration, mode: freestyle ? 'freestyle' as const : 'movie' as const };
    if (reduce.current) { commit({ ...chosen, phase: 'result', time: duration, playing: false }); return; }
    commit({ ...chosen, phase: 'running', time: from, playing: true });
    const tick = (now: number) => {
      if (run !== generation.current || document.hidden) return;
      // Start after the first scene render, so shader compilation cannot eat the opening shot.
      origin ??= now - current.current.time * 1000 / rate;
      const time = clamp((now - origin) * rate / 1000, 0, duration);
      commit({ ...chosen, phase: time >= duration ? 'result' : 'running', time, playing: time < duration });
      if (time < duration) frame.current = requestAnimationFrame(tick);
    };
    resumeVisible.current = () => {
      if (run !== generation.current || !current.current.playing) return;
      origin = undefined;
      frame.current = requestAnimationFrame(tick);
    };
    if (!document.hidden) frame.current = requestAnimationFrame(tick);
  };
  useEffect(() => {
    const visibility = () => {
      cancelAnimationFrame(frame.current);
      if (!document.hidden) resumeVisible.current?.();
    };
    document.addEventListener('visibilitychange', visibility);
    return () => {
      document.removeEventListener('visibilitychange', visibility);
      generation.current++; cancelAnimationFrame(frame.current); request.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (reducedMotion && current.current.phase === 'running') {
      stop(); commit({ ...current.current, phase: 'result', time: current.current.duration, playing: false });
    }
  }, [reducedMotion]);

  return {
    ...state,
    ask: async (mode: RandomMode = 'local', playback: PlaybackMode = 'movie') => {
      // The ref also guards two submits before React has committed the next render.
      if (current.current.phase !== 'idle') return;
      const scenario = randomScenario();
      // The motion seed is independent of the answer and drawn once. Neither
      // seek, rendering, pause nor fallback consumes additional randomness.
      const freestyle = playback === 'freestyle' ? createFreestyle(crypto.getRandomValues(new Uint32Array(1))[0], scenario) : null;
      if (mode === 'local') { play(localOutcome(), 0, scenario, freestyle); return; }
      stop();
      const run = generation.current;
      const controller = new AbortController();
      request.current = controller;
      commit({ ...initial, phase: 'preparing', scenario, mode: playback, freestyle, duration: freestyle?.duration ?? DURATION });
      try {
        const outcome = await externalOutcome(controller.signal);
        if (run === generation.current) play(outcome, 0, scenario, freestyle);
      } catch (error) {
        if (run === generation.current) {
          request.current = null;
          commit({ ...initial, error: error instanceof Error ? error.message : 'Random-number request failed. Please retry or choose LOCAL.' });
        }
      }
    },
    reset: () => { stop(); commit(initial); },
    seek: (outcome: Outcome, seconds: number, scenario = current.current.scenario, mode: PlaybackMode = current.current.mode, seed = current.current.freestyle?.seed ?? 60) => {
      stop();
      const existing = current.current.freestyle;
      const freestyle = mode === 'freestyle' ? existing?.scenario === scenario && existing.seed === seed ? existing : createFreestyle(seed, scenario) : null;
      const duration = freestyle?.duration ?? DURATION;
      let time = Number.isFinite(seconds) ? clamp(seconds, 0, duration) : 0;
      if (duration - time < 1e-6) time = duration;
      commit({ phase: time >= duration ? 'result' : 'running', outcome, scenario, time, playing: false, error: null, mode, freestyle, duration });
    },
    finish: () => { stop(); commit({ ...current.current, phase: 'result', time: current.current.duration, playing: false }); },
    pause: () => { stop(); commit({ ...current.current, playing: false }); },
    play: (outcome: Outcome) => play(outcome, current.current.phase === 'running' ? current.current.time : 0),
  };
}
