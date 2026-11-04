import type { CardNo, Pair } from './pair.ts';

// お手本の再生。聞く画面（C1）と聴き比べ（Y-17）が使う。
// 2本を AudioBuffer にしてから、両方を start(when) で予約する。ended でつなぐと端末ごとに遅れが乗り、
// <audio> は再生の開始の時刻を予約できないので、どちらも使わない。

export const GAP_SEC = 1.0;
// 予約の時刻が過去にならないための余裕である。短すぎると、予約したときにはもう始まっている。
const LEAD_SEC = 0.1;

export type Half = 'kami' | 'shimo';

export type AudioSource = { kind: 'url'; base: string } | { kind: 'synth' };

const DEFAULT_BASE = '/audio/v1/';
export const AUDIO_SOURCE_KEY = 'yomimasu.audio';

// 取得先は同じオリジンのパスに限る。外の配信から読むと、どの端末が聞いたかが外へ出るからである。
// 先頭の字だけでは見分けない。ブラウザーは「\」を「/」と読み、タブと改行を読み飛ばすので、「/\example.com/」は外のオリジンになる。
// 解き方はページのオリジンに依らないので、location の代わりに試しのオリジンで解く。URL.parse は iOS 17 の Safari にないので使わない。
const PROBE_ORIGIN = 'https://yomimasu.invalid';
function isSameOriginPath(setting: string) {
  if (!setting.startsWith('/')) return false;
  try {
    return new URL(setting, PROBE_ORIGIN).origin === PROBE_ORIGIN;
  } catch {
    return false;
  }
}

export function audioSourceOf(setting: string | null): AudioSource {
  if (setting === 'synth') return { kind: 'synth' };
  if (setting && isSameOriginPath(setting)) return { kind: 'url', base: setting };
  return { kind: 'url', base: DEFAULT_BASE };
}

// 開発では端末に覚えさせた設定で合成音に替える。設定の画面は作らない。
export function storedAudioSource(): AudioSource {
  try {
    return audioSourceOf(localStorage.getItem(AUDIO_SOURCE_KEY));
  } catch {
    return audioSourceOf(null);
  }
}

export const clipUrl = (base: string, no: CardNo, half: Half) => `${base}${String(no).padStart(3, '0')}_${half === 'kami' ? 1 : 2}.m4a`;

export function scheduleOf(now: number, durations: readonly number[], gapSec = GAP_SEC): { starts: number[]; end: number } {
  const starts: number[] = [];
  let at = now + LEAD_SEC;
  for (const duration of durations) {
    starts.push(at);
    at += duration + gapSec;
  }
  return { starts, end: at - gapSec };
}

export type Loader = (context: BaseAudioContext) => Promise<AudioBuffer[]>;
type Fetcher = (url: string) => Promise<Response>;

// 合成音は下の句と余韻を 5＋3 秒、上の句を 6 秒にする。読手の音声がなくても、字の塗りと音の動きを確かめられる。
const SYNTH_SEC: Record<Half, number> = { shimo: 8, kami: 6 };
const SYNTH_RATE = 24000;

function synthBuffer(context: BaseAudioContext, sec: number, pitchHz: number): AudioBuffer {
  const length = Math.round(sec * SYNTH_RATE);
  const buffer = context.createBuffer(1, length, SYNTH_RATE);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    const t = i / SYNTH_RATE;
    const envelope = Math.min(1, t / 0.05, (sec - t) / 0.1);
    data[i] = 0.2 * envelope * Math.sin(2 * Math.PI * pitchHz * t);
  }
  return buffer;
}

export function pairLoader(pair: Pair, source: AudioSource, fetcher: Fetcher = (url) => fetch(url)): Loader {
  const halves: [CardNo, Half][] = [
    [pair.shimo, 'shimo'],
    [pair.kami, 'kami'],
  ];
  if (source.kind === 'synth') return async (context) => halves.map(([, half]) => synthBuffer(context, SYNTH_SEC[half], half === 'shimo' ? 220 : 262));
  return (context) =>
    Promise.all(
      halves.map(async ([no, half]) => {
        const response = await fetcher(clipUrl(source.base, no, half));
        if (!response.ok) throw new Error(`お手本の音声がない：${response.status}`);
        return context.decodeAudioData(await response.arrayBuffer());
      }),
    );
}

type AudioSessionLike = { type: string };
type WakeLockSentinelLike = { release: () => Promise<void> };

export type PlaybackEnv = {
  createContext: () => AudioContext;
  audioSession?: AudioSessionLike;
  requestWakeLock?: () => Promise<WakeLockSentinelLike>;
};

export function browserEnv(): PlaybackEnv {
  const nav = navigator as Navigator & {
    audioSession?: AudioSessionLike;
    wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> };
  };
  const wakeLock = nav.wakeLock;
  return {
    createContext: () => new AudioContext(),
    audioSession: nav.audioSession,
    requestWakeLock: wakeLock ? () => wakeLock.request('screen') : undefined,
  };
}

export type Outcome = 'ended' | 'stopped' | 'failed';

export type Playback = {
  // 開始の予約時刻からの秒。歌の枠の字の塗りと囲みの時計に使う。予約する前は null である。
  elapsed: () => number | null;
  stop: () => void;
  finished: Promise<Outcome>;
};

// 押した処理の中から同期で呼ぶ。iOS では、fetch を待ったあとの resume() が解決しないことがあるので、
// 文脈を作って resume() を呼ぶまでを、最初の await より前に済ませる。
export function play(load: Loader, env: PlaybackEnv = browserEnv()): Playback {
  let context: AudioContext;
  try {
    context = env.createContext();
  } catch {
    // AudioContext がない端末や作れない端末で投げると、押した処理の外へ出て、失敗の文言も出せず行き止まりになる。
    return { elapsed: () => null, stop: () => {}, finished: Promise.resolve('failed') };
  }
  const resumed = context.resume();
  // 鳴らす間だけ、消音の切り替えに従わない再生の扱いにする。ほかの画面の録音の扱いを変えないよう、終えたら auto に戻す。
  if (env.audioSession) env.audioSession.type = 'playback';

  let startAt: number | null = null;
  let sources: AudioBufferSourceNode[] = [];
  let settled = false;
  let finish: (outcome: Outcome) => void = () => {};
  const finished = new Promise<Outcome>((resolve) => (finish = resolve));

  // 画面が消えると歌を見ながら聞けない。取れない端末でも、再生は止めない。
  let wake: WakeLockSentinelLike | null = null;
  void env.requestWakeLock?.().then(
    (sentinel) => {
      if (settled) void sentinel.release().catch(() => {});
      else wake = sentinel;
    },
    () => {},
  );

  const settle = (outcome: Outcome) => {
    if (settled) return;
    settled = true;
    for (const source of sources) {
      source.onended = null;
      try {
        source.stop();
      } catch {
        // 鳴り終えた音を止めると投げる端末がある。止まっていれば足りる。
      }
    }
    if (env.audioSession) env.audioSession.type = 'auto';
    void (wake as WakeLockSentinelLike | null)?.release().catch(() => {});
    wake = null;
    void context.close().catch(() => {});
    finish(outcome);
  };

  void (async () => {
    try {
      const [buffers] = await Promise.all([load(context), resumed]);
      if (settled) return;
      if (context.state !== 'running') throw new Error('音を鳴らせる状態にならない');
      const { starts } = scheduleOf(context.currentTime, buffers.map((buffer) => buffer.duration));
      sources = buffers.map((buffer, i) => {
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(context.destination);
        source.start(starts[i]);
        return source;
      });
      // 最後の音が鳴り終えたら終わる。前の音の ended は、次の音の開始には使わない。
      sources.at(-1)!.onended = () => settle('ended');
      startAt = starts[0];
    } catch {
      settle('failed');
    }
  })();

  return {
    elapsed: () => (startAt === null || settled ? null : Math.max(0, context.currentTime - startAt)),
    stop: () => settle('stopped'),
    finished,
  };
}
