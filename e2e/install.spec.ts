import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { commandAt } from '../.claude/skills/yomimasu/scripts/commands.ts';
import { INSTALL_TARGETS } from '../site/install.ts';

const ARTIFACTS_DIR = 'e2e-artifacts';
const ASK_QUESTION = 'どこに入れますか？';
const ASK_EXAMPLE = '競技かるたの読みで、余韻の3秒はどこから数える？';

// 手順の画面に出すもの（docs/ui-guide.md の8節「AI に入れる」）。選択肢から外した入れる先は組み立てないので、確かめるのは選択肢に出すものだけである。
const PROCEDURES: Record<string, { heading: string; where: string; steps: string[]; figures: number }> = {
  '/install/claude/': {
    heading: 'Claude に入れる',
    where: 'パソコンのブラウザーで、claude.ai を開いて進めます。',
    steps: ['ファイルを保存する', 'コードの実行をオンにする', 'ファイルをアップロードする', '聞いてみる'],
    figures: 2,
  },
  '/install/chatgpt/': {
    heading: 'ChatGPT に入れる',
    where: 'パソコンのブラウザーで、chatgpt.com を開いて進めます。',
    steps: ['ファイルを保存する', 'ファイルをアップロードする', '聞いてみる'],
    figures: 1,
  },
  '/install/gemini/': {
    heading: 'Gemini に入れる',
    where: 'パソコンのブラウザーで、gemini.google.com を開いて進めます。',
    steps: ['ファイルを保存する', 'ファイルをアップロードする', '聞いてみる'],
    figures: 1,
  },
  '/install/agent/': {
    heading: 'コーディングエージェントに入れる',
    where: 'ターミナルで1行実行して入れます。',
    steps: ['ターミナルで実行する', '聞いてみる'],
    figures: 0,
  },
};

const OFFERED = INSTALL_TARGETS.map((target) => target.path);
const OPTION_TEXTS = INSTALL_TARGETS.map(({ label, note }, i) => `${i + 1}. ${label}${note ?? ''}`);
const commandOf = (path: string) => commandAt(path, () => undefined)!;

const noHorizontalScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
const linesOf = (page: Page, selector: string) =>
  page.locator(selector).evaluate((el) => Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight)));
const shortTargets = (page: Page) =>
  page
    .locator('main a, main button')
    .evaluateAll((els) => els.filter((el) => el.checkVisibility() && el.getBoundingClientRect().height < 44).map((el) => el.textContent?.trim()));

// 入力の行に打ち込まれた文字を、毎フレーム集める。打ち込みは 370ms で終わるので、外から待つと見逃す。
const watchTyped = (page: Page) =>
  page.evaluate(() => {
    const seen = new Set<string>();
    Object.assign(window, { typedSeen: seen });
    const tick = () => {
      const text = document.querySelector('main [data-typed]')?.textContent;
      if (text) seen.add(text);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
const typedSeen = (page: Page) => page.evaluate(() => [...(window as unknown as { typedSeen: Set<string> }).typedSeen]);

test('JS なしでも、尋ねる画面の選択肢のリンクで手順の画面へ移れ、保存は ZIP へのリンクである', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
  const page = await context.newPage();
  await page.goto('/install/');
  const pick = page.getByRole('group', { name: ASK_QUESTION });
  await expect(pick.getByRole('link')).toHaveText(OPTION_TEXTS);
  for (const [i, path] of OFFERED.entries()) await expect(pick.getByRole('link').nth(i)).toHaveAttribute('href', path);
  await expect(page.locator('.back-row').getByRole('link', { name: '戻る' })).toHaveAttribute('href', '/');

  await pick.getByRole('link').first().click();
  await expect(page).toHaveURL(new RegExp(`${OFFERED[0]}$`));
  await expect(page.locator('.run [data-run]')).toHaveText(`/yomimasu ${commandOf(OFFERED[0]).say}`);
  const save = page.getByRole('link', { name: 'yomimasu.zip を保存' });
  if (OFFERED[0] !== '/install/agent/') {
    await expect(save).toHaveAttribute('href', '/yomimasu.zip');
    await expect(save).toHaveAttribute('download', '');
  }
  await page.getByRole('link', { name: 'ほかの AI に入れる' }).click();
  await expect(page).toHaveURL(/\/install\/$/);
  await context.close();
});

test('入口から「/インストール」を開くと、見出し、説明、例、問いと選択肢を出し、入力の行を出さない', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /\/インストール/ }).click();
  await expect(page).toHaveURL(/\/install\/$/);
  await expect(page.locator('.run [data-run]')).toHaveText('/yomimasu インストール');
  await expect(page.locator('.run .read')).toHaveText('● Read インストール.md');
  await expect(page.locator('.ask-line')).toHaveCount(0);
  await expect(page.locator('main h2')).toHaveText('あなたのAIに、読みの知識をインストール。');
  await expect(page.locator('main h2 + p')).toHaveText('このアプリにはない、あなた自身の「やりたいこと」が手のひらに。');
  await expect(page.locator('main h3')).toHaveText('たとえば');
  const examples = page.locator('.examples > div');
  await expect(examples).toHaveCount(4);
  await expect(examples.locator('.prio')).toHaveText(['コーディングエージェントで', 'コーディングエージェントで']);
  await expect(examples.nth(0).locator('.prio')).toHaveCount(0);
  await expect(examples.nth(1)).toContainText('Wikipedia などの音声学の資料も読ませて');
  const pick = page.getByRole('group', { name: ASK_QUESTION });
  await expect(pick.locator('.auq-q')).toHaveText(ASK_QUESTION);
  await expect(pick.getByRole('link')).toHaveText(OPTION_TEXTS);
  await expect(page.locator('.back-row').getByRole('link', { name: '戻る' })).toBeVisible();
  await expect(page.locator('body')).not.toContainText(/考え中|考えました/);
});

test('入れる先を選ぶと、打ち込まずに選択肢を消して「❯ 名前」を出し、370ms 置いてから手順の画面へ移る', async ({ page }) => {
  const target = INSTALL_TARGETS[0];
  await page.goto('/');
  await page.getByRole('link', { name: /\/インストール/ }).click();
  const pick = page.getByRole('group', { name: ASK_QUESTION });
  await expect(pick.getByRole('link').first()).toBeVisible();
  await page.evaluate(() => Object.assign(window, { kept: true }));
  const expectedRun = `/yomimasu ${commandOf(target.path).say}`;
  await page.evaluate((expectedRun) => {
    document.addEventListener(
      'click',
      () => {
        const times: { pressed: number; answer?: number; runAtAnswer?: string; run?: number } = { pressed: performance.now() };
        Object.assign(window, { pickTimes: times });
        const tick = () => {
          const now = performance.now();
          const run = document.querySelector('main .run [data-run]')?.textContent;
          if (!times.answer && document.querySelector('main .auq-a')) {
            times.answer = now;
            times.runAtAnswer = run ?? '';
          }
          if (!times.run && run === expectedRun) times.run = now;
          if (!times.run) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      },
      { capture: true, once: true },
    );
  }, expectedRun);

  await pick.getByRole('link', { name: `1. ${target.label}` }).click();
  await expect(pick.locator('.auq-a')).toHaveText(`❯ ${target.label}`);
  await expect(pick.locator('.auq-opts')).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`${target.path}$`));
  await expect(page.locator('.run [data-run]')).toHaveText(expectedRun);
  await expect(page.locator('.run .read')).toHaveText(`● Read ${commandOf(target.path).read}`);
  const times = await page.evaluate(() => (window as unknown as { pickTimes: { pressed: number; answer: number; runAtAnswer: string; run: number } }).pickTimes);
  expect(times.runAtAnswer).toBe('/yomimasu インストール');
  expect(times.answer - times.pressed).toBeLessThan(100);
  expect(times.run - times.pressed).toBeGreaterThanOrEqual(360);
  expect(times.run - times.pressed).toBeLessThan(1000);
  expect(await page.evaluate(() => (window as unknown as { kept?: boolean }).kept)).toBe(true);
});

for (const path of OFFERED) {
  const expected = PROCEDURES[path];
  test(`${path} は、見出し、どこで行うか、段、図、聞いてみる例、次の操作を出し、各社のロゴや画面の写しを出さない`, async ({ page }) => {
    await page.goto(path);
    const { say, read } = commandOf(path);
    await expect(page.locator('.run [data-run]')).toHaveText(`/yomimasu ${say}`);
    await expect(page.locator('.run .read')).toHaveText(`● Read ${read}`);
    await expect(page.locator('main h2')).toHaveText(expected.heading);
    await expect(page.locator('main h2 + p')).toHaveText(expected.where);
    await expect(page.locator('.list > div > div > b')).toHaveText(expected.steps);
    await expect(page.locator('.list .n')).toHaveText(expected.steps.map((_, i) => String(i + 1)));
    const figures = page.locator('.sketch svg[role="img"]');
    await expect(figures).toHaveCount(expected.figures);
    for (const label of await figures.evaluateAll((svgs) => svgs.map((svg) => svg.getAttribute('aria-label') ?? ''))) {
      expect(label).toMatch(/の略図。.+(の順に押す|をオンにする)$/);
    }
    await expect(page.locator('main img, main image, main picture')).toHaveCount(0);

    if (path === '/install/agent/') {
      await expect(page.locator('.cmd code')).toHaveText(['npx skills add ko1ynnky/yomimasu', '/yomimasu 余韻の3秒はどこから数える？']);
      await expect(page.getByRole('link', { name: 'yomimasu.zip を保存' })).toHaveCount(0);
      await expect(page.locator('main .fine')).toContainText('npx skills update');
    } else {
      const save = page.getByRole('link', { name: 'yomimasu.zip を保存' });
      await expect(save).toHaveAttribute('href', '/yomimasu.zip');
      await expect(save).toHaveAttribute('download', '');
      await expect(page.locator('.cmd code')).toHaveText([ASK_EXAMPLE]);
      await expect(page.locator('main .fine')).toHaveText('プランによっては使えません。画面の名前は、2026年11月4日にパソコンのブラウザーで確かめたものです。');
    }
    await expect(page.locator('.cmd').getByRole('button', { name: 'コピー' })).toHaveCount(path === '/install/agent/' ? 2 : 1);
    await expect(page.locator('.next').getByRole('link', { name: 'ほかの AI に入れる' })).toHaveAttribute('href', '/install/');
    await expect(page.locator('.main-row').getByRole('link')).toHaveText(['まず1回読む', '戻る']);
  });
}

test('/yomimasu.zip は ZIP で配られ、保存を押すと保存が始まり、ボタンの文字を打ち込んでから入力の行を空に戻す', async ({ page, request }) => {
  const response = await request.get('/yomimasu.zip');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('zip');
  expect((await response.body()).subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));

  const general = OFFERED.find((path) => path !== '/install/agent/');
  test.skip(!general, '保存のボタンは汎用の AI の手順にしかない');
  await page.goto(general!);
  await watchTyped(page);
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'yomimasu.zip を保存' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('yomimasu.zip');
  expect(readFileSync((await file.path())!).subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  await expect(page.locator('.ask-line')).toHaveText('> /yomimasu ');
  expect(await typedSeen(page)).toContain('/yomimasu yomimasu.zip を保存');
  await expect(page).toHaveURL(new RegExp(`${general}$`));
});

test('コピーを押すと、打ち込んでからクリップボードに書き、「コピーしました」と出して、しばらくして戻す', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/install/agent/');
  await watchTyped(page);
  const copy = page.locator('.cmd').first().getByRole('button');
  await copy.click();
  await expect(copy).toHaveText('コピーしました');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('npx skills add ko1ynnky/yomimasu');
  expect(await typedSeen(page)).toContain('/yomimasu コピー');
  await expect(page.locator('.ask-line')).toHaveText('> /yomimasu ');
  await expect(copy).toHaveText('コピー', { timeout: 3000 });
});

test('クリップボードに書けないときは、文字を選んだ状態にして「選びました」と出す', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new DOMException('denied', 'NotAllowedError')) } });
  });
  const path = OFFERED.find((p) => p !== '/install/agent/') ?? '/install/agent/';
  await page.goto(path);
  const copy = page.locator('.cmd').last().getByRole('button');
  await copy.click();
  await expect(copy).toHaveText('選びました');
  const code = await page.locator('.cmd').last().locator('code').textContent();
  expect(await page.evaluate(() => getSelection()?.toString())).toBe(code);
});

test('手順の画面から戻った尋ねる画面で「戻る」を押すと、入れる先の問いを隠して「どこに戻りますか？」だけを出し、キャンセルで戻す', async ({ page }) => {
  const target = INSTALL_TARGETS[0];
  await page.goto('/');
  await page.getByRole('link', { name: /\/インストール/ }).click();
  await page.getByRole('group', { name: ASK_QUESTION }).getByRole('link').first().click();
  await expect(page).toHaveURL(new RegExp(`${target.path}$`));
  await page.getByRole('link', { name: 'ほかの AI に入れる' }).click();
  await expect(page).toHaveURL(/\/install\/$/);

  const pick = page.getByRole('group', { name: ASK_QUESTION });
  const back = page.locator('.back-row').getByRole('link', { name: '戻る' });
  const question = page.getByRole('group', { name: 'どこに戻りますか？' });
  await back.click();
  await expect(page.locator('.run [data-run]')).toHaveText('/yomimasu 戻る');
  await expect(question.getByRole('button')).toHaveText([`1. 1つ前のページ（${commandOf(target.path).read}）`, '2. トップページ', 'キャンセル']);
  await expect(pick).toBeHidden();
  await expect(page.getByText(ASK_QUESTION)).toBeHidden();

  await question.getByRole('button', { name: 'キャンセル' }).click();
  await expect(question).toHaveCount(0);
  await expect(pick.getByRole('link')).toHaveText(OPTION_TEXTS);
  await expect(back).toBeFocused();
});

for (const [width, height] of [
  [393, 659],
  [360, 640],
  [320, 640],
] as const) {
  test(`幅 ${width}px で、見出しと説明がガイドどおりに折れ、図とコマンドの文字が縮みすぎず、横スクロールと 44px 未満の押せる所がない`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/install/');
    expect(await linesOf(page, 'main h2'), 'h2').toBe(width === 320 ? 3 : 2);
    expect(await linesOf(page, 'main h2 + p'), 'p').toBe(2);
    expect(await noHorizontalScroll(page)).toBe(true);
    expect(await shortTargets(page)).toEqual([]);
    mkdirSync(ARTIFACTS_DIR, { recursive: true });
    if (width !== 360) await page.screenshot({ path: join(ARTIFACTS_DIR, `install-${width}x${height}.png`) });
    if (width === 393) await page.screenshot({ path: join(ARTIFACTS_DIR, `install-${width}x${height}-full.png`), fullPage: true });

    for (const path of OFFERED) {
      await page.goto(path);
      expect(await noHorizontalScroll(page), path).toBe(true);
      expect(await shortTargets(page), path).toEqual([]);
      // 図の文字は viewBox で 15.2 なので、描いた幅から画面の上の大きさが決まる。13px を下回らない（docs/ui-guide.md の3節、8節「図」）。
      for (const svgWidth of await page.locator('.sketch svg').evaluateAll((svgs) => svgs.map((svg) => svg.getBoundingClientRect().width))) {
        expect((svgWidth * 15.2) / 300, path).toBeGreaterThanOrEqual(13);
      }
      const cmd = await page.locator('.cmd code').first().evaluate((el) => [getComputedStyle(el).fontSize, getComputedStyle(el).lineHeight]);
      expect(cmd, path).toEqual(['14px', '23.8px']);
      // コマンドは語の切れ目でだけ折る。語の span はどれも1行に収まる。
      const words = await page.locator('.cmd code > span').evaluateAll((spans) => spans.map((span) => span.getClientRects().length));
      expect(words.every((n) => n === 1), `${path} ${words.join(',')}`).toBe(true);
      const name = path.split('/')[2];
      if (width === 393 && (name === 'claude' || name === 'agent')) {
        await page.screenshot({ path: join(ARTIFACTS_DIR, `install-${name}-${width}x${height}.png`) });
        await page.screenshot({ path: join(ARTIFACTS_DIR, `install-${name}-${width}x${height}-full.png`), fullPage: true });
      }
    }
  });
}
