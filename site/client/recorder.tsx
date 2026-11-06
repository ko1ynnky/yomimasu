import { render } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { startCapture, type Capture } from './capture.ts';
import { pairLines } from './lyrics.ts';
import { segmentsOf } from './pair.ts';
import { keepTake } from './records.ts';
import type { Take } from './take.ts';
import { cards, pairOf, Stage } from './ui/stage.tsx';

type Failure = 'denied' | 'unavailable';
type View =
  | { kind: 'idle' }
  | { kind: 'starting' }
  | { kind: 'count'; beat: number; elapsed: number }
  | { kind: 'reading'; t: number; elapsed: number }
  | { kind: 'heard'; take: Take }
  | { kind: 'failed'; failure: Failure };

type Session = { capture: Capture; countStart: number; assisted: boolean; frame: number; releaseWake: () => void };

const COUNT_FROM = 3;
const COUNT_BEAT_SEC = 0.8;
const COUNT_SEC = COUNT_FROM * COUNT_BEAT_SEC;
// 帯の 15 秒が終わっても 10 秒は録り続ける。読むのが遅い人の最後を切らないためである。
const LIMIT_SEC = 25;
// 「読み始める」と「やめる」は同じ高さにあるので、続けて押すと始めた録音をすぐ止めてしまう。止めた直後の「読み始める」も同じである。
const RESTART_GUARD_MS = 500;
const HELP_KEY = 'yomimasu.recHelpDone';

const FAILURES: Record<Failure, [string, string]> = {
  denied: ['マイクを使えませんでした。', 'ブラウザーの設定でマイクを許可すると、読んで測れます。教科書とお手本はこのまま使えます。'],
  unavailable: ['録音を始められませんでした。', 'ページを開き直してください。'],
};

function helpDone() {
  try {
    return localStorage.getItem(HELP_KEY) === '1';
  } catch {
    return false;
  }
}

function rememberHelp() {
  try {
    localStorage.setItem(HELP_KEY, '1');
  } catch {
    // 覚えられない環境では、次も説明が出るだけである。
  }
}

// 画面が消えると録音を見ながら読めない。取れない端末でも録音は止めない。
function holdWakeLock(): () => void {
  const wakeLock = (navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock;
  if (!wakeLock) return () => {};
  let held = true;
  let sentinel: { release: () => Promise<void> } | null = null;
  const request = () =>
    wakeLock.request('screen').then(
      (got) => {
        if (held) sentinel = got;
        else void got.release();
      },
      () => {},
    );
  const onVisible = () => {
    if (held && document.visibilityState === 'visible') void request();
  };
  void request();
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    held = false;
    document.removeEventListener('visibilitychange', onVisible);
    void sentinel?.release().catch(() => {});
    sentinel = null;
  };
}

const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

const Icon = ({ path }: { path: string }) => (
  <svg class="ico" viewBox="0 0 12 12" aria-hidden="true">
    <path d={path} />
  </svg>
);
const REC_ICON = 'M6 1a5 5 0 1 0 0 10A5 5 0 0 0 6 1z';
const STOP_ICON = 'M2 2h8v8H2z';
const PLAY_ICON = 'M2 1l9 5-9 5z';

// 録音中の表示は上の帯の右に出す。帯は画面の組み立て（render.ts）が置き、この部品の外にある。
function RecState({ elapsed }: { elapsed: number | null }) {
  useEffect(() => {
    const step = document.querySelector<HTMLElement>('.bar .step');
    if (!step) return;
    render(
      elapsed === null ? null : (
        <span class="rec-state">
          録音中 <span class="rec-state-time">{clock(elapsed)}</span>
        </span>
      ),
      step,
    );
  }, [elapsed === null ? null : Math.floor(elapsed)]);
  useEffect(
    () => () => {
      const step = document.querySelector<HTMLElement>('.bar .step');
      if (step) render(null, step);
    },
    [],
  );
  return null;
}

function Recorder({ fix }: { fix?: string }) {
  const pair = useMemo(() => pairOf(location.search), []);
  const segments = useMemo(() => segmentsOf(pair), [pair]);
  const lines = useMemo(() => pairLines(cards, pair), [pair]);
  const kamiStart = segments.slice(0, -1).reduce((sum, s) => sum + s.sec, 0);
  const total = kamiStart + segments.at(-1)!.sec;

  const [view, setView] = useState<View>({ kind: 'idle' });
  const [assisted, setAssisted] = useState(true);
  const [help, setHelp] = useState(() => !helpDone());
  const session = useRef<Session | null>(null);
  const opening = useRef(false);
  // 止めた時刻までの録音の塊を待っている録音。待つ間に「やめる」を押すか画面を離れたら、確かめる画面へ進めない。
  const stopping = useRef<Capture | null>(null);
  const startedAt = useRef(Number.NEGATIVE_INFINITY);
  const stoppedAt = useRef(Number.NEGATIVE_INFINITY);

  function end(): Session | null {
    const current = session.current;
    session.current = null;
    opening.current = false;
    if (current) {
      cancelAnimationFrame(current.frame);
      current.releaseWake();
    }
    stoppedAt.current = performance.now();
    return current;
  }

  function cancel() {
    stopping.current?.cancel();
    stopping.current = null;
    end()?.capture.cancel();
  }

  async function finish() {
    const current = end();
    if (!current) return;
    const { capture } = current;
    stopping.current = capture;
    const readingStartSec = capture.positionSec(current.countStart + COUNT_SEC);
    const { pcm, sampleRate, voiceProcessing } = await capture.stop(capture.now());
    if (stopping.current !== capture) return;
    stopping.current = null;
    const take: Take = {
      pcm,
      sampleRate,
      readingStartSec,
      assisted: current.assisted,
      pair,
      voiceProcessing,
    };
    await keepTake(take);
    setView({ kind: 'heard', take });
  }

  function tick() {
    const current = session.current;
    if (!current) return;
    const elapsed = current.capture.now() - current.countStart;
    if (elapsed < COUNT_SEC) {
      setView({ kind: 'count', beat: COUNT_FROM - Math.floor(elapsed / COUNT_BEAT_SEC), elapsed });
    } else if (elapsed - COUNT_SEC >= LIMIT_SEC) {
      void finish();
      return;
    } else {
      setView({ kind: 'reading', t: elapsed - COUNT_SEC, elapsed });
    }
    current.frame = requestAnimationFrame(tick);
  }

  function closeHelp() {
    setHelp(false);
    rememberHelp();
  }

  async function start() {
    if (opening.current || session.current || performance.now() - stoppedAt.current < RESTART_GUARD_MS) return;
    opening.current = true;
    startedAt.current = performance.now();
    closeHelp();
    setView({ kind: 'starting' });
    let capture: Capture;
    try {
      capture = await startCapture();
    } catch (error) {
      opening.current = false;
      setView({ kind: 'failed', failure: error instanceof DOMException && error.name === 'NotAllowedError' ? 'denied' : 'unavailable' });
      return;
    }
    // マイクを開いている間に「やめる」を押したか、画面を離れた。
    if (!opening.current) {
      capture.cancel();
      return;
    }
    opening.current = false;
    session.current = { capture, countStart: capture.now(), assisted, frame: 0, releaseWake: holdWakeLock() };
    tick();
  }

  function stopByUser() {
    if (performance.now() - startedAt.current < RESTART_GUARD_MS) return;
    cancel();
    setView({ kind: 'idle' });
  }

  // 画面が隠れたら、やめる扱いにしてマイクを閉じる。録音の画面を離れるときも同じである。
  useEffect(() => {
    const leave = () => {
      if (!session.current && !opening.current && !stopping.current) return;
      cancel();
      setView({ kind: 'idle' });
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') leave();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', leave);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', leave);
      cancel();
    };
  }, []);

  const recording = view.kind === 'count' || view.kind === 'reading';
  const guide = view.kind === 'reading' ? Math.min(view.t, total) : 0;
  const kimariji = [pair.shimo, pair.kami].map((no) => cards.find((card) => card.no === no)?.kimariji?.kana ?? `${no}番`).join(' ');

  const heard = view.kind === 'heard';
  const run = (
    <>
      {fix && <div class="fix-chip">直す1点：{fix}</div>}
      {(!fix || heard) && (
        <div class="run">
          {!fix && (
            <div>
              <span class="gt">&gt;</span> /yomimasu 読む {kimariji}
            </div>
          )}
          {heard && <div class="read">● 録音しました</div>}
        </div>
      )}
    </>
  );

  if (view.kind === 'heard') {
    const { take } = view;
    return (
      <>
        {run}
        <RecState elapsed={null} />
        <section class="heard">
          <h2>読めました。まず聴いてみましょう。</h2>
          <p>数値を見る前に、自分の耳で確かめます。どこが気になるか、お手本と比べてください。</p>
        </section>
        <div class="pair">
          <button class="btn" type="button" disabled>
            <Icon path={PLAY_ICON} />
            自分の読み
          </button>
          <button class="btn" type="button" disabled>
            <Icon path={PLAY_ICON} />
            お手本
          </button>
        </div>
        <p class="fine">再生はまだ使えません。</p>
        <div class="heard-next">
          <button class="btn btn--line" type="button" onClick={() => setView({ kind: 'idle' })}>
            読み直す
          </button>
          <a class="btn btn--fill" href="/result/">
            結果を見る
          </a>
        </div>
        <div
          hidden
          data-testid="take"
          data-length-sec={(take.pcm.length / take.sampleRate).toFixed(3)}
          data-reading-start-sec={take.readingStartSec.toFixed(3)}
          data-assisted={String(take.assisted)}
          data-pair={`${take.pair.shimo}-${take.pair.kami}`}
          data-voice-processing={JSON.stringify(take.voiceProcessing)}
        />
      </>
    );
  }

  return (
    <>
      {run}
      <RecState elapsed={recording ? view.elapsed : null} />
      <Stage
        segments={segments}
        lines={lines}
        t={guide}
        assisted={assisted}
        notationLocked={view.kind === 'starting' || recording}
        count={view.kind === 'count' ? view.beat : null}
      >
        {/* 余韻の入りで押して数え直す仕組みは置かない。字が朱になっていくのはカラオケと同じ理屈なので、たいていの人は余韻の入りも朱の字に合わせられ、
            押す操作はかえって、字を追って読む邪魔になる（2026-11-04 のユーザーの判断） */}
        {help && view.kind === 'idle' && (
          <div class="rec-help" role="dialog" aria-label="読む前に">
            <b>読む前に</b>
            <p>「読み始める」を押すと、3・2・1 と数えます。数え終わったら読み始めてください。</p>
            <button class="btn" type="button" onClick={closeHelp}>
              わかった
            </button>
          </div>
        )}
      </Stage>
      <div class="controls">
        {view.kind === 'idle' && (
          <>
            <button class="btn btn--fill" type="button" onClick={start}>
              <Icon path={REC_ICON} />
              読み始める
            </button>
            <div class="pair">
              <button class="btn" type="button" aria-pressed={assisted} onClick={() => setAssisted(true)}>
                補助あり
              </button>
              <button class="btn" type="button" aria-pressed={!assisted} onClick={() => setAssisted(false)}>
                補助を外す
              </button>
            </div>
            <p class="fine">
              {/* 「あとから消せます」も書きたいが、足すと 360×560 の1画面に収まらない。消し方は前回と比べる画面で伝える */}
              録音は端末に残り、外へ送りません。{' '}
              <button class="link-inline" type="button" onClick={() => setHelp(true)}>
                読み方の説明
              </button>
            </p>
          </>
        )}
        {(view.kind === 'starting' || recording) && (
          <div class="pair">
            <button class="btn btn--line" type="button" onClick={stopByUser}>
              <Icon path={STOP_ICON} />
              やめる
            </button>
            {/* 早く押して短い録音になるのを防ぐため、上の句の区間に入るまで押せない */}
            <button class="btn" type="button" disabled={!(view.kind === 'reading' && guide >= kamiStart)} onClick={finish}>
              読み終えた
            </button>
          </div>
        )}
        {view.kind === 'failed' && (
          <div class="card alert" role="alert">
            <b>{FAILURES[view.failure][0]}</b>
            <p class="fine">{FAILURES[view.failure][1]}</p>
            <button class="btn btn--fill" type="button" onClick={start}>
              もう一度試す
            </button>
            <a class="btn btn--line" href="/">
              教科書へ戻る
            </a>
          </div>
        )}
      </div>
    </>
  );
}

export function mountRecorder(element: HTMLElement) {
  render(<Recorder fix={element.getAttribute('fix') ?? undefined} />, element);
  return () => render(null, element);
}
