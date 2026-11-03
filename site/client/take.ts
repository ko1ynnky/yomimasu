import type { Pair } from './pair.ts';

// 測定と再生はこの形だけを読む。合図の間の音を測定に渡さないよう、帯が動き始めた位置を持つ。
export type Take = {
  pcm: Float32Array;
  sampleRate: number;
  readingStartSec: number;
  assisted: boolean;
  pair: Pair;
};

// 録音は端末の外へ出さず、ページを開き直せば消える。保存して残すのは C8 で決める。
let latest: Take | null = null;

export const lastTake = (): Take | null => latest;

export function putLastTake(take: Take) {
  latest = take;
}

export function clearLastTake() {
  latest = null;
}
