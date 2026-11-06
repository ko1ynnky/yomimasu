// 結果の行と文。Web の結果の画面とスキルの答えが同じ文を出すよう、ここだけに置く。
import { definition, type RangeItem } from './definition.ts';
import { rangePlacement, tenthSec, type Measurement, type Placement, type Unmeasured } from './measure.ts';

export type Verdict = 'ちょうどよい' | 'ちょっと長い' | 'ちょっと短い';
export type Row = { item: RangeItem; label: string; reference: string; value: string | null; verdict: Verdict | null; unmeasured: boolean };

// 行の順は docs/ui-guide.md の10節で固定している。決まり字までの速さは Measurement にないので行を作らない。
// 標準の値は 5・3・1・6 の方式から出す。幅のある項目は幅を目安として出し、出典は書かない。
const ITEMS: readonly { item: RangeItem; label: string; standard: string }[] = [
  { item: 'shimoPlusYoin', label: '下の句＋余韻', standard: '標準 8秒程度' },
  { item: 'ma', label: '間', standard: '標準 1秒' },
  { item: 'kami', label: '上の句', standard: '標準 6秒程度' },
];

const VERDICTS: Record<Placement, Verdict> = { inside: 'ちょうどよい', above: 'ちょっと長い', below: 'ちょっと短い' };

export function resultRows(measurement: Measurement, ranges: Partial<typeof definition.ranges> = definition.ranges): Row[] {
  return ITEMS.map(({ item, label, standard }) => {
    const range = ranges[item];
    const reference = range ? `目安 ${range.minSec}〜${range.maxSec}秒` : standard;
    const seconds = measurement[item];
    if (seconds.status !== 'ok') return { item, label, reference, value: null, verdict: null, unmeasured: true };
    return { item, label, reference, value: `${tenthSec(seconds.sec).toFixed(1)}秒`, verdict: range ? VERDICTS[rangePlacement(seconds.sec, range)] : null, unmeasured: false };
  });
}

const NOTICES: Partial<Record<Unmeasured, string>> = {
  'too-quiet': '声を聞き取れず、測れませんでした。読み直すか、静かな場所で試してください。',
  'no-gap': '読みの切れ目が見つからず、測れませんでした。間を空けて読み直してください。',
};

// 文言は docs/ui-guide.md の11節にある。一部の項目だけ測れないときは、行の「測れませんでした」で伝える。
export function noticeOf(measurement: Measurement): string | null {
  const reasons = new Set(ITEMS.map(({ item }) => measurement[item]).map((seconds) => (seconds.status === 'ok' ? null : seconds.reason)));
  if (reasons.size !== 1) return null;
  const [reason] = reasons;
  return reason ? (NOTICES[reason] ?? null) : null;
}

// 声の大きさは評価しないので、行にせず文の中で参考として出す。
export function levelSentence(measurement: Measurement): string | null {
  if (measurement.level?.status !== 'ok') return null;
  return `今回の音量は ${measurement.level.db} dB でした。参考の値で、端末と持ち方で変わります。`;
}

// 結果の画面（docs/ui-guide.md の10節）が必ず出す文。
export const NOT_MEASURED = '明瞭さは測っていません。お手本と聴き比べてください。';
export const UNMEASURED_ROW = '測れませんでした';
