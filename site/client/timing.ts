import { lastSoundAt, type Line, type PairLines, type Token } from './lyrics.ts';
import type { Segment, SegmentKey } from './pair.ts';

export type Notation = 'kanji' | 'kana';

// at から to までに、その字を上から朱にする。時刻は帯の時計の秒である。
export type Glyph = { text: string; ruby?: string; nobi?: true; at: number; to: number };

export type TimedLyrics = {
  shimo: Glyph[][];
  // 下の句の最後の字。余韻の3秒は最後の字を含めて数えるので、余韻の区切りに置く（スキルの references/timing.md の「余韻」。完全版 p.3、講習資料 s.8）。
  last: Glyph;
  // 余韻の印は from から to までを同じ速さで塗る。保つ所と弱める所に分けて塗ると、音量を保ったまま続ける形（だいこん型）に読める（2026-11-04 のユーザーの判断）。
  // 間の1秒に塗るものは置かない。「（間）」の字を置いた形は、実機で読みづらかった（同日のユーザーの判断）。
  yoin: { from: number; to: number };
  kami: Glyph[][];
};

// 伸ばす印は2拍に数える。見本と同じ値で、読手の読みから測った長さではない。
const NOBI_WEIGHT = 2;
// 拗音の小さい字は前の字と合わせて1拍である。促音の「っ」は1拍なので分ける。
const SMALL_KANA = new Set('ゃゅょぁぃぅぇぉゎ');
function moraeOf(reading: string): string[] {
  const morae: string[] = [];
  for (const char of reading) {
    if (SMALL_KANA.has(char) && morae.length > 0) morae[morae.length - 1] += char;
    else morae.push(char);
  }
  return morae;
}

// 時刻は表記に関わらず拍で作る。漢字の表記の字は、その字の拍の範囲を受け持つ。表記を切り替えても、同じ拍を読む時刻は変わらない。
// 伸ばす印の字は札をまたいで同じものを使い回すので、字は行の中の位置（index）で見分ける。
type Mora = { text: string; nobi?: true; weight: number; token: Token; index: number };
type TimedMora = Mora & { at: number; to: number };

function moraeOfLine(line: Line): Mora[] {
  return line.flatMap((token, index): Mora[] => {
    if (token.yoin) return [];
    if (token.nobi) return [{ text: token.text, nobi: true, weight: NOBI_WEIGHT, token, index }];
    return moraeOf(token.ruby ?? token.text).map((text) => ({ text, weight: 1, token, index }));
  });
}

// 行の分かれ目は書き方の都合で、読む時刻に関わらない。句全体の拍で割り振る。
function place(lines: readonly Mora[][], from: number, sec: number): { lines: TimedMora[][]; unit: number } {
  const unit = sec / lines.flat().reduce((sum, mora) => sum + mora.weight, 0);
  let seen = 0;
  const placed = lines.map((line) =>
    line.map((mora) => {
      const at = from + unit * seen;
      seen += mora.weight;
      return { ...mora, at, to: from + unit * seen };
    }),
  );
  return { lines: placed, unit };
}

// かなの表記は発音どおりに書き、1拍ずつに分ける。朱の進みを1拍ずつ動かすためである。
// 1字ずつには分けない。拗音の小さい字に拍を配ると、「ちょう」の「ち」と「ょ」が別の拍のように進む。
function glyphsOf(line: readonly TimedMora[], notation: Notation): { glyph: Glyph; morae: TimedMora[] }[] {
  const groups: TimedMora[][] = [];
  for (const mora of line) {
    const group = groups.at(-1);
    if (notation === 'kanji' && group?.[0].index === mora.index) group.push(mora);
    else groups.push([mora]);
  }
  return groups.map((morae) => {
    const [first] = morae;
    const { at } = first;
    const { to } = morae.at(-1)!;
    if (first.nobi) return { glyph: { text: first.text, nobi: true, at, to }, morae };
    if (notation === 'kana') return { glyph: { text: first.text, at, to }, morae };
    const { text, ruby } = first.token;
    return { glyph: ruby ? { text, ruby, at, to } : { text, at, to }, morae };
  });
}

function spanOf(segments: readonly Segment[], key: SegmentKey) {
  let from = 0;
  for (const segment of segments) {
    if (segment.key === key) return { from, to: from + segment.sec };
    from += segment.sec;
  }
  throw new Error(`区間に ${key} がない`);
}

// 字ごとの時刻は、札の読みの表の拍と伸ばす印から作り、標準の 5・3・1・6 に割り振る。読手の測った時刻ではない。
// 字数で等分すると、伸ばす所と漢字の読みの長さが消え、誤った手本になる（要件 C3）。
// 余韻は最後の音から始まるので、5.0秒に置くのは最後の拍である。漢字で終わる札（2番の「山」）の漢字の表記では、最後の字は 5.0秒より少し前から塗り始める。
export function timeLyrics(lines: PairLines, segments: readonly Segment[], notation: Notation): TimedLyrics {
  const shimoSpan = spanOf(segments, 'shimo');
  const yoinSpan = spanOf(segments, 'yoin');
  const kamiSpan = spanOf(segments, 'kami');

  const shimoMorae = lines.shimo.map(moraeOfLine);
  const lastLine = shimoMorae.at(-1)!;
  const lastAt = lastSoundAt(lastLine);
  const [lastMora] = lastLine.splice(lastAt, 1);
  const shimo = place(shimoMorae, shimoSpan.from, shimoSpan.to - shimoSpan.from);
  const lastTimed: TimedMora = { ...lastMora, at: yoinSpan.from, to: yoinSpan.from + lastMora.weight * shimo.unit };
  shimo.lines.at(-1)!.splice(lastAt, 0, lastTimed);

  const shimoGlyphs = shimo.lines.map((line) => glyphsOf(line, notation));
  const lastGlyphs = shimoGlyphs.at(-1)!;
  const [{ glyph: last }] = lastGlyphs.splice(
    lastGlyphs.findIndex(({ morae }) => morae.includes(lastTimed)),
    1,
  );
  const kami = place(lines.kami.map(moraeOfLine), kamiSpan.from, kamiSpan.to - kamiSpan.from);

  return {
    shimo: shimoGlyphs.map((line) => line.map(({ glyph }) => glyph)),
    last,
    yoin: { from: lastTimed.to, to: yoinSpan.to },
    kami: kami.lines.map((line) => glyphsOf(line, notation).map(({ glyph }) => glyph)),
  };
}
