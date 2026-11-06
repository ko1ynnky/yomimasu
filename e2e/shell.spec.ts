import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test, type Locator, type Page } from '@playwright/test';
import { standardReading, synthesize } from '../test/support/synth.ts';
import { encodeWav } from '../test/support/wav.ts';

const PAGES = ['/', '/read/', '/read/rec/', '/practice/', '/result/', '/result/compare/'];
const ARTIFACTS_DIR = 'e2e-artifacts';

test('JS なしでも、入口の題と一覧を読め、一覧から移れる', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.locator('main h1')).toHaveText('「読みます」と言うために。');
  await page.getByRole('link', { name: /\/総論を学ぶ/ }).click();
  await expect(page).toHaveURL(/\/soron\/$/);
  await expect(page.locator('main')).toContainText('読みの1組は、この配分で15秒です。');
  await expect(page.getByRole('link', { name: '戻る' })).toHaveAttribute('href', '/');
  await page.goto('/install/');
  await expect(page.getByRole('group', { name: 'どこに入れますか？' })).toBeVisible();
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

const MENU = ['/まず1回読む', '/総論を学ぶ', '/ポイントを知る', '/1首ずつ学ぶ', '/最低限これだけ', '/練習モード', '/インストール'];

test('入口に、題、標語、入力の行、7つの項目、下端の行を出す', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('main h1')).toHaveText('「読みます」と言うために。');
  await expect(page.locator('.hero p')).toHaveText('競技かるたにかかわるすべての人に、読みを身近に。');
  await expect(page.locator('.ask-line')).toHaveText('> /yomimasu ');
  const items = page.getByRole('navigation', { name: 'やれること' }).getByRole('link');
  await expect(items.locator('span')).toHaveText(MENU);
  await expect(items.first().locator('small')).toHaveText('はじめての人はここから');
  await expect(items.nth(5).locator('small')).toHaveText('読んで、秒数を測る');
  await expect(page.locator('.footnote [lang="en"]')).toHaveText('Built with Claude Code.');
  await expect(page.locator('.footnote').getByRole('link')).toHaveText('/このアプリについて');
  await expect(page.locator('.footnote').getByRole('link')).toHaveAttribute('href', '/about/');
  await expect(page.locator('body')).not.toContainText(/考え中|考えました/);
});

test('入口の一覧は、並びを変えずに、「/まず1回読む」と「/練習モード」の2項目だけを朱に塗る', async ({ page }) => {
  const SHU = 'rgb(178, 58, 28)';
  const ON_SHU = 'rgb(255, 253, 249)';
  const INK = 'rgb(32, 29, 25)';
  const LEADS = ['/まず1回読む', '/練習モード'];
  await page.setViewportSize({ width: 393, height: 659 });
  await page.goto('/');
  const items = page.getByRole('navigation', { name: 'やれること' }).getByRole('link');
  const looks = await items.evaluateAll((links) =>
    links.map((a) => [a.querySelector('span')!.textContent, getComputedStyle(a).backgroundColor, getComputedStyle(a).color]),
  );
  expect(looks).toEqual(MENU.map((name) => (LEADS.includes(name) ? [name, SHU, ON_SHU] : [name, 'rgba(0, 0, 0, 0)', INK])));
  // 朱の上の添え書きも、地に沈まないよう朱の上の字の色にする。
  await expect(items.first().locator('small')).toHaveCSS('color', ON_SHU);
  await expect(items.nth(5).locator('small')).toHaveCSS('color', ON_SHU);

  await page.locator('.menu').evaluate((el) => el.scrollIntoView({ block: 'center' }));
  mkdirSync(ARTIFACTS_DIR, { recursive: true });
  await page.screenshot({ path: join(ARTIFACTS_DIR, 'home-menu-393x659.png') });
});

for (const [width, height] of [
  [393, 659],
  [360, 640],
  [320, 640],
]) {
  test(`幅 ${width}px で、入口の項目の名前は折り返さず、「戻る」は主の操作の右に 76px で並び、横スクロールもない`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    const lines = await page.locator('.menu span').evaluateAll((spans) => spans.map((span) => span.getBoundingClientRect().height / parseFloat(getComputedStyle(span).lineHeight)));
    expect(lines.every((n) => n < 1.5), lines.join(',')).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width !== 320) {
      mkdirSync(ARTIFACTS_DIR, { recursive: true });
      await page.screenshot({ path: join(ARTIFACTS_DIR, `home-${width}x${height}.png`) });
      await page.screenshot({ path: join(ARTIFACTS_DIR, `home-${width}x${height}-full.png`), fullPage: true });
    }
    await page.goto('/soron/');
    const row = await page.locator('.main-row').evaluate((el) => [...el.children].map((child) => child.getBoundingClientRect().toJSON()));
    expect(row[1].width).toBe(76);
    expect(Math.round(row[1].x - (row[0].x + row[0].width))).toBe(12);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width !== 320) await page.locator('.ask').screenshot({ path: join(ARTIFACTS_DIR, `soron-ask-${width}x${height}.png`) });
  });
}

type Times = { pressed: number; typed?: number; run?: number; lead?: number; rest?: number };

// 押した瞬間から、打ち込み終えたとき、新しい実行の行が見えたとき、冒頭の文の1字目が見えたとき、残りが見えたときを、ページの中の時計で測る。
async function pressAndTime(page: Page, target: Locator, expected: { run: string; lead: string; rest: string }): Promise<Times> {
  await page.evaluate((expected) => {
    const seen = (selector: string) => [...document.querySelectorAll(selector)].some((el) => el.checkVisibility({ visibilityProperty: true }) && el.textContent?.trim());
    document.addEventListener(
      'click',
      () => {
        const times: Times = { pressed: performance.now() };
        Object.assign(window, { shellTimes: times });
        const tick = () => {
          const now = performance.now();
          if (!times.typed && !times.run && document.querySelector('main [data-typed]')?.textContent === expected.run) times.typed = now;
          if (!times.run && [...document.querySelectorAll('main .run [data-run]')].some((el) => el.textContent === expected.run && !el.closest('.ask'))) times.run = now;
          if (times.run && !times.lead && seen(expected.lead)) times.lead = now;
          if (times.run && !times.rest && seen(expected.rest)) times.rest = now;
          if (!times.rest) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      },
      { capture: true, once: true },
    );
  }, expected);
  await target.click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { shellTimes?: Times }).shellTimes?.rest), { timeout: 5000 }).toBeTruthy();
  return page.evaluate(() => (window as unknown as { shellTimes: Times }).shellTimes);
}

const reloads = (page: Page) => page.evaluate(() => (window as unknown as { kept?: boolean }).kept !== true);
const keep = (page: Page) => page.evaluate(() => Object.assign(window, { kept: true }));

// 総論の冒頭の文は「5-3-1-6」と「読みの1組は、この配分で15秒です。」である（docs/ui-guide.md の8節）。
const SORON_LEAD = '5-3-1-6' + '読みの1組は、この配分で15秒です。';

test('押すと入力の行に打ち込んでから、1秒未満で実行の行を出し、冒頭の文を1秒に30字で流してから残りを出す', async ({ page }) => {
  await page.goto('/');
  await keep(page);
  const times = await pressAndTime(page, page.getByRole('link', { name: /\/総論を学ぶ/ }), {
    run: '/yomimasu 総論を学ぶ',
    lead: 'main .big-num',
    rest: 'main yomimasu-band',
  });
  const runMs = times.run! - times.pressed;
  const streamMs = times.rest! - times.lead!;
  const expectedStreamMs = (SORON_LEAD.length * 1000) / 30;
  expect(times.typed! - times.pressed).toBeLessThan(times.run! - times.pressed);
  expect(runMs).toBeGreaterThanOrEqual(360);
  expect(runMs).toBeLessThan(1000);
  expect(Math.abs(streamMs - expectedStreamMs)).toBeLessThan(80);
  await expect(page).toHaveURL(/\/soron\/$/);
  await expect(page.locator('.run .read')).toHaveText('● Read 総論.md');
  await expect(page.locator('main')).toContainText('読みの1組は、この配分で15秒です。');
  await expect(page.locator('main')).toBeFocused();
  expect(await reloads(page)).toBe(false);
  await expect(page.locator('body')).not.toContainText(/考え中|考えました/);

  mkdirSync(ARTIFACTS_DIR, { recursive: true });
  const result = {
    page: '/soron/',
    pressToTypedMs: Math.round(times.typed! - times.pressed),
    pressToRunLineMs: Math.round(runMs),
    pressToLeadStartMs: Math.round(times.lead! - times.pressed),
    leadChars: SORON_LEAD.length,
    leadStreamMs: Math.round(streamMs),
    expectedLeadStreamMs: Math.round(expectedStreamMs),
    pressToAllShownMs: Math.round(times.rest! - times.pressed),
  };
  writeFileSync(join(ARTIFACTS_DIR, 'shell-timing.json'), JSON.stringify(result, null, 2));
});

test('入口から開いた教科書の画面も、本文の中の部品が動き、1首のページを決まり字のコマンドで開く', async ({ page }) => {
  await page.goto('/');
  await keep(page);
  await page.getByRole('link', { name: /\/1首ずつ学ぶ/ }).click();
  await expect(page.locator('.run [data-run]')).toHaveText('/yomimasu 1首ずつ学ぶ');
  await page.getByRole('button', { name: '歌番号順' }).click();
  await expect(page.locator('[data-view="number"] a')).toHaveCount(100);
  await expect(page.locator('[data-view="number"] a').first()).toBeVisible();

  await page.locator('[data-view="number"]').getByRole('link', { name: /^53番\s*なげき$/ }).click();
  await expect(page.locator('.run [data-run]')).toHaveText('/yomimasu 1首 なげき');
  await expect(page.locator('.run .read')).toHaveText('● Read なげき.md');
  await expect(page).toHaveURL(/\/karuta\/53\/$/);
  await expect(page.getByRole('img', { name: '余韻' })).toBeVisible();
  expect(await reloads(page)).toBe(false);
});

// 隠して出す動きの印（is-held、is-pending）が一度でも付いたかを、毎フレーム見る。
const watchMotion = (page: Page) =>
  page.evaluate(() => {
    const state = { moved: false };
    Object.assign(window, { motion: state });
    const tick = () => {
      if (document.querySelector('.is-held, .is-pending')) state.moved = true;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
const moved = (page: Page) => page.evaluate(() => (window as unknown as { motion: { moved: boolean } }).motion.moved);

test('URL を直接開くと、動きなしで本文がすぐ出る', async ({ page }) => {
  await page.addInitScript(() => {
    const state = { moved: false };
    Object.assign(window, { motion: state });
    const tick = () => {
      if (document.querySelector('.is-held, .is-pending')) state.moved = true;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.goto('/soron/');
  await expect(page.getByRole('img', { name: /下の句 5秒/ })).toBeVisible();
  await page.waitForTimeout(1200);
  expect(await moved(page)).toBe(false);
});

test('ブラウザーの戻る・進む操作では、前の内容に動きなしで戻る', async ({ page }) => {
  await page.goto('/');
  await keep(page);
  await page.getByRole('link', { name: /\/総論を学ぶ/ }).click();
  await expect(page.getByRole('img', { name: /下の句 5秒/ })).toBeVisible();
  await expect(page.locator('.is-held, .is-pending')).toHaveCount(0);

  await watchMotion(page);
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('navigation', { name: 'やれること' })).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(/\/soron\/$/);
  await expect(page.getByRole('img', { name: /下の句 5秒/ })).toBeVisible();
  await page.waitForTimeout(700);
  expect(await moved(page)).toBe(false);
  expect(await reloads(page)).toBe(false);
});

test('戻る・進む操作を続けて押しても、URL と本文が食い違わない', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /\/総論を学ぶ/ }).click();
  await expect(page.getByRole('img', { name: /下の句 5秒/ })).toBeVisible();
  // 戻った画面を取ってくる前に進む。
  await page.evaluate(() => {
    addEventListener('popstate', () => history.forward(), { once: true });
    history.back();
  });
  await page.waitForTimeout(1000);
  await expect(page).toHaveURL(/\/soron\/$/);
  await expect(page.getByRole('img', { name: /下の句 5秒/ })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'やれること' })).toHaveCount(0);
});

test('動きを減らす設定では、打ち込みも流す動きもなく、すぐに入れ替える', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await watchMotion(page);
  const times = await pressAndTime(page, page.getByRole('link', { name: /\/総論を学ぶ/ }), {
    run: '/yomimasu 総論を学ぶ',
    lead: 'main .big-num',
    rest: 'main yomimasu-band',
  });
  expect(times.typed).toBeUndefined();
  expect(times.rest! - times.pressed).toBeLessThan(300);
  expect(await moved(page)).toBe(false);
  mkdirSync(ARTIFACTS_DIR, { recursive: true });
  writeFileSync(join(ARTIFACTS_DIR, 'shell-timing-reduced.json'), JSON.stringify({ page: '/soron/', pressToAllShownMs: Math.round(times.rest! - times.pressed) }, null, 2));
});

test('入口から開いた画面の「戻る」は、打ち込んでから尋ねずに入口へ戻り、進む操作で元の画面に戻れる', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /\/総論を学ぶ/ }).click();
  const back = page.getByRole('link', { name: '戻る' });
  await expect(back).toBeVisible();
  await back.click();
  await expect(page.locator('.ask-line')).toHaveText('> /yomimasu 戻る');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('navigation', { name: 'やれること' })).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(/\/soron\/$/);
});

test('URL を直接開いた画面の「戻る」は、尋ねずに入口へ移る', async ({ page }) => {
  await page.goto('/saitei/');
  await page.getByRole('link', { name: '戻る' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('group', { name: 'どこに戻りますか？' })).toHaveCount(0);
});

test('2つ目の画面の「戻る」は行き先を尋ね、キャンセル、1つ前のページ、トップページのどれも動く', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /\/総論を学ぶ/ }).click();
  await page.locator('.next').getByRole('link', { name: 'ポイントを知る' }).click();
  await expect(page).toHaveURL(/\/point\/$/);
  const back = page.getByRole('link', { name: '戻る' });
  const question = page.getByRole('group', { name: 'どこに戻りますか？' });

  await back.click();
  await expect(page.locator('.ask-line')).toHaveText('> /yomimasu 戻る');
  await expect(question.locator('.auq-q')).toHaveText('どこに戻りますか？');
  await expect(question.getByRole('button')).toHaveText(['1. 1つ前のページ（総論.md）', '2. トップページ', 'キャンセル']);
  await expect(question.getByRole('button').first()).toBeFocused();
  await expect(page.locator('.ask .next')).toBeHidden();
  mkdirSync(ARTIFACTS_DIR, { recursive: true });
  await page.locator('.ask').screenshot({ path: join(ARTIFACTS_DIR, 'back-question.png') });

  await question.getByRole('button', { name: 'キャンセル' }).click();
  await expect(question).toHaveCount(0);
  await expect(page.locator('.ask .next')).toBeVisible();
  await expect(page.locator('.ask-line')).toHaveText('> /yomimasu ');
  await expect(back).toBeFocused();

  await back.click();
  await question.getByRole('button', { name: '1. 1つ前のページ（総論.md）' }).click();
  await expect(question.locator('.auq-a')).toHaveText('❯ 1つ前のページ（総論.md）');
  await expect(page).toHaveURL(/\/soron\/$/);
  await expect(page.locator('.run .read')).toHaveText('● Read 総論.md');

  await page.goForward();
  await expect(page).toHaveURL(/\/point\/$/);
  await back.click();
  await question.getByRole('button', { name: '2. トップページ' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('navigation', { name: 'やれること' })).toBeVisible();
});

test('主の操作のない100首の一覧では、「戻る」だけを右に寄せて置き、実行の行に打ち込む', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /\/総論を学ぶ/ }).click();
  await page.locator('.next').getByRole('link', { name: '1首ずつ学ぶ' }).click();
  await expect(page).toHaveURL(/\/karuta\/$/);
  const back = page.locator('.back-row').getByRole('link', { name: '戻る' });
  const box = await back.boundingBox();
  const row = await page.locator('.back-row').boundingBox();
  expect(Math.round(box!.x + box!.width)).toBe(Math.round(row!.x + row!.width));
  await back.click();
  await expect(page.locator('.run [data-run]')).toHaveText('/yomimasu 戻る');
  await expect(page.getByRole('group', { name: 'どこに戻りますか？' }).getByRole('button').first()).toHaveText('1. 1つ前のページ（総論.md）');
});

test('読んだ行は content/ のファイルの名前で、ファイルのない画面には出ない', async ({ page }) => {
  await page.goto('/install/');
  await expect(page.locator('.run .read')).toHaveText('● Read インストール.md');
  for (const path of ['/read/', '/practice/', '/result/']) {
    await page.goto(path);
    await expect(page.locator('.run'), path).toBeVisible();
    await expect(page.locator('.run .read'), path).toHaveCount(0);
  }
});

// 音声はリポジトリに置かないので、テストの音は OS の一時フォルダーへ書く。
function writeFakeMicFile(): string {
  const reading = { ...standardReading, leadSec: 3 };
  const path = join(mkdtempSync(join(tmpdir(), 'yomimasu-e2e-')), 'reading.wav');
  writeFileSync(path, encodeWav(synthesize(reading), reading.sampleRate));
  return path;
}

test('読み終えた録音を、ページを読み直さずに結果の画面へ渡す', async ({ baseURL }) => {
  test.setTimeout(60_000);
  const browser = await chromium.launch({
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${writeFakeMicFile()}%noloop`],
  });
  const page = await (await browser.newContext({ baseURL })).newPage();
  await page.addInitScript(() => localStorage.setItem('yomimasu.recHelpDone', '1'));
  await page.goto('/read/rec/');
  await keep(page);
  await page.getByRole('button', { name: '読み始める' }).click();
  await expect(page.locator('.blk[data-phase="kami"]')).toHaveClass(/is-now/, { timeout: 15_000 });
  await page.waitForTimeout(3000);
  await page.getByRole('button', { name: '読み終えた' }).click();
  await expect(page).toHaveURL(/\/result\/$/);
  await expect(page.locator('yomimasu-result .res')).toBeVisible();
  await expect(page.locator('main')).not.toContainText('まだ録音がありません');
  expect(await reloads(page)).toBe(false);
  await browser.close();
});
