import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { standardReading, synthesize } from '../test/support/synth.ts';
import { encodeWav } from '../test/support/wav.ts';

const ARTIFACTS_DIR = 'e2e-artifacts';
const LOAD_FAILED = 'お手本を読み込めませんでした。通信を確かめて、もう一度押してください。';

// お手本の音声はリポジトリに置かないので、答えの分かる合成音を実行のたびに作り、/audio/v1/ の取得に返す。
// 上の句を 0.6 秒、下の句と余韻を 0.8 秒にして、鳴り終えるまでを短くする。止める操作を確かめる音は長くする。
const plan = { ...standardReading, leadSec: 0, shimoSec: 0.5, yoinSec: 0.3, maSec: 0.3, kamiSec: 0.6, tailSec: 0 };
const pcm = synthesize(plan);
const rate = plan.sampleRate;
const SHIMO_SEC = plan.shimoSec + plan.yoinSec;
const KAMI_SEC = plan.kamiSec;
const shimoClip = Buffer.from(encodeWav(pcm.slice(0, Math.round(SHIMO_SEC * rate)), rate));
const kamiClip = Buffer.from(encodeWav(pcm.slice(Math.round((SHIMO_SEC + plan.maSec) * rate)), rate));
const longClip = Buffer.from(encodeWav(synthesize({ ...standardReading, leadSec: 0, tailSec: 0 }), rate));

type Served = { asked: string[] };

async function serveAudio(page: Page, { long = false, status = 200 } = {}): Promise<Served> {
  const served: Served = { asked: [] };
  await page.route('**/audio/v1/*', (route) => {
    const url = new URL(route.request().url());
    served.asked.push(url.pathname);
    if (status !== 200) return route.fulfill({ status, body: '' });
    const body = long ? longClip : url.pathname.endsWith('_2.m4a') ? shimoClip : kamiClip;
    return route.fulfill({ status: 200, contentType: 'audio/mp4', body });
  });
  return served;
}

// 予約の時刻と止めた数を API の境界で記録し、入力の行に打ち込まれた文字を毎フレーム集める。打ち込みは 370ms で終わるので、外から待つと見逃す。
async function watch(page: Page) {
  await page.addInitScript(() => {
    const record = { starts: [] as { when: number; duration: number }[], stops: 0, typed: [] as string[] };
    (window as unknown as { record: typeof record }).record = record;
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (this: AudioBufferSourceNode, when?: number, ...rest: number[]) {
      record.starts.push({ when: when ?? 0, duration: this.buffer?.duration ?? 0 });
      return start.call(this, when, ...rest);
    };
    const stop = AudioBufferSourceNode.prototype.stop;
    AudioBufferSourceNode.prototype.stop = function (this: AudioBufferSourceNode, when?: number) {
      record.stops += 1;
      return stop.call(this, when);
    };
    const tick = () => {
      const text = document.querySelector('main [data-typed]')?.textContent;
      if (text && record.typed.at(-1) !== text) record.typed.push(text);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

type Record = { starts: { when: number; duration: number }[]; stops: number; typed: string[] };
const recordOf = (page: Page) => page.evaluate(() => (window as unknown as { record: Record }).record);

const playButton = (page: Page) => page.getByRole('button', { name: 'お手本を再生' });
const stopButton = (page: Page) => page.getByRole('button', { name: 'やめる' });
const typedLine = (page: Page) => page.locator('main [data-typed]');

test.use({ viewport: { width: 393, height: 659 } });

test('JS なしでは、お手本を再生のボタンを出さない', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL, viewport: { width: 393, height: 659 } });
  const page = await context.newPage();
  await page.goto('/karuta/53/');
  await expect(page.locator('main')).toContainText('気をつける点');
  await expect(page.locator('yomimasu-karuta-play button')).toBeHidden();
  await context.close();
});

test('お手本を再生は歌の枠のすぐ下に置き、押すと上の句、1秒あけて下の句を鳴らし、鳴り終えたら戻る', async ({ page }) => {
  const served = await serveAudio(page);
  await watch(page);
  await page.goto('/karuta/53/');
  const poem = await page.locator('.karuta-page > .poem').boundingBox();
  const button = await playButton(page).boundingBox();
  expect(button!.y).toBeGreaterThan(poem!.y + poem!.height);
  expect(button!.y - (poem!.y + poem!.height)).toBeLessThanOrEqual(20);

  await playButton(page).click();
  await expect(stopButton(page)).toBeVisible();
  await expect(playButton(page)).toBeVisible({ timeout: 10_000 });

  expect(served.asked).toEqual(['/audio/v1/053_1.m4a', '/audio/v1/053_2.m4a']);
  const { starts, typed } = await recordOf(page);
  expect(starts).toHaveLength(2);
  const [kami, shimo] = starts;
  expect(kami.duration).toBeCloseTo(KAMI_SEC, 2);
  expect(shimo.duration).toBeCloseTo(SHIMO_SEC, 2);
  expect(shimo.when - (kami.when + kami.duration)).toBeCloseTo(1.0, 6);
  // 押した時点で鳴らし始め、同時にボタンの文字を入力の行に打ち込み、打ち込み終えたら空に戻す。
  expect(typed).toContain('/yomimasu お手本を再生');
  await expect(typedLine(page)).toHaveText('/yomimasu');
  // 歌の字は朱で塗らない。
  await expect(page.locator('.karuta-page .tate [style]')).toHaveCount(0);
});

test('鳴っているあいだは「やめる」で止まり、「やめる」は打ち込まない', async ({ page }) => {
  await serveAudio(page, { long: true });
  await watch(page);
  await page.goto('/karuta/53/');
  await playButton(page).click();
  await expect.poll(async () => (await recordOf(page)).starts.length).toBe(2);
  await expect(typedLine(page)).toHaveText('/yomimasu');
  await stopButton(page).click();
  await expect(playButton(page)).toBeVisible();
  const { stops, typed } = await recordOf(page);
  expect(stops).toBe(2);
  expect(typed).not.toContain('/yomimasu やめる');
});

test('鳴っているあいだにほかの画面へ移ると、お手本を止める', async ({ page }) => {
  await serveAudio(page, { long: true });
  await watch(page);
  await page.goto('/karuta/53/');
  await playButton(page).click();
  await expect.poll(async () => (await recordOf(page)).starts.length).toBe(2);
  // 打ち込んでいるあいだは、殻がほかのリンクを受け付けない。
  await expect(typedLine(page)).toHaveText('/yomimasu');
  await page.getByRole('link', { name: '100首の一覧へ' }).click();
  await expect(page).toHaveURL(/\/karuta\/$/);
  await expect.poll(async () => (await recordOf(page)).stops).toBe(2);
});

test('読み込めないときはボタンの下に失敗の文を出し、次に押したら消す', async ({ page }) => {
  let status = 404;
  await page.route('**/audio/v1/*', (route) =>
    status === 200 ? route.fulfill({ status, contentType: 'audio/mp4', body: kamiClip }) : route.fulfill({ status, body: '' }),
  );
  await page.goto('/karuta/53/');
  await playButton(page).click();
  const alert = page.locator('yomimasu-karuta-play').getByRole('alert');
  await expect(alert).toHaveText(LOAD_FAILED);
  await expect(playButton(page)).toBeVisible();
  mkdirSync(ARTIFACTS_DIR, { recursive: true });
  await page.locator('yomimasu-karuta-play').screenshot({ path: join(ARTIFACTS_DIR, 'karuta-play-failed-393.png') });
  status = 200;
  await playButton(page).click();
  await expect(alert).toHaveCount(0);
  await expect(stopButton(page)).toBeVisible();
});

test('序歌のページは、上の句と1回目の下の句、1秒あけて2回目の下の句を鳴らす', async ({ page }) => {
  const served = await serveAudio(page);
  await watch(page);
  await page.goto('/karuta/joka/');
  await playButton(page).click();
  await expect.poll(() => served.asked).toEqual(['/audio/v1/000_1.m4a', '/audio/v1/000_2.m4a']);
  await expect.poll(async () => (await recordOf(page)).starts.length).toBe(2);
});

for (const [name, path] of [
  ['53', '/karuta/53/'],
  ['3', '/karuta/3/'],
  ['joka', '/karuta/joka/'],
]) {
  test(`幅 393px の ${path} の全体を撮る`, async ({ page }) => {
    await page.goto(path);
    await expect(playButton(page)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    mkdirSync(ARTIFACTS_DIR, { recursive: true });
    await page.screenshot({ path: join(ARTIFACTS_DIR, `karuta-${name}-393.png`), fullPage: true });
  });
}
