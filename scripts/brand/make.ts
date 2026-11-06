// 入口の絵（site/client/kv-live.js）の読手くんから、ファビコン、ホーム画面のアイコン、SNS で共有したときの画像を作る。
//
//   node scripts/brand/make.ts
//
// 字は OS の書体で描き、基準は macOS のヒラギノである。macOS で実行して、出力をコミットする。組み立て（site/build.ts）と CI では作らない。
// Linux の CI で作ると、代わりの書体で字の形が変わり、ユーザーが選んだ絵と別のものになるからである。
// 出力は site/public/ の favicon.ico（16、32、48px の PNG を入れる）、apple-touch-icon.png（180px）、og.png（1200×630）で、Vite が dist/ の頭へ写す。
// 形はユーザーが 2026-11-07 に選んだ（docs/decisions.md）。絵を描き直すのは、入口の絵か配色を変えたときである。

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser } from '@playwright/test';
import deck from '../../.claude/skills/yomimasu/assets/cards.json' with { type: 'json' };
import type { Card } from '../../.claude/skills/yomimasu/scripts/cards.ts';
import { kimarijiStream } from '../../site/kimariji-stream.ts';

if (process.platform !== 'darwin') throw new Error('字をヒラギノで描くので、macOS で実行します');

const pathOf = (path: string) => fileURLToPath(new URL(`../../${path}`, import.meta.url));
const OUT_DIR = 'site/public';

// 色と書体は画面と同じ値にする。値は base.css の :root にあり、意味は docs/ui-guide.md の2節と3節にある。
const ROOT_RULE = readFileSync(pathOf('site/client/ui/base.css'), 'utf8').match(/:root\s*\{[^}]*\}/)![0];
const TOKENS = Object.fromEntries([...ROOT_RULE.matchAll(/--([\w-]+):\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()]));

const KV_SCRIPT = readFileSync(pathOf('site/client/kv-live.js'), 'utf8');
const STREAM = kimarijiStream(deck.cards as unknown as Card[]);

// 絵を写す枠と升目。アイコンは升目 11px の 440×520 の枠から、頭、胸、札が入る 18×18 の升目を切り出す。
const ICON_KV = { width: 440, height: 520, cell: 11 };
const ICON_CROP = { row: 4, col: 11, n: 18 };
const OG_KV = { width: 470, height: 560, cell: 13 };

// 読む場面で止めた1コマを、向きを既定（kv-live.js の DEFAULTS）のまま描く。入口の絵が止まったときと同じ場面である。
const stillScript = (cell: number) => `
  const element = document.getElementById('kv');
  const canvas = window.YomimasuKv.still(element, { stream: ${JSON.stringify(STREAM)}, cell: ${cell}, time: window.YomimasuKv.READ_T, layout: 'tate', ss: 3 });
  window.__kvGlyphs = window.YomimasuKv.glyphsOf(canvas)?.list;
`;

const kvBox = ({ width, height }: { width: number; height: number }) =>
  `#kv { width: ${width}px; height: ${height}px; color: var(--ink); font-family: var(--f-sans); }`;

async function iconGlyphs(browser: Browser) {
  const page = await browser.newPage({ viewport: { width: ICON_KV.width, height: ICON_KV.height } });
  await page.setContent(`<!doctype html><style>${ROOT_RULE} body { margin: 0; } ${kvBox(ICON_KV)}</style><div id="kv"></div>`);
  await page.addScriptTag({ content: KV_SCRIPT });
  await page.addScriptTag({ content: stillScript(ICON_KV.cell) });
  const { error, glyphs } = await page.evaluate(() => ({
    error: document.getElementById('kv')!.dataset.kvError,
    glyphs: (window as unknown as { __kvGlyphs?: [number, number, string, number][] }).__kvGlyphs,
  }));
  if (error || !glyphs) throw new Error(`入口の絵を描けませんでした：${error}`);
  await page.close();
  return glyphs.filter(([row, col]) => row >= ICON_CROP.row && row < ICON_CROP.row + ICON_CROP.n && col >= ICON_CROP.col && col < ICON_CROP.col + ICON_CROP.n);
}

// アイコンは Canvas で描いて PNG にする。180px は升目ごとに字を描き、48px 以下は字が潰れるので升目を濃さの四角で塗って人の形だけを見せる。
// 48px 以下は4倍で描いて縮め、四角の端をなめらかにする。
// ファビコンは地の角を丸めて --rule の細い線で囲み、ブラウザーのタブの地から浮かせる。ホーム画面のアイコンは角を丸めない。iOS が丸めるからである。
async function drawIcons(browser: Browser, glyphs: [number, number, string, number][]) {
  const page = await browser.newPage();
  await page.setContent('<!doctype html>');
  return page.evaluate(
    async ({ glyphs, crop, colors, font }) => {
      const draw = async (size: number, touch: boolean) => {
        const scale = size < 64 ? 4 : 1;
        const big = new OffscreenCanvas(size * scale, size * scale);
        const x = big.getContext('2d')!;
        x.scale(scale, scale);
        if (touch) {
          x.fillStyle = colors.paper;
          x.fillRect(0, 0, size, size);
        } else {
          const line = size / 32;
          x.beginPath();
          x.roundRect(line / 2, line / 2, size - line, size - line, size * 0.2);
          x.fillStyle = colors.paper;
          x.fill();
          x.strokeStyle = colors.rule;
          x.lineWidth = line;
          x.stroke();
        }
        const pad = touch ? size * 0.06 : 0;
        const cell = ((size - pad * 2) / crop.n) * (touch ? 1 : 0.92);
        const left = (size - cell * crop.n) / 2;
        const top = left + (touch ? 0 : size * 0.02);
        const lettered = size >= 120;
        x.fillStyle = colors.ink;
        x.font = `700 ${cell * 0.96}px ${font}`;
        x.textAlign = 'center';
        x.textBaseline = 'middle';
        for (const [row, col, char, alpha] of glyphs) {
          const px = left + (col - crop.col) * cell;
          const py = top + (row - crop.row) * cell;
          x.globalAlpha = Math.min(1, alpha * (lettered ? 1.25 : 1.15));
          if (lettered) x.fillText(char, px + cell / 2, py + cell / 2 + cell * 0.04);
          else x.fillRect(px, py, cell + 0.15 / scale, cell + 0.15 / scale);
        }
        const out = new OffscreenCanvas(size, size);
        const o = out.getContext('2d')!;
        o.imageSmoothingQuality = 'high';
        o.drawImage(big, 0, 0, size, size);
        return [...new Uint8Array(await (await out.convertToBlob({ type: 'image/png' })).arrayBuffer())];
      };
      return { favicons: await Promise.all([16, 32, 48].map((size) => draw(size, false))), touch: await draw(180, true) };
    },
    { glyphs, crop: ICON_CROP, colors: { paper: TOKENS.paper, ink: TOKENS.ink, rule: TOKENS.rule }, font: TOKENS['f-sans'] },
  );
}

// ICO は、6バイトの頭と画像ごとに16バイトの目録を置き、そのあとに PNG をそのまま並べる。PNG を入れた ICO は、主なブラウザーが読む。
function icoOf(images: { size: number; png: Buffer }[]): Buffer {
  const head = Buffer.alloc(6);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(images.length, 4);
  let offset = head.length + 16 * images.length;
  const entries = images.map(({ size, png }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size, 0);
    entry.writeUInt8(size, 1);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    return entry;
  });
  return Buffer.concat([head, ...entries, ...images.map(({ png }) => png)]);
}

// 左に入口の題と題の下の文、左下に入力の行、右に入口の絵を置く。文は docs/ui-guide.md の12節「ユーザーが直した文」のままである。
const OG_HTML = `<!doctype html><html lang="ja"><head><style>${ROOT_RULE}
* { box-sizing: border-box; }
body { margin: 0; width: 1200px; height: 630px; overflow: hidden; position: relative; background: var(--paper); color: var(--ink); font-family: var(--f-sans); }
h1 { margin: 0; font-family: var(--f-serif); font-weight: 700; font-size: 76px; line-height: 1.38; }
.lead { margin: 28px 0 0; color: var(--ink-2); font-size: 30px; line-height: 1.7; }
.ask { position: absolute; left: 72px; bottom: 64px; font-family: var(--f-mono); font-size: 34px; }
.gt { color: var(--shu); }
.caret { display: inline-block; width: 0.55em; height: 1.05em; vertical-align: -0.15em; margin-left: 0.15em; background: var(--ink); }
${kvBox(OG_KV)} #kv { position: absolute; right: 56px; top: 40px; }
</style></head><body>
<div style="position: absolute; left: 72px; top: 96px; width: 620px"><h1>「読みます」と<br>言うために。</h1><p class="lead">競技かるたにかかわるすべての人に、<br>読みを身近に。</p></div>
<div class="ask"><span class="gt">&gt;</span> /yomimasu<span class="caret"></span></div>
<div id="kv"></div>
</body></html>`;

async function drawOg(browser: Browser): Promise<Buffer> {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.setContent(OG_HTML);
  await page.evaluate(() => document.fonts.ready);
  await page.addScriptTag({ content: KV_SCRIPT });
  await page.addScriptTag({ content: stillScript(OG_KV.cell) });
  const error = await page.evaluate(() => document.getElementById('kv')!.dataset.kvError);
  if (error) throw new Error(`入口の絵を描けませんでした：${error}`);
  const png = await page.screenshot();
  await page.close();
  return png;
}

const browser = await chromium.launch();
try {
  const { favicons, touch } = await drawIcons(browser, await iconGlyphs(browser));
  writeFileSync(pathOf(`${OUT_DIR}/favicon.ico`), icoOf([16, 32, 48].map((size, i) => ({ size, png: Buffer.from(favicons[i]) }))));
  writeFileSync(pathOf(`${OUT_DIR}/apple-touch-icon.png`), Buffer.from(touch));
  writeFileSync(pathOf(`${OUT_DIR}/og.png`), await drawOg(browser));
} finally {
  await browser.close();
}
