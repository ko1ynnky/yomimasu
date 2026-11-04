import { type Card, type Phrase } from '../../.claude/skills/yomimasu/scripts/cards.ts';
import type { Pair } from './pair.ts';

// ruby は実際の発音で、札の読みの表の sound から作る。表の sound は「思ふ」を「おもう」、「逢坂」を「おうさか」としているが、
// ガイドは「お段に続く語中・語尾の「ふ」は「お」」（77番の思ふ→おもお）、あふ は「おお」（10番の逢坂。2026-11-04 のユーザーの判断）と決めている。
// 表を直すのはこの画面の範囲の外なので、振るときにだけ直す。表の sound は測定とスキルも使うので、ここからは書き換えない。
// 表を直して toO と toOo を消す作業は #21 で行う。
// toO の対象は1字の「ふ」が「う」になる読み替えに限る。いふ→ゆう、てふ→ちょう は表のとおりに振る。
// toOo の対象は表の sound が「おう」の あふ に限る。がふ→ごう（76番の まがふ）はユーザーの判断の外なので、表のとおりに振る。
const O_ROW = new Set('おこそとのほもよろをごぞどぼぽ');
const toO = (phrase: Phrase, at: number, diff: Phrase['diffs'][number]) =>
  diff.kana === 'ふ' && diff.sound === 'う' && at > 0 && O_ROW.has(soundOf(phrase, at - 1, at).at(-1)!) ? 'お' : diff.sound;
const toOo = (diff: Phrase['diffs'][number]) => (diff.kana === 'あふ' && diff.sound === 'おう' ? 'おお' : diff.sound);

export type Token = { text: string; ruby?: string; nobi?: true; yoin?: true };
export type Line = Token[];
export type PairLines = { shimo: Line[]; kami: Line[] };

const UPPER = [0, 1, 2];
const LOWER = [3, 4];

const NOBI: Token = { text: 'ー', nobi: true };
// 余韻の印は字ではないので、本文の字数（lineText）に数えない。
const YOIN: Token = { text: '', yoin: true };

type Marks = ReadonlyMap<number, readonly Token[]>;

export const lineText = (line: Line) => line.map((token) => token.text).join('');

// 仮名の部分は字ごとに分け、発音の違う字にだけ振る。字数の違う読み替え（てふ→ちょう）は字に分けられないのでまとめる。
// 伸ばす箇所は読み替えの途中に来ない。cards.ts の markedText が同じ前提を検査している。余韻の印も来ない。表のテストが、下の句の終わりを指すことを確かめている。
// 字数の同じ読み替え（あふ→おう）は字ごとに対応させる。44番の「逢ふ」のように、漢字と仮名の部分にまたがるからである。
const diffAt = (phrase: Phrase, at: number) => phrase.diffs.find((d) => d.at <= at && at < d.at + d.kana.length);

function soundOf(phrase: Phrase, from: number, to: number): string {
  let sound = '';
  for (let at = from; at < to; ) {
    const diff = diffAt(phrase, at);
    if (diff && diff.kana.length !== diff.sound.length) {
      sound += diff.sound;
      at = diff.at + diff.kana.length;
    } else {
      sound += !diff ? phrase.kana[at] : diff.kana.length === 1 ? toO(phrase, at, diff) : toOo(diff)[at - diff.at];
      at += 1;
    }
  }
  return sound;
}

function kanaTokens(phrase: Phrase, from: number, text: string, marks: Marks): Token[] {
  const tokens: Token[] = [];
  for (let i = 0; i < text.length; ) {
    const at = from + i;
    if (i > 0) tokens.push(...(marks.get(at) ?? []));
    const diff = diffAt(phrase, at);
    const length = diff && diff.kana.length !== diff.sound.length ? diff.kana.length : 1;
    const kana = text.slice(i, i + length);
    const sound = soundOf(phrase, at, at + length);
    tokens.push(sound === kana ? { text: kana } : { text: kana, ruby: sound });
    i += length;
  }
  return tokens;
}

function phraseLine(phrase: Phrase, marks: Marks): Line {
  const line: Line = [];
  let cursor = 0;
  for (const [text, kana] of phrase.parts) {
    if (text === kana) {
      line.push(...kanaTokens(phrase, cursor, text, marks));
    } else {
      line.push({ text, ruby: soundOf(phrase, cursor, cursor + kana.length) });
    }
    cursor += kana.length;
    line.push(...(marks.get(cursor) ?? []));
  }
  return line;
}

function linesOf(card: Card, phraseIndexes: readonly number[]): Line[] {
  return phraseIndexes.map((index) => {
    const marks = new Map<number, Token[]>();
    const put = (after: number, token: Token) => marks.set(after, [...(marks.get(after) ?? []), token]);
    for (const stretch of card.stretches.filter((s) => s.phrase === index)) put(stretch.after, NOBI);
    if (card.yoin?.phrase === index) put(card.yoin.after, YOIN);
    return phraseLine(card.phrases[index], marks);
  });
}

export function pairLines(cards: readonly Card[], pair: Pair): PairLines {
  const find = (no: number) => {
    const card = cards.find((c) => c.no === no);
    if (!card) throw new Error(`${no}番が札の読みの表にない`);
    return card;
  };
  return { shimo: linesOf(find(pair.shimo), LOWER), kami: linesOf(find(pair.kami), UPPER) };
}

// 余韻は最後の音から始まるので、字ではなく、聞こえる最後の音を出す。漢字で終わる札（2番の「山」）で字を出すと1音早く押すことになり、
// 発音の違う仮名で終わる札（77番の「ふ」→お、3番の「む」→ん）で字を出すと、聞こえる音と食い違う。
export function tapCharOf(lines: PairLines): string {
  const line = lines.shimo.at(-1)!;
  const last = line[lastSoundAt(line)];
  return (last.ruby ?? last.text).at(-1)!;
}

// 伸ばす印と余韻の印は音を持たないので飛ばす。
export const lastSoundAt = (line: Line) => line.findLastIndex((token) => !token.nobi && !token.yoin);

// 文字の時刻の列は C3 で表に入る。それまでは字数で分けた仮の位置で、押し間違いを数えない範囲にだけ使う。
export function secondShimoLineAt(lines: PairLines, shimoSec: number): number {
  const [first, second] = lines.shimo.map((line) => lineText(line).length);
  return (shimoSec * first) / (first + second);
}
