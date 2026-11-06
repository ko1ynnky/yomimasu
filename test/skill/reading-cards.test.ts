import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import deck from '../../.claude/skills/yomimasu/assets/cards.json' with { type: 'json' };
import type { Card } from '../../.claude/skills/yomimasu/scripts/cards.ts';
import { readingCards, selectCards } from '../../.claude/skills/yomimasu/scripts/reading-cards.ts';

const cards = deck.cards as unknown as Card[];
const byNo = (no: number) => cards.find((card) => card.no === no)!;

test('「た」を渡すと、決まり字が「た」で始まる6首を番号の順に選ぶ', () => {
  assert.deepEqual(
    selectCards(cards, ['た']).map((card) => card.no),
    [4, 16, 34, 55, 73, 89],
  );
});

test('た札の読み札には、6首の本文が表の句のとおりに並ぶ', () => {
  const output = readingCards(deck, ['た']);
  const headings = output.match(/^## .*$/gm) ?? [];
  assert.equal(headings.length, 6);
  for (const no of [4, 16, 34, 55, 73, 89]) {
    const phrases = byNo(no).phrases;
    assert.ok(output.includes(phrases.slice(0, 3).map((p) => p.text).join('　')), `${no} 番の上の句`);
    assert.ok(output.includes(phrases.slice(3).map((p) => p.text).join('　')), `${no} 番の下の句`);
    assert.ok(output.includes(phrases.map((p) => p.kana).join('　')), `${no} 番の仮名`);
  }
});

test('札の番号でも選べ、渡した順に並ぶ。0 は序歌である', () => {
  assert.deepEqual(
    selectCards(cards, ['73', '0', '4']).map((card) => card.no),
    [73, 0, 4],
  );
});

test('同じ札を2回選んでも、読み札は1枚にする', () => {
  assert.deepEqual(
    selectCards(cards, ['た', '4']).map((card) => card.no),
    [4, 16, 34, 55, 73, 89],
  );
});

test('当たる札のない指定は、どの指定かを示して止める', () => {
  assert.throws(() => selectCards(cards, ['101']), /101/);
  assert.throws(() => selectCards(cards, ['ゑ']), /ゑ/);
  assert.throws(() => selectCards(cards, []), /札/);
});

test('読み札には、本文の出典と、再利用を認めないことが付く', () => {
  const output = readingCards(deck, ['た']);
  assert.ok(output.includes(deck.sources.csv.url));
  assert.ok(output.includes(deck.sources.csv.commit.slice(0, 7)));
  assert.match(output, /Unlicense/);
  assert.match(output, /MIT License の範囲外/);
  assert.match(output, /再利用を認めません/);
  assert.match(output, /公認を受けていません/);
  assert.doesNotMatch(output, /序歌の本文/);
});

test('序歌を選ぶと、序歌の本文の出典も付く', () => {
  assert.match(readingCards(deck, ['0']), /序歌の本文/);
});

test('コマンドで実行すると、指定した札の読み札を出す', () => {
  const output = execFileSync(process.execPath, ['.claude/skills/yomimasu/scripts/reading-cards.ts', 'た'], { encoding: 'utf8' });
  assert.equal(output, `${readingCards(deck, ['た'])}\n`);
});
