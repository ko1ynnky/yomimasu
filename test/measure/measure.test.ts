import assert from 'node:assert/strict';
import { test } from 'node:test';
import { measure, type Measurement } from '../../.claude/skills/yomimasu/scripts/measure.ts';
import { standardReading, synthesize, type ReadingPlan } from '../support/synth.ts';

const TOLERANCE_SEC = 0.05;

const measured = (plan: ReadingPlan) => measure(synthesize(plan), plan.sampleRate);

function assertOk(result: Measurement): asserts result is Extract<Measurement, { status: 'ok' }> {
  assert.equal(result.status, 'ok');
}

const assertNear = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) <= TOLERANCE_SEC, `${actual} は ${expected} から ${TOLERANCE_SEC} 秒より離れている`);

test('答えが分かる読みから、下の句＋余韻、間、上の句の秒数を返す', () => {
  const result = measured(standardReading);
  assertOk(result);
  assertNear(result.shimoPlusYoinSec, 8);
  assertNear(result.maSec, 1);
  assertNear(result.kamiSec, 6);
});

test('間だけを長くした読みでは、間だけが長くなる', () => {
  const result = measured({ ...standardReading, maSec: 1.6 });
  assertOk(result);
  assertNear(result.maSec, 1.6);
  assertNear(result.shimoPlusYoinSec, 8);
  assertNear(result.kamiSec, 6);
});

test('下の句を速く読んだ読みでは、下の句＋余韻だけが短くなる', () => {
  const result = measured({ ...standardReading, shimoSec: 4 });
  assertOk(result);
  assertNear(result.shimoPlusYoinSec, 7);
  assertNear(result.maSec, 1);
});

test('標本化周波数が 44100 でも同じ読みには同じ答えを返す', () => {
  const result = measured({ ...standardReading, sampleRate: 44100 });
  assertOk(result);
  assertNear(result.maSec, 1);
  assertNear(result.shimoPlusYoinSec, 8);
});

test('上の句の途中の短い息つぎを間として数えない', () => {
  const result = measured({ ...standardReading, kamiBreath: { atSec: 3, lengthSec: 0.2 } });
  assertOk(result);
  assertNear(result.maSec, 1);
  assertNear(result.kamiSec, 6);
});

test('間のない読みでは、値を作らず no-gap を返す', () => {
  assert.deepEqual(measured({ ...standardReading, maSec: 0 }), { status: 'no-gap' });
});

test('声のない録音では、値を作らず too-quiet を返す', () => {
  const rate = standardReading.sampleRate;
  assert.deepEqual(measure(new Float32Array(3 * rate), rate), { status: 'too-quiet' });
});

test('窓より短い録音では、値を作らない', () => {
  assert.notEqual(measure(new Float32Array(10), standardReading.sampleRate).status, 'ok');
});

test('秒数は 0.01 秒の単位で返す', () => {
  const result = measured(standardReading);
  assertOk(result);
  for (const value of [result.shimoPlusYoinSec, result.maSec, result.kamiSec]) {
    assert.equal(value, Math.round(value * 100) / 100);
  }
});
