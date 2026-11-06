// スキルで測るための WAV の読み込み。依存を足さないため、音声の形は WAV の整数（16、24、32 bit）と 32 bit の小数に限る。
// m4a や mp3 は読まない。変換の道具を呼ぶ案は、使う人の環境に道具があるかで答えが変わるので採らなかった。
// 2チャンネル以上は平均して1つにする。Web の例の録音（site/client/example.ts）と同じ扱いである。

export type Decoded = { pcm: Float32Array; sampleRate: number };

const PCM = 1;
const FLOAT = 3;
const EXTENSIBLE = 0xfffe;

type Format = { code: number; channels: number; sampleRate: number; bits: number };

const ascii = (bytes: Uint8Array, at: number) => String.fromCharCode(...bytes.subarray(at, at + 4));

function readerOf(view: DataView, { code, bits }: Format): ((at: number) => number) | null {
  if (code === FLOAT && bits === 32) return (at) => view.getFloat32(at, true);
  if (code !== PCM) return null;
  if (bits === 16) return (at) => view.getInt16(at, true) / 32768;
  if (bits === 24) return (at) => (view.getUint8(at) | (view.getUint8(at + 1) << 8) | (view.getInt8(at + 2) << 16)) / 8388608;
  if (bits === 32) return (at) => view.getInt32(at, true) / 2147483648;
  return null;
}

export function decodeWav(bytes: Uint8Array): Decoded {
  if (bytes.length < 12 || ascii(bytes, 0) !== 'RIFF' || ascii(bytes, 8) !== 'WAVE') throw new Error('WAV ではありません。WAV に書き出してから渡してください。');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let format: Format | null = null;
  for (let at = 12; at + 8 <= bytes.length; ) {
    const id = ascii(bytes, at);
    const size = view.getUint32(at + 4, true);
    if (id === 'fmt ') {
      const code = view.getUint16(at + 8, true);
      format = {
        code: code === EXTENSIBLE ? view.getUint16(at + 32, true) : code,
        channels: view.getUint16(at + 10, true),
        sampleRate: view.getUint32(at + 12, true),
        bits: view.getUint16(at + 22, true),
      };
    }
    if (id === 'data') {
      const read = format && readerOf(view, format);
      if (!format || !read || format.channels === 0) throw new Error('読めない形の WAV です。16 bit か 24 bit か 32 bit の WAV に書き出してから渡してください。');
      const step = format.bits / 8;
      const frames = Math.floor(Math.min(size, bytes.length - at - 8) / (step * format.channels));
      const pcm = new Float32Array(frames);
      for (let frame = 0; frame < frames; frame++) {
        let sum = 0;
        for (let channel = 0; channel < format.channels; channel++) sum += read(at + 8 + (frame * format.channels + channel) * step);
        pcm[frame] = sum / format.channels;
      }
      return { pcm, sampleRate: format.sampleRate };
    }
    at += 8 + size + (size % 2);
  }
  throw new Error('WAV に音のデータがありません。');
}
