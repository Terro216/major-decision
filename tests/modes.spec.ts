import { test, expect, type Page } from '@playwright/test';
import { createFreestyle } from '../src/animation/freestyle';
import { webglCapture } from './webglCapture';

test('answer reveal and reverse seek need no new shader programs after scene preparation', async ({ page }) => {
  test.setTimeout(180_000);
  await page.addInitScript(() => {
    (window as any).shaderWork = { linkProgram: 0, getProgramInfoLog: 0, getShaderInfoLog: 0 };
    for (const name of ['linkProgram', 'getProgramInfoLog', 'getShaderInfoLog'] as const) {
      const original = WebGL2RenderingContext.prototype[name];
      (WebGL2RenderingContext.prototype as any)[name] = function (...args: any[]) {
        (window as any).shaderWork[name]++;
        return (original as any).apply(this, args);
      };
    }
  });
  for (const outcome of ['yes', 'no']) {
    if (outcome === 'no') await page.addInitScript(() => {
      const extension = WebGL2RenderingContext.prototype.getExtension;
      WebGL2RenderingContext.prototype.getExtension = function (name: string) {
        return name === 'EXT_color_buffer_float' ? null : extension.call(this, name);
      };
    });
    await page.goto(`/?review=1&outcome=${outcome}&scenario=film&t=0`);
    await expect(page.locator('.decision-stage')).toHaveAttribute('data-renderer', 'webgl');
    const initial = await page.evaluate(() => (window as any).shaderWork);
    expect(initial.linkProgram).toBeGreaterThan(0);
    for (const time of ['4.5', '5.8', '6.2', '6.5', '6.9', '4.5', '6.3']) {
      await page.getByRole('slider', { name: 'Animation time' }).fill(time);
      await expect(page.locator('.decision-stage')).toHaveAttribute('data-time', Number(time).toFixed(3));
      expect(await page.evaluate(() => (window as any).shaderWork), `${outcome} at ${time}`).toEqual(initial);
    }
  }
});

async function choose(page: Page, route: number, answer: number, seed = 60) {
  await page.addInitScript(({ route, answer, seed }) => {
    const original = crypto.getRandomValues.bind(crypto);
    (window as any).modeDraws = { route: 0, seed: 0, answer: 0 };
    crypto.getRandomValues = ((array: Uint32Array | Uint8Array) => {
      const draws = (window as any).modeDraws;
      if (array instanceof Uint8Array && array.length === 1) { draws.answer++; array[0] = answer; return array; }
      if (array instanceof Uint32Array && array.length === 1) {
        if (draws.route === draws.seed) { draws.route++; array[0] = route; }
        else { draws.seed++; array[0] = seed + draws.seed - 1; }
        return array;
      }
      return original(array);
    }) as typeof crypto.getRandomValues;
  }, { route, answer, seed });
}

for (const route of [0, 1]) for (const answer of [0, 1]) {
  test(`freestyle mode: route ${route}, answer ${answer}, one seed and same-answer fallback`, async ({ page }) => {
    await choose(page, route, answer);
    await page.clock.install();
    await page.goto('/');
    await page.getByRole('button', { name: 'Freestyle', exact: true }).click();
    await page.getByRole('textbox').fill('Проверка свободного маршрута');
    await page.getByRole('button', { name: 'Ask the question' }).click();
    const stage = page.locator('.decision-stage');
    await expect(stage).toHaveAttribute('data-mode', 'freestyle');
    await expect(stage).toHaveAttribute('data-seed', '60');
    await expect(stage).toHaveAttribute('data-scenario', route ? 'right' : 'left');
    await expect(stage).toHaveAttribute('data-outcome', answer ? 'yes' : 'no');
    await page.locator('form').evaluate(form => { for (let i = 0; i < 4; i++) (form as HTMLFormElement).requestSubmit(); });
    await page.locator('canvas').evaluate(canvas => (canvas as HTMLCanvasElement).getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext());
    await expect(stage).toHaveAttribute('data-renderer', 'fallback');
    await expect(page.getByRole('status')).toHaveText(answer ? 'YES' : 'NO');
    expect(await page.evaluate(() => (window as any).modeDraws)).toEqual({ route: 1, seed: 1, answer: 1 });
    expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
  });
}

test('mode changes cancel playback and preserve the question; a new freestyle run draws a fresh seed', async ({ page }) => {
  await choose(page, 0, 1);
  await page.clock.install();
  await page.goto('/');
  const question = page.getByRole('textbox');
  await question.fill('Оставить этот вопрос?');
  await page.getByRole('button', { name: 'Freestyle', exact: true }).click();
  await page.getByRole('button', { name: 'Ask the question' }).click();
  await page.clock.runFor(32);
  await page.clock.fastForward(1500);
  await page.getByRole('button', { name: 'Movie', exact: true }).click();
  await expect(page.locator('.decision-stage')).toHaveAttribute('data-phase', 'idle');
  await expect(question).toHaveValue('Оставить этот вопрос?');
  await expect(page.locator('canvas')).toHaveCount(0);
  await page.clock.fastForward(20_000);
  await expect(page.getByRole('status')).toHaveCount(0);
  await page.getByRole('button', { name: 'Freestyle', exact: true }).click();
  await page.getByRole('button', { name: 'Ask the question' }).click();
  await expect(page.locator('.decision-stage')).toHaveAttribute('data-seed', '61');
  expect(await page.evaluate(() => (window as any).modeDraws)).toEqual({ route: 2, seed: 2, answer: 2 });
  await page.clock.runFor(32); await page.clock.fastForward(20_000);
  await expect(page.getByRole('status')).toHaveText('YES');
});

test('freestyle real playback completes with a single answer and synchronized duration', async ({ page }) => {
  await choose(page, 0, 1);
  await page.goto('/');
  await page.getByRole('button', { name: 'Freestyle', exact: true }).click();
  await page.getByRole('textbox').fill('Настоящий запуск');
  const start = Date.now();
  await page.getByRole('button', { name: 'Ask the question' }).click();
  await expect(page.getByRole('status')).toHaveText('YES', { timeout: 35_000 });
  const duration = createFreestyle(60, 'left').duration;
  expect(Date.now() - start).toBeGreaterThan(duration * 1000 - 100);
  await expect(page.locator('.decision-stage')).toHaveAttribute('data-time', duration.toFixed(3));
  expect(await page.evaluate(() => (window as any).modeDraws)).toEqual({ route: 1, seed: 1, answer: 1 });
});

test('freestyle coil and flight look identical for both answers, with deterministic backward seek', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 800, height: 1000 });
  const capture = await webglCapture(page);
  const run = createFreestyle(60, 'left');
  const times = [run.events.entry + .8, run.events.exit + .6];
  const first: Buffer[] = [];
  for (const answer of ['yes', 'no']) {
    await page.goto(`/?review=1&mode=freestyle&seed=60&scenario=left&outcome=${answer}&t=0`);
    for (const [i, time] of times.entries()) {
      await page.getByRole('slider', { name: 'Animation time' }).fill(Number(time.toFixed(10)).toString());
      const frame = await capture();
      if (answer === 'yes') first.push(frame);
      else expect(frame.equals(first[i]), `answer leaked at ${time}`).toBe(true);
      await page.getByRole('slider', { name: 'Animation time' }).fill('1');
      await page.getByRole('slider', { name: 'Animation time' }).fill(Number(time.toFixed(10)).toString());
      expect((await capture()).equals(frame)).toBe(true);
    }
  }
});

test('crisp full case and mode controls remain usable on desktop and phone', async ({ page }) => {
  for (const [width, height] of [[1365, 900], [390, 844], [320, 568]]) {
    await page.setViewportSize({ width, height }); await page.goto('/');
    expect(await page.locator('.machine').evaluate(el => getComputedStyle(el).filter)).toBe('none');
    expect(await page.getByRole('textbox').evaluate(el => getComputedStyle(el).filter)).toBe('none');
    for (const name of ['Movie', 'Freestyle']) {
      const box = (await page.getByRole('button', { name, exact: true }).boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44); expect(box.width).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    if (width > 700) {
      const bottom = await page.locator('.frame-art').evaluate(svg => {
        const ellipse = svg.querySelector('ellipse[cx="233"][cy="843"]')!;
        return Number(ellipse.getAttribute('cy')) + Number(ellipse.getAttribute('ry')) + Number(ellipse.getAttribute('stroke-width')) / 2;
      });
      const height = await page.locator('.frame-art').evaluate(svg => (svg as SVGSVGElement).viewBox.baseVal.height);
      expect(bottom).toBeLessThan(height);
    }
  }
});
