import { lastSoundAt, type Line, type PairLines } from './lyrics.ts';
import type { Segment, SegmentKey } from './pair.ts';

export type Notation = 'kanji' | 'kana';

// at から to までに、その字を上から朱にする。時刻は帯の時計の秒である。
export type Glyph = { text: string; ruby?: string; nobi?: true; at: number; to: number };

export type TimedLyrics = {
  shimo: Glyph[][];
  // 下の句の最後の字。余韻の3秒は最後の字を含めて数えるので、余韻の始まりに置く（スキルの references/timing.md の「余韻」。完全版 p.3、講習資料 s.8）。
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

type Weighted = Omit<Glyph, 'at' | 'to'> & { weight: number };

// かなの表記は発音どおりに書き、読みが2拍以上の字は1拍ずつに分ける。朱の進みを1拍ずつ動かすためである。
// 1字ずつには分けない。拗音の小さい字に拍を配ると、「ちょう」の「ち」と「ょ」が別の拍のように進む。
function weighted(line: Line, notation: Notation): Weighted[] {
  return line.flatMap((token): Weighted[] => {
    if (token.yoin) return [];
    if (token.nobi) return [{ text: token.text, nobi: true, weight: NOBI_WEIGHT }];
    if (!token.ruby) return [{ text: token.text, weight: 1 }];
    const morae = moraeOf(token.ruby);
    if (notation === 'kanji') return [{ text: token.text, ruby: token.ruby, weight: morae.length }];
    return morae.map((text) => ({ text, weight: 1 }));
  });
}

const weightOf = (chars: readonly Weighted[]) => chars.reduce((sum, char) => sum + char.weight, 0);
const glyphOf = ({ weight: _, ...char }: Weighted, at: number, to: number): Glyph => ({ ...char, at, to });

// 行の分かれ目は書き方の都合で、読む時刻に関わらない。句全体の拍で割り振る。
function place(lines: readonly Weighted[][], from: number, sec: number): { lines: Glyph[][]; unit: number } {
  const unit = sec / weightOf(lines.flat());
  let seen = 0;
  const placed = lines.map((line) =>
    line.map((char) => {
      const at = from + unit * seen;
      seen += char.weight;
      return glyphOf(char, at, from + unit * seen);
    }),
  );
  return { lines: placed, unit };
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
export function timeLyrics(lines: PairLines, segments: readonly Segment[], notation: Notation): TimedLyrics {
  const shimoSpan = spanOf(segments, 'shimo');
  const yoinSpan = spanOf(segments, 'yoin');
  const kamiSpan = spanOf(segments, 'kami');

  const shimoChars = lines.shimo.map((line) => weighted(line, notation));
  const lastLine = shimoChars.at(-1)!;
  const [lastChar] = lastLine.splice(lastSoundAt(lastLine), 1);
  const shimo = place(shimoChars, shimoSpan.from, shimoSpan.to - shimoSpan.from);
  const last = glyphOf(lastChar, yoinSpan.from, yoinSpan.from + lastChar.weight * shimo.unit);
  const kami = place(
    lines.kami.map((line) => weighted(line, notation)),
    kamiSpan.from,
    kamiSpan.to - kamiSpan.from,
  );

  return {
    shimo: shimo.lines,
    last,
    yoin: { from: last.to, to: yoinSpan.to },
    kami: kami.lines,
  };
}
