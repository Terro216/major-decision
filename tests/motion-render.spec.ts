import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { timing } from '../src/animation/timeline';
import { webglCapture } from './webglCapture';

test('motion snapshots: both branches, continuous target and opaque diagnostic views', async ({ page }) => {
  test.setTimeout(240_000);
  const root=path.join(process.env.MD_REVIEW_DIR||'.review','motion','after');
  await mkdir(root,{recursive:true});
  await page.setViewportSize({width:1100,height:850});
  for(const outcome of ['yes','no'] as const) {
    await page.goto(`/?review=1&outcome=${outcome}&t=0`);
    await page.getByRole('button',{name:/BROWSER FRAME/}).click();
    await expect(page.locator('.decision-stage')).toHaveAttribute('data-renderer','webgl');
    const crop=(await page.locator('.machine').boundingBox())!;
    for(const time of [.55,.6,.65,1.9,3.25,4.15,4.3,4.4,4.65,4.91,5.1,5.45,5.48,5.7,5.8,5.95,6.5,6.9]) {
      await page.getByRole('slider',{name:'Animation time'}).fill(String(time));
      await page.screenshot({clip:crop,path:path.join(root,`${outcome}-${time.toFixed(2)}.png`)});
    }
    await page.getByRole('checkbox',{name:'OPAQUE TUBE'}).check();
    for(const [view,time] of [['top',3.25],['mouth',timing[outcome].entry],['side',timing[outcome].exit+.1]] as const) {
      await page.getByLabel('Review camera').selectOption(view);
      await page.getByRole('slider',{name:'Animation time'}).fill(String(Number(time.toFixed(2))));
      await page.screenshot({clip:crop,path:path.join(root,`${outcome}-${view}.png`)});
    }
  }
});

test('motion replay: quarter speed and backward seeking preserve both rendered branches', async ({ page }) => {
  test.setTimeout(180_000);
  // Keep the canvas AND controls in view. Scrolling between a range input and
  // the canvas resamples its fractional CSS bounds in compositor screenshots.
  await page.setViewportSize({width:800,height:1000});
  const capture=await webglCapture(page);
  await page.clock.install({ time: new Date('2026-10-18T00:00:00Z') });
  // install alone keeps ticking between awaited GPU/browser actions. Freeze
  // wall time before checking the exact ratio of virtual seconds to motion.
  await page.clock.pauseAt(new Date('2026-10-18T00:00:01Z'));
  const root=path.join(process.env.MD_REVIEW_DIR||'.review','motion');
  await mkdir(root,{recursive:true});
  const checks: unknown[]=[];
  for(const outcome of ['yes','no'] as const) {
    const distinctFrames=new Set<string>();
    await page.goto(`/?review=1&outcome=${outcome}&t=4.15`);
    await expect(page.locator('.decision-stage')).toHaveAttribute('data-renderer','webgl');
    await page.getByLabel('Playback speed').selectOption('0.25');
    await page.getByRole('button',{name:'RESUME',exact:true}).evaluate(button => (button as HTMLButtonElement).click());
    await page.clock.runFor(32);
    await page.clock.fastForward(1000);
    const time=Number(await page.locator('.decision-stage').getAttribute('data-time'));
    expect(time).toBeGreaterThan(4.38); expect(time).toBeLessThan(4.42);
    await page.getByRole('button',{name:'PAUSE',exact:true}).evaluate(button => (button as HTMLButtonElement).click());
    // 104/24 must reach the renderer exactly: the old .01 range step made
    // 24 fps exports alternate between .04 and .05 seconds of motion.
    for(const moment of [4.15,104/24,4.4,4.9,5.48,5.8,5.95,6.9]) {
      // Chromium serializes range values with fewer digits than JS doubles;
      // Playwright rejects a fill if that canonical string changes.
      const sliderTime=String(Number(moment.toFixed(12)));
      await page.getByRole('slider',{name:'Animation time'}).fill(sliderTime);
      const boundsBefore=await page.locator('.scene-canvas').boundingBox();
      const before=await capture();
      distinctFrames.add(before.toString('base64'));
      await page.getByRole('slider',{name:'Animation time'}).fill('6.9');
      await page.getByRole('slider',{name:'Animation time'}).fill('0.53');
      await page.getByRole('slider',{name:'Animation time'}).fill(sliderTime);
      await expect(page.locator('.decision-stage')).toHaveAttribute('data-time',moment.toFixed(3));
      const after=await capture();
      let difference={maximum:0,mean:0,changedRatio:0};
      if(!after.equals(before)) {
        await writeFile(path.join(root,`seek-${outcome}-${moment}-before.png`),before);
        await writeFile(path.join(root,`seek-${outcome}-${moment}-after.png`),after);
        await writeFile(path.join(root,`seek-${outcome}-${moment}-bounds.json`),JSON.stringify({before:boundsBefore,after:await page.locator('.scene-canvas').boundingBox()}));
        difference=await page.evaluate(async ([a,b]) => {
          const decode=async (base64: string) => {
            const bytes=Uint8Array.from(atob(base64),char=>char.charCodeAt(0));
            const bitmap=await createImageBitmap(new Blob([bytes],{type:'image/png'}));
            const canvas=new OffscreenCanvas(bitmap.width,bitmap.height), ctx=canvas.getContext('2d')!;
            ctx.drawImage(bitmap,0,0); bitmap.close();
            return ctx.getImageData(0,0,canvas.width,canvas.height).data;
          };
          const [left,right]=await Promise.all([decode(a),decode(b)]);
          if(left.length!==right.length) throw new Error('Capture dimensions changed');
          let maximum=0,total=0,changed=0;
          for(let i=0;i<left.length;i+=4) {
            let pixel=0;
            for(let j=0;j<4;j++) {const delta=Math.abs(left[i+j]-right[i+j]);maximum=Math.max(maximum,delta);total+=delta;pixel+=delta;}
            if(pixel) changed++;
          }
          return {maximum,mean:total/left.length,changedRatio:changed/(left.length/4)};
        },[before.toString('base64'),after.toString('base64')]);
      }
      // Keep the existing narrow limits for any shader rounding. The former
      // CSS screenshot sometimes changed 8.5% of pixels by only 1–2 levels at
      // identical bounds; widening the scene tolerance would hide its cause.
      expect(difference.maximum,`${outcome} seek ${moment}`).toBeLessThanOrEqual(2);
      expect(difference.mean).toBeLessThan(.04);
      expect(difference.changedRatio).toBeLessThan(.05);
      checks.push({outcome,time:moment,capture:'webgl-canvas-png',byteIdentical:after.equals(before),...difference});
    }
    // Blank or stale drawing buffers must not pass a deterministic comparison.
    expect(distinctFrames.size).toBe(8);
  }
  await writeFile(path.join(root,'seek-check.json'),JSON.stringify(checks,null,2));
});
