import { measure, type Measurement } from '../../.claude/skills/yomimasu/scripts/measure.ts';
import type { VoiceProcessing } from './capture.ts';
import type { Pair } from './pair.ts';

// 測定と再生はこの形だけを読む。合図の間の音を測定に渡さないよう、帯が動き始めた位置を持つ。
// 声の処理の設定も持つ。端末に残した録音でも、音量の参考値を出すかを録音ごとにあとで決められるようにするためである。
export type Take = {
  pcm: Float32Array;
  sampleRate: number;
  readingStartSec: number;
  assisted: boolean;
  pair: Pair;
  voiceProcessing: VoiceProcessing;
};

// 開いている画面のあいだの置き場で、ページを開き直せば消える。端末に残すのは records.ts である。
let latest: Take | null = null;

export const lastTake = (): Take | null => latest;

export function putLastTake(take: Take) {
  latest = take;
}

export function clearLastTake() {
  latest = null;
}

// 1本を測るのに数百ミリ秒かかる端末があるので、残すときと結果の画面で2回測らない。
const measured = new WeakMap<Take, Measurement>();

export function measurementOf(take: Take): Measurement {
  const known = measured.get(take);
  if (known) return known;
  const measurement = measure(take);
  measured.set(take, measurement);
  return measurement;
}
