import { soundOffset, type Card } from '../.claude/skills/yomimasu/scripts/cards.ts';
import {
  adviceSourceText,
  finalSound,
  isGrand,
  isOneChar,
  isSixInitial,
  PRIORITY_NOTE,
  rulePoints,
  sourceLines,
  startsWithVowel,
  type Point,
} from '../content/karuta/rules.ts';
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

export type Advice = { table: 'single' | 'group'; cards: number[]; group?: string; text: string; kind: string; source: string };

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
  return [...single, ...group];
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

export function adviceFor(card: Card, advice: readonly Advice[], _cards: readonly Card[]): Advice[] {
  return advice.filter((a) => (a.table === 'single' ? a.cards.includes(card.no) : groupIncludes(a.group!, card)));
}

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

function sourcesHtml(card: Card, text: string): string {
  return `<h3>出典</h3>\n<div class="card sources">${sourceLines(card, text).map((line) => `<p>${escapeHtml(line)}</p>`).join('')}</div>`;
}

export type CardPage = { path: string; title: string; command: string; readName: string; bodyHtml: string };

export function cardPage(card: Card, cards: readonly Card[], advice: readonly Advice[]): CardPage {
  const name = cardName(card);
  const points = rulePoints(card, cards);
  const pointsHtml = points
    .map((p) => `<div><span class="${prioClass(p)}">優先 ${p.priority}</span><b>${escapeHtml(p.title)}</b><p>${escapeHtml(p.body)}</p><p class="src">${escapeHtml(p.source)}</p></div>`)
    .join('');
  const words = adviceFor(card, advice, cards);
  const wordsHtml = words.map((a) => `<div><p>${escapeHtml(a.text)}。</p><p class="src">${escapeHtml(adviceSourceText(a.kind, a.source))}</p></div>`).join('');
  const article = [
    '<article class="karuta-page">',
    `<div class="card poem"><div class="tate">${poemHtml(card, cards)}</div><aside><div><small>${card.kimariji ? '決まり字' : '1枚目の前に読む歌'}</small><div class="kim">${escapeHtml(name)}</div></div></aside></div>`,
    '<h3>気をつける点</h3>',
    `<p class="fine">${escapeHtml(PRIORITY_NOTE)}</p>`,
    `<div class="card rows points">${pointsHtml}</div>`,
    ...(words.length > 0 ? ['<h3>言葉の助言</h3>', `<div class="card rows points">${wordsHtml}</div>`] : []),
    '</article>',
  ].join('\n');
  const body = [
    article,
    sourcesHtml(card, article),
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
