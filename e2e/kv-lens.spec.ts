import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Browser, type BrowserContextOptions, type Page } from '@playwright/test';

// 入口の絵の虫眼鏡と誘いの文（試作。docs/ui-guide.md の8節「入口の絵の虫眼鏡（試作）」）。

const ARTIFACTS_DIR = 'e2e-artifacts';
const HINT = ['長押しで拡大', 'ドラッグで回転'];

test.use({ viewport: { width: 393, height: 659 } });

type Draws = { kvDraws: number };

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

const openHome = async (page: Page, mode: 'live' | 'still' = 'live') => {
  await page.goto('/');
  await expect(page.locator('yomimasu-kv')).toHaveAttribute('data-kv', mode);
};

// 絵の中ほど（人物の胴のあたり）
const figurePoint = async (page: Page) => {
  const box = (await page.locator('yomimasu-kv canvas').boundingBox())!;
  return { x: box.x + box.width * 0.45, y: box.y + box.height * 0.6 };
};

// 動いた時刻（CDP の timestamp、秒）を決めて送るマウス。Playwright の move は1歩ずつ届くのを待つので、
// 重い環境では、押してから動かすまでに実際に 350ms を超えてしまい、長押しとして正しく開く
const timedMouse = async (page: Page, y: number) => {
  const cdp = await page.context().newCDPSession(page);
  return (type: 'mousePressed' | 'mouseMoved' | 'mouseReleased', x: number, timestamp: number) =>
    cdp.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, timestamp });
};

const lens = (page: Page) => page.locator('.kv-lens');
const lensBox = async (page: Page) => (await lens(page).boundingBox())!;
const inkedPixels = (page: Page) =>
  lens(page).evaluate((canvas: HTMLCanvasElement) => {
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    let inked = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i]) inked++;
    return inked;
  });

test('虫眼鏡を開く前の 5px の升目の絵も、升目ごとに決まり字と記号を字で描く', async ({ page }) => {
  // 絵の Canvas に最後の1コマで描いた字。kv-live.js は1コマごとに Canvas を消してから字を描く
  await page.addInitScript(() => {
    const drawn: string[] = [];
    Object.assign(window, { kvText: drawn });
    const clear = CanvasRenderingContext2D.prototype.clearRect;
    CanvasRenderingContext2D.prototype.clearRect = function (...args) {
      if (this.canvas.closest('yomimasu-kv')) drawn.length = 0;
      return clear.apply(this, args);
    };
    const fillText = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (text, ...rest) {
      if (this.canvas.closest('yomimasu-kv')) drawn.push(text);
      return fillText.call(this, text, ...rest);
    };
  });
  await openHome(page);
  const { cell, painted, drawn } = await page.locator('yomimasu-kv canvas').evaluate((canvas: HTMLCanvasElement) => {
    const glyphs = window.YomimasuKv.glyphsOf(canvas)!;
    return { cell: glyphs.cell, painted: glyphs.list.map((glyph) => glyph[2]), drawn: [...(window as unknown as { kvText: string[] }).kvText] };
  });
  expect(cell).toBe(5);
  expect(drawn).toEqual(painted);
  expect(drawn.filter((ch) => /^[ぁ-ゖ]$/.test(ch)).length).toBeGreaterThan(500);
});

test('絵を長押しすると、指の上に虫眼鏡が開いて決まり字を描き、離すと閉じる', async ({ page }) => {
  await openHome(page);
  const at = await figurePoint(page);
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await expect(lens(page)).toBeVisible();
  await expect(lens(page)).toHaveAttribute('aria-hidden', 'true');
  const box = await lensBox(page);
  expect(box.y + box.height).toBeLessThan(at.y);
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(393);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(await inkedPixels(page)).toBeGreaterThan(1000);
  mkdirSync(ARTIFACTS_DIR, { recursive: true });
  await page.screenshot({ path: join(ARTIFACTS_DIR, 'kv-lens-open-393x659.png') });

  await page.mouse.up();
  await expect(lens(page)).toHaveCount(0);
});

test('短く押しただけのときと、開く前に 8px 以上動かしたときは開かない', async ({ page }) => {
  await openHome(page);
  const at = await figurePoint(page);
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.waitForTimeout(150);
  await page.mouse.up();
  await page.waitForTimeout(400);
  await expect(lens(page)).toHaveCount(0);

  const mouse = await timedMouse(page, at.y);
  const pressed = Date.now() / 1000;
  await mouse('mousePressed', at.x, pressed);
  for (const [i, dx] of [4, 8, 12].entries()) await mouse('mouseMoved', at.x + dx, pressed + 0.04 * (i + 1));
  await page.waitForTimeout(500);
  await expect(lens(page)).toHaveCount(0);
  await mouse('mouseReleased', at.x + 12, Date.now() / 1000);
});

test('押してから 350ms 未満に 8px 以上動いた指の動きが、虫眼鏡を開いたあとに届いても閉じる', async ({ page }) => {
  // 描画のコマが遅れると、動きは開くタイマーより遅れて届く
  await openHome(page);
  const at = await figurePoint(page);
  const mouse = await timedMouse(page, at.y);
  const pressed = Date.now() / 1000;
  await mouse('mousePressed', at.x, pressed);
  await expect(lens(page)).toBeVisible();
  await mouse('mouseMoved', at.x + 12, pressed + 0.1);
  await expect(lens(page)).toHaveCount(0);
  await mouse('mouseReleased', at.x + 12, Date.now() / 1000);
});

test('押したまま動かすと虫眼鏡が付いてきて、画面からはみ出さない', async ({ page }) => {
  await openHome(page);
  const at = await figurePoint(page);
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await expect(lens(page)).toBeVisible();
  const before = await lensBox(page);
  await page.mouse.move(at.x - 40, at.y + 30, { steps: 4 });
  const after = await lensBox(page);
  expect(Math.round(after.x - before.x)).toBe(-40);
  expect(Math.round(after.y - before.y)).toBe(30);
  // 画面の左端へ動かしても、円は画面の中に留まる
  await page.mouse.move(2, at.y, { steps: 4 });
  expect((await lensBox(page)).x).toBeGreaterThanOrEqual(0);
  await page.mouse.up();
});

test('虫眼鏡を開いているあいだは、押したまま動かしても絵が止まったまま回らず、閉じると動いていた絵はまた動く', async ({ page }) => {
  await countDraws(page);
  await openHome(page);
  await expect.poll(() => draws(page)).toBeGreaterThan(3);
  const at = await figurePoint(page);
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await expect(lens(page)).toBeVisible();
  await page.waitForTimeout(100);
  const opened = await draws(page);
  await page.mouse.move(at.x + 60, at.y, { steps: 4 });
  await page.waitForTimeout(1000);
  expect(await draws(page)).toBe(opened);
  await page.mouse.up();
  await expect.poll(() => draws(page)).toBeGreaterThan(opened + 3);
});

test('止めた絵でも、虫眼鏡を開いたまま絵の外へ動かして離すと閉じる', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openHome(page, 'still');
  const at = await figurePoint(page);
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await expect(lens(page)).toBeVisible();
  await page.mouse.move(at.x, 60, { steps: 5 });
  await page.mouse.up();
  await expect(lens(page)).toHaveCount(0);
  // 離したあとに、押していないマウスが絵の上を通っても開かない
  await page.mouse.move(at.x, at.y, { steps: 3 });
  await page.waitForTimeout(500);
  await expect(lens(page)).toHaveCount(0);
});

test('虫眼鏡を開いているあいだは、傾けても絵を描き直さない', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(DeviceOrientationEvent, 'requestPermission', { value: undefined }));
  await countDraws(page);
  await openHome(page);
  const tilt = (beta: number, gamma: number) =>
    page.evaluate(([beta, gamma]) => dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: 10, beta, gamma })), [beta, gamma]);
  await tilt(60, 0);
  const at = await figurePoint(page);
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await expect(lens(page)).toBeVisible();
  await page.waitForTimeout(150);
  const opened = await draws(page);
  await tilt(60, 25);
  await page.waitForTimeout(500);
  expect(await draws(page)).toBe(opened);
  await page.mouse.up();
});

test('絵の枠の右上に「長押しで拡大」「ドラッグで回転」の2行を重ね、読み上げでも読め、虫眼鏡を使ったあとも開き直したあとも出したままにする', async ({ page }) => {
  await openHome(page);
  const hint = page.locator('.kv-hint');
  await expect(hint.locator('span')).toHaveText(HINT);
  await expect(hint).not.toHaveAttribute('aria-hidden');
  const spoken = await page.locator('yomimasu-kv').ariaSnapshot();
  for (const line of HINT) expect(spoken).toContain(line);
  const [kv, text] = await Promise.all([page.locator('yomimasu-kv').boundingBox(), hint.boundingBox()]);
  expect(Math.round(text!.x + text!.width)).toBe(Math.round(kv!.x + kv!.width));
  expect(Math.round(text!.y)).toBe(Math.round(kv!.y));
  mkdirSync(ARTIFACTS_DIR, { recursive: true });
  await page.screenshot({ path: join(ARTIFACTS_DIR, 'kv-lens-closed-393x659.png') });

  const at = await figurePoint(page);
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await expect(lens(page)).toBeVisible();
  await expect(hint).toBeVisible();
  await page.mouse.up();
  await expect(hint).toBeVisible();
  await page.reload();
  await expect(page.locator('yomimasu-kv')).toHaveAttribute('data-kv', 'live');
  await expect(page.locator('.kv-hint span')).toHaveText(HINT);
});

for (const [width, height] of [
  [393, 659],
  [360, 640],
  [375, 812],
  [448, 940],
] as const) {
  test(`${width}×${height} で、操作の説明は、回していない絵の1周のどのコマでも字に重ならない`, async ({ page }) => {
    // 1周の24コマを描くと、CI の SwiftShader では大きい画面で30秒の既定を超える。コマを間引くと重なりを見逃すので、時間の上限を延ばす
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height });
    await page.clock.install({ time: new Date('2026-11-06T00:00:00Z') });
    await page.clock.pauseAt(new Date('2026-11-06T00:00:01Z'));
    await openHome(page);
    for (let frame = 0; frame < 24; frame++) {
      await page.clock.runFor(500);
      const covered = await page.locator('yomimasu-kv canvas').evaluate((canvas: HTMLCanvasElement) => {
        const hint = document.querySelector('.kv-hint')!.getBoundingClientRect();
        const box = canvas.getBoundingClientRect();
        const { list, cell } = window.YomimasuKv.glyphsOf(canvas)!;
        return list.filter(([r, c]) => {
          const x = box.left + c * cell;
          const y = box.top + r * cell;
          return x + cell > hint.left && x < hint.right && y + cell > hint.top && y < hint.bottom;
        }).length;
      });
      expect(covered).toBe(0);
    }
  });
}

// 同じ時計で開いた絵を、押して離すだけのときと、押してすぐ横へなぞったときで比べる。時計を止めて進めるので、なぞりのほかは同じコマになる
type Point = { x: number; y: number };
const glyphsAfter = async (browser: Browser, input: (page: Page, at: Point) => Promise<void>, options: BrowserContextOptions = {}) => {
  const page = await browser.newPage({ viewport: { width: 393, height: 659 }, ...options });
  await page.clock.install({ time: new Date('2026-11-06T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-11-06T00:00:01Z'));
  await openHome(page);
  await page.clock.runFor(1000);
  const at = await figurePoint(page);
  await input(page, at);
  await page.clock.runFor(500);
  await expect(lens(page)).toHaveCount(0);
  const glyphs = await page.locator('yomimasu-kv canvas').evaluate((canvas: HTMLCanvasElement) => JSON.stringify(window.YomimasuKv.glyphsOf(canvas)!.list));
  await page.close();
  return glyphs;
};

test('マウスで押してすぐ横へ動かすと、絵が回る', async ({ browser }) => {
  const tap = async (page: Page, at: Point) => {
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await page.mouse.up();
  };
  const drag = async (page: Page, at: Point) => {
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await page.mouse.move(at.x + 120, at.y, { steps: 6 });
    await page.mouse.up();
  };
  const [tapped, again, dragged] = [await glyphsAfter(browser, tap), await glyphsAfter(browser, tap), await glyphsAfter(browser, drag)];
  expect(again).toBe(tapped);
  expect(dragged).not.toBe(tapped);
});

test('動きを減らす設定の止めた絵でも、WebGL2 がない端末の止めた絵でも、虫眼鏡は使える', async ({ page, browser }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openHome(page, 'still');
  // 止めた絵は回せないので、説明は「長押しで拡大」だけにする
  await expect(page.locator('.kv-hint span')).toHaveText([HINT[0]]);
  let at = await figurePoint(page);
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await expect(lens(page)).toBeVisible();
  expect(await inkedPixels(page)).toBeGreaterThan(1000);
  await page.mouse.up();
  await expect(lens(page)).toHaveCount(0);

  const noWebGL2 = await browser.newPage({ viewport: { width: 393, height: 659 } });
  await noWebGL2.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      return type === 'webgl2' ? null : getContext.call(this, type, ...(rest as []));
    } as typeof getContext;
  });
  await openHome(noWebGL2, 'still');
  await expect(noWebGL2.locator('.kv-hint span')).toHaveText([HINT[0]]);
  at = await figurePoint(noWebGL2);
  await noWebGL2.mouse.move(at.x, at.y);
  await noWebGL2.mouse.down();
  await expect(lens(noWebGL2)).toBeVisible();
  expect(await inkedPixels(noWebGL2)).toBeGreaterThan(1000);
  await noWebGL2.mouse.up();
  await noWebGL2.close();
});

test.describe('指で触る端末', () => {
  test.use({ hasTouch: true, isMobile: true });

  test('開いているあいだは指を縦に動かしてもスクロールせず、開く前の縦のなぞりはスクロールになる', async ({ page }) => {
    await openHome(page);
    // 指の動きは CDP で送る。押してから離すまでを、1つのセッションで送る
    const cdp = await page.context().newCDPSession(page);
    const touch = (_: Page, type: 'touchStart' | 'touchMove' | 'touchEnd', x = 0, y = 0, timestamp?: number) =>
      cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }], timestamp });
    const at = await figurePoint(page);
    await touch(page, 'touchStart', at.x, at.y);
    await expect(lens(page)).toBeVisible();
    const before = await lensBox(page);
    for (let dy = 10; dy <= 80; dy += 10) await touch(page, 'touchMove', at.x, at.y - dy);
    expect(Math.round((await lensBox(page)).y - before.y)).toBe(-80);
    await touch(page, 'touchEnd');
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => scrollY)).toBe(0);
    await expect(lens(page)).toHaveCount(0);

    // 開く前のなぞりは、動いた時刻を決めて送る（timedMouse と同じ理由）
    const touched = Date.now() / 1000;
    await touch(page, 'touchStart', at.x, at.y, touched);
    for (let dy = 10; dy <= 120; dy += 10) await touch(page, 'touchMove', at.x, at.y - dy, touched + dy / 1000);
    await touch(page, 'touchEnd', 0, 0, touched + 0.13);
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
    await expect(lens(page)).toHaveCount(0);
  });

  test('1本の指で押してすぐ横へなぞると、絵が回る', async ({ browser }) => {
    const finger = (dx: number) => async (page: Page, at: Point) => {
      const cdp = await page.context().newCDPSession(page);
      const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', x = 0) =>
        cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y: at.y }] });
      await touch('touchStart', at.x);
      for (let moved = 10; moved <= dx; moved += 10) await touch('touchMove', at.x + moved);
      await touch('touchEnd');
      expect(await page.evaluate(() => scrollX + scrollY)).toBe(0);
    };
    const options = { hasTouch: true, isMobile: true };
    const [tapped, again, swiped] = [
      await glyphsAfter(browser, finger(0), options),
      await glyphsAfter(browser, finger(0), options),
      await glyphsAfter(browser, finger(120), options),
    ];
    expect(again).toBe(tapped);
    expect(swiped).not.toBe(tapped);
  });

  test('開いているあいだに2本目の指が触れても、絵は動き出さず、回らない', async ({ page }) => {
    await countDraws(page);
    await openHome(page);
    const cdp = await page.context().newCDPSession(page);
    const at = await figurePoint(page);
    const second = { x: at.x + 60, y: at.y + 20 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: at.x, y: at.y, id: 1 }] });
    await expect(lens(page)).toBeVisible();
    await page.waitForTimeout(150);
    const opened = await draws(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: at.x, y: at.y, id: 1 }, { ...second, id: 2 }] });
    for (let dx = 10; dx <= 60; dx += 10) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: at.x, y: at.y, id: 1 }, { x: second.x + dx, y: second.y, id: 2 }] });
    }
    await page.waitForTimeout(500);
    expect(await draws(page)).toBe(opened);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  });
});
