import assert from 'node:assert/strict';
import { test } from 'node:test';
import { outputPathOf, parseSource, renderDocument, runFor } from '../../site/render.ts';

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

test('日本語の名前のファイルは、先頭の slug の英字の URL に置く', () => {
  const source = parseSource('---\ntitle: 総論を学ぶ\ncommand: 総論を学ぶ\nread: 総論.md\nslug: soron\n---\n本文\n');
  assert.equal(source.slug, 'soron');
  assert.equal(outputPathOf('総論.md', source.slug), 'soron/index.html');
});

test('slug に英小文字、数字、ハイフン、区切りの / のほかを使うと組み立てを止める', () => {
  assert.throws(() => parseSource('---\ntitle: 総論\nslug: 総論\n---\n本文\n'), /slug/);
  assert.throws(() => parseSource('---\ntitle: 総論\nslug: ../soron\n---\n本文\n'), /slug/);
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
  assert.match(html, /<div class="screen"><div class="run"><div><span class="gt">&gt;<\/span> <span data-run>\/yomimasu 総論を学ぶ<\/span><\/div><div class="read">● Read 総論.md<\/div><\/div><p>本文です。<\/p>/);
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
  assert.match(html, /<title>&lt;b&gt;&amp;&quot; - \/yomimasu<\/title>/);
  assert.match(html, /<meta property="og:title" content="&lt;b&gt;&amp;&quot; - \/yomimasu">/);
  assert.match(html, /\/yomimasu &lt;i&gt;/);
});

test('入力の行は、押したボタンのコマンドを打ち込める', () => {
  assert.match(renderDocument(page), /<div class="ask-line"><span class="gt">&gt;<\/span> <span data-typed>\/yomimasu <\/span><span class="caret"><\/span><\/div>/);
});

const NEXT = '<p>本文</p>\n<!-- ask -->\n<div class="next"><a class="btn btn--line" href="/soron/">総論を学ぶ</a><a class="btn btn--fill" href="/read/">まず1回読む</a></div>';
const BACK = '<a class="btn btn--line back" href="/" data-back>戻る</a>';

test('読んだファイルのある画面は、主の操作の右に「戻る」を並べる。JS がなくても入口へ移れる', () => {
  const html = renderDocument({ ...page, command: '総論を学ぶ', readName: '総論.md', bodyHtml: NEXT });
  assert.ok(html.includes(`<div class="main-row"><a class="btn btn--fill" href="/read/">まず1回読む</a>${BACK}</div>`));
  assert.equal(html.split('data-back').length, 2);
});

test('主の操作のない画面は、「戻る」だけを右に寄せて置く', () => {
  const asking = renderDocument({ ...page, command: 'このアプリについて', readName: 'このアプリについて.md', bodyHtml: '<p>本文</p>\n<!-- ask -->\n<p class="ask-q">次は？</p>' });
  assert.match(asking, new RegExp(`<p class="ask-q">次は？</p><div class="back-row">${BACK}</div></section>`));
  const tool = renderDocument({ ...page, command: '1首ずつ学ぶ', readName: '一覧.md', tool: true, bodyHtml: '<p>一覧</p>' });
  assert.ok(tool.includes(`<p>一覧</p><div class="back-row">${BACK}</div></div>`));
});

test('入口と、読んだファイルのない画面（読む流れ）には「戻る」を置かない', () => {
  assert.doesNotMatch(renderDocument({ ...page, bodyHtml: NEXT }), /data-back/);
  assert.doesNotMatch(renderDocument({ ...page, command: 'まず1回読む', bodyHtml: NEXT }), /data-back/);
});

test('本文の <!-- foot --> から後ろは、入力の行と一覧の下に置く', () => {
  const html = renderDocument({ ...page, bodyHtml: '<p>題</p>\n<!-- ask -->\n<nav>一覧</nav>\n<!-- foot -->\n<p>下端</p>' });
  assert.match(html, /<nav>一覧<\/nav>\n<\/section>\n<p>下端<\/p>\n?<\/div>/);
});

test('実行の行と読んだ行は、コマンドの表から引いたものにする', () => {
  assert.deepEqual(runFor('総論.md', {}, { say: '総論を学ぶ', read: '総論.md' }), { command: '総論を学ぶ', readName: '総論.md' });
  assert.deepEqual(runFor('practice.md', { command: '練習モード' }, { say: '練習モード' }), { command: '練習モード' });
  assert.deepEqual(runFor('read/rec.md', {}, undefined), {});
});

test('先頭のコマンドか読んだ行が表と違うと、組み立てを止める', () => {
  assert.throws(() => runFor('総論.md', { command: '総論' }, { say: '総論を学ぶ', read: '総論.md' }), /総論を学ぶ/);
  assert.throws(() => runFor('総論.md', { readName: 'soron.md' }, { say: '総論を学ぶ', read: '総論.md' }), /総論\.md/);
});

test('読んだ行の名前が、その画面の content/ のファイルの名前でないと、組み立てを止める', () => {
  assert.throws(() => runFor('karuta/一覧.md', {}, { say: '1首ずつ学ぶ', read: '100首.md' }), /100首\.md/);
  assert.deepEqual(runFor('karuta/一覧.md', {}, { say: '1首ずつ学ぶ', read: '一覧.md' }), { command: '1首ずつ学ぶ', readName: '一覧.md' });
});
