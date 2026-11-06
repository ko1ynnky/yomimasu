import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import deck from '../../.claude/skills/yomimasu/assets/cards.json' with { type: 'json' };
import type { Card } from '../../.claude/skills/yomimasu/scripts/cards.ts';
import { finalSound, poemSourceText, rulePoints, sameStartLine } from '../../content/karuta/rules.ts';
import { adviceFor, cardPage, expandCardRefs, finalSoundCounts, kimarijiGroups, listHtml, parseAdvice } from '../../site/karuta.ts';

const cards = deck.cards as unknown as Card[];
const card = (no: number) => cards.find((c) => c.no === no)!;
const hundred = cards.filter((c) => c.no !== 0);
const advice = parseAdvice(readFileSync('.claude/skills/yomimasu/references/card-advice-candidates.md', 'utf8'));

// 規則が当たる札の番号を、スキルの card-rules.md と比べるために並べる。
const cardsWith = (id: string) => hundred.filter((c) => rulePoints(c).some((p) => p.id === id)).map((c) => c.no);
const pointOf = (no: number, id: string) => rulePoints(card(no)).find((p) => p.id === id);
const pageOf = (no: number) => cardPage(card(no), cards, advice).bodyHtml;
const wordsOf = (no: number) => pageOf(no).split('<h3>言葉の助言</h3>')[1]?.split('</article>')[0] ?? '';
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
    const priorities = rulePoints(c).map((p) => order[p.priority]);
    assert.deepEqual(priorities, [...priorities].sort(), `${c.no}番`);
  }
});

test('規則が当たる札は、スキルの card-rules.md の札と一致する（決まり字と初句）', () => {
  assert.deepEqual(cardsWith('oyama'), [11, 15, 31, 50, 64, 76]);
  assert.deepEqual(cardsWith('ichiji'), [18, 22, 57, 70, 77, 81, 87]);
  assert.deepEqual(cardsWith('shoku6'), [4, 9, 25, 29, 48, 55, 57, 75]);
});

test('1音目の子音が落ちたときに聞こえる札を、読む札と聞こえる札の両方に出す', () => {
  assert.deepEqual(cardsWith('shiin'), [6, 17, 28, 32, 46, 55, 62, 81, 85, 87, 89, 100]);
  assert.deepEqual(cardsWith('shiin-kikoe'), [1, 7, 12, 31, 39, 44, 64, 65, 72, 82]);
  assert.match(expandCardRefs(pointOf(55, 'shiin')!.body, cards), /href="\/karuta\/1\/">あきの</);
});

test('規則が当たる札は、スキルの card-rules.md の札と一致する（発音）', () => {
  assert.deepEqual(cardsWith('hagyo'), except([3, 6, 7, 14, 22, 26, 31, 33, 34, 44, 76, 79, 81, 91, 94]));
  // 54番の「けふ」はユーザーの判断の読み（きょおー）で、長音の綴りに数えない（card-rules.md）。
  assert.deepEqual(cardsWith('choon'), [2, 8, 10, 22, 25, 41, 44, 45, 56, 61, 62, 63, 76]);
  assert.deepEqual(cardsWith('mu'), [3, 8, 12, 15, 16, 18, 20, 21, 22, 24, 26, 27, 29, 33, 34, 36, 47, 56, 63, 65, 67, 69, 70, 73, 77, 80, 81, 84, 91, 94]);
  assert.deepEqual(cardsWith('museika'), [12, 13, 17, 22, 23, 33, 35, 51, 53, 69, 79, 99]);
  const wiweDiZu = [5, 8, 9, 12, 14, 17, 18, 23, 24, 25, 26, 27, 32, 33, 36, 39, 42, 45, 46, 49, 54, 58, 63, 64, 69, 70, 71, 76, 77, 78, 79, 88, 99];
  assert.deepEqual(cardsWith('kana'), wiweDiZu);
});

test('語中のハ行は85首のべ167か所、長音で読む綴りは13か所を指す', () => {
  const count = (id: string) => hundred.reduce((sum, c) => sum + (pointOf(c.no, id)?.count ?? 0), 0);
  assert.equal(count('hagyo'), 167);
  assert.equal(count('choon'), 13);
});

test('規則が当たる札は、スキルの card-rules.md の札と一致する（伸ばす位置）', () => {
  assert.deepEqual(cardsWith('kami-tail-2'), [8, 83, 93]);
  assert.deepEqual(cardsWith('kami-tail-either'), [7, 13, 15, 17, 20, 24, 27, 28, 30, 41, 42, 46, 48, 49, 50, 51, 62, 73, 79, 86, 88, 95]);
  assert.deepEqual(cardsWith('shimo-tail-3'), [14, 20, 25, 34, 49, 54, 56, 63, 74, 77, 80]);
  assert.deepEqual(cardsWith('alt'), [5, 11, 15, 31, 41, 50, 64, 76, 95, 99]);
  // 62番の注は「を」に掛かるので、「を」の読み分けを確かめるまで出さない。
  assert.deepEqual(cardsWith('notes'), [16, 20, 39, 44, 45, 60, 71, 77, 95]);
});

test('44番と93番の二句には触れない', () => {
  for (const no of [44, 93]) assert.doesNotMatch(pageOf(no), /二句/, `${no}番`);
});

test('全部かほとんどの札に当たる点は1首のページに出さず、「ポイントを知る」へ案内する', () => {
  const dropped = ['余韻で伸ばす音は', '四句の途中で1回伸ばす', '語の途中のガ行は鼻濁音', '歌の途中に句切れがある', '掛詞がある', '字余りの句がある', '2020年の改訂で読み方が変わった', '出だしが同じ札と読み比べる'];
  for (const c of cards) {
    const html = cardPage(c, cards, advice).bodyHtml;
    for (const title of dropped) assert.ok(!html.includes(title), `${c.no}番に「${title}」`);
    assert.match(html, /<p class="fine">全部の札に共通の点（余韻、四句の伸ばし、鼻濁音、仮名の読み方の決まりなど）は<a href="\/point\/">ポイントを知る<\/a>にあります。<\/p>/, `${c.no}番`);
  }
});

test('出だしが同じ札は、気をつける点のカードの最初の行に、優先の印も出典もない1行で出す', () => {
  assert.match(pageOf(53), /<div class="card rows points"><div><p>出だしが同じ札：<a class="kim-in" href="\/karuta\/86\/">なげけ<\/a><\/p><\/div><div><span class="prio/);
  assert.doesNotMatch(pageOf(18), /出だしが同じ札/);
});

test('出だしが同じ札を、決まり字の1字手前までの発音で探す', () => {
  const friends = (no: number) => [...expandCardRefs(sameStartLine(card(no), cards)!, cards).matchAll(/>([^<]+)<\/a>/g)].map((m) => m[1]);
  assert.deepEqual(friends(42), ['ちぎりお']);
  assert.deepEqual(friends(17), ['ちぎりお', 'ちぎりき']);
  assert.deepEqual(friends(60), ['あふこ', 'おほけ']);
  assert.equal(sameStartLine(card(18), cards), null);
});

test('無声化は、箇所と、無理に避けず自然に読むことだけを書く', () => {
  assert.equal(pointOf(53, 'museika')!.body, '決まり字の「なげき」の「き」は、母音が無声になりやすい所です。無理に避けず、自然に読みます。');
});

test('「を」で始まる札は、母音で始まる札にも、出だしが同じ札にも数えない', () => {
  assert.equal(sameStartLine(card(26), cards), null);
  assert.doesNotMatch(expandCardRefs(sameStartLine(card(5), cards)!, cards), /をぐ/);
  assert.equal(adviceFor(card(26), advice).some((a) => a.text.includes('1音目を少し長め')), false);
  assert.equal(adviceFor(card(1), advice).some((a) => a.text.includes('1音目を少し長め')), true);
});

test('札ごとの助言の候補は、スキルの表の行をすべて読む', () => {
  const single = advice.filter((a) => a.table === 'single');
  assert.equal(single.length, 64);
  assert.equal(new Set(single.flatMap((a) => a.cards)).size, 52);
  assert.equal(advice.filter((a) => a.table === 'group').length, 7);
});

test('何首かにまたがる助言は、規則が当たる札に添える', () => {
  const texts = (no: number) => adviceFor(card(no), advice).map((a) => a.text);
  assert.ok(texts(11).some((t) => t.includes('決まり字までが長いので読み急がない')));
  assert.ok(texts(75).some((t) => t.includes('初句は長さではなく速さをそろえ')));
  assert.ok(texts(70).some((t) => t.includes('子音を強く出しすぎない')));
  assert.ok(!texts(22).some((t) => t.includes('子音を強く出しすぎない')));
  assert.ok(texts(79).some((t) => t.includes('出だしが似ている')));
  assert.ok(hundred.every((c) => !texts(c.no).some((t) => t.includes('母音に声をのせる'))));
});

test('読手のメモから来た助言は、メモの印に「読手個人のやり方」を添えて出す', () => {
  const html = wordsOf(1);
  assert.match(html, /「かりほ」は「かりお」と読む。<\/p><p class="src">読手のメモ1 読み違い①（読手個人のやり方）<\/p>/);
  assert.match(html, /<p class="src">読手のメモ2 1-7（読手個人のやり方。大会やきちんとした練習会での話で、ふだんの練習会では参考程度）<\/p>/);
  assert.doesNotMatch(pageOf(1), /完全版|(?<!読手の)メモ[12] /);
});

test('協会の資料から来た項目と助言は、資料の名前とページだけの短い印で出典を書く', () => {
  assert.match(pageOf(53), /<p class="src">冊子 p\.23<\/p>/);
  assert.match(wordsOf(70), /<p class="src">講習資料 s\.20<\/p>/);
  for (const c of cards) assert.doesNotMatch(cardPage(c, cards, advice).bodyHtml, /協会の資料（/, `${c.no}番`);
});

test('どの1首のページも、出典の節を置かず、終わりに「このアプリについて」の出典への1行を置く', () => {
  for (const c of cards) {
    const html = cardPage(c, cards, advice).bodyHtml;
    assert.doesNotMatch(html, /card sources|<h3>出典<\/h3>/, `${c.no}番`);
    assert.match(html, /<\/article>\n<p class="fine">出典は<a href="\/about\/#sources">このアプリについて<\/a>にまとめています。<\/p>\n<!-- ask -->/, `${c.no}番`);
  }
});

test('余韻で伸ばす最後の音は、結句の発音の最後の字で決め、母音と「ん」で分ける', () => {
  assert.deepEqual(finalSound(card(2)), { kana: 'ま', vowel: 'あ' });
  assert.deepEqual(finalSound(card(3)), { kana: 'ん', vowel: 'ん' });
  assert.deepEqual(finalSound(card(5)), { kana: 'き', vowel: 'い' });
});

test('口の形の図の見出しに、余韻で伸ばす音を出す', () => {
  assert.match(pageOf(5), /<h3>余韻で伸ばす音「き」の口の形<\/h3>/);
  assert.match(pageOf(53), /<h3>余韻で伸ばす音「る」の口の形<\/h3>/);
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

test('読手のメモの助言に協会の資料の出典が並ぶときは、メモの印のあとに分けて書く', () => {
  assert.match(wordsOf(95), /<p class="src">読手のメモ1 長音の一覧（読手個人のやり方）、講習資料 s\.31<\/p>/);
  assert.match(wordsOf(77), /<p class="src">読手のメモ1 長音の一覧（読手個人のやり方）、読み方一覧（冊子 p\.15）<\/p>/);
});

test('1首のページの優先は、このアプリの案だと断る', () => {
  assert.match(cardPage(card(53), cards, advice).bodyHtml, /このアプリの案です/);
});

test('言葉の助言のうち、同じページの気をつける点と同じことを言う行は出さない', () => {
  assert.doesNotMatch(wordsOf(11), /決まり字までが長いので読み急がない/);
  assert.match(wordsOf(11), /最初の5音をほかの札と同じ速さで読む/);
  for (const no of [15, 50]) assert.doesNotMatch(wordsOf(no), /大山札の二句目の頭の高さ/, `${no}番`);
  assert.doesNotMatch(wordsOf(64), /読み急がない/);
  assert.doesNotMatch(wordsOf(81), /おととぎす/);
  assert.doesNotMatch(wordsOf(4), /初句は長さではなく速さをそろえ/);
});

test('42番と75番の初句の助言は、初句6字の項目のある75番では出さず、42番では出す', () => {
  assert.doesNotMatch(wordsOf(75), /初句は長さではなく速さをそろえ/);
  assert.match(wordsOf(42), /初句は長さではなく速さをそろえる。6字の「ちぎりおきし」は1字分長くなるのが自然である/);
});

test('読手のメモの長音の一覧の行は出さず、一覧の読みと違うことを言う54、77、95番の行は出す', () => {
  assert.doesNotMatch(wordsOf(8), /「ゆー」と長音にする/);
  assert.doesNotMatch(wordsOf(45), /「ゆーべきひと」と長音にする/);
  assert.match(wordsOf(54), /このアプリの札の読みの表は「けふ」を伸ばさずに「きょ」と読む/);
  assert.match(wordsOf(77), /メモの読みは一覧の読みと違う/);
  assert.match(wordsOf(95), /メモの読みは一覧の読みと違う/);
});

test('ほかの札の名指しの助言、区切りの一覧、読み違い、発音しにくい決まり字の行は出す', () => {
  assert.match(wordsOf(18), /初句だけを続けてくり返し読み/);
  assert.match(wordsOf(1), /1音目を少し長めにして/);
  assert.match(wordsOf(1), /「かりほ」は「かりお」と読む/);
  assert.match(wordsOf(10), /「別れて」で伸ばし/);
  assert.match(wordsOf(53), /決まり字の「き」が発音しにくく/);
  assert.match(wordsOf(25), /最初の5音をほかの札と同じ速さで読む/);
});

test('出さないと決めた助言の行が表から消えたり変わったりしたら、表を読む所で止まる', () => {
  const table = readFileSync('.claude/skills/yomimasu/references/card-advice-candidates.md', 'utf8');
  const without = (start: string) => table.split('\n').filter((line) => !line.startsWith(start)).join('\n');
  assert.throws(() => parseAdvice(without('| 81 |')), /おととぎす/);
  assert.throws(() => parseAdvice(without('| 54 |')), /54番/);
  assert.throws(() => parseAdvice(table.replace('| 大山札の6首 | 決まり字までが長いので読み急がない', '| 大山札の6首 | 決まり字まで長いので読み急がない')), /読み急がない/);
});

test('お手本を再生のボタンは歌の枠と歌の印のすぐ下に置き、JS が動くまで隠し、打ち込む印を付ける', () => {
  assert.match(
    pageOf(53),
    /<\/aside><\/div>\n<p class="src">[^<]+<\/p>\n<yomimasu-karuta-play data-no="53"><button class="btn" type="button" data-echo hidden><svg class="ico" viewBox="0 0 12 12" aria-hidden="true"><path d="[^"]+"\/><\/svg><span>お手本を再生<\/span><\/button><\/yomimasu-karuta-play>\n<h3>気をつける点<\/h3>/,
  );
  assert.match(pageOf(0), /<yomimasu-karuta-play data-no="0">/);
});

test('出さない助言の行は、その札のページに同じことを言う項目があるときだけで、長音の一覧は決まった13首の行だけを出さない', () => {
  const hidden = advice.filter((a) => a.hiddenOn);
  const sameAs = (a: (typeof advice)[number]) =>
    a.group === '大山札の6首' || /大山札|あさぼらけう/.test(a.text) ? ['oyama'] : a.group === '初句が6字の8首' || a.text.startsWith('初句は') ? ['shoku6'] : a.cards.includes(81) ? ['ichiji'] : ['choon', 'hagyo'];
  for (const a of hidden) {
    for (const c of cards.filter((c) => adviceFor(c, [a]).length > 0 && (a.hiddenOn === 'all' || a.hiddenOn!.includes(c.no)))) {
      assert.ok(rulePoints(c).some((p) => sameAs(a).includes(p.id)), `${c.no}番の「${a.text}」`);
    }
  }
  const choon = hidden.filter((a) => a.source.includes('長音の一覧')).flatMap((a) => a.cards);
  assert.deepEqual(choon, [8, 22, 40, 45, 48, 56, 61, 63, 76, 78, 85, 96, 99]);
});

test('歴史的かなづかいの4項目は、一般論を書かず、その歌の箇所だけを書く', () => {
  assert.equal(
    pointOf(17, 'hagyo')!.body,
    '「川（がは）」の「は」は「わ」、「水くくるとは」の「は」は「わ」と読みます。「ちはやぶる」の「は」は、合わさった語の後ろの語の頭なので、ハ行のまま読みます。',
  );
  assert.equal(pointOf(22, 'mu')!.body.split('。')[0], '「嵐といふらむ」の「む」は「ん」と読みます');
  assert.equal(pointOf(8, 'kana')!.body, '「世をうぢ」の「ぢ」は「じ」と読みます。');
  assert.equal(pointOf(8, 'choon')!.body, '「いふ」は「ゆー」と読みます。');
  const general = ['語の頭にないハ行の音は', '助動詞の「む」「らむ」「けむ」', '「ゐ」「ゑ」は「い」「え」', '読み方一覧のふりがなでも確かめられます', '母音の後に「う」の音が続くと', 'この札では'];
  for (const c of cards) {
    const html = cardPage(c, cards, advice).bodyHtml;
    for (const text of general) assert.ok(!html.includes(text), `${c.no}番に「${text}」`);
  }
});

test('歌のすぐ下に、伸ばす箇所とふりがな・注・余韻の印の版とページを短い印で出す', () => {
  assert.match(pageOf(53), /<\/aside><\/div>\n<p class="src">伸ばす箇所 抜粋版 p\.7、ふりがな・注・余韻の印 冊子 p\.7<\/p>\n/);
  assert.match(pageOf(0), /<p class="src">伸ばす箇所 抜粋版 p\.5、ふりがな・注・余韻の印 冊子 p\.5<\/p>/);
  for (const c of cards) {
    assert.ok(
      pageOf(c.no).includes(`<p class="src">伸ばす箇所 抜粋版 p.${c.origin.stretches.page}、ふりがな・注・余韻の印 冊子 p.${c.origin.notation.page}</p>`),
      `${c.no}番`,
    );
  }
});

test('ページが記録されていない部分の印は出さない', () => {
  const without = (stretches: number, notation: number) => ({
    ...card(53),
    origin: { ...card(53).origin, stretches: { ...card(53).origin.stretches, page: stretches }, notation: { ...card(53).origin.notation, page: notation } },
  });
  assert.equal(poemSourceText(without(0, 7)), 'ふりがな・注・余韻の印 冊子 p.7');
  assert.equal(poemSourceText(without(7, 0)), '伸ばす箇所 抜粋版 p.7');
  assert.equal(poemSourceText(without(0, 0)), null);
  assert.doesNotMatch(cardPage(without(0, 0), cards, advice).bodyHtml, /抜粋版 p\.|冊子 p\.7<\/p>\n<yomimasu/);
});
