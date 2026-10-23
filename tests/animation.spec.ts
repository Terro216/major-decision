import { test, expect, type Page } from '@playwright/test';
import { webglCapture } from './webglCapture';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { reviewFrames } from '../src/animation/reviewFrames';

async function fixedRandom(page: Page, bit: number) {
  await page.addInitScript(value => {
    const original = crypto.getRandomValues.bind(crypto);
    (window as any).decisionDraws = 0;
    crypto.getRandomValues = ((array: Uint8Array) => {
      if (array instanceof Uint8Array && array.length === 1) {
        (window as any).decisionDraws++;
        array[0] = value;
        return array;
      }
      return original(array);
    }) as typeof crypto.getRandomValues;
  }, bit);
}

for (const [outcome, bit] of [['yes', 1], ['no', 0]] as const) {
  test(`real ${outcome.toUpperCase()} journey keeps one outcome and reaches its result`, async ({ page }) => {
    await fixedRandom(page, bit);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/');
    await page.getByRole('textbox').fill('Выбрать этот путь?');
    await page.getByRole('button', { name: 'Ask the question' }).click();
    const stage = page.locator('.decision-stage');
    await expect(stage).toHaveAttribute('data-phase', 'running');
    await expect(stage).toHaveAttribute('data-renderer', 'webgl');
    await expect(page.getByRole('button', { name: 'Ask the question' })).toBeDisabled();
    await expect(page.getByRole('textbox')).toHaveAttribute('readonly', '');
    // Directly submit too: the state guard must work beyond a disabled button.
    await page.locator('form').evaluate(form => { for (let i = 0; i < 4; i++) (form as HTMLFormElement).requestSubmit(); });
    await expect(stage).toHaveAttribute('data-outcome', outcome);
    await expect(page.getByRole('status')).toHaveText(outcome.toUpperCase(), { timeout: 15_000 });
    expect(await page.evaluate(() => (window as any).decisionDraws)).toBe(1);
    expect(errors).toEqual([]);
  });
}

test('reset cancels an active run and a later run draws a fresh single result', async ({ page }) => {
  await fixedRandom(page, 0);
  await page.clock.install();
  await page.goto('/');
  await page.getByRole('textbox').fill('Первый вопрос');
  await page.getByRole('button', { name: 'Ask the question' }).click();
  await page.clock.runFor(32);
  await page.clock.fastForward(800);
  expect(Number(await page.locator('.decision-stage').getAttribute('data-time'))).toBeGreaterThan(.7);
  await page.getByRole('button', { name: 'NEW QUESTION' }).click();
  await expect(page.getByRole('textbox')).toBeFocused();
  await expect(page.locator('.decision-stage')).toHaveAttribute('data-phase', 'idle');
  await expect(page.locator('canvas')).toHaveCount(0);
  await page.clock.fastForward(8000);
  await expect(page.getByRole('status')).toHaveCount(0);
  await page.getByRole('textbox').fill('Второй вопрос');
  await page.getByRole('textbox').press('Enter');
  await page.clock.runFor(32);
  await page.clock.fastForward(7000);
  await expect(page.getByRole('status')).toHaveText('NO');
  expect(await page.evaluate(() => (window as any).decisionDraws)).toBe(2);
});

test('review seek restores the same rendered frame and dial after seeking backwards', async ({ page }) => {
  await page.setViewportSize({width:800,height:1000});
  const capture=await webglCapture(page);
  await page.goto('/?review=1&outcome=yes&t=4.45');
  await expect(page.locator('.decision-stage')).toHaveAttribute('data-renderer', 'webgl');
  await expect(page.locator('.indicator')).toHaveAttribute('data-indicator', 'no');
  await page.evaluate(() => document.fonts.ready);
  const before = await capture();
  await page.getByRole('slider', { name: 'Animation time' }).fill('5.95');
  await page.getByRole('slider', { name: 'Animation time' }).fill('4.45');
  const after = await capture();
  const artifacts = process.env.MD_REVIEW_DIR || '.review';
  await writeFile(path.join(artifacts, 'seek-first.png'), before);
  await writeFile(path.join(artifacts, 'seek-return.png'), after);
  expect(after.equals(before)).toBe(true);
  await expect(page.locator('.indicator')).toHaveAttribute('data-indicator', 'no');
});

test('forced branch and time stay private to review mode; IME Enter does not launch', async ({ page }) => {
  await fixedRandom(page, 1);
  await page.goto('/?outcome=no&t=6.9');
  await expect(page.locator('.review-controls')).toHaveCount(0);
  const question = page.getByRole('textbox');
  await question.fill('Вопрос');
  await question.evaluate(el => el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, isComposing: true })));
  await expect(page.locator('.decision-stage')).toHaveAttribute('data-phase', 'idle');
  expect(await page.evaluate(() => (window as any).decisionDraws)).toBe(0);
});

test('losing WebGL preserves the chosen result and leaves reset usable', async ({ page }) => {
  await fixedRandom(page, 0);
  await page.goto('/');
  await page.getByRole('textbox').fill('A fallback question?');
  await page.getByRole('button', { name: 'Ask the question' }).click();
  await expect(page.locator('.decision-stage')).toHaveAttribute('data-renderer', 'webgl');
  await page.locator('canvas').evaluate(canvas => {
    const gl = (canvas as HTMLCanvasElement).getContext('webgl2');
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  });
  await expect(page.locator('.decision-stage')).toHaveAttribute('data-renderer', 'fallback');
  await expect(page.getByRole('status')).toHaveText('NO');
  await page.getByRole('button', { name: 'NEW QUESTION' }).click();
  await expect(page.getByRole('textbox')).toHaveValue('');
  await expect(page.locator('.decision-stage')).toHaveAttribute('data-phase', 'idle');
});

// At the reference resolution SwiftShader takes 16–18 seconds per image on
// the two-CPU runner. Keep all 33 observations, with one bounded test per clip.
for (const outcome of ['yes', 'no'] as const) {
test(`capture ${outcome.toUpperCase()} film timeline at all supplied animation frames`, async ({ page }) => {
  test.setTimeout(480_000);
  const artifacts = process.env.MD_REVIEW_DIR || '.review';
  await mkdir(path.join(artifacts, 'frames'), { recursive: true });
  await page.setViewportSize({ width: 1680, height: 1250 });
  const index: { outcome: string; time: number; film: string; app: string }[] = [];
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  // Shader compile/link failures use console.error rather than pageerror.
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/?review=1');
  await page.evaluate(() => document.fonts.ready);
  const machineBox = (await page.locator('.machine').boundingBox())!;
  if (outcome === 'yes') await page.screenshot({ clip: machineBox, path: path.join(artifacts, 'machine-start.png') });
  await page.getByRole('button', { name: outcome.toUpperCase(), exact: true }).click();
  await expect(page.locator('.decision-stage')).toHaveAttribute('data-renderer', 'webgl');
  await page.screenshot({ clip: machineBox, path: path.join(artifacts, `machine-${outcome}.png`) });
  for (const [time, film] of reviewFrames[outcome]) {
    // Subtracting the film's frame-based offset leaves 17-digit tails.
    // Chromium canonicalizes range values, so fill rejects that text before
    // dispatching input. Keep sub-microsecond precision in the test value.
    await page.getByRole('slider', { name: 'Animation time' }).fill(String(Number(time.toFixed(6))));
    await expect(page.locator('.decision-stage')).toHaveAttribute('data-time', time.toFixed(3));
    const app = `frames/${outcome}-${time.toFixed(2)}.png`;
    await page.screenshot({ clip: machineBox, path: path.join(artifacts, app) });
    index.push({ outcome, time, film, app });
    if (index.length % 5 === 0) console.log(`Captured ${outcome.toUpperCase()} ${index.length}/${reviewFrames[outcome].length} reference moments`);
  }
  expect(errors).toEqual([]);
  const indexPath = path.join(artifacts, 'frames/index.json');
  const previous: typeof index = JSON.parse(await readFile(indexPath, 'utf8').catch(error => {
    if (error.code === 'ENOENT') return '[]';
    throw error;
  }));
  await writeFile(indexPath, JSON.stringify([...previous.filter(row => row.outcome !== outcome), ...index], null, 2));
});
}

for (const outcome of ['yes', 'no'] as const) {
  test(`record ${outcome.toUpperCase()} playback for video comparison`, async ({ browser }) => {
    test.setTimeout(120_000);
    const artifacts = process.env.MD_REVIEW_DIR || '.review';
    const context = await browser.newContext({ viewport: { width: 800, height: 650 }, recordVideo: { dir: path.join(artifacts, 'recordings'), size: { width: 800, height: 650 } } });
    const origin = Date.now();
    const page = await context.newPage();
    const video = page.video()!;
    await page.goto(`http://127.0.0.1:4173/?review=1&outcome=${outcome}&t=0`);
    await page.getByRole('button', { name: /BROWSER FRAME/ }).click();
    await expect(page.locator('.decision-stage')).toHaveAttribute('data-renderer', 'webgl');
    const crop = (await page.locator('.machine').boundingBox())!;
    const flushStage = () => page.locator('.scene-canvas').evaluate(canvas => {
      const gl = (canvas as HTMLCanvasElement).getContext('webgl2');
      if (!gl) throw new Error('Recording requires WebGL');
      gl.finish();
    });
    // Warm both material sets before the recording excerpt; the running clock is
    // still tested separately above, including first-use initialization.
    for (const time of ['4.45', '6.9', '0']) {
      await page.getByRole('slider', { name: 'Animation time' }).fill(time);
      // Flush without captureScreenshot: it changes screencast frame dimensions.
      await flushStage();
    }
    const start = (Date.now() - origin) / 1000;
    // Dispatch in place: actionability scrolling would enter the recorded crop.
    await page.getByRole('button', { name: `PLAY ${outcome.toUpperCase()}`, exact: true }).evaluate(button => (button as HTMLButtonElement).click());
    await expect(page.getByRole('status')).toHaveText(outcome.toUpperCase(), { timeout: 20_000 });
    // The DOM result can arrive before SwiftShader has finished its GPU queue.
    // Finish GPU work without disturbing the screencast viewport.
    await flushStage();
    await page.waitForTimeout(1500);
    const end = (Date.now() - origin) / 1000;
    await context.close();
    await video.saveAs(path.join(artifacts, `playback-${outcome}-raw.webm`));
    await writeFile(path.join(artifacts, `playback-${outcome}.json`), JSON.stringify({ start, end, crop }, null, 2));
  });
}

test('unavailable WebGL immediately presents the already selected answer', async ({ page }) => {
  await fixedRandom(page, 1);
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind: string, ...options: unknown[]) {
      if (kind === 'webgl2' || kind === 'webgl') return null;
      return original.apply(this, [kind, ...options] as any);
    } as typeof original;
  });
  await page.goto('/');
  await page.getByRole('textbox').fill('Continue without WebGL?');
  await page.getByRole('button', { name: 'Ask the question' }).click();
  await expect(page.locator('.decision-stage')).toHaveAttribute('data-renderer', 'fallback');
  await expect(page.getByRole('status')).toHaveText('YES');
  expect(await page.evaluate(() => (window as any).decisionDraws)).toBe(1);
  await page.getByRole('button', { name: 'NEW QUESTION' }).click();
  await expect(page.getByRole('textbox')).toBeFocused();
});


test('review frame boundaries survive native range input serialization', async ({ page }) => {
  await page.setViewportSize({width:800,height:1000});
  for(const outcome of ['yes','no'] as const) {
    await page.goto(`/?review=1&outcome=${outcome}&t=0`);
    const stage=page.locator('.decision-stage');
    await expect(stage).toHaveAttribute('data-renderer','webgl');
    const color=outcome==='yes'?175/30:176/30;
    const pulse=outcome==='yes'?128/30:130/30;
    const clear=outcome==='yes'?145/30:146/30;
    for(const [time,shot] of [[color-1e-6,'target'],[color,'target-color'],[pulse,'spiral-color'],[clear-1e-6,'spiral-color'],[clear,'exit']] as const) {
      await page.getByRole('slider',{name:'Animation time'}).evaluate((input,time)=>{
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,String(time));
        input.dispatchEvent(new Event('input',{bubbles:true}));
      },time);
      await expect(stage).toHaveAttribute('data-shot',shot);
    }
  }
});
