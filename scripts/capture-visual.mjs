// Bounded visual iteration on the configured build host. Run inside the existing preview container.
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const directory = process.argv[2] || '/artifacts/visual-iteration';
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 1100 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const states = [];
  for (const outcome of ['yes', 'no']) {
    await page.goto(`http://127.0.0.1:4175/?review=1&outcome=${outcome}&t=0`);
    await page.getByRole('button', { name: /BROWSER FRAME/ }).click();
    await page.waitForFunction(() => document.querySelector('.decision-stage')?.dataset.renderer === 'webgl');
    await page.evaluate(() => document.fonts.ready);
    for (const time of (process.env.CAPTURE_TIMES || '1.65,4.3,4.45,4.58,4.65,4.78,4.90,5.8,5.95').split(',').map(Number)) {
      await page.getByLabel('Animation time').evaluate((input, t) => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, String(t));
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }, time);
      await page.waitForFunction(t => document.querySelector('.decision-stage').dataset.time === t.toFixed(3), time);
      const state = await page.evaluate(() => ({
        time: document.querySelector('.decision-stage').dataset.time,
        scroll: [window.scrollX, window.scrollY, ...[...document.querySelectorAll('.terminal-surface,.machine,.viewport')].flatMap(el => [el.scrollLeft, el.scrollTop])],
      }));
      states.push({ outcome, ...state });
      await page.locator('.machine').screenshot({ path: `${directory}/${outcome}-${time.toFixed(2)}.png` });
    }
  }
  await writeFile(`${directory}/capture.json`, JSON.stringify({ states, errors }, null, 2));
  if (errors.length) throw new Error(errors.join('\n'));
} finally { await browser.close(); }
