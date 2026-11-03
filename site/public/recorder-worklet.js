// 入力の1チャンネル目だけを読む。ステレオのマイクでも、測る音を1本にそろえる。
// 最初の塊の currentFrame を添え、画面の時計（AudioContext.currentTime）と録音の位置を対応させる。
class RecorderProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0][0];
    if (channel) this.port.postMessage({ frame: currentFrame, samples: channel.slice(0) });
    return true;
  }
}

registerProcessor('recorder', RecorderProcessor);
