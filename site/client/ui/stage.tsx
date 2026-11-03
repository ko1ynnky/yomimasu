import { render, type ComponentChildren } from 'preact';
import { useLayoutEffect, useRef } from 'preact/hooks';
import deck from '../../../.claude/skills/yomimasu/assets/cards.json' with { type: 'json' };
import type { Card } from '../../../.claude/skills/yomimasu/scripts/cards.ts';
import { pairLines, type Line, type PairLines, type Token } from '../lyrics.ts';
import { DEFAULT_PAIR, pairFromSearch, segmentsOf, type Pair, type Segment, type SegmentKey } from '../pair.ts';
import { Band } from './band.tsx';
import './stage.css';

export const cards = deck.cards as unknown as Card[];

// 読む流れの組は 81番→45番にする（ui-guide 8節）。pair.ts の既定は前の 77番→29番のままで、直すのはこの Issue の範囲の外である。
const READ_PAIR: Pair = { shimo: 81, kami: 45 };

export function pairOf(search: string): Pair {
  const pair = pairFromSearch(search);
  return pair === DEFAULT_PAIR ? READ_PAIR : pair;
}

// 余韻の最後の1秒は、声を弱め始めてよい範囲として地の色を薄くする（ui-guide 7節）。
const FADE_SEC = 1;

type Phase = { keys: SegmentKey[]; label: string; from: number; sec: number; fill: string; segments: { segment: Segment; from: number }[] };

// 間は1秒しかなく、名前が1秒で切り替わると目で追えないので、余韻と間を1つの区間として見せる。
export function phasesOf(segments: readonly Segment[]): Phase[] {
  const phases: Phase[] = [];
  let at = 0;
  for (const segment of segments) {
    const last = phases.at(-1);
    const placed = { segment, from: at };
    if (segment.key === 'ma' && last?.keys.at(-1) === 'yoin') {
      last.keys.push('ma');
      last.segments.push(placed);
      last.sec += segment.sec;
    } else {
      phases.push({ keys: [segment.key], label: segment.label, from: at, sec: segment.sec, fill: '', segments: [placed] });
    }
    at += segment.sec;
  }
  for (const phase of phases) {
    if (phase.segments.length === 1) {
      phase.fill = `var(--seg-${phase.keys[0]})`;
      continue;
    }
    const [yoin, ma] = phase.segments.map((s) => s.segment);
    phase.label = `余韻と間（${yoin.sec.toFixed(1)}＋${ma.sec.toFixed(1)}秒）`;
    // 地は上から減るので、先に来る区間の色を上に置く。余韻の色が減りきると間の色だけが残り、境目が見える。
    const pct = (sec: number) => `${(sec / phase.sec) * 100}%`;
    phase.fill = `linear-gradient(to bottom, var(--seg-yoin) 0% ${pct(yoin.sec - FADE_SEC)}, var(--seg-yoin-fade) ${pct(yoin.sec)}, var(--seg-ma) ${pct(yoin.sec)} 100%)`;
  }
  return phases;
}

const phaseAt = (phases: readonly Phase[], t: number) => phases.find((p) => t < p.from + p.sec) ?? phases.at(-1)!;

function TokenView({ token }: { token: Token }) {
  if (token.nobi) return <span class="nobi">ー</span>;
  if (token.ruby)
    return (
      <ruby>
        {token.text}
        <rt>{token.ruby}</rt>
      </ruby>
    );
  return <>{token.text}</>;
}

// ▼の字は書体で形が変わり縦に伸ばせないので、全角の空白を入れた箱に三角を描く（ui-guide 7節「歌に出すもの」）。
// どの札に印を付けるかの列は札の読みの表にまだない。列ができるまでは、どの組も下の句の最後の字のあとに置く。
const YoinMark = () => (
  <span class="yoin" role="img" aria-label="余韻">
    {'　'}
  </span>
);

function LineView({ line, className, last }: { line: Line; className: string; last?: boolean }) {
  const body = last ? line.slice(0, -1) : line;
  return (
    <div class={className}>
      {body.map((token) => (
        <TokenView token={token} />
      ))}
      {last && (
        <>
          <span class="cue">
            <TokenView token={line.at(-1)!} />
          </span>
          <YoinMark />
        </>
      )}
    </div>
  );
}

// 文字は進めない。表に時刻の列ができる C3 までは、等分した進みが誤った手本になる。
export const Lyrics = ({ lines }: { lines: PairLines }) => (
  <div class="tate" data-testid="lyrics">
    {lines.shimo.map((line, i) => (
      <LineView line={line} className="ln" last={i === lines.shimo.length - 1} />
    ))}
    {lines.kami.map((line, i) => (
      <LineView line={line} className={i === 0 ? 'ln break' : 'ln'} />
    ))}
  </div>
);

// 歌は枠に合わせて縮める。余韻の印やふりがなで行が伸びると、狭い画面で枠の上下にはみ出すからである。
function useFitLyric(box: { current: HTMLDivElement | null }, lines: PairLines) {
  useLayoutEffect(() => {
    const element = box.current;
    if (!element) return;
    const fit = () => {
      const tate = element.querySelector<HTMLElement>('.tate');
      if (!tate) return;
      tate.style.fontSize = '';
      if (!element.clientHeight) return;
      const size = tate.getBoundingClientRect();
      const ratio = Math.min(1, (element.clientHeight - 16) / size.height, (element.clientWidth - 16) / size.width);
      if (ratio < 1) tate.style.fontSize = `${parseFloat(getComputedStyle(tate).fontSize) * ratio}px`;
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    // 書体の読み込みで字の大きさが変わるので、読み込んだあとにも合わせ直す。
    void document.fonts?.ready.then(fit);
    return () => observer.disconnect();
  }, [lines]);
}

export type StageProps = {
  segments: readonly Segment[];
  lines: PairLines;
  // 帯の時計の秒。読み始める前は 0 で止める。
  t?: number;
  assisted?: boolean;
  // 余韻で押す字の目印。読む画面の補助ありのときだけ付ける。
  tap?: boolean;
  count?: number | null;
  hint?: string | null;
  children?: ComponentChildren;
};

export function Stage({ segments, lines, t = 0, assisted = true, tap = false, count = null, hint = null, children }: StageProps) {
  const root = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  useFitLyric(box, lines);

  const phases = phasesOf(segments);
  const total = segments.reduce((sum, s) => sum + s.sec, 0);
  const phase = phaseAt(phases, t);
  const left = Math.min(Math.max(phase.sec - (t - phase.from), 0), phase.sec);
  const now = phase.segments.find(({ segment, from }) => t < from + segment.sec) ?? phase.segments.at(-1)!;
  const nowLeft = Math.min(Math.max(now.from + now.segment.sec - t, 0), now.segment.sec);

  // 帯の部品（band.tsx）は進みを受け取らないので、描いたあとに進みと今の線を付ける。帯の部品に進みを渡す形は Y-18 で揃える。
  useLayoutEffect(() => {
    let from = 0;
    root.current?.querySelectorAll<HTMLElement>('.seg').forEach((element, i) => {
      const segment = segments[i];
      const bar = element.querySelector<HTMLElement>('i');
      if (bar) bar.style.width = `${Math.min(Math.max((t - from) / segment.sec, 0), 1) * 100}%`;
      element.classList.toggle('is-now', t < total && phase.keys.includes(segment.key));
      from += segment.sec;
    });
  });

  return (
    <div class="stage card" ref={root} data-assist={assisted ? 'on' : 'off'} data-tap={tap ? '' : undefined}>
      <Band segments={segments} />
      <div class="stage-body">
        <div class="drain" data-seg={phase.keys[0]} style={{ background: phase.fill, clipPath: `inset(${(1 - left / phase.sec) * 100}% 0 0 0)` }} />
        <div class="now">
          <b>{assisted ? phase.label : '補助なし'}</b>
          {/* 名前は「余韻と間」のまま、数字は余韻と間を別々に数える。続けて数えると余韻が4秒あるように見える */}
          <span>
            {phase.segments.length > 1 && <small>{now.segment.name}</small>} {(phase.segments.length > 1 ? nowLeft : left).toFixed(1)}
          </span>
        </div>
        <div class="lyric" ref={box}>
          <Lyrics lines={lines} />
        </div>
        {hint && <div class="tap-hint">{hint}</div>}
        {count !== null && (
          <div class="count" aria-live="assertive">
            {count}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

// 読む画面は録音の部品の中で枠を描くので、<yomimasu-stage> を使うページは今はない。
// 要素の登録（main.ts）はこの Issue の範囲の外なので残し、お手本を聞く画面などで使うかは Y-18 で決める。
export function mountStage(element: HTMLElement) {
  const pair = pairOf(location.search);
  render(<Stage segments={segmentsOf(pair)} lines={pairLines(cards, pair)} />, element);
  return () => render(null, element);
}
