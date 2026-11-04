const VOICE_PROCESSING = ['echoCancellation', 'noiseSuppression', 'autoGainControl'] as const;
type VoiceKey = (typeof VOICE_PROCESSING)[number];

// 声の処理が本当に外れたかは端末で違う。iOS の Safari は自動の音量と雑音の抑制を非対応と返す。
// 音量の参考値を出すかどうかを、あとで録音ごとに判断できるように残す。
export type VoiceProcessing = {
  supported: Partial<Record<VoiceKey, boolean>>;
  settings: Partial<Record<VoiceKey, boolean>>;
};

export type Recording = { pcm: Float32Array; sampleRate: number; voiceProcessing: VoiceProcessing };

export type Capture = {
  // 画面の時計。requestAnimationFrame の時刻は録音とずれるので、帯はこの時計で進める。
  now: () => number;
  // 画面の時計の時刻が、録音の頭から何秒目に当たるか。
  positionSec: (contextTime: number) => number;
  // 画面の時計の untilSec までを録音にして、マイクを閉じる。
  stop: (untilSec: number) => Promise<Recording>;
  cancel: () => void;
};

export type Chunk = { frame: number; samples: Float32Array };

// worklet の塊は、画面の時計が進んだあとに遅れて届く。手元の Chromium でも、止めたときに届いていない塊が 10ms 分あった。
// 止めた時刻までの塊が届くのを待つが、音声の処理が止まって塊が来なくなっても確かめる画面へ進めるよう、待つのはここまでにする。
const FLUSH_TIMEOUT_MS = 1000;

// 塊は届いた順につなげず、currentFrame の位置に置く。入力にチャンネルが来ない塊（Chromium では最初の塊のすぐあとの2つ）は worklet が送らないので、
// つなげると、そのあとの音が画面の時計より早い位置にずれ、録音も短くなる。抜けは無音で埋める。
// 止めた時刻までの塊が届いていないときは、届いた塊の終わりで切る。届いていない区間を無音で足すと、読んだ声を無音に置き換えることになる。
export function pcmOf(chunks: readonly Chunk[], untilFrame: number): Float32Array {
  if (chunks.length === 0) return new Float32Array(0);
  const first = chunks[0].frame;
  const last = chunks.at(-1)!;
  const pcm = new Float32Array(Math.max(0, Math.min(untilFrame, last.frame + last.samples.length) - first));
  for (const { frame, samples } of chunks) {
    const at = frame - first;
    if (at >= pcm.length) break;
    pcm.set(samples.subarray(0, pcm.length - at), at);
  }
  return pcm;
}

const pick = (source: object, keys: readonly VoiceKey[]) =>
  Object.fromEntries(keys.flatMap((key) => (key in source ? [[key, (source as Record<string, unknown>)[key]]] : []))) as Partial<Record<VoiceKey, boolean>>;

// お手本の再生で playback に切り替わったまま録ると、iOS は録音の経路を選び直さない。録る前に auto に戻す。
function resetAudioSession() {
  const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
  if (session) session.type = 'auto';
}

// MediaRecorder は端末ごとに形式が変わるので、どの端末でも同じ PCM を測れる AudioWorklet で受ける。
export async function startCapture(): Promise<Capture> {
  resetAudioSession();
  // iPhone の Safari は操作から離れると AudioContext を動かさないおそれがあるので、await の前に作る。
  const context = new AudioContext();
  void context.resume();

  let stream: MediaStream | undefined;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    stream?.getTracks().forEach((track) => track.stop());
    void context.close();
  };

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    await context.audioWorklet.addModule('/recorder-worklet.js');
    const worklet = new AudioWorkletNode(context, 'recorder');
    const chunks: Chunk[] = [];
    let arrived = () => {};
    worklet.port.onmessage = ({ data }: MessageEvent<Chunk>) => {
      chunks.push(data);
      arrived();
    };

    // 出力につながないノードを動かさないブラウザーに備えて、音量0で出力へつなぐ。
    const silence = context.createGain();
    silence.gain.value = 0;
    context.createMediaStreamSource(stream).connect(worklet).connect(silence).connect(context.destination);
    const connectedAt = context.currentTime;

    const [track] = stream.getAudioTracks();
    const voiceProcessing: VoiceProcessing = {
      supported: pick(navigator.mediaDevices.getSupportedConstraints(), VOICE_PROCESSING),
      settings: pick(track?.getSettings() ?? {}, VOICE_PROCESSING),
    };
    const firstSec = () => (chunks.length > 0 ? chunks[0].frame / context.sampleRate : connectedAt);

    return {
      now: () => context.currentTime,
      positionSec: (contextTime) => Math.max(0, contextTime - firstSec()),
      cancel: release,
      stop(untilSec) {
        const untilFrame = Math.round(untilSec * context.sampleRate);
        const reached = () => chunks.length > 0 && chunks.at(-1)!.frame + chunks.at(-1)!.samples.length >= untilFrame;
        return new Promise((resolve) => {
          const done = () => {
            clearTimeout(timer);
            arrived = () => {};
            release();
            resolve({ pcm: pcmOf(chunks, untilFrame), sampleRate: context.sampleRate, voiceProcessing });
          };
          const timer = setTimeout(done, FLUSH_TIMEOUT_MS);
          arrived = () => {
            if (reached()) done();
          };
          arrived();
        });
      },
    };
  } catch (error) {
    release();
    throw error;
  }
}
