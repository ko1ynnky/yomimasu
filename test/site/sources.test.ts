import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import deck from '../../.claude/skills/yomimasu/assets/cards.json' with { type: 'json' };
import type { Card } from '../../.claude/skills/yomimasu/scripts/cards.ts';
import { cardPage, parseAdvice } from '../../site/karuta.ts';
import { parseSource } from '../../site/render.ts';

const cards = deck.cards as unknown as Card[];
const advice = parseAdvice(readFileSync('.claude/skills/yomimasu/references/card-advice-candidates.md', 'utf8'));
const markdownOf = (name: string) => parseSource(readFileSync(`content/${name}`, 'utf8')).markdown;
const SOURCES_LINE = '<p class="fine">出典は<a href="/about/#sources">このアプリについて</a>にまとめています。</p>';

test('総論と最低限これだけは、出典の節を置かず、「このアプリについて」の出典への1行を置く', () => {
  for (const name of ['総論.md', '最低限これだけ.md']) {
    const markdown = markdownOf(name);
    assert.ok(markdown.includes(SOURCES_LINE), name);
    assert.doesNotMatch(markdown, /### 出典|card sources/, name);
  }
});

test('総論の項目の出典は、資料の名前とページだけの短い印で書く', () => {
  assert.match(markdownOf('総論.md'), /<p class="src">冊子 p\.3、p\.26、講習資料 s\.8<\/p>/);
  assert.doesNotMatch(markdownOf('総論.md'), /協会の資料（/);
});

test('教科書と1首のページから「このアプリについて」へのリンクは、どれも出典の見出しに当たる', () => {
  const ids = new Set([...markdownOf('このアプリについて.md').matchAll(/ id="([^"]+)"/g)].map((m) => m[1]));
  const pages = [markdownOf('総論.md'), markdownOf('最低限これだけ.md'), ...cards.map((c) => cardPage(c, cards, advice).bodyHtml)];
  const anchors = new Set(pages.flatMap((html) => [...html.matchAll(/href="\/about\/#([^"]+)"/g)].map((m) => m[1])));
  assert.deepEqual([...anchors].sort(), ['sources', 'src-phonetics', 'src-research']);
  for (const anchor of anchors) assert.ok(ids.has(anchor), anchor);
});

// 2026-11-07 のユーザーの判断：「ポイントを知る」の項目の印は、段落の終わりに小さく付ける短い印にし、読手のメモと作者の実体験が何かの説明は「このアプリについて」に置く。
const pointMarks = () => [...markdownOf('ポイント.md').matchAll(/<span class="src"(?: data-ref="([^"]+)")?>— ([^<]+)<\/span>/g)].map(([, ref, label]) => ({ ref, label }));

test('ポイントを知るの出典の印は、段落の終わりの「— 」で始まる短い印で、別の行の印と長い断りを置かない', () => {
  const markdown = markdownOf('ポイント.md');
  assert.doesNotMatch(markdown, /<p class="src">/);
  assert.doesNotMatch(markdown, /読手個人のやり方|協会の資料でも読手のメモでもありません|ふだんの練習会では参考程度/);
  assert.ok(pointMarks().length > 0);
  for (const { label } of pointMarks()) assert.match(label, /^(冊子|講習資料|読手メモより$|読手メモ（大会向け）より$|このアプリの作者の実体験より$|このアプリの考え|「ん」の研究)/, label);
});

test('ポイントを知るの読手メモの印は、メモの番号と節を data-ref に残し、画面には「読手メモより」とだけ出す', () => {
  const memos = pointMarks().filter(({ label }) => label.startsWith('読手メモ'));
  assert.ok(memos.length > 0);
  for (const { ref, label } of memos) assert.match(ref ?? '', /^読手のメモ[12] /, label);
  for (const { ref, label } of pointMarks().filter(({ label }) => !label.startsWith('読手メモ'))) assert.equal(ref, undefined, label);
});

test('ポイントを知るの終わりの1行は、出典と、読手メモと作者の実体験の扱いを「このアプリについて」へ案内する', () => {
  assert.ok(markdownOf('ポイント.md').includes('<p class="fine">出典と、読手メモ・作者の実体験の扱いは<a href="/about/#sources">このアプリについて</a>にまとめています。</p>'));
});

test('このアプリについての読手のメモと作者の実体験の節は、教科書の短い印が何を指すかを書く', () => {
  const about = markdownOf('このアプリについて.md');
  const memo = about.split('<h3 id="src-memo">')[1].split('<h3 ')[0];
  const author = about.split('<h3 id="src-author">')[1].split('<h3 ')[0];
  assert.match(memo, /読手メモより/);
  assert.match(memo, /大会向け/);
  assert.match(memo, /参考程度/);
  assert.match(memo, /協会の基準ではなく/);
  assert.match(author, /作者の実体験より/);
});
