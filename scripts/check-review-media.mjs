// Offline browser review of the compact, retained film/before/after evidence.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 960 }, offline: true });
  const page = await context.newPage();
  const result = [];
  async function exercise(play, pause, speed, time, count) {
    await page.waitForFunction(() => [...document.querySelectorAll('video')].every(v => v.readyState >= 2 && !v.error));
    await page.locator(play).click();
    await page.waitForFunction(() => [...document.querySelectorAll('video')].every(v => v.currentTime > .25 && !v.paused && !v.error));
    const metadata = await page.locator('video').evaluateAll(nodes => nodes.map(v => ({src:v.getAttribute('src'),width:v.videoWidth,height:v.videoHeight,duration:v.duration,error:v.error?.code??null})));
    assert.equal(metadata.length,count);
    assert(metadata.every(v => v.duration>=6.9 && v.width>=700 && v.height>=400 && !v.error));
    await page.locator(pause).click();
    await page.locator(speed).selectOption({label:'¼×'});
    const seeks=[];
    for(const position of [4.4,6.8,1.35]) {
      await page.locator(time).fill(String(position));
      await page.waitForFunction(() => [...document.querySelectorAll('video')].every(v => !v.seeking && v.readyState>=2));
      const state=await page.locator('video').evaluateAll(nodes=>nodes.map(v=>({time:v.currentTime,paused:v.paused,rate:v.playbackRate,error:v.error?.code??null})));
      assert(state.every(v=>Math.abs(v.time-position)<.03 && v.paused && v.rate===.25 && !v.error));
      seeks.push(state);
    }
    await page.locator('video').evaluateAll(nodes=>Promise.all(nodes.map(v=>v.play())));
    await page.waitForFunction(() => [...document.querySelectorAll('video')].every(v=>v.currentTime>1.5&&!v.paused&&v.playbackRate===.25));
    await page.locator(pause).click();
    await page.locator(speed).selectOption({label:'1×'});
    await page.evaluate(() => {
      window.mediaStartedAt = performance.now();
      // Keep seeking/quarter-speed decoder counters separate from the full 1x run.
      window.mediaQualityStart = [...document.querySelectorAll('video')].map(v => {
        const q=v.getVideoPlaybackQuality();
        return {frames:q.totalVideoFrames,dropped:q.droppedVideoFrames};
      });
    });
    await page.locator(play).click();
    await page.waitForFunction(() => [...document.querySelectorAll('video')].every(v => v.ended && !v.error), {}, {timeout:25000});
    const normalSpeedPlayback = await page.evaluate(() => ({
      wallSeconds: (performance.now()-window.mediaStartedAt)/1000,
      videos: [...document.querySelectorAll('video')].map((v,i) => {
        const quality=v.getVideoPlaybackQuality();
        const initial=window.mediaQualityStart[i];
        return {src:v.getAttribute('src'),time:v.currentTime,duration:v.duration,
          rate:v.playbackRate,ended:v.ended,error:v.error?.code??null,
          frames:quality.totalVideoFrames-initial.frames,
          dropped:quality.droppedVideoFrames-initial.dropped,
          totalFrames:quality.totalVideoFrames,totalDropped:quality.droppedVideoFrames,
          played:Array.from({length:v.played.length},(_,i)=>[v.played.start(i),v.played.end(i)])};
      }),
    }));
    assert(normalSpeedPlayback.wallSeconds>=6.7);
    assert(normalSpeedPlayback.videos.every(v=>v.rate===1 && v.ended && !v.error
      && Math.abs(v.time-v.duration)<.03
      && v.played.some(([start,end])=>start<.05 && end>=v.duration-.05)));
    return {metadata,seeks,quarterSpeedPlayed:true,normalSpeedPlayed:true,normalSpeedPlayback};
  }
  await page.goto('file:///repo/docs/visual-comparison.html');
  for(const branch of ['yes','no']) {
    await page.locator(`[data-movie="${branch}"]`).click();
    await page.waitForFunction(()=>[...document.querySelectorAll('img')].every(i=>i.complete&&i.naturalWidth>0));
    result.push({branch,...await exercise('#play-movies','#pause-movies','#movie-speed','#movie-time',3)});
    assert.equal(await page.locator('#error').innerText(),'');
  }
  await page.goto('file:///repo/docs/camera-scenarios.html');
  result.push({scenarios:'all four',...await exercise('#play','#pause','#speed','#time',4)});
  assert.equal(await page.locator('#error').innerText(),'');
  writeFileSync('/artifacts/media-check.json',JSON.stringify({checkedAt:new Date().toISOString(),result},null,2));
  console.log('Both film/before/after triples and all four route/answer videos: complete 1x playback, play/pause, forward/backward seek and quarter speed; comparison images loaded.');
} finally { await browser.close(); }
