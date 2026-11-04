import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const ARTIFACTS_DIR = 'e2e-artifacts';

// 教科書の4つの入口と、1首のページの例。11番は決まり字が6字、95番は注が3か所、99番は別の読みがある。序歌は決まり字がない。
const PAGES: Record<string, { path: string; text: string }> = {
  soron: { path: '/soron/', text: '読みの1組は、この配分で15秒です。' },
  saitei: { path: '/saitei/', text: '読む札を間違えない' },
  point: { path: '/point/', text: '知っておきたいポイント' },
  karuta: { path: '/karuta/', text: '100首と序歌' },
  'karuta-53': { path: '/karuta/53/', text: '気をつける点' },
  'karuta-joka': { path: '/karuta/joka/', text: '序歌は下の句を2回読む' },
  'karuta-11': { path: '/karuta/11/', text: '大山札' },
  'karuta-95': { path: '/karuta/95/', text: '括弧つきの注' },
  'karuta-99': { path: '/karuta/99/', text: '別の読み' },
};

test('JS なしでも、教科書のどのページも本文を読め、ほかのページへ移れる', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
  const page = await context.newPage();
  for (const { path, text } of Object.values(PAGES)) {
    await page.goto(path);
    await expect(page.locator('main'), path).toContainText(text);
    await expect(page.locator('main'), path).not.toContainText('{{札');
  }
  await page.goto('/karuta/');
  await expect(page.locator('[data-controls]')).toBeHidden();
  await page.getByRole('link', { name: 'なげき', exact: true }).click();
  await expect(page).toHaveURL(/\/karuta\/53\/$/);
  await context.close();
});

test('教科書のページは、ファイルの名前を読んだ行に、決まり字を1首のコマンドに出す', async ({ page }) => {
  await page.goto('/soron/');
  await expect(page.locator('.run')).toContainText('/yomimasu 総論を学ぶ');
  await expect(page.locator('.run .read')).toHaveText('● Read 総論.md');
  await page.goto('/karuta/53/');
  await expect(page.locator('.run')).toContainText('/yomimasu 1首 なげき');
  await expect(page.locator('.run .read')).toHaveText('● Read なげき.md');
});

test('1首のページは歌番号を出さず、決まり字と縦書きの歌を出す', async ({ page }) => {
  await page.goto('/karuta/53/');
  await expect(page.locator('.poem .kim')).toHaveText('なげき');
  expect(await page.locator('.poem .tate').evaluate((el) => getComputedStyle(el).writingMode)).toBe('vertical-rl');
  await expect(page.locator('main')).not.toContainText('53番');
  await expect(page.getByRole('img', { name: '余韻' })).toBeVisible();
});

test('総論の帯は、読む画面と同じ部品で 5・3・1・6 を出す', async ({ page }) => {
  await page.goto('/soron/');
  await expect(page.getByRole('img', { name: '下の句 5秒、余韻 3秒、間 1秒、上の句 6秒' })).toBeVisible();
});

test('最低限これだけから、1回の操作でまず1回読むへ進める', async ({ page }) => {
  await page.goto('/saitei/');
  await page.getByRole('link', { name: 'まず1回読む' }).click();
  await expect(page).toHaveURL(/\/read\/$/);
});

test('100首の一覧は、決まり字順と歌番号順、多い→少ないと少ない→多いを切り替えられる', async ({ page }) => {
  await page.goto('/karuta/');
  const heads = () => page.locator('[data-view]:visible .group-head b').allTextContents();
  expect((await heads()).slice(0, 3)).toEqual(['あ', 'な', 'お']);

  await page.getByRole('button', { name: '少ない→多い' }).click();
  await expect(page.getByRole('button', { name: '少ない→多い' })).toHaveAttribute('aria-pressed', 'true');
  expect((await heads()).slice(0, 3)).toEqual(['む', 'す', 'め']);

  await page.getByRole('button', { name: '歌番号順' }).click();
  await expect(page.getByRole('button', { name: '少ない→多い' })).toBeHidden();
  await expect(page.locator('[data-view="number"] a').first()).toContainText('1番');
  await expect(page.locator('[data-view="number"] a')).toHaveCount(100);

  await page.getByRole('button', { name: '決まり字順' }).click();
  expect((await heads()).slice(0, 1)).toEqual(['む']);
});

for (const width of [360, 393]) {
  test(`幅 ${width}px で、教科書のどのページにも横スクロールがない`, async ({ page }) => {
    mkdirSync(ARTIFACTS_DIR, { recursive: true });
    await page.setViewportSize({ width, height: 659 });
    for (const [name, { path }] of Object.entries(PAGES)) {
      await page.goto(path);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), path).toBe(true);
      if (width === 393) await page.screenshot({ path: join(ARTIFACTS_DIR, `textbook-${name}.png`), fullPage: true });
    }
  });
}

test('1首のページはどの札も開け、上の帯から入口へ戻れる', async ({ page }) => {
  test.setTimeout(120_000);
  for (const no of ['joka', ...Array.from({ length: 100 }, (_, i) => String(i + 1))]) {
    const response = await page.goto(`/karuta/${no}/`);
    expect(response?.status(), no).toBe(200);
    await expect(page.locator('header.bar a'), no).toHaveAttribute('href', '/');
    await expect(page.locator('.points').first(), no).toBeVisible();
  }
});
