import assert from 'node:assert/strict';
import { test } from 'node:test';
import { audioSourceOf, clipUrl, GAP_SEC, pairLoader, play, scheduleOf, takeLoader, type PlaybackEnv } from '../../site/client/playback.ts';
import type { Take } from '../../site/client/take.ts';

// テストリスト：
// - 本番の音声は同じオリジンの /audio/v1/<札番号3桁>_<1か2>.m4a から取る。1 は上の句、2 は下の句である。
// - 取得先は設定で変えられ、開発では実行時に作る合成音を使える。
// - 下の句の終わりから 1.0 秒あけて上の句を鳴らす。開始の時刻は、今の時刻に予約の余裕を足した時刻である。
// - 押した処理の中で、最初の await より前に AudioContext を作って resume() を呼ぶ。
// - 2本を読み込んでから、両方を start(when) で予約する。
// - 歌の枠の時計は、開始の予約時刻からの currentTime の差である。
// - 鳴らす間だけ audioSession を playback にし、鳴らし終えたとき、止めたとき、失敗したときに auto に戻す。
// - 文脈が running にならなければ鳴らさず、失敗にする。
// - 文脈を作れない端末では、投げずに失敗にする。
// - 途中で止められる。
// - 鳴らす間だけ Wake Lock を取る。取れなくても止めない。
// - 鳴らす間に画面がまた見えたら、Wake Lock を取り直す。端末は画面が隠れると Wake Lock を離すからである。
// - 自分の読みも同じ処理で鳴らす。録音の PCM から1本の AudioBuffer を作り、読み始めの位置から最後の標本までを、録音の標本化周波数のまま鳴らす。
// - 自分の読みも、文脈を作って resume() を呼んでから録音を読む。
// - 読み始めより後に音がない録音でも、投げずに鳴らし終える。
// - 端末に残した録音がもうないときは、読み込めない扱いにする。

type FakeSource = { buffer: FakeBuffer | null; startedAt: number | null; stopped: boolean; onended: (() => void) | null };
type FakeBuffer = { duration: number; length: number; sampleRate: number; data: Float32Array };

function fakeEnv({ state = 'running', wake = 'ok' }: { state?: string; wake?: 'ok' | 'fail' } = {}) {
  const log: string[] = [];
  const sources: FakeSource[] = [];
  const session = { type: 'auto' };
  const sessionLog: string[] = [];
  const context = {
    currentTime: 10,
    state: 'suspended',
    destination: {},
    resume() {
      log.push('resume');
      context.state = state;
      return Promise.resolve();
    },
    close() {
      log.push('close');
      context.state = 'closed';
      return Promise.resolve();
    },
    createBufferSource() {
      const source: FakeSource & { connect: () => void; start: (when: number) => void; stop: () => void } = {
        buffer: null,
        startedAt: null,
        stopped: false,
        onended: null,
        connect: () => {},
        start(when: number) {
          log.push(`start ${when.toFixed(2)}`);
          source.startedAt = when;
        },
        stop() {
          source.stopped = true;
          source.onended?.();
        },
      };
      sources.push(source);
      return source;
    },
    createBuffer(_channels: number, length: number, sampleRate: number) {
      // ブラウザーは長さ 0 の AudioBuffer を作らずに投げる。
      if (length < 1) throw new DOMException('長さが 0', 'NotSupportedError');
      const data = new Float32Array(length);
      return { duration: length / sampleRate, length, sampleRate, data, getChannelData: () => data };
    },
    decodeAudioData(bytes: ArrayBuffer) {
      const duration = new DataView(bytes).getFloat64(0);
      return Promise.resolve({ duration, length: 0, sampleRate: 48000, data: new Float32Array() });
    },
  };
  const wakeLog: string[] = [];
  const visible = new Set<() => void>();
  const showAgain = () => visible.forEach((listener) => listener());
  const env: PlaybackEnv = {
    createContext: () => {
      log.push('create');
      return context as unknown as AudioContext;
    },
    audioSession: {
      get type() {
        return session.type;
      },
      set type(value: string) {
        session.type = value;
        sessionLog.push(value);
      },
    },
    requestWakeLock: () => {
      wakeLog.push('request');
      return wake === 'ok'
        ? Promise.resolve({
            release: () => {
              wakeLog.push('release');
              return Promise.resolve();
            },
          })
        : Promise.reject(new Error('取れない'));
    },
    watchVisible: (listener) => {
      visible.add(listener);
      return () => visible.delete(listener);
    },
  };
  return { env, context, log, sources, sessionLog, wakeLog, showAgain };
}

const buffers = (...durations: number[]) => () => Promise.resolve(durations.map((duration) => ({ duration }) as AudioBuffer));
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

test('本番の音声は、札番号を3桁にして、上の句を 1、下の句を 2 とした m4a から取る', () => {
  assert.equal(clipUrl('/audio/v1/', 81, 'shimo'), '/audio/v1/081_2.m4a');
  assert.equal(clipUrl('/audio/v1/', 45, 'kami'), '/audio/v1/045_1.m4a');
  assert.equal(clipUrl('/audio/v1/', 100, 'kami'), '/audio/v1/100_1.m4a');
});

test('取得先は既定で同じオリジンの /audio/v1/ で、設定で合成音に替えられる', () => {
  assert.deepEqual(audioSourceOf(null), { kind: 'url', base: '/audio/v1/' });
  assert.deepEqual(audioSourceOf('synth'), { kind: 'synth' });
  assert.deepEqual(audioSourceOf('/audio/v2/'), { kind: 'url', base: '/audio/v2/' });
});

test('外のオリジンの取得先は使わず、既定に戻す', () => {
  // ブラウザーは「\」を「/」と読み、タブと改行を読み飛ばすので、先頭の字だけでは外のオリジンを見分けられない。
  for (const value of ['https://example.com/audio/', '//example.com/audio/', 'audio/', '/\\example.com/audio/', '/\t/example.com/audio/', '/\n/example.com/audio/']) {
    assert.deepEqual(audioSourceOf(value), { kind: 'url', base: '/audio/v1/' }, value);
  }
});

test('URL として解けない取得先は、投げずに既定に戻す', () => {
  assert.deepEqual(audioSourceOf('//['), { kind: 'url', base: '/audio/v1/' });
});

test('下の句の終わりから 1.0 秒あけて上の句を始め、上の句の終わりで鳴り終える', () => {
  assert.equal(GAP_SEC, 1.0);
  const schedule = scheduleOf(10, [8.3, 6.1]);
  assert.ok(schedule.starts[0] > 10);
  assert.equal(schedule.starts[1], schedule.starts[0] + 8.3 + 1.0);
  assert.equal(schedule.end, schedule.starts[1] + 6.1);
});

test('押した処理の中で、読み込みを待つより前に文脈を作って resume() を呼ぶ', () => {
  const { env, log } = fakeEnv();
  play(() => new Promise(() => {}), env);
  assert.deepEqual(log, ['create', 'resume']);
});

test('2本を読み込んでから、両方を start(when) で予約する', async () => {
  const { env, log, sources } = fakeEnv();
  let loaded: (value: AudioBuffer[]) => void = () => {};
  play(() => new Promise((resolve) => (loaded = resolve)), env);
  await settle();
  assert.equal(sources.length, 0);
  loaded([{ duration: 8 } as AudioBuffer, { duration: 6 } as AudioBuffer]);
  await settle();
  const { starts } = scheduleOf(10, [8, 6]);
  assert.deepEqual(
    log.filter((line) => line.startsWith('start')),
    starts.map((when) => `start ${when.toFixed(2)}`),
  );
});

test('歌の枠の時計は、予約する前は null で、予約したあとは開始の予約時刻からの currentTime の差である', async () => {
  const { env, context } = fakeEnv();
  const playback = play(buffers(8, 6), env);
  assert.equal(playback.elapsed(), null);
  await settle();
  const [startAt] = scheduleOf(10, [8, 6]).starts;
  assert.equal(playback.elapsed(), 0);
  context.currentTime = startAt + 2.5;
  assert.ok(Math.abs(playback.elapsed()! - 2.5) < 1e-9);
});

test('上の句が鳴り終えると ended で終わり、文脈を閉じて audioSession を auto に戻す', async () => {
  const { env, log, sources, sessionLog } = fakeEnv();
  const playback = play(buffers(8, 6), env);
  await settle();
  assert.deepEqual(sessionLog, ['playback']);
  sources[1].onended?.();
  assert.equal(await playback.finished, 'ended');
  assert.deepEqual(sessionLog, ['playback', 'auto']);
  assert.ok(log.includes('close'));
});

test('下の句が先に鳴り終えても、まだ終わりにしない', async () => {
  const { env, sources } = fakeEnv();
  const playback = play(buffers(8, 6), env);
  await settle();
  let outcome: string | null = null;
  void playback.finished.then((value) => (outcome = value));
  sources[0].onended?.();
  await settle();
  assert.equal(outcome, null);
});

test('途中で止めると、両方の音を止めて stopped で終わり、audioSession を auto に戻す', async () => {
  const { env, sources, sessionLog } = fakeEnv();
  const playback = play(buffers(8, 6), env);
  await settle();
  playback.stop();
  assert.equal(await playback.finished, 'stopped');
  assert.ok(sources.every((source) => source.stopped));
  assert.deepEqual(sessionLog, ['playback', 'auto']);
});

test('読み込みの途中で止めると、読み込めても鳴らさない', async () => {
  const { env, sources } = fakeEnv();
  let loaded: (value: AudioBuffer[]) => void = () => {};
  const playback = play(() => new Promise((resolve) => (loaded = resolve)), env);
  playback.stop();
  loaded([{ duration: 8 } as AudioBuffer, { duration: 6 } as AudioBuffer]);
  assert.equal(await playback.finished, 'stopped');
  await settle();
  assert.equal(sources.length, 0);
  assert.equal(playback.elapsed(), null);
});

test('読み込めないときは failed で終わり、audioSession を auto に戻す', async () => {
  const { env, sessionLog, log } = fakeEnv();
  const playback = play(() => Promise.reject(new Error('404')), env);
  assert.equal(await playback.finished, 'failed');
  assert.deepEqual(sessionLog, ['playback', 'auto']);
  assert.ok(log.includes('close'));
});

test('文脈が running にならなければ鳴らさず、failed で終わる', async () => {
  const { env, sources } = fakeEnv({ state: 'suspended' });
  const playback = play(buffers(8, 6), env);
  assert.equal(await playback.finished, 'failed');
  assert.equal(sources.length, 0);
});

test('文脈を作れない端末では、投げずに failed で終わり、audioSession も Wake Lock も触らない', async () => {
  const { env, sessionLog, wakeLog } = fakeEnv();
  const playback = play(buffers(8, 6), {
    ...env,
    createContext: () => {
      throw new ReferenceError('AudioContext is not defined');
    },
  });
  assert.equal(await playback.finished, 'failed');
  assert.equal(playback.elapsed(), null);
  playback.stop();
  assert.deepEqual(sessionLog, []);
  assert.deepEqual(wakeLog, []);
});

test('audioSession がない端末でも鳴らせる', async () => {
  const { env, sources } = fakeEnv();
  const playback = play(buffers(8, 6), { ...env, audioSession: undefined });
  await settle();
  sources[1].onended?.();
  assert.equal(await playback.finished, 'ended');
});

test('鳴らす間だけ Wake Lock を取り、終えたら離す', async () => {
  const { env, sources, wakeLog } = fakeEnv();
  const playback = play(buffers(8, 6), env);
  await settle();
  assert.deepEqual(wakeLog, ['request']);
  sources[1].onended?.();
  await playback.finished;
  await settle();
  assert.deepEqual(wakeLog, ['request', 'release']);
});

test('鳴らす間に画面がまた見えたら Wake Lock を取り直し、鳴り終えたら取ったものをすべて離して、もう取り直さない', async () => {
  const { env, sources, wakeLog, showAgain } = fakeEnv();
  const count = (line: string) => wakeLog.filter((logged) => logged === line).length;
  const playback = play(buffers(8, 6), env);
  await settle();
  showAgain();
  await settle();
  assert.equal(count('request'), 2);
  sources[1].onended?.();
  await playback.finished;
  await settle();
  showAgain();
  await settle();
  assert.equal(count('request'), 2);
  assert.equal(count('release'), 2);
});

test('Wake Lock を取れなくても鳴らす', async () => {
  const { env, sources } = fakeEnv({ wake: 'fail' });
  const playback = play(buffers(8, 6), env);
  await settle();
  assert.equal(sources.length, 2);
  sources[1].onended?.();
  assert.equal(await playback.finished, 'ended');
});

test('組の読み込みは、下の句を前、上の句を後ろにして、取得先から取る', async () => {
  const { context } = fakeEnv();
  const asked: string[] = [];
  const fetcher = (url: string) => {
    asked.push(url);
    const bytes = new ArrayBuffer(8);
    new DataView(bytes).setFloat64(0, url.includes('_2') ? 8 : 6);
    return Promise.resolve(new Response(bytes));
  };
  const loaded = await pairLoader({ shimo: 81, kami: 45 }, { kind: 'url', base: '/audio/v1/' }, fetcher)(context as unknown as AudioContext);
  assert.deepEqual(asked, ['/audio/v1/081_2.m4a', '/audio/v1/045_1.m4a']);
  assert.deepEqual(
    loaded.map((buffer) => buffer.duration),
    [8, 6],
  );
});

test('取得先が見つからないと答えたら、読み込めない扱いにする', async () => {
  const { context } = fakeEnv();
  const fetcher = () => Promise.resolve(new Response('', { status: 404 }));
  await assert.rejects(pairLoader({ shimo: 81, kami: 45 }, { kind: 'url', base: '/audio/v1/' }, fetcher)(context as unknown as AudioContext));
});

test('合成音の組は、下の句と余韻の 8 秒と、上の句の 6 秒の音を実行時に作る', async () => {
  const { context } = fakeEnv();
  const loaded = await pairLoader({ shimo: 81, kami: 45 }, { kind: 'synth' })(context as unknown as AudioContext);
  assert.deepEqual(
    loaded.map((buffer) => Math.round(buffer.duration * 100) / 100),
    [8, 6],
  );
  assert.ok(loaded.every((buffer) => buffer.getChannelData(0).some((sample) => Math.abs(sample) > 0.05)));
});

const RATE = 48000;
const takeOf = (pcm: Float32Array, readingStartSec: number): Take => ({
  pcm,
  sampleRate: RATE,
  readingStartSec,
  assisted: true,
  pair: { shimo: 81, kami: 45 },
  voiceProcessing: { supported: {}, settings: {} },
});

test('自分の読みは、読み始めの位置の標本から録音の最後の標本までを、録音の標本化周波数のまま1本で鳴らす', async () => {
  const { env, sources } = fakeEnv();
  const pcm = Float32Array.from({ length: 3 * RATE }, (_, i) => Math.sin(i / 7));
  const playback = play(takeLoader(() => Promise.resolve(takeOf(pcm, 0.5))), env);
  await settle();
  assert.equal(sources.length, 1);
  const buffer = sources[0].buffer!;
  assert.equal(buffer.sampleRate, RATE);
  assert.deepEqual(buffer.data, pcm.subarray(RATE / 2));
  sources[0].onended?.();
  assert.equal(await playback.finished, 'ended');
});

test('自分の読みも、押した処理の中で文脈を作って resume() を呼んでから、録音を読む', () => {
  const { env, log } = fakeEnv();
  play(
    takeLoader(() => {
      log.push('load');
      return new Promise(() => {});
    }),
    env,
  );
  assert.deepEqual(log, ['create', 'resume', 'load']);
});

test('読み始めより後に音がない録音でも、投げずに鳴らし終える', async () => {
  const { env, sources } = fakeEnv();
  const playback = play(takeLoader(() => Promise.resolve(takeOf(new Float32Array(RATE), 2))), env);
  await settle();
  assert.equal(sources.length, 1);
  sources[0].onended?.();
  assert.equal(await playback.finished, 'ended');
});

test('端末に残した録音がもうないときは、鳴らさずに failed で終わる', async () => {
  const { env, sources } = fakeEnv();
  const playback = play(takeLoader(() => Promise.resolve(null)), env);
  assert.equal(await playback.finished, 'failed');
  assert.equal(sources.length, 0);
});
