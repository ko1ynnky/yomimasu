import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import texts from '../.claude/skills/yomimasu/assets/next-point.json' with { type: 'json' };
import { definition } from '../.claude/skills/yomimasu/scripts/definition.ts';
import { standardReading, synthesize, type ReadingPlan } from '../test/support/synth.ts';
import { encodeWav } from '../test/support/wav.ts';

const ARTIFACTS_DIR = 'e2e-artifacts';
const EXAMPLE_AUDIO = '/audio/examples/v1/ma-long.m4a';
const EXAMPLE_AGAIN = '/read/rec/?shimo=81&kami=45';

test.use({ viewport: { width: 393, height: 659 } });

// 例の音声はリポジトリに置かず、配信にもまだないので、答えの分かる合成音を実行のたびに作り、例の音声の取得に返す。
// 中身は WAV のまま m4a の名前で返す。decodeAudioData は名前と型ではなく中身から形式を読む。plan が null なら、置く前と同じ 404 を返す。
async function serveExample(page: Page, plan: ReadingPlan | null) {
  const asked: string[] = [];
  await page.route('**/audio/examples/**', (route) => {
    asked.push(new URL(route.request().url()).pathname);
    if (!plan) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ status: 200, contentType: 'audio/mp4', body: Buffer.from(encodeWav(synthesize(plan), plan.sampleRate)) });
  });
  return asked;
}

function watchSent(page: Page) {
  const sent: string[] = [];
  page.on('request', (request) => {
    if (!['GET', 'HEAD'].includes(request.method())) sent.push(`${request.method()} ${request.url()}`);
  });
  return sent;
}

// 端末の IndexedDB に残っている件数を、置き場の名前によらず全部数える。
const storedCount = (page: Page) =>
  page.evaluate(async () => {
    const request = <T,>(asked: IDBRequest<T>) =>
      new Promise<T>((resolve, reject) => {
        asked.onsuccess = () => resolve(asked.result);
        asked.onerror = () => reject(asked.error);
      });
    let count = 0;
    for (const { name } of await indexedDB.databases()) {
      if (!name) continue;
      const db = await request(indexedDB.open(name));
      for (const store of db.objectStoreNames) count += await request(db.transaction(store).objectStore(store).count());
      db.close();
    }
    return count;
  });

const result = (page: Page) => page.locator('yomimasu-result');

type ShownRow = { label: string; value: string; judgement: string };
const rowsOf = (page: Page): Promise<ShownRow[]> =>
  result(page)
    .locator('.res > div')
    .evaluateAll((rows) =>
      rows.map((row) => {
        const value = row.querySelector('.v b')?.textContent ?? '';
        return { label: row.querySelector('.k')?.textContent ?? '', value, judgement: (row.querySelector('.v')?.textContent ?? '').slice(value.length) };
      }),
    );
const secondsOf = (row: ShownRow) => Number(row.value.match(/^(\d+\.\d)秒$/)?.[1] ?? NaN);

for (const { maSec, judgement, point } of [
  { maSec: 1.6, judgement: 'ちょっと長い', point: texts.points.ma.above },
  { maSec: 0.6, judgement: 'ちょっと短い', point: texts.points.ma.below },
]) {
  test(`間を ${maSec} 秒で読んだ例の音声を、この端末で利用者の録音と同じ定義で測り、例の録音ですと先頭に出して、次に直す1点まで出す。端末に残さず、本文つきの送信をしない`, async ({ page }) => {
    const plan: ReadingPlan = { ...standardReading, maSec };
    const asked = await serveExample(page, plan);
    const sent = watchSent(page);
    await page.goto('/result/example/');

    await expect(result(page).locator('.res')).toBeVisible();
    await expect(page.locator('.run')).toHaveText('> /yomimasu 結果を見る');
    await expect(result(page).locator(':scope > *').first()).toHaveText('例の録音です');
    await expect(page.locator('.bar .step')).toHaveText('補助なし');

    const rows = await rowsOf(page);
    expect(rows.map((row) => row.label)).toEqual(['下の句＋余韻', '間', '上の句']);
    const [shimo, ma, kami] = rows;
    expect(Math.abs(secondsOf(shimo) - (plan.shimoSec + plan.yoinSec))).toBeLessThanOrEqual(0.15);
    expect(Math.abs(secondsOf(ma) - maSec)).toBeLessThanOrEqual(0.15);
    expect(Math.abs(secondsOf(kami) - plan.kamiSec)).toBeLessThanOrEqual(0.15);
    expect(ma.judgement).toBe(judgement);
    await expect(result(page)).toContainText('明瞭さは測っていません。お手本と聴き比べてください。');

    const card = page.locator('main .one');
    await expect(card).toHaveCount(1);
    await expect(card.locator('.l')).toHaveText('次に直す1点');
    await expect(card.locator('.t')).toHaveText(point.fix);
    await expect(card).toContainText(point.how);
    // 例の録音は利用者が読んだものではないので、塗りのボタンは「もう1回読む」ではなく同じ組を読んでみる誘いにする。端末に残さないので、前回と比べる画面へは進めない。
    // 塗りのボタンの右には「戻る」を置く（docs/ui-guide.md の8節「戻る」）。
    const next = page.locator('main .ask .next .btn');
    await expect(next).toHaveText([texts.points.ma.link, '読んでみる', '戻る']);
    const fill = page.locator('main .ask .next .btn--fill');
    await expect(fill).toHaveText('読んでみる');
    await expect(fill).toHaveAttribute('href', EXAMPLE_AGAIN);

    expect(asked).toEqual([EXAMPLE_AUDIO]);
    expect(sent).toEqual([]);
    expect(await storedCount(page)).toBe(0);

    if (maSec === 1.6) {
      mkdirSync(ARTIFACTS_DIR, { recursive: true });
      await page.screenshot({ path: join(ARTIFACTS_DIR, 'example.png'), fullPage: true });
      writeFileSync(
        join(ARTIFACTS_DIR, 'example.json'),
        JSON.stringify({ served: EXAMPLE_AUDIO, synthesized: { shimoPlusYoinSec: plan.shimoSec + plan.yoinSec, maSec, kamiSec: plan.kamiSec }, range: definition.ranges.ma, shown: rows }, null, 2),
      );
    }
  });
}

test('例の音声がまだないときは、結果の行を作らず、読み込めなかったことと入口へ戻る道を出す', async ({ page }) => {
  const asked = await serveExample(page, null);
  await page.goto('/result/example/');

  const status = result(page).getByRole('status');
  await expect(status).toHaveText('例の録音を読み込めませんでした。入口へ戻る');
  await expect(status.getByRole('link', { name: '入口へ戻る' })).toHaveAttribute('href', '/');
  await expect(result(page).locator('.res')).toHaveCount(0);
  await expect(page.locator('main .one')).toHaveCount(0);
  await expect(result(page)).not.toContainText('例の録音です');
  expect(asked).toEqual([EXAMPLE_AUDIO]);
  mkdirSync(ARTIFACTS_DIR, { recursive: true });
  await page.screenshot({ path: join(ARTIFACTS_DIR, 'example-missing.png'), fullPage: true });
});

test('読む前の画面では、読み始めるの隣に例の録音で見るを置き、押すと例の録音の結果へ進む', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('yomimasu.recHelpDone', '1'));
  await serveExample(page, { ...standardReading, maSec: 1.6 });
  await page.goto('/read/rec/');

  const start = page.getByRole('button', { name: '読み始める' });
  const entry = page.getByRole('link', { name: '例の録音で見る' });
  await expect(entry).toHaveAttribute('href', '/result/example/');
  const [startBox, entryBox] = [await start.boundingBox(), await entry.boundingBox()];
  expect(entryBox!.y).toBe(startBox!.y);
  expect(entryBox!.x).toBeGreaterThan(startBox!.x);
  expect(entryBox!.height).toBeGreaterThanOrEqual(44);
  mkdirSync(ARTIFACTS_DIR, { recursive: true });
  await page.screenshot({ path: join(ARTIFACTS_DIR, 'example-entry.png') });

  await entry.click();
  await expect(page).toHaveURL(/\/result\/example\/$/);
  await expect(result(page).getByText('例の録音です')).toBeVisible();
  await expect(result(page).locator('.res')).toBeVisible();
});

test('マイクを許可しないときの案内から、例の録音で見るで例の録音の結果へ進む', async ({ page }) => {
  // ヘッドレスの Chromium は許可の確認を出せないので、拒否は API の境界で再現する（e2e/record.spec.ts と同じ）。
  await page.addInitScript(() => {
    localStorage.setItem('yomimasu.recHelpDone', '1');
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('denied', 'NotAllowedError'));
  });
  await serveExample(page, { ...standardReading, maSec: 1.6 });
  await page.goto('/read/rec/');
  await page.getByRole('button', { name: '読み始める' }).click();

  const alert = page.getByRole('alert');
  await expect(alert).toContainText('マイクを使えませんでした。');
  await expect(alert.getByRole('button', { name: 'もう一度試す' })).toBeVisible();
  await expect(alert.getByRole('link', { name: '教科書へ戻る' })).toBeVisible();
  const entry = alert.getByRole('link', { name: '例の録音で見る' });
  await expect(entry).toHaveAttribute('href', '/result/example/');
  mkdirSync(ARTIFACTS_DIR, { recursive: true });
  await page.screenshot({ path: join(ARTIFACTS_DIR, 'example-denied.png') });

  await entry.click();
  await expect(page).toHaveURL(/\/result\/example\/$/);
  await expect(result(page).getByText('例の録音です')).toBeVisible();
  await expect(result(page).locator('.res')).toBeVisible();
});

test('録音を始められないときの案内からも、例の録音で見るで例の録音の結果へ進む', async ({ page }) => {
  // アプリの中のブラウザーで録音の API がない場合を、API の境界で再現する（e2e/record.spec.ts と同じ）。
  await page.addInitScript(() => {
    localStorage.setItem('yomimasu.recHelpDone', '1');
    Object.defineProperty(navigator, 'mediaDevices', { value: undefined });
  });
  await serveExample(page, { ...standardReading, maSec: 1.6 });
  await page.goto('/read/rec/');
  await page.getByRole('button', { name: '読み始める' }).click();

  const alert = page.getByRole('alert');
  await expect(alert).toContainText('録音を始められませんでした。');
  const entry = alert.getByRole('link', { name: '例の録音で見る' });
  await expect(entry).toHaveAttribute('href', '/result/example/');
  mkdirSync(ARTIFACTS_DIR, { recursive: true });
  await page.screenshot({ path: join(ARTIFACTS_DIR, 'example-unavailable.png') });

  await entry.click();
  await expect(page).toHaveURL(/\/result\/example\/$/);
  await expect(result(page).getByText('例の録音です')).toBeVisible();
  await expect(result(page).locator('.res')).toBeVisible();
});
