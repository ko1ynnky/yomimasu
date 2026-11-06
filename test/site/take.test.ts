import assert from 'node:assert/strict';
import { test } from 'node:test';
import { measure } from '../../.claude/skills/yomimasu/scripts/measure.ts';
import { clearLastTake, lastTake, measurementOf, putLastTake, type Take } from '../../site/client/take.ts';
import { standardReading, synthesize } from '../support/synth.ts';

const takeOf = (shimo: number): Take => ({
  pcm: new Float32Array(4),
  sampleRate: 48000,
  readingStartSec: 2.4,
  assisted: true,
  pair: { shimo, kami: 29 },
  voiceProcessing: { supported: { autoGainControl: true }, settings: { autoGainControl: false } },
});

test('録音を置く前は、最後の録音がない', () => {
  clearLastTake();
  assert.equal(lastTake(), null);
});

test('置いた録音を、別の画面がそのまま受け取る', () => {
  const take = takeOf(77);
  putLastTake(take);
  assert.equal(lastTake(), take);
});

test('新しい録音を置くと、前の録音は残らない', () => {
  putLastTake(takeOf(77));
  const newer = takeOf(53);
  putLastTake(newer);
  assert.equal(lastTake(), newer);
});

test('同じ録音は1回だけ測り、残すときと結果の画面で同じ測定の結果を使う', () => {
  const take: Take = { ...takeOf(77), pcm: synthesize(standardReading), readingStartSec: 0.5 };
  const first = measurementOf(take);
  assert.deepEqual(first, measure(take));
  assert.equal(measurementOf(take), first);
});
