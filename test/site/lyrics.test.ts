import assert from 'node:assert/strict';
import { test } from 'node:test';
import deck from '../../.claude/skills/yomimasu/assets/cards.json' with { type: 'json' };
import type { Card } from '../../.claude/skills/yomimasu/scripts/cards.ts';
import { pairLines } from '../../site/client/lyrics.ts';

const cards = deck.cards as unknown as Card[];

test('1組の歌詞は、前の札の下の句2行と次の札の上の句3行に、伸ばす印を置いて並べる', () => {
  assert.deepEqual(pairLines(cards, { shimo: 77, kami: 29 }), {
    shimo: ['われてもー末にー', '逢はむとぞー思ふ'],
    kami: ['心あてにー', '折らばや折らむー', '初霜ーのー'],
  });
});

test('行をつなぐと、札の表の伸ばす印を置いた本文と同じになる', () => {
  for (const card of cards.filter((c) => c.no !== 0)) {
    const other = card.no === 1 ? 2 : 1;
    const { shimo } = pairLines(cards, { shimo: card.no, kami: other });
    const { kami } = pairLines(cards, { shimo: other, kami: card.no });
    assert.equal(shimo.join(''), card.marked.lower, `${card.no}番の下の句`);
    assert.equal(kami.join(''), card.marked.upper, `${card.no}番の上の句`);
  }
});
