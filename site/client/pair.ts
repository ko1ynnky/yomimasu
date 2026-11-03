export type CardNo = number;

// 1組は前の札の下の句で始まり、次の札の上の句で終わる。同じ札の上と下ではない。
export type Pair = { shimo: CardNo; kami: CardNo };

export type SegmentKey = 'shimo' | 'yoin' | 'ma' | 'kami';

export type Segment = { key: SegmentKey; name: string; sec: number; label: string };

export const DEFAULT_PAIR: Pair = { shimo: 77, kami: 29 };

// 序歌は下の句を2回読むので区間の形が変わる。序歌の組は Y-19 で足し、それまでは 1〜100番に限る。
const isCardNo = (text: string | null) => text !== null && /^\d{1,3}$/.test(text) && Number(text) >= 1 && Number(text) <= 100;

export function pairFromSearch(search: string): Pair {
  const params = new URLSearchParams(search);
  const shimo = params.get('shimo');
  const kami = params.get('kami');
  if (!isCardNo(shimo) || !isCardNo(kami) || shimo === kami) return DEFAULT_PAIR;
  return { shimo: Number(shimo), kami: Number(kami) };
}

const STANDARD_SEGMENTS: readonly Segment[] = [
  { key: 'shimo', name: '下の句', sec: 5, label: '下の句（5秒程度）' },
  { key: 'yoin', name: '余韻', sec: 3, label: '余韻（3.0秒）' },
  { key: 'ma', name: '間', sec: 1, label: '間（1.0秒）' },
  { key: 'kami', name: '上の句', sec: 6, label: '上の句（6秒程度）' },
];

// 帯は標準の 5・3・1・6 で進める。測定の定義ではないので docs/measure.md の値を使わない。
export const segmentsOf = (_pair: Pair): Segment[] => STANDARD_SEGMENTS.map((segment) => ({ ...segment }));
