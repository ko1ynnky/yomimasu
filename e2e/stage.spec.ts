import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';

const ARTIFACTS_DIR = 'e2e-artifacts';

// 読む前の説明は枠に重なるので、枠を見るテストでは閉じた状態から始める。
const skipHelp = (page: Page) => page.addInitScript(() => localStorage.setItem('yomimasu.recHelpDone', '1'));
// 端末に覚えた表記で開く。
const openIn = async (page: Page, notation: 'kanji' | 'kana', path = '/read/rec/') => {
  await page.addInitScript((notation) => localStorage.setItem('yomimasu.kana', notation), notation);
  await page.goto(path);
  await expect(page.getByTestId('lyrics')).toBeVisible();
};

// 区切りごとの本文の文字列で、ふりがなの <rt> を除く。
const bodyTexts = (page: Page) =>
  page.locator('.blk-body').evaluateAll((elements) =>
    elements.map((element) => {
      const copy = element.cloneNode(true) as HTMLElement;
      copy.querySelectorAll('rt').forEach((rt) => rt.remove());
      return copy.textContent ?? '';
    }),
  );
const box = async (target: Locator) => {
  const found = await target.boundingBox();
  if (!found) throw new Error('要素がない');
  return found;
};

test.beforeEach(async ({ page }) => {
  await skipHelp(page);
});

test('歌を右から下の句、余韻と間、上の句の3つの区切りに分け、縦書きの見出しに秒数を添える', async ({ page }) => {
  await openIn(page, 'kanji');
  await expect(page.locator('.blk-head')).toHaveText(['下の句5秒', '余韻3秒間1秒', '上の句6秒']);
  await expect(page.locator('.blk-head').nth(1).locator('br')).toHaveCount(1);
  const [shimo, yoin, kami] = await Promise.all(['shimo', 'yoin-ma', 'kami'].map((phase) => box(page.locator(`.blk[data-phase="${phase}"]`))));
  expect(shimo.x).toBeGreaterThan(yoin.x);
  expect(yoin.x).toBeGreaterThan(kami.x);
  expect(await page.locator('.blk-head .tcy').first().evaluate((element) => getComputedStyle(element).textCombineUpright)).toBe('all');
});

test('下の句の最後の字は余韻と間の区切りへ移して余韻の印を続け、間の字は置かない', async ({ page }) => {
  await openIn(page, 'kanji');
  expect(await bodyTexts(page)).toEqual(['ただー有明のー月ぞ残ーれ', 'る　', 'あはれともーいふべき人はー思ほえーでー']);
  await expect(page.getByTestId('lyrics').locator('.nobi')).toHaveCount(7);
});

test('区切りの見出しの長さと区切りの高さをそろえ、本文はどの区切りも同じ高さから始まる', async ({ page }) => {
  await openIn(page, 'kanji');
  const blocks = await Promise.all((await page.locator('.blk').all()).map(box));
  const bodies = await Promise.all((await page.locator('.blk-body').all()).map(box));
  for (const other of blocks.slice(1)) expect(Math.abs(other.height - blocks[0].height)).toBeLessThan(0.5);
  for (const other of bodies.slice(1)) expect(Math.abs(other.y - bodies[0].y)).toBeLessThan(0.5);
});

test('歌の枠には、上の帯、地の減り、区間名と残り秒数の行を出さない', async ({ page }) => {
  await openIn(page, 'kana');
  await expect(page.locator('.stage .band')).toHaveCount(0);
  await expect(page.locator('.stage .drain')).toHaveCount(0);
  await expect(page.locator('.stage .now')).toHaveCount(0);
});

test('読む前の枠は、どの区切りも囲まず、どの字も朱にしない', async ({ page }) => {
  await openIn(page, 'kana');
  await expect(page.locator('.blk.is-now')).toHaveCount(0);
  const paints = await page.locator('.lyric [data-at]').evaluateAll((elements) => elements.map((element) => (element as HTMLElement).style.getPropertyValue('--p')));
  expect(new Set(paints)).toEqual(new Set(['0.00%']));
  // 朱は読み上げた字だけに使うので、伸ばす印は字と同じ塗りで、余韻の印も黒で出す。
  const look = (target: Locator) => target.evaluate((element) => [getComputedStyle(element).color, getComputedStyle(element).backgroundImage]);
  expect(await look(page.locator('.lyric .nobi').first())).toEqual(await look(page.locator('.lyric [data-at]').first()));
  await expect(page.locator('.lyric .yoin')).toHaveCSS('background-image', 'linear-gradient(rgb(178, 58, 28) 0%, rgb(32, 29, 25) 0%)');
});

test('最初はかなの表記で出し、左上の切り替えで漢字まじりにすると、端末に覚えて次も漢字まじりで開く', async ({ page }) => {
  await page.goto('/read/rec/');
  await expect(page.getByTestId('lyrics')).toBeVisible();
  const notation = page.getByRole('group', { name: '歌の表記' });
  await expect(notation.getByRole('button')).toHaveText(['漢字', 'かな']);
  await expect(notation.getByRole('button', { name: 'かな' })).toHaveAttribute('aria-pressed', 'true');
  expect(await bodyTexts(page)).toEqual(['ただーありあけのーつきぞのこーれ', 'る　', 'あわれともーゆーべきひとわーおもおえーでー']);
  await expect(page.getByTestId('lyrics').locator('rt')).toHaveCount(0);

  await notation.getByRole('button', { name: '漢字' }).click();
  await expect(notation.getByRole('button', { name: '漢字' })).toHaveAttribute('aria-pressed', 'true');
  expect(await bodyTexts(page)).toEqual(['ただー有明のー月ぞ残ーれ', 'る　', 'あはれともーいふべき人はー思ほえーでー']);

  await page.reload();
  await expect(page.getByTestId('lyrics')).toBeVisible();
  await expect(notation.getByRole('button', { name: '漢字' })).toHaveAttribute('aria-pressed', 'true');
  expect(await bodyTexts(page)).toEqual(['ただー有明のー月ぞ残ーれ', 'る　', 'あはれともーいふべき人はー思ほえーでー']);
});

test('URL の組の指定で、出す歌が替わる', async ({ page }) => {
  await openIn(page, 'kanji', '/read/rec/?shimo=53&kami=86');
  expect((await bodyTexts(page))[0]).toBe('いかにー久しきーものとかはー知');
});

test('漢字の表記では、漢字と発音の違う仮名に、実際の発音のふりがなを振る', async ({ page }) => {
  await openIn(page, 'kanji');
  await expect(page.getByTestId('lyrics').locator('rt')).toHaveText(['ありあけ', 'つき', 'のこ', 'わ', 'ゆ', 'ー', 'ひと', 'わ', 'おも', 'お']);
});

test('54番の下の句の四句は、一覧のふりがなの「きょー」に代えて、ユーザーの判断で「今日」に「きょ」、「を」に「お」と振る', async ({ page }) => {
  await openIn(page, 'kanji', '/read/rec/?shimo=54&kami=1');
  await expect(page.locator('.blk[data-phase="shimo"] .ln').first().locator('rt')).toHaveText(['きょ', 'お']);
});

test('余韻の印は最後の字のすぐ下に置いて、「余韻」と読み上げさせる', async ({ page }) => {
  await openIn(page, 'kanji');
  const last = await box(page.locator('.blk[data-phase="yoin-ma"] [data-at]'));
  const mark = await box(page.getByTestId('lyrics').getByRole('img', { name: '余韻' }));
  expect(mark.y).toBeGreaterThanOrEqual(last.y + last.height - 1);
  expect(Math.abs(mark.x + mark.width / 2 - (last.x + last.width / 2))).toBeLessThan(2);
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
      const found = await box(target);
      expect(found.y).toBeGreaterThanOrEqual(face.y);
      expect(found.y + found.height).toBeLessThanOrEqual(face.y + face.height);
      expect(found.x).toBeGreaterThanOrEqual(face.x);
      expect(found.x + found.width).toBeLessThanOrEqual(face.x + face.width);
    }
    const corner = await box(page.getByRole('group', { name: '歌の表記' }));
    expect(corner.x + corner.width).toBeLessThanOrEqual((await box(page.getByTestId('lyrics'))).x);
  });

  test(`読む画面は ${width}×${height} で横にはみ出さず、区切りの見出しが見出しの場所からはみ出さない`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/read/rec/');
    await expect(page.getByTestId('lyrics')).toBeVisible();
    const overflowing = await page.locator('.blk-head').evaluateAll((heads) => heads.filter((head) => head.scrollHeight > head.clientHeight + 1).length);
    expect(overflowing).toBe(0);
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
