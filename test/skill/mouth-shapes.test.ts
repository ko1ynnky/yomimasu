import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import deck from '../../.claude/skills/yomimasu/assets/cards.json' with { type: 'json' };
import type { Card } from '../../.claude/skills/yomimasu/scripts/cards.ts';
import { FINAL_SOUNDS, nasalEndings, SHAPES } from '../../content/karuta/mouth.ts';

// スキルの mouth-shapes.md は配る先でビルドされないので、札の数を書き写している。表と食い違わないよう、ここで照らす。
const cards = deck.cards as unknown as Card[];
const markdown = readFileSync('.claude/skills/yomimasu/references/mouth-shapes.md', 'utf8');

function section(heading: string): string {
  const part = markdown.split(/^## /m).find((p) => p.startsWith(heading));
  if (!part) throw new Error(`mouth-shapes.md に「${heading}」の節がない`);
  return part;
}

const rows = (text: string) =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('|'))
    .slice(2)
    .map((line) => line.slice(1, -1).split('|').map((cell) => cell.trim()));

test('「ん」で終わる札の表は、札の読みの表から数えたまとまりと一致する', () => {
  const table = rows(section('序歌と100首の「ん」で終わる札')).map(([ending, vowel, list]) => ({ ending, vowel, list }));
  assert.deepEqual(
    table,
    nasalEndings(cards).map((g) => ({ ending: g.ending, vowel: g.vowel, list: g.cards.map((c) => c.no).sort((a, b) => a - b).join('、') })),
  );
});

test('合計と前の母音ごとの数の文は、札の読みの表から数えた数と一致する', () => {
  const groups = nasalEndings(cards);
  const text = section('序歌と100首の「ん」で終わる札');
  assert.ok(text.includes(`合わせて${groups.reduce((sum, g) => sum + g.cards.length, 0)}首`));
  const byVowel = new Map<string, number>();
  for (const g of groups) byVowel.set(g.vowel, (byVowel.get(g.vowel) ?? 0) + g.cards.length);
  for (const [vowel, count] of byVowel) assert.ok(text.includes(`「${vowel}」が${count}首`), `「${vowel}」が${count}首`);
});

test('「ん」で終わる札は、どれも結句の仮名が「む」で終わる', () => {
  for (const c of nasalEndings(cards).flatMap((g) => g.cards)) assert.ok(c.phrases[4].kana.endsWith('む'), `${c.no}番`);
});

test('保つ所の表は、教科書の図の「保つ」と同じことを書く', () => {
  const table = rows(section('このアプリの解釈')).map(([sound, keep]) => ({ sound, keep }));
  assert.deepEqual(
    table,
    FINAL_SOUNDS.map((sound) => ({ sound, keep: SHAPES[sound].keep })),
  );
});
