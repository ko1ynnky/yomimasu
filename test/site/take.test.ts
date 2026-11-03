import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clearLastTake, lastTake, putLastTake, type Take } from '../../site/client/take.ts';

const takeOf = (shimo: number): Take => ({
  pcm: new Float32Array(4),
  sampleRate: 48000,
  readingStartSec: 2.4,
  assisted: true,
  pair: { shimo, kami: 29 },
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
