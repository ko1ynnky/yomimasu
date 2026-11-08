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

test('お手本の音声は、最初のカードでも出典でも、髙橋A級公認読手の読みを許諾を得て使っていると書く', () => {
  const { markdown } = source();
  const card = markdown.match(/<div><b>お手本の音声<\/b>.*<\/div>/)?.[0] ?? '';
  const audio = markdown.split('<h3 id="src-audio">')[1].split('## ')[0];
  for (const [where, text] of [['最初のカード', card], ['出典', audio]]) {
    assert.match(text, /髙橋A級公認読手の読み/, where);
    assert.match(text, /許諾を得て使っています/, where);
  }
});

test('読手のメモは、髙橋A級公認読手が書いたものとして出典に書く', () => {
  const memo = source().markdown.split('<h3 id="src-memo">')[1].split('<h3 ')[0];
  assert.match(memo, /髙橋A級公認読手が書いた/);
});

test('読手と著者の名前を書かないとは、もう書かない', () => {
  assert.doesNotMatch(source().markdown, /名前は書きません/);
});

test('再利用の節は、お手本の音声も再利用を認めないと書く', () => {
  const reuse = source().markdown.split('## 再利用について')[1] ?? '';
  assert.match(reuse, /お手本の音声は録音した人の権利のままで、再利用を認めません。/);
});

test('録音を端末の外へ出さないことを書く', () => {
  assert.match(source().markdown, /録音は端末の外へ出ません。/);
});

test('録音と結果がこのブラウザーに残ることと、消せる場所を書く', () => {
  const recording = source().markdown.match(/<div><b>録音<\/b>.*<\/div>/)?.[0] ?? '';
  assert.match(recording, /このブラウザーに残り/);
  assert.match(recording, /前回と比べる/);
});

const SOURCE_IDS = ['sources', 'src-uta', 'src-text', 'src-lecture', 'src-memo', 'src-author', 'src-phonetics', 'src-research', 'src-audio'];

test('出典は、資料ごとの見出しにアンカーを付けて並べる', () => {
  const { markdown } = source();
  assert.match(markdown, /<h2 id="sources">出典<\/h2>/);
  for (const id of SOURCE_IDS.slice(1)) assert.equal(markdown.match(new RegExp(`<h3 id="${id}">`, 'g'))?.length, 1, id);
});

test('資料の名前と版は1か所にだけ書き、前の節の見出しを残さない', () => {
  const { markdown } = source();
  assert.equal(markdown.match(/『小倉百人一首 競技かるた読手テキスト』冊子、令和2年4月1日初版/g)?.length, 1);
  assert.equal(markdown.match(/『読手講習ビデオ（PDF版）』2020年10月/g)?.length, 1);
  for (const old of ['伸ばす箇所、ふりがな、注、別の読み、余韻の印', '札ごとの表記の作り方', '知識の文章の資料']) assert.ok(!markdown.includes(old), old);
});

test('口の形の図の資料は、Wikipedia の5つの記事の URL と CC BY-SA 4.0 を書く', () => {
  const phonetics = source().markdown.split('<h3 id="src-phonetics">')[1].split('<h3 ')[0];
  for (const url of [
    'https://en.wikipedia.org/wiki/Japanese_phonology',
    'https://ja.wikipedia.org/wiki/日本語の音韻',
    'https://en.wikipedia.org/wiki/Vowel',
    'https://en.wikipedia.org/wiki/Nasal_consonant',
    'https://en.wikipedia.org/wiki/Uvular_nasal',
  ]) {
    assert.ok(phonetics.includes(`<a href="${url}">`), url);
  }
  assert.equal(phonetics.match(/CC BY-SA 4\.0/g)?.length, 6);
});

test('読手のメモは、協会の基準ではなく読手個人のやり方として書く', () => {
  const memo = source().markdown.split('<h3 id="src-memo">')[1].split('<h3 ')[0];
  assert.match(memo, /協会の基準ではなく、読手個人のやり方です。/);
});

test('最初のカードの最後に、作者へのメールと X の問い合わせ先を置く', () => {
  const card = source().markdown.split('<div class="card rows points">')[1].split('\n</div>')[0];
  const rows = card.trim().split('\n');
  const contact = rows.at(-1) ?? '';
  assert.match(contact, /^<div><b>問い合わせ<\/b>/);
  assert.match(contact, /<a href="mailto:koichi\.okuda\.dev@gmail\.com">koichi\.okuda\.dev@gmail\.com<\/a>/);
  assert.match(contact, /<a href="https:\/\/x\.com\/0kdynnkw">@0kdynnkw<\/a>/);
});
