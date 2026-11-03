// 公開の本文データと一覧から、札の読みの表の行を組み立てる。

import { readFileSync } from 'node:fs';
import {
  GRAND_CARDS,
  JOKA,
  heard,
  kanaOffset,
  kimarijiLengths,
  markedText,
  ruleStretchesOf,
  type Card,
  type Part,
  type Phrase,
  type Stretch,
  type TextFix,
} from '../../.claude/skills/yomimasu/scripts/cards.ts';
import { KANJI_HINTS, KANJI_SPLITS, LINE_FIXES, PHRASE_LENGTHS, keptOf, type LineKey } from './corrections.ts';
import type { ListCard } from './list.ts';
import { applyDiffs, soundDiffs } from './sound.ts';

const STANDARD_LENGTHS = [5, 7, 5, 7, 7];
const KANJI_RUN = /[\u4e00-\u9fff々]+/;

export type Lines = Record<LineKey, string>;

export function linesFromCsv(path: string): Map<number, Lines> {
  const csv = new TextDecoder('shift_jis').decode(readFileSync(path));
  const rows = csv.trim().split(/\r?\n/).slice(1).map((row) => row.replaceAll(' ', '').split(','));
  return new Map(rows.map(([no, , upperText, lowerText, upperKana, lowerKana]) => [Number(no), { upperText, lowerText, upperKana, lowerKana }]));
}

export function fixedLines(no: number, lines: Lines): { lines: Lines; fixes: TextFix[] } {
  const fixed = { ...lines };
  const fixes: TextFix[] = [];
  for (const { line, from, to, why } of LINE_FIXES[no] ?? []) {
    if (!fixed[line].includes(from)) throw new Error(`${no} 番の「${from}」が本文にない`);
    fixed[line] = fixed[line].replace(from, to);
    fixes.push({ field: line.endsWith('Kana') ? '仮名' : '本文', from, to, why });
  }
  return { lines: fixed, fixes };
}

function alignLine(no: number, text: string, kana: string): Part[] {
  const pieces = text.split(new RegExp(`(${KANJI_RUN.source})`)).filter((piece) => piece !== '');
  const hints = KANJI_HINTS[no] ?? {};
  const pattern = pieces.map((piece) => `(${hints[piece] ?? (KANJI_RUN.test(piece) ? '.+?' : piece)})`).join('');
  const match = kana.match(new RegExp(`^${pattern}$`, 'u'));
  if (!match) throw new Error(`「${text}」が「${kana}」に合わない`);
  return pieces.map((piece, i) => [piece, match[i + 1]]);
}

function splitParts(parts: Part[]): Part[] {
  return parts.flatMap((part): Part[] => {
    const split = KANJI_SPLITS[`${part[0]}:${part[1]}`];
    return split ? split.map(([text, kana]) => [text, kana]) : [part];
  });
}

function cutPhrases(parts: Part[], lengths: readonly number[], no: number): Part[][] {
  const phrases: Part[][] = [];
  const rest = [...parts];
  for (const length of lengths) {
    const phrase: Part[] = [];
    let remaining = length;
    while (remaining > 0) {
      const [text, kana] = rest.shift() ?? [];
      if (text === undefined || kana === undefined) throw new Error(`${no} 番の字数が足りない`);
      if (kana.length <= remaining) {
        phrase.push([text, kana]);
        remaining -= kana.length;
      } else if (text === kana) {
        phrase.push([text.slice(0, remaining), kana.slice(0, remaining)]);
        rest.unshift([text.slice(remaining), kana.slice(remaining)]);
        remaining = 0;
      } else {
        throw new Error(`${no} 番の「${text}」が句をまたぐ`);
      }
    }
    phrases.push(phrase);
  }
  if (rest.length > 0) throw new Error(`${no} 番の句の字数が本文より短い`);
  return phrases;
}

function phraseOf(no: number, index: number, parts: Part[]): Phrase {
  const kana = parts.map(([, k]) => k).join('');
  const heads = new Set([0, ...keptOf(no, index, kana).map((k) => k.at)]);
  let offset = 0;
  for (const [text, reading] of parts) {
    if (text !== reading) heads.add(offset);
    offset += reading.length;
  }
  const diffs = soundDiffs(kana, heads);
  return { text: parts.map(([t]) => t).join(''), kana, sound: applyDiffs(kana, diffs), parts, diffs };
}

function phrasesOf(no: number, lines: Lines): Phrase[] {
  const lengths = PHRASE_LENGTHS[no] ?? STANDARD_LENGTHS;
  const upperLengths = lengths.slice(0, 3);
  const lowerLengths = lengths.slice(3);
  return [
    ...cutPhrases(splitParts(alignLine(no, lines.upperText, lines.upperKana)), upperLengths, no),
    ...cutPhrases(splitParts(alignLine(no, lines.lowerText, lines.lowerKana)), lowerLengths, no),
  ].map((parts, i) => phraseOf(no, i, parts));
}

const VOWEL_OF: Readonly<Record<string, string>> = Object.fromEntries(
  ['あかがさざただなはばぱまやらわゃ', 'いきぎしじちぢにひびぴみり', 'うくぐすずつづぬふぶぷむゆるゅ', 'えけげせぜてでねへべぺめれ', 'おこごそぞとどのほぼぽもよろをょ'].flatMap(
    (row, vowel) => [...row].map((kana) => [kana, 'あいうえお'[vowel]]),
  ),
);

// 表と一覧は長音の書き方が違うので、同じ音なら同じ文字列になる形にして比べる。
function comparable(reading: string): string {
  let out = '';
  for (const char of reading.replaceAll('を', 'お').replaceAll('ぢ', 'じ').replaceAll('づ', 'ず')) {
    const previous = out.at(-1);
    if (char === 'ー' && previous) out += VOWEL_OF[previous] ?? previous;
    else if (char === 'う' && previous && VOWEL_OF[previous] === 'お') out += 'お';
    else out += char;
  }
  return out;
}

function stretchesOnLine(phrases: Phrase[], offset: number, marks: number[]): Stretch[] {
  return marks.map((mark) => {
    let start = 0;
    for (const [index, phrase] of phrases.entries()) {
      // 句の切れ目の印は前の句の終わりとして扱う。
      if (mark <= start + phrase.sound.length) {
        const after = kanaOffset(phrase, mark - start);
        if (after === null) throw new Error(`印が「${phrase.sound}」の字の切れ目にない`);
        return { phrase: index + offset, after };
      }
      start += phrase.sound.length;
    }
    throw new Error(`印が行の外にある：${phrases.map((p) => p.sound).join('')} ${mark}`);
  });
}

export function buildCard(no: number, lines: Lines, fixes: TextFix[], list: ListCard): Omit<Card, 'kimariji'> {
  const phrases = phrasesOf(no, lines);
  const upper = phrases.slice(0, 3);
  const lower = phrases.slice(3);
  const stretches = [...stretchesOnLine(upper, 0, list.upper.marks), ...stretchesOnLine(lower, 3, list.lower.marks)];
  const ruleStretches = ruleStretchesOf(no, phrases, GRAND_CARDS.has(no));
  return {
    no,
    phrases,
    ruleStretches,
    stretches,
    marked: {
      upper: markedText(upper, stretches.filter((s) => s.phrase <= 2)),
      lower: markedText(lower, stretches.filter((s) => s.phrase >= 3).map((s) => ({ ...s, phrase: s.phrase - 3 }))),
    },
    origin: {
      text: { source: no === JOKA ? 'joka' : 'csv', fixes },
      sound: { basis: 'rules', checkedWith: 'list', kept: phrases.flatMap((p, i) => keptOf(no, i, p.kana)) },
      ruleStretches: { source: 'rules' },
      stretches: { source: 'list', page: list.page },
    },
  };
}

function kanaOfSoundPrefix(card: Omit<Card, 'kimariji'>, length: number): string {
  let rest = length;
  let kana = '';
  for (const phrase of card.phrases.slice(0, 3)) {
    if (rest <= phrase.sound.length) {
      const after = kanaOffset(phrase, rest);
      if (after === null) throw new Error(`${card.no} 番の決まり字が読み替えの途中で終わる`);
      return kana + phrase.kana.slice(0, after);
    }
    rest -= phrase.sound.length;
    kana += phrase.kana;
  }
  throw new Error(`${card.no} 番の決まり字が上の句に収まらない`);
}

export function withKimariji(cards: Omit<Card, 'kimariji'>[]): Card[] {
  const upperSound = (card: Omit<Card, 'kimariji'>) => heard(card.phrases.slice(0, 3).map((p) => p.sound).join(''));
  const lengths = kimarijiLengths(new Map(cards.filter((c) => c.no !== JOKA).map((c) => [c.no, upperSound(c)])));
  return cards.map((card) => {
    const length = lengths.get(card.no);
    const kimariji = length === undefined ? null : { kana: kanaOfSoundPrefix(card, length), sound: upperSound(card).slice(0, length) };
    return { ...card, kimariji };
  });
}

export type Comparison = {
  lines: number;
  textMismatches: string[];
  soundMismatches: string[];
  stretchMismatches: string[];
  marks: number;
};

// 一覧の本文の漢字は、読みが分からないものとして扱い、仮名の字だけを見る。
const matchesKana = (plain: string, kana: string) =>
  new RegExp(`^${[...plain].map((char) => (KANJI_RUN.test(char) ? '.+?' : char)).join('')}$`, 'u').test(kana);

export function compareWithList(cards: readonly Card[], list: readonly ListCard[]): Comparison {
  const result: Comparison = { lines: 0, textMismatches: [], soundMismatches: [], stretchMismatches: [], marks: 0 };
  for (const card of cards) {
    const entry = list.find((l) => l.no === card.no);
    if (!entry) throw new Error(`${card.no} 番が一覧にない`);
    const sides = [
      { name: '上の句', phrases: card.phrases.slice(0, 3), line: entry.upper, first: 0 },
      { name: '下の句', phrases: card.phrases.slice(3), line: entry.lower, first: 3 },
    ];
    for (const { name, phrases, line, first } of sides) {
      result.lines += 1;
      result.marks += line.marks.length;
      const label = `${card.no} 番の${name}`;
      if (!matchesKana(line.plain, phrases.map((p) => p.kana).join(''))) result.textMismatches.push(label);
      if (comparable(phrases.map((p) => p.sound).join('')) !== comparable(line.reading)) {
        result.soundMismatches.push(label);
        continue;
      }
      const expected = stretchesOnLine(phrases, first, line.marks);
      const actual = card.stretches.filter((s) => (first === 0 ? s.phrase <= 2 : s.phrase >= 3));
      if (JSON.stringify(expected) !== JSON.stringify(actual)) result.stretchMismatches.push(label);
    }
  }
  return result;
}
