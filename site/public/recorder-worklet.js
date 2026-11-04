// 入力の1チャンネル目だけを読む。ステレオのマイクでも、測る音を1本にそろえる。
// 塊ごとに currentFrame を添え、画面の時計（AudioContext.currentTime）と録音の位置を対応させる。入力の来ない塊は送らないので、抜けは受け手が無音で埋める。
class RecorderProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0][0];
    if (channel) this.port.postMessage({ frame: currentFrame, samples: channel.slice(0) });
    return true;
  }
}

registerProcessor('recorder', RecorderProcessor);
