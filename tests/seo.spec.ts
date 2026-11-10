import { test, expect } from '@playwright/test';

const origin = 'https://decision.ilyamedve.dev';

for (const [path, language, film] of [['/', 'en', 'Interstate 60'], ['/ru/', 'ru', 'Трассы 60']] as const) {
  test(`${language} page exposes its description, language links and metadata without JavaScript`, async ({ browser, request }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    try {
      const page = await context.newPage();
      const response = await page.goto(`http://127.0.0.1:4173${path}`);
      expect(response?.status()).toBe(200);
      await expect(page.locator('html')).toHaveAttribute('lang', language);
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
      await expect(page.getByRole('heading', { level: 1 })).toContainText(film);
      await expect(page.locator('.about-intro')).toBeVisible();
      expect(await page.title()).toContain(film);
      await expect(page.locator('link[rel=canonical]')).toHaveAttribute('href', origin + path);
      for (const [lang, target] of [['en', '/'], ['ru', '/ru/'], ['x-default', '/']]) {
        await expect(page.locator(`link[hreflang="${lang}"]`)).toHaveAttribute('href', origin + target);
      }
      await expect(page.locator('.language-nav [aria-current=page]')).toHaveAttribute('hreflang', language);
      await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', origin + path);
      expect(await page.locator('meta[name=description]').getAttribute('content')).toBe(await page.locator('meta[property="og:description"]').getAttribute('content'));
      await expect(page.locator('meta[name=robots]')).toHaveCount(0);
      const clips = page.locator('.film-links a');
      await expect(clips).toHaveCount(2);
      for (const [index, start] of [[0, '396s'], [1, '515s']] as const) {
        const url = new URL((await clips.nth(index).getAttribute('href'))!);
        expect(url.hostname).toBe('www.youtube.com');
        expect(url.searchParams.get('v')).toBe('RMNhryXGjr8');
        expect(url.searchParams.get('t')).toBe(start);
        await expect(clips.nth(index)).toHaveAttribute('target', '_blank');
      }
      const imageUrl = new URL((await page.locator('meta[property="og:image"]').getAttribute('content'))!);
      const image = await request.get(imageUrl.pathname);
      expect(image.status()).toBe(200);
      expect(image.headers()['content-type']).toContain('image/png');
      const bytes = await image.body();
      expect(bytes.subarray(1, 4).toString()).toBe('PNG');
      expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([1200, 630]);
      await page.locator(`.language-nav a[hreflang="${language === 'en' ? 'ru' : 'en'}"]`).click();
      await expect(page.locator('html')).toHaveAttribute('lang', language === 'en' ? 'ru' : 'en');
    } finally { await context.close(); }
  });
}

test('sitemap lists both canonical pages and robots permits their discovery', async ({ request }) => {
  const robots = await request.get('/robots.txt');
  expect(robots.status()).toBe(200);
  expect(await robots.text()).toContain(`Sitemap: ${origin}/sitemap.xml`);
  expect(await robots.text()).not.toMatch(/Disallow:\s*\//);
  const sitemap = await request.get('/sitemap.xml');
  expect(sitemap.status()).toBe(200);
  const urls = [...(await sitemap.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
  expect(urls.sort()).toEqual([`${origin}/`, `${origin}/ru/`]);
});

test('Russian page retains English film controls and question privacy', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const requests: string[] = [];
  page.on('request', request => requests.push(request.url()));
  await page.goto('/ru/');
  await expect(page.locator('main')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  for (const name of ['HOROSCOPE', 'ROMANCE', 'CAREER']) await expect(page.getByRole('button', { name })).toBeDisabled();
  const question = page.getByRole('textbox', { name: 'Your question' });
  await question.fill('Сохранится ли мой секретный вопрос?');
  await page.getByRole('button', { name: 'Ask the question' }).click();
  await expect(page.getByRole('status')).toHaveText(/YES|NO/, { timeout: 30_000 });
  expect(requests.every(url => new URL(url).origin === 'http://127.0.0.1:4173')).toBe(true);
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
  expect(new URL(page.url()).search).toBe('');
  await page.getByRole('button', { name: 'NEW QUESTION' }).click();
  await expect(question).toHaveValue('');
});

test('diagnostic pages declare noindex, including encoded review values', async ({ page }) => {
  await page.goto('/ru/?review=%31');
  await expect(page.locator('meta[name=robots]')).toHaveAttribute('content', 'noindex');
  await expect(page.locator('.review-controls')).toBeVisible();
  await page.goto('/ru/');
  await expect(page.locator('meta[name=robots]')).toHaveCount(0);
});
