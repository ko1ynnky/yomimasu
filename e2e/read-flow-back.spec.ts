import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test, type Locator, type Page } from '@playwright/test';
import { standardReading, synthesize } from '../test/support/synth.ts';
import { encodeWav } from '../test/support/wav.ts';

// 読む流れ（聞く、読む、練習モード、結果、例の録音の結果、前回と比べる）の「戻る」（docs/ui-guide.md の8節「戻る」）。
// 教科書の画面の「戻る」は e2e/shell.spec.ts が確かめる。

const ARTIFACTS_DIR = 'e2e-artifacts';

// お手本と例の音声はリポジトリに置かないので、答えの分かる短い合成音を作って取得に返す。中身は WAV のまま m4a の名前で返す。
const plan = { ...standardReading, leadSec: 0, shimoSec: 0.5, yoinSec: 0.3, maSec: 0.3, kamiSec: 0.6, tailSec: 0 };
const pcm = synthesize(plan);
const rate = plan.sampleRate;
const SHIMO_SEC = plan.shimoSec + plan.yoinSec;
const shimoClip = Buffer.from(encodeWav(pcm.slice(0, Math.round(SHIMO_SEC * rate)), rate));
const kamiClip = Buffer.from(encodeWav(pcm.slice(Math.round((SHIMO_SEC + plan.maSec) * rate)), rate));
const exampleTake = Buffer.from(encodeWav(synthesize({ ...standardReading, maSec: 1.6 }), rate));

const serveModel = (page: Page) =>
  page.route('**/audio/v1/*', (route) =>
    route.fulfill({ status: 200, contentType: 'audio/mp4', body: route.request().url().endsWith('_2.m4a') ? shimoClip : kamiClip }),
  );
const serveExample = (page: Page, found = true) =>
  page.route('**/audio/examples/**', (route) =>
    found ? route.fulfill({ status: 200, contentType: 'audio/mp4', body: exampleTake }) : route.fulfill({ status: 404, body: '' }),
  );

// 入口の URL。/\/$/ では、どの画面の URL も / で終わるので、移る前に通ってしまう。
const TOP = /^https?:\/\/[^/]+\/$/;
const backOf = (page: Page) => page.getByRole('link', { name: '戻る', exact: true });
const question = (page: Page) => page.getByRole('group', { name: 'どこに戻りますか？' });
const startButton = (page: Page) => page.getByRole('button', { name: '読み始める' });

// 主の操作と「戻る」が同じ行にあり、「戻る」が 76px で、主の操作の側から 12px 空けて右端に並ぶ。
async function expectBackBeside(row: Locator, before: Locator, back: Locator) {
  const [rowBox, beforeBox, backBox] = [await row.boundingBox(), await before.boundingBox(), await back.boundingBox()];
  expect(backBox!.y).toBe(beforeBox!.y);
  expect(backBox!.width).toBe(76);
  expect(Math.round(backBox!.x - (beforeBox!.x + beforeBox!.width))).toBe(12);
  expect(Math.round(backBox!.x + backBox!.width)).toBe(Math.round(rowBox!.x + rowBox!.width));
}

// 打ち込みは 370ms で終わり、入口へ移るときは実行の行ごと消えるので、待って見るのではなく、実行の行に出た文字をすべて記録する（e2e/record.spec.ts と同じ）。
const watchRunLine = (page: Page) =>
  page.evaluate(() => {
    const seen: string[] = [];
    const note = () => {
      const text = document.querySelector('main .run > div')?.textContent ?? '';
      if (text && seen.at(-1) !== text) seen.push(text);
    };
    new MutationObserver(note).observe(document.body, { subtree: true, childList: true, characterData: true });
    Object.assign(window, { runLineSeen: seen });
  });
const runLineSeen = (page: Page) => page.evaluate(() => (window as unknown as { runLineSeen: string[] }).runLineSeen);

// 主の操作がない状態では、「戻る」だけを右に寄せて置く。
async function expectBackAlone(page: Page) {
  const row = page.locator('main .back-row');
  const [rowBox, backBox] = [await row.boundingBox(), await backOf(page).boundingBox()];
  expect(Math.round(backBox!.x + backBox!.width)).toBe(Math.round(rowBox!.x + rowBox!.width));
  expect(backBox!.width).toBe(76);
}

test('聞く画面は、導入の段1、段2、段3のどれでも、塗りのボタンの右に「戻る」を同じ行で置く', async ({ page }) => {
  await page.goto('/read/');
  const row = page.locator('.listen-controls .main-row');
  await expectBackBeside(row, page.getByRole('button', { name: '次へ' }), backOf(page));
  await page.getByRole('button', { name: '次へ' }).click();
  await expectBackBeside(row, page.getByRole('button', { name: 'お手本を聞く' }), backOf(page));
  await page.evaluate(() => localStorage.setItem('yomimasu.introDone', '1'));
  await page.reload();
  await expectBackBeside(row, page.getByRole('link', { name: '読んでみる' }), backOf(page));
  await expect(page.locator('[data-back]')).toHaveCount(1);
  mkdirSync(ARTIFACTS_DIR, { recursive: true });
  await page.screenshot({ path: join(ARTIFACTS_DIR, 'back-listen-step-3.png') });
});

test('入口から開いた聞く画面の「戻る」は、実行の行に打ち込んでから、尋ねずに入口へ戻る', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /\/まず1回読む/ }).click();
  await expect(page).toHaveURL(/\/read\/$/);
  await watchRunLine(page);
  await backOf(page).click();
  await expect(page).toHaveURL(TOP);
  expect(await runLineSeen(page)).toContain('> /yomimasu 戻る');
  await expect(page.getByRole('navigation', { name: 'やれること' })).toBeVisible();
  await expect(question(page)).toHaveCount(0);
});

test('聞く画面で尋ねるあいだは操作の欄を隠し、お手本を聞き終えて段3を描き直しても隠したまま「戻る」を増やさず、キャンセルで段3の操作に戻す', async ({ page }) => {
  await serveModel(page);
  // 結果の画面から開いた聞く画面は、行き先が入口だけではないので尋ねる。
  await page.goto('/result/');
  await page.getByRole('status').getByRole('link', { name: 'まず1回読む' }).click();
  await expect(page).toHaveURL(/\/read\/$/);
  await page.getByRole('button', { name: '次へ' }).click();
  await page.getByRole('button', { name: 'お手本を聞く' }).click();
  await backOf(page).click();
  await expect(page.locator('.run [data-run]')).toHaveText('/yomimasu 戻る');
  await expect(question(page).getByRole('button')).toHaveText(['1. 1つ前のページ（結果を見る）', '2. トップページ', 'キャンセル']);
  await expect(question(page).getByRole('button').first()).toBeFocused();

  // 聞き終えると段3へ進み、操作の欄を作り直す。作り直した操作も隠れたままで、質問は残る。
  await expect(page.locator('.bar .step')).toHaveText('1 / 3 聞く', { timeout: 10_000 });
  await expect(page.getByRole('link', { name: '読んでみる' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'はじめの説明をもう一度見る' })).toBeHidden();
  await expect(backOf(page)).toBeHidden();
  await expect(question(page)).toBeVisible();
  mkdirSync(ARTIFACTS_DIR, { recursive: true });
  await page.screenshot({ path: join(ARTIFACTS_DIR, 'back-listen-question.png') });

  await question(page).getByRole('button', { name: 'キャンセル' }).click();
  await expect(question(page)).toHaveCount(0);
  await expect(page.getByRole('link', { name: '読んでみる' })).toBeVisible();
  await expect(backOf(page)).toBeVisible();
  await expect(backOf(page)).toBeFocused();
  await expect(page.locator('[data-back]')).toHaveCount(1);

  await backOf(page).click();
  await question(page).getByRole('button', { name: '1. 1つ前のページ（結果を見る）' }).click();
  await expect(page).toHaveURL(/\/result\/$/);
});

test('練習モードは「ランダムに出題する」の右に「戻る」を置き、入口から開いたときは尋ねずに入口へ戻る', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /\/練習モード/ }).click();
  await expect(page).toHaveURL(/\/practice\/$/);
  const random = page.getByRole('link', { name: 'ランダムに出題する' });
  await expectBackBeside(page.locator('.listen-controls .main-row'), random, backOf(page));
  await watchRunLine(page);
  await backOf(page).click();
  await expect(page).toHaveURL(TOP);
  expect(await runLineSeen(page)).toContain('> /yomimasu 戻る');
  await expect(question(page)).toHaveCount(0);
});

test('練習モードで尋ねるあいだは、組を選ぶカードも隠し、キャンセルで元に戻す', async ({ page }) => {
  await page.goto('/practice/');
  await page.getByRole('button', { name: '自分で選ぶ' }).click();
  await page.getByLabel('下の句の札').selectOption('53');
  await page.getByLabel('上の句の札').selectOption('86');
  // 練習モードは入口からしか開かないので、尋ねる場合は、殻が残す前の画面を履歴に置いて作る。
  await page.evaluate(() => history.replaceState({ prev: '/soron/' }, ''));
  await backOf(page).click();
  await expect(question(page).getByRole('button')).toHaveText(['1. 1つ前のページ（総論.md）', '2. トップページ', 'キャンセル']);
  for (const hidden of [page.getByRole('link', { name: 'ランダムに出題する' }), page.getByRole('button', { name: '自分で選ぶ' }), page.getByLabel('下の句の札'), page.getByRole('link', { name: '読む', exact: true })]) {
    await expect(hidden).toBeHidden();
  }
  await question(page).getByRole('button', { name: 'キャンセル' }).click();
  await expect(page.getByRole('link', { name: '読む', exact: true })).toHaveAttribute('href', '/read/rec/?shimo=53&kami=86');
  await expect(page.getByLabel('下の句の札')).toBeVisible();
  await expect(backOf(page)).toBeFocused();
});

test('読む前の画面は「読み始める」「例の録音で見る」の段の右端に「戻る」を置き、聞く画面から開いたときは尋ね、キャンセルと1つ前のページが動く', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('yomimasu.recHelpDone', '1'));
  await page.goto('/read/?shimo=81&kami=45');
  await page.getByRole('link', { name: '読んでみる' }).click();
  await expect(page).toHaveURL(/\/read\/rec\/\?shimo=81&kami=45$/);
  const example = page.getByRole('link', { name: '例の録音で見る' });
  await expectBackBeside(page.locator('.controls .rec-start'), example, backOf(page));
  expect((await startButton(page).boundingBox())!.y).toBe((await backOf(page).boundingBox())!.y);

  await backOf(page).click();
  await expect(page.locator('.run [data-run]')).toHaveText('/yomimasu 戻る');
  await expect(question(page).getByRole('button')).toHaveText(['1. 1つ前のページ（まず1回読む）', '2. トップページ', 'キャンセル']);
  for (const hidden of [startButton(page), example, page.getByRole('button', { name: '補助あり' }), page.getByRole('button', { name: '読み方の説明' })]) {
    await expect(hidden).toBeHidden();
  }
  mkdirSync(ARTIFACTS_DIR, { recursive: true });
  await page.screenshot({ path: join(ARTIFACTS_DIR, 'back-read-question.png') });

  await question(page).getByRole('button', { name: 'キャンセル' }).click();
  await expect(startButton(page)).toBeVisible();
  await expect(backOf(page)).toBeFocused();
  await backOf(page).click();
  await question(page).getByRole('button', { name: '1. 1つ前のページ（まず1回読む）' }).click();
  await expect(page).toHaveURL(/\/read\/\?shimo=81&kami=45$/);
});

test('URL を直接開いた読む画面の「戻る」は、尋ねずに入口へ移る', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('yomimasu.recHelpDone', '1'));
  await page.goto('/read/rec/');
  await backOf(page).click();
  await expect(page).toHaveURL(TOP);
  await expect(question(page)).toHaveCount(0);
});

for (const [width, height] of [
  [360, 560],
  [393, 659],
]) {
  test(`読む前の画面は ${width}×${height} で、「戻る」を足しても1段目を 48px の1段に保ち、1画面に収まる`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.addInitScript(() => localStorage.setItem('yomimasu.recHelpDone', '1'));
    await page.goto('/read/rec/');
    await expect(backOf(page)).toBeVisible();
    const row = [startButton(page), page.getByRole('link', { name: '例の録音で見る' }), backOf(page)];
    const boxes = await Promise.all(row.map((button) => button.boundingBox()));
    expect(boxes.map((box) => [box!.y, box!.height])).toEqual(boxes.map(() => [boxes[0]!.y, 48]));
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    mkdirSync(ARTIFACTS_DIR, { recursive: true });
    await page.screenshot({ path: join(ARTIFACTS_DIR, `back-read-${width}x${height}.png`) });
  });
}

// 偽のマイクは合成音のファイルから鳴らす。音声はリポジトリに置かないので、OS の一時フォルダーへ書く。
function writeFakeMicFile(): string {
  const path = join(mkdtempSync(join(tmpdir(), 'yomimasu-e2e-')), 'reading.wav');
  writeFileSync(path, encodeWav(synthesize(standardReading), standardReading.sampleRate));
  return path;
}

const launchWithFakeMic = () =>
  chromium.launch({
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${writeFakeMicFile()}%noloop`],
  });

// 「やめる」が出ているあいだ（マイクを開いている途中、合図、録音中）に、「戻る」が一度でも出たかを記録する。
const watchBackWhileRecording = (page: Page) =>
  page.evaluate(() => {
    const state = { stopSeen: false, backWithStop: false };
    const note = () => {
      const stop = [...document.querySelectorAll('.controls button')].some((button) => button.textContent?.trim() === 'やめる');
      if (stop) state.stopSeen = true;
      if (stop && document.querySelector('[data-back]')) state.backWithStop = true;
    };
    new MutationObserver(note).observe(document.body, { subtree: true, childList: true, characterData: true });
    Object.assign(window, { recordingBack: state });
  });
const recordingBack = (page: Page) => page.evaluate(() => (window as unknown as { recordingBack: { stopSeen: boolean; backWithStop: boolean } }).recordingBack);

// マイクを開いている途中（starting）を見られるよう、許可を 1.5 秒遅らせる。
const delayMicrophone = (page: Page) =>
  page.addInitScript(() => {
    const getUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = (asked) => new Promise((resolve) => setTimeout(resolve, 1500)).then(() => getUserMedia(asked));
  });

test('読む画面は、マイクを開き始めてから合図のあいだも「戻る」を出さず、やめると読む前の「戻る」に戻る', async ({ baseURL }) => {
  const browser = await launchWithFakeMic();
  const page = await (await browser.newContext({ baseURL })).newPage();
  await page.addInitScript(() => localStorage.setItem('yomimasu.recHelpDone', '1'));
  await delayMicrophone(page);
  await page.goto('/read/rec/');
  await watchBackWhileRecording(page);
  await startButton(page).click();
  await expect(page.getByRole('button', { name: 'やめる' })).toBeVisible();
  await expect(page.locator('.count')).toHaveCount(0);
  await expect(page.locator('.count')).toBeVisible();
  await page.getByRole('button', { name: 'やめる' }).click();
  await expect(startButton(page)).toBeVisible();
  await expect(backOf(page)).toBeVisible();
  expect(await recordingBack(page)).toEqual({ stopSeen: true, backWithStop: false });
  await browser.close();
});

test('読む画面で尋ねてキャンセルしたあとも、読み終えるまで「戻る」を出さず、「読み終えた」を実行の行に打ち込んで結果へ移る', async ({ baseURL }) => {
  // 録音は実時間で進み、上の句の区切りまで約 12 秒かかる。
  test.setTimeout(60_000);
  const browser = await launchWithFakeMic();
  const page = await (await browser.newContext({ baseURL })).newPage();
  await page.addInitScript(() => localStorage.setItem('yomimasu.recHelpDone', '1'));
  await page.goto('/read/rec/');
  // 前の画面があるときの質問を出す。殻は実行の行に打ち込んだ「戻る」を、キャンセルのあとも残す（docs/ui-guide.md の8節）。
  await page.evaluate(() => history.replaceState({ prev: '/read/' }, ''));
  await backOf(page).click();
  await question(page).getByRole('button', { name: 'キャンセル' }).click();
  await expect(page.locator('.run')).toHaveText('> /yomimasu 戻る');

  // 殻が書き換えた実行の行に、部品が「読み終えた」を打ち込めることを確かめる。
  await watchRunLine(page);
  await watchBackWhileRecording(page);
  await startButton(page).click();
  await expect(page.locator('.blk[data-phase="kami"]')).toHaveClass(/is-now/, { timeout: 20_000 });
  await page.getByRole('button', { name: '読み終えた' }).click();
  await expect(page).toHaveURL(/\/result\/$/);
  expect(await runLineSeen(page)).toContain('> /yomimasu 読み終えた');
  expect(await recordingBack(page)).toEqual({ stopSeen: true, backWithStop: false });
  await browser.close();
});

test('マイクを使えない案内では、「もう一度試す」の右に「戻る」を置き、「例の録音で見る」と「教科書へ戻る」も残す', async ({ page }) => {
  // ヘッドレスの Chromium は許可の確認を出せないので、拒否は API の境界で再現する（e2e/record.spec.ts と同じ）。
  await page.addInitScript(() => {
    localStorage.setItem('yomimasu.recHelpDone', '1');
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('denied', 'NotAllowedError'));
  });
  await page.goto('/read/rec/');
  await startButton(page).click();
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('マイクを使えませんでした。');
  await expectBackBeside(alert.locator('.main-row'), alert.getByRole('button', { name: 'もう一度試す' }), backOf(page));
  await expect(alert.getByRole('link', { name: '例の録音で見る' })).toBeVisible();
  await expect(alert.getByRole('link', { name: '教科書へ戻る' })).toHaveAttribute('href', '/');
  await expect(page.locator('[data-back]')).toHaveCount(1);
});

test('読む画面から開いた例の録音の結果は、「次は？」の塗りのボタンの右に「戻る」を置き、いつも尋ね、尋ねるあいだは「次は？」を隠す', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('yomimasu.recHelpDone', '1'));
  await serveExample(page);
  await page.goto('/read/rec/?shimo=81&kami=45');
  await page.getByRole('link', { name: '例の録音で見る' }).click();
  await expect(page).toHaveURL(/\/result\/example\/$/);
  const next = page.locator('main .ask .next');
  const fill = next.locator('.btn--fill');
  await expect(fill).toHaveText('読んでみる');
  await expectBackBeside(next.locator('.main-row'), fill, backOf(page));
  await expect(page.locator('[data-back]')).toHaveCount(1);

  await backOf(page).click();
  await expect(page.locator('.ask-line')).toHaveText('> /yomimasu 戻る');
  await expect(question(page).getByRole('button')).toHaveText(['1. 1つ前のページ（読む ほ あはれ）', '2. トップページ', 'キャンセル']);
  await expect(page.locator('main .ask .ask-q')).toBeHidden();
  await expect(next).toBeHidden();
  mkdirSync(ARTIFACTS_DIR, { recursive: true });
  await page.locator('main .ask').screenshot({ path: join(ARTIFACTS_DIR, 'back-result-question.png') });

  await question(page).getByRole('button', { name: 'キャンセル' }).click();
  await expect(next).toBeVisible();
  await expect(page.locator('.ask-line')).toHaveText('> /yomimasu ');
  await expect(backOf(page)).toBeFocused();
  await backOf(page).click();
  await question(page).getByRole('button', { name: '2. トップページ' }).click();
  await expect(page).toHaveURL(TOP);
});

for (const { path, when, status, prepare } of [
  { path: '/result/', when: '録音がない', status: 'まだ録音がありません。まず1回読む', prepare: async () => {} },
  { path: '/result/compare/', when: '録音がない', status: 'まだ録音がありません。まず1回読む', prepare: async () => {} },
  { path: '/result/example/', when: '例の音声を読み込めない', status: '例の録音を読み込めませんでした。入口へ戻る', prepare: (page: Page) => serveExample(page, false) },
]) {
  test(`${path} を URL で開いて${when}ときは、主の操作がないので「戻る」だけを右に寄せて置き、尋ねずに入口へ移る`, async ({ page }) => {
    await prepare(page);
    await page.goto(path);
    await expect(page.getByRole('status')).toHaveText(status);
    await expectBackAlone(page);
    await expect(page.locator('[data-back]')).toHaveCount(1);
    await backOf(page).click();
    await expect(page).toHaveURL(TOP);
    await expect(question(page)).toHaveCount(0);
  });
}
