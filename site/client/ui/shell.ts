import { commandAt, sayOfButton } from '../../../.claude/skills/yomimasu/scripts/commands.ts';
import './shell.css';

// 押したものをターミナルに打ち込み、ひと呼吸置いてから本文を入れ替える殻（docs/ui-guide.md の8節）。
// ページを読み直さずに main の中だけを入れ替えるので、録音のように端末のメモリーにしかないものを次の画面へ渡せる。
// 横取りするのはリンクと「戻る」だけで、画面の中のボタン（並べ方、再生、録音など）は各画面の部品のまま、すぐ動く。
// 音を鳴らすボタンを遅らせて押し直すと、iOS の Safari は利用者の操作として扱わず、音が出ないおそれがある。打ち込む形をボタンにつなぐのは別の作業（Y-18）である。

const PROMPT = '/yomimasu ';
const TYPE_MS = 280;
const HOLD_MS = 90;
const LINE_MS = 110;
const CHARS_PER_SEC = 30;

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, Math.max(0, ms)));
const pathOf = (url: URL | Location) => url.pathname + url.search;

// 札の読みの表は大きいので、札の名前が要るコマンド（1首、読む）を引くときまで読み込まない。
type NameOf = (card: string) => string | undefined;
let names: Promise<NameOf> | undefined;
const NO_NAME: NameOf = () => undefined;
// 読み込めないとき（開いたままのタブで、配信が新しい版に替わったあとなど）は、リンクの文字を打ち込んで移る。次に押したときにまた読み込みを試す。
const cardNames = () =>
  (names ??= import('./card-names.ts').then(
    (m) => m.cardNameAt,
    () => {
      names = undefined;
      return NO_NAME;
    },
  ));
const ANY_NAME: NameOf = () => '';

async function commandFor(href: string) {
  const needsNames = !commandAt(href, NO_NAME) && commandAt(href, ANY_NAME);
  return commandAt(href, needsNames ? await cardNames() : NO_NAME);
}

// 打ち込む先は入力の行で、入力の行のない画面（聞く、100首の一覧など）では実行の行である。
type Terminal = { line: HTMLElement; ask: HTMLElement | null };

function terminal(): Terminal | null {
  const typed = document.querySelector<HTMLElement>('main [data-typed]');
  if (typed) return { line: typed, ask: typed.closest<HTMLElement>('.ask') };
  const run = document.querySelector<HTMLElement>('main [data-run]');
  return run && { line: run, ask: null };
}

// 字数によらず 280ms で打ち込み、90ms 置く。打ち込む先のない画面でも、ひと呼吸は同じに置く。
async function typeIn(text: string, fresh = false): Promise<Terminal | null> {
  if (reduced()) return null;
  const term = terminal();
  term?.ask?.classList.add('is-sent');
  if (term) term.line.textContent = fresh ? '' : PROMPT;
  const chars = [...text];
  const begin = performance.now();
  for (const [i, char] of chars.entries()) {
    if (term) term.line.textContent += char;
    await wait(begin + (TYPE_MS * (i + 1)) / chars.length - performance.now());
  }
  await wait(HOLD_MS);
  return term;
}

// 画面が変わらずに終わった操作のあとは、入力の行を空に戻す。実行の行は最後のコマンドを残す。
function settle(term: Terminal | null) {
  if (!term?.ask) return;
  term.ask.classList.remove('is-sent');
  term.line.textContent = PROMPT;
}

// 冒頭の文のかたまり（最初の帯・枠・ボタンより上にある文）だけを1秒に30字で流し、残りは流し終えてからまとめて浮かべる。
// 流しているあいだ、まだ出していない文は場所も取らない。残りは場所を取ったまま隠し、帯や歌の枠が隠れたままでも寸法を測れるようにする。
// Markdown は段落の中にカスタム要素（帯の図など）を入れることがあるので、中に文の飾りのほかの要素がある段落は文として扱わない。
const LEAD = 'h1, h2, h3, p, .big-num';
const PHRASING = 'a:not(.btn), b, br, code, em, i, rp, rt, ruby, small, span, strong';
const isLead = (el: Element): boolean =>
  (el.matches(LEAD) && [...el.querySelectorAll('*')].every((child) => child.matches(PHRASING))) ||
  (el.localName === 'section' && el.children.length > 0 && [...el.children].every(isLead));

function textsOf(el: Element): [Text, string][] {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const texts: [Text, string][] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) if (node.nodeValue?.trim()) texts.push([node as Text, node.nodeValue]);
  return texts;
}

function prepare(lead: readonly Element[], rest: readonly Element[]) {
  const parts = lead.map((el) => ({ el, texts: textsOf(el) }));
  for (const { el, texts } of parts) {
    el.classList.add('is-pending');
    for (const [node] of texts) node.nodeValue = '';
  }
  for (const el of rest) el.classList.add('is-held');
  const total = parts.reduce((sum, { texts }) => sum + texts.reduce((n, [, value]) => n + value.length, 0), 0);

  // 1本の時計で全体の進みを決める。要素ごとに待つと、要素の数だけ1フレームずつ遅れる。
  const stream = (alive: () => boolean) =>
    new Promise<void>((resolve) => {
      const begin = performance.now();
      const tick = (now: number) => {
        if (!alive()) return resolve();
        const done = now - begin >= (total * 1000) / CHARS_PER_SEC;
        let left = done ? total : Math.floor(((now - begin) * CHARS_PER_SEC) / 1000) + 1;
        for (const { el, texts } of parts) {
          if (left > 0 || done) el.classList.remove('is-pending');
          for (const [node, value] of texts) {
            node.nodeValue = value.slice(0, Math.max(0, left));
            left -= value.length;
          }
        }
        if (done) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });

  return async (alive: () => boolean) => {
    if (total > 0) await stream(alive);
    if (!alive()) return;
    for (const el of rest) {
      el.classList.remove('is-held');
      el.classList.add('fade-in');
    }
  };
}

// 本文を入れ替えたときの出し方：実行の行、110ms 後に読んだ行、さらに 110ms 後に冒頭の文を流す。
async function reveal(screen: Element) {
  const alive = () => screen.isConnected;
  const reads = [...screen.querySelectorAll('.run .read')];
  const blocks = [...screen.children].filter((el) => !el.matches('.run'));
  const split = blocks.findIndex((el) => !isLead(el));
  const play = prepare(split < 0 ? blocks : blocks.slice(0, split), split < 0 ? [] : blocks.slice(split));
  for (const read of reads) read.classList.add('is-held');
  await wait(LINE_MS);
  for (const read of reads) read.classList.remove('is-held');
  await wait(LINE_MS);
  if (alive()) await play(alive);
}

async function load(url: URL): Promise<Document | null> {
  try {
    const response = await fetch(pathOf(url), { headers: { accept: 'text/html' } });
    if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) return null;
    const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
    return doc.querySelector('main') ? doc : null;
  } catch {
    return null;
  }
}

// 画面の部品はカスタム要素なので、差し込んだ時点で動き出し、外した時点で止まる（client/main.ts）。
// 表示している画面か、戻る・進む操作で表示しようとしている画面。続けて戻る・進むを押したとき、URL と本文が食い違わないようにする。
let shown = pathOf(location);
let generation = 0;
let busy = false;
let backWithMotion = false;

function prefetchNames() {
  if (document.querySelector('main a[href^="/karuta/"]:not([href="/karuta/"]), main yomimasu-listen')) void cardNames();
}

// 押したリンクは入れ替えで消えるので、焦点を main へ移す。移さないと body に落ち、次の Tab が画面の先頭から始まらない。
function swap(doc: Document, url: URL) {
  const main = document.querySelector('main')!;
  main.replaceChildren(...doc.querySelector('main')!.childNodes);
  document.title = doc.title;
  main.focus({ preventScroll: true });
  shown = pathOf(url);
  prefetchNames();
}

function scrollAfter(url: URL, y: number) {
  const target = url.hash && document.getElementById(decodeURIComponent(url.hash.slice(1)));
  if (target) target.scrollIntoView();
  else scrollTo(0, y);
}

type Arrival = { push: boolean; motion: boolean; scrollY?: number };

async function arrive(url: URL, page: Promise<Document | null>, mine: number, { push, motion, scrollY = 0 }: Arrival) {
  const doc = await page;
  if (mine !== generation) return;
  busy = false;
  if (!doc) {
    if (push) location.assign(url.href);
    else location.reload();
    return;
  }
  if (push) {
    history.replaceState({ ...history.state, scrollY: window.scrollY }, '');
    history.pushState({ prev: shown }, '', url.href);
  }
  swap(doc, url);
  if (!motion) return scrollAfter(url, scrollY);
  scrollTo(0, 0);
  await reveal(document.querySelector('main .screen')!);
  if (mine === generation && url.hash) scrollAfter(url, 0);
}

async function follow(link: HTMLAnchorElement, url: URL) {
  const mine = ++generation;
  busy = true;
  const page = load(url);
  if (url.pathname === '/') {
    // 入口へは、入力の行を空にして /yomimasu だけを打ち込む。
    await typeIn(PROMPT.trim(), true);
  } else {
    // 画面の中だけの文字（ランダムに出題する → 読む ランダム）を先に見て、なければ行き先のコマンドを、それもなければリンクの文字を打ち込む。
    const label = link.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    const inScreen = sayOfButton(label);
    await typeIn(inScreen !== label ? inScreen : ((await commandFor(url.href))?.say ?? label));
  }
  await arrive(url, page, mine, { push: pathOf(url) !== shown, motion: !reduced() });
}

// リンクを押さずに移る（読み終えたあとの結果の画面など）。打ち込みは呼ぶ側が済ませているので、取ってきたらすぐ入れ替える。
export function go(href: string) {
  const url = new URL(href, location.href);
  const mine = ++generation;
  busy = true;
  void arrive(url, load(url), mine, { push: pathOf(url) !== shown, motion: !reduced() });
}

const TOP = () => new URL('/', location.href);

// 「戻る」は Claude Code の質問（AskUserQuestion）と同じ順に動かす。行き先が入口しかないときは尋ねずに移る（docs/ui-guide.md の8節「戻る」）。
async function back(button: HTMLElement) {
  const mine = ++generation;
  busy = true;
  // 前の画面は、この殻が開いた画面にだけ履歴に残してある。URL を直接開いた画面にはない。
  const prev: string | undefined = history.state?.prev;
  if (!prev) {
    const page = load(TOP());
    await typeIn(sayOfButton('戻る'));
    await arrive(TOP(), page, mine, { push: true, motion: !reduced() });
    return;
  }
  const term = await typeIn(sayOfButton('戻る'));
  if (mine !== generation) return;
  busy = false;
  if (prev !== '/') return askWhere(button, term, prev);
  // 入口へは履歴を戻って移るので、ブラウザーの進む操作で元の画面に戻れる。
  backWithMotion = true;
  history.back();
}

async function askWhere(button: HTMLElement, term: Terminal | null, prev: string) {
  const group = button.closest<HTMLElement>('.ask') ?? button.closest<HTMLElement>('.back-row')!;
  const covered = [...group.children].filter((el): el is HTMLElement => el instanceof HTMLElement && !el.matches('.ask-line'));
  const prevCommand = await commandFor(prev);
  const options: [string, string][] = [
    ['prev', `1つ前のページ（${prevCommand?.read ?? prevCommand?.say ?? prev}）`],
    ['top', 'トップページ'],
  ];
  const box = document.createElement('div');
  box.className = 'auq';
  box.setAttribute('role', 'group');
  box.setAttribute('aria-label', 'どこに戻りますか？');
  const question = document.createElement('p');
  question.className = 'auq-q';
  question.textContent = 'どこに戻りますか？';
  const choices = document.createElement('div');
  choices.className = 'auq-opts';
  for (const [i, [to, label]] of options.entries()) choices.append(choice(`${i + 1}. ${label}`, to, label, 'btn'));
  choices.append(choice('キャンセル', 'cancel', 'キャンセル', 'btn btn--line'));
  box.append(question, choices);
  for (const el of covered) el.hidden = true;
  group.append(box);
  if (!reduced()) await prepare([question], [choices])(() => box.isConnected);
  choices.querySelector('button')?.focus();

  box.addEventListener('click', async (event) => {
    const picked = (event.target as Element).closest<HTMLButtonElement>('button[data-to]');
    if (!picked || busy) return;
    // キャンセルは止める操作なので、打ち込まずにすぐ閉じる。
    if (picked.dataset.to === 'cancel') {
      box.remove();
      for (const el of covered) el.hidden = false;
      settle(term);
      button.focus();
      return;
    }
    const answer = document.createElement('p');
    answer.className = 'auq-a';
    answer.textContent = `❯ ${picked.dataset.label}`;
    box.replaceChildren(question, answer);
    const mine = ++generation;
    busy = true;
    const page = picked.dataset.to === 'top' ? load(TOP()) : null;
    if (!reduced()) await wait(TYPE_MS + HOLD_MS);
    if (mine !== generation) return;
    if (!page) {
      busy = false;
      backWithMotion = true;
      history.back();
      return;
    }
    await arrive(TOP(), page, mine, { push: true, motion: !reduced() });
  });
}

function choice(text: string, to: string, label: string, className: string) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.dataset.to = to;
  button.dataset.label = label;
  button.textContent = text;
  return button;
}

document.addEventListener('click', (event) => {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const link = (event.target as Element).closest?.('a[href]');
  if (!(link instanceof HTMLAnchorElement) || link.target || link.hasAttribute('download')) return;
  const url = new URL(link.href);
  // 画面は / で終わる URL にある。ファイルや外のページ、同じ画面の中の見出しへのリンクはブラウザーに任せる。
  if (url.origin !== location.origin || !url.pathname.endsWith('/') || (pathOf(url) === shown && url.hash)) return;
  event.preventDefault();
  if (busy) return;
  if (link.matches('[data-back]')) void back(link);
  else void follow(link, url);
});

// ブラウザーの戻る・進む操作では動きを出さない。「戻る」の質問から選んだときだけ、押して開いたときと同じに出す。
addEventListener('popstate', () => {
  if (pathOf(location) === shown) return;
  shown = pathOf(location);
  const url = new URL(location.href);
  const motion = backWithMotion && !reduced();
  backWithMotion = false;
  const mine = ++generation;
  void arrive(url, load(url), mine, { push: false, motion, scrollY: history.state?.scrollY });
});

prefetchNames();
