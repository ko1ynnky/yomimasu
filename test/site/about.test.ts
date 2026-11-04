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

test('録音を端末の外へ出さないことを書く', () => {
  assert.match(source().markdown, /録音は端末の外へ出ません。/);
});
