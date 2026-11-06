import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const ARTIFACTS_DIR = 'e2e-artifacts';
const SIZES = [
  [393, 659],
  [360, 640],
  [375, 812],
  [448, 940],
] as const;

type Draws = { kvDraws: number };

// 絵が描いた回数。kv-live.js は1コマごとに Canvas を消してから字を描くので、絵の中の Canvas の clearRect を数える。
const countDraws = (page: Page) =>
  page.addInitScript(() => {
    Object.assign(window, { kvDraws: 0 });
    const clear = CanvasRenderingContext2D.prototype.clearRect;
    CanvasRenderingContext2D.prototype.clearRect = function (...args) {
      if (this.canvas.closest('yomimasu-kv')) (window as unknown as Draws).kvDraws++;
      return clear.apply(this, args);
    };
  });
const draws = (page: Page) => page.evaluate(() => (window as unknown as Draws).kvDraws);

const withoutWebGL2 = (page: Page) =>
  page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      return type === 'webgl2' ? null : getContext.call(this, type, ...(rest as []));
    } as typeof getContext;
  });

const openHome = async (page: Page, mode: 'live' | 'still' = 'live') => {
  await page.goto('/');
  await expect(page.locator('yomimasu-kv')).toHaveAttribute('data-kv', mode);
};

const kvImage = (page: Page) => page.locator('yomimasu-kv canvas').evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());

// 字の画素のうち、2枚で違うものの割合。
const mismatch = (page: Page, a: string, b: string) =>
  page.evaluate(
    async ([a, b]) => {
      const pixels = async (url: string) => {
        const image = new Image();
        image.src = url;
        await image.decode();
        const canvas = new OffscreenCanvas(image.width, image.height);
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(image, 0, 0);
        return ctx.getImageData(0, 0, image.width, image.height).data;
      };
      const [pa, pb] = await Promise.all([pixels(a), pixels(b)]);
      let inked = 0;
      let differ = 0;
      for (let i = 3; i < pa.length; i += 4) {
        if (pa[i] || pb[i]) inked++;
        if (pa[i] !== pb[i]) differ++;
      }
      return inked ? differ / inked : 1;
    },
    [a, b],
  );

for (const [width, height] of SIZES) {
  test(`${width}×${height} の最初の画面に、題、題の下の文、絵、先頭の項目、2番目の項目の上端が入る`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await openHome(page);
    const box = (selector: string) => page.locator(selector).evaluate((el) => el.getBoundingClientRect().toJSON() as DOMRect);
    const [title, lead, kv, ask, first, second] = await Promise.all(
      ['main h1', '.hero p', 'yomimasu-kv', '.ask-line', '.menu a:nth-child(1)', '.menu a:nth-child(2)'].map(box),
    );
    expect(title.top).toBeGreaterThanOrEqual(0);
    expect(lead.top).toBeGreaterThan(title.bottom - 1);
    expect(kv.top).toBeGreaterThan(lead.bottom - 1);
    expect(ask.top).toBeGreaterThan(kv.bottom - 1);
    expect(first.top).toBeGreaterThan(ask.bottom - 1);
    expect(first.bottom).toBeLessThanOrEqual(height);
    expect(second.top).toBeLessThan(height);

    // 絵の高さ = max(160, min(520, 画面の高さ − 先頭の項目の下端 − 24))。下端は絵の高さを除いて測る。
    const expected = Math.max(160, Math.min(520, height - (first.bottom - kv.height) - 24));
    expect(Math.abs(kv.height - expected)).toBeLessThan(1);
    // 升目（試作）= clamp(round(絵の高さ / 64), 4, 6)。Canvas は、絵の枠に入る升目の数だけの大きさになる。
    const [boxWidth, boxHeight] = await page.locator('yomimasu-kv').evaluate((el) => [el.clientWidth, el.clientHeight]);
    const cell = Math.min(6, Math.max(4, Math.round(boxHeight / 64)));
    const canvas = await page.locator('yomimasu-kv canvas').evaluate((el) => [el.clientWidth, el.clientHeight]);
    expect(canvas).toEqual([Math.floor(boxWidth / cell) * cell, Math.floor(boxHeight / cell) * cell]);

    mkdirSync(ARTIFACTS_DIR, { recursive: true });
    await page.screenshot({ path: join(ARTIFACTS_DIR, `kv-home-${width}x${height}.png`) });
  });
}

for (const motion of ['live', 'still'] as const) {
  test(`画面を回して大きさが変わると、絵の高さと升目を測り直す（${motion === 'live' ? '動く絵' : '止めた絵'}）`, async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 659 });
    if (motion === 'still') await page.emulateMedia({ reducedMotion: 'reduce' });
    await openHome(page, motion);
    await page.setViewportSize({ width: 659, height: 393 });
    // 横にすると、絵は下限の 160px になり、升目は（試作では）4px になる。
    await expect.poll(() => page.locator('yomimasu-kv canvas').evaluate((el) => [el.clientWidth % 4, el.clientHeight])).toEqual([0, 160]);
    await page.setViewportSize({ width: 393, height: 659 });
    await expect.poll(() => page.locator('yomimasu-kv canvas').evaluate((el) => [el.clientWidth, el.clientHeight])).toEqual([360, 315]);
  });
}

test('題の上下の余白は 12/8px に詰め、一覧の文字と行の高さは変えない', async ({ page }) => {
  await openHome(page);
  expect(await page.locator('.hero').evaluate((el) => [getComputedStyle(el).paddingTop, getComputedStyle(el).paddingBottom])).toEqual(['12px', '8px']);
  const rows = await page.locator('.menu a').evaluateAll((links) => links.map((a) => [getComputedStyle(a).fontSize, getComputedStyle(a).lineHeight, getComputedStyle(a).minHeight]));
  expect(rows[0]).toEqual(['17px', '30.6px', '64px']);
  for (const row of rows.slice(1)) expect(row).toEqual(['15px', '27px', '48px']);
});

test('一覧の最後の項目がはみ出すときは「↓」を出して往復させ、スクロールが始まったら消して、上へ戻っても出さない', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 659 });
  await openHome(page);
  const more = page.locator('.kv-more');
  await expect(more).toBeVisible();
  await expect(more).toHaveText('↓');
  await expect(more).toHaveAttribute('aria-hidden', 'true');
  const look = await more.evaluate((el) => {
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    const [bob] = el.getAnimations() as CSSAnimation[];
    const effect = bob.effect as KeyframeEffect;
    const timing = effect.getComputedTiming();
    const middle = effect.getKeyframes().find((k) => k.offset === 0.5);
    return { position: style.position, events: style.pointerEvents, center: rect.left + rect.width / 2, bottom: rect.bottom, name: bob.animationName, duration: timing.duration, iterations: timing.iterations, middle: middle?.transform };
  });
  expect(look).toMatchObject({ position: 'fixed', events: 'none', name: 'more-bob', duration: 1400, iterations: Infinity, middle: 'translate(-50%, -4px)' });
  expect(Math.abs(look.center - 393 / 2)).toBeLessThan(1);
  expect(look.bottom).toBeLessThanOrEqual(659);
  mkdirSync(ARTIFACTS_DIR, { recursive: true });
  await page.screenshot({ path: join(ARTIFACTS_DIR, 'kv-more-393x659.png') });

  await page.mouse.wheel(0, 120);
  await expect(more).toHaveCSS('opacity', '0');
  expect(await more.evaluate((el) => el.getAnimations().find((a) => (a as CSSAnimation).animationName === 'more-bob')?.playState)).toBe('paused');
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(300);
  await expect(more).toHaveCSS('opacity', '0');
});

test('一覧の最後の項目まで最初の画面に入るときは、「↓」を出さない', async ({ page }) => {
  await page.setViewportSize({ width: 448, height: 1300 });
  await openHome(page);
  expect(await page.locator('.menu a').last().evaluate((el) => el.getBoundingClientRect().bottom)).toBeLessThanOrEqual(1300);
  await expect(page.locator('.kv-more')).toHaveCount(0);
});

test('36秒（3周）で読む場面に止まり、触るとまた動く', async ({ page, browser }) => {
  await page.setViewportSize({ width: 393, height: 659 });
  await page.clock.install();
  await openHome(page);
  await page.clock.fastForward('00:10');
  const moving = await kvImage(page);
  await page.clock.fastForward('00:27');
  await page.waitForTimeout(200);
  const stopped = await kvImage(page);
  expect(stopped).not.toBe(moving);

  // 動きを減らす設定で描く止めた1コマは、読む場面（READ_T）である。止まった絵はそれと同じになる。
  const reduced = await browser.newPage({ viewport: { width: 393, height: 659 }, reducedMotion: 'reduce' });
  await openHome(reduced, 'still');
  expect(stopped).toBe(await kvImage(reduced));
  await reduced.close();

  await page.waitForTimeout(500);
  expect(await kvImage(page)).toBe(stopped);
  await page.locator('yomimasu-kv canvas').click();
  await page.clock.fastForward('00:01');
  await page.waitForTimeout(200);
  expect(await kvImage(page)).not.toBe(stopped);
});

// 許可の要らない端末は、絵を出した時点から傾きを受ける。
const tilt = (page: Page, beta: number, gamma: number) =>
  page.evaluate(([beta, gamma]) => dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: 10, beta, gamma })), [beta, gamma]);

test('許可の要らない端末で、止まった絵は、手に持ったぶれほどの傾きでは描き直さず、大きく傾けると描き直す', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 659 });
  // この Chromium は傾きの許可を求める形なので、許可の要らない端末（requestPermission がない）にする。
  await page.addInitScript(() => Object.defineProperty(DeviceOrientationEvent, 'requestPermission', { value: undefined }));
  await countDraws(page);
  await page.clock.install();
  await openHome(page);
  await tilt(page, 60, 0);
  await page.clock.fastForward('00:37');
  await page.waitForTimeout(300);
  const before = await draws(page);
  for (const [beta, gamma] of [[60.4, 0.3], [59.7, -0.4], [60.2, 0.5], [59.8, -0.2]]) {
    await tilt(page, beta, gamma);
    await page.clock.runFor(250);
  }
  expect(await draws(page)).toBe(before);
  await tilt(page, 60, 20);
  await page.clock.runFor(500);
  expect(await draws(page)).toBeGreaterThan(before);
});

test('一覧を押してコマンドを打ち込むあいだと、入口へ入れ替えて題を流すあいだは、絵を描かない', async ({ page }) => {
  await countDraws(page);
  await openHome(page);
  await expect.poll(() => draws(page)).toBeGreaterThan(3);

  // 打ち込み始めてから、入口の本文が入れ替わるまで、毎フレーム描いた回数を見る。
  await page.evaluate(() => {
    const seen: number[] = [];
    Object.assign(window, { duringTyping: seen });
    const kv = document.querySelector('yomimasu-kv')!;
    const tick = () => {
      if (!kv.isConnected) return;
      if (document.querySelector('.ask.is-sent')) seen.push((window as unknown as Draws).kvDraws);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.getByRole('link', { name: /\/総論を学ぶ/ }).click();
  await expect(page).toHaveURL(/\/soron\/$/);
  const typing = await page.evaluate(() => (window as unknown as { duringTyping: number[] }).duringTyping);
  expect(typing.length).toBeGreaterThan(10);
  expect(new Set(typing).size).toBe(1);

  // 上の帯の /yomimasu で入口へ戻ると、題を流すあいだ絵は隠れていて、描かない。流し終えてから動き出す。
  await page.evaluate(() => {
    const seen: number[] = [];
    Object.assign(window, { whileHeld: seen });
    const tick = () => {
      const kv = document.querySelector('yomimasu-kv');
      if (kv?.classList.contains('is-held')) seen.push((window as unknown as Draws).kvDraws);
      if (!kv || kv.classList.contains('is-held')) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const atSwap = await draws(page);
  await page.locator('header.bar a').click();
  await expect(page.locator('yomimasu-kv')).toHaveAttribute('data-kv', 'live');
  const held = await page.evaluate(() => (window as unknown as { whileHeld: number[] }).whileHeld);
  expect(held.length).toBeGreaterThan(10);
  expect(new Set([atSwap, ...held]).size).toBe(1);
  await expect.poll(() => draws(page)).toBeGreaterThan(atSwap);
});

test('WebGL2 がない端末では、読む場面で止めた絵を出し、動かさない', async ({ page, browser }) => {
  await page.setViewportSize({ width: 393, height: 659 });
  await withoutWebGL2(page);
  await countDraws(page);
  await openHome(page, 'still');
  const still = await kvImage(page);
  const before = await draws(page);
  await page.waitForTimeout(1000);
  expect(await draws(page)).toBe(before);
  expect(await kvImage(page)).toBe(still);

  // WebGL2 で描いた読む場面の絵と、ほとんど同じ字の並びになる。
  const reduced = await browser.newPage({ viewport: { width: 393, height: 659 }, reducedMotion: 'reduce' });
  await openHome(reduced, 'still');
  expect(await mismatch(page, still, await kvImage(reduced))).toBeLessThan(0.02);
  await reduced.close();
  mkdirSync(ARTIFACTS_DIR, { recursive: true });
  await page.screenshot({ path: join(ARTIFACTS_DIR, 'kv-no-webgl2-393x659.png') });
});

test('動きを減らす設定では、絵も「↓」も動かない', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 659 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await countDraws(page);
  await openHome(page, 'still');
  const before = await draws(page);
  await page.locator('yomimasu-kv canvas').click();
  await page.waitForTimeout(1000);
  expect(await draws(page)).toBe(before);
  await expect(page.locator('.kv-more')).toBeVisible();
  expect(await page.locator('.kv-more').evaluate((el) => el.getAnimations().length)).toBe(0);
});

for (const webgl2 of [true, false]) {
  test(`絵は同じオリジンへの GET と HEAD のほかに通信しない（WebGL2 ${webgl2 ? 'あり' : 'なし'}）`, async ({ page, baseURL }) => {
    if (!webgl2) await withoutWebGL2(page);
    const requests: string[] = [];
    page.on('request', (request) => requests.push(`${request.method()} ${request.url()}`));
    await openHome(page, webgl2 ? 'live' : 'still');
    await page.locator('yomimasu-kv canvas').click();
    await page.mouse.move(200, 400);
    await page.mouse.down();
    await page.mouse.move(260, 400, { steps: 5 });
    await page.mouse.up();
    await page.setViewportSize({ width: 360, height: 640 });
    await page.waitForTimeout(2000);
    expect(requests.length).toBeGreaterThan(0);
    const origin = new URL(baseURL!).origin;
    const strays = requests.filter((line) => {
      const [method, url] = line.split(' ');
      return !['GET', 'HEAD'].includes(method) || new URL(url).origin !== origin;
    });
    expect(strays).toEqual([]);
  });
}
