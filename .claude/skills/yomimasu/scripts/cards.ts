// 札の読みの表 assets/cards.json の型と、表から計算する処理。作り方は docs/cards.md にある。

export const JOKA = 0;

export const GRAND_CARDS: ReadonlySet<number> = new Set([31, 64, 11, 76, 15, 50]);

// 読み方一覧の本文の列の印で、上の句の終わりの手前の伸ばしが最後の2字の前にある札である。
const UPPER_TAIL_TWO_BEFORE: ReadonlySet<number> = new Set([
  7, 8, 13, 15, 17, 20, 24, 27, 28, 30, 41, 42, 46, 48, 49, 50, 51, 62, 73, 79, 83, 86, 88, 93, 95,
]);

const LOWER_TAIL_THREE_BEFORE = ['もがな', 'おもへ', 'おもふ', 'なくに', 'ものを'];

// 「一覧のふりがな」と「一覧の注」は、規則の読み替えに代えて、読み方一覧のふりがなの「ー」と注の字で書いた箇所である。
export type SoundRule = '語中のハ行' | 'ワ行' | '四つ仮名' | '長音' | 'む' | '一覧のふりがな' | '一覧の注';

export type SoundDiff = { at: number; kana: string; sound: string; rule: SoundRule };

export type Part = [text: string, kana: string];

export type Phrase = {
  text: string;
  kana: string;
  sound: string;
  parts: Part[];
  diffs: SoundDiff[];
};

// after は句の頭から数えた仮名の字数である。句の長さと同じなら句の終わりを指す。
export type Stretch = { phrase: number; after: number };

// 読み方一覧のふりがなと注。at と length は、読みが掛かる範囲を句の仮名の字数で表す。
// 本文の漢字の列は一覧の表記と違う札があるので、漢字ではなく仮名の範囲に結びつける。
export type Furigana = { phrase: number; at: number; length: number; reading: string };

// 別の読みは、phrases の句の範囲を stretches の位置で伸ばす読み方である。marked は一覧の別の読みの字で、印を「ー」に揃えた。
export type AltReading = { phrases: [first: number, last: number]; marked: string; stretches: Stretch[] };

export type TextFix = { field: '本文' | '仮名'; from: string; to: string; why: string };

export type KeptKana = { phrase: number; at: number; kana: string; why: string };

export type Card = {
  no: number;
  phrases: Phrase[];
  kimariji: { kana: string; sound: string } | null;
  ruleStretches: Stretch[];
  stretches: Stretch[];
  marked: { upper: string; lower: string };
  furigana: Furigana[];
  notes: Furigana[];
  alternatives: AltReading[];
  yoin: Stretch | null;
  origin: {
    text: { source: string; fixes: TextFix[] };
    sound: { basis: 'rules'; checkedWith: string; kept: KeptKana[] };
    ruleStretches: { source: string };
    stretches: { source: string; page: number };
    notation: { source: string; page: number; readFrom: string };
  };
};

// 「あふ」は「おう」と書くが、聞こえる音は「おほ」の「おお」と同じである。
export const heard = (sound: string) => sound.replaceAll('おう', 'おお');

export function kimarijiLengths(uppers: ReadonlyMap<number, string>): Map<number, number> {
  const all = [...uppers.values()];
  return new Map(
    [...uppers].map(([no, text]) => {
      for (let length = 1; length <= text.length; length++) {
        const prefix = text.slice(0, length);
        if (all.filter((other) => other.startsWith(prefix)).length === 1) return [no, length];
      }
      throw new Error(`${no} 番の決まり字が定まらない`);
    }),
  );
}

export function ruleStretchesOf(no: number, phrases: readonly { kana: string }[], grand: boolean): Stretch[] {
  const [first, second, third, fourth, fifth] = phrases.map((p) => p.kana.length);
  const upperTail = UPPER_TAIL_TWO_BEFORE.has(no) ? 2 : 1;
  const lowerTail = LOWER_TAIL_THREE_BEFORE.some((ending) => phrases[4].kana.endsWith(ending)) ? 3 : 2;
  return [
    ...(grand ? [] : [{ phrase: 0, after: first }]),
    { phrase: 1, after: second },
    { phrase: 2, after: third - upperTail },
    { phrase: 2, after: third },
    { phrase: 3, after: fourth },
    { phrase: 4, after: fifth - lowerTail },
  ];
}

export function soundOffset(phrase: Phrase, kanaOffset: number): number {
  let offset = kanaOffset;
  for (const diff of phrase.diffs) {
    if (diff.at >= kanaOffset) break;
    const changesLength = diff.sound.length !== diff.kana.length;
    if (changesLength && diff.at + diff.kana.length > kanaOffset) throw new Error(`「${phrase.kana}」の ${kanaOffset} 字目は読み替えの途中である`);
    offset += diff.sound.length - diff.kana.length;
  }
  return offset;
}

// 伸ばす位置を置くのに使うので、字数の変わらない読み替えの途中も返さない。
export function kanaOffset(phrase: Phrase, target: number): number | null {
  for (let offset = 0; offset <= phrase.kana.length; offset++) {
    const inside = phrase.diffs.some((d) => d.at < offset && offset < d.at + d.kana.length);
    if (!inside && soundOffset(phrase, offset) === target) return offset;
  }
  return null;
}

export function markedText(phrases: readonly Phrase[], stretches: readonly Stretch[]): string {
  return phrases
    .map((phrase, index) => {
      const offsets = new Set(stretches.filter((s) => s.phrase === index).map((s) => s.after));
      let text = '';
      let cursor = 0;
      for (const [partText, partKana] of phrase.parts) {
        const inside = [...offsets].filter((offset) => cursor < offset && offset < cursor + partKana.length);
        if (inside.length > 0 && partText !== partKana) throw new Error(`「${partText}」の読みの途中に伸ばす箇所がある`);
        for (const [i, char] of [...partText].entries()) {
          if (offsets.has(cursor + i) && i > 0) text += 'ー';
          text += char;
        }
        cursor += partKana.length;
        if (offsets.has(cursor)) text += 'ー';
      }
      return text;
    })
    .join('');
}
