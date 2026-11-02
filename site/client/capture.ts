export type Take = { pcm: Float32Array; sampleRate: number };
export type Capture = { stop: () => Take };

// MediaRecorder は端末ごとに形式が変わるので、どの端末でも同じ PCM を測れる AudioWorklet で受ける。
export async function startCapture(): Promise<Capture> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  });
  const context = new AudioContext();
  await context.audioWorklet.addModule('/recorder-worklet.js');
  const worklet = new AudioWorkletNode(context, 'recorder');
  const chunks: Float32Array[] = [];
  worklet.port.onmessage = ({ data }: MessageEvent<Float32Array>) => chunks.push(data);

  // 出力につながないノードを動かさないブラウザーに備えて、音量0で出力へつなぐ。
  const silence = context.createGain();
  silence.gain.value = 0;
  context.createMediaStreamSource(stream).connect(worklet).connect(silence).connect(context.destination);

  return {
    stop() {
      stream.getTracks().forEach((track) => track.stop());
      void context.close();
      const pcm = new Float32Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
      let offset = 0;
      for (const chunk of chunks) {
        pcm.set(chunk, offset);
        offset += chunk.length;
      }
      return { pcm, sampleRate: context.sampleRate };
    },
  };
}
