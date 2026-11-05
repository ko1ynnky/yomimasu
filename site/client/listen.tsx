import { render } from 'preact';

// お手本の再生と組の選択は Y-14 で作る。それまでは読む画面へ進めるだけにする。
// 導入の段1〜2で「はじめに 1 / 3」と出すのも Y-14 で作り、ここでは読む流れの進み具合だけを出す。
export function mountListen(element: HTMLElement) {
  render(<p>お手本を聞く画面は準備中です。</p>, element);
  const step = document.querySelector<HTMLElement>('.bar .step');
  if (step) step.textContent = '1 / 3 聞く';
  return () => {
    render(null, element);
    if (step) step.textContent = '';
  };
}
