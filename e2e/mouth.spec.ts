import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const ARTIFACTS_DIR = 'e2e-artifacts';
const SOUNDS = ['あ', 'い', 'う', 'え', 'お', 'ん'];
const mouthName = (sound: string) => `「${sound}」の口の形。正面から見た唇と、横から見た口の中`;

// 3番は「ねん」で終わり、53番は「る」（う）で終わる。
test.use({ viewport: { width: 393, height: 659 } });

// ポイントを知るの口の形の図と「ん」の説明は、「余韻が消えるまで口の形を変えない」の行（#yoin-oto）の中にたたんである。
const openYoinRow = (page: Page) => page.locator('#yoin-oto > summary').click();

test('ポイントを知るは、JS なしでも、余韻の口の形の行を開くと6つの音の口の形と、「ん」で終わる札の数を出す', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL, viewport: { width: 393, height: 659 } });
  const page = await context.newPage();
  await page.goto('/point/');
  await expect(page.getByRole('img', { name: mouthName('あ') })).toBeHidden();
  await openYoinRow(page);
  for (const sound of SOUNDS) await expect(page.getByRole('img', { name: mouthName(sound) })).toBeVisible();
  await expect(page.locator('#yoin-oto')).toContainText(/「ん」で終わる札は\d+首で、/);
  await context.close();
});

test('「ん」の説明は、余韻の口の形の行の中でさらに折りたたんであり、開くと断面の図が出る', async ({ page }) => {
  await page.goto('/point/');
  const nasal = page.getByRole('img', { name: /「ん」の口の中の位置/ });
  await openYoinRow(page);
  await expect(nasal).toBeHidden();
  await page.getByText('「ん」は、口の中のどこで作るか').click();
  await expect(nasal).toBeVisible();
  await expect(page.locator('#yoin-n')).toContainText('このアプリの解釈');
  mkdirSync(ARTIFACTS_DIR, { recursive: true });
  await page.locator('#yoin-oto').screenshot({ path: join(ARTIFACTS_DIR, 'mouth-point-393.png') });
});

test('1首のページは、その札の最後の音の口の形だけを出す', async ({ page }) => {
  await page.goto('/karuta/53/');
  await expect(page.getByRole('img', { name: mouthName('う') })).toBeVisible();
  for (const sound of SOUNDS.filter((s) => s !== 'う')) await expect(page.getByRole('img', { name: mouthName(sound) })).toHaveCount(0);
  await expect(page.getByRole('img', { name: '余韻' })).toBeVisible();
});

test('「ん」で終わる札の1首のページから、「ん」の説明を開いた所へ移れる', async ({ page }) => {
  await page.goto('/karuta/3/');
  await expect(page.getByRole('img', { name: mouthName('ん') })).toBeVisible();
  mkdirSync(ARTIFACTS_DIR, { recursive: true });
  await page.locator('figure.mouths').screenshot({ path: join(ARTIFACTS_DIR, 'mouth-karuta-3-393.png') });
  await page.getByRole('link', { name: 'ポイントを知る' }).last().click();
  await expect(page).toHaveURL(/\/point\/#yoin-n$/);
  await expect(page.getByText('「ん」は、口の中のどこで作るか')).toBeInViewport();
  await expect(page.getByRole('img', { name: /「ん」の口の中の位置/ })).toBeVisible();
});

test('図は 320px の幅でも横にはみ出さない', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  for (const path of ['/point/', '/karuta/3/']) {
    await page.goto(path);
    await page.locator('main details').evaluateAll((all) => all.forEach((details) => ((details as HTMLDetailsElement).open = true)));
    expect(await page.evaluate(() => document.documentElement.scrollWidth), path).toBeLessThanOrEqual(320);
  }
});

test('「ん」の断面の図の文字は、320px の幅でも 13px より小さくならない', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/point/');
  await openYoinRow(page);
  await page.getByText('「ん」は、口の中のどこで作るか').click();
  const sizes = await page.locator('.nasal-svg text').evaluateAll((texts) =>
    (texts as SVGTextElement[]).map((text) => {
      const svg = text.ownerSVGElement!;
      return (parseFloat(getComputedStyle(text).fontSize) * svg.getBoundingClientRect().width) / svg.viewBox.baseVal.width;
    }),
  );
  expect(sizes.length).toBeGreaterThan(0);
  for (const size of sizes) expect(size).toBeGreaterThanOrEqual(13);
});
