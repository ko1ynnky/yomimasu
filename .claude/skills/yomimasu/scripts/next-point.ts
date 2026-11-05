// 録音を測った結果から、次に直す1点を決まった手順で選ぶ。Web とスキルはこのファイルを共有する。
// 乱数、時刻、ネットワークを使わず、AI にも選ばせない。同じ入力からは同じ答えを返す。
// 文は assets/next-point.json にあり、ここには幅も文も書き写さない。
import texts from '../assets/next-point.json' with { type: 'json' };
import { definition as standard, type Definition, type RangeItem } from './definition.ts';
import { rangePlacement, type Measurement } from './measure.ts';

// 札の番号で、序歌は 0 である（cards.ts の JOKA）。site/client/pair.ts と同じ形にして、組をそのまま渡せるようにする。
export type Pair = { shimo: number; kami: number };

export type Point = {
  item: RangeItem;
  placement: 'above' | 'below';
  fix: string;
  reason: string;
  how: string;
  link: { label: string; url: string };
};

// clear は「直す点なし」、hidden は「出さない」である。
export type NextPoint = { kind: 'point'; point: Point } | { kind: 'clear' } | { kind: 'hidden' };

// 幅の外が2つ以上あるときに先に選ぶ順。余韻と間は競技者がタイミングを合わせるのにとくに大事で、毎回同じ長さに保つ項目である。
// 間を先頭にするのは、標準が1.0秒と決まっていて、外れた値がそのまま直す所を指すからである。下の句＋余韻は、下の句と余韻のどちらが原因かを分けられない。
// 上の句は「程度」の幅が認められ、伸ばし方で長さが変わるので最後にする。
// 外れの大きさで順を変える案は採らなかった。項目ごとに幅の広さが違い、外れを比べる物差しを新しく決めることになり、それは測定の定義の変更になる。
// 決まり字までの速さは、測定の定義で出さないと決めているので、順に入れない。声の大きさは良し悪しを判定しないので入れない。
export const PRIORITY: readonly RangeItem[] = ['ma', 'shimoPlusYoin', 'kami'];

// site/karuta.ts の cardUrl と同じ規則である。スキルのスクリプトは site/ を読み込まないので写し、一致はテストが確かめる。
const cardPage =(no: number) => `/karuta/${no === 0 ? 'joka' : no}/`;
const pageOf = (item: RangeItem, pair: Pair) => (item === 'ma' ? '/soron/' : cardPage(item === 'shimoPlusYoin' ? pair.shimo : pair.kami));

export function nextPoint(measurement: Measurement, pair: Pair, use: Definition = standard): NextPoint {
  const seconds = PRIORITY.map((item) => ({ item, seconds: measurement[item] }));
  if (seconds.some(({ seconds }) => seconds.status === 'unmeasured' && seconds.reason !== 'cut-off')) return { kind: 'hidden' };
  const measured = seconds.flatMap(({ item, seconds }) => (seconds.status === 'ok' ? [{ item, placement: rangePlacement(seconds.sec, use.ranges[item]) }] : []));
  if (measured.length === 0) return { kind: 'hidden' };
  const [off] = measured.flatMap(({ item, placement }) => (placement === 'inside' ? [] : [{ item, placement }]));
  if (!off) return { kind: 'clear' };
  const { item, placement } = off;
  const { fix, reason, how } = texts.points[item][placement];
  return { kind: 'point', point: { item, placement, fix, reason, how, link: { label: texts.points[item].link, url: pageOf(item, pair) } } };
}
