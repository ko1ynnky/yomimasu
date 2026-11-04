import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const ARTIFACTS_DIR = 'e2e-artifacts';

// 読む前の説明は枠に重なるので、枠を見るテストでは閉じた状態から始める。
const skipHelp = (page: Page) => page.addInitScript(() => localStorage.setItem('yomimasu.recHelpDone', '1'));

// ふりがなの <rt> を除いた、歌の本文だけの文字列である。
const lyricText = (page: Page) =>
  page.getByTestId('lyrics').evaluate((element) => {
    const copy = element.cloneNode(true) as HTMLElement;
    copy.querySelectorAll('rt').forEach((rt) => rt.remove());
    return copy.textContent ?? '';
  });

test.beforeEach(async ({ page }) => {
  await skipHelp(page);
});

test('組の指定がなければ、81番の下の句と45番の上の句を伸ばす印つきで出す', async ({ page }) => {
  await page.goto('/read/rec/');
  await expect(page.getByTestId('lyrics')).toBeVisible();
  expect(await lyricText(page)).toBe('ただー有明のー月ぞ残ーれる　あはれともーいふべき人はー思ほえーでー');
  await expect(page.getByTestId('lyrics').locator('.nobi')).toHaveCount(7);
});

test('URL の組の指定で、出す歌が替わる', async ({ page }) => {
  await page.goto('/read/rec/?shimo=53&kami=86');
  await expect(page.getByTestId('lyrics')).toBeVisible();
  expect(await lyricText(page)).toContain('いかにー久しきーものとかはー知る');
});

test('漢字と発音の違う仮名に、実際の発音のふりがなを振る', async ({ page }) => {
  await page.goto('/read/rec/');
  await expect(page.getByTestId('lyrics').locator('rt')).toHaveText(['ありあけ', 'つき', 'のこ', 'わ', 'ゆ', 'ー', 'ひと', 'わ', 'おも', 'お']);
});

test('下の句の最後の字のあとに余韻の印を置き、「余韻」と読み上げさせる', async ({ page }) => {
  await page.goto('/read/rec/');
  const mark = page.getByTestId('lyrics').getByRole('img', { name: '余韻' });
  await expect(mark).toBeVisible();
  const last = await page.getByTestId('lyrics').locator('.cue').boundingBox();
  const box = await mark.boundingBox();
  if (!last || !box) throw new Error('最後の字か余韻の印がない');
  expect(box.y).toBeGreaterThanOrEqual(last.y + last.height - 1);
  expect(Math.abs(box.x + box.width / 2 - (last.x + last.width / 2))).toBeLessThan(2);
});

test('帯は 5・3・1・6 の順に区間の名前と秒数を出し、単位まで読み上げられる', async ({ page }) => {
  await page.goto('/read/rec/');
  const band = page.getByRole('img', { name: '下の句 5秒、余韻 3秒、間 1秒、上の句 6秒' });
  await expect(band).toBeVisible();
  await expect(band.locator('.seg span')).toHaveText(['下の句5', '余韻3', '間1', '上の句6']);
});

test('読む前の枠は、下の句の名前と標準の残り秒数を出して止まる', async ({ page }) => {
  await page.goto('/read/rec/');
  await expect(page.locator('.now b')).toHaveText('下の句（5秒程度）');
  await expect(page.locator('.now span')).toHaveText('5.0');
});

for (const [width, height] of [
  [320, 560],
  [360, 560],
  [360, 640],
  [375, 667],
  [375, 812],
  [393, 659],
  [1280, 720],
]) {
  test(`読む画面の歌詞と余韻の印は ${width}×${height} で歌詞の面からはみ出さない`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/read/rec/');
    await expect(page.getByTestId('lyrics')).toBeVisible();
    const face = await page.locator('.lyric').boundingBox();
    if (!face) throw new Error('歌詞の面がない');
    for (const target of [page.getByTestId('lyrics'), page.getByRole('img', { name: '余韻', exact: true })]) {
      const box = await target.boundingBox();
      if (!box) throw new Error('歌詞か余韻の印がない');
      expect(box.y).toBeGreaterThanOrEqual(face.y);
      expect(box.y + box.height).toBeLessThanOrEqual(face.y + face.height);
      expect(box.x).toBeGreaterThanOrEqual(face.x);
      expect(box.x + box.width).toBeLessThanOrEqual(face.x + face.width);
    }
  });

  test(`読む画面は ${width}×${height} で横にはみ出さず、帯の文字が区間から切れない`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/read/rec/');
    await expect(page.getByTestId('lyrics')).toBeVisible();
    const clipped = await page.evaluate(() =>
      [...document.querySelectorAll('.seg span')].filter((span) => span.scrollWidth > span.clientWidth || span.scrollHeight > span.clientHeight).length,
    );
    expect(clipped).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    mkdirSync(ARTIFACTS_DIR, { recursive: true });
    await page.screenshot({ path: join(ARTIFACTS_DIR, `stage-${width}x${height}.png`) });
  });
}

for (const [width, height] of [
  [360, 560],
  [393, 659],
]) {
  test(`録音の画面は ${width}×${height} の1画面に収まる`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/read/rec/');
    await expect(page.getByRole('button', { name: '読み始める' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);
  });
}
