import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

// Full real-time playback includes software shader compilation and rendering.
// Its completion can exceed the 12 s UI assertion budget on two CPUs; keep
// every interaction/privacy assertion and a separate bounded completion wait.
const completionTimeout = 30_000;

test('empty questions are not answered; a Cyrillic question can be asked and reset', async ({ page }) => {
  await page.goto('/');
  const question = page.getByRole('textbox', { name: 'Your question' });
  await page.getByRole('button', { name: 'Ask the question' }).click();
  await expect(question).toBeFocused();
  await expect(page.getByRole('status')).toHaveCount(0);
  await question.fill('Стоит ли сегодня пойти на прогулку?');
  await question.press('Enter');
  await expect(page.getByRole('status')).toBeVisible({ timeout: completionTimeout });
  await expect(page.getByRole('status')).toMatchAriaSnapshot('- status: /YES|NO/');
  await expect(question).toHaveValue('Стоит ли сегодня пойти на прогулку?');
  await page.getByRole('button', { name: 'NEW QUESTION' }).click();
  await expect(question).toHaveValue('');
  await expect(question).toBeFocused();
  await expect(page.getByRole('status')).toHaveCount(0);
});

test('inactive film sections stay disabled and are skipped by the keyboard', async ({ page }) => {
  await page.goto('/');
  for (const label of ['HOROSCOPE', 'ROMANCE', 'CAREER']) {
    await expect(page.getByRole('button', { name: label })).toBeDisabled();
  }
  await page.getByRole('button', { name: 'NEW QUESTION' }).focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Movie', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Freestyle', exact: true })).toBeFocused();
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Freestyle', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: /BROWSER FRAME/ })).toBeFocused();
});

test('multiline questions, edit after answer, and browser frame preserve the question', async ({ page }) => {
  await page.goto('/');
  const question = page.getByRole('textbox', { name: 'Your question' });
  await question.fill('Should I enter a painting');
  await question.press('Shift+Enter');
  await question.pressSequentially('in the Conrad Competition?');
  await expect(page.getByRole('status')).toHaveCount(0);
  await page.getByRole('button', { name: 'Ask the question' }).click();
  await expect(page.getByRole('status')).toBeVisible({ timeout: completionTimeout });
  await page.getByRole('button', { name: /BROWSER FRAME/ }).click();
  await expect(question).toHaveValue('Should I enter a painting\nin the Conrad Competition?');
  await question.fill('A different question?');
  await expect(page.getByRole('status')).toHaveCount(0);
});

test('all app assets are self hosted, question stays out of network and storage', async ({ page }) => {
  const requests: string[] = [];
  const errors: string[] = [];
  page.on('request', request => requests.push(request.url()));
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Your question' }).fill('private-question-12345');
  await page.getByRole('button', { name: 'Ask the question' }).click();
  await expect(page.getByRole('status')).toBeVisible({ timeout: completionTimeout });
  expect(errors).toEqual([]);
  expect(requests.every(url => url.startsWith('http://127.0.0.1:4173/'))).toBe(true);
  expect(requests.some(url => url.includes('private-question'))).toBe(false);
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Your question' })).toHaveValue('');
});

test('reference captures and viewports', async ({ page }) => {
  // Full-page raster captures at six viewport sizes include software WebGL
  // startup and resize work; all sizes and overflow assertions are retained.
  test.setTimeout(240_000);
  const artifacts = process.env.MD_REVIEW_DIR || '.review';
  await mkdir(artifacts, { recursive: true });
  await page.setViewportSize({ width: 1600, height: 1100 });
  await page.goto('/?review=1');
  await page.evaluate(() => document.fonts.ready);
  for (const [button, filename] of [['START', 'desktop-start'], ['YES', 'desktop-yes'], ['NO', 'desktop-no']]) {
    await page.getByRole('button', { name: button, exact: true }).click();
    await page.screenshot({ path: path.join(artifacts, `${filename}.png`), fullPage: true });
  }
  await page.getByRole('button', { name: 'START', exact: true }).click();
  await page.getByRole('button', { name: /BROWSER FRAME/ }).click();
  await page.screenshot({ path: path.join(artifacts, 'desktop-no-browser.png'), fullPage: true });
  for (const [width, height] of [[1366, 768], [768, 1024], [390, 844], [320, 568]]) {
    await page.setViewportSize({ width, height });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.screenshot({ path: path.join(artifacts, `viewport-${width}.png`), fullPage: true });
  }
});
