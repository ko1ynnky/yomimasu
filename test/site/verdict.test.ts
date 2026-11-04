import assert from 'node:assert/strict';
import { test } from 'node:test';
import { definition } from '../../.claude/skills/yomimasu/scripts/definition.ts';
import type { Measurement, Seconds } from '../../.claude/skills/yomimasu/scripts/measure.ts';
import { levelSentence, noticeOf, resultRows } from '../../site/client/verdict.ts';

const ok = (sec: number): Seconds => ({ status: 'ok', sec });
const measured = (shimoPlusYoin: number, ma: number, kami: number): Measurement => ({ shimoPlusYoin: ok(shimoPlusYoin), ma: ok(ma), kami: ok(kami) });

test('行は下の句＋余韻、間、上の句の順で、どの行も目安の幅を出す', () => {
  const rows = resultRows(measured(8, 1, 6));
  assert.deepEqual(
    rows.map(({ label, reference }) => [label, reference]),
    [
      ['下の句＋余韻', `目安 ${definition.ranges.shimoPlusYoin.minSec}〜${definition.ranges.shimoPlusYoin.maxSec}秒`],
      ['間', `目安 ${definition.ranges.ma.minSec}〜${definition.ranges.ma.maxSec}秒`],
      ['上の句', `目安 ${definition.ranges.kami.minSec}〜${definition.ranges.kami.maxSec}秒`],
    ],
  );
});

test('幅の中は「ちょうどよい」、上は「ちょっと長い」、下は「ちょっと短い」と判定する', () => {
  const [shimo, ma, kami] = resultRows(measured(9.5, 1.0, 5.0));
  assert.equal(shimo.verdict, 'ちょっと長い');
  assert.equal(ma.verdict, 'ちょうどよい');
  assert.equal(kami.verdict, 'ちょっと短い');
});

test('測った秒は 0.1 秒に四捨五入して出し、判定も同じ値で付けるので、表示と判定が食い違わない', () => {
  const [, inside] = resultRows(measured(8, 1.24, 6));
  assert.deepEqual([inside.value, inside.verdict], ['1.2秒', 'ちょうどよい']);
  const [, outside] = resultRows(measured(8, 1.25, 6));
  assert.deepEqual([outside.value, outside.verdict], ['1.3秒', 'ちょっと長い']);
  const [shimo] = resultRows(measured(8.04, 1, 6));
  assert.equal(shimo.value, '8.0秒');
});

test('幅のない項目には判定を付けず、標準の値を出す', () => {
  const { kami: _, ...ranges } = definition.ranges;
  const [, , kami] = resultRows(measured(8, 1, 6), { ...ranges } as typeof definition.ranges);
  assert.equal(kami.verdict, null);
  assert.equal(kami.reference, '標準 6秒程度');
});

test('測れなかった項目は、値も判定も作らず「測れませんでした」とする', () => {
  const [shimo, ma] = resultRows({ shimoPlusYoin: { status: 'unmeasured', reason: 'cut-off' }, ma: ok(1), kami: ok(6) });
  assert.deepEqual([shimo.value, shimo.verdict, shimo.unmeasured], [null, null, true]);
  assert.equal(ma.unmeasured, false);
});

test('どの項目も声が小さくて測れないときと、切れ目が見つからないときは、読み直す理由を返す', () => {
  const all = (reason: 'too-quiet' | 'no-gap'): Measurement => ({
    shimoPlusYoin: { status: 'unmeasured', reason },
    ma: { status: 'unmeasured', reason },
    kami: { status: 'unmeasured', reason },
  });
  assert.equal(noticeOf(all('too-quiet')), '声を聞き取れず、測れませんでした。読み直すか、静かな場所で試してください。');
  assert.equal(noticeOf(all('no-gap')), '読みの切れ目が見つからず、測れませんでした。間を空けて読み直してください。');
  assert.equal(noticeOf(measured(8, 1, 6)), null);
});

test('声の大きさは、測れたときだけ参考の文にする', () => {
  assert.equal(levelSentence({ ...measured(8, 1, 6), level: { status: 'ok', db: -18 } }), '今回の音量は -18 dB でした。参考の値で、端末と持ち方で変わります。');
  assert.equal(levelSentence({ ...measured(8, 1, 6), level: { status: 'unmeasured', reason: 'auto-gain' } }), null);
  assert.equal(levelSentence(measured(8, 1, 6)), null);
});
