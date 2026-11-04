// 歴史的仮名遣いの仮名を、読むときの音の仮名へ読み替える規則。

import type { Furigana, SoundDiff, SoundRule } from '../../.claude/skills/yomimasu/scripts/cards.ts';
import type { SoundException } from './corrections.ts';

// 長音は読手テキストの一覧の表記に合わせて「ー」で書く（2026-11-04 のユーザーの判断）。
const LONG_VOWELS: readonly (readonly [string, string])[] = [
  ['あふ', 'おー'],
  ['いふ', 'ゆー'],
  ['けふ', 'きょー'],
  ['てふ', 'ちょー'],
  ['がふ', 'ごー'],
];

const SINGLE: Readonly<Record<string, { sound: string; rule: SoundRule }>> = {
  は: { sound: 'わ', rule: '語中のハ行' },
  ひ: { sound: 'い', rule: '語中のハ行' },
  ふ: { sound: 'う', rule: '語中のハ行' },
  へ: { sound: 'え', rule: '語中のハ行' },
  ほ: { sound: 'お', rule: '語中のハ行' },
  ゐ: { sound: 'い', rule: 'ワ行' },
  ゑ: { sound: 'え', rule: 'ワ行' },
  を: { sound: 'お', rule: 'ワ行' },
  ぢ: { sound: 'じ', rule: '四つ仮名' },
  づ: { sound: 'ず', rule: '四つ仮名' },
  む: { sound: 'ん', rule: 'む' },
};

const needsWordMiddle = (rule: SoundRule) => rule === '語中のハ行' || rule === 'む';

// heads は語の頭の位置である。ハ行と「む」は語の頭では読み替えない。
export function soundDiffs(kana: string, heads: ReadonlySet<number>): SoundDiff[] {
  const diffs: SoundDiff[] = [];
  for (let at = 0; at < kana.length; at++) {
    const long = LONG_VOWELS.find(([from]) => kana.startsWith(from, at));
    if (long) {
      const [from, sound] = long;
      // 字数の同じ綴りを1字ずつに分けるのは、一覧のふりがなが字ごとに付き（45番の い→ゆ、ふ→ー）、44番の「逢ふ」のように漢字と仮名の部分にまたがるからである。
      if (from.length === sound.length) diffs.push(...[...from].map((char, i) => ({ at: at + i, kana: char, sound: sound[i], rule: '長音' as const })));
      else diffs.push({ at, kana: from, sound, rule: '長音' });
      at += from.length - 1;
      continue;
    }
    const single = SINGLE[kana[at]];
    if (single && !(needsWordMiddle(single.rule) && heads.has(at))) {
      diffs.push({ at, kana: kana[at], sound: single.sound, rule: single.rule });
    }
  }
  return diffs;
}

export function applyDiffs(kana: string, diffs: readonly SoundDiff[]): string {
  let sound = '';
  let cursor = 0;
  for (const diff of diffs) {
    sound += kana.slice(cursor, diff.at) + diff.sound;
    cursor = diff.at + diff.kana.length;
  }
  return sound + kana.slice(cursor);
}

type Span = Pick<Furigana, 'at' | 'length' | 'reading'>;

// 表の発音は一覧の表記に合わせる。一覧のふりがなは「ー」の字だけを、注は字のすべてを、規則の読み替えに代えて書く（2026-11-04 のユーザーの判断）。
// 字数は変えないので、伸ばす位置とふりがなの位置は、当てる前の句で求めたものをそのまま使える。
// 範囲が読み替えの途中で始まるか終わるふりがなは、notationOnLine が止めるので、ここでは見ない。
export function withListNotation(kana: string, diffs: readonly SoundDiff[], notation: { furigana: readonly Span[]; notes: readonly Span[] }): SoundDiff[] {
  const result = new Map(diffs.map((diff) => [diff.at, diff]));
  const overwrite = (span: Span, applies: (char: string) => boolean, rule: SoundRule) => {
    let read = 0;
    for (let at = span.at; at < span.at + span.length; ) {
      const diff = diffs.find((d) => d.at <= at && at < d.at + d.kana.length);
      const sound = diff?.sound ?? kana[at];
      const listed = span.reading.slice(read, read + sound.length);
      if (listed.length < sound.length) throw new Error(`一覧の読み「${span.reading}」の字数が「${kana}」の発音の字数より少ない`);
      if ([...sound].some((char, i) => applies(listed[i]) && listed[i] !== char)) {
        if (sound.length !== 1 || (diff && diff.kana.length !== 1)) throw new Error(`「${kana}」の「${diff?.kana}」の読み替えの途中で、一覧の読み「${span.reading}」と食い違う`);
        result.set(at, { at, kana: kana[at], sound: listed, rule });
      }
      read += sound.length;
      at += diff?.kana.length ?? 1;
    }
    if (read !== span.reading.length) throw new Error(`一覧の読み「${span.reading}」の字数が「${kana}」の発音の字数より多い`);
  };
  for (const span of notation.furigana) overwrite(span, (char) => char === 'ー', '一覧のふりがな');
  for (const span of notation.notes) overwrite(span, () => true, '一覧の注');
  return [...result.values()].sort((a, b) => a.at - b.at);
}

type Exception = Pick<SoundException, 'at' | 'kana' | 'listed' | 'sound'>;

// 札ごとの例外は withListNotation のあとに当てる。字数を変えてよいのは、伸ばす位置とふりがなの位置が仮名の位置で、当てる前に求め終えているからである。
// 例外の所が一覧の表記を当てた発音と合わなければ止める。一覧か規則が変わったときに、例外が黙って別の読みを上書きしないようにするためである。
export function withSoundExceptions(diffs: readonly SoundDiff[], exceptions: readonly Exception[]): SoundDiff[] {
  for (const e of exceptions) {
    const diff = diffs.find((d) => d.at === e.at);
    if (diff?.kana !== e.kana || diff.sound !== e.listed) throw new Error(`例外の「${e.kana}」が、${e.at} 字目の読み替え「${diff?.kana}→${diff?.sound}」に合わない`);
  }
  return diffs.map((diff) => {
    const exception = exceptions.find((e) => e.at === diff.at);
    return exception ? { at: diff.at, kana: diff.kana, sound: exception.sound, rule: 'ユーザーの判断' } : diff;
  });
}

// 一覧と照合するときに、例外の所を一覧の表記を当てた発音へ戻す。rule は戻さない。照合は発音の字と位置だけを見る。
export function withoutSoundExceptions(diffs: readonly SoundDiff[], exceptions: readonly Exception[]): SoundDiff[] {
  return diffs.map((diff) => {
    const exception = exceptions.find((e) => e.at === diff.at && e.kana === diff.kana && e.sound === diff.sound);
    return exception ? { ...diff, sound: exception.listed } : diff;
  });
}
