import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyDiffs, soundDiffs } from '../../scripts/cards/sound.ts';

const read = (kana: string, heads: number[] = [0]) => applyDiffs(kana, soundDiffs(kana, new Set(heads)));

test('語の途中のハ行はワ行とア行の音で読む', () => {
  assert.equal(read('かりほの'), 'かりおの');
  assert.equal(read('ころもでは'), 'ころもでわ');
  assert.equal(read('こひしき'), 'こいしき');
  assert.equal(read('しろたへの'), 'しろたえの');
  assert.equal(read('かよふ'), 'かよう');
});

test('語の頭のハ行は読み替えない', () => {
  assert.equal(read('はなのいろ'), 'はなのいろ');
  assert.equal(read('いまはた', [0, 2]), 'いまはた');
});

test('ゐ、ゑ、を、ぢ、づ は今の仮名の音で読む', () => {
  assert.equal(read('くもゐに'), 'くもいに');
  assert.equal(read('すゑの'), 'すえの');
  assert.equal(read('ひとをも'), 'ひとおも');
  assert.equal(read('もみぢ'), 'もみじ');
  assert.equal(read('かづら'), 'かずら');
});

test('語の形で長音になるところは、字数が変わることがある', () => {
  assert.equal(read('あふことの'), 'おうことの');
  assert.equal(read('いふべき'), 'ゆうべき');
  assert.equal(read('けふを'), 'きょうお');
  assert.equal(read('すてふ'), 'すちょう');
  assert.equal(read('まがふ'), 'まごう');
});

test('助動詞の「む」は「ん」で読み、語の頭の「む」は残す', () => {
  assert.equal(read('かもねむ'), 'かもねん');
  assert.equal(read('むかし'), 'むかし');
});

test('読み替えの箇所は、仮名の位置と規則つきで返す', () => {
  assert.deepEqual(soundDiffs('かりほ', new Set([0])), [{ at: 2, kana: 'ほ', sound: 'お', rule: '語中のハ行' }]);
  assert.deepEqual(soundDiffs('すてふ', new Set([0])), [{ at: 1, kana: 'てふ', sound: 'ちょう', rule: '長音' }]);
});
