import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test, type Browser, type Page } from '@playwright/test';
import deck from '../.claude/skills/yomimasu/assets/cards.json' with { type: 'json' };
import { standardReading, synthesize, type ReadingPlan } from '../test/support/synth.ts';
import { encodeWav } from '../test/support/wav.ts';

const ARTIFACTS_DIR = 'e2e-artifacts';
const COUNT_SEC = 2.4;
// 合図の 2.4 秒のあいだに読み始めないよう、合成音の頭に余白を置く。
const reading: ReadingPlan = { ...standardReading, leadSec: COUNT_SEC + 0.6 };

// 音声はリポジトリに置かないので、テストの音は OS の一時フォルダーへ書く。
function writeFakeMicFile(pcm: Float32Array, sampleRate: number): string {
  const path = join(mkdtempSync(join(tmpdir(), 'yomimasu-e2e-')), 'reading.wav');
  writeFileSync(path, encodeWav(pcm, sampleRate));
  return path;
}

const launchWithFakeMic = (pcm: Float32Array = synthesize(reading), rate = reading.sampleRate) =>
  chromium.launch({
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-audio-capture=${writeFakeMicFile(pcm, rate)}%noloop`,
    ],
  });

// マイクの開閉、求めた声の処理、鳴った音を、API の境界で記録する。
// lateMs を渡すと、worklet から届く録音の塊をその分だけ遅らせて渡す。CI の遅い環境では、塊が画面の時計より遅れて届く。
async function openPage(browser: Browser, baseURL: string | undefined, path = '/read/rec/', { help = false, lateMs = 0 } = {}) {
  const page = await (await browser.newContext({ baseURL })).newPage();
  await page.addInitScript(({ help, lateMs }) => {
    if (!help) localStorage.setItem('yomimasu.recHelpDone', '1');
    if (lateMs > 0) {
      const onmessage = Object.getOwnPropertyDescriptor(MessagePort.prototype, 'onmessage')!;
      Object.defineProperty(MessagePort.prototype, 'onmessage', {
        ...onmessage,
        set(this: MessagePort, handler: ((event: MessageEvent) => void) | null) {
          onmessage.set!.call(this, handler && ((event: MessageEvent) => void setTimeout(() => handler.call(this, event), lateMs)));
        },
      });
    }
    const opened: MediaStream[] = [];
    const constraints: MediaStreamConstraints[] = [];
    const getUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (asked) => {
      constraints.push(asked ?? {});
      const stream = await getUserMedia(asked);
      opened.push(stream);
      return stream;
    };
    const sounds: string[] = [];
    for (const name of ['createOscillator', 'createBufferSource'] as const) {
      const original = AudioContext.prototype[name] as (...args: unknown[]) => unknown;
      Object.defineProperty(AudioContext.prototype, name, {
        value(this: AudioContext, ...args: unknown[]) {
          sounds.push(name);
          return original.apply(this, args);
        },
      });
    }
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      sounds.push('media');
      return play.call(this);
    };
    Object.assign(window, { openedMicrophones: opened, askedConstraints: constraints, playedSounds: sounds });
  }, { help, lateMs });
  await page.goto(path);
  return page;
}

const microphonesClosed = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as { openedMicrophones: MediaStream[] }).openedMicrophones.map((stream) => stream.getTracks().every((track) => track.readyState === 'ended')),
  );

const takeOf = async (page: Page) => {
  const take = page.getByTestId('take');
  await expect(take).toBeAttached();
  const read = async (name: string) => take.getAttribute(`data-${name}`);
  return {
    lengthSec: Number(await read('length-sec')),
    readingStartSec: Number(await read('reading-start-sec')),
    assisted: await read('assisted'),
    pair: await read('pair'),
    voiceProcessing: JSON.parse((await read('voice-processing')) ?? 'null'),
  };
};

const startButton = (page: Page) => page.getByRole('button', { name: '読み始める' });
const finishButton = (page: Page) => page.getByRole('button', { name: '読み終えた' });
const cancelButton = (page: Page) => page.getByRole('button', { name: 'やめる' });
const recState = (page: Page) => page.locator('.bar').getByText('録音中');
const block = (page: Page, phase: 'shimo' | 'yoin-ma' | 'kami') => page.locator(`.blk[data-phase="${phase}"]`);
// 塗った割合で、0.00% から 100.00% まで進む。
const paintOf = (page: Page, selector: string, name = '--p') =>
  page.locator(selector).evaluateAll((elements, name) => elements.map((element) => (element as HTMLElement).style.getPropertyValue(name)), name);
const boxesOf = (page: Page) => page.getByTestId('lyrics').locator('[data-at]').evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().toJSON()));

// マイクを開くまでは合図が出ないので、合図が出て消えるまでを待つ。
const waitForReading = async (page: Page) => {
  await expect(page.locator('.count')).toBeVisible();
  await expect(page.locator('.count')).toBeHidden({ timeout: 5000 });
  await expect(block(page, 'shimo')).toHaveClass(/is-now/);
};

test('合図は数字だけで音を鳴らさず、録音は合図の前から始まる', async ({ baseURL }) => {
  const browser = await launchWithFakeMic();
  const page = await openPage(browser, baseURL);

  await startButton(page).click();
  await expect(page.locator('.count')).toHaveText('3');
  expect(await microphonesClosed(page)).toEqual([false]);
  await expect(recState(page)).toBeVisible();
  await expect(page.locator('.count')).toHaveText('2');
  await expect(page.locator('.count')).toHaveText('1');
  await waitForReading(page);

  expect(await page.evaluate(() => (window as unknown as { playedSounds: string[] }).playedSounds)).toEqual([]);
  await browser.close();
});

test('読み終えたは上の句の区間から押せ、録音を読み始めの位置つきで置いて確かめる画面へ移る', async ({ baseURL }) => {
  const browser = await launchWithFakeMic();
  const page = await openPage(browser, baseURL);
  const lyrics = page.getByTestId('lyrics');
  const before = await lyrics.boundingBox();

  const pressedAt = Date.now();
  await startButton(page).click();
  await waitForReading(page);
  expect(await lyrics.boundingBox()).toEqual(before);
  await expect(finishButton(page)).toBeDisabled();
  await expect(block(page, 'yoin-ma')).toHaveClass(/is-now/, { timeout: 7000 });
  await expect(finishButton(page)).toBeDisabled();
  await expect(block(page, 'kami')).toHaveClass(/is-now/, { timeout: 6000 });
  expect(await lyrics.boundingBox()).toEqual(before);
  await finishButton(page).click();
  const wallSec = (Date.now() - pressedAt) / 1000;

  await expect(page.getByRole('heading', { name: '読めました。まず聴いてみましょう。' })).toBeVisible();
  await expect(page.getByRole('img', { name: /下の句 5秒/ })).toHaveCount(0);
  await expect(page.locator('.run')).toContainText('● 録音しました');
  expect(await microphonesClosed(page)).toEqual([true]);
  await expect(recState(page)).toHaveCount(0);

  const take = await takeOf(page);
  expect(take.readingStartSec).toBeGreaterThanOrEqual(COUNT_SEC);
  expect(take.readingStartSec).toBeLessThan(COUNT_SEC + 0.3);
  expect(take.lengthSec).toBeGreaterThan(take.readingStartSec + 9);
  expect(take.lengthSec).toBeLessThanOrEqual(wallSec);
  expect(take).toMatchObject({ assisted: 'true', pair: '81-45' });

  await expect(page.getByRole('link', { name: '結果を見る' })).toHaveAttribute('href', '/result/');
  await expect(page.getByRole('button', { name: '読み直す' })).toBeVisible();

  mkdirSync(ARTIFACTS_DIR, { recursive: true });
  await page.screenshot({ path: join(ARTIFACTS_DIR, 'heard.png') });
  writeFileSync(
    join(ARTIFACTS_DIR, 'take.json'),
    JSON.stringify({ expectedReadingStartSec: COUNT_SEC, recordedReadingStartSec: take.readingStartSec, recordedLengthSec: take.lengthSec, wallSec }, null, 2),
  );

  await page.getByRole('button', { name: '読み直す' }).click();
  await expect(startButton(page)).toBeVisible();
  await expect(lyrics).toBeVisible();
  await browser.close();
});

test('読んでいるあいだは今の区切りだけを囲み、読み上げた字だけを朱にし、囲みと表記の切り替えの出し入れで字を動かさない', async ({ baseURL }) => {
  const browser = await launchWithFakeMic();
  const page = await openPage(browser, baseURL);
  const notation = page.getByRole('group', { name: '歌の表記' });
  await expect(notation).toBeVisible();
  await expect(page.locator('.blk.is-now')).toHaveCount(0);
  const before = await boxesOf(page);

  await startButton(page).click();
  await expect(notation).toBeHidden();
  await waitForReading(page);
  await expect(page.locator('.blk.is-now')).toHaveCount(1);

  await expect(block(page, 'yoin-ma')).toHaveClass(/is-now/, { timeout: 7000 });
  await expect(page.locator('.blk.is-now')).toHaveCount(1);
  expect(new Set(await paintOf(page, '.blk[data-phase="shimo"] [data-at]'))).toEqual(new Set(['100.00%']));
  expect(new Set(await paintOf(page, '.blk[data-phase="kami"] [data-at]'))).toEqual(new Set(['0.00%']));
  expect(await boxesOf(page)).toEqual(before);
  mkdirSync(ARTIFACTS_DIR, { recursive: true });
  await page.screenshot({ path: join(ARTIFACTS_DIR, 'reading-yoin.png') });

  await expect(block(page, 'kami')).toHaveClass(/is-now/, { timeout: 6000 });
  await expect(page.locator('.blk.is-now')).toHaveCount(1);
  expect(await paintOf(page, '.lyric .yoin', '--yoin-done')).toEqual(['100.00%']);
  await expect(page.locator('body')).not.toContainText('タップ');

  await cancelButton(page).click();
  await expect(notation).toBeVisible();
  await expect(page.locator('.blk.is-now')).toHaveCount(0);
  expect(await boxesOf(page)).toEqual(before);
  await browser.close();
});

test('補助を外すと、字の朱と区切りの囲みを出さずに「補助なし」と出し、歌詞と録音中の表示は残る', async ({ baseURL }) => {
  const browser = await launchWithFakeMic();
  const page = await openPage(browser, baseURL);

  await page.getByRole('button', { name: '補助を外す' }).click();
  await expect(page.getByRole('button', { name: '補助を外す' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: '補助あり' })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.now b')).toHaveText('補助なし');

  await startButton(page).click();
  await expect(page.locator('.count')).toBeVisible();
  await expect(page.locator('.count')).toBeHidden({ timeout: 5000 });
  await expect(page.locator('.now b')).toHaveText('補助なし');
  // 余韻を弱め始める 7 秒を過ぎるまで待つ。余韻の印の塗りは、その前後で式が変わる。
  await page.waitForTimeout(7500);
  await expect(page.locator('.blk.is-now')).toHaveCount(0);
  expect(new Set(await paintOf(page, '.lyric [data-at]'))).toEqual(new Set(['0.00%']));
  expect(await paintOf(page, '.lyric .yoin', '--yoin-done')).toEqual(['0.00%']);
  await expect(page.getByTestId('lyrics')).toBeVisible();
  await expect(recState(page)).toBeVisible();

  await expect(finishButton(page)).toBeEnabled({ timeout: 4000 });
  await finishButton(page).click();
  expect(await takeOf(page)).toMatchObject({ assisted: 'false' });
  await browser.close();
});

test('やめるで録音を捨てて最初へ戻り、マイクを閉じる', async ({ baseURL }) => {
  const browser = await launchWithFakeMic();
  const page = await openPage(browser, baseURL);

  await startButton(page).click();
  await waitForReading(page);
  await cancelButton(page).click();

  await expect(startButton(page)).toBeVisible();
  await expect(page.getByTestId('take')).toHaveCount(0);
  await expect(recState(page)).toHaveCount(0);
  expect(await microphonesClosed(page)).toEqual([true]);
  await browser.close();
});

test('画面を隠すと、やめる扱いにしてマイクを閉じる', async ({ baseURL }) => {
  const browser = await launchWithFakeMic();
  const page = await openPage(browser, baseURL);

  await startButton(page).click();
  await expect(page.locator('.count')).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });

  await expect(startButton(page)).toBeVisible();
  expect(await microphonesClosed(page)).toEqual([true]);
  await browser.close();
});

for (const [name, leave] of [
  ['録音の部品が外れる', () => void document.querySelector('yomimasu-recorder')?.remove()],
  ['ページを離れる', () => void window.dispatchEvent(new PageTransitionEvent('pagehide'))],
] as const) {
  test(`${name}と、マイクを閉じる`, async ({ baseURL }) => {
    const browser = await launchWithFakeMic();
    const page = await openPage(browser, baseURL);

    await startButton(page).click();
    await waitForReading(page);
    await page.evaluate(leave);

    await expect.poll(() => microphonesClosed(page)).toEqual([true]);
    await browser.close();
  });
}

test('読み始めて 25 秒で自動で止め、録音の塊が遅れて届いても読み始めから 25 秒を録って、確かめる画面へ移る', async ({ baseURL }) => {
  test.setTimeout(60_000);
  const browser = await launchWithFakeMic();
  const page = await openPage(browser, baseURL, '/read/rec/', { lateMs: 30 });

  await startButton(page).click();
  await waitForReading(page);
  await expect(page.getByRole('heading', { name: '読めました。まず聴いてみましょう。' })).toBeVisible({ timeout: 30_000 });

  expect(await microphonesClosed(page)).toEqual([true]);
  const take = await takeOf(page);
  expect(take.lengthSec - take.readingStartSec).toBeGreaterThanOrEqual(25);
  expect(take.lengthSec - take.readingStartSec).toBeLessThan(25.5);

  mkdirSync(ARTIFACTS_DIR, { recursive: true });
  writeFileSync(
    join(ARTIFACTS_DIR, 'limit.json'),
    JSON.stringify({ lateMs: 30, recordedReadingStartSec: take.readingStartSec, recordedLengthSec: take.lengthSec }, null, 2),
  );
  await browser.close();
});

test('声の処理を切って求め、端末が対応する処理と実際の設定を録音に残す', async ({ baseURL }) => {
  const browser = await launchWithFakeMic();
  const page = await openPage(browser, baseURL);

  await startButton(page).click();
  await waitForReading(page);
  await cancelButton(page).click();
  expect(await page.evaluate(() => (window as unknown as { askedConstraints: MediaStreamConstraints[] }).askedConstraints)).toEqual([
    { audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } },
  ]);

  // 止めた直後の「読み始める」は連打として受け付けない。
  await page.waitForTimeout(600);
  await startButton(page).click();
  await waitForReading(page);
  await page.waitForTimeout(8000);
  await finishButton(page).click();
  const { voiceProcessing } = await takeOf(page);
  expect(voiceProcessing.supported).toMatchObject({ echoCancellation: true, noiseSuppression: true, autoGainControl: true });
  expect(voiceProcessing.settings).toMatchObject({ echoCancellation: false, noiseSuppression: false, autoGainControl: false });
  await browser.close();
});

test('録音の前に音声のセッションを auto に戻し、録音の間だけ画面を消さない', async ({ baseURL }) => {
  const browser = await launchWithFakeMic();
  const page = await (await browser.newContext({ baseURL })).newPage();
  await page.addInitScript(() => {
    localStorage.setItem('yomimasu.recHelpDone', '1');
    const log = { requested: 0, released: 0 };
    Object.defineProperty(navigator, 'audioSession', { value: { type: 'playback' } });
    Object.defineProperty(navigator, 'wakeLock', {
      value: {
        request: async () => {
          log.requested += 1;
          return { release: async () => void (log.released += 1), addEventListener() {} };
        },
      },
    });
    Object.assign(window, { wakeLog: log });
  });
  await page.goto('/read/rec/');
  const wakeLog = () => page.evaluate(() => (window as unknown as { wakeLog: { requested: number; released: number } }).wakeLog);

  expect(await wakeLog()).toEqual({ requested: 0, released: 0 });
  await startButton(page).click();
  await waitForReading(page);
  expect(await page.evaluate(() => (navigator as unknown as { audioSession: { type: string } }).audioSession.type)).toBe('auto');
  expect(await wakeLog()).toEqual({ requested: 1, released: 0 });
  await cancelButton(page).click();
  await expect.poll(wakeLog).toEqual({ requested: 1, released: 1 });
  await browser.close();
});

test('画面を消さない設定を取れなくても、録音は止めない', async ({ baseURL }) => {
  const browser = await launchWithFakeMic();
  const page = await (await browser.newContext({ baseURL })).newPage();
  await page.addInitScript(() => {
    localStorage.setItem('yomimasu.recHelpDone', '1');
    Object.defineProperty(navigator, 'wakeLock', { value: { request: () => Promise.reject(new DOMException('no', 'NotAllowedError')) } });
  });
  await page.goto('/read/rec/');

  await startButton(page).click();
  await waitForReading(page);
  await expect(block(page, 'kami')).toHaveClass(/is-now/, { timeout: 12_000 });
  await finishButton(page).click();
  await expect(page.getByTestId('take')).toBeAttached();
  await browser.close();
});

test('実行の行は組を決まり字で書き、前回の直す点を渡すと代わりに1行で出す', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('yomimasu.recHelpDone', '1'));
  const cards = deck.cards as { no: number; kimariji: { kana: string } | null }[];
  const kimariji = (no: number) => cards.find((card) => card.no === no)?.kimariji?.kana;

  await page.goto('/read/rec/');
  await expect(page.locator('.run')).toHaveText('> /yomimasu 読む ほ あはれ');
  await page.goto('/read/rec/?shimo=53&kami=86');
  await expect(page.locator('.run')).toHaveText(`> /yomimasu 読む ${kimariji(53)} ${kimariji(86)}`);

  await page.evaluate(() => {
    const element = document.createElement('yomimasu-recorder');
    element.setAttribute('fix', '間を1.0秒にそろえる');
    document.querySelector('yomimasu-recorder')?.replaceWith(element);
  });
  await expect(page.getByText('直す1点：間を1.0秒にそろえる')).toBeVisible();
  await expect(page.locator('.run')).toHaveCount(0);
});

test('初めて開いたときだけ読む前の説明を出し、わかったで閉じたあとは説明のリンクで同じ説明を開ける', async ({ page }) => {
  const items = ['「読み始める」を押すと、3・2・1 と数えます。数え終わったら読み始めてください。'];
  await page.goto('/read/rec/');
  const help = page.getByRole('dialog', { name: '読む前に' });
  await expect(help).toBeVisible();
  await expect(help.locator('p')).toHaveText(items);
  await help.getByRole('button', { name: 'わかった' }).click();
  await expect(help).toBeHidden();

  await page.reload();
  await expect(page.getByTestId('lyrics')).toBeVisible();
  await expect(help).toBeHidden();
  await page.getByRole('button', { name: '読み方の説明' }).click();
  await expect(help).toBeVisible();
  await expect(help.locator('p')).toHaveText(items);
});

test('読み始めるを押すと、読む前の説明を閉じて覚える', async ({ baseURL }) => {
  const browser = await launchWithFakeMic();
  const page = await openPage(browser, baseURL, '/read/rec/', { help: true });
  const help = page.getByRole('dialog', { name: '読む前に' });
  await expect(help).toBeVisible();

  await startButton(page).click();
  await expect(help).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem('yomimasu.recHelpDone'))).toBe('1');
  await cancelButton(page).click();
  await browser.close();
});

test('録音の前の説明は、端末の外へ送らないことだけを書き、持ち方の案内を出さない', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('yomimasu.recHelpDone', '1'));
  await page.goto('/read/rec/');
  await expect(page.locator('yomimasu-recorder .fine')).toHaveText(/^録音はこの端末の外へ送りません。\s*読み方の説明$/);
  await expect(page.locator('body')).not.toContainText('持ち');
  await expect(page.getByText('例の録音で見る')).toHaveCount(0);
});

test('マイクを許可しないときは、理由と次の操作を出す', async ({ browser, baseURL }) => {
  const page = await (await browser.newContext({ baseURL })).newPage();
  // ヘッドレスの Chromium は許可の確認を出せず NotSupportedError を返すので、拒否は API の境界で再現する。
  await page.addInitScript(() => {
    localStorage.setItem('yomimasu.recHelpDone', '1');
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('denied', 'NotAllowedError'));
  });
  await page.goto('/read/rec/');

  await startButton(page).click();

  const alert = page.getByRole('alert');
  await expect(alert).toContainText('マイクを使えませんでした。ブラウザーの設定でマイクを許可すると、読んで測れます。教科書とお手本はこのまま使えます。');
  await expect(page.getByRole('button', { name: 'もう一度試す' })).toBeVisible();
  await expect(page.getByRole('link', { name: '教科書へ戻る' })).toBeVisible();
  await expect(page.getByText('例の録音で見る')).toHaveCount(0);
  mkdirSync(ARTIFACTS_DIR, { recursive: true });
  await page.screenshot({ path: join(ARTIFACTS_DIR, 'denied.png') });
});

test('録音の準備に失敗したら、マイクを閉じて理由を見せる', async ({ baseURL }) => {
  const browser = await launchWithFakeMic();
  const page = await openPage(browser, baseURL);
  // page.route は AudioWorklet の読み込みを横取りしないので、失敗は API の境界で再現する。
  await page.evaluate(() => {
    AudioWorklet.prototype.addModule = () => Promise.reject(new DOMException('failed', 'AbortError'));
  });

  await startButton(page).click();

  await expect(page.getByRole('alert')).toContainText('録音を始められませんでした');
  await expect(page.getByRole('button', { name: 'もう一度試す' })).toBeVisible();
  expect(await microphonesClosed(page)).toEqual([true]);
  await browser.close();
});

test('録音をつなぐ処理に失敗したら、マイクを閉じて理由を見せる', async ({ baseURL }) => {
  const browser = await launchWithFakeMic();
  const page = await openPage(browser, baseURL);
  await page.evaluate(() => {
    AudioContext.prototype.createMediaStreamSource = () => {
      throw new DOMException('failed', 'NotSupportedError');
    };
  });

  await startButton(page).click();

  await expect(page.getByRole('alert')).toContainText('録音を始められませんでした');
  expect(await microphonesClosed(page)).toEqual([true]);
  await browser.close();
});

test('読み始めるを続けて押しても、マイクは1つだけ開く', async ({ baseURL }) => {
  const browser = await launchWithFakeMic();
  const page = await openPage(browser, baseURL);

  await startButton(page).dblclick();
  // 続けて押した2回目が同じ高さの「やめる」に当たっても、始めた直後は止めない。
  await expect(page.locator('.count')).toBeVisible();
  await page.waitForTimeout(600);
  await cancelButton(page).click();

  expect(await microphonesClosed(page)).toEqual([true]);
  await browser.close();
});
