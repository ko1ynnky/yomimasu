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
  soundOffset,
  type AltReading,
  type Card,
  type Furigana,
  type Part,
  type Phrase,
  type Stretch,
  type TextFix,
} from '../../.claude/skills/yomimasu/scripts/cards.ts';
import { KANJI_HINTS, KANJI_SPLITS, LINE_FIXES, PHRASE_LENGTHS, keptOf, type LineKey } from './corrections.ts';
import type { ListCard, ListLine, ListRuby } from './list.ts';
import { applyDiffs, soundDiffs, withListNotation } from './sound.ts';

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
export function comparable(reading: string): string {
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

// 行の読みの位置ごとに、行の仮名（句の仮名をつないだもの）の位置を返す。字数の変わる読み替え（けふ、てふ）の途中は null である。
function kanaIndexOf(phrases: readonly Phrase[]): (number | null)[] {
  const index: (number | null)[] = [];
  let head = 0;
  for (const phrase of phrases) {
    const row: (number | null)[] = Array.from({ length: phrase.sound.length }, () => null);
    for (let at = 0; at < phrase.kana.length; at++) {
      const inside = phrase.diffs.some((d) => d.sound.length !== d.kana.length && d.at < at && at < d.at + d.kana.length);
      if (!inside) row[soundOffset(phrase, at)] = head + at;
    }
    index.push(...row);
    head += phrase.kana.length;
  }
  index.push(head);
  return index;
}

const UNIT = new RegExp(`${KANJI_RUN.source}|.`, 'gu');

// 本文の字を漢字のかたまりと仮名1字に分け、その切れ目を仮名の位置で返す。漢字のかたまりの読みの字数は前後の仮名から決める。
function unitBoundaries(kana: string, base: string): number[] {
  const units = base.match(UNIT) ?? [];
  const pattern = (kanji: string) => new RegExp(`^${units.map((unit) => (KANJI_RUN.test(unit) ? kanji : `(${unit})`)).join('')}$`, 'u');
  const shortest = kana.match(pattern('(.+?)'));
  const longest = kana.match(pattern('(.+)'));
  if (!shortest || !longest) throw new Error(`一覧の本文の字が、ふりがなの範囲の仮名「${kana}」と合わない`);
  if (shortest.join() !== longest.join()) throw new Error(`一覧の本文の漢字の読みの範囲が「${kana}」から決まらない`);
  let at = 0;
  return shortest.slice(1, -1).map((piece) => (at += piece.length));
}

// ふりがなは、一覧の本文の漢字のかたまり1つか仮名1字ごとに分けて持つ。句の切れ目と注の括弧でも分ける。
// 字数の変わる読み替えの仮名2字（けふ、てふ）は、字ごとの読みに分けられないので1つにする。
export function notationOnLine(phrases: Phrase[], offset: number, rubies: readonly ListRuby[]): { furigana: Furigana[]; notes: Furigana[] } {
  const index = kanaIndexOf(phrases);
  const kana = phrases.map((p) => p.kana).join('');
  const heads = phrases.map((_, i) => phrases.slice(0, i).reduce((sum, p) => sum + p.kana.length, 0));
  const result = { furigana: [] as Furigana[], notes: [] as Furigana[] };
  for (const ruby of rubies) {
    const inNote = [...ruby.text.matchAll(/\(([^()]*)\)|[^()]+/g)].flatMap((m) => [...(m[1] ?? m[0])].map(() => m[1] !== undefined));
    const reading = ruby.text.replace(/[()]/g, '');
    const kanaAt = (position: number) => {
      const at = index[ruby.start + position];
      if (at === null || at === undefined) throw new Error(`「${ruby.text}」が「${kana}」の仮名の字の切れ目に掛からない`);
      return at;
    };
    const from = kanaAt(0);
    const to = kanaAt(reading.length);
    const cuts = new Set([
      ...unitBoundaries(kana.slice(from, to), ruby.base).map((b) => from + b).filter((at) => index.includes(at)),
      ...heads,
      ...inNote.flatMap((note, i) => (i > 0 && note !== inNote[i - 1] ? [kanaAt(i)] : [])),
    ]);
    const edges = [from, ...[...cuts].filter((at) => from < at && at < to).sort((a, b) => a - b), to];
    for (const [i, at] of edges.slice(0, -1).entries()) {
      const head = index.indexOf(at) - ruby.start;
      const phrase = heads.findLastIndex((h) => h <= at);
      const piece = { phrase: phrase + offset, at: at - heads[phrase], length: edges[i + 1] - at, reading: reading.slice(head, index.indexOf(edges[i + 1]) - ruby.start) };
      (inNote[head] ? result.notes : result.furigana).push(piece);
    }
  }
  return result;
}

// 別の読みは行の頭から始まり、伸ばしの印のほかは行の読みと同じ字である。
// 長音のふりがな「ー」のすぐ後ろで伸ばす読みは、一覧が長音の「ー」だけを書き、伸ばしの印を別に書かない。99番の「思ふ」がこの形で、線は長音である。
export function alternativeOnLine(phrases: Phrase[], offset: number, reading: string, marked: string): AltReading {
  const marks: number[] = [];
  let cursor = 0;
  for (const char of marked) {
    if (char === 'ー') {
      if (reading[cursor] === 'ー') cursor += 1;
      marks.push(cursor);
    } else if (cursor < reading.length && comparable(char) === comparable(reading[cursor])) {
      cursor += 1;
    } else {
      throw new Error(`別の読み「${marked}」が行の読みと合わない`);
    }
  }
  if (!marked.endsWith('ー')) throw new Error(`別の読み「${marked}」が伸ばしの印で終わらない`);
  const stretches = stretchesOnLine(phrases, offset, marks);
  const last = stretches.at(-1);
  if (!last || last.after !== phrases[last.phrase - offset].kana.length) throw new Error(`別の読み「${marked}」が句の終わりで終わらない`);
  return { phrases: [offset, last.phrase], marked, stretches };
}

type Notation = Pick<Card, 'furigana' | 'notes' | 'alternatives'>;

const alternativesOfLine = (phrases: Phrase[], offset: number, line: ListLine): AltReading[] =>
  line.alternative === null ? [] : [alternativeOnLine(phrases, offset, line.reading, line.alternative)];

function notationOfLine(phrases: Phrase[], offset: number, line: ListLine): Notation {
  return { ...notationOnLine(phrases, offset, line.rubies), alternatives: alternativesOfLine(phrases, offset, line) };
}

const yoinOf = (phrases: Phrase[], list: ListCard): Stretch | null => (list.yoin ? { phrase: 4, after: phrases[4].kana.length } : null);

export function buildCard(no: number, lines: Lines, fixes: TextFix[], list: ListCard): Omit<Card, 'kimariji'> {
  const phrases = phrasesOf(no, lines);
  const upper = phrases.slice(0, 3);
  const lower = phrases.slice(3);
  const stretches = [...stretchesOnLine(upper, 0, list.upper.marks), ...stretchesOnLine(lower, 3, list.lower.marks)];
  const ruleStretches = ruleStretchesOf(no, phrases, GRAND_CARDS.has(no));
  const upperNotation = notationOfLine(upper, 0, list.upper);
  const lowerNotation = notationOfLine(lower, 3, list.lower);
  const furigana = [...upperNotation.furigana, ...lowerNotation.furigana];
  const notes = [...upperNotation.notes, ...lowerNotation.notes];
  const onPhrase = (spans: Furigana[], index: number) => spans.filter((s) => s.phrase === index);
  return {
    no,
    phrases: phrases.map((phrase, index) => {
      const diffs = withListNotation(phrase.kana, phrase.diffs, { furigana: onPhrase(furigana, index), notes: onPhrase(notes, index) });
      return { ...phrase, sound: applyDiffs(phrase.kana, diffs), diffs };
    }),
    ruleStretches,
    stretches,
    marked: {
      upper: markedText(upper, stretches.filter((s) => s.phrase <= 2)),
      lower: markedText(lower, stretches.filter((s) => s.phrase >= 3).map((s) => ({ ...s, phrase: s.phrase - 3 }))),
    },
    furigana,
    notes,
    alternatives: [...upperNotation.alternatives, ...lowerNotation.alternatives],
    yoin: yoinOf(phrases, list),
    origin: {
      text: { source: no === JOKA ? 'joka' : 'csv', fixes },
      sound: { basis: 'rules', checkedWith: 'list', kept: phrases.flatMap((p, i) => keptOf(no, i, p.kana)) },
      ruleStretches: { source: 'rules' },
      stretches: { source: 'list', page: list.page },
      notation: { source: 'booklet', page: list.page, readFrom: 'list' },
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
  notationMismatches: Record<keyof Notation | 'yoin', string[]>;
  notation: Record<keyof Notation | 'yoin', number>;
};

// 照合では例外で止めずに、不一致として数える。例外の文には一覧の字が入ることがあり、照合は件数と札の番号だけを出すからである。
function attempt<T>(compute: () => T): T | null {
  try {
    return compute();
  } catch {
    return null;
  }
}

// 一覧の本文の漢字は、読みが分からないものとして扱い、仮名の字だけを見る。
const matchesKana = (plain: string, kana: string) =>
  new RegExp(`^${[...plain].map((char) => (KANJI_RUN.test(char) ? '.+?' : char)).join('')}$`, 'u').test(kana);

export function compareWithList(cards: readonly Card[], list: readonly ListCard[]): Comparison {
  const result: Comparison = {
    lines: 0,
    textMismatches: [],
    soundMismatches: [],
    stretchMismatches: [],
    marks: 0,
    notationMismatches: { furigana: [], notes: [], alternatives: [], yoin: [] },
    notation: { furigana: 0, notes: 0, alternatives: 0, yoin: 0 },
  };
  for (const card of cards) {
    const entry = list.find((l) => l.no === card.no);
    if (!entry) throw new Error(`${card.no} 番が一覧にない`);
    result.notation.yoin += entry.yoin ? 1 : 0;
    if (JSON.stringify(yoinOf(card.phrases, entry)) !== JSON.stringify(card.yoin)) result.notationMismatches.yoin.push(`${card.no} 番`);
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
      const onSide = (s: { phrase: number }) => (first === 0 ? s.phrase <= 2 : s.phrase >= 3);
      const expected = attempt(() => stretchesOnLine(phrases, first, line.marks));
      if (expected === null || JSON.stringify(expected) !== JSON.stringify(card.stretches.filter(onSide))) result.stretchMismatches.push(label);
      const placed = attempt(() => notationOnLine(phrases, first, line.rubies));
      const notation = { furigana: placed?.furigana ?? null, notes: placed?.notes ?? null, alternatives: attempt(() => alternativesOfLine(phrases, first, line)) };
      for (const key of ['furigana', 'notes', 'alternatives'] as const) {
        result.notation[key] += notation[key]?.length ?? 0;
        const actual = key === 'alternatives' ? card.alternatives.filter((a) => onSide({ phrase: a.phrases[0] })) : card[key].filter(onSide);
        if (notation[key] === null || JSON.stringify(notation[key]) !== JSON.stringify(actual)) result.notationMismatches[key].push(label);
      }
    }
  }
  return result;
}
