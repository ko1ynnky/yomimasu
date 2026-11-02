import assert from 'node:assert/strict';
import { test } from 'node:test';
import { outputPathOf, parseSource, renderDocument } from '../../site/render.ts';

test('Markdown の先頭からタイトルを取り出し、本文と分ける', () => {
  assert.deepEqual(parseSource('---\ntitle: 総論\n---\n\n本文です。\n'), { title: '総論', markdown: '\n本文です。\n' });
});

test('タイトルのない Markdown は組み立てを止める', () => {
  assert.throws(() => parseSource('本文だけです。\n'), /title/);
});

test('入口のファイルはサイトの入口になる', () => {
  assert.equal(outputPathOf('index.md'), 'index.html');
});

test('ほかのファイルは固有の URL を持つ', () => {
  assert.equal(outputPathOf('kaku/001.md'), 'kaku/001/index.html');
});

test('HTML には本文が入るので、JS なしで読める', () => {
  const html = renderDocument({ title: '総論', bodyHtml: '<p>本文です。</p>', scriptPath: '/assets/main.js' });
  assert.match(html, /<html lang="ja">/);
  assert.match(html, /<main><p>本文です。<\/p><\/main>/);
  assert.match(html, /<script type="module" src="\/assets\/main.js">/);
});

test('タイトルの記号は HTML として解釈させない', () => {
  const html = renderDocument({ title: '<b>&"', bodyHtml: '', scriptPath: '/assets/main.js' });
  assert.match(html, /<title>&lt;b&gt;&amp;&quot;<\/title>/);
});
