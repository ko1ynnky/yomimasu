// 指定した札の読み札を、札の読みの表 assets/cards.json から作る。親が子の部分練習で、手元の画面から読むためのもので、アプリの機能にはしない。
// 印刷して配る形は、札の文字のデータの「再利用を認めません」（NOTICE.md）を超えるとして、2026-11-04 に「AI に入れる」の例から外した。
// その判断に合わせて、出力にも印刷と配布をしないことを書く。印刷を認めるかはユーザーが決める（docs/decisions.md の未決）。
// 使い方：node scripts/reading-cards.ts た 1 0
//   数字は札の番号（0 は序歌）、それ以外は決まり字の頭の仮名として選ぶ。
//
// 読み札に出すのは、本文と仮名の列だけである。どちらも公開の本文データを直したもので、序歌と一部の札は読手テキストの読み方一覧の形に合わせてある。
// 伸ばす印、ふりがな、注は読手テキストから来た値で、読み札が画面の外へ出たときにアプリの再利用の範囲を超えやすいので出さない。
// 出典と権利の文は「このアプリについて」と NOTICE.md の書き方に合わせる。どちらかを直したら、ここも直す。
// 読み札は単独で渡ることがあるので、資料は呼び名ではなく、表の sources の名前と版で書く。

import { fileURLToPath } from 'node:url';
import { JOKA, type Card } from './cards.ts';

type Sources = {
  csv: { title: string; url: string; commit: string; license: string };
  joka: { pages: string };
  list: { title: string; edition: string };
};

export type Deck = { sources: Sources; cards: readonly unknown[] };

const PHRASE_GAP = '　';

export function selectCards(cards: readonly Card[], selectors: readonly string[]): Card[] {
  if (selectors.length === 0) throw new Error('札を1つ以上指定してください（札の番号か、決まり字の頭の仮名）');
  const chosen = new Map<number, Card>();
  for (const selector of selectors) {
    // 空の指定は startsWith で全首に当たるので、番号でも平仮名でもない指定は、選ぶ前に止める。前後の空白も削らずに止める。
    if (!/^(\d+|\p{Script=Hiragana}+)$/u.test(selector)) {
      throw new Error(`「${selector}」は、札の番号でも、決まり字の頭の仮名（平仮名）でもない`);
    }
    const hits = /^\d+$/.test(selector)
      ? cards.filter((card) => card.no === Number(selector))
      : cards.filter((card) => card.kimariji?.kana.startsWith(selector)).sort((a, b) => a.no - b.no);
    if (hits.length === 0) throw new Error(`「${selector}」に当たる札がない`);
    for (const card of hits) if (!chosen.has(card.no)) chosen.set(card.no, card);
  }
  return [...chosen.values()];
}

function cardBlock(card: Card): string {
  const heading = card.no === JOKA ? '序歌' : `${card.no}番　${card.kimariji?.kana}`;
  const texts = card.phrases.map((phrase) => phrase.text);
  return [
    `## ${heading}`,
    '',
    texts.slice(0, 3).join(PHRASE_GAP),
    texts.slice(3).join(PHRASE_GAP),
    '',
    `（${card.phrases.map((phrase) => phrase.kana).join(PHRASE_GAP)}）`,
  ].join('\n');
}

function sourceLines(sources: Sources, cards: readonly Card[]): string[] {
  const { csv, joka, list } = sources;
  const listName = `${list.title}、${list.edition}`;
  const lines: string[] = [];
  if (cards.some((card) => card.no !== JOKA)) {
    lines.push(
      `- 100首の本文：${csv.title}（${csv.url}、コミット ${csv.commit.slice(0, 7)}）の漢字の列と仮名の列を使い、誤りを直しました。データのリポジトリは ${csv.license} で、Public Domain としています。データの作者がどの資料から書き起こしたかは分かりません。歌そのものは古典です。`,
    );
  }
  if (cards.some((card) => card.no === JOKA)) {
    lines.push(
      `- 序歌の本文：公開の本文データにないので、手で入れました。全日本かるた協会 競技かるた部（読唱）『${listName}、p.${joka.pages}』にある、競技かるたで読む形です。一般の形とは四句の頭が違います。元の歌は古今和歌集の仮名序に引かれる古典です。`,
    );
  }
  const aligned = cards.flatMap((card) => {
    const fields = new Set(card.origin.text.fixes.filter((fix) => fix.why.includes('読み方一覧')).map((fix) => fix.field));
    const named = (['本文', '仮名'] as const).filter((field) => fields.has(field));
    return named.length > 0 ? [`${card.no}番の${named.join('と')}`] : [];
  });
  if (aligned.length > 0) {
    lines.push(`- ${aligned.join('、')}は、${listName}の形に合わせました。`);
  }
  lines.push(
    '- この読み札の文字は、/yomimasu が直した札の文字のデータです。MIT License の範囲外で、再利用を認めません。範囲は /yomimasu のリポジトリの NOTICE.md にあります。',
    '- この読み札は、手元の画面で読むためのものです。印刷して配ったり、ほかの人に渡したりしないでください。',
    '- /yomimasu は独立したプロジェクトです。全日本かるた協会の公認を受けていません。Anthropic の製品ではありません。',
  );
  return lines;
}

export function readingCards(deck: Deck, selectors: readonly string[]): string {
  const cards = selectCards(deck.cards as Card[], selectors);
  return [
    `# 読み札（${cards.length}首）`,
    ...cards.map(cardBlock),
    ['---', '', '出典と権利', '', ...sourceLines(deck.sources, cards)].join('\n'),
  ].join('\n\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { default: deck } = await import('../assets/cards.json', { with: { type: 'json' } });
  try {
    console.log(readingCards(deck, process.argv.slice(2)));
  } catch (error) {
    console.error((error as Error).message);
    process.exitCode = 1;
  }
}
