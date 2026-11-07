import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test, type Page } from '@playwright/test';
import { standardReading, synthesize, type ReadingPlan } from '../test/support/synth.ts';
import { encodeWav } from '../test/support/wav.ts';

const ARTIFACTS_DIR = 'e2e-artifacts';
const VIEWPORT = { width: 393, height: 659 };
const COUNT_SEC = 2.4;
// 合図の 2.4 秒のあいだに読み始めないよう、合成音の頭に余白を置く。間は目安の幅より長くし、次に直す1点のカードを出す。
const reading: ReadingPlan = { ...standardReading, leadSec: COUNT_SEC + 0.6, maSec: 1.6 };

// お手本の音声はリポジトリに置かないので、短い合成音を作って /audio/v1/ の取得に返す。中身は WAV のまま m4a の名前で返す。
const modelPlan: ReadingPlan = { ...standardReading, leadSec: 0, shimoSec: 0.5, yoinSec: 0.3, maSec: 0.3, kamiSec: 0.6, tailSec: 0 };
const modelPcm = synthesize(modelPlan);
const rate = modelPlan.sampleRate;
const SHIMO_CLIP_SEC = modelPlan.shimoSec + modelPlan.yoinSec;
const shimoClip = Buffer.from(encodeWav(modelPcm.slice(0, Math.round(SHIMO_CLIP_SEC * rate)), rate));
const kamiClip = Buffer.from(encodeWav(modelPcm.slice(Math.round((SHIMO_CLIP_SEC + modelPlan.maSec) * rate)), rate));

function writeFakeMicFile(): string {
  const path = join(mkdtempSync(join(tmpdir(), 'yomimasu-e2e-')), 'reading.wav');
  writeFileSync(path, encodeWav(synthesize(reading), reading.sampleRate));
  return path;
}

const valuesOf = (page: Page) => page.locator('yomimasu-result .res .v b').allTextContents();
const secondsOf = (value: string) => Number(value.match(/^(\d+\.\d)秒$/)?.[1] ?? NaN);

test('入口から、導入、お手本を聞く、読む、結果、前回と比べる、戻るまで、ページを1回だけ読み込んで通り、録音を失わない', async ({ baseURL }) => {
  // 録音は実時間で進む。
  test.setTimeout(120_000);
  const browser = await chromium.launch({
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${writeFakeMicFile()}%noloop`],
  });
  const page = await (await browser.newContext({ baseURL, viewport: VIEWPORT })).newPage();
  // 鳴らした音の長さを記録し、自分の読みが移ってきた録音から鳴ったかを確かめる。
  await page.addInitScript(() => {
    const started: number[] = [];
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (this: AudioBufferSourceNode, ...args: Parameters<typeof start>) {
      started.push(this.buffer?.duration ?? 0);
      return start.apply(this, args);
    };
    Object.assign(window, { startedSec: started });
  });
  const lastStartedSec = () => page.evaluate(() => (window as unknown as { startedSec: number[] }).startedSec.at(-1));
  const loads: string[] = [];
  page.on('load', () => loads.push(new URL(page.url()).pathname));
  const asked: string[] = [];
  await page.route('**/audio/v1/*', (route) => {
    const { pathname } = new URL(route.request().url());
    asked.push(pathname);
    return route.fulfill({ status: 200, contentType: 'audio/mp4', body: pathname.endsWith('_2.m4a') ? shimoClip : kamiClip });
  });
  mkdirSync(ARTIFACTS_DIR, { recursive: true });
  const shot = (name: string) => page.screenshot({ path: join(ARTIFACTS_DIR, `flow-${name}.png`) });
  const step = page.locator('.bar .step');

  await page.goto('/');
  await page.evaluate(() => Object.assign(window, { sameDocument: true }));
  await shot('home');
  await page.getByRole('link', { name: /\/まず1回読む/ }).click();

  // 導入の段1、段2で、お手本を聞き終えると聞く段へ進む。
  await expect(page).toHaveURL(/\/read\/$/);
  await expect(step).toHaveText('はじめに 1 / 3');
  await page.getByRole('button', { name: '次へ' }).click();
  await expect(step).toHaveText('はじめに 2 / 3');
  await page.getByRole('button', { name: 'お手本を聞く' }).click();
  await expect(step).toHaveText('1 / 3 聞く', { timeout: 10_000 });
  expect([...asked].sort()).toEqual(['/audio/v1/045_1.m4a', '/audio/v1/081_2.m4a']);
  await shot('listen');
  await page.getByRole('link', { name: '読んでみる' }).click();

  await expect(page).toHaveURL(/\/read\/rec\/\?shimo=81&kami=45$/);
  await expect(step).toHaveText('2 / 3 読む');
  await page.getByRole('dialog', { name: '読む前に' }).getByRole('button', { name: 'わかった' }).click();
  await shot('read');
  await page.getByRole('button', { name: '読み始める' }).click();
  const endSec = reading.leadSec + reading.shimoSec + reading.yoinSec + reading.maSec + reading.kamiSec + reading.tailSec;
  await page.waitForTimeout(endSec * 1000 + 300);
  await page.getByRole('button', { name: '読み終えた' }).click();

  // 読み終えると結果の画面へ移り、数値、次に直す1点、聴き比べ、前回と比べるへの道が並ぶ。
  const result = page.locator('yomimasu-result');
  await expect(page).toHaveURL(/\/result\/$/);
  await expect(result.locator('.res')).toBeVisible();
  await expect(step).toHaveText('3 / 3 結果・補助あり');
  await expect(page.locator('.run')).toHaveText(/^> \/yomimasu 結果を見る\s*● 録音しました$/);
  const values = await valuesOf(page);
  expect(values.map(secondsOf).map((sec, i) => Math.abs(sec - [8, reading.maSec, 6][i]) <= 0.15)).toEqual([true, true, true]);
  await expect(result.locator('.one .l')).toHaveText('次に直す1点');
  await expect(result.locator('.pair button')).toHaveText(['自分の読み', 'お手本']);
  await expect(page.getByText('再生はまだ使えません。')).toHaveCount(0);
  await expect(page.locator('main .ask .next .btn--fill')).toHaveText('もう1回読む');
  await shot('result');
  await page.locator('main .ask').scrollIntoViewIfNeeded();
  await shot('result-listen-back');

  // 自分の読みは、移ってきた録音の読み始めから最後までを鳴らす。
  const take = page.getByTestId('take');
  const ownSec = Number(await take.getAttribute('data-length-sec')) - Number(await take.getAttribute('data-reading-start-sec'));
  await result.getByRole('button', { name: '自分の読み', exact: true }).click();
  await expect(result.locator('.pair button')).toHaveText(['やめる', 'お手本']);
  await expect.poll(async () => Math.abs(((await lastStartedSec()) ?? 0) - ownSec)).toBeLessThanOrEqual(0.002);
  await result.getByRole('button', { name: 'やめる' }).click();
  await expect(result.locator('.pair button')).toHaveText(['自分の読み', 'お手本']);

  await page.locator('main .ask').getByRole('link', { name: '前回と比べる' }).click();
  await expect(page).toHaveURL(/\/result\/compare\/$/);
  const table = page.getByRole('table', { name: '前回と今回' });
  await expect(table).toBeVisible();
  await expect(table.locator('thead th b')).toHaveText(['今回']);
  // 前回と比べる画面も、「次は？」の塗りのボタンの右に「戻る」を置く。
  await expect(page.locator('main .ask .next .main-row').getByRole('link')).toHaveText(['もう1回読む', '戻る']);
  await shot('compare');

  // ブラウザーの戻る操作で、同じ録音の結果に戻る。
  await page.goBack();
  await expect(page).toHaveURL(/\/result\/$/);
  await expect(result.locator('.res')).toBeVisible();
  expect(await valuesOf(page)).toEqual(values);

  // 録音のあとの結果の画面は入口から1つ目ではないので、「戻る」はいつも行き先を尋ね、尋ねるあいだは「次は？」を隠す（docs/ui-guide.md の8節「戻る」）。
  const next = page.locator('main .ask .next');
  await next.getByRole('link', { name: '戻る', exact: true }).click();
  const where = page.getByRole('group', { name: 'どこに戻りますか？' });
  await expect(where.getByRole('button')).toHaveText(['1. 1つ前のページ（読む ほ あはれ）', '2. トップページ', 'キャンセル']);
  await expect(next).toBeHidden();
  await where.getByRole('button', { name: 'キャンセル' }).click();
  await expect(next).toBeVisible();
  await expect(next.locator('[data-back]')).toHaveCount(1);

  expect(loads).toEqual(['/']);
  expect(await page.evaluate(() => (window as unknown as { sameDocument?: boolean }).sameDocument)).toBe(true);
  await browser.close();
});
