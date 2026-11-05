import type { Pair } from './pair.ts';
import type { Take } from './take.ts';

// 例の録音（C9）は、声を出せない人、マイクを許可しない人、審査員が、録音しないで結果の画面まで進むためにある。
// 音声はリポジトリに置かず、お手本と同じ配信（R2）の examples/v1/ から読む。配信は v1 の中身を置き換えない前提で長くキャッシュさせるので、録り直したら名前を変える。
export const EXAMPLE_AUDIO_URL = '/audio/examples/v1/ma-long.m4a';

// 例の音声が読む組で、音声と一緒に決まる。読む流れの既定の組（ui/stage.tsx）が変わっても、こちらは音声を録り直すまで変えない。
const EXAMPLE_PAIR: Pair = { shimo: 81, kami: 45 };

// decodeAudioData はこの率に直して返す。録音の部品が端末で録る率の多くに合わせる。
const DECODE_RATE = 48000;

export type DecodedAudio = Pick<AudioBuffer, 'sampleRate' | 'numberOfChannels' | 'length'> & { getChannelData: (channel: number) => Float32Array };

// 例の音声は読みだけを収め、合図の間の音を含まないので、頭から測る。測る範囲の最初で声が切れていると測れないので、音声の頭と終わりには無音を置いて録る。
// 補助の有無は、例の音声を補助の画面を見ずに読む前提で「補助なし」にする。声の処理の設定は分からないので空にし、音量の参考値は利用者の録音と同じく出さない。
export function exampleTake(audio: DecodedAudio): Take {
  const pcm = new Float32Array(audio.length);
  for (let channel = 0; channel < audio.numberOfChannels; channel++) {
    const samples = audio.getChannelData(channel);
    for (let i = 0; i < pcm.length; i++) pcm[i] += samples[i] / audio.numberOfChannels;
  }
  return { pcm, sampleRate: audio.sampleRate, readingStartSec: 0, assisted: false, pair: EXAMPLE_PAIR, voiceProcessing: { supported: {}, settings: {} } };
}

// 音声を置くまでは 404 で失敗する。鳴らさずに変換するだけなので、出力の装置を開かない OfflineAudioContext を使う。
export async function loadExample(fetcher: (url: string) => Promise<Response> = (url) => fetch(url)): Promise<Take> {
  const response = await fetcher(EXAMPLE_AUDIO_URL);
  if (!response.ok) throw new Error(`例の音声を取れない：${response.status}`);
  const audio = await new OfflineAudioContext(1, 1, DECODE_RATE).decodeAudioData(await response.arrayBuffer());
  return exampleTake(audio);
}
