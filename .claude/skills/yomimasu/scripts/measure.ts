// 定義は docs/measure.md に置く。ここを変えるときは定義も一緒に変える。

export type Measurement =
  | { status: 'ok'; shimoPlusYoinSec: number; maSec: number; kamiSec: number }
  | { status: 'too-quiet' }
  | { status: 'no-gap' };

type Segment = { startFrame: number; endFrame: number };

const HOP_SEC = 0.01;
const WINDOW_SEC = 0.02;
const HIGH_PASS_HZ = 80;
const MIN_DYNAMIC_RANGE_DB = 15;
const VOICE_ON_RATIO = 0.45;
const VOICE_OFF_RATIO = 0.3;
const MIN_GAP_SEC = 0.25;
const MIN_VOICE_SEC = 0.1;

function frameLevelsDb(pcm: Float32Array, sampleRate: number): Float64Array {
  const hop = Math.round(HOP_SEC * sampleRate);
  const windowLength = Math.round(WINDOW_SEC * sampleRate);
  const pole = Math.exp((-2 * Math.PI * HIGH_PASS_HZ) / sampleRate);
  const filtered = new Float64Array(pcm.length);
  let previousIn = 0;
  let previousOut = 0;
  for (let i = 0; i < pcm.length; i++) {
    previousOut = pole * (previousOut + pcm[i] - previousIn);
    previousIn = pcm[i];
    filtered[i] = previousOut;
  }
  const levels = new Float64Array(Math.max(0, Math.floor((pcm.length - windowLength) / hop)));
  for (let frame = 0; frame < levels.length; frame++) {
    const start = frame * hop;
    let energy = 0;
    for (let i = start; i < start + windowLength; i++) energy += filtered[i] * filtered[i];
    levels[frame] = 10 * Math.log10(energy / windowLength + 1e-12);
  }
  return levels;
}

function percentile(values: Float64Array, ratio: number): number {
  const sorted = Float64Array.from(values).sort();
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))];
}

function voicedSegments(levels: Float64Array, floorDb: number, speechDb: number): Segment[] {
  const on = floorDb + VOICE_ON_RATIO * (speechDb - floorDb);
  const off = floorDb + VOICE_OFF_RATIO * (speechDb - floorDb);
  const raw: Segment[] = [];
  let openedAt: number | null = null;
  levels.forEach((level, frame) => {
    if (openedAt === null && level > on) openedAt = frame;
    if (openedAt !== null && level < off) {
      raw.push({ startFrame: openedAt, endFrame: frame });
      openedAt = null;
    }
  });
  if (openedAt !== null) raw.push({ startFrame: openedAt, endFrame: levels.length });

  const merged: Segment[] = [];
  for (const segment of raw) {
    const last = merged.at(-1);
    if (last && (segment.startFrame - last.endFrame) * HOP_SEC < MIN_GAP_SEC) last.endFrame = segment.endFrame;
    else merged.push({ ...segment });
  }
  return merged.filter(({ startFrame, endFrame }) => (endFrame - startFrame) * HOP_SEC >= MIN_VOICE_SEC);
}

// 実行環境ごとに dB の下位の桁が変わるので、Web とスキルの値が一致するよう丸めて返す。
const roundSec = (sec: number) => Math.round(sec * 100) / 100;

export function measure(pcm: Float32Array, sampleRate: number): Measurement {
  const levels = frameLevelsDb(pcm, sampleRate);
  const floorDb = percentile(levels, 0.05);
  const speechDb = percentile(levels, 0.95);
  if (speechDb - floorDb < MIN_DYNAMIC_RANGE_DB) return { status: 'too-quiet' };

  const segments = voicedSegments(levels, floorDb, speechDb);
  if (segments.length < 2) return { status: 'no-gap' };

  let gapIndex = 0;
  for (let i = 1; i + 1 < segments.length; i++) {
    const length = segments[i + 1].startFrame - segments[i].endFrame;
    const longest = segments[gapIndex + 1].startFrame - segments[gapIndex].endFrame;
    if (length > longest) gapIndex = i;
  }
  const before = segments[gapIndex];
  const after = segments[gapIndex + 1];
  const last = segments.at(-1)!;
  return {
    status: 'ok',
    shimoPlusYoinSec: roundSec((before.endFrame - segments[0].startFrame) * HOP_SEC),
    maSec: roundSec((after.startFrame - before.endFrame) * HOP_SEC),
    kamiSec: roundSec((last.endFrame - after.startFrame) * HOP_SEC),
  };
}
