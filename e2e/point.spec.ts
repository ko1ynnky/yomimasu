import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const ARTIFACTS_DIR = 'e2e-artifacts';

// テーマの名前と順、51枚は、2026-11-06 にユーザーが決めた案 B（docs/decisions.md）。
const THEMES = ['1組と、余韻と間', '決まり字まで', '読み間違いと札の扱い', '伸ばす所', '声と発音', '仮名の読み方', '試合の進め方', '練習のしかた'];
const ROW_COUNT = 51;
const RANK: Record<string, number> = { '優先 高': 0, '優先 中': 1, '優先 低': 2 };

test.use({ viewport: { width: 393, height: 659 } });

const rows = (page: Page) => page.locator('main details.pt');
const toc = (page: Page) => page.getByRole('navigation', { name: 'テーマ' });
const nasalSummary = (page: Page) => page.getByText('「ん」は、口の中のどこで作るか');

test('ポイントを知るは、8つのテーマの見出しと、それぞれへ移る目次を出し、目次の数はそのテーマの行の数である', async ({ page }) => {
  await page.goto('/point/');
  await expect(page.locator('.screen > h3')).toHaveText(THEMES);
  const links = toc(page).getByRole('link');
  await expect(links).toHaveCount(THEMES.length);
  let total = 0;
  for (const [i, name] of THEMES.entries()) {
    const link = links.nth(i);
    const id = (await link.getAttribute('href'))?.replace(/^#/, '') ?? '';
    await expect(page.locator(`h3[id="${id}"]`), name).toHaveText(name);
    const count = await page.locator(`h3[id="${id}"] + .pts > details.pt`).count();
    await expect(link.locator('small'), name).toHaveText(String(count));
    total += count;
  }
  expect(total).toBe(ROW_COUNT);
});

test('行は最初はすべて閉じていて、見出しを押すと本文と出典の印が開き、もう一度押すと閉じる', async ({ page }) => {
  await page.goto('/point/');
  await expect(rows(page)).toHaveCount(ROW_COUNT);
  expect(await rows(page).evaluateAll((all) => all.filter((row) => (row as HTMLDetailsElement).open).length)).toBe(0);
  const row = rows(page).first();
  await expect(row.locator('.pt-body')).toBeHidden();
  await row.locator('summary').click();
  await expect(row.locator('.pt-body p').first()).toBeVisible();
  await expect(row.locator('.pt-body .src').first()).toBeVisible();
  await row.locator('summary').click();
  await expect(row.locator('.pt-body')).toBeHidden();
});

test('どの行にも優先の札があり、テーマの中は高、中、低の順に並び、高だけを朱にする', async ({ page }) => {
  await page.goto('/point/');
  const themes = await page.locator('.screen > .pts').evaluateAll((lists) =>
    lists.map((list) => [...list.querySelectorAll(':scope > details.pt > summary .prio')].map((prio) => ({ text: prio.textContent ?? '', hi: prio.classList.contains('prio--hi') }))),
  );
  expect(themes).toHaveLength(THEMES.length);
  expect(themes.flat()).toHaveLength(ROW_COUNT);
  for (const labels of themes) {
    const ranks = labels.map(({ text }) => RANK[text]);
    expect(ranks.every((rank) => rank !== undefined), JSON.stringify(labels)).toBe(true);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    for (const { text, hi } of labels) expect(hi, text).toBe(text === '優先 高');
  }
});

test('開け閉めと目次のリンクでは、入力の行に何も打ち込まず、画面を入れ替えない', async ({ page }) => {
  await page.goto('/point/');
  await page.locator('main [data-typed]').evaluate((line) => {
    const typed: string[] = [];
    (window as unknown as { typed: string[] }).typed = typed;
    new MutationObserver(() => typed.push(line.textContent ?? '')).observe(line, { childList: true, characterData: true, subtree: true });
  });
  const row = rows(page).first();
  await row.locator('summary').click();
  await row.locator('summary').click();
  await toc(page).getByRole('link', { name: /練習のしかた/ }).click();
  await expect(page).toHaveURL(/\/point\/#t-renshu$/);
  await expect(page.locator('#t-renshu')).toBeInViewport();
  // 殻が打ち込むなら、押してから 280ms で打ち込み、90ms 置いて動く（docs/ui-guide.md の8節）。それより長く待って、何も起きないことを見る。
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => (window as unknown as { typed: string[] }).typed)).toEqual([]);
  await expect(page.locator('main .ask')).not.toHaveClass(/is-sent/);
  await expect(page.locator('main .run')).toContainText('/yomimasu ポイントを知る');
});

test('JS を切っても、見出しを押すと開き、目次で移れる', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL, viewport: { width: 393, height: 659 } });
  const page = await context.newPage();
  await page.goto('/point/');
  const row = rows(page).first();
  await row.locator('summary').click();
  await expect(row.locator('.pt-body p').first()).toBeVisible();
  await toc(page).getByRole('link', { name: /練習のしかた/ }).click();
  await expect(page).toHaveURL(/\/point\/#t-renshu$/);
  await expect(page.locator('#t-renshu')).toBeInViewport();
  await context.close();
});

test('/point/#yoin-n を直接開くと、「ん」の折りたたみとそれを含む行が開き、画面に入る', async ({ page }) => {
  await page.goto('/point/#yoin-n');
  await expect(page.locator('#yoin-oto')).toHaveAttribute('open', '');
  await expect(page.locator('#yoin-n')).toHaveAttribute('open', '');
  await expect(nasalSummary(page)).toBeInViewport();
  await expect(page.getByRole('img', { name: /「ん」の口の中の位置/ })).toBeVisible();
});

test('ページの中で hash が変わると、その先を含むたたんだ行を開いて、そこへ移る', async ({ page }) => {
  await page.goto('/point/');
  await expect(page.locator('#yoin-oto')).not.toHaveAttribute('open');
  await page.evaluate(() => {
    location.hash = 'yoin-n';
  });
  await expect(page.locator('#yoin-oto')).toHaveAttribute('open', '');
  await expect(page.locator('#yoin-n')).toHaveAttribute('open', '');
  await expect(nasalSummary(page)).toBeInViewport();
});

test('ページの終わりから、このアプリについての出典へたどれる', async ({ page }) => {
  await page.goto('/point/');
  await expect(page.locator('main a[href="/about/#sources"]')).toHaveText('このアプリについて');
});

for (const [width, height] of [
  [393, 659],
  [320, 640],
]) {
  test(`幅 ${width}px で、ポイントを知るに横スクロールがなく、行と目次の押せる高さが 44px 以上`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/point/');
    const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
    expect(await fits(), '閉じたまま').toBe(true);
    // 開いた本文と図もはみ出さないよう、折りたたみをすべて開いて測り直す。
    await page.locator('main details').evaluateAll((all) => all.forEach((details) => ((details as HTMLDetailsElement).open = true)));
    expect(await fits(), 'すべて開いて').toBe(true);
    const heights = await page.locator('main details > summary, main .toc a').evaluateAll((targets) => targets.map((target) => target.getBoundingClientRect().height));
    expect(heights.length).toBe(ROW_COUNT + 1 + THEMES.length);
    expect(Math.min(...heights)).toBeGreaterThanOrEqual(44);
  });
}

test('393×659 の最初の画面、1行を開いた画面、ページ全体の画像を残す', async ({ page }) => {
  mkdirSync(ARTIFACTS_DIR, { recursive: true });
  await page.goto('/point/');
  await page.screenshot({ path: join(ARTIFACTS_DIR, 'point-393-first.png') });
  const row = rows(page).first();
  await row.locator('summary').click();
  await page.locator('#t-yoin').evaluate((heading) => heading.scrollIntoView());
  await expect(row.locator('.pt-body p').first()).toBeInViewport();
  await page.screenshot({ path: join(ARTIFACTS_DIR, 'point-393-open.png') });
  await row.locator('summary').click();
  await page.screenshot({ path: join(ARTIFACTS_DIR, 'point-393-full.png'), fullPage: true });
});
