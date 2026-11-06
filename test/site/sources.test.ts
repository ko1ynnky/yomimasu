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
