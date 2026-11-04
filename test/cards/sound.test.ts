import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyDiffs, soundDiffs, withListNotation, withSoundExceptions } from '../../scripts/cards/sound.ts';

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

test('長音になる綴りは、読手テキストの一覧の表記のとおり「ー」で読む', () => {
  assert.equal(read('あふことの'), 'おーことの');
  assert.equal(read('いふべき'), 'ゆーべき');
  assert.equal(read('けふここのへに'), 'きょーここのえに');
  assert.equal(read('すてふ'), 'すちょー');
  assert.equal(read('まがふ'), 'まごー');
});

test('字数の同じ長音の綴りは、1字ずつの読み替えとして返す', () => {
  assert.deepEqual(soundDiffs('いふべき', new Set([0])), [
    { at: 0, kana: 'い', sound: 'ゆ', rule: '長音' },
    { at: 1, kana: 'ふ', sound: 'ー', rule: '長音' },
  ]);
  assert.deepEqual(soundDiffs('まがふ', new Set([0])), [
    { at: 1, kana: 'が', sound: 'ご', rule: '長音' },
    { at: 2, kana: 'ふ', sound: 'ー', rule: '長音' },
  ]);
});

test('助動詞の「む」は「ん」で読み、語の頭の「む」は残す', () => {
  assert.equal(read('かもねむ'), 'かもねん');
  assert.equal(read('むかし'), 'むかし');
});

test('読み替えの箇所は、仮名の位置と規則つきで返す', () => {
  assert.deepEqual(soundDiffs('かりほ', new Set([0])), [{ at: 2, kana: 'ほ', sound: 'お', rule: '語中のハ行' }]);
  assert.deepEqual(soundDiffs('すてふ', new Set([0])), [{ at: 1, kana: 'てふ', sound: 'ちょー', rule: '長音' }]);
});

// 一覧のふりがなと注は、句の仮名の位置 at から length 字に掛かる。
const listed = (kana: string, notation: Parameters<typeof withListNotation>[2], heads: number[] = [0]) => {
  const diffs = withListNotation(kana, soundDiffs(kana, new Set(heads)), notation);
  return { sound: applyDiffs(kana, diffs), diffs };
};
const none = { furigana: [], notes: [] };

test('一覧のふりがなが「ー」の所は、規則の読み替えに代えて「ー」で読む', () => {
  const { sound, diffs } = listed('かよふ', { ...none, furigana: [{ at: 2, length: 1, reading: 'ー' }] });
  assert.equal(sound, 'かよー');
  assert.deepEqual(diffs, [{ at: 2, kana: 'ふ', sound: 'ー', rule: '一覧のふりがな' }]);
});

test('一覧の注の所は、注の字で読む', () => {
  // 77番の「思ふ」。一覧は「おも」と振り、「ふ」に（お）の注を付ける。
  const { sound, diffs } = listed('おもふ', { furigana: [{ at: 0, length: 2, reading: 'おも' }], notes: [{ at: 2, length: 1, reading: 'お' }] });
  assert.equal(sound, 'おもお');
  assert.deepEqual(diffs, [{ at: 2, kana: 'ふ', sound: 'お', rule: '一覧の注' }]);
});

test('一覧の注が規則の読み替えと同じ字なら、読み替えをそのまま残す', () => {
  // 16番の「生ふる」。一覧の注は（う）で、規則の読み替えも「う」である。
  const rule = soundDiffs('おふる', new Set([0]));
  const { sound, diffs } = listed('おふる', { ...none, notes: [{ at: 1, length: 1, reading: 'う' }] });
  assert.equal(sound, 'おうる');
  assert.deepEqual(diffs, rule);
});

test('長音の綴りの1字に注があるときは、その字だけを注の字にする', () => {
  // 44番の「逢ふ」。一覧は「逢」に「お」と振り、「ふ」に（お）の注を付ける。
  const { sound, diffs } = listed('あふことの', { furigana: [{ at: 0, length: 1, reading: 'お' }], notes: [{ at: 1, length: 1, reading: 'お' }] });
  assert.equal(sound, 'おおことの');
  assert.deepEqual(diffs, [
    { at: 0, kana: 'あ', sound: 'お', rule: '長音' },
    { at: 1, kana: 'ふ', sound: 'お', rule: '一覧の注' },
  ]);
});

test('漢字のかたまりのふりがなは、読みの字ごとに仮名の字へ当てる', () => {
  // 10番の「逢坂」は、規則の読み替えも一覧と同じ「おー」である。
  const osaka = listed('あふさかの', { ...none, furigana: [{ at: 0, length: 4, reading: 'おーさか' }] });
  assert.equal(osaka.sound, 'おーさかの');
  assert.deepEqual(osaka.diffs, soundDiffs('あふさかの', new Set([0])));
  // 60番の「遠ければ」は、規則では「とお」、一覧では「とー」である。
  const far = listed('とほければ', { ...none, furigana: [{ at: 0, length: 2, reading: 'とー' }] });
  assert.equal(far.sound, 'とーければ');
  assert.deepEqual(far.diffs, [{ at: 1, kana: 'ほ', sound: 'ー', rule: '一覧のふりがな' }]);
});

test('規則で読み替えない字に一覧の「ー」があるときは、読み替えを足す', () => {
  const { sound, diffs } = listed('さう', { ...none, furigana: [{ at: 0, length: 2, reading: 'さー' }] });
  assert.equal(sound, 'さー');
  assert.deepEqual(diffs, [{ at: 1, kana: 'う', sound: 'ー', rule: '一覧のふりがな' }]);
});

test('字数の変わる読み替えも、一覧と同じ字なら、そのまま残す', () => {
  // 61番の「けふ」。一覧も「きょー」と振る。
  const { sound, diffs } = listed('けふここのへに', { ...none, furigana: [{ at: 0, length: 2, reading: 'きょー' }] });
  assert.equal(sound, 'きょーここのえに');
  assert.deepEqual(diffs, soundDiffs('けふここのへに', new Set([0])));
});

test('字数の変わる読み替えの途中で一覧と食い違うときは止まる', () => {
  // 一覧の注は1字ずつ当てるので、「てふ」→「ちょー」の途中の字だけを代えられない。
  assert.throws(() => listed('すてふ', { ...none, notes: [{ at: 1, length: 2, reading: 'ちょう' }] }), /読み替えの途中/);
});

test('一覧の読みの字数が、掛かる範囲の発音の字数と合わないときは止まる', () => {
  assert.throws(() => listed('かよふ', { ...none, furigana: [{ at: 2, length: 1, reading: 'ーう' }] }), /字数/);
  assert.throws(() => listed('おもふ', { ...none, notes: [{ at: 1, length: 2, reading: 'も' }] }), /字数/);
});

// 54番の四句の「けふ」は、一覧のふりがなの「きょー」に代えて、ユーザーの判断で「きょ」と読む。
const kyo = { at: 0, kana: 'けふ', listed: 'きょー', sound: 'きょ' };

test('札ごとの例外の所は、一覧の表記を当てた読み替えに代えて例外の発音で読み、字数が変わってよい', () => {
  const diffs = withSoundExceptions(soundDiffs('けふを', new Set([0])), [kyo]);
  assert.equal(applyDiffs('けふを', diffs), 'きょお');
  assert.deepEqual(diffs, [
    { at: 0, kana: 'けふ', sound: 'きょ', rule: 'ユーザーの判断' },
    { at: 2, kana: 'を', sound: 'お', rule: 'ワ行' },
  ]);
});

test('例外の所の読み替えが、例外の仮名と一覧の表記を当てた発音に合わないときは止まる', () => {
  const rule = soundDiffs('けふを', new Set([0]));
  assert.throws(() => withSoundExceptions(rule, [{ ...kyo, listed: 'きょう' }]), /例外/);
  assert.throws(() => withSoundExceptions(rule, [{ ...kyo, kana: 'てふ' }]), /例外/);
  assert.throws(() => withSoundExceptions(rule, [{ ...kyo, at: 1 }]), /例外/);
});
