import { useEffect, useRef, useState } from 'react';
import type { Decision } from '../animation/useDecision';
import { DecisionAudio } from './DecisionAudio';

export function useSound(decision: Decision, rate: number) {
  const engine = useRef<DecisionAudio | null>(null);
  const generation = useRef(0);
  const wanted = useRef(false);
  const [enabled, setEnabled] = useState(false);
  const [error, setError] = useState('');
  const [visible, setVisible] = useState(!document.hidden);
  const { phase, outcome, scenario, time, playing, freestyle } = decision;

  useEffect(() => {
    const visibility = async () => {
      setVisible(false);
      if (document.hidden) { await engine.current?.suspend(); return; }
      try { if (wanted.current) await engine.current?.resume(); }
      catch { setError('Audio is unavailable. Toggle SOUND to retry.'); }
      if (!document.hidden) setVisible(true);
    };
    document.addEventListener('visibilitychange', visibility);
    return () => { document.removeEventListener('visibilitychange', visibility); generation.current++; engine.current?.dispose(); };
  }, []);

  useEffect(() => {
    const sound = engine.current;
    if (!sound) return;
    if (!enabled || !visible) { sound.stop(); return; }
    if (phase === 'result') sound.finish(outcome);
    else if (phase === 'running' && playing) sound.play(scenario, outcome, time, rate, freestyle);
    else sound.stop();
    // time deliberately supplies the start point only. Re-scheduling each RAF
    // would repeatedly trigger notes; pause/resume and seek change playing.
  }, [enabled, visible, phase, playing, outcome, scenario, rate, freestyle]);

  return {
    enabled, error,
    toggle: async () => {
      const run = ++generation.current;
      wanted.current = !wanted.current;
      setError('');
      if (!wanted.current) { setEnabled(false); await engine.current?.suspend(); return; }
      try {
        engine.current ??= new DecisionAudio();
        await engine.current.enable();
        if (run === generation.current && wanted.current) setEnabled(true);
      } catch {
        if (run === generation.current) { wanted.current = false; engine.current?.dispose(); setEnabled(false); setError('Audio is unavailable. Tap SOUND to retry.'); }
      }
    },
  };
}
