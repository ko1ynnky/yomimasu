import { render, type ComponentChildren } from 'preact';
import { useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import deck from '../../../.claude/skills/yomimasu/assets/cards.json' with { type: 'json' };
import type { Card } from '../../../.claude/skills/yomimasu/scripts/cards.ts';
import { pairLines, type PairLines } from '../lyrics.ts';
import { DEFAULT_PAIR, pairFromSearch, segmentsOf, type Pair, type Segment } from '../pair.ts';
import { timeLyrics, type Glyph, type Notation, type TimedLyrics } from '../timing.ts';
import './stage.css';

export const cards = deck.cards as unknown as Card[];

// 読む流れの組は 81番→45番にする（ui-guide 8節）。pair.ts の既定は前の 77番→29番のままで、直すのはこの Issue の範囲の外である。
const READ_PAIR: Pair = { shimo: 81, kami: 45 };

export function pairOf(search: string): Pair {
  const pair = pairFromSearch(search);
  return pair === DEFAULT_PAIR ? READ_PAIR : pair;
}

type Phase = { key: string; segments: Segment[]; from: number; sec: number };

// 間は1秒しかなく、間を別の区切りにして1秒だけ囲むと、囲みが跳ねてせわしない。区間名を「余韻と間」の1つにした判断（2026-11-03）と同じ理由で、余韻と間を1つの区切りにする。
export function phasesOf(segments: readonly Segment[]): Phase[] {
  const phases: Phase[] = [];
  let at = 0;
  for (const segment of segments) {
    const last = phases.at(-1);
    if (segment.key === 'ma' && last?.segments.at(-1)?.key === 'yoin') {
      last.key += '-ma';
      last.segments.push(segment);
      last.sec += segment.sec;
    } else {
      phases.push({ key: segment.key, segments: [segment], from: at, sec: segment.sec });
    }
    at += segment.sec;
  }
  return phases;
}

const phaseAt = (phases: readonly Phase[], t: number) => phases.find((p) => t < p.from + p.sec) ?? phases.at(-1)!;

const NOTATION_KEY = 'yomimasu.kana';
const NOTATIONS: [Notation, string][] = [
  ['kanji', '漢字'],
  ['kana', 'かな'],
];

function storedNotation(): Notation {
  try {
    return localStorage.getItem(NOTATION_KEY) === 'kanji' ? 'kanji' : 'kana';
  } catch {
    return 'kana';
  }
}

function rememberNotation(notation: Notation) {
  try {
    localStorage.setItem(NOTATION_KEY, notation);
  } catch {
    // 覚えられない環境では、開いている間だけ切り替わる。
  }
}

// 余韻の印の上の四角は声を保つ所、下の三角は声を弱め始めてよい余韻の最後の1秒である。形の境目と塗りの境目をそろえる。
const holdRatioOf = ({ last, yoin }: TimedLyrics) => (yoin.hold - last.at) / (yoin.to - last.at);
const pct = (ratio: number) => `${(ratio * 100).toFixed(2)}%`;

const GlyphView = ({ glyph }: { glyph: Glyph }) => (
  <span data-at={glyph.at.toFixed(3)} data-to={glyph.to.toFixed(3)} class={glyph.nobi ? 'nobi' : undefined}>
    {glyph.ruby ? (
      <ruby>
        {glyph.text}
        <rt>{glyph.ruby}</rt>
      </ruby>
    ) : (
      glyph.text
    )}
  </span>
);

const LinesView = ({ lines }: { lines: Glyph[][] }) => (
  <>
    {lines.map((line) => (
      <div class="ln">
        {line.map((glyph) => (
          <GlyphView glyph={glyph} />
        ))}
      </div>
    ))}
  </>
);

// ▼の字は書体で形が変わり縦に伸ばせないので、全角の空白を入れた箱に形を描く（ui-guide 7節「歌に出すもの」）。
const YoinLine = ({ timed }: { timed: TimedLyrics }) => (
  <div class="ln">
    <GlyphView glyph={timed.last} />
    <span class="yoin" role="img" aria-label="余韻" style={{ '--yoin-hold': pct(holdRatioOf(timed)) }}>
      {'　'}
    </span>
  </div>
);

// 区切りは右から並べ、見出しも縦に書く。余韻と間の区切りは1列の幅しかなく、横書きの見出しが収まらないからである。
const Blocks = ({ phases, timed }: { phases: readonly Phase[]; timed: TimedLyrics }) => (
  <div class="tate blocks" data-testid="lyrics">
    {phases.map((phase) => (
      <div class="blk" data-phase={phase.key}>
        <div class="blk-head">
          {phase.segments.map((segment, i) => (
            <>
              {i > 0 && <br />}
              {segment.name}
              <span class="tcy">{segment.sec}</span>秒
            </>
          ))}
        </div>
        <div class="blk-body">
          {phase.key === 'shimo' ? <LinesView lines={timed.shimo} /> : phase.key === 'kami' ? <LinesView lines={timed.kami} /> : <YoinLine timed={timed} />}
        </div>
      </div>
    ))}
  </div>
);

// 字の色と今の区切りの囲みは毎フレーム変わるので、描き直さずに要素へ直に付ける。
function paint(root: HTMLElement, t: number, assisted: boolean, timed: TimedLyrics, phases: readonly Phase[]) {
  const progress = (from: number, to: number) => (assisted ? Math.min(Math.max((t - from) / (to - from), 0), 1) : 0);
  const set = (element: HTMLElement | null, name: string, value: string) => {
    if (element && element.style.getPropertyValue(name) !== value) element.style.setProperty(name, value);
  };
  root.querySelectorAll<HTMLElement>('[data-at]').forEach((element) => set(element, '--p', pct(progress(Number(element.dataset.at), Number(element.dataset.to)))));
  const { yoin } = timed;
  const hold = holdRatioOf(timed);
  // 四角は最後の字を塗り終えてから弱め始めるまで、三角は余韻の最後の1秒で塗る。
  const yoinDone = !assisted ? 0 : t < yoin.hold ? hold * progress(yoin.from, yoin.hold) : hold + (1 - hold) * progress(yoin.hold, yoin.to);
  set(root.querySelector<HTMLElement>('.lyric .yoin'), '--yoin-done', pct(yoinDone));
  // 読む前（t=0）は囲まない。まだどこも読んでいないからである。
  const now = phaseAt(phases, t).key;
  root.querySelectorAll<HTMLElement>('.blk').forEach((element) => element.classList.toggle('is-now', assisted && t > 0 && element.dataset.phase === now));
}

// 横書きの中に置いた縦書きの本文は、iOS の Safari では使える高さいっぱいに伸び、歌が枠の上に寄って字も小さくなる（2026-11-04 に見本で確かめた）。
// inline-size: max-content は効かなかったので、行の長さを字の位置から測って本文の高さにする。字を縮めても比が変わらないよう em で持たせる。
function sizeBlockBodies(tate: HTMLElement) {
  const em = parseFloat(getComputedStyle(tate).fontSize);
  tate.querySelectorAll<HTMLElement>('.blk-body').forEach((body) => {
    body.style.height = '';
    const lengths = [...body.querySelectorAll('.ln')].map((line) => {
      const rects = [...line.children].map((child) => child.getBoundingClientRect()).filter((rect) => rect.height > 0);
      return rects.length ? Math.max(...rects.map((rect) => rect.bottom)) - Math.min(...rects.map((rect) => rect.top)) : 0;
    });
    const longest = Math.max(0, ...lengths);
    if (longest > 0) body.style.height = `${(longest / em + 0.3).toFixed(3)}em`;
  });
}

// 歌は枠に合わせて縮める。余韻の印やふりがなで行が伸びると、狭い画面で枠の上下にはみ出すからである。
// 見出しの字は 12px より小さくしないので、歌の字と同じ割合では縮まない。1回で縮めきらず、収まるまで測り直す。
function fitLyric(box: HTMLElement, tate: HTMLElement) {
  tate.style.fontSize = '';
  if (!box.clientHeight) return;
  const style = getComputedStyle(box);
  const taken = (from: 'paddingTop' | 'paddingLeft', to: 'paddingBottom' | 'paddingRight') => parseFloat(style[from]) + parseFloat(style[to]) + 16;
  for (let i = 0; i < 4; i += 1) {
    const size = tate.getBoundingClientRect();
    const ratio = Math.min(1, (box.clientHeight - taken('paddingTop', 'paddingBottom')) / size.height, (box.clientWidth - taken('paddingLeft', 'paddingRight')) / size.width);
    if (ratio >= 1) return;
    tate.style.fontSize = `${parseFloat(getComputedStyle(tate).fontSize) * ratio}px`;
  }
}

function useFitLyric(box: { current: HTMLDivElement | null }, timed: TimedLyrics) {
  useLayoutEffect(() => {
    const element = box.current;
    if (!element) return;
    // 隠れていて測れないときは、見えたときの ResizeObserver で測り直す。
    const fit = () => {
      const tate = element.querySelector<HTMLElement>('.tate');
      if (!tate) return;
      sizeBlockBodies(tate);
      fitLyric(element, tate);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    // 書体の読み込みで字の大きさが変わるので、読み込んだあとにも合わせ直す。
    void document.fonts?.ready.then(fit);
    return () => observer.disconnect();
  }, [timed]);
}

export type StageProps = {
  segments: readonly Segment[];
  lines: PairLines;
  // 帯の時計の秒。読み始める前は 0 で止める。
  t?: number;
  assisted?: boolean;
  // 合図と録音のあいだは歌を動かさないよう、表記を切り替えさせない。
  notationLocked?: boolean;
  count?: number | null;
  children?: ComponentChildren;
};

export function Stage({ segments, lines, t = 0, assisted = true, notationLocked = false, count = null, children }: StageProps) {
  const root = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [notation, setNotation] = useState(storedNotation);
  const phases = useMemo(() => phasesOf(segments), [segments]);
  const timed = useMemo(() => timeLyrics(lines, segments, notation), [lines, segments, notation]);
  useFitLyric(box, timed);
  useLayoutEffect(() => {
    if (root.current) paint(root.current, t, assisted, timed, phases);
  });

  const choose = (next: Notation) => {
    setNotation(next);
    rememberNotation(next);
  };

  return (
    <div class="stage card" ref={root} data-assist={assisted ? 'on' : 'off'}>
      <div class="stage-body">
        {!assisted && (
          <div class="now">
            <b>補助なし</b>
          </div>
        )}
        <div class="lyric" ref={box}>
          {/* 隠しても場所は歌の面の左右の余白に取ってあるので、歌は動かない */}
          <div class="kana-corner" role="group" aria-label="歌の表記" hidden={notationLocked}>
            {NOTATIONS.map(([value, label]) => (
              <button class="btn" type="button" aria-pressed={notation === value} onClick={() => choose(value)}>
                {label}
              </button>
            ))}
          </div>
          <Blocks phases={phases} timed={timed} />
        </div>
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
