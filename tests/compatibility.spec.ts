import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const artifact=process.env.MD_REVIEW_DIR||'.review';

test('WebGL: high-DPR phones have bounded buffers and repeated reset releases every context',async({browser})=>{
  test.setTimeout(120_000);
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:3});
  try {
    await context.addInitScript(()=>{
      (window as any).contexts=[];(window as any).released=0;
      const get=HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext=function(kind:string,...args:any[]) {
        const gl=get.apply(this,[kind,...args] as any);
        if(kind==='webgl2'&&gl&&!(window as any).contexts.includes(gl)) {
          (window as any).contexts.push(gl);
          const extension=(gl as WebGL2RenderingContext).getExtension('WEBGL_lose_context');
          if(extension) {const lose=extension.loseContext.bind(extension);extension.loseContext=()=>{(window as any).released++;lose();};}
        }
        return gl;
      } as typeof get;
    });
    const page=await context.newPage(),sizes=[];
    await page.goto('http://127.0.0.1:4173/');
    for(let run=0;run<4;run++) {
      await page.getByRole('textbox').fill('A short question?');
      await page.getByRole('button',{name:'Ask the question'}).click();
      await expect(page.locator('.decision-stage')).toHaveAttribute('data-renderer','webgl');
      const size=await page.locator('canvas').evaluate(canvas=>({width:canvas.width,height:canvas.height,cssWidth:canvas.getBoundingClientRect().width}));
      expect(size.width).toBeLessThanOrEqual(Math.ceil(size.cssWidth*1.5));
      expect(size.width*size.height).toBeLessThanOrEqual(1_500_000);
      sizes.push(size);
      await page.getByRole('button',{name:'NEW QUESTION'}).click();
      await expect(page.locator('canvas')).toHaveCount(0);
      expect(await page.evaluate(()=>(window as any).released)).toBe(run+1);
    }
    expect(await page.evaluate(()=>(window as any).contexts.length)).toBe(4);
    await writeFile(path.join(artifact,'webgl-resources.json'),JSON.stringify({dpr:3,sizes,created:4,released:4},null,2));
  } finally {await context.close();}
});

test('WebGL without float color buffers still renders the chosen answer',async({page})=>{
  await page.addInitScript(()=>{
    const get=WebGL2RenderingContext.prototype.getExtension;
    WebGL2RenderingContext.prototype.getExtension=function(name:string) {
      if(name==='EXT_color_buffer_float') return null;
      return get.call(this,name);
    } as typeof get;
  });
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.goto('/?review=1&outcome=no&t=4.65');
  await expect(page.locator('.decision-stage')).toHaveAttribute('data-renderer','webgl');
  await page.getByRole('slider',{name:'Animation time'}).fill('6.9');
  await expect(page.getByRole('status')).toHaveText('NO');
  await page.locator('canvas').evaluate(canvas=>canvas.getContext('webgl2')!.finish());
  expect(errors).toEqual([]);
});
