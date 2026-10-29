import { test, expect, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { decisionNotes, scheduleNote } from '../src/audio/DecisionAudio';

const artifact = process.env.MD_REVIEW_DIR || '.review';

async function observeAudio(page: Page) {
  await page.addInitScript(() => {
    const RealAudioContext = window.AudioContext;
    (window as any).audioContexts = [];
    window.AudioContext = class extends RealAudioContext {
      constructor(options?: AudioContextOptions) { super(options); (window as any).audioContexts.push(this); }
    };
  });
}

test('sound is opt-in; real audio unlocks on a gesture and mute suspends it', async ({ page }) => {
  await observeAudio(page);
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/');
  const toggle = page.getByRole('button',{name:/^SOUND/});
  await expect(toggle).toHaveAttribute('aria-pressed','false');
  await page.getByRole('textbox').fill('Silent by default?');
  await page.getByRole('button',{name:'Ask the question'}).click();
  await expect(page.getByRole('status')).toBeVisible();
  expect(await page.evaluate(()=>(window as any).audioContexts.length)).toBe(0);
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed','true');
  expect(await page.evaluate(()=>(window as any).audioContexts.map((c:AudioContext)=>c.state))).toEqual(['running']);
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed','false');
  await expect.poll(()=>page.evaluate(()=>(window as any).audioContexts[0].state)).toBe('suspended');
  await page.reload();
  await expect(toggle).toHaveAttribute('aria-pressed','false');
  expect(await page.evaluate(()=>(window as any).audioContexts.length)).toBe(0);
});

test('sound pauses in the background, cancels scheduled notes on reset and reuses one context', async ({ page }) => {
  await observeAudio(page);
  await page.addInitScript(() => {
    (window as any).testHidden = false; (window as any).voices = [];
    Object.defineProperty(document,'hidden',{get:()=>(window as any).testHidden});
    const create = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function() {
      const oscillator = create.call(this), record={start:-1,stops:[] as number[]};
      const start=oscillator.start.bind(oscillator), stop=oscillator.stop.bind(oscillator);
      oscillator.start = (time=0) => { record.start=time; start(time); };
      oscillator.stop = (time=0) => { record.stops.push(time); stop(time); };
      (window as any).voices.push(record);
      return oscillator;
    };
  });
  await page.goto('/');
  await page.getByRole('button',{name:/^SOUND/}).click();
  await page.getByRole('textbox').fill('Stop the sound too?');
  await page.getByRole('button',{name:'Ask the question'}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).voices.length)).toBeGreaterThan(8);
  await page.evaluate(()=>{(window as any).testHidden=true; document.dispatchEvent(new Event('visibilitychange'));});
  await expect.poll(()=>page.evaluate(()=>(window as any).audioContexts[0].state)).toBe('suspended');
  const voices = await page.evaluate(()=>(window as any).voices);
  expect(voices.every((voice:any)=>voice.stops.length>=2)).toBe(true);
  await page.getByRole('button',{name:'NEW QUESTION'}).click();
  await page.evaluate(()=>{(window as any).testHidden=false; document.dispatchEvent(new Event('visibilitychange'));});
  await expect.poll(()=>page.evaluate(()=>(window as any).audioContexts[0].state)).toBe('running');
  expect(await page.evaluate(()=>(window as any).voices.length)).toBe(voices.length);
  await page.getByRole('textbox').fill('Again?');
  await page.getByRole('button',{name:'Ask the question'}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).voices.length)).toBeGreaterThan(voices.length);
  await page.getByRole('button',{name:'NEW QUESTION'}).click();
  const reset = await page.evaluate(()=>({now:(window as any).audioContexts[0].currentTime,voices:(window as any).voices}));
  expect(reset.voices.every((voice:any)=>voice.stops.at(-1)<=reset.now+.03)).toBe(true);
  expect(await page.evaluate(()=>(window as any).audioContexts.length)).toBe(1);
});

test('audio failure leaves the selected answer and reset usable', async ({ page }) => {
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.addInitScript(()=>{ window.AudioContext=class { constructor(){throw new Error('Audio unavailable');} } as any; });
  await page.goto('/');
  await page.getByRole('button',{name:/^SOUND/}).click();
  await expect(page.getByRole('alert')).toContainText('Audio is unavailable');
  await page.getByRole('textbox').fill('Continue silently?');
  await page.getByRole('button',{name:'Ask the question'}).click();
  await expect(page.getByRole('status')).toHaveText(/YES|NO/);
  await page.getByRole('button',{name:'NEW QUESTION'}).click();
  await expect(page.getByRole('textbox')).toBeFocused();
});

test('an audio device that never opens reports a retryable error',async({page})=>{
  await page.clock.install({time:new Date('2026-10-21T00:00:00Z')});
  await page.addInitScript(()=>{
    const Original=AudioContext;
    window.AudioContext=class extends Original {resume(){return new Promise<void>(()=>{});}};
  });
  await page.goto('/');
  await page.clock.pauseAt(new Date('2026-10-21T01:00:00Z'));
  await page.getByRole('button',{name:/^SOUND/}).click();
  await page.clock.fastForward(4001);
  await expect(page.getByRole('alert')).toContainText('Audio is unavailable');
  await expect(page.getByRole('button',{name:/^SOUND/})).toHaveAttribute('aria-pressed','false');
  await expect(page.locator('.decision-stage')).toHaveAttribute('data-phase','idle');
});

test('original audio renders complete YES and NO scores without clipping', async ({ page }) => {
  await page.goto('/');
  await mkdir(path.join(artifact,'audio'),{recursive:true});
  const report=[];
  for (const [scenario,outcome] of [['left','yes'],['right','no']] as const) {
    const notes=decisionNotes(scenario,outcome);
    const samples = await page.evaluate(async ({notes,source})=>{
      // Execute the exact score/envelope implementation in a real browser DSP.
      const schedule=(0,eval)(`(${source})`);
      const context=new OfflineAudioContext(1,48_000*7.4,48_000);
      const master=context.createGain(); master.gain.value=.18; master.connect(context.destination);
      for(const note of notes) schedule(context,master,note,note.time);
      return Array.from((await context.startRendering()).getChannelData(0));
    },{notes,source:scheduleNote.toString()});
    const peak=samples.reduce((maximum,value)=>Math.max(maximum,Math.abs(value)),0);
    const rms=Math.sqrt(samples.reduce((total,value)=>total+value*value,0)/samples.length);
    expect(peak).toBeGreaterThan(.02); expect(peak).toBeLessThan(.25);
    expect(rms).toBeGreaterThan(.002);
    expect(samples.slice(-4800).every(value=>Math.abs(value)<.00001)).toBe(true);
    const wav=Buffer.alloc(44+samples.length*2);
    wav.write('RIFF'); wav.writeUInt32LE(wav.length-8,4); wav.write('WAVEfmt ',8); wav.writeUInt32LE(16,16); wav.writeUInt16LE(1,20); wav.writeUInt16LE(1,22); wav.writeUInt32LE(48000,24); wav.writeUInt32LE(96000,28); wav.writeUInt16LE(2,32); wav.writeUInt16LE(16,34); wav.write('data',36); wav.writeUInt32LE(samples.length*2,40);
    samples.forEach((value,i)=>wav.writeInt16LE(Math.round(value*32767),44+i*2));
    await writeFile(path.join(artifact,`audio/${outcome}.wav`),wav);
    report.push({scenario,outcome,duration:samples.length/48000,peak,rms,notes:notes.length});
  }
  await writeFile(path.join(artifact,'audio/report.json'),JSON.stringify(report,null,2));
});
