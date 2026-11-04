// 選べる測定の定義と値（判定の幅の目安を含む）を置く1か所のデータ。文で読む定義は docs/measure.md にあり、表の行がこの値と一致することをテストが確かめる。
// 値を変えるときは、この行と docs/measure.md の「定義のデータ」の表の同じ行を直す。

export const voicedSpanMethods = ['floor-45-30', 'speech-20-15', 'voiced-level-20'] as const;
export type VoicedSpanMethod = (typeof voicedSpanMethods)[number];

export type ErrorTarget = { medianSec: number; p90Sec: number };
export type ErrorTargetItem = 'shimoPlusYoin' | 'ma' | 'kami' | 'pace' | 'yoin';
export type Range = { minSec: number; maxSec: number };
export type RangeItem = 'ma' | 'shimoPlusYoin' | 'kami';

export type Definition = {
  window: { lookbackSec: number };
  noise: { minPhraseSec: number };
  voicedSpan: { method: VoicedSpanMethod; minRangeDb: number };
  // 録音だけから最後の音の始まりを取る方法でも、お手本の区切りを写す方法でも、誤差が目標に届かない。目標に届く取り方ができるまで、型で false に留める。
  yoin: { countFrom: 'last-mora-onset' | 'after-last-mora'; output: false };
  // 出すにはお手本の区切りの値が要る。区切りの値は読手の測定値なので、読手の確認が取れるまでリポジトリに入れない。
  pace: { per: 'first-phrase-mora' | 'kimariji-mora'; output: false };
  level: 'never' | 'when-auto-gain-off' | 'always';
  errorTargets: Record<ErrorTargetItem, ErrorTarget>;
  // どの幅も目安で、画面とスキルの答えでは「目安」と書き、出典は書かない。幅のない項目には判定を付けない。
  ranges: Record<RangeItem, Range>;
};

export const definition: Definition = {
  window: { lookbackSec: 0.5 },
  noise: { minPhraseSec: 0.5 },
  voicedSpan: { method: 'voiced-level-20', minRangeDb: 20 },
  yoin: { countFrom: 'last-mora-onset', output: false },
  pace: { per: 'first-phrase-mora', output: false },
  level: 'when-auto-gain-off',
  errorTargets: {
    ma: { medianSec: 0.05, p90Sec: 0.1 },
    shimoPlusYoin: { medianSec: 0.1, p90Sec: 0.2 },
    kami: { medianSec: 0.1, p90Sec: 0.2 },
    pace: { medianSec: 0.015, p90Sec: 0.03 },
    yoin: { medianSec: 0.05, p90Sec: 0.1 },
  },
  ranges: {
    ma: { minSec: 0.9, maxSec: 1.2 },
    shimoPlusYoin: { minSec: 7.6, maxSec: 8.9 },
    kami: { minSec: 5.7, maxSec: 7.5 },
  },
};
