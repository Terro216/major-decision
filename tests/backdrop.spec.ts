import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createFreestyle } from '../src/animation/freestyle';
import { webglCapture } from './webglCapture';

for (const [scenario, seed] of [['left', 60], ['right', 2]] as const) {
  test(`freestyle ${scenario}: the flight keeps its illuminated background through the target approach`, async ({ page }) => {
    const capture = await webglCapture(page), run = createFreestyle(seed, scenario);
    await page.setViewportSize({ width: 800, height: 1000 });
    await page.goto(`/?review=1&mode=freestyle&seed=${seed}&scenario=${scenario}&outcome=yes&t=0`);
    await expect(page.locator('.decision-stage')).toHaveAttribute('data-renderer', 'webgl');
    await page.locator('.scene-canvas').evaluate(element => {
      const scale = new DOMMatrix(getComputedStyle(document.querySelector('.terminal-surface')!).transform).a;
      const canvas = element as HTMLCanvasElement;
      canvas.style.width = `${480 / scale}px`; canvas.style.height = `${480 * 688 / 1241 / scale}px`;
    });
    await expect.poll(() => page.locator('canvas').evaluate(canvas => canvas.width)).toBe(480);
    const frames = [];
    let worst = -1, image: Buffer | undefined;
    for (let i = 0; i <= 10; i++) {
      const time = run.events.exit + (run.events.hit - run.events.exit) * i / 10;
      await page.getByRole('slider', { name: 'Animation time' }).fill(String(Number(time.toFixed(10))));
      await expect(page.locator('.decision-stage')).toHaveAttribute('data-time', time.toFixed(3));
      const light = await page.locator('.scene-canvas').evaluate(element => {
        const canvas = element as HTMLCanvasElement;
        canvas.getContext('webgl2')!.finish();
        const copy = document.createElement('canvas'); copy.width = canvas.width; copy.height = canvas.height;
        const context = copy.getContext('2d')!; context.drawImage(canvas, 0, 0);
        const pixels = context.getImageData(0, 0, copy.width, copy.height).data;
        let dark = 0, blue = 0, count = 0;
        // Keep a broad interior region: the old cue turned about 84% of it
        // near-black for part of the flight, independently of the chosen answer.
        for (let y = Math.floor(copy.height * .15); y < copy.height * .85; y++) {
          for (let x = Math.floor(copy.width * .05); x < copy.width * .95; x++) {
            const j = (y * copy.width + x) * 4;
            if (Math.max(pixels[j], pixels[j + 1], pixels[j + 2]) < 25) dark++;
            blue += pixels[j + 2]; count++;
          }
        }
        return { dark: dark / count, blue: blue / count };
      });
      frames.push({ time, ...light });
      if (light.dark > worst) { worst = light.dark; image = await capture(); }
    }
    const artifacts = path.join(process.env.MD_REVIEW_DIR || '.review', 'backdrop');
    await mkdir(artifacts, { recursive: true });
    await writeFile(path.join(artifacts, `${scenario}.json`), JSON.stringify({ scenario, seed, frames }, null, 2));
    await writeFile(path.join(artifacts, `${scenario}-darkest.png`), image!);
    for (const frame of frames) {
      expect(frame.dark, `near-black area at ${frame.time}`).toBeLessThan(.5);
      expect(frame.blue, `blue light at ${frame.time}`).toBeGreaterThan(40);
    }
  });
}
