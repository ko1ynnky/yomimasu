import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test, type Browser, type Page } from '@playwright/test';
import texts from '../.claude/skills/yomimasu/assets/next-point.json' with { type: 'json' };
import { standardReading, synthesize, type ReadingPlan } from '../test/support/synth.ts';
import { encodeWav } from '../test/support/wav.ts';

const ARTIFACTS_DIR = 'e2e-artifacts';
const COUNT_SEC = 2.4;
// 合図の 2.4 秒のあいだに読み始めないよう、合成音の頭に余白を置く。標準の読みは、どの項目も目安の幅の中にある。
const standard: ReadingPlan = { ...standardReading, leadSec: COUNT_SEC + 0.6 };
const longMa: ReadingPlan = { ...standard, maSec: 1.6 };

test.setTimeout(60_000);

// 録音の流れと結果の画面の差し替えは e2e/result.spec.ts と同じ方法で行う。spec どうしは読み込み合えないので、ここに置く。
function writeFakeMicFile(pcm: Float32Array, sampleRate: number): string {
  const path = join(mkdtempSync(join(tmpdir(), 'yomimasu-e2e-')), 'reading.wav');
  writeFileSync(path, encodeWav(pcm, sampleRate));
  return path;
}

const launchWithFakeMic = (pcm: Float32Array, rate: number): Promise<Browser> =>
  chromium.launch({
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${writeFakeMicFile(pcm, rate)}%noloop`],
  });

async function recordAndShowResult(browser: Browser, baseURL: string | undefined, plan: ReadingPlan) {
  const page = await (await browser.newContext({ baseURL })).newPage();
  const sent: string[] = [];
  page.on('request', (request) => {
    if (!['GET', 'HEAD'].includes(request.method())) sent.push(`${request.method()} ${request.url()}`);
  });
  await page.addInitScript(() => localStorage.setItem('yomimasu.recHelpDone', '1'));
  await page.goto('/read/rec/');
  await page.getByRole('button', { name: '読み始める' }).click();
  const endSec = plan.leadSec + plan.shimoSec + plan.yoinSec + plan.maSec + plan.kamiSec + plan.tailSec;
  await page.waitForTimeout(endSec * 1000 + 300);
  await page.getByRole('button', { name: '読み終えた' }).click();
  await expect(page.getByTestId('take')).toBeAttached();
  await page.evaluate(async () => {
    const next = new DOMParser().parseFromString(await (await fetch('/result/')).text(), 'text/html');
    document.querySelector('main')!.replaceWith(document.adoptNode(next.querySelector('main')!));
  });
  await expect(page.locator('yomimasu-result .res')).toBeVisible();
  return { page, sent };
}

const cards = (page: Page) => page.locator('main .one');

test('間の長い読みでは、結果の行の下に次に直す1点のカードを1枚だけ出し、間を選び、次は？に総論へのリンクを置く', async ({ baseURL }) => {
  const browser = await launchWithFakeMic(synthesize(longMa), longMa.sampleRate);
  const { page, sent } = await recordAndShowResult(browser, baseURL, longMa);

  await expect(cards(page)).toHaveCount(1);
  const card = cards(page);
  const text = texts.points.ma.above;
  await expect(card.locator('.l')).toHaveText('次に直す1点');
  await expect(card.locator('.t')).toHaveText(text.fix);
  await expect(card).toContainText(text.reason);
  await expect(card).toContainText(text.how);
  expect(await card.evaluate((element) => element.compareDocumentPosition(document.querySelector('yomimasu-result .res')!) & Node.DOCUMENT_POSITION_PRECEDING)).toBeTruthy();
  const font = await card.locator('.t').evaluate((element) => {
    const style = getComputedStyle(element);
    return { size: style.fontSize, serif: style.fontFamily.includes('Mincho') };
  });
  expect(font).toEqual({ size: '22px', serif: true });

  const ask = page.locator('main .ask');
  await expect(ask.locator('.ask-q')).toHaveText('次は？');
  await expect(ask.getByRole('link', { name: texts.points.ma.link })).toHaveAttribute('href', '/soron/');

  await expect(page.locator('main')).not.toContainText(/Claude|AI/);
  expect(sent).toEqual([]);

  mkdirSync(ARTIFACTS_DIR, { recursive: true });
  await page.screenshot({ path: join(ARTIFACTS_DIR, 'next-point.png'), fullPage: true });
  writeFileSync(
    join(ARTIFACTS_DIR, 'next-point.json'),
    JSON.stringify({ synthesized: { shimoPlusYoinSec: 8, maSec: longMa.maSec, kamiSec: 6 }, shown: { label: await card.locator('.l').textContent(), fix: await card.locator('.t').textContent() } }, null, 2),
  );
  await browser.close();
});

test('どの項目も目安の幅の中なら、今回はありませんと出し、補助を外して読むことを勧める', async ({ baseURL }) => {
  const browser = await launchWithFakeMic(synthesize(standard), standard.sampleRate);
  const { page } = await recordAndShowResult(browser, baseURL, standard);

  await expect(cards(page)).toHaveCount(1);
  await expect(cards(page).locator('.t')).toHaveText(texts.clear.fix);
  await expect(cards(page)).toContainText(texts.clear.reason);
  await page.screenshot({ path: join(ARTIFACTS_DIR, 'next-point-clear.png'), fullPage: true });
  await browser.close();
});

test('声のない録音では、カードを出さない', async ({ baseURL }) => {
  const silence = new Float32Array(20 * standard.sampleRate);
  const browser = await launchWithFakeMic(silence, standard.sampleRate);
  const { page } = await recordAndShowResult(browser, baseURL, standard);

  await expect(page.locator('yomimasu-result')).toContainText('声を聞き取れず、測れませんでした。');
  await expect(cards(page)).toHaveCount(0);
  await expect(page.locator('main .ask .ask-q')).toHaveCount(0);
  await browser.close();
});
