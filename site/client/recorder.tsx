import { render } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { startCapture, type Capture, type VoiceProcessing } from './capture.ts';
import { pairLines, secondShimoLineAt, tapCharOf } from './lyrics.ts';
import { segmentsOf } from './pair.ts';
import { putLastTake, type Take } from './take.ts';
import { cards, pairOf, Stage } from './ui/stage.tsx';

type Failure = 'denied' | 'unavailable';
type View =
  | { kind: 'idle' }
  | { kind: 'starting' }
  | { kind: 'count'; beat: number; elapsed: number }
  | { kind: 'reading'; t: number; elapsed: number }
  | { kind: 'heard'; take: RecordedTake }
  | { kind: 'failed'; failure: Failure };

// take.ts はこの Issue では yoinTapSec を足すだけにする。声の処理の結果は録音と一緒に置き、型に入れるのは記録を残す C8 で決める。
type RecordedTake = Take & { voiceProcessing: VoiceProcessing };

type Session = { capture: Capture; countStart: number; assisted: boolean; tapAt: number | null; frame: number; releaseWake: () => void };

const COUNT_FROM = 3;
const COUNT_BEAT_SEC = 0.8;
const COUNT_SEC = COUNT_FROM * COUNT_BEAT_SEC;
// 帯の 15 秒が終わっても 10 秒は録り続ける。読むのが遅い人の最後を切らないためである。
const LIMIT_SEC = 25;
// 余韻に入るのが遅い人も、標準の余韻の始まりから2秒は合わせ直せる。
const TAP_LATE_SEC = 2;
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
  const tapChar = tapCharOf(lines);
  const yoinStart = segments[0].sec;
  const kamiStart = segments.slice(0, -1).reduce((sum, s) => sum + s.sec, 0);
  const total = kamiStart + segments.at(-1)!.sec;
  const tapFrom = secondShimoLineAt(lines, yoinStart);
  const tapUntil = yoinStart + TAP_LATE_SEC;

  const [view, setView] = useState<View>({ kind: 'idle' });
  const [assisted, setAssisted] = useState(true);
  const [help, setHelp] = useState(() => !helpDone());
  const [tapLine, setTapLine] = useState<string | null>(null);
  const session = useRef<Session | null>(null);
  const opening = useRef(false);
  const startedAt = useRef(Number.NEGATIVE_INFINITY);
  const stoppedAt = useRef(Number.NEGATIVE_INFINITY);

  const guideTime = (t: number, tapAt: number | null) => (tapAt === null || t < tapAt ? t : yoinStart + (t - tapAt));

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
    end()?.capture.cancel();
  }

  function finish() {
    const current = end();
    if (!current) return;
    const readingStartSec = current.capture.positionSec(current.countStart + COUNT_SEC);
    const { pcm, sampleRate, voiceProcessing } = current.capture.stop();
    const take: RecordedTake = {
      pcm,
      sampleRate,
      readingStartSec,
      assisted: current.assisted,
      pair,
      ...(current.tapAt === null ? {} : { yoinTapSec: current.tapAt }),
      voiceProcessing,
    };
    putLastTake(take);
    // 確かめる画面では数値を先に見せないので、タップの差の行も消す。
    setTapLine(null);
    setView({ kind: 'heard', take });
  }

  function tick() {
    const current = session.current;
    if (!current) return;
    const elapsed = current.capture.now() - current.countStart;
    if (elapsed < COUNT_SEC) {
      setView({ kind: 'count', beat: COUNT_FROM - Math.floor(elapsed / COUNT_BEAT_SEC), elapsed });
    } else if (elapsed - COUNT_SEC >= LIMIT_SEC) {
      finish();
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
    setTapLine(null);
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
    session.current = { capture, countStart: capture.now(), assisted, tapAt: null, frame: 0, releaseWake: holdWakeLock() };
    tick();
  }

  function stopByUser() {
    if (performance.now() - startedAt.current < RESTART_GUARD_MS) return;
    cancel();
    setTapLine(null);
    setView({ kind: 'idle' });
  }

  // 画面が隠れたら、やめる扱いにしてマイクを閉じる。録音の画面を離れるときも同じである。
  useEffect(() => {
    const leave = () => {
      if (!session.current && !opening.current) return;
      cancel();
      setTapLine(null);
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

  // 余韻の入りで画面のどこかを押すと、その時刻から余韻と間を数え直す。押した瞬間に合わせるので、打ち込みの間は置かない。
  useEffect(() => {
    const onTap = (event: PointerEvent) => {
      const current = session.current;
      if (!current || !current.assisted || current.tapAt !== null) return;
      if (event.target instanceof Element && event.target.closest('button, a')) return;
      const t = current.capture.now() - current.countStart - COUNT_SEC;
      if (t < tapFrom || t > tapUntil) return;
      current.tapAt = t;
      const diff = t - yoinStart;
      // 余韻の長さに読める数字は出さない。音から測った値に見えるからである。
      setTapLine(`余韻の入りをタップに合わせました（標準より ${Math.abs(diff).toFixed(2)}秒${diff < 0 ? '早い' : '遅い'}）`);
    };
    document.addEventListener('pointerdown', onTap);
    return () => document.removeEventListener('pointerdown', onTap);
  }, [tapFrom, tapUntil, yoinStart]);

  const recording = view.kind === 'count' || view.kind === 'reading';
  const tapAt = session.current?.tapAt ?? null;
  const guide = view.kind === 'reading' ? Math.min(guideTime(view.t, tapAt), total) : 0;
  const accepting = view.kind === 'reading' && assisted && tapAt === null && view.t >= tapFrom && view.t <= tapUntil;
  const kimariji = [pair.shimo, pair.kami].map((no) => cards.find((card) => card.no === no)?.kimariji?.kana ?? `${no}番`).join(' ');

  const notes = [tapLine, view.kind === 'heard' ? '録音しました' : null].filter((line): line is string => line !== null);
  const run = (
    <>
      {fix && <div class="fix-chip">直す1点：{fix}</div>}
      {(!fix || notes.length > 0) && (
        <div class="run">
          {!fix && (
            <div>
              <span class="gt">&gt;</span> /yomimasu 読む {kimariji}
            </div>
          )}
          {notes.map((line) => (
            <div class="read">● {line}</div>
          ))}
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
          data-yoin-tap-sec={take.yoinTapSec?.toFixed(3)}
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
        tap
        count={view.kind === 'count' ? view.beat : null}
        hint={accepting ? `画面のどこかを、「${tapChar}」でタップ` : null}
      >
        {help && view.kind === 'idle' && (
          <div class="rec-help" role="dialog" aria-label="読む前に">
            <b>読む前に</b>
            <p>「読み始める」を押すと、3・2・1 と数えます。数え終わったら読み始めてください。</p>
            <p>下の句の最後の「{tapChar}」を読む瞬間に、画面のどこかをタップしてください。</p>
            <p>
              余韻に入る時刻がガイドとずれると、余韻を無理にのばしたり、ずれたまま読み進めたりすることになります。タップすると、ガイドがあなたの余韻に合わせて数え直します。押さなくても、標準の時間で進みます。
            </p>
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
              録音はこの端末の外へ送りません。{' '}
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
