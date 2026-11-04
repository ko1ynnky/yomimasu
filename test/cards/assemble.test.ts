import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Card, Phrase } from '../../.claude/skills/yomimasu/scripts/cards.ts';
import { alternativeOnLine, buildCard, compareWithList, notationOnLine } from '../../scripts/cards/assemble.ts';
import type { ListCard, ListLine } from '../../scripts/cards/list.ts';
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

test('札の句の発音は、規則の読み替えに一覧のふりがなの「ー」と注を当て、位置は当てる前と同じに置く', () => {
  const plain = (text: string, reading: string, extra: Partial<ListLine> = {}): ListLine => ({ plain: text, marked: text, reading, marks: [], rubies: [], alternative: null, ...extra });
  const built = buildCard(
    77,
    { upperText: 'せをはやみいはにせかるるたきがはの', upperKana: 'せをはやみいはにせかるるたきがはの', lowerText: 'われてもすゑにあはむとぞ思ふ', lowerKana: 'われてもすゑにあはむとぞおもふ' },
    [],
    {
      no: 77,
      page: 15,
      upper: plain('', ''),
      lower: plain('', '', { marks: [12], rubies: [{ start: 12, text: 'おも(お)', base: '思ふ' }] }),
      yoin: true,
    },
  );
  assert.equal(built.phrases[4].sound, 'あわんとぞおもお');
  assert.deepEqual(built.phrases[4].diffs.at(-1), { at: 7, kana: 'ふ', sound: 'お', rule: '一覧の注' });
  assert.deepEqual(built.furigana, [{ phrase: 4, at: 5, length: 2, reading: 'おも' }]);
  assert.deepEqual(built.notes, [{ phrase: 4, at: 7, length: 1, reading: 'お' }]);
  assert.deepEqual(built.stretches, [{ phrase: 4, after: 5 }]);
});

// 54番は、四句の「けふ」が札ごとの例外である。一覧の読みと印の位置は、例外を当てる前の発音「きょー」で数える。
const lines54 = {
  upperText: 'わすれじのゆくすゑまではかたければ',
  upperKana: 'わすれじのゆくすゑまではかたければ',
  lowerText: '今日をかぎりの命ともがな',
  lowerKana: 'けふをかぎりのいのちともがな',
};
const listLine = (plain: string, reading: string, extra: Partial<ListLine> = {}): ListLine => ({ plain, marked: plain, reading, marks: [], rubies: [], alternative: null, ...extra });
const list54: ListCard = {
  no: 54,
  page: 8,
  upper: listLine('わすれじのゆくすゑまではかたければ', 'わすれじのゆくすえまでわかたければ'),
  lower: listLine('今日をかぎりの命ともがな', 'きょーおかぎりのいのちともがな', {
    marks: [4, 8, 12],
    rubies: [
      { start: 0, text: 'きょー', base: '今日' },
      { start: 8, text: 'いのち', base: '命' },
    ],
  }),
  yoin: true,
};

test('例外のある句の発音は、一覧の表記を当てたあとに例外の発音にし、伸ばす位置とふりがなの位置は当てる前と同じに置く', () => {
  const built = buildCard(54, lines54, [], list54);
  assert.equal(built.phrases[3].sound, 'きょおかぎりの');
  assert.deepEqual(built.phrases[3].diffs, [
    { at: 0, kana: 'けふ', sound: 'きょ', rule: 'ユーザーの判断' },
    { at: 2, kana: 'を', sound: 'お', rule: 'ワ行' },
  ]);
  assert.deepEqual(built.stretches, [
    { phrase: 3, after: 3 },
    { phrase: 3, after: 7 },
    { phrase: 4, after: 4 },
  ]);
  assert.deepEqual(built.furigana, [
    { phrase: 3, at: 0, length: 2, reading: 'きょー' },
    { phrase: 4, at: 0, length: 3, reading: 'いのち' },
  ]);
});

test('照合では、例外の所を一覧の表記を当てた発音に戻して一覧と比べる', () => {
  const card: Card = { ...buildCard(54, lines54, [], list54), kimariji: null };
  const result = compareWithList([card], [list54]);
  assert.deepEqual([...result.textMismatches, ...result.soundMismatches, ...result.stretchMismatches, ...Object.values(result.notationMismatches).flat()], []);
  assert.deepEqual(result.notation, { furigana: 2, notes: 0, alternatives: 0, yoin: 1 });
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

test('照合で4列を移せない行は、止まらずに不一致として数え、一覧の本文の字を出さない', () => {
  const phrases = [phrase('あはれとも'), phrase('いふべきひとは', [0, 4]), phrase('おもほえで'), phrase('けふをかぎりの'), phrase('いのちともがな')];
  const card: Card = {
    no: 45,
    phrases,
    kimariji: null,
    ruleStretches: [],
    stretches: [],
    marked: { upper: '', lower: '' },
    furigana: [],
    notes: [],
    alternatives: [],
    yoin: { phrase: 4, after: 7 },
    origin: {
      text: { source: 'csv', fixes: [] },
      sound: { basis: 'rules', checkedWith: 'list', kept: [] },
      ruleStretches: { source: 'rules' },
      stretches: { source: 'list', page: 5 },
      notation: { source: 'booklet', page: 5, readFrom: 'list' },
    },
  };
  const line = (plain: string, reading: string, extra: Partial<ListLine> = {}): ListLine => ({
    plain,
    marked: plain,
    reading,
    marks: [],
    rubies: [],
    alternative: null,
    ...extra,
  });
  const list: ListCard = {
    no: 45,
    page: 5,
    upper: line('あはれともいふべき犬を思ほえで', 'あわれともゆうべきひとわおもおえで', {
      rubies: [{ start: 9, text: 'ひとわ', base: '犬を' }],
      alternative: 'あわれともーゆー',
    }),
    lower: line('けふをかぎりのいのちともがな', 'きょうおかぎりのいのちともがな', { rubies: [{ start: 0, text: 'き', base: 'け' }] }),
    yoin: true,
  };
  const result = compareWithList([card], [list]);
  assert.deepEqual(result.notationMismatches.furigana, ['45 番の上の句', '45 番の下の句']);
  assert.deepEqual(result.notationMismatches.alternatives, ['45 番の上の句']);
  assert.doesNotMatch(JSON.stringify(result), /犬/);
});
