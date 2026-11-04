// リポジトリの外の録音を、Web とスキルと同じ measure.ts で測り、基準との誤差の統計と合否だけを出す。
// 組ごとの値は出さず、ファイルにも書かない。録音と基準の値は、リポジトリの外の一覧（JSON）で受け取る。
// どの録音で確かめたかが出力から分からないよう、録音のパスと一覧の見出しは出さない。
// 実行：npm run eval:real -- <一覧の JSON> [--method <声の区間の候補>]
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { definition, voicedSpanMethods, type Definition, type ErrorTarget, type VoicedSpanMethod } from '../../.claude/skills/yomimasu/scripts/definition.ts';
import { measure, measureKami, type Recording, type Seconds } from '../../.claude/skills/yomimasu/scripts/measure.ts';
import { addExtras, type Extra } from '../../test/support/synth.ts';

// 一覧の形。1つの clip は、parts を順につないだ1回の録音である。
// part は音声ファイルの一部（.f32 は sampleRate が要る。.wav は 16 bit のモノラル）か、部屋の音の秒数である。
// 部屋の音は room のファイルの一部を繰り返して作るか、room.noiseDb の白い雑音で作る。
// readingStartSec と readingEndSec は、つないだ録音の頭からの秒である。アプリの録音と同じく、読み始めの前に合図の時間を含めておく。
type Source = { path: string; sampleRate?: number; fromSec?: number; toSec?: number };
type Part = Source | { roomSec: number };
type Item = 'shimoPlusYoin' | 'ma' | 'kami';
type Clip = {
  kind?: 'pair' | 'kami';
  parts: Part[];
  room?: Source | { noiseDb: number };
  readingStartSec: number;
  readingEndSec?: number;
  truth: Partial<Record<Item, number>>;
};
type Manifest = { clips: Clip[] };

const ITEMS: Record<Item, string> = { shimoPlusYoin: '下の句＋余韻', ma: '間', kami: '上の句' };
// 秒は 0.01 秒に丸めて返るので、目標の値ちょうどの誤差を浮動小数の端数で不合格にしない。
const EPSILON = 1e-6;

const { values, positionals } = parseArgs({ allowPositionals: true, options: { method: { type: 'string' } } });
if (!positionals[0]) {
  console.error('使い方：npm run eval:real -- <一覧の JSON> [--method <声の区間の候補>]');
  process.exit(2);
}
const method = (values.method ?? definition.voicedSpan.method) as VoicedSpanMethod;
if (!voicedSpanMethods.includes(method)) {
  console.error(`声の区間の候補は ${voicedSpanMethods.join('、')} のどれかです。`);
  process.exit(2);
}
const use: Definition = { ...definition, voicedSpan: { ...definition.voicedSpan, method } };
const manifest = JSON.parse(readFileSync(positionals[0], 'utf8')) as Manifest;

const files = new Map<string, { pcm: Float32Array; sampleRate: number }>();

function readWav(path: string): { pcm: Float32Array; sampleRate: number } {
  const bytes = readFileSync(path);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let sampleRate = 0;
  for (let at = 12; at + 8 <= bytes.length; ) {
    const id = bytes.toString('latin1', at, at + 4);
    const size = view.getUint32(at + 4, true);
    if (id === 'fmt ') {
      if (view.getUint16(at + 8, true) !== 1 || view.getUint16(at + 10, true) !== 1 || view.getUint16(at + 22, true) !== 16) throw new Error('wav が 16 bit のモノラルの PCM ではありません。');
      sampleRate = view.getUint32(at + 12, true);
    }
    if (id === 'data') {
      const pcm = new Float32Array(Math.floor(size / 2));
      for (let i = 0; i < pcm.length; i++) pcm[i] = view.getInt16(at + 8 + i * 2, true) / 32768;
      return { pcm, sampleRate };
    }
    at += 8 + size + (size % 2);
  }
  throw new Error('wav に音のデータがありません。');
}

function open({ path, sampleRate }: Source) {
  if (!files.has(path)) {
    if (path.endsWith('.wav')) files.set(path, readWav(path));
    else {
      if (!sampleRate) throw new Error('.f32 の part に sampleRate がありません。');
      const bytes = readFileSync(path);
      files.set(path, { pcm: new Float32Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 4)), sampleRate });
    }
  }
  return files.get(path)!;
}

function slice(source: Source) {
  const { pcm, sampleRate } = open(source);
  return { pcm: pcm.subarray(Math.round((source.fromSec ?? 0) * sampleRate), source.toSec === undefined ? pcm.length : Math.round(source.toSec * sampleRate)), sampleRate };
}

// 白い雑音は、作るたびに同じになるよう決まった乱数で作る。
function noise(length: number, db: number) {
  let seed = 20261105;
  const amplitude = 10 ** (db / 20) * Math.sqrt(3);
  return Float32Array.from({ length }, () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    return amplitude * ((seed >>> 0) / 2 ** 31 - 1);
  });
}

function assemble(clip: Clip): Recording {
  const sources = clip.parts.filter((part): part is Source => 'path' in part).map(slice);
  const sampleRate = sources[0]?.sampleRate;
  if (!sampleRate || sources.some((source) => source.sampleRate !== sampleRate)) throw new Error('1つの clip の音声は、同じ標本化周波数でそろえてください。');
  const roomSamples = (seconds: number) => {
    const length = Math.round(seconds * sampleRate);
    if (!clip.room) throw new Error('部屋の音を足す clip には room が要ります。');
    if ('noiseDb' in clip.room) return noise(length, clip.room.noiseDb);
    const room = slice(clip.room).pcm;
    return Float32Array.from({ length }, (_, i) => room[i % room.length]);
  };
  let next = 0;
  const pieces = clip.parts.map((part) => ('path' in part ? sources[next++].pcm : roomSamples(part.roomSec)));
  const pcm = new Float32Array(pieces.reduce((sum, piece) => sum + piece.length, 0));
  let at = 0;
  for (const piece of pieces) {
    pcm.set(piece, at);
    at += piece.length;
  }
  return { pcm, sampleRate, readingStartSec: clip.readingStartSec };
}

type Result = Partial<Record<Item, Seconds>>;
const measured = (clip: Clip, recording: Recording): Result => (clip.kind === 'kami' ? measureKami(recording, use) : measure(recording, use));

const median = (sorted: number[]) => (sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2);
// 10組のうち9組が入る幅として、小さい方から数えて 90% の位置の値を取る。
const p90 = (sorted: number[]) => sorted[Math.max(0, Math.ceil(sorted.length * 0.9) - 1)];
const fixed = (value: number) => value.toFixed(3);

function report(clips: Clip[], recordings: Recording[]) {
  const started = performance.now();
  const results = clips.map((clip, index) => measured(clip, recordings[index]));
  const msPerClip = (performance.now() - started) / clips.length;
  console.log(`\n### 基準との比べ\n\n${clips.length}件、声の区間は ${method}、1件あたり ${msPerClip.toFixed(0)} ms。誤差は測定から基準を引いた秒である。\n`);
  console.log('| 項目 | 測れた件数 | 測れない件数 | 偏り（中央値） | 誤差の絶対値の中央値 | 90%点 | 最大 | 目標（中央値 / 90%点） | 合否 |');
  console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  const verdicts: Partial<Record<Item, boolean>> = {};
  for (const item of Object.keys(ITEMS) as Item[]) {
    const errors: number[] = [];
    const reasons = new Map<string, number>();
    results.forEach((result, index) => {
      const truth = clips[index].truth[item];
      const value = result[item];
      if (truth === undefined || !value) return;
      if (value.status === 'ok') errors.push(value.sec - truth);
      else reasons.set(value.reason, (reasons.get(value.reason) ?? 0) + 1);
    });
    const failed = [...reasons].map(([reason, count]) => `${reason} ${count}`).join('、') || '0';
    if (errors.length === 0 && reasons.size === 0) continue;
    if (errors.length === 0) {
      console.log(`| ${ITEMS[item]} | 0 | ${failed} | | | | | | 不合格 |`);
      verdicts[item] = false;
      continue;
    }
    const signed = [...errors].sort((a, b) => a - b);
    const absolute = errors.map(Math.abs).sort((a, b) => a - b);
    const target: ErrorTarget = use.errorTargets[item];
    const pass = reasons.size === 0 && median(absolute) <= target.medianSec + EPSILON && p90(absolute) <= target.p90Sec + EPSILON;
    verdicts[item] = pass;
    console.log(`| ${ITEMS[item]} | ${errors.length} | ${failed} | ${fixed(median(signed))} | ${fixed(median(absolute))} | ${fixed(p90(absolute))} | ${fixed(absolute.at(-1)!)} | ${target.medianSec} / ${target.p90Sec} | ${pass ? '合格' : '不合格'} |`);
  }
  return verdicts;
}

// 合図の間に声と物音を、読み終えたあとに声、物音、ボタンの音を足しても、値が 0.01 秒より動かないことを確かめる。
function surroundings(clip: Clip, recording: Recording, seed: number): Recording | null {
  const endSec = clip.readingEndSec;
  const lengthSec = recording.pcm.length / recording.sampleRate;
  if (endSec === undefined || clip.readingStartSec < 2.4 || lengthSec < endSec + 2.7) return null;
  const start = clip.readingStartSec;
  const extras: Extra[] = [
    { kind: 'voice', atSec: start - 2.3, lengthSec: 0.6 },
    { kind: 'thud', atSec: start - 1.2, lengthSec: 0.2 },
    // 測る範囲は読み始めの少し前から始まるので、範囲の中に入る合図の終わりの物音も足す。
    { kind: 'thud', atSec: start - 0.4, lengthSec: 0.15 },
    { kind: 'voice', atSec: endSec + 1, lengthSec: 0.3 },
    { kind: 'thud', atSec: endSec + 1.8, lengthSec: 0.2 },
    { kind: 'click', atSec: endSec + 2.6, lengthSec: 0.005 },
  ];
  const pcm = Float32Array.from(recording.pcm);
  addExtras(pcm, recording.sampleRate, extras, seed);
  return { ...recording, pcm };
}

function reportSurroundings(clips: Clip[], recordings: Recording[]) {
  const moved = new Map<Item, number[]>();
  clips.forEach((clip, index) => {
    const noisy = surroundings(clip, recordings[index], 20261105 + index);
    if (!noisy) return;
    const plain = measured(clip, recordings[index]);
    const surrounded = measured(clip, noisy);
    for (const item of Object.keys(ITEMS) as Item[]) {
      const [a, b] = [plain[item], surrounded[item]];
      if (!a || !b) continue;
      if (!moved.has(item)) moved.set(item, []);
      moved.get(item)!.push(a.status === 'ok' && b.status === 'ok' ? Math.abs(b.sec - a.sec) : a.status === b.status ? 0 : Infinity);
    }
  });
  if (moved.size === 0) {
    console.log('\n### 前後に物音と短い声を足した録音\n\n確かめていない。前に 2.4 秒の合図の時間と、あとに 2.7 秒の余白を持ち、readingEndSec のある件がない。');
    return false;
  }
  console.log(`\n### 前後に物音と短い声を足した録音\n\n${moved.values().next().value!.length}件。足す前の値と比べた。測れたかどうかが変わった件は「動きの最大」を ∞ とする。\n`);
  console.log('| 項目 | 0.01 秒より動いた件数 | 動きの最大 | 合否 |');
  console.log('| --- | --- | --- | --- |');
  let allPass = true;
  for (const [item, moves] of moved) {
    const changed = moves.filter((value) => value > 0.01 + EPSILON).length;
    const largest = Math.max(0, ...moves);
    allPass &&= changed === 0;
    console.log(`| ${ITEMS[item]} | ${changed} | ${Number.isFinite(largest) ? fixed(largest) : '∞'} | ${changed === 0 ? '合格' : '不合格'} |`);
  }
  return allPass;
}

const recordings = manifest.clips.map(assemble);
const verdicts = Object.values(report(manifest.clips, recordings));
const steady = reportSurroundings(manifest.clips, recordings);
if (verdicts.length === 0) console.log('\n基準の値のある件がないので、誤差を確かめていない。');
const pass = steady && verdicts.length > 0 && verdicts.every((verdict) => verdict);
console.log(`\n全体：${pass ? '合格' : '不合格'}`);
process.exitCode = pass ? 0 : 1;
