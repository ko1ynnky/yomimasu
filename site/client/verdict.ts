import { definition, type RangeItem } from '../../.claude/skills/yomimasu/scripts/definition.ts';
import { rangePlacement, type Measurement, type Placement, type Unmeasured } from '../../.claude/skills/yomimasu/scripts/measure.ts';

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
    // 判定と同じ 0.01 秒の値を出す。0.1 秒に丸めて出すと、「1.2秒」と出して「ちょっと長い」と付くことがある。
    // 0.1 秒に丸めた値で判定する案は採らなかった。判定の決め方が Web だけのものになり、スキルの答えと食い違う。
    return { item, label, reference, value: `${seconds.sec.toFixed(2)}秒`, verdict: range ? VERDICTS[rangePlacement(seconds.sec, range)] : null, unmeasured: false };
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
