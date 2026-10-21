import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createScene, type ReviewView } from '../animation/createScene';
import { phaseAt, type Outcome, type Phase } from '../animation/timeline';
import { StageScreen } from './StageScreen';
import { pathFor, type Scenario } from '../animation/scenario';

type Props = { phase: Phase; outcome: Outcome; scenario: Scenario; time: number; onUnavailable: () => void; view?: ReviewView; opaque?: boolean; diagnostics?: boolean; reducedMotion?: boolean };
export function DecisionStage({ phase, outcome, scenario, time, onUnavailable, view = 'film', opaque = false, diagnostics = false, reducedMotion = false }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const scene = useRef<ReturnType<typeof createScene> | null>(null);
  const unavailable = useRef(onUnavailable);
  unavailable.current = onUnavailable;
  const [fallback, setFallback] = useState(false);
  const active = phase === 'running' || phase === 'result';
  useLayoutEffect(() => {
    if (!active || reducedMotion || !canvas.current) { setFallback(false); return; }
    const element = canvas.current;
    const fail = (event?: Event) => { event?.preventDefault(); setFallback(true); unavailable.current(); };
    element.addEventListener('webglcontextlost', fail);
    try { scene.current = createScene(element); }
    catch { fail(); }
    return () => {
      element.removeEventListener('webglcontextlost', fail);
      scene.current?.dispose();
      scene.current = null;
    };
  }, [active, reducedMotion]);
  useLayoutEffect(() => {
    try { scene.current?.render(time, outcome, scenario, view, opaque); }
    catch { setFallback(true); unavailable.current(); }
    if (diagnostics && canvas.current && scene.current) canvas.current.dataset.camera = JSON.stringify(scene.current.cameraPose());
  }, [time, outcome, active, view, opaque, scenario, diagnostics]);
  useEffect(() => { if (fallback) scene.current?.dispose(); }, [fallback]);

  return <div className="decision-stage" style={{ '--finish': Math.min(1, Math.max(0, (time - 5.5) / .5)) } as React.CSSProperties} data-phase={phase} data-outcome={active ? outcome : ''} data-scenario={active ? scenario : ''} data-time={time.toFixed(3)} data-shot={active ? phaseAt(time, pathFor(scenario)) : 'idle'} data-view={view} data-opaque={opaque} data-renderer={!active ? 'svg' : reducedMotion ? 'reduced-motion' : fallback ? 'fallback' : 'webgl'}>
    {!active ? <StageScreen screen="idle"/> : reducedMotion ? <StageScreen screen={outcome}/> : <>
      <canvas className="scene-canvas" ref={canvas} aria-hidden="true" style={{ visibility: fallback ? 'hidden' : 'visible' }}/>
      {fallback && <div className="stage-fallback"><StageScreen screen={outcome}/></div>}
    </>}
    {phase === 'result' && <span className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">{outcome.toUpperCase()}</span>}
  </div>;
}
