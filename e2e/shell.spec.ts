import { expect, test } from '@playwright/test';

const PAGES = ['/', '/read/', '/read/rec/', '/practice/', '/result/'];

test('JS なしでも本文を読める', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.locator('main')).toContainText('読みを録音して');
  await context.close();
});

for (const path of PAGES) {
  test(`${path} は共通の枠と見た目で開き、上の帯から入口へ戻れる`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator('header.bar a')).toHaveAttribute('href', '/');
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(246, 242, 233)');
  });
}

for (const width of [360, 393]) {
  test(`幅 ${width}px で、どのページにも横スクロールがない`, async ({ page }) => {
    await page.setViewportSize({ width, height: 659 });
    for (const path of PAGES) {
      await page.goto(path);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), path).toBe(true);
    }
  });
}

test('道具の画面は実行の行だけを出し、入力の行を出さない', async ({ page }) => {
  await page.goto('/read/rec/');
  await expect(page.locator('.run')).toContainText('/yomimasu 読む ほ あはれ');
  await expect(page.locator('.ask-line')).toHaveCount(0);
});

test('録音がないまま結果を開くと、まず1回読むへ案内する', async ({ page }) => {
  await page.goto('/result/');
  await expect(page.getByRole('status')).toContainText('まだ録音がありません');
  await expect(page.getByRole('link', { name: 'まず1回読む' })).toHaveAttribute('href', '/read/');
});
