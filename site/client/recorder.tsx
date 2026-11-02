import { render } from 'preact';
import { useState } from 'preact/hooks';
import { measure, type Measurement } from '../../.claude/skills/yomimasu/scripts/measure.ts';
import { startCapture, type Capture } from './capture.ts';

type View = { kind: 'idle' } | { kind: 'recording'; capture: Capture } | { kind: 'measured'; result: Measurement } | { kind: 'failed' };

const seconds = (value: number) => value.toFixed(2);

function describe(result: Measurement): string {
  switch (result.status) {
    case 'ok':
      return `下の句＋余韻 ${seconds(result.shimoPlusYoinSec)} 秒、間 ${seconds(result.maSec)} 秒、上の句 ${seconds(result.kamiSec)} 秒`;
    case 'too-quiet':
      return '声を聞き取れず、測れませんでした。';
    case 'no-gap':
      return '読みの切れ目が見つからず、測れませんでした。';
  }
}

function Recorder() {
  const [view, setView] = useState<View>({ kind: 'idle' });

  async function start() {
    try {
      setView({ kind: 'recording', capture: await startCapture() });
    } catch {
      setView({ kind: 'failed' });
    }
  }

  function stop(capture: Capture) {
    const { pcm, sampleRate } = capture.stop();
    setView({ kind: 'measured', result: measure(pcm, sampleRate) });
  }

  if (view.kind === 'recording') return <button onClick={() => stop(view.capture)}>止める</button>;

  return (
    <>
      <button onClick={start}>読む</button>
      {view.kind === 'measured' && <p role="status">{describe(view.result)}</p>}
      {view.kind === 'failed' && <p role="alert">マイクを使えませんでした。ブラウザーの設定でマイクを許可してください。</p>}
    </>
  );
}

export function mountRecorder(element: HTMLElement) {
  render(<Recorder />, element);
}
