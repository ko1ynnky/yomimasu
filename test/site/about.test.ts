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
  assert.match(html, /\/yomimasu このアプリについて<\/span><\/div>/);
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

test('お手本の音声は「A級公認読手のお手本」として、使っている形で書く', () => {
  const { markdown } = source();
  assert.match(markdown, /「A級公認読手のお手本」/);
  assert.match(markdown, /序歌と100首の上の句と下の句のお手本を、許諾を得て使っています。/);
  assert.doesNotMatch(markdown, /お手本の音声を使っていません/);
});

test('再利用の節は、お手本の音声も再利用を認めないと書く', () => {
  const reuse = source().markdown.split('## 再利用について')[1] ?? '';
  assert.match(reuse, /お手本の音声は録音した人の権利のままで、再利用を認めません。/);
});

test('録音を端末の外へ出さないことを書く', () => {
  assert.match(source().markdown, /録音は端末の外へ出ません。/);
});
