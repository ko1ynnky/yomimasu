import { render } from 'preact';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
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
.intro-points { margin: 0; padding: 0; list-style: none; display: grid; gap: 2px; font-size: 15px; line-height: 1.6; }
.intro-points b { color: var(--shu-deep); }
.intro-rule { display: grid; gap: 10px; }
.big-num { font-family: var(--f-mono); font-size: 30px; font-weight: 600; line-height: 1.3; }
.kim-in { font-family: var(--f-uta); font-weight: 400; font-synthesis: none; color: var(--shu-deep); }
.listen-pair { font-size: 16px; line-height: 1.6; }
[data-mark] { position: relative; outline: 3px solid var(--shu); outline-offset: 2px; border-radius: 6px; }
[data-mark]::after { content: attr(data-mark); position: absolute; z-index: 4; width: 22px; height: 22px; border-radius: 50%; background: var(--shu); color: var(--on-shu); font: 700 13px/22px var(--f-mono); text-align: center; }
.band[data-mark]::after { top: -12px; left: -12px; }
.stage-body[data-mark]::after { bottom: 8px; left: 8px; }
.listen-controls { flex: none; display: grid; gap: 6px; }
.listen-controls .fine { display: flex; flex-wrap: wrap; align-items: center; column-gap: 1em; }
.link-btn { justify-self: start; min-height: 44px; padding: 0; border: 0; background: none; color: var(--ink-2); font-size: 14px; text-decoration: underline; cursor: pointer; }
.listen-alert { padding: 12px 14px; }
.choose { display: grid; gap: 8px; padding: 12px 14px; }
.choose label { display: grid; gap: 4px; font-size: 14px; color: var(--ink-2); }
.choose select { min-height: 44px; padding: 6px 10px; border: 1px solid var(--rule); border-radius: 10px; background: var(--card); color: var(--ink); font-family: var(--f-uta); font-size: 16px; }
`;

const INTRO = [
  '競技かるたの読みには、5-3-1-6 というシンプルなルールがあります。',
  'このアプリでは、5-3-1-6 の感覚をつかむために、2つの仕組みを使います。',
  'お手本と一緒に、ルールを確かめてみましょう。',
  'では、読んでみませんか？',
];
const INTRO_KEY = 'yomimasu.introDone';
const LOAD_FAILED = 'お手本を読み込めませんでした。通信を確かめて、もう一度押してください。';
// 帯は標準の 5・3・1・6 で進め、お手本の音には合わせない（ui-guide 7節）。音と食い違って見えるので、先に断る。
const BAND_NOTE = '帯は標準の時間で進むので、お手本の音とはずれます。';

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

type Motion = { kind: 'idle' } | { kind: 'check'; t: number } | { kind: 'listen'; t: number };

// 帯と枠の地を進める時計。お手本は音の文脈の時刻から、「確認する」は音を鳴らさないので画面の時刻から取る。
function useMotion(total: number) {
  const [motion, setMotion] = useState<Motion>({ kind: 'idle' });
  const playback = useRef<Playback | null>(null);
  const frame = useRef(0);

  const halt = () => {
    cancelAnimationFrame(frame.current);
    const current = playback.current;
    playback.current = null;
    current?.stop();
    setMotion({ kind: 'idle' });
  };

  useEffect(() => {
    window.addEventListener('pagehide', halt);
    return () => {
      window.removeEventListener('pagehide', halt);
      halt();
    };
  }, []);

  function check(onEnd: () => void) {
    halt();
    const from = performance.now();
    const tick = () => {
      const t = (performance.now() - from) / 1000;
      if (t >= total) {
        setMotion({ kind: 'idle' });
        onEnd();
        return;
      }
      setMotion({ kind: 'check', t });
      frame.current = requestAnimationFrame(tick);
    };
    tick();
  }

  // 押した処理の中から同期で呼ぶ。play() が最初の await より前に AudioContext を作って resume() を呼ぶ。
  function listen(pair: Pair, onEnd: (outcome: 'ended' | 'failed') => void) {
    halt();
    const current = play(pairLoader(pair, storedAudioSource()));
    playback.current = current;
    setMotion({ kind: 'listen', t: 0 });
    const tick = () => {
      if (playback.current !== current) return;
      setMotion({ kind: 'listen', t: Math.min(current.elapsed() ?? 0, total) });
      frame.current = requestAnimationFrame(tick);
    };
    tick();
    void current.finished.then((outcome) => {
      if (playback.current !== current) return;
      cancelAnimationFrame(frame.current);
      playback.current = null;
      setMotion({ kind: 'idle' });
      if (outcome !== 'stopped') onEnd(outcome);
    });
  }

  return { motion, halt, check, listen };
}

// 段2で①②の行に対応させて、上の帯と歌の後ろの色を囲む。どちらも枠（stage.tsx）の中にあり、枠はこの Issue では変えないので、描いたあとに印を付ける。
// 囲みは①②の行が流れ始めたときに付ける決まりだが、文を流す形（Y-12）がまだないので、段2を出したときに付ける。Y-18 で流れ始めにつなぐ。
function useMarks(root: { current: HTMLElement | null }, on: boolean) {
  useLayoutEffect(() => {
    const targets: [string, string][] = [
      ['.stage .band', '①'],
      ['.stage .stage-body', '②'],
    ];
    for (const [selector, mark] of targets) {
      const element = root.current?.querySelector<HTMLElement>(selector);
      if (!element) continue;
      if (on) element.dataset.mark = mark;
      else delete element.dataset.mark;
    }
  });
}

function Listen() {
  // 組の指定がある URL は練習モードから来たので、導入を出さない（ui-guide 8節「まず1回読む の導入」）。
  const chosen = useMemo(() => pairFromSearch(location.search) !== DEFAULT_PAIR, []);
  const pair = useMemo(() => pairOf(location.search), []);
  const segments = useMemo(() => segmentsOf(pair), [pair]);
  const lines = useMemo(() => pairLines(cards, pair), [pair]);
  const total = segments.reduce((sum, s) => sum + s.sec, 0);

  const [step, setStep] = useState(() => (chosen || introDone() ? 4 : 1));
  const [checked, setChecked] = useState(false);
  const [failed, setFailed] = useState(false);
  const { motion, halt, check, listen } = useMotion(total);
  const root = useRef<HTMLDivElement>(null);

  useStep(step < 4 && !chosen ? `はじめに ${step} / 4` : '1 / 3 聞く');
  useMarks(root, step === 2);
  useEffect(() => {
    if (step === 4 && !chosen) rememberIntro();
  }, [step]);

  const go = (next: number) => {
    halt();
    setFailed(false);
    setChecked(false);
    setStep(next);
  };

  const t = motion.kind === 'idle' ? 0 : motion.t;

  const listenButton = (className: string) =>
    motion.kind === 'listen' ? (
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
            else if (step === 3) go(4);
          });
        }}
      >
        <Icon path={PLAY_ICON} />
        お手本を聞く
      </button>
    );

  return (
    <div style={{ display: 'contents' }} ref={root}>
      <style>{STYLE}</style>
      <p class="say">{INTRO[step - 1]}</p>
      {step === 1 ? (
        <div class="intro-rule">
          <div class="big-num">5-3-1-6</div>
          <Band segments={segments} fixed />
        </div>
      ) : (
        <>
          {step === 2 && (
            <ol class="intro-points">
              <li>
                <b>① 上の帯</b>：全体の時間の進みがわかります
              </li>
              <li>
                <b>② 歌の後ろの色</b>：下の句、余韻と間、上の句の、それぞれの中での進みがわかります
              </li>
            </ol>
          )}
          <PairName pair={pair} />
          {/* 歌詞の文字は進めない。文字の時刻は読手の測定値で、確認が取れるまでリポジトリに入れない */}
          <Stage segments={segments} lines={lines} t={t} />
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
        {/* 段2は文と①②の行で縦に長くなるので、2つのボタンを1行に並べて 393×659 に収める */}
        {step === 2 && (
          <div class="pair">
            <button
              class="btn"
              type="button"
              onClick={() => {
                if (motion.kind === 'check') {
                  halt();
                  return;
                }
                check(() => setChecked(true));
              }}
            >
              {motion.kind === 'check' ? 'やめる' : checked ? 'もう一度確認する' : '確認する'}
            </button>
            <button class="btn btn--fill" type="button" onClick={() => go(3)}>
              次へ
            </button>
          </div>
        )}
        {step === 3 && listenButton('btn btn--fill')}
        {step === 4 && (
          <div class="pair">
            {listenButton('btn')}
            <a class="btn btn--fill" href={`/read/rec/${pairQuery(pair)}`}>
              読んでみる
            </a>
          </div>
        )}
        {step >= 3 && (
          <p class="fine">
            {BAND_NOTE}
            {step === 4 && !chosen && (
              <button class="link-btn" type="button" onClick={() => go(1)}>
                はじめの説明をもう一度見る
              </button>
            )}
          </p>
        )}
      </div>
    </div>
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
const BY_KIMARIJI = [...HUNDRED].sort((a, b) => (a.kimariji?.kana ?? '').localeCompare(b.kimariji?.kana ?? '', 'ja'));

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
