// Run in a bounded Playwright container on big-one, against the actual nginx
// candidate or public HTTPS. Questions here are synthetic and never transmitted.
import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const [base, directory, expectedFile] = process.argv.slice(2);
assert(base && directory, 'usage: smoke-production.mjs URL ARTIFACT_DIRECTORY [check-result.json]');
const origin = new URL(base).origin;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const expected = expectedFile ? JSON.parse(await readFile(expectedFile, 'utf8')) : null;
if (expected) assert.equal(expected.testExit, 0, 'Only a passed build is a release candidate');
await mkdir(directory, { recursive: true });
const checks = [];
for (const [url, status] of [['/',200],['/healthz',200],['/release.json',200],['/.git/config',404],['/.env',404],['/references/manifest.json',404],['/references/film/06m36s-06m50s.mp4',404],['/.review/check-result.json',404],['/src/App.tsx',404],['/package.json',404]]) {
  const response = await fetch(origin + url);
  assert.equal(response.status,status,url);
  assert.equal(response.headers.get('x-content-type-options'),'nosniff',url);
  assert.equal(response.headers.get('referrer-policy'),'no-referrer',url);
  assert(response.headers.get('content-security-policy')?.includes("script-src 'self'"),url);
  const body = Buffer.from(await response.arrayBuffer());
  if (url === '/' && expected) assert.equal(hash(body), expected.indexSha256, 'Public HTML equals the tested build');
  if (url === '/release.json' && expected) assert.equal(JSON.parse(body).source, expected.sourceSha256, 'Image identifies the tested source');
  if (url === '/healthz') assert.equal(body.toString(),'ok\n');
  checks.push({url,status,sha256:hash(body)});
}
assert.equal((await fetch(origin+'/',{method:'POST',body:'synthetic-smoke'})).status,405);
const browser = await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const runs = [], resources = new Map();
try {
  for (const mode of ['movie','freestyle']) for (const scenario of ['left','right']) for (const outcome of ['yes','no']) {
    const width=scenario==='left'?1000:390,height=scenario==='left'?900:844;
    const context=await browser.newContext({viewport:{width,height}});
    try {
      await context.addInitScript(({scenario,outcome,mode})=>{
        const original=crypto.getRandomValues.bind(crypto);
        window.smokeDraws={route:0,seed:0,answer:0};
        crypto.getRandomValues=array=>{
          if(array instanceof Uint32Array&&array.length===1){
            if(mode==='freestyle'&&window.smokeDraws.route>window.smokeDraws.seed){window.smokeDraws.seed++;array[0]=60;}
            else{window.smokeDraws.route++;array[0]=scenario==='right'?1:0;}
            return array;
          }
          if(array instanceof Uint8Array&&array.length===1){window.smokeDraws.answer++;array[0]=outcome==='yes'?1:0;return array;}
          return original(array);
        };
      },{scenario,outcome,mode});
      const page=await context.newPage(),errors=[],requests=[];
      page.on('pageerror',e=>errors.push(e.message));
      page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
      page.on('request',request=>requests.push(request.url()));
      const collected=[];
      page.on('response',response=>{
        if(response.url().startsWith(origin+'/assets/')||response.url().includes('/fonts/')) collected.push((async()=>{
          assert.equal(response.status(),200,response.url());
          const bytes=await response.body();
          resources.set(new URL(response.url()).pathname,{status:response.status(),bytes:bytes.length,sha256:hash(bytes),cache:response.headers()['cache-control']});
        })());
      });
      await page.goto(origin+'/');
      assert.equal(await page.locator('.review-controls').count(),0);
      await page.getByRole('button',{name:mode==='movie'?'Movie':'Freestyle',exact:true}).click();
      for(const name of ['HOROSCOPE','ROMANCE','CAREER']) assert(await page.getByRole('button',{name}).isDisabled());
      const input=page.getByRole('textbox',{name:'Your question'});
      await input.fill('Проверочный вопрос — останется ли он в этой вкладке?');
      await page.getByRole('button',{name:'Ask the question'}).click();
      await page.waitForFunction(()=>document.querySelector('.decision-stage').dataset.phase==='result',{}, {timeout:25_000});
      assert.equal(await page.getByRole('status').innerText(),outcome.toUpperCase());
      const stage=await page.locator('.decision-stage').evaluate(element=>({...element.dataset}));
      assert.equal(stage.scenario,scenario);assert.equal(stage.renderer,'webgl');assert.equal(stage.mode,mode);
      await page.locator('canvas').evaluate(canvas=>canvas.getContext('webgl2').finish());
      assert.deepEqual(await page.evaluate(()=>window.smokeDraws),{route:1,seed:mode==='freestyle'?1:0,answer:1});
      assert.equal(await page.evaluate(()=>localStorage.length+sessionStorage.length),0);
      assert(requests.every(url=>url.startsWith(origin+'/')||url.startsWith('https://analytics.ilyamedve.dev/')),JSON.stringify(requests));
      assert.equal(new URL(page.url()).search,'');
      await page.screenshot({path:`${directory}/${mode}-${scenario}-${outcome}.png`,fullPage:true});
      await page.getByRole('button',{name:/^SOUND/}).click();
      await page.waitForFunction(()=>[...document.querySelectorAll('button')].find(button=>button.textContent.startsWith('SOUND'))?.getAttribute('aria-pressed')==='true');
      assert.equal(await page.getByRole('button',{name:/^SOUND/}).getAttribute('aria-pressed'),'true');
      await page.getByRole('button',{name:/^SOUND/}).click();
      await page.getByRole('button',{name:'NEW QUESTION'}).click();
      assert.equal(await input.inputValue(),'');assert(await input.evaluate(el=>el===document.activeElement));
      assert.equal(await page.locator('canvas').count(),0);
      await Promise.all(collected);
      assert.deepEqual(errors,[]);
      runs.push({mode,scenario,outcome,width,height,renderer:stage.renderer,requests:requests.length,questionInStorage:false,errors});
    } finally {await context.close();}
  }
} finally {await browser.close();}
for(const [url,item] of resources) if(url.startsWith('/assets/')) assert(item.cache?.includes('immutable'),url);
const report={checkedAt:new Date().toISOString(),base:origin,expected,checks,runs,assets:Object.fromEntries(resources)};
await writeFile(`${directory}/smoke.json`,JSON.stringify(report,null,2));
console.log(JSON.stringify({base:origin,httpChecks:checks.length,routeAnswerPairs:runs.length,assets:resources.size,success:true}));
