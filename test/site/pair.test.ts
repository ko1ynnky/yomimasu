import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_PAIR, pairFromSearch, segmentsOf } from '../../site/client/pair.ts';

test('組の指定がなければ、77番の下の句から29番の上の句へ読む', () => {
  assert.deepEqual(pairFromSearch(''), { shimo: 77, kami: 29 });
  assert.deepEqual(DEFAULT_PAIR, { shimo: 77, kami: 29 });
});

test('URL の shimo と kami から組を読む', () => {
  assert.deepEqual(pairFromSearch('?shimo=53&kami=86'), { shimo: 53, kami: 86 });
});

test('札の番号にならない指定は、既定の組に戻す', () => {
  for (const search of ['?shimo=101&kami=29', '?shimo=abc&kami=29', '?shimo=77', '?shimo=7.5&kami=29', '?shimo=0&kami=29']) {
    assert.deepEqual(pairFromSearch(search), DEFAULT_PAIR, search);
  }
});

test('同じ札の下の句と上の句は1組にならないので、既定の組に戻す', () => {
  assert.deepEqual(pairFromSearch('?shimo=53&kami=53'), DEFAULT_PAIR);
});

test('1組の区間は 5・3・1・6 の順に、下の句、余韻、間、上の句と並ぶ', () => {
  const segments = segmentsOf({ shimo: 77, kami: 29 });
  assert.deepEqual(
    segments.map(({ key, sec }) => [key, sec]),
    [
      ['shimo', 5],
      ['yoin', 3],
      ['ma', 1],
      ['kami', 6],
    ],
  );
  assert.deepEqual(
    segments.map((s) => s.label),
    ['下の句（5秒程度）', '余韻（3.0秒）', '間（1.0秒）', '上の句（6秒程度）'],
  );
});
