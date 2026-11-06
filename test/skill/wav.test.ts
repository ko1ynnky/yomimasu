import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decodeWav } from '../../.claude/skills/yomimasu/scripts/wav.ts';
import { encodeWav } from '../support/wav.ts';

type Format = { format: 1 | 3 | 0xfffe; bits: number; channels: number; sampleRate: number; subFormat?: 1 | 3 };

// 端末やソフトが書き出す形を、テストの中で組み立てる。値は1チャンネルずつ並べ、フレームの順に書く。
function wavOf({ format, bits, channels, sampleRate, subFormat }: Format, frames: number[][], before: [string, number][] = []): Uint8Array {
  const bytesPer = bits / 8;
  const fmtSize = format === 0xfffe ? 40 : 16;
  const extraSize = before.reduce((sum, [, size]) => sum + 8 + size + (size % 2), 0);
  const dataSize = frames.length * channels * bytesPer;
  const bytes = new Uint8Array(12 + 8 + fmtSize + extraSize + 8 + dataSize);
  const view = new DataView(bytes.buffer);
  const text = (at: number, value: string) => [...value].forEach((c, i) => (bytes[at + i] = c.charCodeAt(0)));
  text(0, 'RIFF');
  view.setUint32(4, bytes.length - 8, true);
  text(8, 'WAVE');
  let at = 12;
  text(at, 'fmt ');
  view.setUint32(at + 4, fmtSize, true);
  view.setUint16(at + 8, format, true);
  view.setUint16(at + 10, channels, true);
  view.setUint32(at + 12, sampleRate, true);
  view.setUint32(at + 16, sampleRate * channels * bytesPer, true);
  view.setUint16(at + 20, channels * bytesPer, true);
  view.setUint16(at + 22, bits, true);
  if (format === 0xfffe) {
    view.setUint16(at + 24, 22, true);
    view.setUint16(at + 26, bits, true);
    view.setUint16(at + 32, subFormat ?? 1, true);
  }
  at += 8 + fmtSize;
  for (const [id, size] of before) {
    text(at, id);
    view.setUint32(at + 4, size, true);
    at += 8 + size + (size % 2);
  }
  text(at, 'data');
  view.setUint32(at + 4, dataSize, true);
  at += 8;
  const float = format === 3 || subFormat === 3;
  for (const frame of frames) {
    for (const sample of frame) {
      if (float) view.setFloat32(at, sample, true);
      else if (bits === 24) {
        const value = Math.round(sample * 8388607);
        view.setUint8(at, value & 0xff);
        view.setUint8(at + 1, (value >> 8) & 0xff);
        view.setInt8(at + 2, value >> 16);
      } else if (bits === 8) view.setUint8(at, 128 + Math.round(sample * 127));
      else if (bits === 32) view.setInt32(at, Math.round(sample * 2147483647), true);
      else view.setInt16(at, Math.round(sample * 32767), true);
      at += bytesPer;
    }
  }
  return bytes;
}

const close = (actual: Float32Array, expected: number[], tolerance: number) => {
  assert.equal(actual.length, expected.length);
  expected.forEach((value, i) => assert.ok(Math.abs(actual[i] - value) <= tolerance, `${i}: ${actual[i]} と ${value}`));
};

test('16 bit のモノラルの WAV から、標本の率と -1〜1 の値を読む', () => {
  const pcm = Float32Array.from([0, 0.5, -0.5, 0.25]);
  const decoded = decodeWav(encodeWav(pcm, 44100));
  assert.equal(decoded.sampleRate, 44100);
  close(decoded.pcm, [0, 0.5, -0.5, 0.25], 1e-4);
});

test('2チャンネル以上の WAV は、チャンネルの平均を1つの声として読む', () => {
  const bytes = wavOf({ format: 1, bits: 16, channels: 2, sampleRate: 48000 }, [[0.5, 0.1], [-0.2, -0.4]]);
  close(decodeWav(bytes).pcm, [0.3, -0.3], 1e-4);
});

test('24 bit と 32 bit の整数、32 bit の小数の WAV を読む', () => {
  close(decodeWav(wavOf({ format: 1, bits: 24, channels: 1, sampleRate: 48000 }, [[0.75], [-0.75]])).pcm, [0.75, -0.75], 1e-6);
  close(decodeWav(wavOf({ format: 1, bits: 32, channels: 1, sampleRate: 48000 }, [[0.75], [-0.75]])).pcm, [0.75, -0.75], 1e-6);
  close(decodeWav(wavOf({ format: 3, bits: 32, channels: 1, sampleRate: 48000 }, [[0.75], [-0.75]])).pcm, [0.75, -0.75], 0);
});

test('拡張の形の見出しを持つ WAV は、中の形で読む', () => {
  close(decodeWav(wavOf({ format: 0xfffe, bits: 32, channels: 1, sampleRate: 48000, subFormat: 3 }, [[0.75]])).pcm, [0.75], 0);
  close(decodeWav(wavOf({ format: 0xfffe, bits: 16, channels: 1, sampleRate: 48000, subFormat: 1 }, [[0.5]])).pcm, [0.5], 1e-4);
});

test('音のデータの前にあるほかのかたまりは読み飛ばす', () => {
  const bytes = wavOf({ format: 1, bits: 16, channels: 1, sampleRate: 16000 }, [[0.5]], [['LIST', 5], ['JUNK', 4]]);
  close(decodeWav(bytes).pcm, [0.5], 1e-4);
});

test('WAV でないファイルと、読めない形の WAV は、理由を書いて止まる', () => {
  assert.throws(() => decodeWav(new TextEncoder().encode('ID3 これは mp3 です')), /WAV ではありません/);
  assert.throws(() => decodeWav(wavOf({ format: 1, bits: 8, channels: 1, sampleRate: 8000 }, [[0]])), /読めない形/);
});
