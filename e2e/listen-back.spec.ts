import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test, type BrowserContext, type Locator, type Page } from '@playwright/test';
import { standardReading, synthesize, type ReadingPlan } from '../test/support/synth.ts';
import { encodeWav } from '../test/support/wav.ts';

const ARTIFACTS_DIR = 'e2e-artifacts';
const COUNT_SEC = 2.4;
const VIEWPORT = { width: 393, height: 659 };
// 合図の 2.4 秒のあいだに読み始めないよう、合成音の頭に余白を置く。間は目安の幅より長くし、次に直す1点のカードを出す。
const reading: ReadingPlan = { ...standardReading, leadSec: COUNT_SEC + 0.6, maSec: 1.6 };
// 読む流れの既定の組（81番→45番）と分け、お手本を結果の組で取ることを確かめる。
const PAIR = { shimo: 53, kami: 86 };
const LOAD_FAILED = 'お手本を読み込めませんでした。通信を確かめて、もう一度押してください。';

// お手本の音声と例の音声はリポジトリに置かないので、答えの分かる合成音を実行のたびに作り、取得に返す。中身は WAV のまま m4a の名前で返す。
// お手本は、止める操作が間に合い、鳴り終えるまでも待てる長さにする。
const modelPlan: ReadingPlan = { ...standardReading, leadSec: 0, shimoSec: 1.2, yoinSec: 0.8, maSec: 0.3, kamiSec: 1.5, tailSec: 0 };
const modelPcm = synthesize(modelPlan);
const rate = modelPlan.sampleRate;
const SHIMO_CLIP_SEC = modelPlan.shimoSec + modelPlan.yoinSec;
const KAMI_CLIP_SEC = modelPlan.kamiSec;
const shimoClip = Buffer.from(encodeWav(modelPcm.slice(0, Math.round(SHIMO_CLIP_SEC * rate)), rate));
const kamiClip = Buffer.from(encodeWav(modelPcm.slice(Math.round((SHIMO_CLIP_SEC + modelPlan.maSec) * rate)), rate));

async function serveModel(page: Page, { status = 200 } = {}) {
  const served = { asked: [] as string[], status };
  await page.route('**/audio/v1/*', (route) => {
    const { pathname } = new URL(route.request().url());
    served.asked.push(pathname);
    if (served.status !== 200) return route.fulfill({ status: served.status, body: '' });
    return route.fulfill({ status: 200, contentType: 'audio/mp4', body: pathname.endsWith('_2.m4a') ? shimoClip : kamiClip });
  });
  return served;
}

const serveExample = (page: Page, pcm: Float32Array) =>
  page.route('**/audio/examples/**', (route) => route.fulfill({ status: 200, contentType: 'audio/mp4', body: Buffer.from(encodeWav(pcm, rate)) }));

// 鳴らした音、マイクの開閉、本文つきの送信を、API の境界で記録する。鳴らした音の文脈も残し、鳴っているか、止めたあとに閉じたかを確かめる。
async function watch(target: Page | BrowserContext) {
  await target.addInitScript(() => {
    localStorage.setItem('yomimasu.recHelpDone', '1');
    const played: { node: AudioBufferSourceNode; when: number }[] = [];
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (this: AudioBufferSourceNode, when?: number, ...rest: number[]) {
      played.push({ node: this, when: when ?? 0 });
      return start.call(this, when, ...rest);
    };
    let mediaPlays = 0;
    HTMLMediaElement.prototype.play = function () {
      mediaPlays += 1;
      return Promise.resolve();
    };
    const opened: MediaStream[] = [];
    const getUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (asked) => {
      const stream = await getUserMedia(asked);
      opened.push(stream);
      return stream;
    };
    const beacons: string[] = [];
    navigator.sendBeacon = (url) => {
      beacons.push(String(url));
      return true;
    };
    Object.assign(window, { played, openedMicrophones: opened, beacons, mediaPlays: () => mediaPlays });
  });
}

function watchSent(target: Page | BrowserContext) {
  const sent: string[] = [];
  target.on('request', (request) => {
    if (!['GET', 'HEAD'].includes(request.method())) sent.push(`${request.method()} ${request.url()}`);
  });
  return sent;
}

type Played = { duration: number; when: number; now: number; state: string };
type Watched = { played: { node: AudioBufferSourceNode; when: number }[]; openedMicrophones: MediaStream[]; beacons: string[]; mediaPlays: () => number };
const playedOf = (page: Page): Promise<Played[]> =>
  page.evaluate(() =>
    (window as unknown as Watched).played.map(({ node, when }) => ({ duration: node.buffer?.duration ?? 0, when, now: node.context.currentTime, state: (node.context as AudioContext).state })),
  );
const sounding = (played: Played) => played.state === 'running' && played.now > played.when;
const microphones = (page: Page) =>
  page.evaluate(() => (window as unknown as Watched).openedMicrophones.map((stream) => stream.getTracks().every((track) => track.readyState === 'ended')));
const beaconsOf = (page: Page) => page.evaluate(() => (window as unknown as Watched).beacons);
const mediaPlaysOf = (page: Page) => page.evaluate(() => (window as unknown as Watched).mediaPlays());

const result = (page: Page) => page.locator('yomimasu-result');
const playButtons = (page: Page) => result(page).locator('.pair button');
const button = (page: Page, name: string) => result(page).getByRole('button', { name, exact: true });
const box = async (target: Locator) => (await target.boundingBox())!;

function writeFakeMicFile(pcm: Float32Array, sampleRate: number): string {
  const path = join(mkdtempSync(join(tmpdir(), 'yomimasu-e2e-')), 'reading.wav');
  writeFileSync(path, encodeWav(pcm, sampleRate));
  return path;
}

test('読んで結果の画面へ進むと、次に直す1点の下で自分の読みとお手本を交互に鳴らせ、鳴っているほうを止められる。お手本は結果の組を取り、録音を送らない', async ({ baseURL }) => {
  // 録音は実時間で進む。
  test.setTimeout(90_000);
  const browser = await chromium.launch({
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${writeFakeMicFile(synthesize(reading), reading.sampleRate)}%noloop`],
  });
  const context = await browser.newContext({ baseURL, viewport: VIEWPORT });
  const sent = watchSent(context);
  await watch(context);
  const page = await context.newPage();
  const served = await serveModel(page);

  await page.goto(`/read/rec/?shimo=${PAIR.shimo}&kami=${PAIR.kami}`);
  await page.getByRole('button', { name: '読み始める' }).click();
  const endSec = reading.leadSec + reading.shimoSec + reading.yoinSec + reading.maSec + reading.kamiSec + reading.tailSec;
  await page.waitForTimeout(endSec * 1000 + 300);
  await page.getByRole('button', { name: '読み終えた' }).click();
  // 読み終えると、殻が開き直さずに本文を結果の画面へ入れ替える。読む画面で開いた1本は閉じていて、結果の画面は新しくマイクを開かない。
  await expect(result(page).locator('.res')).toBeVisible();
  expect(new URL(page.url()).pathname).toBe('/result/');
  const take = page.getByTestId('take');
  const lengthSec = Number(await take.getAttribute('data-length-sec'));
  const readingStartSec = Number(await take.getAttribute('data-reading-start-sec'));
  expect(await microphones(page)).toEqual([true]);

  // 次に直す1点のカードの下、「録音は端末の外へ出ません。」の上に、2つを並べる。
  await expect(playButtons(page)).toHaveText(['自分の読み', 'お手本']);
  const [one, pair, note] = [
    await box(result(page).locator('.one')),
    await box(result(page).locator('.pair')),
    await box(result(page).locator('p.fine', { hasText: '録音は端末の外へ出ません。' })),
  ];
  expect(pair.y).toBeGreaterThanOrEqual(one.y + one.height);
  expect(note.y).toBeGreaterThanOrEqual(pair.y + pair.height);
  for (const button of await playButtons(page).all()) expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  mkdirSync(ARTIFACTS_DIR, { recursive: true });
  await page.screenshot({ path: join(ARTIFACTS_DIR, 'listen-back.png'), fullPage: true });

  // 自分の読みは、合図の間を除いて、読み始めの位置から録音の最後までを鳴らす。
  await button(page, '自分の読み').click();
  await expect(playButtons(page)).toHaveText(['やめる', 'お手本']);
  await expect.poll(async () => (await playedOf(page)).map(sounding)).toEqual([true]);
  const [own] = await playedOf(page);
  expect(Math.abs(own.duration - (lengthSec - readingStartSec))).toBeLessThanOrEqual(0.002);

  // お手本を押すと自分の読みが止まり、お手本の組を、下の句、1.0 秒の間、上の句の順に鳴らす。
  await button(page, 'お手本').click();
  await expect(playButtons(page)).toHaveText(['自分の読み', 'やめる']);
  await expect.poll(async () => (await playedOf(page)).map(sounding)).toEqual([false, true, true]);
  const [stoppedOwn, shimo, kami] = await playedOf(page);
  expect(stoppedOwn.state).toBe('closed');
  expect(served.asked.sort()).toEqual(['/audio/v1/053_2.m4a', '/audio/v1/086_1.m4a']);
  expect(shimo.duration).toBeCloseTo(SHIMO_CLIP_SEC, 2);
  expect(kami.duration).toBeCloseTo(KAMI_CLIP_SEC, 2);
  expect(kami.when - (shimo.when + shimo.duration)).toBeCloseTo(1.0, 6);
  await page.screenshot({ path: join(ARTIFACTS_DIR, 'listen-back-playing.png') });

  // 鳴っているお手本は、同じ場所の「やめる」で止まる。
  await button(page, 'やめる').click();
  await expect(playButtons(page)).toHaveText(['自分の読み', 'お手本']);
  await expect.poll(async () => (await playedOf(page)).map((played) => played.state)).toEqual(['closed', 'closed', 'closed']);

  // 逆の順でも、自分の読みを押すとお手本が止まる。鳴っている自分の読みも止められる。
  await button(page, 'お手本').click();
  await expect.poll(async () => (await playedOf(page)).slice(3).map(sounding)).toEqual([true, true]);
  await button(page, '自分の読み').click();
  await expect(playButtons(page)).toHaveText(['やめる', 'お手本']);
  await expect.poll(async () => (await playedOf(page)).slice(3).map(sounding)).toEqual([false, false, true]);
  await button(page, 'やめる').click();
  await expect(playButtons(page)).toHaveText(['自分の読み', 'お手本']);
  await expect.poll(async () => (await playedOf(page)).every((played) => played.state === 'closed')).toBe(true);

  // お手本は鳴り終えると、押す前の表示に戻る。
  await button(page, 'お手本').click();
  await expect(playButtons(page)).toHaveText(['自分の読み', 'やめる']);
  await expect(playButtons(page)).toHaveText(['自分の読み', 'お手本'], { timeout: 10_000 });

  await expect(result(page)).not.toContainText(/総合|点数|(?<!直す)\d+\s*点|順位/);
  await expect(result(page).getByRole('alert')).toHaveCount(0);
  expect(await microphones(page)).toEqual([true]);
  expect(await mediaPlaysOf(page)).toBe(0);
  expect(sent).toEqual([]);
  expect(await beaconsOf(page)).toEqual([]);
  writeFileSync(
    join(ARTIFACTS_DIR, 'listen-back.json'),
    JSON.stringify(
      {
        own: { takeSec: lengthSec, readingStartSec, playedSec: own.duration },
        model: { asked: served.asked, shimoSec: shimo.duration, kamiSec: kami.duration, gapSec: kami.when - (shimo.when + shimo.duration) },
      },
      null,
      2,
    ),
  );
  await browser.close();
});

test('例の録音の結果でも、例の読みとお手本を鳴らせる。「自分の読み」とは書かず、お手本は例の組を取る', async ({ page }) => {
  const example = synthesize({ ...standardReading, maSec: 1.6 });
  await serveExample(page, example);
  const served = await serveModel(page);
  const sent = watchSent(page);
  await watch(page);
  await page.setViewportSize(VIEWPORT);
  await page.goto('/result/example/');

  await expect(result(page).locator('.res')).toBeVisible();
  await expect(playButtons(page)).toHaveText(['例の読み', 'お手本']);
  await expect(result(page)).not.toContainText('自分の読み');

  // 例の音声は合図の間を含まないので、頭から最後までを鳴らす。
  await button(page, '例の読み').click();
  await expect(playButtons(page)).toHaveText(['やめる', 'お手本']);
  await expect.poll(async () => (await playedOf(page)).map(sounding)).toEqual([true]);
  expect((await playedOf(page))[0].duration).toBeCloseTo(example.length / rate, 3);

  await button(page, 'お手本').click();
  await expect.poll(async () => (await playedOf(page)).map(sounding)).toEqual([false, true, true]);
  expect(served.asked.sort()).toEqual(['/audio/v1/045_1.m4a', '/audio/v1/081_2.m4a']);
  mkdirSync(ARTIFACTS_DIR, { recursive: true });
  await page.screenshot({ path: join(ARTIFACTS_DIR, 'listen-back-example.png'), fullPage: true });
  await button(page, 'やめる').click();
  await expect(playButtons(page)).toHaveText(['例の読み', 'お手本']);
  await expect.poll(async () => (await playedOf(page)).every((played) => played.state === 'closed')).toBe(true);

  expect(sent).toEqual([]);
  expect(await beaconsOf(page)).toEqual([]);
});

test('お手本を読み込めないときは、失敗の文言を出して押す前の表示に戻し、もう一度押すと文言を消して読み込み直す', async ({ page }) => {
  await serveExample(page, synthesize({ ...standardReading, maSec: 1.6 }));
  const served = await serveModel(page, { status: 404 });
  await watch(page);
  await page.setViewportSize(VIEWPORT);
  await page.goto('/result/example/');

  await button(page, 'お手本').click();
  await expect(result(page).getByRole('alert')).toHaveText(LOAD_FAILED);
  await expect(playButtons(page)).toHaveText(['例の読み', 'お手本']);
  expect(await playedOf(page)).toEqual([]);
  mkdirSync(ARTIFACTS_DIR, { recursive: true });
  await page.screenshot({ path: join(ARTIFACTS_DIR, 'listen-back-failed.png'), fullPage: true });

  served.status = 200;
  await button(page, 'お手本').click();
  await expect(result(page).getByRole('alert')).toHaveCount(0);
  await expect.poll(async () => (await playedOf(page)).map(sounding)).toEqual([true, true]);
});

test('次に直す1点のカードがないとき（どの行も測れなかったとき）は、結果の行の下に2つを置く', async ({ page }) => {
  await serveExample(page, new Float32Array(20 * rate));
  await watch(page);
  await page.setViewportSize(VIEWPORT);
  await page.goto('/result/example/');

  await expect(result(page).locator('.res')).toBeVisible();
  await expect(page.locator('main .one')).toHaveCount(0);
  await expect(playButtons(page)).toHaveText(['例の読み', 'お手本']);
  const [rows, pair] = [await box(result(page).locator('.res')), await box(result(page).locator('.pair'))];
  expect(pair.y).toBeGreaterThanOrEqual(rows.y + rows.height);
  mkdirSync(ARTIFACTS_DIR, { recursive: true });
  await page.screenshot({ path: join(ARTIFACTS_DIR, 'listen-back-unmeasured.png'), fullPage: true });
});

test('録音がないまま結果の画面を開くと、再生を出さず、まず1回読むへ案内する', async ({ page }) => {
  await page.goto('/result/');
  await expect(result(page).getByRole('status')).toContainText('まだ録音がありません。');
  await expect(result(page).getByRole('button')).toHaveCount(0);
});
