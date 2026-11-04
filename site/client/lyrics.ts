import { soundOffset, type Card, type Phrase } from '../../.claude/skills/yomimasu/scripts/cards.ts';
import type { Pair } from './pair.ts';

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

// ruby は実際の発音で、札の読みの表の sound から作る。表の sound は読手テキストの一覧のふりがなの「ー」と注の字に合わせてあるので、画面では読み替えない。
// 仮名の部分は字ごとに分け、発音の違う字にだけ振る。字数の違う読み替え（てふ→ちょー）は字に分けられないのでまとめる。
// 伸ばす箇所は読み替えの途中に来ない。cards.ts の markedText が同じ前提を検査している。余韻の印も来ない。表のテストが、下の句の終わりを指すことを確かめている。
const diffAt = (phrase: Phrase, at: number) => phrase.diffs.find((d) => d.at <= at && at < d.at + d.kana.length);

const soundOf = (phrase: Phrase, from: number, to: number) => phrase.sound.slice(soundOffset(phrase, from), soundOffset(phrase, to));

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

// 伸ばす印と余韻の印は音を持たないので飛ばす。
export const lastSoundAt = (line: Line) => line.findLastIndex((token) => !token.nobi && !token.yoin);
