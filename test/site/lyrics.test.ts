import assert from 'node:assert/strict';
import { test } from 'node:test';
import deck from '../../.claude/skills/yomimasu/assets/cards.json' with { type: 'json' };
import type { Card } from '../../.claude/skills/yomimasu/scripts/cards.ts';
import { lineText, pairLines, secondShimoLineAt, tapCharOf, type Line } from '../../site/client/lyrics.ts';

const cards = deck.cards as unknown as Card[];

// 見本の書き方に合わせ、ふりがなは {字|読み} で書く。
const withRuby = (line: Line) => line.map((token) => (token.ruby ? `{${token.text}|${token.ruby}}` : token.text)).join('');

test('1組の歌詞は、前の札の下の句2行と次の札の上の句3行に、伸ばす印を置いて並べる', () => {
  const lines = pairLines(cards, { shimo: 77, kami: 29 });
  assert.deepEqual(
    { shimo: lines.shimo.map(lineText), kami: lines.kami.map(lineText) },
    { shimo: ['われてもー末にー', '逢はむとぞー思ふ'], kami: ['心あてにー', '折らばや折らむー', '初霜ーのー'] },
  );
});

test('漢字には読みを、発音の違う仮名にはその字だけに、実際の発音を振る', () => {
  const lines = pairLines(cards, { shimo: 81, kami: 45 });
  assert.deepEqual(lines.shimo.map(withRuby), ['ただー{有明|ありあけ}のー', '{月|つき}ぞ{残|のこ}ーれる']);
  assert.deepEqual(lines.kami.map(withRuby), ['あ{は|わ}れともー', '{い|ゆ}{ふ|ー}べき{人|ひと}{は|わ}ー', '{思|おも}{ほ|お}えーでー']);
});

test('仮名と発音の字数が違うところは、まとめて1つの読みを振る', () => {
  const lines = pairLines(cards, { shimo: 2, kami: 1 });
  assert.equal(withRuby(lines.shimo[0]), '{衣|ころも}ー{干|ほ}す{てふ|ちょー}ー');
});

test('伸ばす印は、ふりがなを付けない印として置く', () => {
  const [first] = pairLines(cards, { shimo: 81, kami: 45 }).shimo;
  assert.deepEqual(
    first.filter((token) => token.nobi).map((token) => token.text),
    ['ー', 'ー'],
  );
  assert.ok(first.filter((token) => token.nobi).every((token) => token.ruby === undefined));
});

test('行をつなぐと、札の表の伸ばす印を置いた本文と同じになる', () => {
  for (const card of cards.filter((c) => c.no !== 0)) {
    const other = card.no === 1 ? 2 : 1;
    const { shimo } = pairLines(cards, { shimo: card.no, kami: other });
    const { kami } = pairLines(cards, { shimo: other, kami: card.no });
    assert.equal(shimo.map(lineText).join(''), card.marked.lower, `${card.no}番の下の句`);
    assert.equal(kami.map(lineText).join(''), card.marked.upper, `${card.no}番の上の句`);
  }
});

test('ふりがなは、読手テキストの一覧のふりがなの「ー」と注のとおりになる', () => {
  // 77番の「思ふ」は、一覧の注が（お）である。
  assert.equal(withRuby(pairLines(cards, { shimo: 77, kami: 29 }).shimo[1]), '{逢|あ}{は|わ}{む|ん}とぞー{思|おも}{ふ|お}');
  assert.equal(withRuby(pairLines(cards, { shimo: 10, kami: 1 }).shimo[1]), '{逢坂|おーさか}のー{関|せき}');
  // 44番の「逢ふ」は、漢字の「逢」と仮名の「ふ」にまたがる。一覧は「逢」に「お」と振り、「ふ」に（お）の注を付ける。
  assert.equal(withRuby(pairLines(cards, { shimo: 1, kami: 44 }).kami[0]), '{逢|お}{ふ|お}ことのー');
  assert.equal(withRuby(pairLines(cards, { shimo: 81, kami: 45 }).kami[1]), '{い|ゆ}{ふ|ー}べき{人|ひと}{は|わ}ー');
  assert.equal(withRuby(pairLines(cards, { shimo: 2, kami: 1 }).shimo[0]), '{衣|ころも}ー{干|ほ}す{てふ|ちょー}ー');
});

test('54番の四句の「今日」は、一覧のふりがなの「きょー」に代えて、ユーザーの判断で「きょ」と振る', () => {
  const [fourth] = pairLines(cards, { shimo: 54, kami: 1 }).shimo;
  assert.deepEqual(fourth, [
    { text: '今日', ruby: 'きょ' },
    { text: 'を', ruby: 'お' },
    { text: 'ー', nobi: true },
    { text: 'か' },
    { text: 'ぎ' },
    { text: 'り' },
    { text: 'の' },
    { text: 'ー', nobi: true },
  ]);
  // 伸ばす印の前は「きょお」の2拍である。
  assert.equal(fourth.map((token) => token.ruby ?? token.text).join(''), 'きょおーかぎりのー');
});

test('どの札でも、伸ばす印を除いて読みと仮名をつなぐと、札の表の発音と字のとおり同じになる', () => {
  const sounds = (line: Line) => line.filter((token) => !token.nobi).map((token) => token.ruby ?? token.text).join('');
  for (const card of cards.filter((c) => c.no !== 0)) {
    const other = card.no === 1 ? 2 : 1;
    const { shimo } = pairLines(cards, { shimo: card.no, kami: other });
    const { kami } = pairLines(cards, { shimo: other, kami: card.no });
    assert.deepEqual([...kami, ...shimo].map(sounds), card.phrases.map((p) => p.sound), `${card.no}番`);
  }
});

// 伸ばす印は「ー」、余韻の印は「▼」で書く。
const withMarks = (line: Line) => line.map((token) => (token.yoin ? '▼' : token.text)).join('');
const withYoin = (no: number, yoin: Card['yoin']) => cards.map((card) => (card.no === no ? { ...card, yoin } : card));

test('余韻の印は、札の読みの表の余韻の印の位置に置く', () => {
  assert.deepEqual(pairLines(cards, { shimo: 81, kami: 45 }).shimo.map(withMarks), ['ただー有明のー', '月ぞ残ーれる▼']);
  // 表の位置を動かすと、印もその位置へ動く。漢字のかたまりの後ろと、仮名の字の間のどちらにも置ける。
  assert.deepEqual(pairLines(withYoin(81, { phrase: 4, after: 3 }), { shimo: 81, kami: 45 }).shimo.map(withMarks), ['ただー有明のー', '月ぞ▼残ーれる']);
  assert.deepEqual(pairLines(withYoin(81, { phrase: 4, after: 6 }), { shimo: 81, kami: 45 }).shimo.map(withMarks), ['ただー有明のー', '月ぞ残ーれ▼る']);
});

test('表に余韻の印がない札には、余韻の印を置かない', () => {
  const lines = pairLines(withYoin(81, null), { shimo: 81, kami: 45 });
  assert.ok([...lines.shimo, ...lines.kami].flat().every((token) => !token.yoin));
});

test('どの組でも、余韻の印は前の札の下の句の最後に1つだけ置き、次の札の上の句には置かない', () => {
  // 表の余韻の印は、序歌と100首のどれも下の句の終わりを指す。
  for (const card of cards.filter((c) => c.no !== 0)) {
    const lines = pairLines(cards, { shimo: card.no, kami: card.no === 1 ? 2 : 1 });
    assert.deepEqual([...lines.shimo, ...lines.kami].flat().filter((token) => token.yoin).length, 1, `${card.no}番`);
    assert.ok(lines.shimo.at(-1)!.at(-1)!.yoin, `${card.no}番`);
  }
});

test('余韻で押す字は、下の句の最後の字である', () => {
  assert.equal(tapCharOf(pairLines(cards, { shimo: 81, kami: 45 })), 'る');
});

test('下の句が漢字で終わる札では、余韻で押す字を最後の音の仮名で示す', () => {
  // 2番は「天の香具山」で終わる。余韻は最後の音「ま」から始まるので、「山」で押すと1音早くなる。
  assert.equal(tapCharOf(pairLines(cards, { shimo: 2, kami: 1 })), 'ま');
});

test('下の句が発音の違う仮名で終わる札では、余韻で押す字を聞こえる最後の音で示す', () => {
  // 77番は「思ふ」で終わり、「おもお」と振る。「ふ」で押すよう案内すると、聞こえる音と食い違う。
  assert.equal(tapCharOf(pairLines(cards, { shimo: 77, kami: 29 })), 'お');
});

test('どの札でも、余韻で押す字は、ふりがなを含めて下の句の最後に聞こえる音である', () => {
  for (const card of cards.filter((c) => c.no !== 0)) {
    const lines = pairLines(cards, { shimo: card.no, kami: card.no === 1 ? 2 : 1 });
    const heard = lines.shimo.at(-1)!.filter((token) => !token.nobi).map((token) => token.ruby ?? token.text).join('');
    assert.equal(tapCharOf(lines), heard.at(-1), `${card.no}番`);
  }
});

test('下の句の2行目の始まりは、下の句の標準の秒数を2行の字数で分けた位置にする', () => {
  // 81番は「ただー有明のー」7字と「月ぞ残ーれる」6字である。
  assert.equal(secondShimoLineAt(pairLines(cards, { shimo: 81, kami: 45 }), 5), (5 * 7) / 13);
});
