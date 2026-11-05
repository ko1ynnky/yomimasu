import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { outputPathOf, parseSource, renderDocument } from '../../site/render.ts';

const NAME = 'このアプリについて.md';
const source = () => parseSource(readFileSync(`content/${NAME}`, 'utf8'));

test('このアプリについては about/index.html に組み立てられる', () => {
  assert.equal(outputPathOf(NAME, source().slug), 'about/index.html');
});

test('このアプリについては、実行の行と読んだ行を出す', () => {
  const { title, command, readName } = source();
  const html = renderDocument({ title, command, readName, bodyHtml: '', scriptPath: '/assets/main.js', stylePaths: [] });
  assert.match(html, /\/yomimasu このアプリについて<\/div>/);
  assert.match(html, /<div class="read">● Read このアプリについて\.md<\/div>/);
});

test('英語の断りは決めた文のまま lang="en" で添える', () => {
  assert.match(
    source().markdown,
    /<p lang="en">Independent project\. Not affiliated with or endorsed by the All-Japan Karuta Association or Anthropic\.<\/p>/,
  );
});

test('再利用の節は、札の文字のデータも再利用を認めないものとして挙げる', () => {
  const reuse = source().markdown.split('## 再利用について')[1] ?? '';
  for (const subject of ['知識の文章', '札の文字のデータ', '札ごとの読みの表']) {
    assert.ok(reuse.includes(subject), subject);
  }
});

test('再利用の節は、資料から来た内容がどこにあっても MIT License の範囲外だと書く', () => {
  const reuse = source().markdown.split('## 再利用について')[1] ?? '';
  assert.match(reuse, /資料から来た内容は、どのファイルにあっても MIT License の範囲外/);
});

test('録音を端末の外へ出さないことを書く', () => {
  assert.match(source().markdown, /録音は端末の外へ出ません。/);
});

test('録音と結果がこのブラウザーに残ることと、消せる場所を書く', () => {
  const recording = source().markdown.match(/<div><b>録音<\/b>.*<\/div>/)?.[0] ?? '';
  assert.match(recording, /このブラウザーに残り/);
  assert.match(recording, /前回と比べる/);
});
