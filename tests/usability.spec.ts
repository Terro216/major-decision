import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';

const artifact = process.env.MD_REVIEW_DIR || '.review';

test('accessibility: desktop and mobile start/result have no WCAG A/AA violations', async ({ page }) => {
  test.setTimeout(120_000);
  await page.emulateMedia({reducedMotion:'reduce'});
  await mkdir(path.join(artifact,'usability'),{recursive:true});
  const reports=[];
  for(const [width,height] of [[1280,900],[390,844]]) {
    await page.setViewportSize({width,height}); await page.goto('/');
    for(const state of ['start','result']) {
      if(state==='result') { await page.getByRole('textbox').fill('Can I read this?'); await page.getByRole('button',{name:'Ask the question'}).click(); }
      const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();
      reports.push({width,height,state,violations:result.violations,incomplete:result.incomplete.map(item=>({id:item.id,nodes:item.nodes.map(node=>({target:node.target,summary:node.failureSummary}))}))});
    }
  }
  await writeFile(path.join(artifact,'usability/axe.json'),JSON.stringify(reports,null,2));
  expect(reports.flatMap(report=>report.violations.map(violation=>({width:report.width,state:report.state,id:violation.id,nodes:violation.nodes.map(node=>({target:node.target,summary:node.failureSummary}))})))).toEqual([]);
});

test('mobile: readable input, touch targets, long Cyrillic questions and orientation', async ({ page }) => {
  test.setTimeout(120_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mkdir(path.join(artifact, 'usability'), { recursive: true });
  const report = [];
  for (const [width, height] of [[320,568],[390,844],[430,932],[844,390]]) {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    const question = page.getByRole('textbox', { name: 'Your question' });
    const long = 'Стоит ли мне отправиться в путешествие, о котором я давно мечтаю, и взять с собой старый фотоаппарат? '.repeat(2).slice(0,180);
    await question.fill(long);
    expect(await question.inputValue()).toHaveLength(180);
    const fontSize = await question.evaluate(el => parseFloat(getComputedStyle(el).fontSize));
    expect(fontSize).toBeGreaterThanOrEqual(16);
    const sizes = [];
    for (const button of [page.getByRole('button', {name:'Ask the question'}),page.getByRole('button',{name:'NEW QUESTION'}),page.getByRole('button',{name:/SOUND/})]) {
      const box = (await button.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44);
      sizes.push(box);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.getByRole('button', { name: 'Ask the question' }).click();
    await expect(page.getByRole('status')).toHaveText(/YES|NO/);
    await expect(question).toHaveValue(long);
    await page.screenshot({ path: path.join(artifact, `usability/mobile-${width}-answer.png`), fullPage: true });
    await page.getByRole('button', { name: 'NEW QUESTION' }).click();
    await expect(question).toHaveValue(''); await expect(question).toBeFocused();
    await page.screenshot({ path: path.join(artifact, `usability/mobile-${width}-start.png`), fullPage: true });
    report.push({ width,height,fontSize,sizes });
  }
  await writeFile(path.join(artifact,'usability/mobile.json'),JSON.stringify(report,null,2));
});

test('reduced motion chooses once and renders the same readable answer without a WebGL allocation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    (window as any).draws = { route:0, answer:0, webgl:0 };
    const random = crypto.getRandomValues.bind(crypto), context = HTMLCanvasElement.prototype.getContext;
    crypto.getRandomValues = ((array: any) => {
      if (array instanceof Uint8Array && array.length === 1) { (window as any).draws.answer++; array[0]=0; return array; }
      if (array instanceof Uint32Array && array.length === 1) { (window as any).draws.route++; array[0]=1; return array; }
      return random(array);
    }) as typeof crypto.getRandomValues;
    HTMLCanvasElement.prototype.getContext = function(kind: string, ...args: any[]) {
      if (kind === 'webgl2' || kind === 'webgl') (window as any).draws.webgl++;
      return context.apply(this, [kind,...args] as any);
    } as typeof context;
  });
  await page.goto('/');
  await page.getByRole('textbox').fill('Остаться здесь?');
  await page.getByRole('textbox').press('Enter');
  await expect(page.getByRole('status')).toHaveText('NO');
  await expect(page.locator('.decision-stage')).toHaveAttribute('data-renderer','reduced-motion');
  expect(await page.evaluate(() => (window as any).draws)).toEqual({route:1,answer:1,webgl:0});
  await expect(page.locator('canvas')).toHaveCount(0);
});

test('ordinary playback has no pause or skip controls and respects live motion preference', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await page.getByRole('textbox').fill('Продолжить?');
  await page.getByRole('button',{name:'Ask the question'}).click();
  await page.clock.runFor(32); await page.clock.fastForward(700);
  const stage = page.locator('.decision-stage');
  const pair = await stage.evaluate(el => [el.getAttribute('data-outcome'),el.getAttribute('data-scenario')]);
  await expect(stage).toHaveAttribute('data-phase','running');
  await expect(page.getByRole('button',{name:/^(PAUSE|RESUME|SHOW ANSWER)$/})).toHaveCount(0);
  await page.emulateMedia({reducedMotion:'reduce'});
  await expect(page.getByRole('status')).toHaveText(pair[0]!.toUpperCase());
  await expect(stage).toHaveAttribute('data-scenario',pair[1]!);
  await expect(stage).toHaveAttribute('data-renderer','reduced-motion');
  await page.getByRole('button',{name:'NEW QUESTION'}).click();
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.getByRole('textbox').fill('Ещё раз?');
  await page.getByRole('button',{name:'Ask the question'}).click();
  const answer = await stage.getAttribute('data-outcome');
  await page.clock.runFor(32); await page.clock.fastForward(8000);
  await expect(page.getByRole('status')).toHaveText(answer!.toUpperCase());
});

test('background tabs freeze time; returning resumes, and reset prevents a stale resume', async ({ page }) => {
  await page.clock.install({time:new Date('2026-10-21T00:00:00Z')});
  await page.addInitScript(() => {
    (window as any).testHidden = false;
    Object.defineProperty(document,'hidden',{get:()=>(window as any).testHidden});
  });
  await page.goto('/');
  await page.clock.pauseAt(new Date('2026-10-21T01:00:00Z'));
  await page.getByRole('textbox').fill('Wait for me?');
  await page.getByRole('button',{name:'Ask the question'}).click();
  await page.clock.runFor(32); await page.clock.fastForward(900);
  const stage = page.locator('.decision-stage');
  const setHidden = (hidden: boolean) => page.evaluate(value => { (window as any).testHidden=value; document.dispatchEvent(new Event('visibilitychange')); },hidden);
  await setHidden(true);
  const before = await stage.getAttribute('data-time');
  await page.clock.fastForward(60_000);
  await expect(stage).toHaveAttribute('data-time',before!);
  await setHidden(false); await page.clock.runFor(32);
  expect(Number(await stage.getAttribute('data-time'))-Number(before)).toBeLessThan(.04);
  await page.clock.fastForward(500);
  expect(Number(await stage.getAttribute('data-time'))).toBeGreaterThan(Number(before)+.4);
  await setHidden(true);
  await page.getByRole('button',{name:'NEW QUESTION'}).click();
  await setHidden(false); await page.clock.fastForward(8000);
  await expect(stage).toHaveAttribute('data-phase','idle');
  await expect(page.getByRole('status')).toHaveCount(0);
});

test('keyboard, IME 229, focus, 200 percent reflow and high contrast remain usable', async ({ page }) => {
  await page.emulateMedia({ reducedMotion:'reduce' });
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('textbox')).toBeFocused();
  await page.getByRole('textbox').fill('確認する？');
  await page.getByRole('textbox').evaluate(el=>el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',keyCode:229,bubbles:true})));
  await expect(page.locator('.decision-stage')).toHaveAttribute('data-phase','idle');
  await page.keyboard.press('Tab'); await expect(page.getByRole('button',{name:'Ask the question'})).toBeFocused();
  await page.keyboard.press('Enter'); await expect(page.getByRole('status')).toBeVisible();
  await page.keyboard.press('Tab'); await expect(page.getByRole('button',{name:'NEW QUESTION'})).toBeFocused();
  await page.keyboard.press('Enter'); await expect(page.getByRole('textbox')).toBeFocused();
  // A 1280px viewport at 200% has the same 640 CSS px available for reflow.
  await page.setViewportSize({width:640,height:500});
  await page.emulateMedia({forcedColors:'active'});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(640);
  await page.getByRole('textbox').fill('Readable in high contrast?');
  await page.getByRole('textbox').press('Enter');
  await expect(page.getByRole('status')).toBeVisible();
  await mkdir(path.join(artifact,'usability'),{recursive:true});
  await page.screenshot({path:path.join(artifact,'usability/high-contrast.png'),fullPage:true});
});
