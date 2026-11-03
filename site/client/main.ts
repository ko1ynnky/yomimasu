import './ui/base.css';

type Mount = (element: HTMLElement) => void;

// 画面ごとの処理は、その画面の要素があるときだけ読み込む。各 Issue は自分の行のファイルだけを触る。
const ELEMENTS: Record<string, () => Promise<Mount>> = {
  'yomimasu-stage': () => import('./ui/stage.tsx').then((m) => m.mountStage),
  'yomimasu-recorder': () => import('./recorder.tsx').then((m) => m.mountRecorder),
  'yomimasu-listen': () => import('./listen.tsx').then((m) => m.mountListen),
  'yomimasu-result': () => import('./result.tsx').then((m) => m.mountResult),
};

// 取ってきた HTML を差し込んでも動くように、枠組みの島ではなくカスタム要素で読み込む。
for (const [name, load] of Object.entries(ELEMENTS)) {
  customElements.define(
    name,
    class extends HTMLElement {
      async connectedCallback() {
        (await load())(this);
      }
    },
  );
}
