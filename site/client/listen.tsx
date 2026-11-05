import { render } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Card } from '../../.claude/skills/yomimasu/scripts/cards.ts';
import { pairLines } from './lyrics.ts';
import { DEFAULT_PAIR, pairFromSearch, segmentsOf, type CardNo, type Pair } from './pair.ts';
import { pairLoader, play, storedAudioSource, type Playback } from './playback.ts';
import { Band } from './ui/band.tsx';
import { cards, pairOf, Stage } from './ui/stage.tsx';

// 聞く画面（C1）と、練習モードの組の選択（A1）。
// 押したらターミナルに打ち込む形、冒頭の文を流す形、「戻る」は Y-12 が作るので、ここには入れない。Y-18 でつなぐ。
// 画面の CSS を置くファイルはこの Issue の範囲の外なので、見た目は STYLE に持つ。Y-18 で listen.css へ移す。
const STYLE = `
yomimasu-listen { flex: 1 1 auto; display: flex; flex-direction: column; gap: 10px; }
.say { font-size: 16px; line-height: 1.75; }
.say::before { content: "● "; color: var(--shu); }
.intro-rule { display: grid; gap: 12px; padding-block: 8px; }
.big-num { font-family: var(--f-mono); font-size: 30px; font-weight: 600; line-height: 1.3; }
.kim-in { font-family: var(--f-uta); font-weight: 400; font-synthesis: none; color: var(--shu-deep); }
.listen-pair { font-size: 16px; line-height: 1.6; }
.listen-controls { flex: none; display: grid; gap: 6px; }
.link-btn { justify-self: start; min-height: 44px; padding: 0; border: 0; background: none; color: var(--ink-2); font-size: 14px; text-decoration: underline; cursor: pointer; }
.listen-alert { padding: 12px 14px; }
.choose { display: grid; gap: 8px; padding: 12px 14px; }
.choose label { display: grid; gap: 4px; font-size: 14px; color: var(--ink-2); }
.choose select { min-height: 44px; padding: 6px 10px; border: 1px solid var(--rule); border-radius: 10px; background: var(--card); color: var(--ink); font-family: var(--f-uta); font-size: 16px; }
`;

// 帯と歌の後ろの色を ①② で説明する段は置かない。歌の枠から帯と地の減りをなくしたからである（ui-guide 8節。2026-11-04 夜のユーザーの判断）。
const INTRO = [
  '競技かるたの読みには、5-3-1-6 というシンプルなルールがあります。',
  'お手本と一緒に、ルールを確かめてみましょう。',
  'では、読んでみませんか？',
];
const INTRO_KEY = 'yomimasu.introDone';
const LOAD_FAILED = 'お手本を読み込めませんでした。通信を確かめて、もう一度押してください。';
// 字の時刻は標準の 5・3・1・6 の割り振りで、お手本の音には合わせない（ui-guide 7節「字の時刻」）。音と食い違って見えるので、先に断る。
const TIMING_NOTE = '字の朱は標準の時間で進むので、お手本の音とはずれます。';

function introDone() {
  try {
    return localStorage.getItem(INTRO_KEY) === '1';
  } catch {
    return false;
  }
}

function rememberIntro() {
  try {
    localStorage.setItem(INTRO_KEY, '1');
  } catch {
    // 覚えられない環境では、毎回段1から出るだけである。
  }
}

const kimarijiOf = (no: CardNo) => cards.find((card) => card.no === no)?.kimariji?.kana ?? '';
const pairQuery = (pair: Pair) => `?shimo=${pair.shimo}&kami=${pair.kami}`;

const PairName = ({ pair }: { pair: Pair }) => (
  <p class="listen-pair" data-testid="pair">
    <span class="kim-in">{kimarijiOf(pair.shimo)}</span> → <span class="kim-in">{kimarijiOf(pair.kami)}</span>
  </p>
);

// 上の帯の右の進み具合。上の帯は画面の組み立て（render.ts）が置き、この部品の外にある。
function useStep(text: string) {
  useEffect(() => {
    const step = document.querySelector<HTMLElement>('.bar .step');
    if (step) step.textContent = text;
  }, [text]);
  useEffect(
    () => () => {
      const step = document.querySelector<HTMLElement>('.bar .step');
      if (step) step.textContent = '';
    },
    [],
  );
}

const Icon = ({ path }: { path: string }) => (
  <svg class="ico" viewBox="0 0 12 12" aria-hidden="true">
    <path d={path} />
  </svg>
);
const PLAY_ICON = 'M2 1l9 5-9 5z';
const STOP_ICON = 'M2 2h8v8H2z';

// 字の塗りと囲みを進める時計。お手本の音の文脈の時刻から取り、下の句の開始の予約時刻を 0 秒とする。鳴らしていないあいだは null である。
function usePlayback(total: number) {
  const [t, setT] = useState<number | null>(null);
  const playback = useRef<Playback | null>(null);
  const frame = useRef(0);

  const halt = () => {
    cancelAnimationFrame(frame.current);
    const current = playback.current;
    playback.current = null;
    current?.stop();
    setT(null);
  };

  useEffect(() => {
    window.addEventListener('pagehide', halt);
    return () => {
      window.removeEventListener('pagehide', halt);
      halt();
    };
  }, []);

  // 押した処理の中から同期で呼ぶ。play() が最初の await より前に AudioContext を作って resume() を呼ぶ。
  function listen(pair: Pair, onEnd: (outcome: 'ended' | 'failed') => void) {
    halt();
    const current = play(pairLoader(pair, storedAudioSource()));
    playback.current = current;
    const tick = () => {
      if (playback.current !== current) return;
      setT(Math.min(current.elapsed() ?? 0, total));
      frame.current = requestAnimationFrame(tick);
    };
    tick();
    void current.finished.then((outcome) => {
      if (playback.current !== current) return;
      cancelAnimationFrame(frame.current);
      playback.current = null;
      setT(null);
      if (outcome !== 'stopped') onEnd(outcome);
    });
  }

  return { t, halt, listen };
}

function Listen() {
  // 組の指定がある URL は練習モードから来たので、導入を出さない（ui-guide 8節「まず1回読む の導入」）。
  const chosen = useMemo(() => pairFromSearch(location.search) !== DEFAULT_PAIR, []);
  const pair = useMemo(() => pairOf(location.search), []);
  const segments = useMemo(() => segmentsOf(pair), [pair]);
  const lines = useMemo(() => pairLines(cards, pair), [pair]);
  const total = segments.reduce((sum, s) => sum + s.sec, 0);

  const [step, setStep] = useState(() => (chosen || introDone() ? 3 : 1));
  const [failed, setFailed] = useState(false);
  const { t, halt, listen } = usePlayback(total);
  const playing = t !== null;

  useStep(step < 3 ? `はじめに ${step} / 3` : '1 / 3 聞く');
  useEffect(() => {
    if (step === 3 && !chosen) rememberIntro();
  }, [step]);

  const go = (next: number) => {
    halt();
    setFailed(false);
    setStep(next);
  };

  const listenButton = (className: string) =>
    playing ? (
      <button class="btn btn--line" type="button" onClick={halt}>
        <Icon path={STOP_ICON} />
        やめる
      </button>
    ) : (
      <button
        class={className}
        type="button"
        onClick={() => {
          setFailed(false);
          listen(pair, (outcome) => {
            if (outcome === 'failed') setFailed(true);
            else if (step === 2) go(3);
          });
        }}
      >
        <Icon path={PLAY_ICON} />
        お手本を聞く
      </button>
    );

  return (
    <>
      <style>{STYLE}</style>
      <p class="say">{INTRO[step - 1]}</p>
      {step === 1 ? (
        <div class="intro-rule">
          <div class="big-num">5-3-1-6</div>
          <Band segments={segments} fixed tall />
        </div>
      ) : (
        <>
          <PairName pair={pair} />
          {/* 表記の切り替えは段3からで、再生中は読む画面の録音中と同じく歌を動かさないよう隠す（ui-guide 8節「まず1回読む の導入」） */}
          <Stage segments={segments} lines={lines} t={t ?? 0} notationLocked={step < 3 || playing} />
        </>
      )}
      <div class="listen-controls">
        {failed && (
          <div class="card listen-alert" role="alert">
            <p>{LOAD_FAILED}</p>
          </div>
        )}
        {step === 1 && (
          <button class="btn btn--fill" type="button" onClick={() => go(2)}>
            次へ
          </button>
        )}
        {step === 2 && listenButton('btn btn--fill')}
        {/* 段3へは聞き終えたときに進むので、読み込めないと行き止まりになる。読み込めなかったときだけ、聞かずに進む道を出す */}
        {step === 2 && failed && (
          <button class="btn btn--line" type="button" onClick={() => go(3)}>
            聞かずに進む
          </button>
        )}
        {step === 3 && (
          <>
            {listenButton('btn')}
            <a class="btn btn--fill" href={`/read/rec/${pairQuery(pair)}`}>
              読んでみる
            </a>
            {!chosen && (
              <button class="link-btn" type="button" onClick={() => go(1)}>
                はじめの説明をもう一度見る
              </button>
            )}
          </>
        )}
        {step >= 2 && <p class="fine">{TIMING_NOTE}</p>}
      </div>
    </>
  );
}

// 「おすすめの組」は出さない（ui-guide 8節「練習モードの組の選び方」）。下の句と上の句は100首の別々の札から選ぶ。
// 序歌は下の句を2回読み、区間の形が変わるので、序歌の組を足す作業（Y-19）までは選ばない。
const HUNDRED = cards.filter((card) => card.no >= 1 && card.no <= 100);

export function randomPair(random: () => number = Math.random): Pair {
  const pick = () => HUNDRED[Math.floor(random() * HUNDRED.length)].no;
  const shimo = pick();
  let kami = pick();
  while (kami === shimo) kami = pick();
  return { shimo, kami };
}

// 選手は札を決まり字で呼ぶので、選ぶ欄も決まり字で並べる。歌番号は出さない（ui-guide 7節「歌に出すもの」）。
// 並びは 7節「100首の一覧」の決まり字順にする。仮名の順だと、「お」の札が あ・お・を の3か所に分かれる。
// 決まり字の最初の音で分け、その音で始まる札の多い順に並べる。札の数が同じ音は読み方一覧の順で、札の数からは出せないので並びを持つ。
// 分けるのは発音の音（44番「あふこ」と26番「をぐ」は「お」）で、音の中は決まり字の仮名の順にする。
const SOUND_ORDER = 'あなおわたこみはやよかいちひきうつしもゆむすめふさほせ';
const soundRank = (card: Card) => SOUND_ORDER.indexOf(card.kimariji?.sound[0] ?? '');
const BY_KIMARIJI = [...HUNDRED].sort((a, b) => soundRank(a) - soundRank(b) || (a.kimariji?.kana ?? '').localeCompare(b.kimariji?.kana ?? '', 'ja'));

function CardSelect({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label>
      {label}
      <select value={value} onChange={(event) => onChange((event.target as HTMLSelectElement).value)}>
        <option value="">選んでください</option>
        {BY_KIMARIJI.map((card) => (
          <option value={String(card.no)}>{card.kimariji?.kana}</option>
        ))}
      </select>
    </label>
  );
}

// 「自分で選ぶ」は、100首の一覧の「この札で読む」から始める決まりである。一覧の画面がまだないので、行き止まりにしないよう、
// 下の句と上の句の札をここで選ぶ。一覧ができたら、一覧へのリンクに替える（Y-18）。
function Practice() {
  const random = useMemo(() => randomPair(), []);
  const [choosing, setChoosing] = useState(false);
  const [shimo, setShimo] = useState('');
  const [kami, setKami] = useState('');
  const pair = shimo && kami && shimo !== kami ? { shimo: Number(shimo), kami: Number(kami) } : null;

  return (
    <>
      <style>{STYLE}</style>
      <div class="listen-controls">
        <a class="btn btn--fill" href={`/read/rec/${pairQuery(random)}`}>
          ランダムに出題する
        </a>
        <button class="btn btn--line" type="button" aria-expanded={choosing} onClick={() => setChoosing(!choosing)}>
          自分で選ぶ
        </button>
      </div>
      {choosing && (
        <div class="card choose">
          <CardSelect label="下の句の札" value={shimo} onChange={setShimo} />
          <CardSelect label="上の句の札" value={kami} onChange={setKami} />
          {shimo && kami && shimo === kami && <p class="fine">下の句と上の句は別の札から選びます。</p>}
          {pair && (
            <>
              <PairName pair={pair} />
              <div class="pair">
                <a class="btn" href={`/read/${pairQuery(pair)}`}>
                  お手本を聞く
                </a>
                <a class="btn" href={`/read/rec/${pairQuery(pair)}`}>
                  読む
                </a>
              </div>
            </>
          )}
        </div>
      )}
      <p class="fine">ランダムは、下の句と上の句を別々の札から選びます。</p>
    </>
  );
}

export function mountListen(element: HTMLElement) {
  // 中の要素は JS のないときのためのリンクで、render は前からある子を消さないので、先に外す。
  element.replaceChildren();
  render(element.getAttribute('mode') === 'practice' ? <Practice /> : <Listen />, element);
  return () => render(null, element);
}
