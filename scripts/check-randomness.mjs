// Actual CORS/API smoke and all four encoded camera/result combinations.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const root = '/artifacts/randomness';
const build = JSON.parse(readFileSync('/artifacts/check-result.json')).indexSha256;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const context = await browser.newContext({ viewport: { width: 800, height: 900 } });
  const page = await context.newPage();
  const requests = [], responses = [];
  page.on('request', request => {
    if (request.url().startsWith('https://www.random.org/')) {
      const headers = request.headers();
      requests.push({ url: request.url(), method: request.method(), body: request.postData(), referer: headers.referer ?? null, cookie: headers.cookie ?? null });
    }
  });
  page.on('response', response => {
    if (response.url().startsWith('https://www.random.org/')) responses.push({ url: response.url(), status: response.status(), cors: response.headers()['access-control-allow-origin'] });
  });
  await page.goto('http://127.0.0.1:4175/');
  await page.getByLabel('Random source').selectOption('external');
  await page.getByRole('textbox').fill('Private browser smoke question');
  const start = Date.now();
  await page.getByRole('button', { name: 'Ask the question' }).click();
  await page.waitForFunction(() => ['running','result'].includes(document.querySelector('.decision-stage').dataset.phase) || document.querySelector('[role=alert]'), null, { timeout: 130_000 });
  const errorCount = await page.getByRole('alert').count();
  assert.equal(errorCount, 0, errorCount ? await page.getByRole('alert').textContent() : 'API failed');
  await page.getByRole('status').waitFor({ timeout: 30_000 });
  const outcome = await page.getByRole('status').textContent();
  assert(['YES','NO'].includes(outcome));
  assert.equal(requests.length, 2);
  assert(requests.every(r => !r.body && !r.referer && !r.cookie && !r.url.includes('Private')));
  assert(responses.every(r => r.status === 200 && r.cors === '*'));
  assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
  const api = { checkedAt: new Date().toISOString(), build, outcome, seconds: (Date.now() - start) / 1000, requests, responses, questionInRequest: false, cookiesOrReferer: false };
  writeFileSync(`${root}/live-api.json`, JSON.stringify(api, null, 2));
  await page.screenshot({ path: `${root}/external-result.png`, fullPage: true });
  await context.close();

  const mediaContext = await browser.newContext({ viewport: { width: 1280, height: 1000 }, offline: true });
  const media = await mediaContext.newPage();
  await media.goto('file:///repo/docs/camera-scenarios.html');
  await media.waitForFunction(() => [...document.querySelectorAll('video')].every(v => v.readyState >= 2 && !v.error));
  await media.locator('#play').click();
  await media.waitForFunction(() => [...document.querySelectorAll('video')].every(v => v.currentTime > .25 && !v.paused));
  await media.locator('#pause').click();
  const seeks = [];
  for (const time of [4.4, 6.8, 1.35]) {
    await media.locator('#time').fill(String(time));
    await media.waitForFunction(() => [...document.querySelectorAll('video')].every(v => !v.seeking && v.readyState >= 2));
    const states = await media.locator('video').evaluateAll(nodes => nodes.map(v => ({ id: v.id, time: v.currentTime, paused: v.paused, error: v.error?.code ?? null, duration: v.duration, width: v.videoWidth })));
    assert.equal(states.length, 4);
    assert(states.every(v => v.paused && !v.error && Math.abs(v.time-time)<.03 && v.duration>6.9 && v.width>=1240));
    seeks.push(states);
  }
  await media.locator('#speed').selectOption('.25');
  await media.locator('video').evaluateAll(nodes => Promise.all(nodes.map(v => v.play())));
  await media.waitForFunction(() => [...document.querySelectorAll('video')].every(v => v.currentTime > 1.5 && !v.paused && v.playbackRate === .25));
  await media.locator('#pause').click();
  const hashes = Object.fromEntries(['yes','no','left-no','right-yes'].map(key => {
    const name=`after-${key}.mp4`;
    return [name, createHash('sha256').update(readFileSync(`/repo/references/review/2026-10-20-motion/${name}`)).digest('hex')];
  }));
  writeFileSync(`${root}/playback-check.json`, JSON.stringify({ checkedAt: new Date().toISOString(), build, seeks, quarterSpeedPlayed: true, hashes }, null, 2));
  await mediaContext.close();
  console.log('Live RANDOM.ORG CORS request and all four camera/result videos verified.');
} finally { await browser.close(); }
