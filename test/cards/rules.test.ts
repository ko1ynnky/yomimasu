import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  kimarijiLengths,
  markedText,
  ruleStretchesOf,
  soundOffset,
  type Phrase,
} from '../../.claude/skills/yomimasu/scripts/cards.ts';

const phrase = (text: string, kana: string, sound: string, diffs: Phrase['diffs'] = []): Phrase => ({
  text,
  kana,
  sound,
  parts: [[text, kana]],
  diffs,
});

const kanaOnly = (...kana: string[]) => kana.map((k) => ({ kana: k }));

test('ふつうの札は、初句、二句、上の句の一字前と終わり、四句、結句の二字前で伸ばす', () => {
  const stretches = ruleStretchesOf(1, kanaOnly('あきのたの', 'かりほのいほの', 'とまをあらみ', 'わがころもでは', 'つゆにぬれつつ'), false);
  assert.deepEqual(stretches, [
    { phrase: 0, after: 5 },
    { phrase: 1, after: 7 },
    { phrase: 2, after: 5 },
    { phrase: 2, after: 6 },
    { phrase: 3, after: 7 },
    { phrase: 4, after: 5 },
  ]);
});

test('上の句の二字前の札は、終わりの2字をまとめる', () => {
  const stretches = ruleStretchesOf(8, kanaOnly('わがいほは', 'みやこのたつみ', 'しかぞすむ', 'よをうぢやまと', 'ひとはいふなり'), false);
  assert.ok(stretches.some((s) => s.phrase === 2 && s.after === 3));
  assert.ok(!stretches.some((s) => s.phrase === 2 && s.after === 4));
});

test('大山札は初句の後で伸ばさない', () => {
  const stretches = ruleStretchesOf(31, kanaOnly('あさぼらけ', 'ありあけのつきと', 'みるまでに', 'よしののさとに', 'ふれるしらゆき'), true);
  assert.ok(!stretches.some((s) => s.phrase === 0));
  assert.ok(stretches.some((s) => s.phrase === 1 && s.after === 8));
});

for (const ending of ['もがな', 'おもへ', 'おもふ', 'なくに', 'ものを']) {
  test(`結句が「${ending}」で終わる札は、最後の3字をまとめる`, () => {
    const fifth = `いのち${ending}`;
    const stretches = ruleStretchesOf(2, kanaOnly('あいうえお', 'あいうえおかき', 'あいうえお', 'あいうえおかき', fifth), false);
    assert.deepEqual(stretches.at(-1), { phrase: 4, after: 3 });
  });
}

test('決まり字は、ほかの札と区別できるまでの字数である', () => {
  const lengths = kimarijiLengths(
    new Map([
      [1, 'あきのたの'],
      [2, 'あきかぜに'],
      [3, 'むらさめの'],
    ]),
  );
  assert.deepEqual([...lengths], [
    [1, 3],
    [2, 3],
    [3, 1],
  ]);
});

test('発音の差を越えて、仮名の位置を発音の位置へ移せる', () => {
  const samples = phrase('ころもほすてふ', 'ころもほすてふ', 'ころもほすちょー', [{ at: 5, kana: 'てふ', sound: 'ちょー', rule: '長音' }]);
  assert.equal(soundOffset(samples, 5), 5);
  assert.equal(soundOffset(samples, 7), 8);
});

test('字数の変わらない読み替えの途中は、字ごとに発音の位置へ移せる', () => {
  const samples = phrase('いふべき', 'いふべき', 'ゆーべき', [{ at: 0, kana: 'いふ', sound: 'ゆー', rule: '長音' }]);
  assert.equal(soundOffset(samples, 1), 1);
});

test('読み替えの途中の位置には移せない', () => {
  const samples = phrase('けふ', 'けふ', 'きょー', [{ at: 0, kana: 'けふ', sound: 'きょー', rule: '長音' }]);
  assert.throws(() => soundOffset(samples, 1), /読み替えの途中/);
});

test('伸ばす箇所は、漢字の読みの切れ目に置いて表示できる', () => {
  const first: Phrase = { ...phrase('須磨の関守', 'すまのせきもり', 'すまのせきもり'), parts: [['須磨', 'すま'], ['の', 'の'], ['関', 'せき'], ['守', 'もり']] };
  assert.equal(markedText([first], [{ phrase: 0, after: 5 }, { phrase: 0, after: 7 }]), '須磨の関ー守ー');
});

test('漢字の読みの途中には伸ばす箇所を置けない', () => {
  const first: Phrase = { ...phrase('関守', 'せきもり', 'せきもり') };
  assert.throws(() => markedText([first], [{ phrase: 0, after: 2 }]), /読みの途中/);
});
