import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Measurement, Seconds } from '../../.claude/skills/yomimasu/scripts/measure.ts';
import { maSpread, pairLabel, recordedAtLabel } from '../../site/client/compare.ts';

const ok = (sec: number): Seconds => ({ status: 'ok', sec });
const withMa = (ma: Seconds | number): Measurement => ({ shimoPlusYoin: ok(8), ma: typeof ma === 'number' ? ok(ma) : ma, kami: ok(6) });

test('間を測れた回が2回に満たなければ、平均とばらつきを出さない', () => {
  assert.equal(maSpread([]), null);
  assert.equal(maSpread([withMa(1.0)]), null);
  assert.equal(maSpread([withMa(1.0), withMa({ status: 'unmeasured', reason: 'no-gap' })]), null);
});

test('間を2回以上測れたら、回数、平均、ばらつき（いちばん短い回から長い回までの差）を出す', () => {
  assert.deepEqual(maSpread([withMa(1.6), withMa(1.0), withMa(1.2)]), { count: 3, mean: '1.3秒', width: '0.6秒', range: '1.0〜1.6秒' });
});

test('間を測れなかった回は数えない', () => {
  assert.deepEqual(maSpread([withMa(1.6), withMa({ status: 'unmeasured', reason: 'too-quiet' }), withMa(1.0)]), {
    count: 2,
    mean: '1.3秒',
    width: '0.6秒',
    range: '1.0〜1.6秒',
  });
});

test('ばらつきは見せる最短と最長の差にするので、並べた秒と食い違わない', () => {
  // 0.99 は 1.0秒、1.64 は 1.6秒と見せる。0.01 秒の値の差 0.65 を丸めると 0.7秒になり、見せる 1.0〜1.6秒 と合わない。
  assert.deepEqual(maSpread([withMa(0.99), withMa(1.64)]), { count: 2, mean: '1.3秒', width: '0.6秒', range: '1.0〜1.6秒' });
});

test('平均は 0.01 秒の値から求め、0.1 秒に1回だけ四捨五入して出す', () => {
  // 見せる値（1.0、1.0、1.1秒）の平均なら 1.0秒になるが、0.01 秒の値の平均は 1.073…秒である。
  assert.equal(maSpread([withMa(1.04), withMa(1.04), withMa(1.14)])?.mean, '1.1秒');
  // 1.046…秒を先に 0.01 秒へ丸めると 1.05秒になり、続けて丸めると 1.1秒になってしまう。
  assert.equal(maSpread([withMa(1.04), withMa(1.04), withMa(1.06)])?.mean, '1.0秒');
  // ちょうど半分は、結果の行（tenthSec）と同じく切り上げる。
  assert.equal(maSpread([withMa(1.04), withMa(1.06)])?.mean, '1.1秒');
  assert.equal(maSpread([withMa(1.1), withMa(1.2)])?.mean, '1.2秒');
});

test('録った日時は、月日と時刻で出す', () => {
  assert.equal(recordedAtLabel(new Date(2026, 10, 6, 9, 4).getTime()), '11月6日 9:04');
  assert.equal(recordedAtLabel(new Date(2026, 11, 31, 23, 59).getTime()), '12月31日 23:59');
});

test('組は、下の句の札と上の句の札の決まり字で出す', () => {
  assert.equal(pairLabel({ shimo: 81, kami: 45 }), 'ほ あはれ');
});
