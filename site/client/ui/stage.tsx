import { render } from 'preact';
import deck from '../../../.claude/skills/yomimasu/assets/cards.json' with { type: 'json' };
import type { Card } from '../../../.claude/skills/yomimasu/scripts/cards.ts';
import { pairLines, type PairLines } from '../lyrics.ts';
import { pairFromSearch, segmentsOf, type Segment } from '../pair.ts';
import { Band } from './band.tsx';
import './stage.css';

const cards = deck.cards as unknown as Card[];

const Line = ({ text, first }: { text: string; first?: boolean }) => (
  <div class={first ? 'ln break' : 'ln'}>{[...text].map((ch) => (ch === 'ー' ? <span class="nobi">ー</span> : ch))}</div>
);

// ふりがなと余韻の印は札の読みの表に列ができてから足す。列がなくても行は描ける。
export const Lyrics = ({ lines }: { lines: PairLines }) => (
  <div class="tate" data-testid="lyrics">
    {lines.shimo.map((text) => (
      <Line text={text} />
    ))}
    {lines.kami.map((text, i) => (
      <Line text={text} first={i === 0} />
    ))}
  </div>
);

// 文字は進めない。表に時刻の列ができる C3 までは、等分した進みが誤った手本になる。
export function Stage({ segments, lines }: { segments: readonly Segment[]; lines: PairLines }) {
  const now = segments[0];
  return (
    <div class="stage card">
      <Band segments={segments} />
      <div class="stage-body">
        <div class="drain" data-seg={now.key} />
        <div class="now">
          <b>{now.label}</b>
          <span>{now.sec.toFixed(1)}</span>
        </div>
        <div class="lyric">
          <Lyrics lines={lines} />
        </div>
      </div>
    </div>
  );
}

export function mountStage(element: HTMLElement) {
  const pair = pairFromSearch(location.search);
  render(<Stage segments={segmentsOf(pair)} lines={pairLines(cards, pair)} />, element);
  return () => render(null, element);
}
