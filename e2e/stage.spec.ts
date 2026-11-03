import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

const ARTIFACTS_DIR = 'e2e-artifacts';

test('組の指定がなければ、77番の下の句と29番の上の句を伸ばす印つきで出す', async ({ page }) => {
  await page.goto('/read/rec/');
  const lyrics = page.getByTestId('lyrics');
  await expect(lyrics).toContainText('われてもー末にー逢はむとぞー思ふ心あてにー折らばや折らむー初霜ーのー');
  await expect(lyrics.locator('.nobi')).toHaveCount(7);
});

test('URL の組の指定で、出す歌が替わる', async ({ page }) => {
  await page.goto('/read/rec/?shimo=53&kami=86');
  await expect(page.getByTestId('lyrics')).toContainText('いかにー久しきーものとかはー知る');
});

test('帯は 5・3・1・6 の順に区間の名前と秒数を出し、単位まで読み上げられる', async ({ page }) => {
  await page.goto('/read/rec/');
  const band = page.getByRole('img', { name: '下の句 5秒、余韻 3秒、間 1秒、上の句 6秒' });
  await expect(band).toBeVisible();
  await expect(band.locator('.seg span')).toHaveText(['下の句5', '余韻3', '間1', '上の句6']);
});

for (const [width, height] of [
  [360, 560],
  [393, 659],
  [1280, 720],
]) {
  test(`読む画面の歌詞は ${width}×${height} で歌詞の面からはみ出さない`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/read/rec/');
    const lyrics = await page.getByTestId('lyrics').boundingBox();
    const face = await page.locator('.lyric').boundingBox();
    if (!lyrics || !face) throw new Error('歌詞の面がない');
    expect(lyrics.y).toBeGreaterThanOrEqual(face.y);
    expect(lyrics.y + lyrics.height).toBeLessThanOrEqual(face.y + face.height);
  });

  test(`読む画面の帯の文字は ${width}×${height} で区間から切れない`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/read/rec/');
    await expect(page.getByTestId('lyrics')).toBeVisible();
    const clipped = await page.evaluate(() =>
      [...document.querySelectorAll('.seg span')].filter((span) => span.scrollWidth > span.clientWidth || span.scrollHeight > span.clientHeight).length,
    );
    expect(clipped).toBe(0);
    mkdirSync(ARTIFACTS_DIR, { recursive: true });
    await page.screenshot({ path: join(ARTIFACTS_DIR, `stage-${width}x${height}.png`) });
  });
}
