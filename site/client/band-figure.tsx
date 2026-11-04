import { render } from 'preact';
import { DEFAULT_PAIR, segmentsOf } from './pair.ts';
import { Band } from './ui/band.tsx';

// 総論の 5・3・1・6 の図。読む画面と同じ帯の部品を、動かさずに出す。
// 帯を動かすのは「実際の読みで確認する」でお手本と一緒にするときだけで、帯だけを動かすボタンは置かない（docs/ui-guide.md の7節）。
// お手本の音声の配信（E1）がまだないので、今は図だけを出す。
export function mountBandFigure(element: HTMLElement) {
  render(<Band segments={segmentsOf(DEFAULT_PAIR)} fixed />, element);
  return () => render(null, element);
}
