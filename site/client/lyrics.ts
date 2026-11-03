import { type Card, type Phrase } from '../../.claude/skills/yomimasu/scripts/cards.ts';
import type { Pair } from './pair.ts';

// ruby は実際の発音で、札の読みの表の sound から作る。表の sound は「思ふ」を「おもう」としており、
// ガイドは「おもお」と振ると決めている。表を直す作業はこの画面の範囲の外なので、表のまま振る。
export type Token = { text: string; ruby?: string; nobi?: true };
export type Line = Token[];
export type PairLines = { shimo: Line[]; kami: Line[] };

const UPPER = [0, 1, 2];
const LOWER = [3, 4];

const NOBI: Token = { text: 'ー', nobi: true };

export const lineText = (line: Line) => line.map((token) => token.text).join('');

// 仮名の部分は字ごとに分け、発音の違う字にだけ振る。字数の違う読み替え（てふ→ちょう）は字に分けられないのでまとめる。
// 伸ばす箇所は読み替えの途中に来ない。cards.ts の markedText が同じ前提を検査している。
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
      sound += diff ? diff.sound[at - diff.at] : phrase.kana[at];
      at += 1;
    }
  }
  return sound;
}

function kanaTokens(phrase: Phrase, from: number, text: string, stretchAfter: ReadonlySet<number>): Token[] {
  const tokens: Token[] = [];
  for (let i = 0; i < text.length; ) {
    const at = from + i;
    if (i > 0 && stretchAfter.has(at)) tokens.push(NOBI);
    const diff = diffAt(phrase, at);
    const length = diff && diff.kana.length !== diff.sound.length ? diff.kana.length : 1;
    const kana = text.slice(i, i + length);
    const sound = soundOf(phrase, at, at + length);
    tokens.push(sound === kana ? { text: kana } : { text: kana, ruby: sound });
    i += length;
  }
  return tokens;
}

function phraseLine(phrase: Phrase, stretchAfter: ReadonlySet<number>): Line {
  const line: Line = [];
  let cursor = 0;
  for (const [text, kana] of phrase.parts) {
    if (text === kana) {
      line.push(...kanaTokens(phrase, cursor, text, stretchAfter));
    } else {
      line.push({ text, ruby: soundOf(phrase, cursor, cursor + kana.length) });
    }
    cursor += kana.length;
    if (stretchAfter.has(cursor)) line.push(NOBI);
  }
  return line;
}

function linesOf(card: Card, phraseIndexes: readonly number[]): Line[] {
  return phraseIndexes.map((index) =>
    phraseLine(card.phrases[index], new Set(card.stretches.filter((s) => s.phrase === index).map((s) => s.after))),
  );
}

export function pairLines(cards: readonly Card[], pair: Pair): PairLines {
  const find = (no: number) => {
    const card = cards.find((c) => c.no === no);
    if (!card) throw new Error(`${no}番が札の読みの表にない`);
    return card;
  };
  return { shimo: linesOf(find(pair.shimo), LOWER), kami: linesOf(find(pair.kami), UPPER) };
}

export const tapCharOf = (lines: PairLines) => lines.shimo.at(-1)!.at(-1)!.text.at(-1)!;

// 文字の時刻の列は C3 で表に入る。それまでは字数で分けた仮の位置で、押し間違いを数えない範囲にだけ使う。
export function secondShimoLineAt(lines: PairLines, shimoSec: number): number {
  const [first, second] = lines.shimo.map((line) => lineText(line).length);
  return (shimoSec * first) / (first + second);
}
