import { test, expect, type BrowserName } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

// Called at test-file scope: each engine gets its own worker/browser fixture.
// Never keep the default Chromium alive alongside a manually launched engine.
export function browserUsability(engine: BrowserName) {
  test.use({browserName:engine,launchOptions:{args:[]},viewport:{width:390,height:844},reducedMotion:'reduce'});
  test(`${engine}: mobile layout, Cyrillic question, sound gesture and reset`,async({page})=>{
    const errors:string[]=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
    await page.goto('/');
    await page.getByRole('textbox').fill('Можно продолжать?');
    await page.getByRole('button',{name:/^SOUND/}).click();
    await expect(page.getByRole('button',{name:/^SOUND/})).toHaveAttribute('aria-pressed','true');
    await page.getByRole('button',{name:'Ask the question'}).click();
    await expect(page.getByRole('status')).toHaveText(/YES|NO/);
    await page.getByRole('button',{name:/^SOUND/}).click();
    await page.getByRole('button',{name:'NEW QUESTION'}).click();
    await expect(page.getByRole('textbox')).toBeFocused();
    await expect(page.getByRole('textbox')).toHaveValue('');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    expect(errors).toEqual([]);
    const directory=path.join(process.env.MD_REVIEW_DIR||'.review','usability');
    await mkdir(directory,{recursive:true});
    await page.screenshot({path:path.join(directory,`${engine}-mobile.png`),fullPage:true});
  });
}
