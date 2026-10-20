import type { Page } from '@playwright/test';

// Read the actual WebGL buffer, before fractional CSS bounds and compositor
// resampling. Retention is enabled only in the requesting test page.
export async function webglCapture(page: Page) {
  await page.addInitScript(() => {
    const original=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(kind: string,...options: unknown[]) {
      if(kind==='webgl2') options[0]={...(options[0] as object ?? {}),preserveDrawingBuffer:true};
      return original.apply(this,[kind,...options] as any);
    } as typeof original;
  });
  return async () => Buffer.from((await page.locator('.scene-canvas').evaluate(canvas => {
    const gl=(canvas as HTMLCanvasElement).getContext('webgl2')!;
    if(!gl.getContextAttributes()?.preserveDrawingBuffer) throw new Error('Replay capture must retain the WebGL buffer');
    gl.finish();
    return (canvas as HTMLCanvasElement).toDataURL('image/png');
  })).split(',')[1],'base64');
}
