import { render } from 'preact';
import { useRef, useState } from 'preact/hooks';
import { measure, type Measurement } from '../../.claude/skills/yomimasu/scripts/measure.ts';
import { startCapture, type Capture } from './capture.ts';

type Failure = 'denied' | 'unavailable';
type View =
  | { kind: 'idle' }
  | { kind: 'starting' }
  | { kind: 'recording'; capture: Capture }
  | { kind: 'measured'; result: Measurement }
  | { kind: 'failed'; failure: Failure };

const FAILURE_MESSAGES: Record<Failure, string> = {
  denied: 'マイクを使えませんでした。ブラウザーの設定でマイクを許可してください。',
  unavailable: '録音を始められませんでした。ページを開き直してください。',
};

// 「止める」を続けて押すと、2回目が同じ位置の「読む」に当たり、結果が消えてマイクが開く。
const RESTART_GUARD_MS = 500;

const seconds = (value: number) => value.toFixed(2);

// E2E は文の言い回しではなく data-testid の値を読む。文を直しても測定の検査が壊れないようにする。
function describe(result: Measurement) {
  switch (result.status) {
    case 'ok':
      return (
        <>
          下の句＋余韻 <span data-testid="shimo-plus-yoin-sec">{seconds(result.shimoPlusYoinSec)}</span> 秒、間{' '}
          <span data-testid="ma-sec">{seconds(result.maSec)}</span> 秒、上の句 <span data-testid="kami-sec">{seconds(result.kamiSec)}</span> 秒
        </>
      );
    case 'too-quiet':
      return '声を聞き取れず、測れませんでした。';
    case 'no-gap':
      return '読みの切れ目が見つからず、測れませんでした。';
  }
}

function Recorder() {
  const [view, setView] = useState<View>({ kind: 'idle' });
  const stoppedAt = useRef(Number.NEGATIVE_INFINITY);

  async function start() {
    if (performance.now() - stoppedAt.current < RESTART_GUARD_MS) return;
    setView({ kind: 'starting' });
    try {
      setView({ kind: 'recording', capture: await startCapture() });
    } catch (error) {
      setView({ kind: 'failed', failure: error instanceof DOMException && error.name === 'NotAllowedError' ? 'denied' : 'unavailable' });
    }
  }

  function stop(capture: Capture) {
    stoppedAt.current = performance.now();
    const { pcm, sampleRate } = capture.stop();
    setView({ kind: 'measured', result: measure(pcm, sampleRate) });
  }

  if (view.kind === 'recording') return <button class="btn" onClick={() => stop(view.capture)}>止める</button>;

  return (
    <>
      <button class="btn btn--fill" onClick={start} disabled={view.kind === 'starting'}>
        読む
      </button>
      {view.kind === 'measured' && <p role="status">{describe(view.result)}</p>}
      {view.kind === 'failed' && <p role="alert">{FAILURE_MESSAGES[view.failure]}</p>}
    </>
  );
}

export function mountRecorder(element: HTMLElement) {
  render(<Recorder />, element);
  return () => render(null, element);
}
