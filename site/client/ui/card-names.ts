import deck from '../../../.claude/skills/yomimasu/assets/cards.json' with { type: 'json' };
import type { Card } from '../../../.claude/skills/yomimasu/scripts/cards.ts';

// 札の読みの表は大きいので、殻は札の名前が要るリンクを押すときまで読み込まない。
// 名前の付け方は site/karuta.ts の cardUrl と cardName に合わせる。karuta.ts は教科書を組む処理ごと読み込むので、ここでは使わない。
const cards = deck.cards as unknown as Card[];

export function cardNameAt(token: string): string | undefined {
  const card = cards.find((c) => (token === 'joka' ? c.no === 0 : String(c.no) === token));
  if (!card) return undefined;
  return card.kimariji?.kana ?? '序歌';
}
