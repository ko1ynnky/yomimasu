import assert from 'node:assert/strict';
import { test } from 'node:test';
import deck from '../../.claude/skills/yomimasu/assets/cards.json' with { type: 'json' };
import type { Card } from '../../.claude/skills/yomimasu/scripts/cards.ts';
import { pairLines } from '../../site/client/lyrics.ts';
import { segmentsOf, type Pair } from '../../site/client/pair.ts';
import { timeLyrics, type Glyph, type Notation } from '../../site/client/timing.ts';

const cards = deck.cards as unknown as Card[];
const timed = (pair: Pair, notation: Notation = 'kanji') => timeLyrics(pairLines(cards, pair), segmentsOf(pair), notation);
const READ = { shimo: 81, kami: 45 };

const text = (lines: Glyph[][]) => lines.map((line) => line.map((glyph) => glyph.text).join(''));
const sec = (glyph: Glyph) => glyph.to - glyph.at;
const close = (actual: number, expected: number, message?: string) => assert.ok(Math.abs(actual - expected) < 1e-9, `${message ?? ''} ${actual} ≠ ${expected}`);

test('下の句は最後の字を除いて 0〜5秒、上の句は 9〜15秒に、字を隙間なく並べる', () => {
  for (const notation of ['kanji', 'kana'] as const) {
    const { shimo, kami } = timed(READ, notation);
    for (const [lines, from, to] of [
      [shimo, 0, 5],
      [kami, 9, 15],
    ] as const) {
      const glyphs = lines.flat();
      close(glyphs[0].at, from, notation);
      close(glyphs.at(-1)!.to, to, notation);
      glyphs.slice(1).forEach((glyph, i) => close(glyph.at, glyphs[i].to, `${notation} ${glyph.text}`));
    }
  }
});

test('下の句の最後の字は、余韻の始まりの 5.0秒から、重み1つ分で読む', () => {
  const { shimo, last } = timed(READ);
  assert.equal(last.text, 'る');
  assert.equal(last.at, 5);
  close(sec(last), sec(shimo[0][0]));
  assert.deepEqual(text(shimo), ['ただー有明のー', '月ぞ残ーれ']);
});

test('字の時間は字数で等分せず、拍の数で割り振る。伸ばす印は2拍に数える', () => {
  const { shimo, kami } = timed(READ);
  const [ta] = shimo[0];
  const of = (lines: Glyph[][], target: string) => lines.flat().find((glyph) => glyph.text === target)!;
  close(sec(of(shimo, 'ー')), 2 * sec(ta));
  close(sec(of(shimo, '有明')), 4 * sec(ta));
  close(sec(of(shimo, '月')), 2 * sec(ta));
  // 81番の下の句は、る を除いて12字、19拍である。字数で等分すると、1字 5/12 秒になる。
  close(sec(ta), 5 / 19);
  // 45番の上の句は25拍で、人（ひと）は2拍である。
  close(sec(of(kami, '人')), (2 * 6) / 25);
});

test('拗音の小さい字は前の字と1拍に数え、かなの表記でも前の字と一緒に進める', () => {
  // 2番の下の句の「てふ」は「ちょう」と読み、2拍である。
  const kanji = timed({ shimo: 2, kami: 1 }).shimo.flat();
  const tefu = kanji.find((glyph) => glyph.text === 'てふ')!;
  const su = kanji.find((glyph) => glyph.text === 'す')!;
  close(sec(tefu), 2 * sec(su));

  const kana = timed({ shimo: 2, kami: 1 }, 'kana').shimo.flat();
  const at = kana.findIndex((glyph) => glyph.text === 'ちょ');
  assert.deepEqual(
    kana.slice(at, at + 2).map((glyph) => glyph.text),
    ['ちょ', 'う'],
  );
  close(sec(kana[at]), sec(kana.find((glyph) => glyph.text === 'す')!));
});

test('句の中の行の分かれ目は時刻に関わらず、句全体で割り振る', () => {
  const { shimo, kami } = timed(READ);
  // 81番の下の句の1行目は11拍なので、2行目は 5秒の半分ではなく 11/19 の所から始まる。
  close(shimo[1][0].at, (5 * 11) / 19);
  // 45番の上の句の1行目は7拍である。
  close(kami[1][0].at, 9 + (6 * 7) / 25);
});

test('余韻の印は、最後の字を読み終えてから 7.0秒までを保ち、7.0〜8.0秒で弱める', () => {
  const { last, yoin } = timed(READ);
  assert.deepEqual(yoin, { from: last.to, hold: 7, to: 8 });
});

test('間の 8〜9秒には、塗る字を置かない', () => {
  for (const notation of ['kanji', 'kana'] as const) {
    const { shimo, last, kami } = timed(READ, notation);
    const inMa = [...shimo.flat(), last, ...kami.flat()].filter((glyph) => glyph.at < 9 && glyph.to > 8);
    assert.deepEqual(inMa, [], notation);
  }
});

test('かなの表記は、ふりがなのある字をふりがなの音で、伸ばす印はそのまま出す', () => {
  const { shimo, last, kami } = timed(READ, 'kana');
  assert.deepEqual(text(shimo), ['ただーありあけのー', 'つきぞのこーれ']);
  assert.equal(last.text, 'る');
  assert.deepEqual(text(kami), ['あわれともー', 'ゆうべきひとわー', 'おもおえーでー']);
  assert.ok([...shimo, ...kami].flat().every((glyph) => glyph.ruby === undefined));
  assert.deepEqual(
    shimo[0].filter((glyph) => glyph.nobi).map((glyph) => glyph.text),
    ['ー', 'ー'],
  );
});

test('かなの表記では、読みが2拍以上の字を1拍ずつに分けて時間を等分する。最後の字が1拍の組では、どの字の時刻も漢字の表記と同じになる', () => {
  const kanji = timed(READ, 'kanji');
  const kana = timed(READ, 'kana');
  const ariake = kanji.shimo[0].find((glyph) => glyph.text === '有明')!;
  const split = kana.shimo[0].slice(3, 7);
  assert.deepEqual(
    split.map((glyph) => glyph.text),
    ['あ', 'り', 'あ', 'け'],
  );
  close(split[0].at, ariake.at);
  close(split[3].to, ariake.to);
  split.forEach((glyph) => close(sec(glyph), sec(ariake) / 4));
  assert.deepEqual(kana.last, kanji.last);
  const starts = (lines: Glyph[][]) => lines.flat().map((glyph) => glyph.at);
  for (const part of ['shimo', 'kami'] as const) {
    for (const at of starts(kanji[part])) assert.ok(starts(kana[part]).some((other) => Math.abs(other - at) < 1e-9), `${part} ${at}`);
  }
});

test('下の句が漢字で終わる札は、漢字の表記ではその字を、かなの表記では最後の音だけを余韻へ移す', () => {
  // 2番は「天の香具山」で終わる。
  const kanji = timed({ shimo: 2, kami: 1 }, 'kanji');
  const kana = timed({ shimo: 2, kami: 1 }, 'kana');
  assert.equal(kanji.last.text, '山');
  assert.equal(kanji.last.ruby, 'やま');
  assert.equal(kana.last.text, 'ま');
  assert.equal(kana.shimo.at(-1)!.at(-1)!.text, 'や');
  assert.equal(kanji.last.at, 5);
  assert.equal(kana.last.at, 5);
  close(kana.shimo.flat().at(-1)!.to, 5);
});

test('どの組でも、最後の字は余韻の始まりから始まり、余韻を弱め始める前に読み終える', () => {
  for (const card of cards.filter((c) => c.no !== 0)) {
    for (const notation of ['kanji', 'kana'] as const) {
      const { last, yoin } = timed({ shimo: card.no, kami: card.no === 1 ? 2 : 1 }, notation);
      assert.equal(last.at, 5, `${card.no}番 ${notation}`);
      assert.ok(last.to < yoin.hold, `${card.no}番 ${notation}`);
    }
  }
});
