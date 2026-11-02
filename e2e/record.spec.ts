import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect, test } from '@playwright/test';
import { standardReading, synthesize, type ReadingPlan } from '../test/support/synth.ts';
import { encodeWav } from '../test/support/wav.ts';

const TOLERANCE_SEC = 0.05;
const ARTIFACTS_DIR = 'e2e-artifacts';

const shortReading: ReadingPlan = { ...standardReading, leadSec: 0.5, shimoSec: 1.5, yoinSec: 1, kamiSec: 2, tailSec: 0.5 };

const lengthSec = ({ leadSec, shimoSec, yoinSec, maSec, kamiSec, tailSec }: ReadingPlan) => leadSec + shimoSec + yoinSec + maSec + kamiSec + tailSec;

// 音声はリポジトリに置かないので、テストの音は OS の一時フォルダーへ書く。
function writeFakeMicFile(plan: ReadingPlan): string {
  const path = join(mkdtempSync(join(tmpdir(), 'yomimasu-e2e-')), 'reading.wav');
  writeFileSync(path, encodeWav(synthesize(plan), plan.sampleRate));
  return path;
}

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
    const browser = await chromium.launch({
      args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${writeFakeMicFile(plan)}%noloop`],
    });
    const page = await (await browser.newContext({ baseURL })).newPage();
    await page.goto('/');

    await page.getByRole('button', { name: '読む' }).click();
    await expect(page.getByRole('button', { name: '止める' })).toBeVisible();
    await page.waitForTimeout((lengthSec(plan) + 0.5) * 1000);
    await page.getByRole('button', { name: '止める' }).click();

    const status = page.getByRole('status');
    await expect(status).toContainText('間');
    const shown = Number((await status.textContent())?.match(/間 ([\d.]+) 秒/)?.[1]);
    expect(Math.abs(shown - plan.maSec)).toBeLessThanOrEqual(TOLERANCE_SEC);

    mkdirSync(ARTIFACTS_DIR, { recursive: true });
    await page.screenshot({ path: join(ARTIFACTS_DIR, `${name}.png`) });
    writeFileSync(join(ARTIFACTS_DIR, `${name}.json`), JSON.stringify({ expectedMaSec: plan.maSec, shownMaSec: shown }, null, 2));
    await browser.close();
  });
}
