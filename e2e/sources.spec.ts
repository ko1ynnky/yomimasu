import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const ARTIFACTS_DIR = 'e2e-artifacts';

test.use({ viewport: { width: 393, height: 659 } });

// 3番は「ん」で終わり、53番は「る」（う）で終わる。
for (const path of ['/karuta/53/', '/karuta/3/', '/soron/', '/saitei/']) {
  test(`${path} から「このアプリについて」の出典へたどれる`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator('main a[href="/about/#sources"]')).toHaveText('このアプリについて');
  });
}

test('1首のページの歌のすぐ下に、伸ばす箇所とふりがな・注・余韻の印の版とページを出す', async ({ page }) => {
  await page.goto('/karuta/53/');
  const mark = page.locator('.karuta-page > .poem + .src');
  await expect(mark).toHaveText('伸ばす箇所 抜粋版 p.7、ふりがな・注・余韻の印 冊子 p.7');
  const poem = await page.locator('.karuta-page > .poem').boundingBox();
  const box = await mark.boundingBox();
  expect(box!.y - (poem!.y + poem!.height)).toBeLessThanOrEqual(10);
});

// 2026-11-07 のユーザーの判断：教科書のページの出典の印は、段落の終わりに小さく付け、印の途中で折り返さない。
// 15番は協会の資料の項目、17番は読手メモと協会の資料の助言、1番は大会向けの読手メモ、77番は協会の資料と読手メモが並ぶ助言がある。
for (const path of ['/karuta/15/', '/karuta/17/', '/karuta/1/', '/karuta/77/', '/soron/', '/saitei/']) {
  test(`${path} の出典の印は段落の終わりにあり、印の途中で折り返さない`, async ({ page }) => {
    await page.goto(path);
    const marks = await page.locator('main p > span.src').evaluateAll((all) =>
      all.map((mark) => ({
        text: mark.textContent ?? '',
        last: mark.parentElement!.lastChild === mark,
        oneLine: mark.getBoundingClientRect().height < parseFloat(getComputedStyle(mark).lineHeight) * 1.5,
      })),
    );
    expect(marks.length, path).toBeGreaterThan(0);
    for (const { text, last, oneLine } of marks) {
      expect(text, path).toMatch(/^— /);
      expect(last, text).toBe(true);
      expect(oneLine, text).toBe(true);
    }
  });
}

test('1首のページの助言の印は、協会の資料を先に、読手メモを後に並べる', async ({ page }) => {
  await page.goto('/karuta/77/');
  await expect(page.locator('main p > span.src[data-ref="読手のメモ1 長音の一覧"]')).toHaveText('— 読み方一覧（冊子 p.15）、読手メモより');
});

test('1首のページの図の下から、口の形の資料の見出しへ移れる', async ({ page }) => {
  await page.goto('/karuta/53/');
  const link = page.locator('figure.mouths a[href="/about/#src-phonetics"]');
  await expect(link).toHaveText('Wikipedia ほか');
  await link.click();
  await expect(page).toHaveURL(/\/about\/#src-phonetics$/);
  await expect(page.locator('#src-phonetics')).toHaveText('口の形と「ん」の位置の図');
  await expect(page.locator('#src-phonetics')).toBeInViewport();
});

test('「ん」で終わる札の図の下から、「ん」を実測した研究の見出しへ移れる', async ({ page }) => {
  await page.goto('/karuta/3/');
  await page.locator('figure.mouths a[href="/about/#src-research"]').click();
  await expect(page).toHaveURL(/\/about\/#src-research$/);
  await expect(page.locator('#src-research')).toBeInViewport();
});

test('このアプリについての出典に、Wikipedia の5つの記事へのリンクと CC BY-SA 4.0 を出す', async ({ page }) => {
  await page.goto('/about/');
  const wikipedia = page.locator('#src-phonetics + .card a[href*="wikipedia.org/wiki/"]');
  await expect(wikipedia).toHaveCount(5);
  await expect(page.locator('#src-phonetics + .card')).toContainText('CC BY-SA 4.0');
  for (const id of ['src-uta', 'src-text', 'src-lecture', 'src-memo', 'src-author', 'src-research', 'src-audio']) {
    await expect(page.locator(`#${id}`), id).toBeVisible();
  }

  // 出典の見出しから最後の資料のカードまでを、1枚の画像に撮る。
  await page.locator('#src-audio + .card').scrollIntoViewIfNeeded();
  const clip = await page.evaluate(() => {
    const top = document.getElementById('sources')!.getBoundingClientRect().top + scrollY;
    const bottom = document.querySelector('#src-audio + .card')!.getBoundingClientRect().bottom + scrollY;
    return { x: 0, y: top - 8, width: innerWidth, height: bottom - top + 16 };
  });
  mkdirSync(ARTIFACTS_DIR, { recursive: true });
  await page.screenshot({ path: join(ARTIFACTS_DIR, 'about-sources-393.png'), fullPage: true, clip });
});
