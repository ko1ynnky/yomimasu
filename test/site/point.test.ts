import assert from 'node:assert/strict';
import { test } from 'node:test';
import { themeTocHtml } from '../../site/point.ts';

const PAGE = [
  '<h2>知っておきたいポイントを、テーマごとに。</h2>',
  '<!-- テーマの目次 -->',
  '<h3 id="t-yoin">1組と、余韻と間</h3>',
  '<div class="card pts">',
  '<details class="pt"><summary>A</summary><div class="pt-body"><p>a</p></div></details>',
  '<details class="pt" id="yoin-oto"><summary>B</summary><div class="pt-body"><details class="more" id="yoin-n"><summary>ん</summary></details></div></details>',
  '</div>',
  '<h3 id="t-kana">仮名の読み方</h3>',
  '<div class="card pts">',
  '<details class="pt"><summary>C</summary></details>',
  '</div>',
  '<p class="fine">出典は…</p>',
].join('\n');

const links = (html: string) => [...html.matchAll(/<a href="#([^"]+)">([^<]+)<small>(\d+)<\/small><\/a>/g)].map(([, id, name, count]) => [id, name, Number(count)]);

test('目次は、テーマの見出しの順に、その見出しへのリンクと名前を出す', () => {
  assert.deepEqual(
    links(themeTocHtml(PAGE)).map(([id, name]) => [id, name]),
    [
      ['t-yoin', '1組と、余韻と間'],
      ['t-kana', '仮名の読み方'],
    ],
  );
});

test('目次の数は、そのテーマの見出しの下のたたんだ行の数で、行の中の折りたたみは数えない', () => {
  assert.deepEqual(
    links(themeTocHtml(PAGE)).map(([, , count]) => count),
    [2, 1],
  );
});

test('目次は「テーマ」という名前のナビゲーションのカードである', () => {
  assert.match(themeTocHtml(PAGE), /^<nav class="card toc" aria-label="テーマ">[\s\S]*<\/nav>$/);
});

test('テーマの見出しがなければ、組み立てを止める', () => {
  assert.throws(() => themeTocHtml('<h2>見出し</h2>'), /テーマの見出し/);
});
