// 取ってきた HTML を差し込んでも動くように、枠組みの島ではなくカスタム要素で読み込む。
customElements.define(
  'yomimasu-recorder',
  class extends HTMLElement {
    async connectedCallback() {
      const { mountRecorder } = await import('./recorder.tsx');
      mountRecorder(this);
    }
  },
);
