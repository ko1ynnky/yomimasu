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
  stop: () => Recording;
  cancel: () => void;
};

type Chunk = { frame: number; samples: Float32Array };

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
  const release = () => {
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
    worklet.port.onmessage = ({ data }: MessageEvent<Chunk>) => chunks.push(data);

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
      stop() {
        release();
        const pcm = new Float32Array(chunks.reduce((total, chunk) => total + chunk.samples.length, 0));
        let offset = 0;
        for (const { samples } of chunks) {
          pcm.set(samples, offset);
          offset += samples.length;
        }
        return { pcm, sampleRate: context.sampleRate, voiceProcessing };
      },
    };
  } catch (error) {
    release();
    throw error;
  }
}
