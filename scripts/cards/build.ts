// 公開の本文データと読手テキスト抜粋版から assets/cards.json を作る。
//
//   node scripts/cards/build.ts --csv <小倉百人一首.csv> --pdf <読手テキスト抜粋版.pdf>
//
// --check を付けると書き込まず、今の表を資料と照合して件数だけを出す。
// --reread には、一覧の画像を目で書き起こしたタブ区切りのファイルを渡す。
// 1行が「番号、上の句、下の句」で、本文の列の字と「ー」をそのまま書いたものである。
// 資料はリポジトリの外に置く。取り方は docs/cards.md にある。

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { JOKA, type Card } from '../../.claude/skills/yomimasu/scripts/cards.ts';
import { buildCard, compareWithList, fixedLines, linesFromCsv, withKimariji } from './assemble.ts';
import { JOKA_LINES } from './corrections.ts';
import { readList, type ListCard } from './list.ts';

const TABLE = fileURLToPath(new URL('../../.claude/skills/yomimasu/assets/cards.json', import.meta.url));

const CSV_SHA256 = 'f99510dcd54838a2be3bc8cd2e96d2063d799705248615906a939b4dcaeaf34b';
const LIST_SHA256 = 'ae619e9a8a75e1702014f0c41d53b7ae8c32d3015926985090ad8a4c6c182a77';

const SOURCES = {
  csv: {
    title: 'Ogura_Hyakunin_Isshu.csv',
    url: 'https://github.com/nyoronjp/Ogura_Hyakunin_Isshu.csv',
    commit: '42cfd44d6c055488223661dad238e9c8a2b6df3e',
    file: '小倉百人一首.csv',
    license: 'Unlicense',
    sha256: CSV_SHA256,
    use: '歌の本文の漢字の列と仮名の列',
  },
  joka: {
    title: '序歌「難波津に」',
    pages: '5',
    use: '公開の本文データにないので、読み方一覧の本文の形で手で入れた。競技かるたで読む形で、一般の形とは四句の頭が違う',
  },
  list: {
    title: '小倉百人一首 競技かるた読手テキスト HP掲載用抜粋版 読み方一覧',
    edition: '令和7年4月1日改訂版',
    url: 'https://www.karuta.or.jp/karuta/reading/',
    pages: '5-15',
    sha256: LIST_SHA256,
    use: '本文の列の伸ばしの印の位置を、全日本かるた協会の回答の範囲で使う。33、44、74番の本文もこの形に合わせた。語の切れ目は、一覧のふりがなを規則の読み替えと比べて見つけた。ふりがな、注、別の読み、余韻の印は、この版の文字のデータと画像の位置から読み取り、完全版（booklet）の値として表に持つ',
  },
  booklet: {
    title: '小倉百人一首 競技かるた読手テキスト 冊子 読み方一覧',
    edition: '令和2年4月1日初版',
    pages: '5-15',
    use: 'ふりがな、注、別の読み、余韻の印を、全日本かるた協会の回答の範囲で使う。ふりがなの「ー」と注の字は、発音の列（sound と diffs）にも当てる。ただし54番の四句の「けふ」の1か所は、ユーザーの判断で当てない。値は抜粋版の読み方一覧の文字のデータと画像の位置から機械で読み取り、この版のスキャンの画像と目で照らした。一致を目で確かめたのは、ふりがな707か所のうち706か所と、注、別の読み、余韻の印のすべてである。33番のふりがな1か所は読み方一覧のスキャンで濁点が判別できず、この版の p.27 が同じ語を「しづごころ」と印刷していることと、2026-11-04 にユーザーが冊子の実物で見たことで確かめた',
  },
  rules: {
    title: '小倉百人一首 競技かるた読手テキスト HP掲載用抜粋版 読唱上の決まり',
    edition: '令和7年4月1日改訂版',
    pages: '3-4',
    use: '規則から出る伸ばす位置。上の句の終わりの手前の位置は、札の番号を読み方一覧の印で決めた',
  },
};

const sha256 = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');

function assertVersion(path: string, expected: string) {
  const actual = sha256(path);
  if (actual !== expected) throw new Error(`${path} の版が表の作成に使ったものと違う（${actual}）`);
}

function formatted(cards: readonly Card[]): string {
  const cardLines = cards.map(({ no, phrases, ...rest }) => {
    const fields = Object.entries(rest).map(([key, value]) => `      ${JSON.stringify(key)}: ${JSON.stringify(value)}`);
    const phraseLines = phrases.map((phrase) => `        ${JSON.stringify(phrase)}`).join(',\n');
    return `    {\n      "no": ${no},\n      "phrases": [\n${phraseLines}\n      ],\n${fields.join(',\n')}\n    }`;
  });
  return `{\n  "sources": ${JSON.stringify(SOURCES, null, 2).replaceAll('\n', '\n  ')},\n  "cards": [\n${cardLines.join(',\n')}\n  ]\n}\n`;
}

function differencesFromReread(path: string, list: readonly ListCard[]): string[] {
  const rows = readFileSync(path, 'utf8').trim().split('\n').map((row) => row.split('\t'));
  const reread = new Map(rows.map(([no, upper, lower]) => [Number(no), { upper, lower }]));
  if (rows.length !== list.length || reread.size !== list.length) throw new Error('書き起こしは序歌と100首の101行にしてください');
  return list.flatMap(({ no, upper, lower }) => {
    const row = reread.get(no);
    return [
      ...(row?.upper === upper.marked ? [] : [`${no} 番の上の句`]),
      ...(row?.lower === lower.marked ? [] : [`${no} 番の下の句`]),
    ];
  });
}

function main() {
  const { values } = parseArgs({
    options: { csv: { type: 'string' }, pdf: { type: 'string' }, check: { type: 'boolean', default: false }, reread: { type: 'string' } },
  });
  if (!values.csv || !values.pdf) throw new Error('--csv と --pdf を渡してください');
  assertVersion(values.csv, CSV_SHA256);
  assertVersion(values.pdf, LIST_SHA256);

  const list = readList(values.pdf);
  if (values.reread) {
    const differences = differencesFromReread(values.reread, list);
    console.log(`目の読み直しと機械の読み取りの差 ${differences.length} 行`);
    if (differences.length > 0) {
      console.log(`確かめる行：${differences.join('、')}`);
      process.exitCode = 1;
    }
    return;
  }
  const lines = linesFromCsv(values.csv);
  lines.set(JOKA, JOKA_LINES);
  const built = withKimariji(
    [...lines].sort(([a], [b]) => a - b).map(([no, raw]) => {
      const { lines: fixed, fixes } = fixedLines(no, raw);
      const entry = list.find((l) => l.no === no);
      if (!entry) throw new Error(`${no} 番が一覧にない`);
      return buildCard(no, fixed, fixes, entry);
    }),
  );

  const table = formatted(built);
  const current: Card[] = values.check ? JSON.parse(readFileSync(TABLE, 'utf8')).cards : built;
  const { lines: total, marks, textMismatches, soundMismatches, stretchMismatches, notation, notationMismatches } = compareWithList(current, list);
  const problems = [...textMismatches, ...soundMismatches, ...stretchMismatches, ...Object.values(notationMismatches).flat()];
  const unchanged = !values.check || readFileSync(TABLE, 'utf8') === table;
  console.log(
    [
      `札 ${current.length} 枚、句の行 ${total} 行、伸ばしの印 ${marks} か所を一覧と照合した`,
      `ふりがな ${notation.furigana} か所、注 ${notation.notes} か所、別の読み ${notation.alternatives} 行、余韻の印 ${notation.yoin} 札を一覧と照合した`,
      `本文の仮名の不一致 ${textMismatches.length} 行`,
      `発音の不一致 ${soundMismatches.length} 行`,
      `伸ばす箇所の不一致 ${stretchMismatches.length} 行`,
      `ふりがなの不一致 ${notationMismatches.furigana.length} 行`,
      `注の不一致 ${notationMismatches.notes.length} 行`,
      `別の読みの不一致 ${notationMismatches.alternatives.length} 行`,
      `余韻の印の不一致 ${notationMismatches.yoin.length} 札`,
      ...(values.check ? [`資料から作り直した表との差 ${unchanged ? 'なし' : 'あり'}`] : []),
    ].join('\n'),
  );
  if (problems.length > 0 || !unchanged) {
    if (problems.length > 0) console.log(`確かめる行：${problems.join('、')}`);
    process.exitCode = 1;
    return;
  }
  // 印の位置は一覧の読みの中の位置なので、発音が一覧と合わない表は印がずれている。合うときだけ書き込む。
  if (!values.check) writeFileSync(TABLE, table);
}

main();
