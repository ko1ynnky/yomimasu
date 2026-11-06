import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test';
import { definition } from '../.claude/skills/yomimasu/scripts/definition.ts';
import { standardReading, synthesize, type ReadingPlan } from '../test/support/synth.ts';
import { encodeWav } from '../test/support/wav.ts';

const ARTIFACTS_DIR = 'e2e-artifacts';
const COUNT_SEC = 2.4;
// 合図の 2.4 秒のあいだに読み始めないよう、合成音の頭に余白を置く。1回目は間を目安の幅より長くし、2回目は標準の読みにする。
const standard: ReadingPlan = { ...standardReading, leadSec: COUNT_SEC + 0.6 };
const longMa: ReadingPlan = { ...standard, maSec: 1.6 };

// 録音は実時間で進み、この流れは2回読む。
test.setTimeout(180_000);

// 音声はリポジトリに置かないので、テストの音は OS の一時フォルダーへ書く。
function writeFakeMicFile(pcm: Float32Array, sampleRate: number): string {
  const path = join(mkdtempSync(join(tmpdir(), 'yomimasu-e2e-')), 'reading.wav');
  writeFileSync(path, encodeWav(pcm, sampleRate));
  return path;
}

// 偽のマイクの音はブラウザーを起動するときにしか渡せない。2回を別の合成音で読むため、同じ端末の保存先のまま、ブラウザーを起動し直す。
async function openDevice(userDataDir: string, baseURL: string | undefined, plan: ReadingPlan, sent: string[]) {
  const context = await chromium.launchPersistentContext(userDataDir, {
    baseURL,
    viewport: { width: 393, height: 659 },
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-audio-capture=${writeFakeMicFile(synthesize(plan), plan.sampleRate)}%noloop`,
    ],
  });
  context.on('request', (request) => {
    if (!['GET', 'HEAD'].includes(request.method())) sent.push(`${request.method()} ${request.url()}`);
  });
  await context.addInitScript(() => {
    localStorage.setItem('yomimasu.recHelpDone', '1');
    const played: string[] = [];
    const original = AudioContext.prototype.createBufferSource;
    AudioContext.prototype.createBufferSource = function () {
      played.push('buffer');
      return original.call(this);
    };
    Object.assign(window, { played });
  });
  const page = context.pages()[0] ?? (await context.newPage());
  return { context, page };
}

async function record(page: Page, plan: ReadingPlan, { assisted = true } = {}) {
  await page.goto('/read/rec/');
  if (!assisted) await page.getByRole('button', { name: '補助を外す' }).click();
  await page.getByRole('button', { name: '読み始める' }).click();
  const endSec = plan.leadSec + plan.shimoSec + plan.yoinSec + plan.maSec + plan.kamiSec + plan.tailSec;
  await page.waitForTimeout(endSec * 1000 + 300);
  await page.getByRole('button', { name: '読み終えた' }).click();
  await expect(page.getByTestId('take')).toBeAttached();
}

const records = (page: Page) => page.locator('yomimasu-records');
const table = (page: Page) => page.getByRole('table', { name: '前回と今回' });
const spread = (page: Page) => page.getByRole('region', { name: '間の平均とばらつき' });
const keptRows = (page: Page) => page.getByRole('list', { name: '残っている録音' }).getByRole('listitem');

type Column = { name: string; notes: string[]; values: string[]; verdicts: string[] };
// 表の列ごとに、見出し（前回、今回）、見出しの下の注記（日時、組、補助）、項目ごとの秒と判定を読む。
const columnsOf = (page: Page): Promise<Column[]> =>
  table(page).evaluate((element) => {
    const heads = [...element.querySelectorAll('thead th')];
    const bodyRows = [...element.querySelectorAll('tbody tr')];
    return heads.map((head, i) => ({
      name: head.querySelector('b')?.textContent ?? '',
      notes: [...head.querySelectorAll('small')].map((note) => note.textContent ?? ''),
      values: bodyRows.map((row) => row.querySelectorAll('td')[i]?.querySelector('b')?.textContent ?? ''),
      verdicts: bodyRows.map((row) => row.querySelectorAll('td')[i]?.querySelector('span')?.textContent ?? ''),
    }));
  });
const rowLabelsOf = (page: Page) => table(page).locator('tbody th .k').allTextContents();
const secondsOf = (text: string) => Number(text.match(/^(\d+\.\d)秒$/)?.[1] ?? NaN);

test('2回読むと前回と今回を補助の有無つきで並べ、間の平均とばらつきを出し、開き直しても残る。1件ずつと全部を消せ、録音を送らない', async ({ baseURL }) => {
  const device = mkdtempSync(join(tmpdir(), 'yomimasu-e2e-device-'));
  const sent: string[] = [];
  mkdirSync(ARTIFACTS_DIR, { recursive: true });

  // 1回目：間の長い読みを、補助ありで読む。
  let { context, page } = await openDevice(device, baseURL, longMa, sent);
  await record(page, longMa);
  await page.goto('/result/compare/');
  await expect(page.locator('.run')).toHaveText('> /yomimasu 前回と比べる');
  await expect(records(page)).toContainText('もう1回読むと、前回と今回を並べて比べられます。');
  expect((await columnsOf(page)).map((column) => column.name)).toEqual(['今回']);
  await expect(spread(page)).toHaveCount(0);
  await expect(keptRows(page)).toHaveCount(1);
  await page.screenshot({ path: join(ARTIFACTS_DIR, 'records-one.png'), fullPage: true });
  // 1件でも残っていれば、結果の画面から前回と比べる画面へ進める。録音を消す操作はこの画面にしかない。
  await page.goto('/result/');
  await expect(page.locator('yomimasu-result .res')).toBeVisible();
  await expect(page.locator('main .ask .next .btn--fill')).toHaveText('もう1回読む');
  await expect(page.locator('main .ask').getByRole('link', { name: '前回と比べる' })).toHaveAttribute('href', '/result/compare/');
  await context.close();

  // 2回目：標準の読みを、補助を外して読む。ブラウザーを起動し直しても、1回目の録音は端末に残っている。
  ({ context, page } = await openDevice(device, baseURL, standard, sent));
  await record(page, standard, { assisted: false });
  await page.goto('/result/compare/');
  await expect(table(page)).toBeVisible();

  const compared = async () => {
    expect(await rowLabelsOf(page)).toEqual(['下の句＋余韻', '間', '上の句']);
    const [previous, current] = await columnsOf(page);
    expect(previous.name).toBe('前回');
    expect(current.name).toBe('今回');
    expect(previous.notes.slice(1)).toEqual(['ほ あはれ', '補助あり']);
    expect(current.notes.slice(1)).toEqual(['ほ あはれ', '補助なし']);
    for (const note of [previous.notes[0], current.notes[0]]) expect(note).toMatch(/^\d{1,2}月\d{1,2}日 \d{1,2}:\d{2}$/);
    expect(Math.abs(secondsOf(previous.values[1]) - longMa.maSec)).toBeLessThanOrEqual(0.15);
    expect(Math.abs(secondsOf(current.values[1]) - standard.maSec)).toBeLessThanOrEqual(0.15);
    expect(previous.verdicts[1]).toBe('ちょっと長い');
    expect(current.verdicts).toEqual(['ちょうどよい', 'ちょうどよい', 'ちょうどよい']);
    return [previous, current];
  };
  const [previous, current] = await compared();

  // 平均とばらつきは、表に出した2回の間から出す。ばらつきは、いちばん短い回と長い回の差である。
  const shownMa = [secondsOf(previous.values[1]), secondsOf(current.values[1])];
  const [shortest, longest] = [Math.min(...shownMa), Math.max(...shownMa)];
  await expect(spread(page)).toContainText('2回');
  await expect(spread(page)).toContainText(`目安 ${definition.ranges.ma.minSec}〜${definition.ranges.ma.maxSec}秒`);
  const mean = secondsOf((await spread(page).getByTestId('ma-mean').textContent()) ?? '');
  expect(Math.abs(mean - (shownMa[0] + shownMa[1]) / 2)).toBeLessThanOrEqual(0.1);
  await expect(spread(page).getByTestId('ma-spread')).toHaveText(`${((Math.round(longest * 10) - Math.round(shortest * 10)) / 10).toFixed(1)}秒`);
  await expect(spread(page)).toContainText(`${shortest.toFixed(1)}〜${longest.toFixed(1)}秒`);
  await expect(keptRows(page)).toHaveCount(2);
  await expect(records(page)).not.toContainText(/総合|点数|\d+\s*点|順位/);
  await expect(page.locator('main .ask .next .btn--fill')).toHaveText('もう1回読む');
  await expect(page.locator('main .ask .next .btn--fill')).toHaveAttribute('href', '/read/rec/?shimo=81&kami=45');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: join(ARTIFACTS_DIR, 'records-compare.png'), fullPage: true });
  await page.setViewportSize({ width: 360, height: 640 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 393, height: 659 });

  await page.reload();
  await expect(table(page)).toBeVisible();
  await compared();
  await expect(spread(page)).toBeVisible();

  // 結果の画面も、開き直したあとに端末に残った最後の録音を出し、前回と比べる画面へ進める。
  await page.goto('/result/');
  await expect(page.locator('yomimasu-result .res')).toBeVisible();
  await expect(page.locator('.bar .step')).toHaveText('補助なし');
  await expect(page.locator('main .ask').getByRole('link', { name: '前回と比べる' })).toHaveAttribute('href', '/result/compare/');
  await page.screenshot({ path: join(ARTIFACTS_DIR, 'records-result-link.png'), fullPage: true });

  // 前回の録音を聴ける。鳴らしているあいだは、同じボタンで止められる。
  await page.goto('/result/compare/');
  await page.getByRole('button', { name: '前回の読み' }).click();
  await expect(page.getByRole('button', { name: 'やめる' })).toBeVisible();
  // 録音は端末から読み込んでから鳴らすので、押してから少し遅れて鳴る。
  await expect.poll(() => page.evaluate(() => (window as unknown as { played: string[] }).played)).toEqual(['buffer']);
  await page.getByRole('button', { name: 'やめる' }).click();
  await expect(page.getByRole('button', { name: '前回の読み' })).toBeVisible();

  // 1件ずつ消す。古い方を消すと、残った1件だけを今回として出す。
  await keptRows(page).nth(1).getByRole('button', { name: /消す$/ }).click();
  await expect(keptRows(page)).toHaveCount(1);
  expect((await columnsOf(page)).map((column) => [column.name, column.notes[2]])).toEqual([['今回', '補助なし']]);
  await expect(spread(page)).toHaveCount(0);
  await page.reload();
  await expect(keptRows(page)).toHaveCount(1);

  // 全部を消す。消す前に確かめる。
  await page.getByRole('button', { name: '全部消す' }).click();
  const confirm = page.getByRole('group', { name: '録音を全部消しますか？' });
  await expect(confirm).toBeVisible();
  await expect(confirm).toContainText('消した録音は元に戻せません。');
  await page.screenshot({ path: join(ARTIFACTS_DIR, 'records-confirm.png'), fullPage: true });
  await confirm.getByRole('button', { name: 'キャンセル' }).click();
  await expect(keptRows(page)).toHaveCount(1);
  await page.getByRole('button', { name: '全部消す' }).click();
  await confirm.getByRole('button', { name: '全部消す' }).click();
  await expect(records(page).getByRole('status')).toContainText('まだ録音がありません。');
  await page.screenshot({ path: join(ARTIFACTS_DIR, 'records-empty.png'), fullPage: true });
  await page.reload();
  await expect(records(page).getByRole('status')).toContainText('まだ録音がありません。');
  await page.goto('/result/');
  await expect(page.getByRole('status')).toContainText('まだ録音がありません');

  expect(sent).toEqual([]);
  await context.close();
});

test('録音がないまま前回と比べるを開くと、まず1回読むへ案内する', async ({ page }) => {
  await page.goto('/result/compare/');
  await expect(page.locator('.run')).toHaveText('> /yomimasu 前回と比べる');
  await expect(records(page).getByRole('status')).toContainText('まだ録音がありません。');
  await expect(records(page).getByRole('link', { name: 'まず1回読む' })).toHaveAttribute('href', '/read/');
});

test('読んだ録音を端末に残せなかったときは、前に残した録音の結果を今回の結果として出さない', async ({ baseURL }) => {
  const sent: string[] = [];
  const { context, page } = await openDevice(mkdtempSync(join(tmpdir(), 'yomimasu-e2e-device-')), baseURL, standard, sent);
  // 2回目の録音の画面でだけ、IndexedDB を開けなくする。容量が足りないときや、IndexedDB を使えないブラウザーの代わりである。
  await context.addInitScript(() => {
    if (sessionStorage.getItem('e2e.blockStorage') === '1' && location.pathname === '/read/rec/') {
      indexedDB.open = () => {
        throw new DOMException('使えない', 'QuotaExceededError');
      };
    }
  });
  await record(page, standard);
  await page.evaluate(() => sessionStorage.setItem('e2e.blockStorage', '1'));
  await record(page, standard, { assisted: false });

  await page.goto('/result/');
  await expect(page.getByRole('status')).toContainText('まだ録音がありません');
  await expect(page.locator('yomimasu-result .res')).toHaveCount(0);
  await page.goto('/result/compare/');
  await expect(keptRows(page)).toHaveCount(1);
  expect(sent).toEqual([]);
  await context.close();
});
