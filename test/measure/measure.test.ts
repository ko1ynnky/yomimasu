import assert from 'node:assert/strict';
import { test } from 'node:test';
import { definition, voicedSpanMethods, type Definition } from '../../.claude/skills/yomimasu/scripts/definition.ts';
import { measure, measureKami, rangePlacement, tenthSec, type Measurement, type Recording, type Seconds } from '../../.claude/skills/yomimasu/scripts/measure.ts';
import { standardReading, synthesize, type ReadingPlan } from '../support/synth.ts';

const TOLERANCE_SEC = 0.05;
// 帯が動き始めてから声が出るまでの遅れ。
const REACTION_SEC = 0.2;

const recordingOf = (plan: ReadingPlan, overrides: Partial<Recording> = {}): Recording => ({
  pcm: synthesize(plan),
  sampleRate: plan.sampleRate,
  readingStartSec: plan.leadSec - REACTION_SEC,
  ...overrides,
});

const measured = (plan: ReadingPlan, use: Definition = definition) => measure(recordingOf(plan), use);

function secOf(item: Seconds): number {
  assert.equal(item.status, 'ok', JSON.stringify(item));
  return item.sec;
}

function assertNear(item: Seconds, expected: number) {
  const actual = secOf(item);
  assert.ok(Math.abs(actual - expected) <= TOLERANCE_SEC, `${actual} は ${expected} から ${TOLERANCE_SEC} 秒より離れている`);
}

function assertStandardAnswer(result: Measurement) {
  assertNear(result.shimoPlusYoin, 8);
  assertNear(result.ma, 1);
  assertNear(result.kami, 6);
}

const kamiEndSec = (plan: ReadingPlan) => plan.leadSec + plan.shimoSec + plan.yoinSec + plan.maSec + plan.kamiSec;

test('答えが分かる読みから、下の句＋余韻、間、上の句の秒数を返す', () => {
  assertStandardAnswer(measured(standardReading));
});

test('間だけを長くした読みでは、間だけが長くなる', () => {
  const result = measured({ ...standardReading, maSec: 1.6 });
  assertNear(result.ma, 1.6);
  assertNear(result.shimoPlusYoin, 8);
  assertNear(result.kami, 6);
});

test('下の句を速く読んだ読みでは、下の句＋余韻だけが短くなる', () => {
  const result = measured({ ...standardReading, shimoSec: 4 });
  assertNear(result.shimoPlusYoin, 7);
  assertNear(result.ma, 1);
  assertNear(result.kami, 6);
});

test('標本化周波数が 44100 でも同じ読みには同じ答えを返す', () => {
  assertStandardAnswer(measured({ ...standardReading, sampleRate: 44100 }));
});

test('上の句の途中の短い息つぎを間として数えない', () => {
  const result = measured({ ...standardReading, kamiBreath: { atSec: 3, lengthSec: 0.2 } });
  assertNear(result.ma, 1);
  assertNear(result.kami, 6);
});

for (const method of voicedSpanMethods) {
  test(`声の区間を ${method} にしても、答えが分かる読みを正解の範囲で測る`, () => {
    assertStandardAnswer(measured(standardReading, { ...definition, voicedSpan: { ...definition.voicedSpan, method } }));
  });
}

test('合図の間に出た声や物音は、測る範囲の外でも中でも値を変えない', () => {
  const plan: ReadingPlan = {
    ...standardReading,
    leadSec: 3,
    extras: [
      { kind: 'voice', atSec: 0.6, lengthSec: 0.8 },
      { kind: 'thud', atSec: 2.1, lengthSec: 0.2 },
      { kind: 'thud', atSec: 2.45, lengthSec: 0.2 },
    ],
  };
  assertStandardAnswer(measured(plan));
});

for (const method of voicedSpanMethods) {
  test(`読み終えたあとの短い声、物音、ボタンの音で、間と上の句が変わらない（${method}）`, () => {
    const end = kamiEndSec(standardReading);
    const plan: ReadingPlan = {
      ...standardReading,
      tailSec: 4,
      extras: [
        { kind: 'voice', atSec: end + 1.2, lengthSec: 0.3 },
        { kind: 'thud', atSec: end + 2.1, lengthSec: 0.2 },
        { kind: 'click', atSec: end + 3.2, lengthSec: 0.005 },
      ],
    };
    assertStandardAnswer(measured(plan, { ...definition, voicedSpan: { ...definition.voicedSpan, method } }));
  });
}

test('読み終えたあとの短い声は、直前に一瞬の周期の音があっても上の句に含めない', () => {
  const end = kamiEndSec(standardReading);
  const plan: ReadingPlan = {
    ...standardReading,
    tailSec: 3,
    extras: [
      { kind: 'blip', atSec: end + 0.95, lengthSec: 0.02 },
      { kind: 'voice', atSec: end + 1.15, lengthSec: 0.35 },
    ],
  };
  assertStandardAnswer(measured(plan));
});

test('帯が動く 0.3 秒前に読み始めた録音でも、下の句＋余韻の頭を切らずに測る', () => {
  assertStandardAnswer(measure(recordingOf(standardReading, { readingStartSec: standardReading.leadSec + 0.3 })));
});

test('声の周期で間を見つけられない読み（ささやき声）でも測る', () => {
  assertStandardAnswer(measured({ ...standardReading, whisper: true }));
});

test('測る範囲の最初（読み始めの window.lookbackSec 秒前）より前から読み始めた録音では、下の句＋余韻だけを測れないと返す', () => {
  const result = measure(recordingOf(standardReading, { readingStartSec: standardReading.leadSec + 1 }));
  assert.deepEqual(result.shimoPlusYoin, { status: 'unmeasured', reason: 'cut-off' });
  assertNear(result.ma, 1);
  assertNear(result.kami, 6);
});

test('上の句の途中で録音が終わると、上の句だけを測れないと返す', () => {
  const recording = recordingOf(standardReading);
  const kamiStartSec = kamiEndSec(standardReading) - standardReading.kamiSec;
  const result = measure({ ...recording, pcm: recording.pcm.subarray(0, Math.round((kamiStartSec + 3) * recording.sampleRate)) });
  assert.deepEqual(result.kami, { status: 'unmeasured', reason: 'cut-off' });
  assertNear(result.shimoPlusYoin, 8);
  assertNear(result.ma, 1);
});

test('間のない読みでは、どの秒数も値を作らず no-gap を返す', () => {
  const result = measured({ ...standardReading, maSec: 0 });
  for (const item of [result.shimoPlusYoin, result.ma, result.kami]) assert.deepEqual(item, { status: 'unmeasured', reason: 'no-gap' });
});

test('声のない録音では、値を作らず too-quiet を返す', () => {
  const rate = standardReading.sampleRate;
  const result = measure({ pcm: new Float32Array(3 * rate), sampleRate: rate, readingStartSec: 0.5 });
  for (const item of [result.shimoPlusYoin, result.ma, result.kami]) assert.deepEqual(item, { status: 'unmeasured', reason: 'too-quiet' });
});

test('背景の音と声の差が voicedSpan.minRangeDb に届かない録音では、値を作らず too-quiet を返す', () => {
  const noisy: ReadingPlan = { ...standardReading, noiseDb: -30 };
  const result = measured(noisy);
  for (const item of [result.shimoPlusYoin, result.ma, result.kami]) assert.deepEqual(item, { status: 'unmeasured', reason: 'too-quiet' });
  const lower = measured(noisy, { ...definition, voicedSpan: { ...definition.voicedSpan, minRangeDb: 15 } });
  assertStandardAnswer(lower);
});

test('窓より短い録音では、値を作らない', () => {
  const result = measure({ pcm: new Float32Array(10), sampleRate: standardReading.sampleRate, readingStartSec: 0 });
  for (const item of [result.shimoPlusYoin, result.ma, result.kami]) assert.equal(item.status, 'unmeasured');
});

test('秒数は 0.01 秒の単位で返す', () => {
  const result = measured(standardReading);
  for (const item of [result.shimoPlusYoin, result.ma, result.kami]) {
    const sec = secOf(item);
    assert.equal(sec, Math.round(sec * 100) / 100);
  }
});

test('音量の自動調整が切れていると確かめた録音では、声の大きさを 1 dB の単位で返し、声を 6 dB 上げると 6 dB 上がる', () => {
  const levelOf = (gainDb: number) => {
    const level = measure(recordingOf({ ...standardReading, gainDb }, { autoGainControl: false })).level;
    assert.equal(level?.status, 'ok', JSON.stringify(level));
    return level.db;
  };
  const quiet = levelOf(0);
  assert.equal(quiet, Math.round(quiet));
  assert.ok(Math.abs(levelOf(6) - quiet - 6) <= 1, `${levelOf(6) - quiet} dB`);
});

test('声のない録音では、自動の音量調整が切れていても声の大きさを出さない', () => {
  const rate = standardReading.sampleRate;
  const result = measure({ pcm: new Float32Array(3 * rate), sampleRate: rate, readingStartSec: 0.5, autoGainControl: false });
  assert.deepEqual(result.level, { status: 'unmeasured', reason: 'too-quiet' });
});

test('音量の自動調整が切れていると分からない録音では、声の大きさを出さない', () => {
  for (const autoGainControl of [undefined, true]) {
    const result = measure(recordingOf(standardReading, { autoGainControl }));
    assert.deepEqual(result.level, { status: 'unmeasured', reason: 'auto-gain' });
  }
});

test('声の大きさを出さない定義では、音量の項目を作らない', () => {
  const result = measure(recordingOf(standardReading, { autoGainControl: false }), { ...definition, level: 'never' });
  assert.equal('level' in result, false);
});

const kamiOnly: ReadingPlan = { ...standardReading, shimoSec: 0, yoinSec: 0, maSec: 0 };

test('上の句だけを読んだ録音（序歌の上の句）から、上の句の秒数を返す', () => {
  assertNear(measureKami(recordingOf(kamiOnly)).kami, 6);
});

test('上の句だけを読んだ録音でも、合図の間の声と読み終えたあとの物音で上の句が変わらない', () => {
  const end = kamiEndSec(kamiOnly);
  const plan: ReadingPlan = {
    ...kamiOnly,
    leadSec: 3,
    tailSec: 4,
    extras: [
      { kind: 'voice', atSec: 0.6, lengthSec: 0.8 },
      { kind: 'voice', atSec: end + 1.2, lengthSec: 0.3 },
      { kind: 'thud', atSec: end + 2.1, lengthSec: 0.2 },
    ],
  };
  assertNear(measureKami(recordingOf(plan)).kami, 6);
});

test('上の句だけを読んだ録音が途中で終わると、上の句を測れないと返す', () => {
  const recording = recordingOf(kamiOnly);
  const pcm = recording.pcm.subarray(0, Math.round((kamiOnly.leadSec + 3) * recording.sampleRate));
  assert.deepEqual(measureKami({ ...recording, pcm }).kami, { status: 'unmeasured', reason: 'cut-off' });
});

test('上の句だけを測るときも、声のない録音では too-quiet を返す', () => {
  const rate = standardReading.sampleRate;
  assert.deepEqual(measureKami({ pcm: new Float32Array(3 * rate), sampleRate: rate, readingStartSec: 0.5 }).kami, { status: 'unmeasured', reason: 'too-quiet' });
});

test('上の句だけを測るとき、測る範囲の最初で声が続いていれば、上の句を測れないと返す', () => {
  const result = measureKami(recordingOf(kamiOnly, { readingStartSec: kamiOnly.leadSec + 1 }));
  assert.deepEqual(result.kami, { status: 'unmeasured', reason: 'cut-off' });
});

test('上の句だけを測るとき、物音しかない録音では、上の句も声の大きさも too-quiet を返す', () => {
  const plan: ReadingPlan = { ...kamiOnly, kamiSec: 0, tailSec: 2.5, extras: [{ kind: 'thud', atSec: 1.5, lengthSec: 0.3 }] };
  const result = measureKami(recordingOf(plan, { autoGainControl: false }));
  assert.deepEqual(result, { kami: { status: 'unmeasured', reason: 'too-quiet' }, level: { status: 'unmeasured', reason: 'too-quiet' } });
});

test('見せる秒は、測った 0.01 秒の値を 0.1 秒に四捨五入する', () => {
  assert.deepEqual([1.15, 1.24, 1.25, 1.05, 8.04, 0.95].map(tenthSec), [1.2, 1.2, 1.3, 1.1, 8.0, 1.0]);
});

test('判定は 0.1 秒に四捨五入した秒で、幅の両端を含めて、幅の中か、上か、下かを決める', () => {
  const range = { minSec: 0.9, maxSec: 1.2 };
  assert.equal(rangePlacement(0.85, range), 'inside');
  assert.equal(rangePlacement(1.24, range), 'inside');
  assert.equal(rangePlacement(1.25, range), 'above');
  assert.equal(rangePlacement(0.84, range), 'below');
});
