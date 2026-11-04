import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test, type Browser, type Page } from '@playwright/test';
import { definition } from '../.claude/skills/yomimasu/scripts/definition.ts';
import { standardReading, synthesize, type ReadingPlan } from '../test/support/synth.ts';
import { encodeWav } from '../test/support/wav.ts';

const ARTIFACTS_DIR = 'e2e-artifacts';
const COUNT_SEC = 2.4;
// 合図の 2.4 秒のあいだに読み始めないよう、合成音の頭に余白を置く。間は目安の幅より長くする。
const longMa: ReadingPlan = { ...standardReading, leadSec: COUNT_SEC + 0.6, maSec: 1.6 };

// 録音は実時間で進むので、1本は読みの長さより短くならない。
test.setTimeout(60_000);

// 音声はリポジトリに置かないので、テストの音は OS の一時フォルダーへ書く。
function writeFakeMicFile(pcm: Float32Array, sampleRate: number): string {
  const path = join(mkdtempSync(join(tmpdir(), 'yomimasu-e2e-')), 'reading.wav');
  writeFileSync(path, encodeWav(pcm, sampleRate));
  return path;
}

const launchWithFakeMic = (pcm: Float32Array, rate: number) =>
  chromium.launch({
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${writeFakeMicFile(pcm, rate)}%noloop`],
  });

// 本文つきの送信を、通信と sendBeacon の両方で記録する。
async function openPage(browser: Browser, baseURL: string | undefined, path: string) {
  const page = await (await browser.newContext({ baseURL })).newPage();
  const sent: string[] = [];
  page.on('request', (request) => {
    if (!['GET', 'HEAD'].includes(request.method())) sent.push(`${request.method()} ${request.url()}`);
  });
  await page.addInitScript(() => {
    localStorage.setItem('yomimasu.recHelpDone', '1');
    const beacons: string[] = [];
    navigator.sendBeacon = (url) => {
      beacons.push(String(url));
      return true;
    };
    Object.assign(window, { beacons });
  });
  await page.goto(path);
  const beacons = () => page.evaluate(() => (window as unknown as { beacons: string[] }).beacons);
  return { page, sent, beacons };
}

// 合図から読み終えるまでを、合成音の長さだけ待って録る。
async function record(page: Page, plan: ReadingPlan) {
  await page.getByRole('button', { name: '読み始める' }).click();
  const endSec = plan.leadSec + plan.shimoSec + plan.yoinSec + plan.maSec + plan.kamiSec + plan.tailSec;
  await page.waitForTimeout(endSec * 1000 + 300);
  await page.getByRole('button', { name: '読み終えた' }).click();
  await expect(page.getByTestId('take')).toBeAttached();
}

// 画面どうしをつなぐ処理はまだないので、結果のページの本文を取ってきて差し替える。録音は差し替えても端末のメモリーに残る。
async function showResult(page: Page, { example = false } = {}) {
  await page.evaluate(async (example) => {
    const next = new DOMParser().parseFromString(await (await fetch('/result/')).text(), 'text/html');
    const main = document.adoptNode(next.querySelector('main')!);
    if (example) main.querySelector('yomimasu-result')!.setAttribute('example', '');
    document.querySelector('main')!.replaceWith(main);
  }, example);
  await expect(page.locator('yomimasu-result .res')).toBeVisible();
}

type ShownRow = { label: string; reference: string; value: string; judgement: string };
const rowsOf = (page: Page): Promise<ShownRow[]> =>
  page.locator('yomimasu-result .res > div').evaluateAll((rows) =>
    rows.map((row) => {
      const value = row.querySelector('.v b')?.textContent ?? '';
      return {
        label: row.querySelector('.k')?.textContent ?? '',
        reference: row.querySelector('small')?.textContent ?? '',
        value,
        judgement: (row.querySelector('.v')?.textContent ?? '').slice(value.length),
      };
    }),
  );
const secondsOf = (row: ShownRow) => Number(row.value.match(/^(\d+\.\d)秒$/)?.[1] ?? NaN);

test('間の長い読みを録ると、下の句＋余韻、間、上の句の3行だけを決まった順に出し、測った秒、目安の幅、判定を出す', async ({ baseURL }) => {
  const browser = await launchWithFakeMic(synthesize(longMa), longMa.sampleRate);
  const { page, sent, beacons } = await openPage(browser, baseURL, '/read/rec/');
  await record(page, longMa);
  await showResult(page);

  const rows = await rowsOf(page);
  expect(rows.map((row) => row.label)).toEqual(['下の句＋余韻', '間', '上の句']);
  const [shimo, ma, kami] = rows;
  const { ranges } = definition;
  expect(ma.reference).toBe(`目安 ${ranges.ma.minSec}〜${ranges.ma.maxSec}秒`);
  expect(shimo.reference).toBe(`目安 ${ranges.shimoPlusYoin.minSec}〜${ranges.shimoPlusYoin.maxSec}秒`);
  expect(kami.reference).toBe(`目安 ${ranges.kami.minSec}〜${ranges.kami.maxSec}秒`);
  expect(Math.abs(secondsOf(shimo) - 8)).toBeLessThanOrEqual(0.15);
  expect(Math.abs(secondsOf(ma) - 1.6)).toBeLessThanOrEqual(0.15);
  expect(Math.abs(secondsOf(kami) - 6)).toBeLessThanOrEqual(0.15);
  expect([shimo.judgement, ma.judgement, kami.judgement]).toEqual(['ちょうどよい', 'ちょっと長い', 'ちょうどよい']);

  const result = page.locator('yomimasu-result');
  await expect(result).toContainText('明瞭さは測っていません。お手本と聴き比べてください。');
  await expect(result).toContainText('録音は端末の外へ出ません。');
  await expect(result).not.toContainText('決まり字');
  await expect(result).not.toContainText(/総合|点数|\d+\s*点/);
  await expect(result).not.toContainText('例の録音です');
  await expect(page.locator('.bar .step')).toHaveText('補助あり');

  expect(sent).toEqual([]);
  expect(await beacons()).toEqual([]);

  mkdirSync(ARTIFACTS_DIR, { recursive: true });
  await page.screenshot({ path: join(ARTIFACTS_DIR, 'result.png'), fullPage: true });
  writeFileSync(
    join(ARTIFACTS_DIR, 'result.json'),
    JSON.stringify({ synthesized: { shimoPlusYoinSec: 8, maSec: longMa.maSec, kamiSec: 6 }, shown: rows }, null, 2),
  );
  await browser.close();
});

test('声のない録音では、どの行も測れませんでしたと出し、値を作らず、読み直す理由を出す', async ({ baseURL }) => {
  const silence = new Float32Array(20 * standardReading.sampleRate);
  const browser = await launchWithFakeMic(silence, standardReading.sampleRate);
  const { page } = await openPage(browser, baseURL, '/read/rec/');
  await record(page, longMa);
  await showResult(page);

  const rows = await rowsOf(page);
  expect(rows).toHaveLength(3);
  for (const row of rows) expect(row).toMatchObject({ value: '', judgement: '測れませんでした' });
  await expect(page.locator('yomimasu-result')).toContainText('声を聞き取れず、測れませんでした。読み直すか、静かな場所で試してください。');
  await page.screenshot({ path: join(ARTIFACTS_DIR, 'result-too-quiet.png'), fullPage: true });
  await browser.close();
});

test('間のない読みでは、どの行も測れませんでしたと出し、間を空けて読み直すよう伝える', async ({ baseURL }) => {
  const noGap: ReadingPlan = { ...longMa, maSec: 0 };
  const browser = await launchWithFakeMic(synthesize(noGap), noGap.sampleRate);
  const { page } = await openPage(browser, baseURL, '/read/rec/');
  await record(page, noGap);
  await showResult(page);

  for (const row of await rowsOf(page)) expect(row).toMatchObject({ value: '', judgement: '測れませんでした' });
  await expect(page.locator('yomimasu-result')).toContainText('読みの切れ目が見つからず、測れませんでした。間を空けて読み直してください。');
  await page.screenshot({ path: join(ARTIFACTS_DIR, 'result-no-gap.png'), fullPage: true });
  await browser.close();
});

test('例の録音のときは、先頭に例の録音ですと出す', async ({ baseURL }) => {
  const browser = await launchWithFakeMic(synthesize(longMa), longMa.sampleRate);
  const { page } = await openPage(browser, baseURL, '/read/rec/');
  await record(page, longMa);
  await showResult(page, { example: true });
  await expect(page.locator('yomimasu-result').getByText('例の録音です')).toBeVisible();
  await browser.close();
});

// ページを足しても検査から漏れないよう、組み立てた結果のページを全部たどる。E2E は組み立てのあとに動く。
function builtPages(dir = 'dist', route = '/'): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isFile()) return entry.name === 'index.html' ? [route] : [];
    return entry.isDirectory() && !entry.name.startsWith('.') ? builtPages(join(dir, entry.name), `${route}${entry.name}/`) : [];
  });
}

test('どの画面を開いても、本文つきの送信をしない', async ({ browser, baseURL }) => {
  test.setTimeout(240_000);
  const pages = builtPages();
  expect(pages).toContain('/result/');
  const { page, sent, beacons } = await openPage(browser, baseURL, '/');
  for (const path of pages) {
    await page.goto(path, { waitUntil: 'networkidle' });
    expect(sent, path).toEqual([]);
    expect(await beacons(), path).toEqual([]);
  }
});
