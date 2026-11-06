import { soundOffset, type Card } from '../.claude/skills/yomimasu/scripts/cards.ts';
import {
  adviceSourceMark,
  finalSound,
  isGrand,
  isOneChar,
  isSixInitial,
  poemSourceText,
  PRIORITY_NOTE,
  rulePoints,
  sameStartLine,
  startsWithVowel,
  type Point,
  type SourceMark,
} from '../content/karuta/rules.ts';
import { cardMouthHtml } from '../content/karuta/mouth.ts';
import { pairLines, type Line } from './client/lyrics.ts';

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const escapeHtml = (text: string) => text.replace(/[&<>"]/g, (character) => HTML_ESCAPES[character]);

export const JOKA_NO = 0;

export const cardUrl = (no: number) => `/karuta/${no === JOKA_NO ? 'joka' : no}/`;

export const cardName = (card: Card) => card.kimariji?.kana ?? '序歌';

// 100首の一覧

// 読み方一覧（冊子 p.5-15）の音の順。札の数が同じ音どうしは、どちらの向きでもこの順を保つ（docs/ui-guide.md の7節）。
const LIST_HEADS = 'あなおわたこみはやよかいちひきうつしもゆむすめふさほせ';

export type ListGroup = { head: string; cards: Card[] };

// 分けるのは発音の最初の音である。44番「あふこ」と26番「をぐ」は「お」に入る。
export function kimarijiGroups(cards: readonly Card[], direction: 'desc' | 'asc'): ListGroup[] {
  const groups = [...LIST_HEADS].map((head) => ({
    head,
    cards: cards.filter((c) => c.kimariji?.sound[0] === head).sort((a, b) => (a.kimariji!.kana < b.kimariji!.kana ? -1 : 1)),
  }));
  const placed = groups.reduce((sum, g) => sum + g.cards.length, 0);
  if (placed !== cards.filter((c) => c.kimariji).length) throw new Error('決まり字の最初の音が一覧の音の順にない札がある');
  const byCount = (a: ListGroup, b: ListGroup) => (direction === 'desc' ? b.cards.length - a.cards.length : a.cards.length - b.cards.length);
  return groups.sort(byCount);
}

const cell = (card: Card, withNumber: boolean) =>
  `<a href="${cardUrl(card.no)}">${withNumber ? `<small>${card.no}番</small>` : ''}<b>${escapeHtml(cardName(card))}</b></a>`;

const groupsHtml = (groups: readonly ListGroup[]) =>
  groups
    .map((g) => `<h3 class="group-head"><b>${g.head}</b><small>${g.cards.length}首</small></h3><div class="kim-grid">${g.cards.map((c) => cell(c, false)).join('')}</div>`)
    .join('');

// 並べ方の切り替えは JS で行う。JS がないときは切り替えのボタンを隠し、最初の並べ方（決まり字順、多い→少ない）だけを出す。
export function listHtml(cards: readonly Card[]): string {
  const joka = cards.find((c) => c.no === JOKA_NO)!;
  const numbered = cards.filter((c) => c.no !== JOKA_NO).sort((a, b) => a.no - b.no);
  return [
    '<yomimasu-karuta-list>',
    '<div class="pair" role="group" aria-label="並べ方" data-controls hidden>',
    '<button class="btn" type="button" aria-pressed="true" data-order="kimariji">決まり字順</button>',
    '<button class="btn" type="button" aria-pressed="false" data-order="number">歌番号順</button>',
    '</div>',
    '<div class="pair" role="group" aria-label="決まり字順の向き" data-dirs hidden>',
    '<button class="btn" type="button" aria-pressed="true" data-dir="desc">多い→少ない</button>',
    '<button class="btn" type="button" aria-pressed="false" data-dir="asc">少ない→多い</button>',
    '</div>',
    `<div class="kim-grid"><a class="joka" href="${cardUrl(JOKA_NO)}"><b>${cardName(joka)}</b></a></div>`,
    `<div data-view="desc">${groupsHtml(kimarijiGroups(cards, 'desc'))}</div>`,
    `<div data-view="asc" hidden>${groupsHtml(kimarijiGroups(cards, 'asc'))}</div>`,
    `<div data-view="number" hidden><div class="kim-grid">${numbered.map((c) => cell(c, true)).join('')}</div></div>`,
    '</yomimasu-karuta-list>',
  ].join('\n');
}

// 余韻で伸ばす最後の音ごとの札の数。表が変わっても追いつくよう、書き写さずに組み立てのたびに数える。
export function finalSoundCounts(cards: readonly Card[]): string {
  const counts = new Map<string, number>();
  for (const { vowel } of cards.map(finalSound)) counts.set(vowel, (counts.get(vowel) ?? 0) + 1);
  const label = (vowel: string) => (vowel === 'ん' ? '「ん」' : `${vowel}段`);
  return ['あ', 'い', 'う', 'え', 'お', 'ん'].map((v) => `${label(v)} ${counts.get(v) ?? 0}首`).join('、');
}

// 本文の札の指し方。画面に歌番号を出さないので、文には {{札 番号}} と書き、決まり字のリンクに置き換える。
export function expandCardRefs(html: string, cards: readonly Card[]): string {
  return html.replace(/\{\{札((?: \d+)+)\}\}/g, (_, numbers: string) =>
    numbers
      .trim()
      .split(' ')
      .map((text) => {
        const card = cards.find((c) => c.no === Number(text));
        if (!card) throw new Error(`{{札 ${text}}} の札が札の読みの表にない`);
        return `<a class="kim-in" href="${cardUrl(card.no)}">${escapeHtml(cardName(card))}</a>`;
      })
      .join('、'),
  );
}

// 札ごとの助言の候補（スキルの references/card-advice-candidates.md の表）

// hiddenOn は、同じページの「気をつける点」と同じことを言うので、1首のページに出さない札である。'all' はどの札でも出さない。
export type Advice = { table: 'single' | 'group'; cards: number[]; group?: string; text: string; kind: string; source: string; hiddenOn?: 'all' | number[] };

function tableRows(markdown: string, heading: string): string[][] {
  const section = markdown.split(/^## /m).find((part) => part.startsWith(heading));
  if (!section) throw new Error(`助言の候補に「${heading}」の節がない`);
  return section
    .split('\n')
    .filter((line) => line.startsWith('|'))
    .slice(2)
    .map((line) => line.slice(1, -1).split('|').map((cell) => cell.trim()));
}

const cardNumbers = (text: string) =>
  text.split('、').map((part) => {
    if (!/^\d{1,3}$/.test(part)) throw new Error(`助言の候補の札「${text}」を番号として読めない`);
    return Number(part);
  });

export function parseAdvice(markdown: string): Advice[] {
  const single = tableRows(markdown, '1首ずつの助言').map((row) => {
    if (row.length !== 5) throw new Error(`助言の候補の行の列が5つでない：${row.join('|')}`);
    const [cards, , text, kind, source] = row;
    return { table: 'single' as const, cards: cardNumbers(cards), text, kind, source };
  });
  const group = tableRows(markdown, '何首かにまたがる助言').map((row) => {
    if (row.length !== 4) throw new Error(`助言の候補の行の列が4つでない：${row.join('|')}`);
    const [label, text, kind, source] = row;
    return { table: 'group' as const, cards: [], group: label, text, kind, source };
  });
  return hideRepeats([...single, ...group]);
}

// 1首のページの「気をつける点」と同じことを言う助言の行（2026-11-06 のユーザーの判断）。
// スキルは1首のページの項目を持たずに同じ表で答えるので、表からは消さず、1首のページにだけ出さない。
// 行は、札（または札の名指し）と文の頭と出典で指す。表の行が変わって1行に当たらなくなったら、組み立てを止める。
type Repeat = { cards?: number[]; group?: string; starts: string; source: string; on?: number[] };

const REPEATS: readonly Repeat[] = [
  { group: '大山札の6首', starts: '決まり字までが長いので読み急がない。', source: '講習資料 s.10' },
  { group: '初句が6字の8首', starts: '初句は長さではなく速さをそろえ、', source: '講習資料 s.18' },
  { cards: [15, 50], starts: '大山札の二句目の頭の高さは', source: '講習資料 s.11' },
  { cards: [64], starts: '決まり字までが長いので、「あさぼらけうじのかわぎり」を読み急がない', source: '講習資料 s.10' },
  // 42番は初句が5字で、初句6字の項目がないので出す。
  { cards: [42, 75], starts: '初句は長さではなく速さをそろえる。', source: '講習資料 s.18', on: [75] },
  { cards: [81], starts: '「おととぎす」に聞こえないよう', source: '講習資料 s.21' },
];

// 読手のメモの長音の一覧の行は、長音とハ行の読み替えの項目と同じ読みを言う。
// 54、77、95番の行は、メモの読みと読み方一覧の読みが違うことを言うので出す。
const CHOON_LIST = 'メモ1 長音の一覧';
const CHOON_KEPT = [54, 77, 95];

const sameCards = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((no, i) => no === b[i]);

function hideRepeats(advice: Advice[]): Advice[] {
  const hidden = new Map<Advice, Advice['hiddenOn']>();
  for (const repeat of REPEATS) {
    const rows = advice.filter(
      (a) =>
        (repeat.group ? a.group === repeat.group : a.table === 'single' && sameCards(a.cards, repeat.cards!)) &&
        a.text.startsWith(repeat.starts) &&
        a.source === repeat.source,
    );
    if (rows.length !== 1) throw new Error(`1首のページに出さない助言「${repeat.starts}」が、助言の候補の表の${rows.length}行に当たる`);
    hidden.set(rows[0], repeat.on ?? 'all');
  }
  const choonRows = advice.filter((a) => a.table === 'single' && a.source.split('、').includes(CHOON_LIST));
  for (const no of CHOON_KEPT) {
    if (!choonRows.some((a) => sameCards(a.cards, [no]))) throw new Error(`残す長音の一覧の助言（${no}番）が、助言の候補の表にない`);
  }
  for (const row of choonRows.filter((a) => !CHOON_KEPT.some((no) => sameCards(a.cards, [no])))) hidden.set(row, 'all');
  return advice.map((a) => (hidden.has(a) ? { ...a, hiddenOn: hidden.get(a) } : a));
}

// 何首かにまたがる助言の札の名指しを、規則に当てる。知らない名指しは組み立てを止める。
function groupIncludes(label: string, card: Card): boolean {
  if (label === '大山札の6首') return isGrand(card);
  if (label === '初句が6字の8首') return isSixInitial(card);
  if (label === '1字決まりの7首') return isOneChar(card);
  const some = label.match(/^1字決まりのうち([\d、]+)番$/);
  if (some) return cardNumbers(some[1]).includes(card.no);
  if (label.startsWith('1音目が母音の札')) return startsWithVowel(card);
  // 札を名指ししない助言は、1首のページに出さず、「ポイントを知る」で扱う。
  if (label === '名指しなし') return false;
  throw new Error(`助言の候補の札の名指し「${label}」を規則に当てられない`);
}

export function adviceFor(card: Card, advice: readonly Advice[]): Advice[] {
  return advice.filter((a) => (a.table === 'single' ? a.cards.includes(card.no) : groupIncludes(a.group!, card)));
}

const shownOn = (card: Card) => (a: Advice) => a.hiddenOn !== 'all' && !a.hiddenOn?.includes(card.no);

// 1首のページ

function lineHtml(line: Line): string {
  return line
    .map((token) => {
      if (token.nobi) return '<span class="nobi">ー</span>';
      if (token.yoin) return '<span class="yoin" role="img" aria-label="余韻">　</span>';
      const text = escapeHtml(token.text);
      return token.ruby ? `<ruby>${text}<rt>${escapeHtml(token.ruby)}</rt></ruby>` : text;
    })
    .join('');
}

// 「を」をどう読むかは、読み分けを読手に確かめるまで教科書に出さない（content/karuta/rules.ts の冒頭）。
// 表の発音は「を」をすべて「お」にしているので、ふりがなを作る前に「を」の読み替えを外し、発音の列の字も「を」に戻す。
// 仮名1字の「を」には読みが振られず、漢字の語（小倉山）の読みでは「を」の所が「を」のまま残る。
// 読む画面（lyrics.ts）のふりがなは変えない。docs/ui-guide.md の決まり（を→お）との食い違いはユーザーが決める。
function withoutWoReading(card: Card): Card {
  return {
    ...card,
    phrases: card.phrases.map((phrase) => {
      const wo = phrase.diffs.filter((d) => d.kana === 'を');
      const sound = [...phrase.sound];
      for (const d of wo) sound[soundOffset(phrase, d.at)] = 'を';
      return { ...phrase, sound: sound.join(''), diffs: phrase.diffs.filter((d) => d.kana !== 'を') };
    }),
  };
}

export function poemHtml(card: Card, cards: readonly Card[]): string {
  const { kami, shimo } = pairLines([withoutWoReading(card)], { shimo: card.no, kami: card.no });
  return [...kami, ...shimo].map((line, i) => `<div class="ln${i === kami.length ? ' break' : ''}">${lineHtml(line)}</div>`).join('');
}

const prioClass = (point: Point) => (point.priority === '高' ? 'prio prio--hi' : 'prio');

export type CardPage = { path: string; title: string; command: string; readName: string; bodyHtml: string };

// お手本の再生は JS で動くので、JS がないときはボタンを隠したままにする（100首の一覧の並べ方のボタンと同じ）。再生の印は SVG にする（docs/ui-guide.md の5節）。
const playHtml = (card: Card) =>
  `<yomimasu-karuta-play data-no="${card.no}"><button class="btn" type="button" data-echo hidden><svg class="ico" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 1l9 5-9 5z"/></svg><span>お手本を再生</span></button></yomimasu-karuta-play>`;

// 資料の名前と版は、ページごとに並べず「このアプリについて」の出典にまとめる。項目のそばには短い印だけを付ける（2026-11-06 のユーザーの判断）。
// 読手のメモの断り（読手個人のやり方、大会向けは参考程度）も項目ごとに書かず、「このアプリについて」に1か所で書く（2026-11-07 のユーザーの判断）。
const SOURCES_NOTE = '<p class="fine">出典と、読手メモの扱いは<a href="/about/#sources">このアプリについて</a>にまとめています。</p>';

// 印は段落の終わりに小さく付け、別の行にしない（docs/ui-guide.md の13節「教科書の出典」）。
const markHtml = ({ label, ref }: SourceMark) => `<span class="src"${ref ? ` data-ref="${escapeHtml(ref)}"` : ''}>— ${escapeHtml(label)}</span>`;

// 全部かほとんどの札に当たる点は、1首のページに並べず「ポイントを知る」へ案内する（content/karuta/rules.ts の冒頭）。
const COMMON_NOTE = '<p class="fine">全部の札に共通の点（余韻、四句の伸ばし、鼻濁音、仮名の読み方の決まりなど）は<a href="/point/">ポイントを知る</a>にあります。</p>';

// 出だしが同じ札の1行は、優先の印も出典の印も付けず、カードの最初の行に置く。
// 優先の断りは優先の印のある項目があるときだけ、カードは項目か出だしが同じ札があるときだけ出す。
function pointsSectionHtml(card: Card, cards: readonly Card[]): string[] {
  const points = rulePoints(card);
  const sameStart = sameStartLine(card, cards);
  const rows = [
    ...(sameStart ? [`<div><p>${escapeHtml(sameStart)}</p></div>`] : []),
    ...points.map(
      (p) => `<div><span class="${prioClass(p)}">優先 ${p.priority}</span><b>${escapeHtml(p.title)}</b><p>${escapeHtml(p.body)} ${markHtml({ label: p.source })}</p></div>`,
    ),
  ];
  return [
    '<h3>気をつける点</h3>',
    ...(points.length > 0 ? [`<p class="fine">${escapeHtml(PRIORITY_NOTE)}</p>`] : []),
    ...(rows.length > 0 ? [`<div class="card rows points">${rows.join('')}</div>`] : []),
    COMMON_NOTE,
  ];
}

export function cardPage(card: Card, cards: readonly Card[], advice: readonly Advice[]): CardPage {
  const name = cardName(card);
  const poemSource = poemSourceText(card);
  const words = adviceFor(card, advice).filter(shownOn(card));
  const wordsHtml = words.map((a) => `<div><p>${escapeHtml(a.text)}。 ${markHtml(adviceSourceMark(a.kind, a.source))}</p></div>`).join('');
  const article = [
    '<article class="karuta-page">',
    `<div class="card poem"><div class="tate">${poemHtml(card, cards)}</div><aside><div><small>${card.kimariji ? '決まり字' : '1枚目の前に読む歌'}</small><div class="kim">${escapeHtml(name)}</div></div></aside></div>`,
    ...(poemSource ? [`<p class="src">${escapeHtml(poemSource)}</p>`] : []),
    playHtml(card),
    ...pointsSectionHtml(card, cards),
    `<h3>余韻で伸ばす音「${escapeHtml(finalSound(card).kana)}」の口の形</h3>`,
    cardMouthHtml(card),
    ...(words.length > 0 ? ['<h3>言葉の助言</h3>', `<div class="card rows points">${wordsHtml}</div>`] : []),
    '</article>',
  ].join('\n');
  const body = [
    article,
    SOURCES_NOTE,
    '<!-- ask -->',
    '<p class="ask-q">次は？</p>',
    '<div class="next"><a class="btn btn--line" href="/karuta/">100首の一覧へ</a><a class="btn btn--fill" href="/read/">まず1回読む</a></div>',
  ].join('\n');
  return {
    path: `${cardUrl(card.no).slice(1)}index.html`,
    title: `1首 ${name}`,
    command: `1首 ${name}`,
    readName: `${name}.md`,
    bodyHtml: expandCardRefs(body, cards),
  };
}
