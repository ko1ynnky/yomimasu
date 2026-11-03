import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Phrase } from '../../.claude/skills/yomimasu/scripts/cards.ts';
import { alternativeOnLine, notationOnLine } from '../../scripts/cards/assemble.ts';
import { applyDiffs, soundDiffs } from '../../scripts/cards/sound.ts';

const phrase = (kana: string, heads = [0]): Phrase => {
  const diffs = soundDiffs(kana, new Set(heads));
  return { text: kana, kana, sound: applyDiffs(kana, diffs), parts: [[kana, kana]], diffs };
};

const lower99 = [phrase('よをおもふゆゑに'), phrase('ものおもふみは')];

test('ふりがなは、一覧の読みの中の位置から、句の仮名の範囲へ移る', () => {
  const upper = [phrase('あはぢしま'), phrase('かよふちどりの'), phrase('なくこゑに')];
  const { furigana } = notationOnLine(upper, 0, [
    { start: 0, text: 'あわじしま', base: '淡路島' },
    { start: 7, text: 'ー', base: 'ふ' },
    { start: 8, text: 'ちどり', base: '千鳥' },
    { start: 14, text: 'こえ', base: '声' },
  ]);
  assert.deepEqual(furigana, [
    { phrase: 0, at: 0, length: 5, reading: 'あわじしま' },
    { phrase: 1, at: 2, length: 1, reading: 'ー' },
    { phrase: 1, at: 3, length: 3, reading: 'ちどり' },
    { phrase: 2, at: 2, length: 2, reading: 'こえ' },
  ]);
});

test('句の切れ目から始まるふりがなは、続く句の頭に置く', () => {
  const upper = [phrase('あさぼらけ'), phrase('ありあけのつきと'), phrase('みるまでに')];
  const { furigana } = notationOnLine(upper, 0, [{ start: 5, text: 'ありあけ', base: '有明' }]);
  assert.deepEqual(furigana, [{ phrase: 1, at: 0, length: 4, reading: 'ありあけ' }]);
});

test('下の句の位置は、四句から数えた句の番号で返す', () => {
  const { furigana } = notationOnLine(lower99, 3, [{ start: 12, text: 'ー', base: 'ふ' }]);
  assert.deepEqual(furigana, [{ phrase: 4, at: 4, length: 1, reading: 'ー' }]);
});

test('漢字のかたまりと仮名に続けて掛かるふりがなは、かたまりと仮名1字ごとに分ける', () => {
  const lower = [phrase('よをうぢやまと'), phrase('ひとはいふなり')];
  const { furigana } = notationOnLine(lower, 3, [{ start: 7, text: 'ひとわゆー', base: '人はいふ' }]);
  assert.deepEqual(furigana, [
    { phrase: 4, at: 0, length: 2, reading: 'ひと' },
    { phrase: 4, at: 2, length: 1, reading: 'わ' },
    { phrase: 4, at: 3, length: 1, reading: 'ゆ' },
    { phrase: 4, at: 4, length: 1, reading: 'ー' },
  ]);
});

test('1つの漢字のかたまりに掛かるふりがなは、1つにまとめる', () => {
  const { furigana } = notationOnLine([phrase('やへむぐら')], 0, [{ start: 0, text: 'やえむぐら', base: '八重葎' }]);
  assert.deepEqual(furigana, [{ phrase: 0, at: 0, length: 5, reading: 'やえむぐら' }]);
});

test('字数の変わる読み替えの仮名2字に掛かるふりがなは、分けない', () => {
  const { furigana } = notationOnLine([phrase('けふをかぎりの')], 0, [{ start: 0, text: 'きょー', base: 'けふ' }]);
  assert.deepEqual(furigana, [{ phrase: 0, at: 0, length: 2, reading: 'きょー' }]);
});

test('句の切れ目をまたぐ漢字のかたまりのふりがなは、句の切れ目で分ける', () => {
  const upper = [phrase('わたのはら', [0, 3]), phrase('やそしまかけて'), phrase('こぎいでぬと')];
  const { furigana } = notationOnLine(upper, 0, [{ start: 3, text: 'はらやそしま', base: '原八十島' }]);
  assert.deepEqual(furigana, [
    { phrase: 0, at: 3, length: 2, reading: 'はら' },
    { phrase: 1, at: 0, length: 4, reading: 'やそしま' },
  ]);
});

test('括弧の中の読みは注として、ふりがなと分けて返す', () => {
  const upper = [phrase('あはれとも'), phrase('いふべきひとは'), phrase('おもほえで')];
  const { furigana, notes } = notationOnLine(upper, 0, [{ start: 12, text: 'おも(お)', base: '思ほ' }]);
  assert.deepEqual(furigana, [{ phrase: 2, at: 0, length: 2, reading: 'おも' }]);
  assert.deepEqual(notes, [{ phrase: 2, at: 2, length: 1, reading: 'お' }]);
});

test('漢字のかたまりの読みの途中にある注で、ふりがなを分ける', () => {
  const { furigana, notes } = notationOnLine([phrase('おほえやま')], 0, [{ start: 0, text: 'お(お)えやま', base: '大江山' }]);
  assert.deepEqual(furigana, [
    { phrase: 0, at: 0, length: 1, reading: 'お' },
    { phrase: 0, at: 2, length: 3, reading: 'えやま' },
  ]);
  assert.deepEqual(notes, [{ phrase: 0, at: 1, length: 1, reading: 'お' }]);
});

test('本文の仮名が、ふりがなの範囲の句の仮名と合わないときは止まる', () => {
  assert.throws(() => notationOnLine([phrase('ひとはいふなり')], 0, [{ start: 0, text: 'ひとわ', base: '人を' }]), /合わない/);
});

test('漢字のかたまりの読みの範囲が決まらないときは止まる', () => {
  assert.throws(() => notationOnLine([phrase('はののいろ')], 0, [{ start: 0, text: 'はののいろ', base: '葉の色' }]), /決まらない/);
});

test('読み替えの途中で切れるふりがなは、仮名の範囲へ移せないので止まる', () => {
  assert.throws(() => notationOnLine([phrase('けふ')], 0, [{ start: 0, text: 'き', base: 'け' }]), /仮名の字の切れ目/);
});

test('別の読みは、行の読みと字を照らし、伸ばす位置を句の仮名の字数で返す', () => {
  const upper = [phrase('あさぼらけ'), phrase('ありあけのつきと'), phrase('みるまでに')];
  assert.deepEqual(alternativeOnLine(upper, 0, 'あさぼらけありあけのつきとみるまでに', 'あさぼらけありあけのーつきとー'), {
    phrases: [0, 1],
    marked: 'あさぼらけありあけのーつきとー',
    stretches: [
      { phrase: 1, after: 5 },
      { phrase: 1, after: 8 },
    ],
  });
});

test('別の読みの印が長音のふりがなの位置にあるときは、印が長音を兼ねる', () => {
  assert.deepEqual(alternativeOnLine(lower99, 3, 'よをおもーゆえにものおもーみわ', 'よをおもーゆえにー'), {
    phrases: [3, 3],
    marked: 'よをおもーゆえにー',
    stretches: [
      { phrase: 3, after: 5 },
      { phrase: 3, after: 8 },
    ],
  });
});

test('別の読みが句の終わりで終わらないときは止まる', () => {
  assert.throws(() => alternativeOnLine(lower99, 3, 'よをおもーゆえにものおもーみわ', 'よをおもーゆえー'), /句の終わり/);
});

test('別の読みが伸ばしの印のあとに字を残すときは止まる', () => {
  assert.throws(() => alternativeOnLine(lower99, 3, 'よをおもーゆえにものおもーみわ', 'よをおもーゆえにーもの'), /印で終わらない/);
});

test('別の読みの字が行の読みと合わないときは止まる', () => {
  assert.throws(() => alternativeOnLine(lower99, 3, 'よをおもーゆえにものおもーみわ', 'よのおもーゆえにー'), /合わない/);
});
