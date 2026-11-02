export function encodeWav(pcm: Float32Array, sampleRate: number): Uint8Array {
  const bytes = new Uint8Array(44 + pcm.length * 2);
  const view = new DataView(bytes.buffer);
  const writeText = (at: number, text: string) => [...text].forEach((character, i) => (bytes[at + i] = character.charCodeAt(0)));
  writeText(0, 'RIFF');
  view.setUint32(4, 36 + pcm.length * 2, true);
  writeText(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, 'data');
  view.setUint32(40, pcm.length * 2, true);
  pcm.forEach((sample, i) => view.setInt16(44 + i * 2, Math.max(-32768, Math.min(32767, Math.round(sample * 32767))), true));
  return bytes;
}
