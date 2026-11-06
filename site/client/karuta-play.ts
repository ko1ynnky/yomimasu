import { cardLoader, play, storedAudioSource, type Playback } from './playback.ts';

// 1首のページのお手本の再生（docs/ui-guide.md の7節「1首のページ」）。上の句、1秒あけて下の句を鳴らす。
// 歌の字は朱で塗らない。1首のページの歌は止まった表示で、字の時刻（標準の 5・3・1・6）はお手本の音と合わないからである。
// JS がないときはボタンが隠れたままで、ページは読める。
const STOP_ICON = 'M2 2h8v8H2z';
const STOP_LABEL = 'やめる';
const LOAD_FAILED = 'お手本を読み込めませんでした。通信を確かめて、もう一度押してください。';

function failedAlert() {
  const alert = document.createElement('div');
  alert.className = 'card play-alert';
  alert.setAttribute('role', 'alert');
  const text = document.createElement('p');
  text.textContent = LOAD_FAILED;
  alert.append(text);
  return alert;
}

export function mountKarutaPlay(element: HTMLElement) {
  const no = Number(element.dataset.no);
  const button = element.querySelector('button')!;
  const icon = button.querySelector('path')!;
  const label = button.querySelector('span')!;
  const playIcon = icon.getAttribute('d')!;
  const playLabel = label.textContent!;
  let current: Playback | null = null;
  let alert: HTMLElement | null = null;

  // 「やめる」は止める操作なので打ち込まない（docs/ui-guide.md の8節）。殻（ui/shell.ts）は data-echo のあるボタンだけを打ち込む。
  const show = (playing: boolean) => {
    icon.setAttribute('d', playing ? STOP_ICON : playIcon);
    label.textContent = playing ? STOP_LABEL : playLabel;
    button.toggleAttribute('data-echo', !playing);
  };

  const stop = () => {
    const playing = current;
    current = null;
    playing?.stop();
    show(false);
  };

  // 押した処理の中から同期で play() を呼ぶ。遅らせて鳴らすと、iOS の Safari は利用者の操作として扱わない（playback.ts）。
  const onClick = () => {
    if (current) return stop();
    alert?.remove();
    alert = null;
    const playback = play(cardLoader(no, storedAudioSource()));
    current = playback;
    show(true);
    void playback.finished.then((outcome) => {
      if (current !== playback) return;
      current = null;
      show(false);
      if (outcome === 'failed') {
        alert = failedAlert();
        element.append(alert);
      }
    });
  };

  button.addEventListener('click', onClick);
  addEventListener('pagehide', stop);
  button.hidden = false;
  return () => {
    button.removeEventListener('click', onClick);
    removeEventListener('pagehide', stop);
    stop();
  };
}
