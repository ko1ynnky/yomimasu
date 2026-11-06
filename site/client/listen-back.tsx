import { useEffect, useRef, useState } from 'preact/hooks';
import { pairLoader, play, storedAudioSource, takeLoader, type Playback } from './playback.ts';
import type { Take } from './take.ts';

type Side = 'own' | 'model';

const Icon = ({ path }: { path: string }) => (
  <svg class="ico" viewBox="0 0 12 12" aria-hidden="true">
    <path d={path} />
  </svg>
);
const PLAY_ICON = 'M2 1l9 5-9 5z';
const STOP_ICON = 'M2 2h8v8H2z';

const MODEL_FAILED = 'お手本を読み込めませんでした。通信を確かめて、もう一度押してください。';
// 自分の読みを鳴らせないときの文言は docs/ui-guide.md の11節にない。案として置き、決めるのはユーザーである（Issue #34）。
const ownFailed = (label: string) => `${label}を再生できませんでした。もう一度押してください。`;

// 結果の画面の聴き比べ（C6）。同じ組の自分の読みとお手本を、片方ずつ鳴らす。
// 2つの音量はそろえない。そろえるかは、ユーザーが実機で聴いて決める（Issue #34）。
// 押したらターミナルに打ち込む動き（docs/ui-guide.md の8節）は、打ち込む部品（#13）が入ってからつなぐ。
export function ListenBack({ take, ownLabel }: { take: Take; ownLabel: string }) {
  const [playing, setPlaying] = useState<Side | null>(null);
  const [failed, setFailed] = useState<Side | null>(null);
  const current = useRef<{ side: Side; playback: Playback } | null>(null);

  const halt = () => {
    const was = current.current;
    current.current = null;
    was?.playback.stop();
    setPlaying(null);
  };

  useEffect(() => {
    window.addEventListener('pagehide', halt);
    return () => {
      window.removeEventListener('pagehide', halt);
      halt();
    };
  }, []);

  // 押した処理の中から同期で呼ぶ。play() が最初の await より前に AudioContext を作って resume() を呼ぶ。
  function toggle(side: Side) {
    const was = current.current?.side;
    halt();
    setFailed(null);
    if (was === side) return;
    const playback = play(side === 'own' ? takeLoader(() => Promise.resolve(take)) : pairLoader(take.pair, storedAudioSource()));
    current.current = { side, playback };
    setPlaying(side);
    void playback.finished.then((outcome) => {
      if (current.current?.playback !== playback) return;
      current.current = null;
      setPlaying(null);
      if (outcome === 'failed') setFailed(side);
    });
  }

  const face = (side: Side, name: string) =>
    playing === side ? (
      <>
        <Icon path={STOP_ICON} />
        やめる
      </>
    ) : (
      <>
        <Icon path={PLAY_ICON} />
        {name}
      </>
    );

  return (
    <>
      <div class="pair">
        <button class="btn" type="button" onClick={() => toggle('own')}>
          {face('own', ownLabel)}
        </button>
        <button class="btn" type="button" onClick={() => toggle('model')}>
          {face('model', 'お手本')}
        </button>
      </div>
      {failed && (
        <div class="card play-alert" role="alert">
          <p>{failed === 'model' ? MODEL_FAILED : ownFailed(ownLabel)}</p>
        </div>
      )}
    </>
  );
}
