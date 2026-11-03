import { markedText, type Card } from '../../.claude/skills/yomimasu/scripts/cards.ts';
import type { Pair } from './pair.ts';

export type PairLines = { shimo: string[]; kami: string[] };

const UPPER = [0, 1, 2];
const LOWER = [3, 4];

function linesOf(card: Card, phraseIndexes: readonly number[]): string[] {
  return phraseIndexes.map((index) =>
    markedText(
      [card.phrases[index]],
      card.stretches.filter((s) => s.phrase === index).map((s) => ({ phrase: 0, after: s.after })),
    ),
  );
}

export function pairLines(cards: readonly Card[], pair: Pair): PairLines {
  const find = (no: number) => {
    const card = cards.find((c) => c.no === no);
    if (!card) throw new Error(`${no}番が札の読みの表にない`);
    return card;
  };
  return { shimo: linesOf(find(pair.shimo), LOWER), kami: linesOf(find(pair.kami), UPPER) };
}
