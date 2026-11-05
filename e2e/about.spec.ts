import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const ARTIFACTS_DIR = 'e2e-artifacts';
const ENGLISH = 'Independent project. Not affiliated with or endorsed by the All-Japan Karuta Association or Anthropic.';

test('JS なしでも、日本語の断りと lang="en" の英語の文と出典を読める', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
  const page = await context.newPage();
  await page.goto('/about/');
  const main = page.locator('main');
  await expect(main).toContainText('全日本かるた協会の公認を受けていません');
  await expect(main).toContainText('Anthropic の製品やデモではありません');
  await expect(main.locator('[lang="en"]', { hasText: ENGLISH })).toHaveText(ENGLISH);
  await expect(page.getByRole('heading', { name: '出典' })).toBeVisible();
  await expect(main).toContainText('録音は端末の外へ出ません。');
  await expect(page.getByRole('link', { name: 'NOTICE.md' })).toHaveAttribute('href', /NOTICE\.md$/);
  await context.close();
});

test('このアプリについては、実行の行と読んだ行を出す', async ({ page }) => {
  await page.goto('/about/');
  await expect(page.locator('.run')).toContainText('/yomimasu このアプリについて');
  await expect(page.locator('.run .read')).toHaveText('● Read このアプリについて.md');
});

for (const width of [360, 393]) {
  test(`幅 ${width}px で、このアプリについてに横スクロールがない`, async ({ page }) => {
    mkdirSync(ARTIFACTS_DIR, { recursive: true });
    await page.setViewportSize({ width, height: 659 });
    await page.goto('/about/');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width === 393) await page.screenshot({ path: join(ARTIFACTS_DIR, 'about.png'), fullPage: true });
  });
}
