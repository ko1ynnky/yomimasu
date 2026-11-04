import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';
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
// 止める操作と、字の塗りと囲みの進みを確かめる音は、上の句の区切りまで鳴り終えないよう長くする。
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
// 鳴らした文脈も残し、字の塗りと囲みがその文脈の時刻で進むかを確かめる。
async function watchAudio(page: Page, { introDone = false } = {}) {
  await page.addInitScript((introDone) => {
    if (introDone) localStorage.setItem('yomimasu.introDone', '1');
    const record = { starts: [] as { when: number; now: number; duration: number }[], mediaPlays: 0, session: [] as string[] };
    const w = window as unknown as { audioRecord: typeof record; playedContext?: BaseAudioContext };
    w.audioRecord = record;
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (this: AudioBufferSourceNode, when?: number, ...rest: number[]) {
      record.starts.push({ when: when ?? 0, now: this.context.currentTime, duration: this.buffer?.duration ?? 0 });
      w.playedContext = this.context;
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
const stepOf = (page: Page) => page.locator('.bar .step');
const notation = (page: Page) => page.getByRole('group', { name: '歌の表記' });
const block = (page: Page, phase: 'shimo' | 'yoin-ma' | 'kami') => page.locator(`.blk[data-phase="${phase}"]`);
// 塗った割合で、0.00% から 100.00% まで進む。
const paintOf = (page: Page, selector: string, name = '--p') =>
  page.locator(selector).evaluateAll((elements, name) => elements.map((element) => (element as HTMLElement).style.getPropertyValue(name)), name);
const boxesOf = (page: Page) => page.getByTestId('lyrics').locator('[data-at]').evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().toJSON()));
const box = async (target: Locator) => {
  const found = await target.boundingBox();
  if (!found) throw new Error('要素がない');
  return found;
};
const fitsOneScreen = (page: Page) => page.evaluate(() => document.documentElement.scrollHeight <= innerHeight);

// 今の区切りの囲みが移るたびに、鳴らしている文脈の時刻を残す。音を予約する前に移ったときは null にする。
type PhaseMove = { phase: string; at: number | null };
const logPhases = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { phaseLog: PhaseMove[]; playedContext?: BaseAudioContext };
    w.phaseLog = [];
    new MutationObserver(() => {
      const phase = document.querySelector<HTMLElement>('.blk.is-now')?.dataset.phase ?? '';
      if (w.phaseLog.at(-1)?.phase !== phase) w.phaseLog.push({ phase, at: w.playedContext?.currentTime ?? null });
    }).observe(document.querySelector('.stage')!, { subtree: true, attributes: true, attributeFilter: ['class'] });
  });
const phaseLog = (page: Page) => page.evaluate(() => (window as unknown as { phaseLog: PhaseMove[] }).phaseLog);

test('初めて開くと、まず1回読む の導入の段1で、ルールの文と「5-3-1-6」と止まった帯を出し、音を鳴らさない', async ({ page }) => {
  const served = await serveAudio(page);
  await watchAudio(page);
  await page.goto('/read/');
  await expect(say(page)).toHaveText('競技かるたの読みには、5-3-1-6 というシンプルなルールがあります。');
  await expect(stepOf(page)).toHaveText('はじめに 1 / 3');
  await expect(page.getByText('5-3-1-6', { exact: true })).toBeVisible();
  const band = page.getByRole('img', { name: '下の句 5秒、余韻 3秒、間 1秒、上の句 6秒' });
  await expect(band).toBeVisible();
  await expect(band.locator('.seg small')).toHaveText(['5秒', '3秒', '1秒', '6秒']);
  await expect(page.getByTestId('lyrics')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '次へ' })).toHaveClass(/btn--fill/);
  await page.waitForTimeout(500);
  // 帯は進みを見せる部品としては使わないので、時間がたっても今の区間の線も塗りも出さない。
  await expect(band.locator('.seg.is-now')).toHaveCount(0);
  expect(await band.locator('.seg i').evaluateAll((fills) => fills.map((fill) => (fill as HTMLElement).style.width))).toEqual(['', '', '', '']);
  expect(served.asked).toEqual([]);
  expect((await audioRecord(page)).starts).toEqual([]);
  mkdirSync(ARTIFACTS_DIR, { recursive: true });
  await page.screenshot({ path: join(ARTIFACTS_DIR, 'listen-intro-1.png') });
});

test('段2は、81番の下の句と45番の上の句の組と歌の枠を出し、枠には帯も地の減りも区間名も出さず、表記の切り替えも出さない', async ({ page }) => {
  await serveAudio(page);
  await watchAudio(page);
  await page.goto('/read/');
  await page.getByRole('button', { name: '次へ' }).click();
  await expect(say(page)).toHaveText('お手本と一緒に、ルールを確かめてみましょう。');
  await expect(stepOf(page)).toHaveText('はじめに 2 / 3');
  await expect(page.getByTestId('pair')).toHaveText('ほ → あはれ');
  await expect(page.locator('.blk-head')).toHaveText(['下の句5秒', '余韻3秒間1秒', '上の句6秒']);
  // 最初の表記はかなである。
  await expect(block(page, 'shimo')).toContainText('ただーありあけのー');
  await expect(page.locator('.stage .band, .stage .drain, .stage .now')).toHaveCount(0);
  await expect(page.locator('.blk.is-now')).toHaveCount(0);
  await expect(notation(page)).toBeHidden();
  await expect(page.getByRole('button', { name: 'お手本を聞く' })).toHaveClass(/btn--fill/);
  await expect(page.getByText('字の朱は標準の時間で進むので、お手本の音とはずれます。')).toBeVisible();
  // 帯と歌の後ろの色を ①② で説明していた前の段2は、作りごとなくした。
  await expect(page.getByText('2つの仕組み')).toHaveCount(0);
  await expect(page.locator('[data-mark]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /確認する/ })).toHaveCount(0);
  await expect(page.getByText('おすすめ')).toHaveCount(0);
  mkdirSync(ARTIFACTS_DIR, { recursive: true });
  await page.screenshot({ path: join(ARTIFACTS_DIR, 'listen-intro-2.png') });
});

test('段2で「お手本を聞く」を押すと、2本を読み込んでから 1.0 秒あけて予約し、聞き終えると段3へ進んで端末に覚える', async ({ page }) => {
  const served = await serveAudio(page);
  await watchAudio(page);
  await page.goto('/read/');
  await page.getByRole('button', { name: '次へ' }).click();
  await page.getByRole('button', { name: 'お手本を聞く' }).click();
  await expect(page.getByRole('button', { name: 'やめる' })).toBeVisible();
  await expect(notation(page)).toBeHidden();
  await expect(say(page)).toHaveText('では、読んでみませんか？', { timeout: 10_000 });

  expect(served.asked.sort()).toEqual(['/audio/v1/045_1.m4a', '/audio/v1/081_2.m4a']);
  const record = await audioRecord(page);
  expect(record.mediaPlays).toBe(0);
  expect(record.starts).toHaveLength(2);
  const [shimo, kami] = record.starts;
  // 2本とも、下の句が鳴り始める前に予約する。前の音の ended でつないでいないことを示す。
  // 2本の予約の時刻を等しいとは比べない。Chromium の currentTime は、続けて呼んだ2つの start() のあいだにも進むことがある（5.3ms 進んで落ちた）。
  expect(shimo.when).toBeGreaterThan(shimo.now);
  expect(kami.now).toBeLessThan(shimo.when);
  expect(shimo.duration).toBeCloseTo(SHIMO_SEC, 2);
  expect(kami.when - (shimo.when + shimo.duration)).toBeCloseTo(1.0, 6);
  expect(record.session).toEqual(['playback', 'auto']);

  await expect(stepOf(page)).toHaveText('1 / 3 聞く');
  expect(await page.evaluate(() => localStorage.getItem('yomimasu.introDone'))).toBe('1');
  await page.reload();
  await expect(say(page)).toHaveText('では、読んでみませんか？');

  mkdirSync(ARTIFACTS_DIR, { recursive: true });
  writeFileSync(
    join(ARTIFACTS_DIR, 'listen-schedule.json'),
    JSON.stringify({ shimoSec: shimo.duration, kamiSec: kami.duration, gapSec: kami.when - (shimo.when + shimo.duration), session: record.session }, null, 2),
  );
});

test('段3は、お手本を聞く、読んでみる、はじめの説明の3つを出し、左上で表記を切り替えられ、はじめの説明で段1へ戻れる', async ({ page }) => {
  await serveAudio(page);
  await watchAudio(page, { introDone: true });
  await page.goto('/read/');
  await expect(say(page)).toHaveText('では、読んでみませんか？');
  await expect(stepOf(page)).toHaveText('1 / 3 聞く');
  await expect(page.getByTestId('pair')).toHaveText('ほ → あはれ');
  await expect(page.getByRole('button', { name: 'お手本を聞く' })).not.toHaveClass(/btn--fill/);
  await expect(page.getByRole('link', { name: '読んでみる' })).toHaveAttribute('href', '/read/rec/?shimo=81&kami=45');
  await expect(page.getByRole('link', { name: '読んでみる' })).toHaveClass(/btn--fill/);
  await expect(page.locator('.stage .band, .stage .drain, .stage .now')).toHaveCount(0);

  const lyrics = await box(page.getByTestId('lyrics'));
  const corner = await box(notation(page));
  expect(corner.x + corner.width).toBeLessThanOrEqual(lyrics.x);
  expect(corner.y).toBeLessThan(lyrics.y + lyrics.height / 2);
  await expect(notation(page).getByRole('button')).toHaveText(['漢字', 'かな']);
  await expect(notation(page).getByRole('button', { name: 'かな' })).toHaveAttribute('aria-pressed', 'true');
  await expect(block(page, 'shimo')).toContainText('ただーありあけのー');
  mkdirSync(ARTIFACTS_DIR, { recursive: true });
  await page.screenshot({ path: join(ARTIFACTS_DIR, 'listen-step-3.png') });

  await notation(page).getByRole('button', { name: '漢字' }).click();
  await expect(block(page, 'shimo')).toContainText('有明');
  expect(await page.evaluate(() => localStorage.getItem('yomimasu.kana'))).toBe('kanji');

  await page.getByRole('button', { name: 'はじめの説明をもう一度見る' }).click();
  await expect(say(page)).toHaveText('競技かるたの読みには、5-3-1-6 というシンプルなルールがあります。');
  await expect(stepOf(page)).toHaveText('はじめに 1 / 3');
});

test('お手本を鳴らすあいだ、鳴らしている文脈の時刻で、字を朱に塗り、今の区切りの囲みを 0秒、5秒、9秒に移す', async ({ page }) => {
  await serveAudio(page, { long: true });
  await watchAudio(page, { introDone: true });
  await page.goto('/read/');
  await expect(page.getByTestId('lyrics')).toBeVisible();
  await expect(page.locator('.blk.is-now')).toHaveCount(0);
  expect(new Set(await paintOf(page, '.lyric [data-at]'))).toEqual(new Set(['0.00%']));
  const before = await boxesOf(page);
  await logPhases(page);

  await page.getByRole('button', { name: 'お手本を聞く' }).click();
  await expect(notation(page)).toBeHidden();
  await expect(block(page, 'shimo')).toHaveClass(/is-now/);
  await expect.poll(async () => (await paintOf(page, '.blk[data-phase="shimo"] [data-at]'))[0]).not.toBe('0.00%');

  await expect(block(page, 'yoin-ma')).toHaveClass(/is-now/, { timeout: 7000 });
  await expect(page.locator('.blk.is-now')).toHaveCount(1);
  expect(new Set(await paintOf(page, '.blk[data-phase="shimo"] [data-at]'))).toEqual(new Set(['100.00%']));
  expect(new Set(await paintOf(page, '.blk[data-phase="kami"] [data-at]'))).toEqual(new Set(['0.00%']));
  mkdirSync(ARTIFACTS_DIR, { recursive: true });
  await page.screenshot({ path: join(ARTIFACTS_DIR, 'listen-playing-yoin.png') });

  await expect(block(page, 'kami')).toHaveClass(/is-now/, { timeout: 6000 });
  expect(await paintOf(page, '.lyric .yoin', '--yoin-done')).toEqual(['100.00%']);
  await expect(page.locator('.stage .band, .stage .drain, .stage .now')).toHaveCount(0);
  // 表記の切り替えを隠しても、囲みが出ても、字は動かない。
  expect(await boxesOf(page)).toEqual(before);

  // 囲みは、下の句の開始の予約時刻から、標準の 5・3・1・6 の 5秒と 9秒に移る。予約の前の読み込みの時間は数えない。
  const [{ when: startAt }] = (await audioRecord(page)).starts;
  const moved = (await phaseLog(page)).map(({ phase, at }) => ({ phase, sec: at === null ? Number.NEGATIVE_INFINITY : at - startAt }));
  expect(moved.map(({ phase }) => phase)).toEqual(['shimo', 'yoin-ma', 'kami']);
  for (const [i, sec] of [0, 5, 9].entries()) {
    const { phase, sec: shown } = moved[i];
    expect(shown, `${phase} の囲みが出た、下の句の予約時刻からの秒`).toBeGreaterThanOrEqual(sec - 1e-6);
    expect(shown, `${phase} の囲みが出た、下の句の予約時刻からの秒`).toBeLessThan(sec + 0.3);
  }
  writeFileSync(join(ARTIFACTS_DIR, 'listen-phases.json'), JSON.stringify(moved, null, 2));

  await page.getByRole('button', { name: 'やめる' }).click();
  await expect(page.getByRole('button', { name: 'お手本を聞く' })).toBeVisible();
  await expect(notation(page)).toBeVisible();
  await expect(page.locator('.blk.is-now')).toHaveCount(0);
  expect(new Set(await paintOf(page, '.lyric [data-at]'))).toEqual(new Set(['0.00%']));
  expect(await paintOf(page, '.lyric .yoin', '--yoin-done')).toEqual(['0.00%']);
  expect((await audioRecord(page)).session).toEqual(['playback', 'auto']);
});

test('お手本を読み込めないときは11節の文言を出し、もう一度押せる', async ({ page }) => {
  const served = await serveAudio(page, { status: 404 });
  await watchAudio(page, { introDone: true });
  await page.goto('/read/');
  await page.getByRole('button', { name: 'お手本を聞く' }).click();
  await expect(page.getByRole('alert')).toHaveText('お手本を読み込めませんでした。通信を確かめて、もう一度押してください。');
  expect((await audioRecord(page)).session).toEqual(['playback', 'auto']);
  await expect(page.locator('.blk.is-now')).toHaveCount(0);
  await expect(notation(page)).toBeVisible();
  await page.getByRole('button', { name: 'お手本を聞く' }).click();
  await expect.poll(() => served.asked.length).toBe(4);
});

test('導入の段2でお手本を読み込めなくても、聞かずに段3へ進める', async ({ page }) => {
  await serveAudio(page, { status: 404 });
  await watchAudio(page);
  await page.goto('/read/');
  await page.getByRole('button', { name: '次へ' }).click();
  await expect(page.getByRole('button', { name: '聞かずに進む' })).toHaveCount(0);
  await page.getByRole('button', { name: 'お手本を聞く' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.getByRole('button', { name: '聞かずに進む' }).click();
  await expect(say(page)).toHaveText('では、読んでみませんか？');
  await expect(page.getByRole('link', { name: '読んでみる' })).toBeVisible();
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
  await page.addInitScript(() => localStorage.setItem('yomimasu.kana', 'kanji'));
  await page.goto('/read/?shimo=53&kami=86');
  await expect(block(page, 'shimo')).toContainText('いかにー久');
  await expect(page.getByTestId('pair')).toHaveText('なげき → なげけ');
  await expect(stepOf(page)).toHaveText('1 / 3 聞く');
  await expect(notation(page)).toBeVisible();
  await expect(page.getByRole('button', { name: 'はじめの説明をもう一度見る' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: '読んでみる' })).toHaveAttribute('href', '/read/rec/?shimo=53&kami=86');
  await page.getByRole('button', { name: 'お手本を聞く' }).click();
  await expect.poll(() => served.asked.sort()).toEqual(['/audio/v1/053_2.m4a', '/audio/v1/086_1.m4a']);
  expect(await page.evaluate(() => localStorage.getItem('yomimasu.introDone'))).toBeNull();
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

test('練習モードの札の欄は、ガイドの決まり字順（音ごとに札の多い順、同じ数は読み方一覧の順、音の中は仮名の順）で並ぶ', async ({ page }) => {
  // 分けるのは発音の音なので、44番「あふこ」と26番「をぐ」は「お」に入る。並びは見本（docs/ui-sample.html の LIST）と同じである。
  const bySound = [
    'あきか あきの あけ あさぢ あさぼらけあ あさぼらけう あし あはぢ あはれ あひ あまつ あまの あらざ あらし ありあ ありま',
    'ながか ながら なげき なげけ なつ なにし なにはえ なにはが',
    'あふこ おく おと おほえ おほけ おも をぐ',
    'わがい わがそ わすら わすれ わたのはらこ わたのはらや わび',
    'たか たき たご たち たま たれ',
    'こころあ こころに こぬ この こひ これ',
    'みかき みかの みせ みち みよ',
    'はなさ はなの はるす はるの',
    'やす やへ やまが やまざ',
    'よのなかは よのなかよ よも よを',
    'かく かさ かぜそ かぜを',
    'いに いまこ いまは',
    'ちぎりお ちぎりき ちは',
    'ひさ ひとは ひとも',
    'きみがためは きみがためを きり',
    'うか うら',
    'つき つく',
    'しの しら',
    'もも もろ',
    'ゆふ ゆら',
    'む す め ふ さ ほ せ',
  ];
  await page.goto('/practice/');
  await page.getByRole('button', { name: '自分で選ぶ' }).click();
  for (const label of ['下の句の札', '上の句の札']) {
    await expect(page.getByLabel(label).locator('option')).toHaveText(['選んでください', ...bySound.flatMap((line) => line.split(' '))]);
  }
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
  test(`聞く画面は ${width}×${height} で、どの段も横にはみ出さない`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/read/');
    await expect(page.getByRole('img', { name: /下の句 5秒/ })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button', { name: '次へ' }).click();
    await expect(page.getByTestId('lyrics')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.evaluate(() => localStorage.setItem('yomimasu.introDone', '1'));
    await page.reload();
    await expect(page.getByRole('link', { name: '読んでみる' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('聞く画面は 393×659 で、段1から段3までどの段も全体が1画面に収まる', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 659 });
  await page.goto('/read/');
  await expect(page.getByRole('button', { name: '次へ' })).toBeVisible();
  expect(await fitsOneScreen(page)).toBe(true);
  await page.getByRole('button', { name: '次へ' }).click();
  await expect(page.getByTestId('lyrics')).toBeVisible();
  expect(await fitsOneScreen(page)).toBe(true);
  await page.evaluate(() => localStorage.setItem('yomimasu.introDone', '1'));
  await page.reload();
  await expect(page.getByRole('link', { name: '読んでみる' })).toBeVisible();
  expect(await fitsOneScreen(page)).toBe(true);
});
