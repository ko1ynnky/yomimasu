import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EXAMPLE_AUDIO_URL, exampleTake, loadExample, type DecodedAudio } from '../../site/client/example.ts';
import { measurementOf } from '../../site/client/take.ts';
import { standardReading, synthesize } from '../support/synth.ts';

const TOLERANCE_SEC = 0.05;

const decoded = (channels: Float32Array[], sampleRate = 48000): DecodedAudio => ({
  sampleRate,
  numberOfChannels: channels.length,
  length: channels[0].length,
  getChannelData: (channel) => channels[channel],
});

test('例の音声は、配信が examples/v1/ の下で受け付ける名前の形で読む', () => {
  assert.match(EXAMPLE_AUDIO_URL, /^\/audio\/examples\/v1\/[a-z0-9]+(?:-[a-z0-9]+)*\.m4a$/);
});

test('例の録音は、81番の下の句から45番の上の句への1組を、補助なしで読んだものとして、頭から測る', () => {
  const take = exampleTake(decoded([new Float32Array(10)]));
  assert.deepEqual(take.pair, { shimo: 81, kami: 45 });
  assert.equal(take.assisted, false);
  assert.equal(take.readingStartSec, 0);
});

test('左右2本の音は、平均して1本にしてから測る', () => {
  const take = exampleTake(decoded([Float32Array.of(0.5, -0.25), Float32Array.of(0.25, 0.25)], 44100));
  assert.deepEqual([...take.pcm], [0.375, 0]);
  assert.equal(take.sampleRate, 44100);
});

test('例の録音の間は、利用者の録音と同じ定義で音から測る', () => {
  for (const maSec of [0.6, 1.6]) {
    const { ma } = measurementOf(exampleTake(decoded([synthesize({ ...standardReading, maSec })], standardReading.sampleRate)));
    assert.equal(ma.status, 'ok', JSON.stringify(ma));
    if (ma.status === 'ok') assert.ok(Math.abs(ma.sec - maSec) <= TOLERANCE_SEC, `${ma.sec} は ${maSec} から ${TOLERANCE_SEC} 秒より離れている`);
  }
});

test('例の音声を取れないとき（置く前の 404 など）は、測る前に失敗を返す', async () => {
  const asked: string[] = [];
  const missing = async (url: string) => {
    asked.push(url);
    return new Response(null, { status: 404 });
  };
  await assert.rejects(loadExample(missing));
  assert.deepEqual(asked, [EXAMPLE_AUDIO_URL]);
});
