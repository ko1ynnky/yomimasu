import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test, type Page } from '@playwright/test';
import { standardReading, synthesize, type ReadingPlan } from '../test/support/synth.ts';
import { encodeWav } from '../test/support/wav.ts';

const TOLERANCE_SEC = 0.05;
const ARTIFACTS_DIR = 'e2e-artifacts';

const shortReading: ReadingPlan = { ...standardReading, leadSec: 0.5, shimoSec: 1.5, yoinSec: 1, kamiSec: 2, tailSec: 0.5 };

const lengthSec = ({ leadSec, shimoSec, yoinSec, maSec, kamiSec, tailSec }: ReadingPlan) => leadSec + shimoSec + yoinSec + maSec + kamiSec + tailSec;

// 音声はリポジトリに置かないので、テストの音は OS の一時フォルダーへ書く。
function writeFakeMicFile(pcm: Float32Array, sampleRate: number): string {
  const path = join(mkdtempSync(join(tmpdir(), 'yomimasu-e2e-')), 'reading.wav');
  writeFileSync(path, encodeWav(pcm, sampleRate));
  return path;
}

const launchWithFakeMic = (wavPath: string) =>
  chromium.launch({
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${wavPath}%noloop`],
  });

const watchMicrophone = (page: Page) =>
  page.addInitScript(() => {
    const opened: MediaStream[] = [];
    const getUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const stream = await getUserMedia(constraints);
      opened.push(stream);
      return stream;
    };
    Object.assign(window, { openedMicrophones: opened });
  });

const openedMicrophones = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as { openedMicrophones: MediaStream[] }).openedMicrophones.map((stream) => stream.getTracks().every((track) => track.readyState === 'ended')),
  );

test('JS なしでも本文を読める', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.locator('main')).toContainText('読みを録音して');
  await context.close();
});

for (const [name, plan] of Object.entries({
  'ma-standard': shortReading,
  'ma-long': { ...shortReading, maSec: 1.6, seed: 7 },
})) {
  test(`偽のマイクの合成音を測って間を見せる（${name}）`, async ({ baseURL }) => {
    const browser = await launchWithFakeMic(writeFakeMicFile(synthesize(plan), plan.sampleRate));
    const page = await (await browser.newContext({ baseURL })).newPage();
    await watchMicrophone(page);
    await page.goto('/');

    await page.getByRole('button', { name: '読む' }).click();
    await expect(page.getByRole('button', { name: '止める' })).toBeVisible();
    await page.waitForTimeout((lengthSec(plan) + 0.5) * 1000);
    await page.getByRole('button', { name: '止める' }).click();

    const status = page.getByRole('status');
    await expect(status).toContainText('間');
    const shown = Number((await status.textContent())?.match(/間 ([\d.]+) 秒/)?.[1]);
    expect(Math.abs(shown - plan.maSec)).toBeLessThanOrEqual(TOLERANCE_SEC);
    expect(await openedMicrophones(page)).toEqual([true]);

    mkdirSync(ARTIFACTS_DIR, { recursive: true });
    await page.screenshot({ path: join(ARTIFACTS_DIR, `${name}.png`) });
    writeFileSync(join(ARTIFACTS_DIR, `${name}.json`), JSON.stringify({ expectedMaSec: plan.maSec, shownMaSec: shown }, null, 2));
    await browser.close();
  });
}

test('声のない録音では、値を作らず測れなかったと見せる', async ({ baseURL }) => {
  const rate = standardReading.sampleRate;
  const browser = await launchWithFakeMic(writeFakeMicFile(new Float32Array(2 * rate), rate));
  const page = await (await browser.newContext({ baseURL })).newPage();
  await page.goto('/');

  await page.getByRole('button', { name: '読む' }).click();
  await expect(page.getByRole('button', { name: '止める' })).toBeVisible();
  await page.waitForTimeout(2000);
  await page.getByRole('button', { name: '止める' }).click();

  await expect(page.getByRole('status')).toContainText('測れませんでした');
  await expect(page.getByRole('status')).not.toContainText('秒');
  await browser.close();
});

test('マイクを許可しないときは、許可を促す', async ({ browser, baseURL }) => {
  const page = await (await browser.newContext({ baseURL })).newPage();
  // ヘッドレスの Chromium は許可の確認を出せず NotSupportedError を返すので、拒否は API の境界で再現する。
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('denied', 'NotAllowedError'));
  });
  await page.goto('/');

  await page.getByRole('button', { name: '読む' }).click();

  await expect(page.getByRole('alert')).toContainText('許可');
});

test('録音の準備に失敗したら、マイクを閉じて理由を見せる', async ({ baseURL }) => {
  const rate = standardReading.sampleRate;
  const browser = await launchWithFakeMic(writeFakeMicFile(new Float32Array(rate), rate));
  const page = await (await browser.newContext({ baseURL })).newPage();
  await watchMicrophone(page);
  // page.route は AudioWorklet の読み込みを横取りしないので、失敗は API の境界で再現する。
  await page.addInitScript(() => {
    AudioWorklet.prototype.addModule = () => Promise.reject(new DOMException('failed', 'AbortError'));
  });
  await page.goto('/');

  await page.getByRole('button', { name: '読む' }).click();

  await expect(page.getByRole('alert')).toContainText('録音を始められませんでした');
  expect(await openedMicrophones(page)).toEqual([true]);
  await browser.close();
});

test('録音をつなぐ処理に失敗したら、マイクを閉じて理由を見せる', async ({ baseURL }) => {
  const rate = standardReading.sampleRate;
  const browser = await launchWithFakeMic(writeFakeMicFile(new Float32Array(rate), rate));
  const page = await (await browser.newContext({ baseURL })).newPage();
  await watchMicrophone(page);
  await page.addInitScript(() => {
    AudioContext.prototype.createMediaStreamSource = () => {
      throw new DOMException('failed', 'NotSupportedError');
    };
  });
  await page.goto('/');

  await page.getByRole('button', { name: '読む' }).click();

  await expect(page.getByRole('alert')).toContainText('録音を始められませんでした');
  expect(await openedMicrophones(page)).toEqual([true]);
  await browser.close();
});

test('止めるを続けて押しても、結果が残りマイクは開かない', async ({ baseURL }) => {
  const rate = standardReading.sampleRate;
  const browser = await launchWithFakeMic(writeFakeMicFile(new Float32Array(rate), rate));
  const page = await (await browser.newContext({ baseURL })).newPage();
  await watchMicrophone(page);
  await page.goto('/');

  await page.getByRole('button', { name: '読む' }).click();
  await page.getByRole('button', { name: '止める' }).dblclick();

  await expect(page.getByRole('status')).toContainText('測れませんでした');
  expect(await openedMicrophones(page)).toEqual([true]);
  await browser.close();
});

test('読むを続けて押しても、マイクは1つだけ開く', async ({ baseURL }) => {
  const rate = standardReading.sampleRate;
  const browser = await launchWithFakeMic(writeFakeMicFile(new Float32Array(rate), rate));
  const page = await (await browser.newContext({ baseURL })).newPage();
  await watchMicrophone(page);
  await page.goto('/');

  await page.getByRole('button', { name: '読む' }).dblclick();
  await page.getByRole('button', { name: '止める' }).click();

  expect(await openedMicrophones(page)).toEqual([true]);
  await browser.close();
});
