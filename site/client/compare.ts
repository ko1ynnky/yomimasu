import deck from '../../.claude/skills/yomimasu/assets/cards.json' with { type: 'json' };
import type { Card } from '../../.claude/skills/yomimasu/scripts/cards.ts';
import { tenthSec, type Measurement } from '../../.claude/skills/yomimasu/scripts/measure.ts';
import type { Pair } from './pair.ts';

const cards = deck.cards as unknown as Card[];

export type MaSpread = { count: number; mean: string; width: string; range: string };

const tenths = (sec: number) => Math.round(tenthSec(sec) * 10);
const shown = (tenthCount: number) => `${(tenthCount / 10).toFixed(1)}秒`;

// 間を測れた回が2回以上あるときだけ出す。測った秒を集めるだけで、音から新しく測る項目ではない。
// ばらつきは、いちばん短い回と長い回の差にする。標準偏差は採らなかった。2〜3回では値が揺れやすく、選手と保護者にも伝わりにくい。
// 差は見せる 0.1 秒の値どうしで取る。0.01 秒の値の差を丸めると、並べた「1.0〜1.6秒」と「0.7秒」のように食い違うことがある。
// 平均は 0.01 秒の値を 100分の1秒の整数で足し、割り算を1回にして 0.1 秒へ丸める。平均を tenthSec に通すと、0.01 秒と 0.1 秒の2回丸めることになる。
// 判定の語は付けない。ばらつきの幅の目安は測定の定義にないので、良し悪しを言えない。
export function maSpread(measurements: readonly Measurement[]): MaSpread | null {
  const seconds = measurements.flatMap(({ ma }) => (ma.status === 'ok' ? [ma.sec] : []));
  if (seconds.length < 2) return null;
  const hundredths = seconds.reduce((sum, sec) => sum + Math.round(sec * 100), 0);
  const shortest = Math.min(...seconds.map(tenths));
  const longest = Math.max(...seconds.map(tenths));
  return {
    count: seconds.length,
    mean: shown(Math.round(hundredths / (seconds.length * 10))),
    width: shown(longest - shortest),
    range: `${(shortest / 10).toFixed(1)}〜${shown(longest)}`,
  };
}

export const recordedAtLabel = (time: number) => {
  const at = new Date(time);
  return `${at.getMonth() + 1}月${at.getDate()}日 ${at.getHours()}:${String(at.getMinutes()).padStart(2, '0')}`;
};

export const pairLabel = ({ shimo, kami }: Pair) => [shimo, kami].map((no) => cards.find((card) => card.no === no)?.kimariji?.kana ?? `${no}番`).join(' ');
