// AI に入れる画面（/install/ と手順の4画面）を組み立てる部品。画面の決まりは docs/ui-guide.md の8節「AI に入れる」にある。

export type InstallTarget = { path: string; label: string; note?: string };

// 入れる先を尋ねる画面に出す選択肢で、並べる順もこの順である。ここだけで出し分ける。
// 出すのは、ユーザーがその AI に入れて、答えることを確かめたものだけにする（ガイド8節、要件 F5）。答えなかった AI は行を消す。
// 行を消した入れる先は、手順の画面も組み立てない。URL を知っていれば開ける手順を残すと、確かめていない入れ方を案内することになる。
export const INSTALL_TARGETS: readonly InstallTarget[] = [
  { path: '/install/claude/', label: 'Claude' },
  { path: '/install/chatgpt/', label: 'ChatGPT' },
  { path: '/install/gemini/', label: 'Gemini' },
  { path: '/install/agent/', label: 'コーディングエージェント', note: 'Claude Code、Codex、Cursor など' },
];

const PROCEDURE = /^\/install\/[^/]+\/$/;

export const isOffered = (url: string): boolean => !PROCEDURE.test(url) || INSTALL_TARGETS.some((target) => target.path === url);

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const escapeHtml = (text: string) => text.replace(/[&<>"]/g, (character) => HTML_ESCAPES[character]);

// 選択肢はリンクにして、JS がなくても手順の画面へ移れるようにする。data-label は、選んだあとに問いの下へ出す答えである。
export function pickOptionsHtml(): string {
  return INSTALL_TARGETS.map(({ path, label, note }, i) => {
    const text = `${i + 1}. ${escapeHtml(label)}`;
    const inner = note ? `<span>${text}</span><small>${escapeHtml(note)}</small>` : text;
    return `<a class="btn" href="${path}" data-label="${escapeHtml(label)}">${inner}</a>`;
  }).join('\n');
}

// 各社の画面の略図。画面を写さず、ロゴも使わない。窓、左の列、見出し、押すボタン、メニューだけを描き、押す場所を朱の枠で囲んで、押す順の番号を付ける。
// 押す場所の名前は画面の文字のままにし、ほかの項目は場所の手がかりになる1〜2個に絞る。名前とたどる順は 2026-11-04 に確かめた画面のものである。
type Item = { t: string; n?: number };
type Row = { title?: string; tabs?: Item[]; action?: Item; toggle?: string; n?: number };
type Sketch = { host: string; alt: string; side: Item[]; rows: Row[]; menu?: Item[] };

export const SKETCHES: Record<string, Sketch> = {
  'claude-code': {
    host: 'claude.ai',
    alt: 'Claude の設定の略図。左の「機能」を開き、「クラウドでコードを実行」をオンにする',
    side: [{ t: '一般' }, { t: '使用量' }, { t: '機能', n: 1 }],
    rows: [{ title: '機能' }, { toggle: 'クラウドでコードを実行', n: 2 }],
  },
  'claude-upload': {
    host: 'claude.ai',
    alt: 'Claude の略図。左の「カスタマイズ」、「Skills」、「＋追加」、「Skills をアップロード」の順に押す',
    side: [{ t: '新規作成' }, { t: 'カスタマイズ', n: 1 }],
    rows: [{ title: 'カスタマイズ' }, { tabs: [{ t: 'Skills', n: 2 }], action: { t: '＋ 追加', n: 3 } }],
    menu: [{ t: 'Skills をアップロード', n: 4 }, { t: 'Skills を作成' }],
  },
  'chatgpt-upload': {
    host: 'chatgpt.com',
    alt: 'ChatGPT の略図。左の「プラグイン」、「スキル」、「追加」、「コンピューターからアップロード」の順に押す',
    side: [{ t: 'プラグイン', n: 1 }, { t: 'スキル', n: 2 }],
    rows: [{ title: 'スキル', action: { t: '追加 ▾', n: 3 } }],
    menu: [{ t: 'チャットで作成' }, { t: 'エディターで作成' }, { t: 'コンピューターからアップロード', n: 4 }],
  },
  // ウェブの ChatGPT では、自分で上げたスキルは画面の上の「Work」でだけ使われ、ふだんの「Chat」では使われない（2026-11-06 に確かめた）。
  'chatgpt-work': {
    host: 'chatgpt.com',
    alt: 'ChatGPT の略図。画面の上の「Chat」と「Work」のうち、「Work」を押して切り替える',
    side: [{ t: 'プラグイン' }],
    rows: [{ tabs: [{ t: 'Chat' }, { t: 'Work', n: 1 }] }],
  },
  'gemini-upload': {
    host: 'gemini.google.com',
    alt: 'Gemini の略図。左の「カスタマイズ」、「スキル」、「作成」、「アップロード」の順に押す',
    side: [{ t: 'ライブラリ' }, { t: 'カスタマイズ', n: 1 }],
    rows: [{ tabs: [{ t: '見つける' }, { t: 'スキル', n: 2 }] }, { title: 'スキル', action: { t: '作成 ▾', n: 3 } }],
    menu: [{ t: 'Gemini で作成' }, { t: '手動で作成' }, { t: 'アップロード', n: 4 }],
  },
};

// 文字と番号は viewBox で 15.2 にする。図は番号の列の下まで広げて、320px の画面で幅 258px になり、文字は 13px を下回らない。
// 手順の列の幅のままでは、320px で 11px まで縮んだ（ガイド8節「図」）。
const W = 300;
const F = 15.2;
const TOP = 30;
const ROW = 30;

// 字の幅は書体で変わるので、半角は 0.6 字、全角は 1 字と見積もる。見積もりで箱を作るので、長い名前ほど右に余白が残る。
const textW = (text: string, size = F) => [...text].reduce((w, ch) => w + (ch.codePointAt(0)! < 0x2000 ? 0.6 : 1) * size, 0);

export function sketchSvg(spec: Sketch): string {
  const parts: string[] = [];
  const marks: { n: number; x: number; y: number; w: number; h: number }[] = [];
  const label = (x: number, y: number, text: string, style = '') => parts.push(`<text x="${x}" y="${y}" style="font-size:${F}px;${style}">${escapeHtml(text)}</text>`);
  const mark = (item: { n?: number }, x: number, y: number, w: number, h: number) => {
    if (item.n) marks.push({ n: item.n, x, y, w, h });
  };
  const sideW = Math.ceil(Math.max(...spec.side.map((item) => textW(item.t))) + 24);
  const mainX = sideW + 12;
  let bottom = TOP;
  spec.side.forEach((item, i) => {
    const y = TOP + 10 + i * 34;
    label(12, y + 20, item.t, 'fill:var(--ink-2)');
    mark(item, 4, y, sideW - 8, ROW);
    bottom = Math.max(bottom, y + ROW);
  });
  const sideBottom = bottom;
  let y = TOP + 10;
  let menuTop = 0;
  let menuRight = W - 10;
  for (const row of spec.rows) {
    if (row.title) label(mainX, y + 21, row.title, 'font-size:16px;font-weight:700;fill:var(--ink)');
    if (row.tabs) {
      let x = mainX;
      for (const tab of row.tabs) {
        const w = textW(tab.t) + 20;
        parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${ROW}" rx="8" style="fill:var(--paper);stroke:var(--rule-2)"/>`);
        label(x + 10, y + 20, tab.t, 'fill:var(--ink-2)');
        mark(tab, x, y, w, ROW);
        x += w + 6;
      }
    }
    if (row.action) {
      const w = textW(row.action.t) + 24;
      const x = W - 10 - w;
      parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${ROW}" rx="15" style="fill:var(--ink)"/>`);
      label(x + 12, y + 20, row.action.t, 'fill:var(--card)');
      mark(row.action, x, y, w, ROW);
      menuTop = y + ROW + 6;
      menuRight = x + w;
    }
    if (row.toggle) {
      label(mainX, y + 20, row.toggle, 'fill:var(--ink)');
      const tx = W - 10 - 30;
      parts.push(`<rect x="${tx}" y="${y + 7}" width="30" height="16" rx="8" style="fill:var(--ink)"/><circle cx="${tx + 22}" cy="${y + 15}" r="6" style="fill:var(--card)"/>`);
      mark(row, mainX - 6, y, W - mainX - 2, ROW);
    }
    bottom = Math.max(bottom, y + ROW);
    y += ROW + 10;
  }
  if (spec.menu) {
    const w = Math.max(...spec.menu.map((item) => textW(item.t))) + 24;
    const x = menuRight - w;
    // 左の列にかかる幅のメニューは、左の列の項目の下へ下げる。重ねると、左の列の押す場所が隠れた。
    if (x < sideW) menuTop = Math.max(menuTop, sideBottom + 8);
    const h = spec.menu.length * 32 + 8;
    parts.push(`<rect x="${x}" y="${menuTop}" width="${w}" height="${h}" rx="10" style="fill:var(--card);stroke:var(--rule)"/>`);
    spec.menu.forEach((item, i) => {
      const iy = menuTop + 4 + i * 32;
      label(x + 12, iy + 21, item.t, 'fill:var(--ink)');
      mark(item, x + 4, iy, w - 8, ROW);
    });
    bottom = Math.max(bottom, menuTop + h);
  }
  const H = bottom + 14;
  const frame =
    `<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="10" style="fill:var(--card);stroke:var(--rule)"/>` +
    `<path d="M1 ${TOP + 0.5}H${W - 1}" style="stroke:var(--rule-2)"/>` +
    `<path d="M1 ${TOP + 1}H${sideW}V${H - 1}H11a10 10 0 0 1-10-10z" style="fill:var(--paper)"/>` +
    [14, 26, 38].map((cx) => `<circle cx="${cx}" cy="15" r="3.5" style="fill:var(--rule)"/>`).join('') +
    `<text x="52" y="20" style="font-size:${F}px;font-family:var(--f-mono);fill:var(--ink-3)">${escapeHtml(spec.host)}</text>`;
  const rings = marks.map((m) => `<rect x="${m.x}" y="${m.y}" width="${m.w}" height="${m.h}" rx="8" style="fill:none;stroke:var(--shu);stroke-width:2"/>`).join('');
  const badges = marks
    .map((m) => {
      const cx = Math.min(m.x + m.w, W - 12);
      const cy = Math.max(m.y, 12);
      return `<circle cx="${cx}" cy="${cy}" r="12" style="fill:var(--shu)"/><text x="${cx}" y="${cy + 5}" text-anchor="middle" style="font-size:${F}px;font-weight:700;font-family:var(--f-mono);fill:var(--on-shu)">${m.n}</text>`;
    })
    .join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeHtml(spec.alt)}" style="font-family:var(--f-sans)">${frame}${parts.join('')}${rings}${badges}</svg>`;
}

// content/ の Markdown に置く印と、組み立てで差し込む HTML。図の印は <!-- 図 claude-code --> の形で書く。
export const INSTALL_MARKS: Record<string, () => string> = {
  '<!-- 入れる先 -->': pickOptionsHtml,
  ...Object.fromEntries(Object.entries(SKETCHES).map(([name, spec]) => [`<!-- 図 ${name} -->`, () => `<figure class="sketch">${sketchSvg(spec)}</figure>`])),
};
