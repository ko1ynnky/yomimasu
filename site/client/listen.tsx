import { render } from 'preact';

// お手本の再生と組の選択は Y-14 で作る。それまでは読む画面へ進めるだけにする。
export function mountListen(element: HTMLElement) {
  render(<p>お手本を聞く画面は準備中です。</p>, element);
}
