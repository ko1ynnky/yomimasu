import assert from 'node:assert/strict';
import { test } from 'node:test';
import { outputPathOf, parseSource, renderDocument } from '../../site/render.ts';

test('Markdown の先頭からタイトルを取り出し、本文と分ける', () => {
  assert.deepEqual(parseSource('---\ntitle: 総論\n---\n\n本文です。\n'), { title: '総論', markdown: '\n本文です。\n' });
});

test('Markdown の先頭から、読んだ行に出す知識のファイルの名前を読む', () => {
  assert.equal(parseSource('---\ntitle: 総論\ncommand: 総論を学ぶ\nread: 総論.md\n---\n本文\n').readName, '総論.md');
  assert.equal(parseSource('---\ntitle: 結果\ncommand: 結果を見る\n---\n本文\n').readName, undefined);
});

test('Markdown の先頭から、ボタンが打ち込むコマンドと道具の画面かどうかを読む', () => {
  assert.deepEqual(parseSource('---\ntitle: 読む\ncommand: 読む 77番 29番\ntool: true\n---\n本文\n'), {
    title: '読む',
    command: '読む 77番 29番',
    tool: true,
    markdown: '本文\n',
  });
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

const page = { title: '総論', bodyHtml: '<p>本文です。</p>', scriptPath: '/assets/main.js', stylePaths: ['/assets/main.css'] };

test('HTML には本文が入るので、JS なしで読める', () => {
  const html = renderDocument(page);
  assert.match(html, /<html lang="ja">/);
  assert.match(html, /<div class="screen"><p>本文です。<\/p><section class="ask">/);
  assert.match(html, /<script type="module" src="\/assets\/main.js">/);
});

test('すべてのページが共通の見た目の CSS を読み込み、明るい配色だけを使う', () => {
  const html = renderDocument(page);
  assert.match(html, /<link rel="stylesheet" href="\/assets\/main.css">/);
  assert.match(html, /<meta name="color-scheme" content="light">/);
});

test('上の帯から入口へ戻れる', () => {
  assert.match(renderDocument(page), /<header class="bar"><a href="\/">\/yomimasu<\/a>/);
});

test('コマンドのあるページは、実行の行と読んだファイルの行を本文の上に出す', () => {
  const html = renderDocument({ ...page, command: '総論を学ぶ', readName: '総論.md' });
  assert.match(html, /<div class="screen"><div class="run"><div><span class="gt">&gt;<\/span> \/yomimasu 総論を学ぶ<\/div><div class="read">● Read 総論.md<\/div><\/div><p>本文です。<\/p>/);
});

test('入口には実行の行がない', () => {
  assert.doesNotMatch(renderDocument(page), /class="run"/);
});

test('道具の画面は、入力の行を出さず、間を詰めて1画面に収める', () => {
  assert.match(renderDocument(page), /<div class="ask-line">/);
  const tool = renderDocument({ ...page, command: '読む 77番 29番', tool: true });
  assert.doesNotMatch(tool, /class="ask-line"/);
  assert.match(tool, /<div class="screen screen--stage">/);
});

test('本文の <!-- ask --> から後ろは、入力の行の下に次の操作として置く', () => {
  const html = renderDocument({ ...page, bodyHtml: '<p>本文</p>\n<!-- ask -->\n<p><a href="/read/">まず1回読む</a></p>' });
  assert.match(html, /<p>本文<\/p>\n<section class="ask"><div class="ask-line">.*<\/div>\n<p><a href="\/read\/">まず1回読む<\/a><\/p><\/section><\/div>/);
});

test('タイトルとコマンドの記号は HTML として解釈させない', () => {
  const html = renderDocument({ ...page, title: '<b>&"', command: '<i>' });
  assert.match(html, /<title>&lt;b&gt;&amp;&quot;<\/title>/);
  assert.match(html, /\/yomimasu &lt;i&gt;/);
});
