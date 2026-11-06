import './kv-live.js';
import type { KvLive } from './kv-live.js';
import { attachLens } from './kv-lens.ts';

// 入口の題の下に置く、決まり字で組んだ読手の絵（docs/ui-guide.md の8節「入口の絵と「↓」」と、試作の「入口の絵の虫眼鏡（試作）」）。

// 決まり字の列は、組み立てのときに site/build.ts が札の読みの表から作って入れる（site/kimariji-stream.ts）。
declare const __KIMARIJI_STREAM__: string;

const { mount, still, LOOP, READ_T } = window.YomimasuKv;
// tapGyro: false で、iOS で絵をたたいても傾きの許可を求めない（「初めての人を止めない」）。
// 升目を細かくした試作では、升目1つを 2×2 の画素で写す。3×3 のままでは写す画素が升目の数に比例して増え、1コマが重い。
const OPTIONS = { stream: __KIMARIJI_STREAM__, fps: 20, layout: 'tate', tapGyro: false, ss: 2 } as const;
// 3周（36秒）動いたら読む場面で止め、触ったらまた3周動かす。動かし続けると、入口を開いたままの端末が熱を持つ。
const STOP_MS = LOOP * 3 * 1000;

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
// 試作：段の数を #41 の版（clamp(floor(高さ / 32), 8, 11)）の約2倍にして、机や読唱箱の形が出るようにする。字は読めない大きさになるので、虫眼鏡で読ませる
const cellFor = (height: number) => Math.min(6, Math.max(4, Math.round(height / 64)));

// 誘いの文は、一度虫眼鏡を開いたら、その端末では出さない。覚えられない環境では、毎回出るだけである
const LENS_DONE = 'yomimasu.kvLensDone';
const lensDone = () => {
  try {
    return localStorage.getItem(LENS_DONE) === '1';
  } catch {
    return false;
  }
};
const rememberLens = () => {
  try {
    localStorage.setItem(LENS_DONE, '1');
  } catch {
    // 覚えられなくても、虫眼鏡は使える
  }
};

export function mountKv(element: HTMLElement): () => void {
  const screen = element.parentElement!;
  const items = [...screen.querySelectorAll<HTMLElement>('.menu a')];
  let figure: KvLive | null = null;
  let cell = 0;
  let stillKey = '';
  let stopTimer = 0;
  let started = false;
  let typing = false;
  let playing = false;
  let playingBeforeLens = false;
  let hideMore = () => {};
  let invite: HTMLElement | null = null;

  // 高さは CSS の clamp で決め、先頭の項目の下端（絵の高さを除く）に 24px を足した値だけを、ここで測って渡す。
  // 画面の高さを CSS の 100svh に任せるのは、iOS の Safari でアドレスバーが縮んでも、絵の高さを変えないためである。
  const fit = () => {
    const first = items[0].getBoundingClientRect();
    const rest = first.bottom + scrollY - element.getBoundingClientRect().height + 24;
    element.style.setProperty('--kv-rest', `${rest}px`);
    return cellFor(element.clientHeight);
  };

  const drawStill = () => {
    const key = `${element.clientWidth}x${element.clientHeight}:${cell}`;
    if (key === stillKey) return;
    stillKey = key;
    element.querySelector('canvas')?.remove();
    still(element, { ...OPTIONS, cell, time: READ_T });
  };

  const stopLater = () => {
    clearTimeout(stopTimer);
    stopTimer = window.setTimeout(() => {
      playing = false;
      figure?.set({ playing: false, time: READ_T });
    }, STOP_MS);
  };

  const start = () => {
    started = true;
    cell = fit();
    // 動きを減らす設定では、傾きでも回さないよう、動かす版を作らずに止めた1コマを描く。
    figure = reduced() ? null : mount(element, { ...OPTIONS, cell });
    element.dataset.kv = figure ? 'live' : 'still';
    playing = !!figure;
    if (figure) stopLater();
    else drawStill();
    hideMore = showMore(items.at(-1));
    if (!lensDone()) {
      invite = document.createElement('p');
      invite.className = 'kv-invite';
      invite.setAttribute('aria-hidden', 'true');
      invite.append('読手くんのカラダ、何でできていると思いますか？', document.createElement('br'), '長押しで拡大してみてください！');
      element.append(invite);
    }
  };

  // iOS の Safari はアドレスバーの出し入れでも resize を送る。升目が変わらなければ、枠の大きさの変化はスクリプトが追う。
  const resize = () => {
    if (!started) return;
    const next = fit();
    const changed = next !== cell;
    cell = next;
    if (!figure) drawStill();
    else if (changed) figure.set({ cell });
  };

  const resume = () => {
    if (!figure || typing) return;
    playing = true;
    figure.set({ playing: true });
    stopLater();
  };

  // 虫眼鏡を開いているあいだは絵を止め、閉じたら開く前の状態に戻す。
  const detachLens = attachLens(element, {
    open() {
      playingBeforeLens = playing;
      clearTimeout(stopTimer);
      figure?.hold();
      figure?.set({ playing: false });
      playing = false;
      invite?.remove();
      invite = null;
      rememberLens();
    },
    close() {
      figure?.release();
      if (playingBeforeLens) resume();
    },
  });

  // 殻（ui/shell.ts）の動きのあいだは描かない。打ち込み始めると .ask に is-sent が付き、
  // 入口へ入れ替えて題を流すあいだは、絵に is-held が付いて隠れている。
  const watch = new MutationObserver(() => {
    if (!started && !element.classList.contains('is-held')) start();
    if (!typing && screen.querySelector('.ask.is-sent')) {
      typing = true;
      playing = false;
      clearTimeout(stopTimer);
      figure?.set({ playing: false });
    }
  });
  watch.observe(screen, { subtree: true, attributes: true, attributeFilter: ['class'] });
  if (!element.classList.contains('is-held')) start();

  addEventListener('resize', resize);
  element.addEventListener('pointerdown', resume);
  return () => {
    detachLens();
    watch.disconnect();
    removeEventListener('resize', resize);
    element.removeEventListener('pointerdown', resume);
    clearTimeout(stopTimer);
    figure?.destroy();
    hideMore();
  };
}

// 一覧の最後の項目が最初の画面からはみ出すときだけ、下端の中央に「↓」を出す。押せない印で、スクロールが始まったら消し、上へ戻っても出し直さない。
// 本文の外（body）に置くのは、入れ替えの動き（.fade-in の transform）の中では position: fixed が画面に留まらないからである。
function showMore(last: HTMLElement | undefined): () => void {
  if (!last || scrollY > 0 || last.getBoundingClientRect().bottom <= innerHeight) return () => {};
  const more = document.createElement('div');
  more.className = 'kv-more';
  more.setAttribute('aria-hidden', 'true');
  more.textContent = '↓';
  document.body.append(more);
  const hide = () => {
    if (scrollY <= 0) return;
    more.classList.add('gone');
    removeEventListener('scroll', hide);
  };
  addEventListener('scroll', hide, { passive: true });
  return () => {
    removeEventListener('scroll', hide);
    more.remove();
  };
}
