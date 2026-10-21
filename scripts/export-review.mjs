// Deterministic animation export. This is a timeline render, not a live FPS test.
import { chromium } from '@playwright/test';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
const root = process.env.MD_REVIEW_DIR || '.review';
const preview = process.env.MD_PREVIEW_URL || 'http://127.0.0.1:4175';
const cross = process.argv.includes('--cross');
const output = cross ? path.join(root, 'randomness') : root;
const fps = 24;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const checked = JSON.parse(await readFile(process.env.MD_BUILD_REPORT || path.join(root, 'check-result.json'), 'utf8'));
  const html = await fetch(preview).then(response => { if (!response.ok) throw new Error(`Preview HTTP ${response.status}`); return response.text(); });
  if (createHash('sha256').update(html).digest('hex') !== checked.indexSha256) throw new Error('Preview does not match the recorded build.');
  const index = { fps, duration: 6.9, build: checked.indexSha256, exporterSha256: createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex'), outcomes: {}, slowPlayback: {} };
  const runs = cross ? [{ outcome: 'no', scenario: 'left', key: 'left-no' }, { outcome: 'yes', scenario: 'right', key: 'right-yes' }] : ['yes', 'no'].map(outcome => ({ outcome, scenario: 'film', key: outcome }));
  for (const { outcome, scenario, key } of runs) {
    const directory = path.join(output, 'export', key);
    await mkdir(directory, { recursive: true });
    const page = await browser.newPage({ viewport: { width: 800, height: 1000 } });
    if (!index.mediaCapabilities) {
      index.mediaCapabilities = await page.evaluate(() => {
        const video = document.createElement('video');
        return { h264: video.canPlayType('video/mp4; codecs="avc1.42E01E"'), vp9: video.canPlayType('video/webm; codecs="vp9"') };
      });
      console.log('Browser video codecs: ' + JSON.stringify(index.mediaCapabilities));
    }
    await page.goto(`${preview}/?review=1&outcome=${outcome}&scenario=${scenario}&t=0`);
    await page.getByRole('button', { name: /BROWSER FRAME/ }).click();
    await page.waitForFunction(() => document.querySelector('.decision-stage')?.dataset.renderer === 'webgl');
    await page.evaluate(() => document.fonts.ready);
    const crop = await page.locator('.machine').boundingBox();
    const frames = [];
    const count = Math.ceil(6.9 * fps) + 1;
    for (let i = 0; i < count; i++) {
      const time = Math.min(i / fps, 6.9);
      // Preserve i/24 within 0.5 ps while using Chromium's range serialization.
      await page.getByRole('slider', { name: 'Animation time' }).evaluate((slider, value) => {
        // Use the native setter and the actual React input handler, but never
        // scroll/focus a control between captures of the scaled machine.
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(slider, value);
        slider.dispatchEvent(new Event('input', { bubbles: true }));
      }, String(Number(time.toFixed(12))));
      await page.waitForFunction(expected => Math.abs(Number(document.querySelector('.decision-stage').dataset.time) - expected) < .00051, time);
      const bounds = await page.locator('.machine').boundingBox();
      if (Object.keys(crop).some(k => Math.abs(bounds[k] - crop[k]) > .01)) throw new Error(`Machine bounds changed at frame ${i}`);
      const scroll = await page.evaluate(() => [...document.querySelectorAll('.terminal-surface,.machine,.viewport')].map(el => [el.scrollLeft, el.scrollTop]));
      if (scroll.flat().some(value => value !== 0)) throw new Error(`Scrolled machine at frame ${i}: ${JSON.stringify(scroll)}`);
      const filename = `frame-${String(i).padStart(3, '0')}.png`;
      await page.screenshot({ clip: crop, path: path.join(directory, filename) });
      const renderedTime = Number(await page.locator('.decision-stage').getAttribute('data-time'));
      if (Math.abs(renderedTime - time) > .00051) throw new Error(`Frame ${i}: requested ${time}, rendered ${renderedTime}`);
      frames.push({ file: filename, time, displayedTime: renderedTime, bounds, scroll });
      if (i % fps === 0) console.log(`${key.toUpperCase()}: ${i + 1}/${count} timeline frames`);
    }
    index.outcomes[key] = frames;
    await page.close();
  }
  // Also exercise ordinary wall-clock playback at quarter speed. This raw
  // software screencast is diagnostic; the fixed-time export above is the
  // review source and does not make a claim about a user's GPU frame rate.
  await writeFile(path.join(output, 'export', 'index.json'), JSON.stringify(index, null, 2));
  for (const outcome of cross || process.argv.includes('--timeline-only') ? [] : ['yes', 'no']) {
    const context = await browser.newContext({ viewport: { width: 800, height: 700 }, recordVideo: { dir: path.join(root, 'recordings'), size: { width: 800, height: 700 } } });
    const page = await context.newPage(), video = page.video();
    await page.goto(`${preview}/?review=1&outcome=${outcome}&t=0`);
    await page.getByRole('button', { name: /BROWSER FRAME/ }).click();
    await page.waitForFunction(() => document.querySelector('.decision-stage')?.dataset.renderer === 'webgl');
    for (const time of ['4.45','5.8','6.9','0']) await page.getByRole('slider', { name: 'Animation time' }).fill(time);
    await page.getByLabel('Playback speed').selectOption('0.25');
    await page.evaluate(() => {
      window.motionSamples = [];
      new MutationObserver(() => {
        const stage = document.querySelector('.decision-stage');
        window.motionSamples.push({ time: Number(stage.dataset.time), shot: stage.dataset.shot, wall: performance.now() });
      }).observe(document.querySelector('.decision-stage'), { attributes: true, attributeFilter: ['data-time'] });
    });
    const start = Date.now();
    await page.getByRole('button', { name: 'RESUME', exact: true }).evaluate(button => button.click());
    await page.waitForFunction(() => document.querySelector('.decision-stage')?.dataset.phase === 'result', { }, { timeout: 90_000 });
    await page.locator('.scene-canvas').evaluate(canvas => canvas.getContext('webgl2').finish());
    const samples = await page.evaluate(() => window.motionSamples);
    index.slowPlayback[outcome] = { rate: .25, wallSeconds: (Date.now() - start) / 1000, samples };
    await context.close();
    await video.saveAs(path.join(root, `playback-${outcome}-slow-raw.webm`));
    console.log(`${outcome.toUpperCase()}: quarter-speed live playback reached ${samples.at(-1)?.time}s (${samples.length} observed time updates)`);
  }
  await writeFile(path.join(output, 'export', 'index.json'), JSON.stringify(index, null, 2));
  console.log('Exported both complete timelines at 24 fps. This does not measure live GPU performance.');
} finally { await browser.close(); }
