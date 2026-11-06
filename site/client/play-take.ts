import type { Take } from './take.ts';

type AudioSessionLike = { type: string };

// 端末に残した自分の録音を鳴らす。合図の間の音は鳴らさず、読み始めの位置から鳴らす（docs/ui-guide.md の9節）。
// 押した処理の中から同期で呼ぶ。iOS では、await のあとに作った AudioContext が鳴らないことがあるので、文脈を作って resume() を呼ぶまでを最初に済ませ、録音はそのあとで読む。
// お手本の再生（PR #22 の playback.ts）とは、まだ1つにしていない。聴き比べ（Y-17）でまとめる。
export function playTake(load: () => Promise<Take | null>, onEnd: () => void): () => void {
  let context: AudioContext;
  try {
    context = new AudioContext();
  } catch {
    onEnd();
    return () => {};
  }
  const resumed = context.resume();
  const session = (navigator as Navigator & { audioSession?: AudioSessionLike }).audioSession;
  // 消音の切り替えに従わない再生の扱いにする。録音の扱いを変えないよう、終えたら auto に戻す。
  if (session) session.type = 'playback';

  let source: AudioBufferSourceNode | null = null;
  let settled = false;
  const settle = () => {
    if (settled) return;
    settled = true;
    if (source) {
      source.onended = null;
      try {
        source.stop();
      } catch {
        // 鳴り終えた音を止めると投げる端末がある。止まっていれば足りる。
      }
    }
    if (session) session.type = 'auto';
    void context.close().catch(() => {});
    onEnd();
  };

  void (async () => {
    try {
      const [take] = await Promise.all([load(), resumed]);
      if (settled) return;
      if (!take) throw new Error('録音が端末に残っていない');
      const samples = take.pcm.subarray(Math.min(take.pcm.length, Math.round(take.readingStartSec * take.sampleRate)));
      const buffer = context.createBuffer(1, Math.max(1, samples.length), take.sampleRate);
      buffer.getChannelData(0).set(samples);
      source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(context.destination);
      source.onended = settle;
      source.start();
    } catch {
      settle();
    }
  })();

  return settle;
}
