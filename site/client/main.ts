import './ui/base.css';
import './ui/textbook.css';
import './ui/install.css';

// 返す関数は要素が外れたときに呼ぶ。本文を入れ替えたときに、画面の木とマイクを残さないためである。
type Mount = (element: HTMLElement) => () => void;

// 画面ごとの処理は、その画面の要素があるときだけ読み込む。各 Issue は自分の行のファイルだけを触る。
const ELEMENTS: Record<string, () => Promise<Mount>> = {
  'yomimasu-stage': () => import('./ui/stage.tsx').then((m) => m.mountStage),
  'yomimasu-recorder': () => import('./recorder.tsx').then((m) => m.mountRecorder),
  'yomimasu-listen': () => import('./listen.tsx').then((m) => m.mountListen),
  'yomimasu-result': () => import('./result.tsx').then((m) => m.mountResult),
  'yomimasu-records': () => import('./records.tsx').then((m) => m.mountRecords),
  'yomimasu-karuta-list': () => import('./karuta-list.ts').then((m) => m.mountKarutaList),
  'yomimasu-band': () => import('./band-figure.tsx').then((m) => m.mountBandFigure),
};

// 取ってきた HTML を差し込んでも動くように、枠組みの島ではなくカスタム要素で読み込む。
for (const [name, load] of Object.entries(ELEMENTS)) {
  customElements.define(
    name,
    class extends HTMLElement {
      #unmount?: () => void;

      async connectedCallback() {
        const mount = await load();
        if (this.isConnected) this.#unmount = mount(this);
      }

      disconnectedCallback() {
        this.#unmount?.();
        this.#unmount = undefined;
      }
    },
  );
}
