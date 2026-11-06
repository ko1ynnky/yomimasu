import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { marked } from 'marked';
import deck from '../../.claude/skills/yomimasu/assets/cards.json' with { type: 'json' };
import type { Card } from '../../.claude/skills/yomimasu/scripts/cards.ts';
import { cardPage, parseAdvice } from '../../site/karuta.ts';
import { parseSource } from '../../site/render.ts';

const cards = deck.cards as unknown as Card[];
const advice = parseAdvice(readFileSync('.claude/skills/yomimasu/references/card-advice-candidates.md', 'utf8'));
const markdownOf = (name: string) => parseSource(readFileSync(`content/${name}`, 'utf8')).markdown;
const SOURCES_LINE = '<p class="fine">出典と、読手メモの扱いは<a href="/about/#sources">このアプリについて</a>にまとめています。</p>';

test('総論と最低限これだけは、出典の節を置かず、出典と読手メモの扱いを「このアプリについて」へ案内する1行を置く', () => {
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
// 同じ日に、総論と最低限これだけ（と1首のページ）の印も同じ形にそろえた。総論の本文中の括弧の出典と、一覧のカードの下の印は変えない。
const marksIn = (html: string) => [...html.matchAll(/<span class="src"(?: data-ref="([^"]+)")?>— ([^<]+)<\/span>(<\/p>)?/g)].map(([, ref, label, end]) => ({ ref, label, atEnd: end !== undefined }));
const pointMarks = () => marksIn(markdownOf('ポイント.md')).map(({ ref, label }) => ({ ref, label }));

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
  const sources = about.split('<h2 id="sources">')[1];
  const memo = about.split('<h3 id="src-memo">')[1].split('<h3 ')[0];
  const author = about.split('<h3 id="src-author">')[1].split('<h3 ')[0];
  assert.doesNotMatch(sources, /読手のメモ1 要点2/, 'メモの番号の印は、教科書のどのページにももう出ない');
  assert.match(memo, /教科書のページでは、段落の終わりに「— 読手メモより」とだけ付けます。/);
  assert.doesNotMatch(memo, /「ポイントを知る」では/);
  assert.match(memo, /大会向け/);
  assert.match(memo, /参考程度/);
  assert.match(memo, /協会の基準ではなく/);
  assert.match(author, /作者の実体験より/);
});

test('総論と最低限これだけは、読手のメモの断りを見出しにも項目ごとにも書かない', () => {
  for (const name of ['総論.md', '最低限これだけ.md']) assert.doesNotMatch(markdownOf(name), /読手個人のやり方|読手のメモから|参考程度|メモは協会の基準ではなく/, name);
});

test('最低限これだけの4項目の印は、別の行にせず本文の段落の終わりに付け、読手メモはメモの番号と節を data-ref に残す', () => {
  const markdown = markdownOf('最低限これだけ.md');
  assert.doesNotMatch(markdown, /<p class="src">/);
  assert.deepEqual(marksIn(markdown), [
    { ref: '読手のメモ1 要点1', label: '冊子 p.27、講習資料 s.15、読手メモより', atEnd: true },
    { ref: '読手のメモ1 要点2', label: '講習資料 s.9、s.15-16、読手メモより', atEnd: true },
    { ref: undefined, label: '講習資料 s.15-16、s.21、冊子 p.25', atEnd: true },
    { ref: undefined, label: '講習資料 s.15', atEnd: true },
  ]);
});

test('総論の読手のメモの文は、話題の合う節の段落にし、段落の終わりに「— 読手メモより」と付ける', () => {
  const markdown = markdownOf('総論.md');
  const section = (heading: string) => markdown.split(/^## /m).find((part) => part.startsWith(heading)) ?? '';
  assert.deepEqual(marksIn(section('4つのうち、余韻と間をとくにそろえる')), [{ ref: '読手のメモ1 要点2、読手のメモ2 2-2', label: '読手メモより', atEnd: true }]);
  assert.deepEqual(marksIn(section('余韻：最後の音を伸ばして、すっと消す')), [{ ref: '読手のメモ2 最後に', label: '読手メモより', atEnd: true }]);
  assert.equal(marksIn(markdown).length, 2);
});

test('総論の読手メモの段落は、Markdown の組み立てで段落の中や箇条の中に入らず、1つの段落のまま出る', async () => {
  const html = await marked.parse(markdownOf('総論.md'));
  for (const start of ['余韻3秒と間1秒は', '余韻のあいだは']) {
    assert.match(html, new RegExp(`(?:^|\\n|</p>|</ul>)<p>${start}[^<]*<span class="src" data-ref="[^"]+">— 読手メモより</span></p>(?!</li>|</p>)`), start);
  }
});
