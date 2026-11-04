import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pcmOf } from '../../site/client/capture.ts';

const chunk = (frame: number, ...samples: number[]) => ({ frame, samples: Float32Array.from(samples) });

test('録音の位置は、最初の塊の時刻から数えた時計の位置と同じになる', () => {
  // 入力が来ない間の塊は worklet が送らない。抜けを詰めると、そのあとの音が早い位置にずれる。
  const pcm = pcmOf([chunk(100, 1, 1), chunk(106, 2, 2), chunk(108, 3, 3)], 110);
  assert.deepEqual([...pcm], [1, 1, 0, 0, 0, 0, 2, 2, 3, 3]);
});

test('録音は止めた時刻で終わり、そのあとに届いた塊を入れない', () => {
  const pcm = pcmOf([chunk(0, 1, 1, 1), chunk(3, 2, 2, 2), chunk(6, 3, 3, 3)], 5);
  assert.deepEqual([...pcm], [1, 1, 1, 2, 2]);
});

test('止めた時刻までの塊が届いていなければ、届いた塊の終わりまでにする', () => {
  // 届いていない区間を無音で足すと、読んだ声を無音に置き換えた録音になる。
  const pcm = pcmOf([chunk(0, 1, 1, 1)], 10);
  assert.deepEqual([...pcm], [1, 1, 1]);
});

test('塊が1つも届いていなければ、録音は空である', () => {
  assert.equal(pcmOf([], 10).length, 0);
});
