import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import deck from '../../.claude/skills/yomimasu/assets/cards.json' with { type: 'json' };
import type { Card } from '../../.claude/skills/yomimasu/scripts/cards.ts';
import { finalSound, rulePoints } from '../../content/karuta/rules.ts';
import { adviceFor, cardPage, expandCardRefs, finalSoundCounts, kimarijiGroups, listHtml, parseAdvice } from '../../site/karuta.ts';

const cards = deck.cards as unknown as Card[];
const card = (no: number) => cards.find((c) => c.no === no)!;
const hundred = cards.filter((c) => c.no !== 0);
const advice = parseAdvice(readFileSync('.claude/skills/yomimasu/references/card-advice-candidates.md', 'utf8'));

// 規則が当たる札の番号を、スキルの card-rules.md と比べるために並べる。
const cardsWith = (id: string) => hundred.filter((c) => rulePoints(c, cards).some((p) => p.id === id)).map((c) => c.no);
const pointOf = (no: number, id: string) => rulePoints(card(no), cards).find((p) => p.id === id);
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
const except = (excluded: number[]) => range(1, 100).filter((no) => !excluded.includes(no));

test('決まり字順は、決まり字の最初の音で分け、札の多い音から読み方一覧の順に並べる', () => {
  const groups = kimarijiGroups(cards, 'desc');
  assert.equal(groups.map((g) => g.head).join(''), 'あなおわたこみはやよかいちひきうつしもゆむすめふさほせ');
  assert.deepEqual(
    groups.map((g) => g.cards.length),
    [16, 8, 7, 7, 6, 6, 5, 4, 4, 4, 4, 3, 3, 3, 3, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1],
  );
});

test('分けるのは発音の音で、「あふこ」と「をぐ」は「お」に入る', () => {
  const o = kimarijiGroups(cards, 'desc').find((g) => g.head === 'お')!;
  assert.deepEqual(o.cards.map((c) => c.kimariji!.kana), ['あふこ', 'おく', 'おと', 'おほえ', 'おほけ', 'おも', 'をぐ']);
});

test('少ない→多いは札の数の逆順で、同じ数の音どうしは一覧の順を保つ', () => {
  const heads = kimarijiGroups(cards, 'asc').map((g) => g.head).join('');
  assert.equal(heads, 'むすめふさほせうつしもゆいちひきはやよかみたこおわなあ');
});

test('100首の一覧は序歌を先頭に置き、どの札も1首のページへ進める', () => {
  const html = listHtml(cards);
  const links = [...html.matchAll(/href="(\/karuta\/[^"]+\/)"/g)].map((m) => m[1]);
  assert.equal(links[0], '/karuta/joka/');
  for (const no of range(1, 100)) assert.ok(links.includes(`/karuta/${no}/`), `${no}番へのリンクがない`);
});

test('歌番号は歌番号順の並びにだけ出し、決まり字順には出さない', () => {
  const html = listHtml(cards);
  const desc = html.slice(html.indexOf('data-view="desc"'), html.indexOf('data-view="asc"'));
  const number = html.slice(html.indexOf('data-view="number"'));
  assert.doesNotMatch(desc, /\d+番/);
  assert.match(number, /<small>1番<\/small><b>あきの<\/b>/);
});

test('本文の {{札 番号}} は、決まり字で1首のページへのリンクにする', () => {
  assert.equal(
    expandCardRefs('{{札 55 0}}', cards),
    '<a class="kim-in" href="/karuta/55/">たき</a>、<a class="kim-in" href="/karuta/joka/">序歌</a>',
  );
  assert.throws(() => expandCardRefs('{{札 101}}', cards), /101/);
});

test('1首のページは歌番号の URL に置き、コマンドと読んだ行は決まり字で書く', () => {
  assert.deepEqual(
    (({ path, command, readName }) => ({ path, command, readName }))(cardPage(card(53), cards, advice)),
    { path: 'karuta/53/index.html', command: '1首 なげき', readName: 'なげき.md' },
  );
  assert.deepEqual(
    (({ path, command, readName }) => ({ path, command, readName }))(cardPage(card(0), cards, advice)),
    { path: 'karuta/joka/index.html', command: '1首 序歌', readName: '序歌.md' },
  );
});

test('1首のページは歌番号を出さず、歌に伸ばす印、ふりがな、余韻の印を付ける', () => {
  const { bodyHtml } = cardPage(card(53), cards, advice);
  assert.doesNotMatch(bodyHtml, /53番|５３/);
  assert.match(bodyHtml, /<span class="nobi">ー<\/span>/);
  assert.match(bodyHtml, /<ruby>/);
  assert.match(bodyHtml, /<span class="yoin" role="img" aria-label="余韻">/);
  assert.match(bodyHtml, /<div class="kim">なげき<\/div>/);
});

test('教科書では「を」に読みを振らない（「を」の読み分けを読手に確かめる前である）', () => {
  for (const no of [8, 26, 77]) assert.doesNotMatch(cardPage(card(no), cards, advice).bodyHtml, /を<rt>/, `${no}番`);
});

test('漢字の語の読みでも、「を」の所は「を」のまま振る', () => {
  const poem = (no: number) => cardPage(card(no), cards, advice).bodyHtml.match(/<div class="tate">.*?<\/div><aside>/s)![0];
  assert.match(poem(26), /<ruby>小倉山<rt>をぐらやま<\/rt><\/ruby>/);
  assert.doesNotMatch(poem(93), /おぶね/);
  assert.match(poem(1), /<ruby>庵<rt>いお<\/rt><\/ruby>/);
});

test('注意点は優先の高い順に並べる', () => {
  const order = { 高: 0, 中: 1, 低: 2 };
  for (const c of cards) {
    const priorities = rulePoints(c, cards).map((p) => order[p.priority]);
    assert.deepEqual(priorities, [...priorities].sort(), `${c.no}番`);
  }
});

test('規則が当たる札は、スキルの card-rules.md の札と一致する（決まり字と初句）', () => {
  assert.deepEqual(cardsWith('oyama'), [11, 15, 31, 50, 64, 76]);
  assert.deepEqual(cardsWith('ichiji'), [18, 22, 57, 70, 77, 81, 87]);
  assert.deepEqual(cardsWith('shoku6'), [4, 9, 25, 29, 48, 55, 57, 75]);
  const jiamari = [1, 4, 9, 11, 15, 16, 20, 21, 22, 23, 24, 25, 26, 28, 29, 31, 38, 40, 48, 49, 55, 57, 70, 73, 75, 76, 77, 79, 80, 85, 92, 99];
  assert.deepEqual([...new Set([...cardsWith('shoku6'), ...cardsWith('jiamari')])].sort((a, b) => a - b), jiamari);
});

test('1音目の子音が落ちたときに聞こえる札を、読む札と聞こえる札の両方に出す', () => {
  assert.deepEqual(cardsWith('shiin'), [6, 17, 28, 32, 46, 55, 62, 81, 85, 87, 89, 100]);
  assert.deepEqual(cardsWith('shiin-kikoe'), [1, 7, 12, 31, 39, 44, 64, 65, 72, 82]);
  assert.match(expandCardRefs(pointOf(55, 'shiin')!.body, cards), /href="\/karuta\/1\/">あきの</);
});

test('規則が当たる札は、スキルの card-rules.md の札と一致する（発音）', () => {
  const nasalFree = [5, 10, 14, 16, 18, 20, 22, 24, 28, 30, 31, 35, 37, 38, 39, 43, 44, 45, 46, 48, 49, 58, 59, 60, 61, 62, 65, 66, 67, 69, 71, 72, 78, 82, 83, 88, 90, 94, 99, 100];
  assert.deepEqual(cardsWith('bidakuon'), except(nasalFree));
  assert.deepEqual(cardsWith('hagyo'), except([3, 6, 7, 14, 22, 26, 31, 33, 34, 44, 76, 79, 81, 91, 94]));
  // 54番の「けふ」はユーザーの判断の読み（きょおー）で、長音の綴りに数えない（card-rules.md）。
  assert.deepEqual(cardsWith('choon'), [2, 8, 10, 22, 25, 41, 44, 45, 56, 61, 62, 63, 76]);
  assert.deepEqual(cardsWith('mu'), [3, 8, 12, 15, 16, 18, 20, 21, 22, 24, 26, 27, 29, 33, 34, 36, 47, 56, 63, 65, 67, 69, 70, 73, 77, 80, 81, 84, 91, 94]);
  assert.deepEqual(cardsWith('museika'), [12, 13, 17, 22, 23, 33, 35, 51, 53, 69, 79, 99]);
  const wiweDiZu = [5, 8, 9, 12, 14, 17, 18, 23, 24, 25, 26, 27, 32, 33, 36, 39, 42, 45, 46, 49, 54, 58, 63, 64, 69, 70, 71, 76, 77, 78, 79, 88, 99];
  assert.deepEqual(cardsWith('kana'), wiweDiZu);
});

test('ガ行の鼻濁音は60首のべ88か所、語中のハ行は85首のべ167か所を指す', () => {
  const count = (id: string) => hundred.reduce((sum, c) => sum + (pointOf(c.no, id)?.count ?? 0), 0);
  assert.equal(count('bidakuon'), 88);
  assert.equal(count('hagyo'), 167);
  assert.equal(count('choon'), 13);
});

test('規則が当たる札は、スキルの card-rules.md の札と一致する（伸ばす位置）', () => {
  assert.deepEqual(cardsWith('kami-tail-2'), [8, 83, 93]);
  assert.deepEqual(cardsWith('kami-tail-either'), [7, 13, 15, 17, 20, 24, 27, 28, 30, 41, 42, 46, 48, 49, 50, 51, 62, 73, 79, 86, 88, 95]);
  assert.deepEqual(cardsWith('shimo-tail-3'), [14, 20, 25, 34, 49, 54, 56, 63, 74, 77, 80]);
  assert.deepEqual(cardsWith('shiku'), range(1, 100));
  assert.deepEqual(cardsWith('alt'), [5, 11, 15, 31, 41, 50, 64, 76, 95, 99]);
  // 62番の注は「を」に掛かるので、「を」の読み分けを確かめるまで出さない。
  assert.deepEqual(cardsWith('notes'), [16, 20, 39, 44, 45, 60, 71, 77, 95]);
  assert.deepEqual(cardsWith('kugire').length, 35);
  assert.deepEqual(cardsWith('kakekotoba').length, 33);
});

test('2020年の改訂の札を出し、44番と93番の二句には触れない', () => {
  const revised = [7, 8, 10, 13, 14, 15, 17, 19, 20, 23, 24, 27, 28, 29, 30, 33, 37, 38, 41, 42, 46, 48, 49, 50, 51, 53, 57, 58, 62, 69, 73, 75, 79, 83, 86, 87, 88, 93, 95, 99, 100];
  assert.deepEqual(cardsWith('kaitei'), revised);
  for (const no of [44, 93]) {
    const { bodyHtml } = cardPage(card(no), cards, advice);
    assert.doesNotMatch(bodyHtml, /二句/, `${no}番`);
  }
});

test('出だしが同じ札を、決まり字の1字手前までの発音で探す', () => {
  const friends = (no: number) => [...expandCardRefs(pointOf(no, 'tomofuda')!.body, cards).matchAll(/>([^<]+)<\/a>/g)].map((m) => m[1]);
  assert.deepEqual(friends(42), ['ちぎりお']);
  assert.deepEqual(friends(17), ['ちぎりお', 'ちぎりき']);
  assert.deepEqual(friends(60), ['あふこ', 'おほけ']);
  assert.equal(pointOf(18, 'tomofuda'), undefined);
});

test('「を」で始まる札は、母音で始まる札にも、出だしが同じ札にも数えない', () => {
  assert.equal(pointOf(26, 'tomofuda'), undefined);
  assert.doesNotMatch(expandCardRefs(pointOf(5, 'tomofuda')!.body, cards), /をぐ/);
  assert.equal(adviceFor(card(26), advice, cards).some((a) => a.text.includes('1音目を少し長め')), false);
  assert.equal(adviceFor(card(1), advice, cards).some((a) => a.text.includes('1音目を少し長め')), true);
});

test('札ごとの助言の候補は、スキルの表の行をすべて読む', () => {
  const single = advice.filter((a) => a.table === 'single');
  assert.equal(single.length, 64);
  assert.equal(new Set(single.flatMap((a) => a.cards)).size, 52);
  assert.equal(advice.filter((a) => a.table === 'group').length, 7);
});

test('何首かにまたがる助言は、規則が当たる札に添える', () => {
  const texts = (no: number) => adviceFor(card(no), advice, cards).map((a) => a.text);
  assert.ok(texts(11).some((t) => t.includes('決まり字までが長いので読み急がない')));
  assert.ok(texts(75).some((t) => t.includes('初句は長さではなく速さをそろえ')));
  assert.ok(texts(70).some((t) => t.includes('子音を強く出しすぎない')));
  assert.ok(!texts(22).some((t) => t.includes('子音を強く出しすぎない')));
  assert.ok(texts(79).some((t) => t.includes('出だしが似ている')));
  assert.ok(hundred.every((c) => !texts(c.no).some((t) => t.includes('母音に声をのせる'))));
});

test('読手のメモから来た助言は、読手個人のやり方として出す', () => {
  const { bodyHtml } = cardPage(card(1), cards, advice);
  assert.match(bodyHtml, /「かりほ」は「かりお」と読む/);
  assert.match(bodyHtml, /読手のメモ（読手個人のやり方/);
  assert.doesNotMatch(bodyHtml, /完全版|(?<!読手の)メモ[12] /);
});

test('余韻で伸ばす最後の音は、結句の発音の最後の字で決め、母音と「ん」で分ける', () => {
  assert.deepEqual(finalSound(card(2)), { kana: 'ま', vowel: 'あ' });
  assert.deepEqual(finalSound(card(3)), { kana: 'ん', vowel: 'ん' });
  assert.deepEqual(finalSound(card(5)), { kana: 'き', vowel: 'い' });
  assert.match(pointOf(5, 'yoin-oto')!.body, /最後の「き」（母音は「い」）を伸ばし/);
});

test('最後の音ごとの札の数は、序歌と100首を表から数え、合わせて101首になる', () => {
  const counts = [...finalSoundCounts(cards).matchAll(/(\d+)首/g)].map((m) => Number(m[1]));
  assert.equal(counts.length, 6);
  assert.equal(counts.reduce((a, b) => a + b, 0), 101);
  assert.match(finalSoundCounts(cards), /^あ段 \d+首、い段 \d+首、う段 \d+首、え段 \d+首、お段 \d+首、「ん」 \d+首$/);
});

test('どの1首のページにも歌番号を出さない', () => {
  for (const c of cards) assert.doesNotMatch(cardPage(c, cards, advice).bodyHtml, /\d+番/, `${c.no}番`);
});

test('読手のメモの助言に協会の資料の出典が並ぶときは、協会の資料として分けて書く', () => {
  const { bodyHtml } = cardPage(card(95), cards, advice);
  assert.match(bodyHtml, /読手のメモ（読手個人のやり方。読手のメモ1 長音の一覧）、協会の資料（講習資料 s.31）/);
});

test('1首のページの優先は、このアプリの案だと断る', () => {
  assert.match(cardPage(card(53), cards, advice).bodyHtml, /このアプリの案です/);
});
