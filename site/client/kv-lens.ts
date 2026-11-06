// 入口の絵の虫眼鏡（試作。docs/ui-guide.md の8節「入口の絵の虫眼鏡（試作）」）。
// 絵を長押しすると、指の下の升目の決まり字を、読める大きさで円の中に描く。押したまま動かすと付いてきて、離すと閉じる。

const HOLD_MS = 350;
const SLOP_PX = 8;
const DIAMETER = 176;
// 円の中の升目の大きさ。字はこの 0.96 倍（約 17px）で描く
const GLYPH = 18;
// 円は指で隠れないよう、指の上にずらす
const LIFT = DIAMETER / 2 + 28;
const MARGIN = 4;

export type LensHooks = { open(): void; close(): void };

type Press = { id: number; x: number; y: number; timer: number };

export function attachLens(element: HTMLElement, hooks: LensHooks): () => void {
  let press: Press | null = null;
  let lens: HTMLCanvasElement | null = null;

  const figure = () => element.querySelector<HTMLCanvasElement>('canvas');

  const place = (x: number, y: number) => {
    const canvas = figure();
    const painted = canvas && window.YomimasuKv.glyphsOf(canvas);
    if (!lens || !canvas || !painted) return;
    const radius = DIAMETER / 2;
    const cx = Math.min(innerWidth - radius - MARGIN, Math.max(radius + MARGIN, x));
    const cy = Math.min(innerHeight - radius - MARGIN, Math.max(radius + MARGIN, y - LIFT));
    lens.style.left = `${cx - radius}px`;
    lens.style.top = `${cy - radius}px`;

    const rect = canvas.getBoundingClientRect();
    const gx = (x - rect.left) / painted.cell;
    const gy = (y - rect.top) / painted.cell;
    const ctx = lens.getContext('2d')!;
    ctx.setTransform(lens.width / DIAMETER, 0, 0, lens.width / DIAMETER, 0, 0);
    ctx.clearRect(0, 0, DIAMETER, DIAMETER);
    ctx.fillStyle = painted.ink.color;
    ctx.font = `700 ${GLYPH * 0.96}px ${painted.ink.font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const [r, c, ch, alpha, card] of painted.list) {
      const dx = (c + 0.5 - gx) * GLYPH;
      const dy = (r + 0.5 - gy) * GLYPH;
      if (Math.hypot(dx, dy) > radius + GLYPH) continue;
      // 淡い升目の字も読めるよう、濃さに下限を置く。濃淡の順は絵と同じである
      ctx.globalAlpha = Math.max(alpha, 0.4);
      ctx.fillStyle = card ? painted.ink.card : painted.ink.color;
      ctx.fillText(ch, radius + dx, radius + dy + GLYPH * 0.04);
    }
    ctx.globalAlpha = 1;
  };

  const open = () => {
    if (!press || !figure() || !window.YomimasuKv.glyphsOf(figure()!)) return;
    hooks.open();
    lens = document.createElement('canvas');
    lens.className = 'kv-lens';
    lens.setAttribute('aria-hidden', 'true');
    const dpr = Math.min(devicePixelRatio || 1, 3);
    lens.width = lens.height = Math.round(DIAMETER * dpr);
    document.body.append(lens);
    place(press.x, press.y);
  };

  const release = () => {
    if (press) clearTimeout(press.timer);
    press = null;
    if (!lens) return;
    lens.remove();
    lens = null;
    hooks.close();
  };

  // 絵の Canvas には、なぞって回す処理（kv-live.js）がある。開いているあいだは、指の動きを虫眼鏡だけに渡す。
  // 開いているあいだに触れた2本目の指は、絵に渡さない（なぞって回す動きと、触って動かし直すことを止める）。
  // 押した指は要素に捕まえる。止めた絵には捕まえる処理がなく、マウスを絵の外で離すと閉じなかった（reviewer の指摘）
  const down = (event: PointerEvent) => {
    if (press) {
      if (lens) event.stopImmediatePropagation();
      return;
    }
    if (event.button !== 0) return;
    element.setPointerCapture(event.pointerId);
    press = { id: event.pointerId, x: event.clientX, y: event.clientY, timer: window.setTimeout(open, HOLD_MS) };
  };
  const move = (event: PointerEvent) => {
    if (!press || event.pointerId !== press.id) return;
    if (lens) {
      event.stopPropagation();
      place(event.clientX, event.clientY);
    } else if (Math.hypot(event.clientX - press.x, event.clientY - press.y) >= SLOP_PX) {
      release();
    }
  };
  const up = (event: PointerEvent) => {
    if (press && event.pointerId === press.id) release();
  };
  // 開いているあいだだけスクロールを止める。開く前の縦のなぞりは、ページのスクロールに任せる
  const touchMove = (event: TouchEvent) => {
    if (lens && event.cancelable) event.preventDefault();
  };
  // 長押しで出る端末のメニュー（Android の Chrome）を出さない。iOS の Safari は CSS の -webkit-touch-callout で切る
  const menu = (event: Event) => event.preventDefault();

  element.addEventListener('pointerdown', down, true);
  element.addEventListener('pointermove', move, true);
  element.addEventListener('pointerup', up, true);
  element.addEventListener('pointercancel', up, true);
  element.addEventListener('touchmove', touchMove, { passive: false });
  element.addEventListener('contextmenu', menu);
  return () => {
    release();
    element.removeEventListener('pointerdown', down, true);
    element.removeEventListener('pointermove', move, true);
    element.removeEventListener('pointerup', up, true);
    element.removeEventListener('pointercancel', up, true);
    element.removeEventListener('touchmove', touchMove);
    element.removeEventListener('contextmenu', menu);
  };
}
