// 歴史的仮名遣いの仮名を、読むときの音の仮名へ読み替える規則。

import type { SoundDiff, SoundRule } from '../../.claude/skills/yomimasu/scripts/cards.ts';

const LONG_VOWELS: readonly (readonly [string, string])[] = [
  ['あふ', 'おう'],
  ['いふ', 'ゆう'],
  ['けふ', 'きょう'],
  ['てふ', 'ちょう'],
  ['がふ', 'ごう'],
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
      diffs.push({ at, kana: long[0], sound: long[1], rule: '長音' });
      at += long[0].length - 1;
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
