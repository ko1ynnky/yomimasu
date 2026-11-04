import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { standardReading, synthesize } from '../test/support/synth.ts';
import { encodeWav } from '../test/support/wav.ts';

const ARTIFACTS_DIR = 'e2e-artifacts';

// お手本の音声はリポジトリに置かないので、答えの分かる合成音を実行のたびに作り、/audio/v1/ の取得に返す。
// 下の句と余韻を 0.8 秒、上の句を 0.6 秒にして、鳴り終えるまでを短くする。
const plan = { ...standardReading, leadSec: 0, shimoSec: 0.5, yoinSec: 0.3, maSec: 0.3, kamiSec: 0.6, tailSec: 0 };
const pcm = synthesize(plan);
const rate = plan.sampleRate;
const SHIMO_SEC = plan.shimoSec + plan.yoinSec;
const shimoClip = Buffer.from(encodeWav(pcm.slice(0, Math.round(SHIMO_SEC * rate)), rate));
const kamiClip = Buffer.from(encodeWav(pcm.slice(Math.round((SHIMO_SEC + plan.maSec) * rate)), rate));
// 止める操作を確かめる音は、押すまで鳴り終えないよう長くする。
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

// 予約の時刻、<audio> の再生、audioSession の切り替えを、API の境界で記録する。
async function watchAudio(page: Page, { introDone = false } = {}) {
  await page.addInitScript((introDone) => {
    if (introDone) localStorage.setItem('yomimasu.introDone', '1');
    const record = { starts: [] as { when: number; now: number; duration: number }[], mediaPlays: 0, session: [] as string[] };
    (window as unknown as { audioRecord: typeof record }).audioRecord = record;
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (this: AudioBufferSourceNode, when?: number, ...rest: number[]) {
      record.starts.push({ when: when ?? 0, now: this.context.currentTime, duration: this.buffer?.duration ?? 0 });
      return start.call(this, when, ...rest);
    };
    HTMLMediaElement.prototype.play = function () {
      record.mediaPlays += 1;
      return Promise.resolve();
    };
    let type = 'auto';
    Object.defineProperty(navigator, 'audioSession', {
      configurable: true,
      value: {
        get type() {
          return type;
        },
        set type(value: string) {
          type = value;
          record.session.push(value);
        },
      },
    });
  }, introDone);
}

type AudioRecord = { starts: { when: number; now: number; duration: number }[]; mediaPlays: number; session: string[] };
const audioRecord = (page: Page) => page.evaluate(() => (window as unknown as { audioRecord: AudioRecord }).audioRecord);

const say = (page: Page) => page.locator('.say');
const shimoFill = (page: Page) => page.locator('.stage .seg[data-seg="shimo"] i');
const widthOf = (page: Page) => shimoFill(page).evaluate((element) => parseFloat((element as HTMLElement).style.width || '0'));

test('初めて開くと、まず1回読む の導入の段1を出し、音を鳴らさない', async ({ page }) => {
  const served = await serveAudio(page);
  await watchAudio(page);
  await page.goto('/read/');
  await expect(say(page)).toHaveText('競技かるたの読みには、5-3-1-6 というシンプルなルールがあります。');
  await expect(page.getByText('5-3-1-6', { exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: '下の句 5秒、余韻 3秒、間 1秒、上の句 6秒' })).toBeVisible();
  await expect(page.locator('.bar .step')).toHaveText('はじめに 1 / 4');
  await expect(page.getByTestId('lyrics')).toHaveCount(0);
  await page.waitForTimeout(500);
  expect(served.asked).toEqual([]);
  expect((await audioRecord(page)).starts).toEqual([]);
});

test('段2は、81番の下の句と45番の上の句の組を出し、①②の行と上の帯、歌の後ろの色を対応させて囲む', async ({ page }) => {
  await serveAudio(page);
  await watchAudio(page);
  await page.goto('/read/');
  await page.getByRole('button', { name: '次へ' }).click();
  await expect(say(page)).toHaveText('このアプリでは、5-3-1-6 の感覚をつかむために、2つの仕組みを使います。');
  await expect(page.locator('.bar .step')).toHaveText('はじめに 2 / 4');
  await expect(page.getByTestId('pair')).toHaveText('ほ → あはれ');
  await expect(page.getByTestId('lyrics')).toContainText('有明');
  const points = page.locator('.intro-points li');
  await expect(points).toHaveText(['① 上の帯：全体の時間の進みがわかります', '② 歌の後ろの色：下の句、余韻と間、上の句の、それぞれの中での進みがわかります']);
  await expect(page.locator('.stage .band')).toHaveAttribute('data-mark', '①');
  await expect(page.locator('.stage .stage-body')).toHaveAttribute('data-mark', '②');
  await expect(page.locator('[data-mark]')).toHaveCount(2);
  await expect(page.getByText('おすすめ')).toHaveCount(0);
  mkdirSync(ARTIFACTS_DIR, { recursive: true });
  await page.screenshot({ path: join(ARTIFACTS_DIR, 'listen-intro-2.png') });
});

test('段2の「確認する」は、音を鳴らさずに帯と色を進め、止めても何度でも流せる', async ({ page }) => {
  const served = await serveAudio(page);
  await watchAudio(page);
  await page.goto('/read/');
  await page.getByRole('button', { name: '次へ' }).click();
  for (let round = 0; round < 2; round++) {
    await page.getByRole('button', { name: /確認する/ }).click();
    await expect.poll(() => widthOf(page)).toBeGreaterThan(0);
    await page.getByRole('button', { name: 'やめる' }).click();
    await expect.poll(() => widthOf(page)).toBe(0);
  }
  expect(served.asked).toEqual([]);
  expect((await audioRecord(page)).starts).toEqual([]);
});

test('段3で「お手本を聞く」を押すと、2本を読み込んでから 1.0 秒あけて予約し、聞き終えると段4へ進む', async ({ page }) => {
  const served = await serveAudio(page);
  await watchAudio(page);
  await page.goto('/read/');
  await page.getByRole('button', { name: '次へ' }).click();
  await page.getByRole('button', { name: '次へ' }).click();
  await expect(say(page)).toHaveText('お手本と一緒に、ルールを確かめてみましょう。');
  await expect(page.getByText('帯は標準の時間で進むので、お手本の音とはずれます。')).toBeVisible();
  await page.getByRole('button', { name: 'お手本を聞く' }).click();
  await expect(page.getByRole('button', { name: 'やめる' })).toBeVisible();
  await expect.poll(() => widthOf(page)).toBeGreaterThan(0);
  await expect(say(page)).toHaveText('では、読んでみませんか？', { timeout: 10_000 });

  expect(served.asked.sort()).toEqual(['/audio/v1/045_1.m4a', '/audio/v1/081_2.m4a']);
  const record = await audioRecord(page);
  expect(record.mediaPlays).toBe(0);
  expect(record.starts).toHaveLength(2);
  const [shimo, kami] = record.starts;
  // 2本とも、鳴り始める前に同じ時刻に予約する。
  expect(kami.now).toBe(shimo.now);
  expect(shimo.when).toBeGreaterThan(shimo.now);
  expect(shimo.duration).toBeCloseTo(SHIMO_SEC, 2);
  expect(kami.when - (shimo.when + shimo.duration)).toBeCloseTo(1.0, 6);
  expect(record.session).toEqual(['playback', 'auto']);
  await expect(page.locator('.bar .step')).toHaveText('1 / 3 聞く');

  mkdirSync(ARTIFACTS_DIR, { recursive: true });
  writeFileSync(
    join(ARTIFACTS_DIR, 'listen-schedule.json'),
    JSON.stringify({ shimoSec: shimo.duration, kamiSec: kami.duration, gapSec: kami.when - (shimo.when + shimo.duration), session: record.session }, null, 2),
  );
});

test('段4まで進むと端末に覚え、2回目からは段4から始まり、はじめの説明へ戻れる', async ({ page }) => {
  await serveAudio(page);
  await watchAudio(page, { introDone: true });
  await page.goto('/read/');
  await expect(say(page)).toHaveText('では、読んでみませんか？');
  await expect(page.locator('.bar .step')).toHaveText('1 / 3 聞く');
  await expect(page.getByRole('link', { name: '読んでみる' })).toHaveAttribute('href', '/read/rec/?shimo=81&kami=45');
  await expect(page.getByRole('button', { name: 'お手本を聞く' })).toBeVisible();
  mkdirSync(ARTIFACTS_DIR, { recursive: true });
  await page.screenshot({ path: join(ARTIFACTS_DIR, 'listen-step-4.png') });
  await page.getByRole('button', { name: 'はじめの説明をもう一度見る' }).click();
  await expect(page.locator('.bar .step')).toHaveText('はじめに 1 / 4');
});

test('再生の途中で「やめる」を押すと止まり、帯は 0 に戻り、audioSession を auto に戻す', async ({ page }) => {
  await serveAudio(page, { long: true });
  await watchAudio(page, { introDone: true });
  await page.goto('/read/');
  await page.getByRole('button', { name: 'お手本を聞く' }).click();
  await expect.poll(() => widthOf(page)).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'やめる' }).click();
  await expect(page.getByRole('button', { name: 'お手本を聞く' })).toBeVisible();
  await expect.poll(() => widthOf(page)).toBe(0);
  expect((await audioRecord(page)).session).toEqual(['playback', 'auto']);
});

test('お手本を読み込めないときは11節の文言を出し、もう一度押せる', async ({ page }) => {
  const served = await serveAudio(page, { status: 404 });
  await watchAudio(page, { introDone: true });
  await page.goto('/read/');
  await page.getByRole('button', { name: 'お手本を聞く' }).click();
  await expect(page.getByRole('alert')).toHaveText('お手本を読み込めませんでした。通信を確かめて、もう一度押してください。');
  expect((await audioRecord(page)).session).toEqual(['playback', 'auto']);
  await page.getByRole('button', { name: 'お手本を聞く' }).click();
  await expect.poll(() => served.asked.length).toBe(4);
});

test('取得先を合成音にすると、音声を取りに行かずに実行時に作った音を鳴らす', async ({ page }) => {
  const served = await serveAudio(page);
  await watchAudio(page, { introDone: true });
  await page.addInitScript(() => localStorage.setItem('yomimasu.audio', 'synth'));
  await page.goto('/read/');
  await page.getByRole('button', { name: 'お手本を聞く' }).click();
  await expect.poll(async () => (await audioRecord(page)).starts.length).toBe(2);
  const [shimo, kami] = (await audioRecord(page)).starts;
  expect(kami.when - (shimo.when + shimo.duration)).toBeCloseTo(1.0, 6);
  expect(served.asked).toEqual([]);
  await page.getByRole('button', { name: 'やめる' }).click();
});

test('URL で組を指定すると、その組を出して鳴らし、導入を出さない', async ({ page }) => {
  const served = await serveAudio(page);
  await watchAudio(page);
  await page.goto('/read/?shimo=53&kami=86');
  await expect(page.getByTestId('lyrics')).toContainText('いかにー久');
  await expect(page.getByTestId('pair')).toHaveText('なげき → なげけ');
  await expect(page.locator('.bar .step')).toHaveText('1 / 3 聞く');
  await expect(page.getByRole('button', { name: 'はじめの説明をもう一度見る' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: '読んでみる' })).toHaveAttribute('href', '/read/rec/?shimo=53&kami=86');
  await page.getByRole('button', { name: 'お手本を聞く' }).click();
  await expect.poll(() => served.asked.sort()).toEqual(['/audio/v1/053_2.m4a', '/audio/v1/086_1.m4a']);
});

test('練習モードは「ランダムに出題する」と「自分で選ぶ」の2つで、おすすめの組を出さない', async ({ page }) => {
  await page.goto('/practice/');
  const random = page.getByRole('link', { name: 'ランダムに出題する' });
  await expect(random).toHaveClass(/btn--fill/);
  const href = await random.getAttribute('href');
  const url = new URL(href!, 'http://x');
  expect(url.pathname).toBe('/read/rec/');
  const [shimo, kami] = ['shimo', 'kami'].map((key) => Number(url.searchParams.get(key)));
  expect(shimo).toBeGreaterThanOrEqual(1);
  expect(kami).toBeLessThanOrEqual(100);
  expect(shimo).not.toBe(kami);
  await expect(page.getByRole('button', { name: '自分で選ぶ' })).toBeVisible();
  await expect(page.getByText('おすすめ')).toHaveCount(0);
  mkdirSync(ARTIFACTS_DIR, { recursive: true });
  await page.screenshot({ path: join(ARTIFACTS_DIR, 'practice.png') });
});

test('練習モードで自分で選んだ組は、聞く画面と録音の画面へ URL で渡る', async ({ page }) => {
  await page.goto('/practice/');
  await page.getByRole('button', { name: '自分で選ぶ' }).click();
  await page.getByLabel('下の句の札').selectOption('53');
  await page.getByLabel('上の句の札').selectOption('86');
  await expect(page.getByRole('link', { name: 'お手本を聞く' })).toHaveAttribute('href', '/read/?shimo=53&kami=86');
  await expect(page.getByRole('link', { name: '読む' })).toHaveAttribute('href', '/read/rec/?shimo=53&kami=86');
  mkdirSync(ARTIFACTS_DIR, { recursive: true });
  await page.screenshot({ path: join(ARTIFACTS_DIR, 'practice-choose.png') });
});

test('練習モードで同じ札を下の句と上の句に選ぶと、進めない', async ({ page }) => {
  await page.goto('/practice/');
  await page.getByRole('button', { name: '自分で選ぶ' }).click();
  await page.getByLabel('下の句の札').selectOption('53');
  await page.getByLabel('上の句の札').selectOption('53');
  await expect(page.getByRole('link', { name: '読む' })).toHaveCount(0);
  await expect(page.getByText('下の句と上の句は別の札から選びます。')).toBeVisible();
});

test('JS なしでも、聞く画面と練習モードから録音の画面へ進める', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
  const page = await context.newPage();
  for (const path of ['/read/', '/practice/']) {
    await page.goto(path);
    await expect(page.locator('main a[href^="/read/rec/"]').first(), path).toBeVisible();
  }
  await context.close();
});

for (const [width, height] of [
  [320, 560],
  [360, 640],
  [393, 659],
]) {
  test(`聞く画面は ${width}×${height} で横にはみ出さない`, async ({ page }) => {
    await watchAudio(page, { introDone: true });
    await page.setViewportSize({ width, height });
    await page.goto('/read/');
    await expect(page.getByTestId('lyrics')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('聞く画面は 393×659 で、段4も段2も全体が1画面に収まる', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 659 });
  await page.goto('/read/');
  await page.getByRole('button', { name: '次へ' }).click();
  await expect(page.locator('.intro-points')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
  await page.evaluate(() => localStorage.setItem('yomimasu.introDone', '1'));
  await page.reload();
  await expect(page.getByRole('link', { name: '読んでみる' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
});
