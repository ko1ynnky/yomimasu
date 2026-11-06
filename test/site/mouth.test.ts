import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import deck from '../../.claude/skills/yomimasu/assets/cards.json' with { type: 'json' };
import type { Card } from '../../.claude/skills/yomimasu/scripts/cards.ts';
import { FINAL_SOUNDS, mouthFiguresHtml, mouthSvg, nasalEndings, nasalEndingsText, nasalFigureHtml } from '../../content/karuta/mouth.ts';
import { finalSound } from '../../content/karuta/rules.ts';
import { cardPage, parseAdvice } from '../../site/karuta.ts';

const cards = deck.cards as unknown as Card[];
const card = (no: number) => cards.find((c) => c.no === no)!;
const advice = parseAdvice(readFileSync('.claude/skills/yomimasu/references/card-advice-candidates.md', 'utf8'));
const imgNames = (html: string) => [...html.matchAll(/role="img" aria-label="([^"]+)"/g)].map((m) => m[1]);

test('「ん」で終わる札を、最後の2音ごとにまとめ、どの札も1回ずつ入れる', () => {
  const groups = nasalEndings(cards);
  const listed = groups.flatMap((g) => g.cards.map((c) => c.no)).sort((a, b) => a - b);
  const expected = cards.filter((c) => finalSound(c).vowel === 'ん').map((c) => c.no).sort((a, b) => a - b);
  assert.ok(expected.length > 0);
  assert.deepEqual(listed, expected);
  for (const g of groups) {
    assert.match(g.ending, /^.ん$/);
    for (const c of g.cards) assert.ok(c.phrases[4].sound.replace(/ー+$/, '').endsWith(g.ending), `${c.no}番`);
  }
});

test('まとまりは札の多い順に並べ、同じ数なら五十音の順にする', () => {
  const groups = nasalEndings(cards);
  const sorted = [...groups].sort((a, b) => b.cards.length - a.cards.length || (a.ending < b.ending ? -1 : 1));
  assert.deepEqual(groups.map((g) => g.ending), sorted.map((g) => g.ending));
});

test('まとまりごとに、「ん」の前の音の母音を持つ', () => {
  const ran = nasalEndings(cards).find((g) => g.ending === 'らん')!;
  assert.equal(ran.vowel, 'あ');
  const nen = nasalEndings(cards).find((g) => g.ending === 'ねん')!;
  assert.equal(nen.vowel, 'え');
});

test('本文の数の文は、合計、まとまりごとの数、前の母音ごとの数を、表から数えて書く', () => {
  const groups = nasalEndings(cards);
  const text = nasalEndingsText(cards);
  const total = groups.reduce((sum, g) => sum + g.cards.length, 0);
  assert.ok(text.startsWith(`${total}首`), text);
  assert.ok(text.includes(groups.map((g) => `${g.ending}${g.cards.length}首`).join('、')), text);
  const byVowel = new Map<string, number>();
  for (const g of groups) byVowel.set(g.vowel, (byVowel.get(g.vowel) ?? 0) + g.cards.length);
  for (const [vowel, count] of byVowel) assert.ok(text.includes(`「${vowel}」が${count}首`), text);
});

test('口の形の図は、あ・い・う・え・お・ん の6つをこの順に並べる', () => {
  assert.deepEqual(
    imgNames(mouthFiguresHtml()).map((name) => name.match(/^「(.)」/)?.[1]),
    ['あ', 'い', 'う', 'え', 'お', 'ん'],
  );
});

test('図の名前に「余韻」を入れない（1首のページの余韻の印と取り違えない）', () => {
  for (const sound of FINAL_SOUNDS) assert.doesNotMatch(mouthSvg(sound), /aria-label="[^"]*余韻/);
  assert.doesNotMatch(nasalFigureHtml(), /aria-label="[^"]*余韻/);
});

test('「ん」の断面の図は、歯茎から口蓋垂までの幅と、唇を閉じる人がいることを名前で伝える', () => {
  const [name] = imgNames(nasalFigureHtml());
  assert.match(name, /歯茎から口蓋垂まで/);
  assert.match(name, /唇を閉じる人もいる/);
});

test('1首のページは、その札の最後の音の口の形の図を1つだけ出す', () => {
  for (const no of [53, 0]) {
    const { vowel } = finalSound(card(no));
    const mouths = imgNames(cardPage(card(no), cards, advice).bodyHtml).filter((name) => name.includes('の口の形'));
    assert.deepEqual(mouths, [`「${vowel}」の口の形。正面から見た唇と、横から見た口の中`], `${no}番`);
  }
});

test('「ん」で終わる札の1首のページは、「ん」の位置の説明へ案内する', () => {
  const no = nasalEndings(cards)[0].cards[0].no;
  const html = cardPage(card(no), cards, advice).bodyHtml;
  assert.match(html, /href="\/point\/#yoin-n"/);
  const vowelCard = cards.find((c) => finalSound(c).vowel !== 'ん')!;
  assert.doesNotMatch(cardPage(vowelCard, cards, advice).bodyHtml, /href="\/point\/#yoin-n"/);
});

const captionOf = (no: number) => cardPage(card(no), cards, advice).bodyHtml.match(/<figcaption>(.*?)<\/figcaption>/s)![1];

test('1首のページの図の下の説明は1行にし、資料は「このアプリについて」の出典へリンクする', () => {
  assert.equal(
    captionOf(53),
    '<p>図は、一般の音声学の資料（<a href="/about/#src-phonetics">Wikipedia ほか</a>）をもとにこのアプリが描いたスケッチで、寸法は測っていません。朱の点は舌の最も高い所の目安です。</p>',
  );
});

test('「ん」で終わる札の図の下の説明は、朱の帯のもとの研究へリンクし、「ん」の説明への案内も残す', () => {
  const nasal = nasalEndings(cards)[0].cards[0].no;
  const caption = captionOf(nasal);
  assert.ok(
    caption.endsWith(
      '<p>図は、一般の音声学の資料（<a href="/about/#src-phonetics">Wikipedia ほか</a>）をもとにこのアプリが描いたスケッチで、寸法は測っていません。「ん」の朱の帯は、<a href="/about/#src-research">研究</a>で舌が上あごに付いていた所の幅です。</p>',
    ),
    caption,
  );
  assert.match(caption, /href="\/point\/#yoin-n"/);
  assert.doesNotMatch(captionOf(53), /src-research/);
});

test('1首のページの保つ所には、このアプリの解釈だと添え、「ポイントを知る」の6つの図は今のまま「保つ」とだけ書く', () => {
  assert.match(cardPage(card(53), cards, advice).bodyHtml, /<p class="mouth-keep">保つ（このアプリの解釈）：/);
  assert.doesNotMatch(mouthFiguresHtml(), /このアプリの解釈）：/);
  assert.match(mouthFiguresHtml(), /<p class="mouth-keep">保つ：/);
});
