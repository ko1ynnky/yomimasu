import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import deck from '../../.claude/skills/yomimasu/assets/cards.json' with { type: 'json' };
import type { Card } from '../../.claude/skills/yomimasu/scripts/cards.ts';
import { kimarijiInOrder, kimarijiStream, readOrder } from '../../site/kimariji-stream.ts';

const cards = deck.cards as unknown as Card[];
const hundred = cards.filter((c) => c.no !== 0).map((c) => c.no);
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

test('最初に読まれる札の決まり字は、札の読みの表の決まり字と同じである', () => {
  for (const card of cards.filter((c) => c.no !== 0)) {
    assert.equal(kimarijiInOrder(cards, [card.no])[0], card.kimariji!.kana, `${card.no}番`);
  }
});

test('読まれた札を除いて区別するので、相手の札が先に読まれると決まり字が短くなる', () => {
  assert.deepEqual(kimarijiInOrder(cards, [11, 76]), ['わたのはらや', 'わた']);
  assert.deepEqual(kimarijiInOrder(cards, [76, 11]), ['わたのはらこ', 'わた']);
});

test('区別は音で行い、字は札の仮名で出す', () => {
  // 「あふこ」の音は「おおこ」で、「おほえ」「おほけ」と2音目まで同じである。仮名の「あふ」では区別しない
  assert.deepEqual(kimarijiInOrder(cards, [44]), ['あふこ']);
  // 「おほえ」と「おほけ」が読まれたあとは、「あふ」の2字で決まる
  assert.deepEqual(kimarijiInOrder(cards, [60, 95, 44]), ['おほえ', 'おほけ', 'あふ']);
});

test('1試合の最後に読まれる札は、残りが1枚なので1字になる', () => {
  for (const seed of range(1, 12)) {
    const order = readOrder(seed, hundred);
    assert.equal(kimarijiInOrder(cards, order).at(-1)!.length, 1, `種 ${seed}`);
  }
});

test('読む順は、Python の random.Random(種).shuffle で番号順の100枚を混ぜた順と同じである', () => {
  assert.deepEqual(readOrder(1, range(1, 100)).slice(0, 10), [54, 38, 66, 52, 5, 21, 39, 10, 11, 82]);
  assert.deepEqual(readOrder(1, range(1, 100)).slice(-3), [98, 73, 18]);
  assert.deepEqual(readOrder(12, range(1, 100)).slice(0, 10), [5, 16, 67, 51, 93, 55, 38, 87, 24, 81]);
  assert.deepEqual([...readOrder(1, range(1, 100))].sort((a, b) => a - b), range(1, 100));
});

test('12試合の列は、入口の絵の見本に使った列（2568字）と1字も違わない', () => {
  const stream = kimarijiStream(cards);
  assert.equal(stream.length, 2568);
  assert.ok(stream.startsWith('わすれわすもろあけおくいまこあさぢこれわたのはらやおも'));
  // 見本の列そのものはここに写さず、SHA-256 で照らす。
  assert.equal(createHash('sha256').update(stream).digest('hex'), '2ffd67d52da95a5d6424c237a8ab69d2cc0ef383153d08335d7dc53a6e647088');
});
