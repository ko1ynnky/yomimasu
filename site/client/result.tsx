import { render } from 'preact';
import { lastTake } from './take.ts';

// 録音は端末の中にしかないので、URL だけでは結果を開けない。行と判定は Y-15 で作る。
function Result() {
  if (!lastTake()) {
    return (
      <p role="status">
        まだ録音がありません。<a href="/read/">まず1回読む</a>
      </p>
    );
  }
  return <p role="status">結果の画面は準備中です。</p>;
}

export function mountResult(element: HTMLElement) {
  render(<Result />, element);
  return () => render(null, element);
}
