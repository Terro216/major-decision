import { test, expect } from '@playwright/test';
import { installMetrics } from '../src/metricsClient';

async function inject(page: import('@playwright/test').Page, host?: string, url?: string) {
  await page.evaluate(`(${installMetrics.toString()})(${JSON.stringify(host) ?? 'undefined'}, ${JSON.stringify(url) ?? 'undefined'})`);
}

test('analytics stays disabled without configuration or on another host', async ({ page }) => {
  await page.goto('/');
  await inject(page);
  await inject(page, 'example.invalid', 'https://metrics.example.invalid/script.js');
  expect(await page.evaluate(() => window.__siteMetricsLoaded)).toBeUndefined();
  await expect(page.locator('script[src*="metrics.example.invalid"]')).toHaveCount(0);
});

test('analytics redacts URL details and loads only once', async ({ page }) => {
  await page.route('https://metrics.example.invalid/**', route => route.fulfill({ contentType: 'text/javascript', body: '' }));
  await page.goto('/?question=synthetic-private-question#synthetic-private-answer');
  const host = new URL(page.url()).hostname;
  await inject(page, host, 'https://metrics.example.invalid/script.js');
  await inject(page, host, 'https://metrics.example.invalid/script.js');
  await expect(page.locator('script[src*="metrics.example.invalid"]')).toHaveCount(1);
  const result = await page.evaluate(() => {
    const options = window.plausible!.o as { transformRequest: (payload: unknown) => unknown };
    return options.transformRequest({
      u: 'https://user:password@example.invalid/room/private-code?question=private#answer',
      p: { url: 'https://example.invalid/room/another-code?secret=value#answer' },
    });
  });
  expect(result).toEqual({ u: `https://${host}/room/:code`, r: null, p: { url: 'https://example.invalid/room/:code' } });
});

test('analytics refuses non-HTTPS and credential-bearing script URLs', async ({ page }) => {
  await page.goto('/');
  const host = new URL(page.url()).hostname;
  await inject(page, host, 'invalid URL');
  await inject(page, host, 'http://metrics.example.invalid/script.js');
  await inject(page, host, 'https://user:password@metrics.example.invalid/script.js');
  expect(await page.evaluate(() => window.__siteMetricsLoaded)).toBeUndefined();
});
