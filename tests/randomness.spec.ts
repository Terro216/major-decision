import { test, expect, type Page } from '@playwright/test';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { webglCapture } from './webglCapture';

async function draws(page: Page, route: number, answer: number, index = .99) {
  await page.addInitScript(({ route, answer, index }) => {
    const original = crypto.getRandomValues.bind(crypto);
    (window as any).draws = { route: 0, answer: 0 };
    crypto.getRandomValues = ((array: Uint8Array | Uint32Array) => {
      if (array.length === 1 && (array instanceof Uint8Array || array instanceof Uint32Array)) {
        const kind = array instanceof Uint8Array ? 'answer' : 'route';
        (window as any).draws[kind]++;
        array[0] = kind === 'answer' ? answer : route;
        return array;
      }
      return original(array);
    }) as typeof crypto.getRandomValues;
    Math.random = () => index;
  }, { route, answer, index });
}

async function external(page: Page) {
  await page.goto('/');
  await page.getByLabel('Random source').selectOption('external');
  await page.getByRole('textbox').fill('Личный вопрос private-entropy-123');
}

test('every independently drawn route can finish with either answer, including fallback', async ({ page }) => {
  test.setTimeout(120_000);
  for (const route of [0, 1]) for (const answer of [0, 1]) {
    await draws(page, route, answer);
    await page.goto('/?outcome=no&scenario=right&t=6.9');
    await expect(page.locator('.decision-stage')).toHaveAttribute('data-phase', 'idle');
    await page.getByRole('textbox').fill('Один вопрос');
    await page.getByRole('button', { name: 'Ask the question' }).click();
    const stage = page.locator('.decision-stage');
    await expect(stage).toHaveAttribute('data-scenario', route ? 'right' : 'left');
    await expect(stage).toHaveAttribute('data-outcome', answer ? 'yes' : 'no');
    await page.locator('form').evaluate(form => { for (let i = 0; i < 3; i++) (form as HTMLFormElement).requestSubmit(); });
    await page.locator('canvas').evaluate(canvas => (canvas as HTMLCanvasElement).getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext());
    await expect(stage).toHaveAttribute('data-renderer', 'fallback');
    await expect(page.getByRole('status')).toHaveText(answer ? 'YES' : 'NO');
    expect(await page.evaluate(() => (window as any).draws)).toEqual({ route: 1, answer: 1 });
    await page.getByRole('button', { name: 'NEW QUESTION' }).click();
    await expect(stage).toHaveAttribute('data-scenario', '');
  }
});

test('same route has identical camera matrices for both answers across the full journey', async ({ page }) => {
  test.setTimeout(240_000);
  const capture = await webglCapture(page);
  const folder = path.join(process.env.MD_REVIEW_DIR || '.review', 'randomness');
  await mkdir(folder, { recursive: true });
  const times = [0,.4,.7,.95,1.4,1.9,2.4,2.9,3.65,4.15,4.3,4.45,4.7,4.95,5.2,5.4,5.55,5.8,5.95,6.15,6.5,6.9];
  const report: unknown[] = [];
  for (const scenario of ['left', 'right']) {
    const matrices: unknown[] = [], pixels: Buffer[] = [], indicators: string[] = [], pixelComparisons: unknown[] = [];
    for (const outcome of ['yes', 'no']) {
      await page.goto(`/?review=1&scenario=${scenario}&outcome=${outcome}&t=0`);
      for (let i = 0; i < times.length; i++) {
        const time = times[i];
        await page.getByRole('slider', { name: 'Animation time' }).fill(String(time));
        await expect(page.locator('.decision-stage')).toHaveAttribute('data-time', time.toFixed(3));
        const actual = JSON.parse((await page.locator('.scene-canvas').getAttribute('data-camera'))!);
        expect(actual.position).toHaveLength(3);
        expect(actual.quaternion).toHaveLength(4);
        expect(actual.projection).toHaveLength(16);
        const indicator = await page.locator('.indicator').innerHTML();
        if (outcome === 'yes') { matrices.push(actual); indicators.push(indicator); }
        else { expect(actual).toEqual(matrices[i]); expect(indicator).toBe(indicators[i]); }
        if (time < 4.3) {
          const frame = await capture();
          if (outcome === 'yes') pixels.push(frame);
          else {
            const identical = frame.equals(pixels[i]);
            pixelComparisons.push({ time, identical });
            if (!identical) {
              await writeFile(path.join(folder, `${scenario}-${time}-yes.png`), pixels[i]);
              await writeFile(path.join(folder, `${scenario}-${time}-no.png`), frame);
            }
            // Answer geometry/reflections may differ once the distant target
            // enters view; the camera itself must remain identical throughout.
          }
        }
      }
      // Pausing, seeking backward and resuming do not draw or change a route.
      await page.getByRole('slider', { name: 'Animation time' }).fill('5.55');
      const before = await capture();
      await page.getByRole('slider', { name: 'Animation time' }).fill('1.4');
      await page.getByRole('slider', { name: 'Animation time' }).fill('5.55');
      expect((await capture()).equals(before)).toBe(true);
      await page.getByRole('button', { name: 'RESUME', exact: true }).click();
      await expect(page.getByRole('status')).toHaveText(outcome.toUpperCase());
      await expect(page.locator('.decision-stage')).toHaveAttribute('data-scenario', scenario);
    }
    report.push({ scenario, times, identicalCameraAndIndicator: true, pixelComparisons, matrices });
  }
  await writeFile(path.join(folder, 'camera-independence.json'), JSON.stringify(report, null, 2));
});

test('external pool uses Math.random selection once, keeps questions private, and locks repeated submit', async ({ page }) => {
  await draws(page, 1, 0); // local draw would say NO; selected pool value 15 says YES.
  const requests: { url: string; referer?: string; cookie?: string; body: string | null }[] = [];
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('https://www.random.org/**', async route => {
    const request = route.request();
    requests.push({ url: request.url(), referer: request.headers().referer, cookie: request.headers().cookie, body: request.postData() });
    if (request.url().includes('/integers/')) await gate;
    await route.fulfill({ status: 200, contentType: 'text/plain', body: request.url().includes('/quota/') ? '999999\n' : Array.from({ length: 16 }, (_, i) => i).join('\n') });
  });
  await external(page);
  await page.getByRole('button', { name: 'Ask the question' }).click();
  await expect(page.locator('.decision-stage')).toHaveAttribute('data-phase', 'preparing');
  await expect(page.getByLabel('Random source')).toBeDisabled();
  await expect(page.getByRole('textbox')).toHaveAttribute('readonly', '');
  await page.locator('form').evaluate(form => { for (let i = 0; i < 4; i++) (form as HTMLFormElement).requestSubmit(); });
  await expect.poll(() => requests.length).toBe(2);
  release();
  await expect(page.getByRole('status')).toHaveText('YES');
  expect(await page.evaluate(() => (window as any).draws)).toEqual({ route: 1, answer: 0 });
  expect(requests).toHaveLength(2);
  expect(requests.every(r => !r.referer && !r.cookie && !r.body && !r.url.includes('private'))).toBe(true);
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
});

test('reset aborts pending external work and late completion cannot overwrite a new answer', async ({ page }) => {
  await draws(page, 0, 0);
  let pending: (() => Promise<void>) | undefined;
  await page.route('https://www.random.org/**', async route => {
    if (route.request().url().includes('/quota/')) await route.fulfill({ body: '10000', contentType: 'text/plain' });
    else pending = () => route.fulfill({ body: Array(16).fill('1').join('\n'), contentType: 'text/plain' });
  });
  await external(page);
  await page.getByRole('button', { name: 'Ask the question' }).click();
  await expect.poll(() => Boolean(pending)).toBe(true);
  await page.getByRole('button', { name: 'NEW QUESTION' }).click();
  await expect(page.locator('.decision-stage')).toHaveAttribute('data-phase', 'idle');
  await expect(page.getByRole('textbox')).toHaveValue('');
  await page.getByLabel('Random source').selectOption('local');
  await page.getByRole('textbox').fill('New question');
  await page.getByRole('button', { name: 'Ask the question' }).click();
  await pending!();
  await expect(page.getByRole('status')).toHaveText('NO');
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('invalid responses and exhausted quota never silently substitute local randomness', async ({ page }) => {
  await draws(page, 0, 1);
  let calls = 0, response = 'not numbers';
  await page.route('https://www.random.org/**', route => {
    calls++;
    return route.fulfill({ body: route.request().url().includes('/quota/') ? '10000' : response, contentType: 'text/plain' });
  });
  await external(page);
  for (const body of ['not numbers', Array(16).fill('256').join('\n'), Array(15).fill('0').join('\n'), Array(16).fill('1.5').join('\n')]) {
    response = body;
    await page.getByRole('button', { name: 'Ask the question' }).click();
    await expect(page.getByRole('alert')).toContainText('invalid numbers');
    await expect(page.locator('.decision-stage')).toHaveAttribute('data-phase', 'idle');
    await expect(page.getByRole('textbox')).toContainText('private-entropy-123');
  }
  response = Array(16).fill('0').join('\n');
  await page.getByRole('button', { name: 'Ask the question' }).click();
  await expect(page.getByRole('status')).toHaveText('NO');
  expect(await page.evaluate(() => (window as any).draws.answer)).toBe(0);
  await page.unroute('https://www.random.org/**');
  await page.route('https://www.random.org/**', route => { calls++; return route.fulfill({ body: '-1', contentType: 'text/plain' }); });
  await external(page); // fresh tab state checks the quota again
  const before = calls;
  await page.getByRole('button', { name: 'Ask the question' }).click();
  await expect(page.getByRole('alert')).toContainText('quota exhausted');
  await page.getByRole('button', { name: 'Ask the question' }).click();
  await expect(page.getByRole('alert')).toContainText('quota unavailable');
  expect(calls - before).toBe(1);
});

test('network failure and two-minute timeout remain cancellable and recover in LOCAL mode', async ({ page }) => {
  await draws(page, 0, 1);
  await page.route('https://www.random.org/**', route => route.abort('internetdisconnected'));
  await external(page);
  await page.getByRole('button', { name: 'Ask the question' }).click();
  await expect(page.getByRole('alert')).toContainText('Cannot reach');
  await page.unroute('https://www.random.org/**');
  await page.route('https://www.random.org/**', () => {});
  await page.clock.install();
  await page.getByRole('button', { name: 'Ask the question' }).click();
  await expect(page.locator('.decision-stage')).toHaveAttribute('data-phase', 'preparing');
  await page.clock.fastForward(120_001);
  await expect(page.getByRole('alert')).toContainText('timed out');
  await page.getByLabel('Random source').selectOption('local');
  await page.getByRole('button', { name: 'Ask the question' }).click();
  await page.clock.runFor(32);
  await page.clock.fastForward(7000);
  await expect(page.getByRole('status')).toHaveText('YES');
});
