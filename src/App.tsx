import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AskSymbol, Frame, MobileOrnaments } from './components/Frame';
import { BrowserFrame } from './components/BrowserFrame';
import { DecisionStage } from './components/DecisionStage';
import { useDecision } from './animation/useDecision';
import { DURATION, indicatorAt, indicatorBallsAt, phaseAt, type Outcome } from './animation/timeline';
import type { ReviewView } from './animation/createScene';
import { filmScenario, pathFor, type Scenario } from './animation/scenario';
import type { RandomMode } from './animation/randomness';
import wordmark from './assets/wordmark-badge.svg';
import { usePreference } from './usePreference';
import { useSound } from './audio/useSound';

const tie = 'Should I wear a tie to lunch?';
const competition = 'Should I enter a painting\nin the Conrad Competition?';
const params = new URLSearchParams(window.location.search);
const review = params.get('review') === '1';
const Shell = memo(Frame);
const Browser = memo(BrowserFrame);

export function App() {
  const fit = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const [scale, setScale] = useState(1);
  const [cinema, setCinema] = useState(() => !matchMedia('(max-width:700px), (max-width:1000px) and (max-height:500px)').matches);
  const [question, setQuestion] = useState(review ? tie : '');
  const [rate, setRate] = useState(1);
  const [view, setView] = useState<ReviewView>(review && ['top', 'side', 'mouth'].includes(params.get('view') || '') ? params.get('view') as ReviewView : 'film');
  const [opaque, setOpaque] = useState(review && params.get('opaque') === '1');
  const [randomMode, setRandomMode] = useState<RandomMode>('local');
  const [reviewScenario, setReviewScenario] = useState<Scenario | 'film'>(review && ['left', 'right'].includes(params.get('scenario') || '') ? params.get('scenario') as Scenario : 'film');
  const reducedMotion = usePreference('(prefers-reduced-motion: reduce)');
  const decision = useDecision(review ? rate : 1, reducedMotion);
  const sound = useSound(decision, review ? rate : 1);
  const { phase, outcome, scenario, time, playing } = decision;
  const path = pathFor(scenario);
  const busy = phase === 'preparing' || phase === 'running';
  const indicator = phase === 'running' ? indicatorAt(time, path) : null;

  useLayoutEffect(() => {
    const element = fit.current!;
    const resize = () => setScale(element.getBoundingClientRect().width / 1600);
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    // Explicit comparison URLs are honored only in the review surface.
    if (!review || !['yes', 'no'].includes(params.get('outcome') || '')) return;
    const branch = params.get('outcome') as Outcome;
    setQuestion(branch === 'yes' ? tie : competition);
    decision.seek(branch, Number(params.get('t') ?? DURATION), reviewScenario === 'film' ? filmScenario(branch) : reviewScenario);
  }, []);

  const reset = () => {
    decision.reset();
    setQuestion('');
    input.current?.focus();
  };
  const ask = () => {
    if (!question.trim()) { input.current?.focus(); return; }
    void decision.ask(randomMode);
  };
  const reviewScreen = (next: Outcome | 'idle', animate = false) => {
    setQuestion(next === 'no' ? competition : tie);
    if (next === 'idle') decision.reset();
    else {
      decision.seek(next, animate ? 0 : DURATION, reviewScenario === 'film' ? filmScenario(next) : reviewScenario);
      if (animate) decision.play(next);
    }
  };

  return <main className={`page ${cinema ? 'with-browser' : 'without-browser'}`}>
    <h1 className="visually-hidden">Major Decision</h1>
    <div className="terminal-fit" ref={fit}>
      <div className="terminal-surface" style={{ transform: `scale(${scale})` }}>
        {cinema && <Browser />}
        <section className="machine" aria-label="Major Decision machine">
          <div className="viewport"><DecisionStage phase={phase} outcome={outcome} scenario={scenario} time={time} onUnavailable={decision.finish} view={view} opaque={opaque} diagnostics={review} reducedMotion={reducedMotion}/></div>
          <Shell />
          <MobileOrnaments />
          <img className="sidebar-wordmark" src={wordmark} alt="Major Decision" draggable="false"/>
          <form onSubmit={event => { event.preventDefault(); ask(); }}>
            <label className="visually-hidden" htmlFor="question">Your question</label>
            <textarea id="question" className={`question-input ${question.length > 100 ? 'question-input--long' : ''}`} ref={input} value={question} rows={2} maxLength={180} placeholder="Ask a question…" autoComplete="off" spellCheck="false" readOnly={busy} onChange={event => { setQuestion(event.target.value); if (phase !== 'idle') decision.reset(); }} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) { event.preventDefault(); ask(); } }} aria-describedby="question-help"/>
            <span id="question-help" className="visually-hidden">Ask a yes or no question. Press Enter or the question mark to start. Shift and Enter add a new line. New Question cancels the animation.</span>
            <button className="ask-button" aria-label="Ask the question" type="submit" disabled={phase !== 'idle'}><AskSymbol/></button>
          </form>
          <button className="machine-button new-question" type="button" onClick={reset}><span>NEW<br/>QUESTION</span></button>
          <nav className="categories" aria-label="Other sections">
            {['HOROSCOPE', 'ROMANCE', 'CAREER'].map(label => <button className="machine-button category-button" type="button" disabled key={label}>{label}</button>)}
          </nav>
          <div className="indicator" aria-hidden="true" data-indicator={indicator ?? 'off'}>
            {phase === 'running' && indicatorBallsAt(time, path).map(ball => <span key={ball.key} className={`indicator-ball indicator-ball--${ball.outcome}`} style={{ left: `${ball.x / 384 * 100}%`, top: `${ball.y / 165 * 100}%`, transform: `rotate(${ball.tilt}deg)` }}><span>{ball.outcome.toUpperCase()}</span></span>)}
          </div>
        </section>
      </div>
    </div>
    <div className="outside-controls">
      {review && <div className="review-controls" aria-label="Reference comparison">
        <span>REFERENCE</span>
        <button type="button" aria-pressed={phase === 'idle'} onClick={() => reviewScreen('idle')}>START</button>
        {(['yes','no'] as const).map(branch => <button key={branch} type="button" aria-pressed={phase === 'result' && outcome === branch} onClick={() => reviewScreen(branch)}>{branch.toUpperCase()}</button>)}
        {(['yes','no'] as const).map(branch => <button key={branch} type="button" onClick={() => reviewScreen(branch, true)}>PLAY {branch.toUpperCase()}</button>)}
        <button type="button" disabled={phase === 'idle' || phase === 'preparing'} onClick={() => playing ? decision.pause() : decision.play(outcome)}>{playing ? 'PAUSE' : 'RESUME'}</button>
        <label className="review-time">TIME <input aria-label="Animation time" type="range" min="0" max={DURATION} step="any" value={time} onChange={event => decision.seek(outcome, Number(event.target.value))}/></label>
        <output className="review-timecode" role="timer" aria-live="off">{time.toFixed(2)}s · {phase === 'idle' || phase === 'preparing' ? phase : phaseAt(time, path)}</output>
        <label>SPEED <select aria-label="Playback speed" value={rate} onChange={event => { decision.pause(); setRate(Number(event.target.value)); }}><option value="1">1×</option><option value="0.5">½×</option><option value="0.25">¼×</option></select></label>
        <label>VIEW <select aria-label="Review camera" value={view} onChange={event => setView(event.target.value as ReviewView)}><option value="film">FILM</option><option value="top">TOP</option><option value="side">SIDE</option><option value="mouth">INLET</option></select></label>
        <label><input type="checkbox" checked={opaque} onChange={event => setOpaque(event.target.checked)}/>OPAQUE TUBE</label>
        <label>ROUTE <select aria-label="Camera scenario" value={reviewScenario} onChange={event => {
          const next = event.target.value as Scenario | 'film';
          setReviewScenario(next);
          if (phase === 'running' || phase === 'result') decision.seek(outcome, time, next === 'film' ? filmScenario(outcome) : next);
        }}><option value="film">FILM PAIR</option><option value="left">LEFT</option><option value="right">RIGHT</option></select></label>
      </div>}
      <button className="frame-toggle" type="button" aria-pressed={cinema} onClick={() => setCinema(!cinema)}>BROWSER FRAME <span>{cinema ? 'ON' : 'OFF'}</span></button>
      <button className="frame-toggle" type="button" aria-pressed={sound.enabled} onClick={() => void sound.toggle()}>SOUND <span>{sound.enabled ? 'ON' : 'OFF'}</span></button>
      {sound.error && <span className="sound-error" role="alert">{sound.error}</span>}
      {phase === 'running' && !review && <div className="playback-controls" aria-label="Animation controls">
        <button type="button" className="frame-toggle" onClick={() => playing ? decision.pause() : decision.play(outcome)}>{playing ? 'PAUSE' : 'RESUME'}</button>
        <button type="button" className="frame-toggle" onClick={decision.finish}>SHOW ANSWER</button>
      </div>}
      <div className="random-controls">
        <label>RANDOM <select aria-label="Random source" value={randomMode} disabled={busy} onChange={event => { setRandomMode(event.target.value as RandomMode); decision.reset(); }}><option value="local">LOCAL</option><option value="external">RANDOM.ORG</option></select></label>
        {randomMode === 'external' && <small>Your question stays in this tab.</small>}
        {phase === 'preparing' && <span aria-live="polite">Requesting random numbers… NEW QUESTION cancels.</span>}
        {decision.error && <span role="alert">{decision.error}</span>}
      </div>
    </div>
  </main>;
}
