import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import texts from '../../.claude/skills/yomimasu/assets/next-point.json' with { type: 'json' };
import { definition, type Range, type RangeItem } from '../../.claude/skills/yomimasu/scripts/definition.ts';
import { measure, type Measurement, type Seconds, type Unmeasured } from '../../.claude/skills/yomimasu/scripts/measure.ts';
import { nextPoint, PRIORITY, type Pair } from '../../.claude/skills/yomimasu/scripts/next-point.ts';
import { standardReading, synthesize } from '../support/synth.ts';

// テストリスト
// - 判定を出す項目ごとに、その項目だけを幅の外にすると、その項目と向きを1点に選ぶ
// - 1点は、直す内容、理由、直し方、関わる教科書のページの URL を持つ
// - 間は総論、下の句＋余韻は下の句の札、上の句は上の句の札の1首のページへ案内する。序歌は序歌のページへ
// - 幅の外が2つ以上なら、優先の表の順で選ぶ
// - すべて幅の中なら「直す点なし」
// - too-quiet と no-gap は「出さない」
// - 測れなかった項目は選ばない。測れた項目がどれも幅の中なら「直す点なし」
// - 判定は表示と同じ 0.1 秒の値で、幅は定義のデータから読む
// - 同じ入力からは同じ答え
// - 合成音で間を崩した1組を measure から通すと、間を選ぶ
// - 文はどの項目と向きにもあり、もとにした知識のファイルと見出しがある
// - 文に幅の値を書き写さず、明瞭さ、発音、声の大きさに触れない

const ok = (sec: number): Seconds => ({ status: 'ok', sec });
const gone = (reason: Unmeasured): Seconds => ({ status: 'unmeasured', reason });
const middle = ({ minSec, maxSec }: Range) => Math.round(((minSec + maxSec) / 2) * 100) / 100;
const { ranges } = definition;
const inside = (): Measurement => ({ shimoPlusYoin: ok(middle(ranges.shimoPlusYoin)), ma: ok(middle(ranges.ma)), kami: ok(middle(ranges.kami)) });
const pair: Pair = { shimo: 77, kami: 29 };
const ITEMS: readonly RangeItem[] = ['shimoPlusYoin', 'ma', 'kami'];

const longer = (item: RangeItem) => Math.round((ranges[item].maxSec + 0.3) * 100) / 100;
const shorter = (item: RangeItem) => Math.round((ranges[item].minSec - 0.3) * 100) / 100;
const pageOf: Record<RangeItem, string> = { ma: '/soron/', shimoPlusYoin: `/karuta/${pair.shimo}/`, kami: `/karuta/${pair.kami}/` };

for (const item of ITEMS) {
  for (const [placement, sec] of [
    ['above', longer(item)],
    ['below', shorter(item)],
  ] as const) {
    test(`${item} だけを幅の${placement === 'above' ? '上' : '下'}に外すと、${item} を1点に選び、文と教科書のページを付ける`, () => {
      const answer = nextPoint({ ...inside(), [item]: ok(sec) }, pair);
      assert.equal(answer.kind, 'point');
      if (answer.kind !== 'point') return;
      const text = texts.points[item][placement];
      assert.deepEqual(answer.point, { item, placement, fix: text.fix, reason: text.reason, how: text.how, link: { label: texts.points[item].link, url: pageOf[item] } });
    });
  }
}

test('序歌の下の句の組では、下の句＋余韻のページを序歌のページにする', () => {
  const answer = nextPoint({ ...inside(), shimoPlusYoin: ok(longer('shimoPlusYoin')) }, { shimo: 0, kami: 29 });
  assert.equal(answer.kind === 'point' && answer.point.link.url, '/karuta/joka/');
});

test('すべての項目が幅の中なら、直す点なしを返す', () => {
  assert.deepEqual(nextPoint(inside(), pair), { kind: 'clear' });
});

for (const reason of ['too-quiet', 'no-gap'] as const) {
  test(`${reason} のときは出さない`, () => {
    const measurement: Measurement = { shimoPlusYoin: gone(reason), ma: gone(reason), kami: gone(reason) };
    assert.deepEqual(nextPoint(measurement, pair), { kind: 'hidden' });
  });
}

test('測れなかった項目は選ばず、測れた項目がどれも幅の中なら直す点なしを返す', () => {
  assert.deepEqual(nextPoint({ ...inside(), shimoPlusYoin: gone('cut-off') }, pair), { kind: 'clear' });
  const answer = nextPoint({ ...inside(), shimoPlusYoin: gone('cut-off'), kami: ok(longer('kami')) }, pair);
  assert.equal(answer.kind === 'point' && answer.point.item, 'kami');
});

test('優先の順は、間、下の句＋余韻、上の句である', () => {
  assert.deepEqual(PRIORITY, ['ma', 'shimoPlusYoin', 'kami']);
});

test('幅の外が2つ以上なら、外れの大きさによらず優先の順の早い項目を選ぶ', () => {
  for (const [first, second] of [
    ['ma', 'shimoPlusYoin'],
    ['ma', 'kami'],
    ['shimoPlusYoin', 'kami'],
  ] as const) {
    const measurement = { ...inside(), [first]: ok(longer(first)), [second]: ok(ranges[second].maxSec + 3) };
    const answer = nextPoint(measurement, pair);
    assert.equal(answer.kind === 'point' && answer.point.item, first, `${first} と ${second}`);
  }
  const all = nextPoint({ shimoPlusYoin: ok(shorter('shimoPlusYoin')), ma: ok(shorter('ma')), kami: ok(shorter('kami')) }, pair);
  assert.equal(all.kind === 'point' && all.point.item, 'ma');
});

test('判定は表示と同じ 0.1 秒の値で決め、幅の端は幅の中とする', () => {
  const edge = Math.round((ranges.ma.maxSec + 0.04) * 100) / 100;
  assert.deepEqual(nextPoint({ ...inside(), ma: ok(edge) }, pair), { kind: 'clear' });
  const over = Math.round((ranges.ma.maxSec + 0.05) * 100) / 100;
  assert.equal(nextPoint({ ...inside(), ma: ok(over) }, pair).kind, 'point');
});

test('判定の幅は定義のデータから読む', () => {
  const measurement = { ...inside(), ma: ok(longer('ma')) };
  const wider = { ...definition, ranges: { ...ranges, ma: { minSec: ranges.ma.minSec, maxSec: longer('ma') } } };
  assert.equal(nextPoint(measurement, pair).kind, 'point');
  assert.deepEqual(nextPoint(measurement, pair, wider), { kind: 'clear' });
});

test('同じ入力からは、いつも同じ答えを返す', () => {
  const measurement = { ...inside(), kami: ok(shorter('kami')), ma: ok(longer('ma')) };
  assert.deepEqual(nextPoint(measurement, pair), nextPoint(structuredClone(measurement), { ...pair }));
});

test('合成音で間を目安より長くした1組を measure から通すと、間を長いとして選ぶ', () => {
  const plan = { ...standardReading, maSec: longer('ma') + 0.2 };
  const measurement = measure({ pcm: synthesize(plan), sampleRate: plan.sampleRate, readingStartSec: plan.leadSec });
  const answer = nextPoint(measurement, pair);
  assert.equal(answer.kind, 'point');
  assert.deepEqual(answer.kind === 'point' && [answer.point.item, answer.point.placement], ['ma', 'above']);
});

const REFERENCES = '.claude/skills/yomimasu/references';
type Text = { fix: string; reason: string; how: string; basis: Record<'fix' | 'reason' | 'how', { file: string; heading: string }[]> };
const allTexts = (): [string, Text][] =>
  ITEMS.flatMap((item) => (['above', 'below'] as const).map((placement): [string, Text] => [`${item}.${placement}`, texts.points[item][placement]]));

test('文はどの項目と向きにもあり、文ごとに、もとにした知識のファイルと見出しがある', () => {
  for (const [name, text] of allTexts()) {
    for (const field of ['fix', 'reason', 'how'] as const) {
      assert.ok(text[field].length > 0, `${name}.${field}`);
      assert.ok(text.basis[field].length > 0, `${name}.${field} のもと`);
      for (const { file, heading } of text.basis[field]) {
        const path = join(REFERENCES, file);
        assert.ok(existsSync(path), `${name}.${field}: ${file}`);
        assert.match(readFileSync(path, 'utf8'), new RegExp(`^#+ ${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'), `${name}.${field}: ${file} の ${heading}`);
      }
    }
  }
});

test('文に判定の幅の値を書き写さず、測っていない明瞭さ、発音、声の大きさに触れない', () => {
  const widths = Object.values(ranges).flatMap(({ minSec, maxSec }) => [minSec, maxSec]).map(String);
  for (const [name, text] of allTexts()) {
    const sentence = [text.fix, text.reason, text.how].join('');
    for (const width of widths) assert.ok(!new RegExp(`(^|[^\\d.])${width.replace('.', '\\.')}([^\\d]|$)`).test(sentence), `${name} に ${width}`);
    assert.doesNotMatch(sentence, /明瞭|発音|音量|声の大きさ|大きな声|小さな声|Claude|AI/, name);
  }
});
