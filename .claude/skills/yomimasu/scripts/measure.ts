// 定義は docs/measure.md に置き、選択と値は definition.ts に置く。ここを変えるときは定義も一緒に変える。
import { definition as standard, type Definition, type Range, type VoicedSpanMethod } from './definition.ts';

export type Unmeasured = 'too-quiet' | 'no-gap' | 'cut-off';
export type Seconds = { status: 'ok'; sec: number } | { status: 'unmeasured'; reason: Unmeasured };
export type Level = { status: 'ok'; db: number } | { status: 'unmeasured'; reason: 'too-quiet' | 'auto-gain' };
export type Measurement = { shimoPlusYoin: Seconds; ma: Seconds; kami: Seconds; level?: Level };
// 序歌の上の句は、前に下の句がないので1つだけで測る。
export type KamiMeasurement = { kami: Seconds; level?: Level };

// readingStartSec は録音の頭から帯が動き始めた位置までの秒である。
// autoGainControl は録音の設定の値で、false のときだけ自動の音量調整が切れていると見なす。
// 設定の値を信じられない端末（実機で確かめるまでの iPhone）では、呼ぶ側が false を渡さない。
export type Recording = { pcm: Float32Array; sampleRate: number; readingStartSec: number; autoGainControl?: boolean };

type Span = { start: number; end: number };
// 位置はフレームの番号で、1フレームは HOP_SEC 秒である。cut は、声が測る範囲の端で切れていて端の時刻が分からないことを表す。
type Cut = { start: boolean; end: boolean };
type Marks = { shimoStart: number; shimoEnd: number; kamiStart: number; kamiEnd: number; cut: Cut };
type Single = { start: number; end: number; cut: Cut };
type Method = { pair: (analysis: Analysis, use: Definition) => Marks | null; single: (analysis: Analysis, use: Definition) => Single | null };
type Analysis = { levels: Float64Array; floorDb: number; speechDb: number; pcm: Float32Array; sampleRate: number };

const HOP_SEC = 0.01;
const WINDOW_SEC = 0.02;
const HIGH_PASS_HZ = 80;
const MIN_GAP_SEC = 0.25;

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

// 閾値を上回ってから下回るまでを声とし、短い切れ目をつなぐ。どの無音が間かを決める前に、声だった長さの合計が短いまとまりを物音として捨てる。
// 端から端までの長さで捨てると、部屋の音に混じる一瞬の周期の音が近くの短い声とつながり、物音の長さを超えて残る。
// つなぐ前に一瞬の区間を捨てる案は採らなかった。句の端の短い区間も消え、録音で確かめると間の誤差が増えた。
function spans(track: Float64Array, onAtLeast: number, offBelow: number, minPhraseSec: number): Span[] {
  const raw: Span[] = [];
  let openedAt: number | null = null;
  track.forEach((value, frame) => {
    if (openedAt === null && value >= onAtLeast) openedAt = frame;
    if (openedAt !== null && value < offBelow) {
      raw.push({ start: openedAt, end: frame });
      openedAt = null;
    }
  });
  if (openedAt !== null) raw.push({ start: openedAt, end: track.length });
  const merged: (Span & { voiced: number })[] = [];
  for (const span of raw) {
    const last = merged.at(-1);
    if (last && (span.start - last.end) * HOP_SEC < MIN_GAP_SEC) {
      last.end = span.end;
      last.voiced += span.end - span.start;
    } else merged.push({ ...span, voiced: span.end - span.start });
  }
  return merged.filter(({ voiced }) => voiced * HOP_SEC >= minPhraseSec).map(({ start, end }) => ({ start, end }));
}

function longestGap(found: Span[]): number {
  let index = 0;
  for (let i = 1; i + 1 < found.length; i++) {
    if (found[i + 1].start - found[i].end > found[index + 1].start - found[index].end) index = i;
  }
  return index;
}

function marksOf(found: Span[], frames: number): Marks | null {
  if (found.length < 2) return null;
  const gap = longestGap(found);
  const last = found.at(-1)!;
  return {
    shimoStart: found[0].start,
    shimoEnd: found[gap].end,
    kamiStart: found[gap + 1].start,
    kamiEnd: last.end,
    cut: { start: found[0].start === 0, end: last.end >= frames },
  };
}

function singleOf(found: Span[], frames: number): Single | null {
  if (found.length === 0) return null;
  const last = found.at(-1)!;
  return { start: found[0].start, end: last.end, cut: { start: found[0].start === 0, end: last.end >= frames } };
}

function byLevel(thresholds: (analysis: Analysis) => [onDb: number, offDb: number]): Method {
  const found = (analysis: Analysis, use: Definition) => spans(analysis.levels, ...thresholds(analysis), use.noise.minPhraseSec);
  return {
    pair: (analysis, use) => marksOf(found(analysis, use), analysis.levels.length),
    single: (analysis, use) => singleOf(found(analysis, use), analysis.levels.length),
  };
}

const floorRatio = byLevel(({ floorDb, speechDb }) => [floorDb + 0.45 * (speechDb - floorDb), floorDb + 0.3 * (speechDb - floorDb)]);

// 閾値を声の大きさから測る。開始の閾値が終わりの閾値より低いのは、比べた候補の値のままである。
const speechDrop = byLevel(({ floorDb, speechDb }) => [Math.max(speechDb - 20, floorDb + 6), Math.max(speechDb - 15, floorDb + 6)]);

// 声の周期性の強さを 10 ms ごとに返す。自動の音量調整で持ち上がる背景は周期を持たないので、声と分けられる。
function voicingTrack(pcm: Float32Array, sampleRate: number): Float64Array {
  const decimate = Math.max(1, Math.round(sampleRate / 8000));
  const rate = sampleRate / decimate;
  const reduced = new Float64Array(Math.floor(pcm.length / decimate));
  for (let i = 0; i < reduced.length; i++) {
    let sum = 0;
    for (let k = 0; k < decimate; k++) sum += pcm[i * decimate + k];
    reduced[i] = sum / decimate;
  }
  // 電源の音の倍音を周期として拾わないよう、200 Hz より下を落とす。
  const pole = Math.exp((-2 * Math.PI * 200) / rate);
  let previousIn = 0;
  let previousOut = 0;
  for (let i = 0; i < reduced.length; i++) {
    const value = reduced[i];
    previousOut = pole * (previousOut + value - previousIn);
    previousIn = value;
    reduced[i] = previousOut;
  }
  const window = Math.round(0.03 * rate);
  const minLag = Math.round(rate / 500);
  const maxLag = Math.round(rate / 60);
  const frames = Math.max(0, Math.floor((reduced.length - window - maxLag) / (HOP_SEC * rate)));
  const track = new Float64Array(frames);
  for (let frame = 0; frame < frames; frame++) {
    const start = Math.round(frame * HOP_SEC * rate);
    let energy = 1e-12;
    for (let i = 0; i < window; i++) energy += reduced[start + i] ** 2;
    let best = 0;
    for (let lag = minLag; lag <= maxLag; lag++) {
      let cross = 0;
      let other = 1e-12;
      for (let i = 0; i < window; i++) {
        cross += reduced[start + i] * reduced[start + i + lag];
        other += reduced[start + i + lag] ** 2;
      }
      best = Math.max(best, cross / Math.sqrt(energy * other));
    }
    track[frame] = best;
  }
  return track;
}

const VOICING = 0.8;
const SUSTAIN_DROP_DB = 20;
const MARGIN_DB = 6;

// 周期の始まりから、音量が背景より MARGIN_DB 高い間、0.2 秒まで前へ戻る。子音と息の入りを声に含めるためである。
function walkBack(levels: Float64Array, frame: number, backgroundDb: number) {
  let current = frame;
  while (current > 0 && frame - current < 20 && levels[current - 1] > backgroundDb + MARGIN_DB) current--;
  return current;
}

// どの無音が間かを周期性で決め、声の終わりは最後の音の音量から 20 dB 下がった所とする。背景の高さは間そのものから取る。
// 周期性のまとまりが2つに分かれないときは、音量の定義に戻す。背景に人の声があると、周期性では間を見つけられないからである。
const voicedLevel: Method = {
  pair(analysis, use) {
    const { levels } = analysis;
    const track = voicingTrack(analysis.pcm, analysis.sampleRate);
    const found = spans(track, VOICING, VOICING, use.noise.minPhraseSec);
    if (found.length < 2) return floorRatio.pair(analysis, use);
    const gap = longestGap(found);
    const voicedEnd = found[gap].end;
    const nextVoiced = found[gap + 1].start;
    const gapDb = percentile(levels.slice(voicedEnd + 5, Math.max(voicedEnd + 6, nextVoiced - 5)), 0.5);
    const sustainDb = percentile(levels.slice(Math.max(0, voicedEnd - 150), Math.max(1, voicedEnd - 20)), 0.9);
    const endDb = Math.max(sustainDb - SUSTAIN_DROP_DB, gapDb + MARGIN_DB);
    let end = Math.min(levels.length - 1, voicedEnd + 40, nextVoiced - 5);
    // 背景が声の高さまで持ち上がると閾値を超える点がなくなるので、周期の終わりから離れすぎないようにする。
    while (end > voicedEnd - 30 && levels[end] < endDb) end--;
    const shimoStart = walkBack(levels, found[0].start, gapDb);
    const last = found.at(-1)!;
    return {
      shimoStart,
      shimoEnd: end + 1,
      kamiStart: walkBack(levels, nextVoiced, gapDb),
      kamiEnd: last.end,
      cut: { start: shimoStart === 0, end: last.end >= track.length },
    };
  },
  // 上の句だけの録音には間がないので、背景の高さは測る範囲の音量の下位5%から取る。
  single(analysis, use) {
    const track = voicingTrack(analysis.pcm, analysis.sampleRate);
    const found = spans(track, VOICING, VOICING, use.noise.minPhraseSec);
    if (found.length === 0) return floorRatio.single(analysis, use);
    const start = walkBack(analysis.levels, found[0].start, analysis.floorDb);
    const last = found.at(-1)!;
    return { start, end: last.end, cut: { start: start === 0, end: last.end >= track.length } };
  },
};

const methods: Record<VoicedSpanMethod, Method> = {
  'floor-45-30': floorRatio,
  'speech-20-15': speechDrop,
  'voiced-level-20': voicedLevel,
};

// 実行環境ごとに dB の下位の桁が変わるので、Web とスキルの値が一致するよう丸めて返す。
const roundSec = (sec: number) => Math.round(sec * 100) / 100;
const seconds = (frames: number, cut: boolean): Seconds => (cut ? { status: 'unmeasured', reason: 'cut-off' } : { status: 'ok', sec: roundSec(frames * HOP_SEC) });
const unmeasured = (reason: Unmeasured): Seconds => ({ status: 'unmeasured', reason });
const allUnmeasured = (reason: Unmeasured) => ({ shimoPlusYoin: unmeasured(reason), ma: unmeasured(reason), kami: unmeasured(reason) });

function levelOf(recording: Recording, analysis: Analysis, quiet: boolean, use: Definition): { level?: Level } {
  if (use.level === 'never') return {};
  if (quiet) return { level: { status: 'unmeasured', reason: 'too-quiet' } };
  if (use.level === 'when-auto-gain-off' && recording.autoGainControl !== false) return { level: { status: 'unmeasured', reason: 'auto-gain' } };
  return { level: { status: 'ok', db: Math.round(analysis.speechDb) } };
}

function analyze(recording: Recording, use: Definition) {
  const { sampleRate } = recording;
  const from = Math.max(0, Math.round((recording.readingStartSec - use.window.lookbackSec) * sampleRate));
  const pcm = recording.pcm.subarray(from);
  const levels = frameLevelsDb(pcm, sampleRate);
  const analysis: Analysis = { levels, floorDb: percentile(levels, 0.05), speechDb: percentile(levels, 0.95), pcm, sampleRate };
  const quiet = levels.length === 0 || analysis.speechDb - analysis.floorDb < use.voicedSpan.minRangeDb;
  return { analysis, quiet, level: levelOf(recording, analysis, quiet, use) };
}

export function measure(recording: Recording, use: Definition = standard): Measurement {
  const { analysis, quiet, level } = analyze(recording, use);
  if (quiet) return { ...allUnmeasured('too-quiet'), ...level };
  const marks = methods[use.voicedSpan.method].pair(analysis, use);
  if (!marks) return { ...allUnmeasured('no-gap'), ...level };
  return {
    shimoPlusYoin: seconds(marks.shimoEnd - marks.shimoStart, marks.cut.start),
    ma: seconds(marks.kamiStart - marks.shimoEnd, false),
    kami: seconds(marks.kamiEnd - marks.kamiStart, marks.cut.end),
    ...level,
  };
}

// 声のまとまりが1つもないときは、上位5%の音量が物音の大きさなので、声の大きさも出さない。
export function measureKami(recording: Recording, use: Definition = standard): KamiMeasurement {
  const { analysis, quiet, level } = analyze(recording, use);
  const single = quiet ? null : methods[use.voicedSpan.method].single(analysis, use);
  if (!single) return { kami: unmeasured('too-quiet'), ...levelOf(recording, analysis, true, use) };
  return { kami: seconds(single.end - single.start, single.cut.start || single.cut.end), ...level };
}

// 判定は Web とスキルで同じにするので、ここで決める。幅は両端を含み、measure が返す 0.01 秒の値で比べる。
export type Placement = 'inside' | 'above' | 'below';

export function rangePlacement(sec: number, range: Range): Placement {
  if (sec > range.maxSec) return 'above';
  if (sec < range.minSec) return 'below';
  return 'inside';
}
