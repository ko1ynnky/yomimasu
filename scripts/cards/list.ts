// 読手テキスト抜粋版の読み方一覧を、語の座標から札ごとの列に戻す。
// 取り出した本文とふりがなは照合にだけ使い、ファイルにも標準出力にも書き出さない。

import { execFileSync } from 'node:child_process';

type Box = { x: number; right: number; y: number; bottom: number; text: string };

export type ListLine = {
  plain: string; // 本文の列の字。伸ばしの印は含まない
  marked: string; // 本文の列の字と伸ばしの印
  reading: string; // 本文の字をふりがなで置き換えた読み
  marks: number[]; // reading の中で伸ばしの印がある位置
};

export type ListCard = { no: number; page: number; upper: ListLine; lower: ListLine };

const FIRST_PDF_PAGE = 6;
const LAST_PDF_PAGE = 16;
const MAIN_GLYPH_WIDTH = 14;
const SMALL_MARK_WIDTH = 9;
const RUBY_WIDTH = 8;
const NUMBER_WIDTHS = [4, 8.1, 12.1];
const LIST_TOP = 80;
const LIST_BOTTOM = 640;
const SAME_COLUMN = 6;
// 本文の列の右に2列ある。近い方がふりがな、遠い方が別の読みである。別の読みは使わない。
const RUBY_OFFSET = [12, 16];

const widthOf = (box: Box) => Math.round((box.right - box.x) * 10) / 10;
const centerX = (box: Box) => (box.x + box.right) / 2;
const centerY = (box: Box) => (box.y + box.bottom) / 2;

function pagesOf(pdf: string): Box[][] {
  const xml = execFileSync('pdftotext', ['-f', String(FIRST_PDF_PAGE), '-l', String(LAST_PDF_PAGE), '-bbox', pdf, '-'], {
    encoding: 'utf8',
    maxBuffer: 1 << 26,
  });
  return xml
    .split('<page ')
    .slice(1)
    .map((page) =>
      [...page.matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)<\/word>/g)].map((m) => ({
        x: Number(m[1]),
        y: Number(m[2]),
        right: Number(m[3]),
        bottom: Number(m[4]),
        text: m[5],
      })),
    );
}

function columnCenters(boxes: Box[]): number[] {
  const centers: number[] = [];
  for (const box of boxes.filter((b) => widthOf(b) === MAIN_GLYPH_WIDTH).sort((a, b) => b.x - a.x)) {
    if (centers.length === 0 || Math.abs(centers.at(-1)! - centerX(box)) > SAME_COLUMN) centers.push(centerX(box));
  }
  return centers;
}

function rubyClusters(rubies: Box[]): { top: number; bottom: number; text: string }[] {
  const clusters: { top: number; bottom: number; text: string }[] = [];
  for (const ruby of [...rubies].sort((a, b) => a.y - b.y)) {
    const text = ruby.text === '(' || ruby.text === ')' ? '' : ruby.text;
    const last = clusters.at(-1);
    if (last && ruby.y - last.bottom < 3) {
      last.text += text;
      last.bottom = ruby.bottom;
    } else {
      clusters.push({ top: ruby.y, bottom: ruby.bottom, text });
    }
  }
  return clusters;
}

function readLine(glyphs: Box[], rubies: Box[], no: number): ListLine {
  const clusters = rubyClusters(rubies);
  const covering = (glyph: Box) => clusters.find((c) => c.top <= centerY(glyph) && centerY(glyph) <= c.bottom);
  let plain = '';
  let marked = '';
  let reading = '';
  const marks: number[] = [];
  const used = new Set<object>();
  for (const glyph of glyphs) {
    const cluster = covering(glyph);
    if (glyph.text === 'ー') {
      if (cluster) throw new Error(`${no} 番のふりがなの途中に伸ばしの印がある`);
      marks.push(reading.length);
      marked += 'ー';
      continue;
    }
    plain += glyph.text;
    marked += glyph.text;
    if (!cluster) {
      reading += glyph.text;
    } else if (!used.has(cluster)) {
      used.add(cluster);
      reading += cluster.text;
    }
  }
  return { plain, marked, reading, marks };
}

export function readList(pdf: string): ListCard[] {
  const cards: ListCard[] = [];
  pagesOf(pdf).forEach((boxes, index) => {
    const page = index + FIRST_PDF_PAGE - 1;
    const body = boxes.filter((b) => {
      const width = widthOf(b);
      return b.y > LIST_TOP - 20 && b.y < LIST_BOTTOM && width >= SMALL_MARK_WIDTH && width <= MAIN_GLYPH_WIDTH && !NUMBER_WIDTHS.includes(width);
    });
    for (const center of columnCenters(boxes)) {
      const glyphs = body.filter((b) => Math.abs(centerX(b) - center) <= SAME_COLUMN).sort((a, b) => a.y - b.y);
      if (glyphs.length === 0 || /^[『【]/.test(glyphs[0].text)) continue;
      const number = boxes.find((b) => NUMBER_WIDTHS.includes(widthOf(b)) && /^\d+$/.test(b.text) && b.y < LIST_TOP && Math.abs(centerX(b) - center) < 16);
      const no = number ? Number(number.text) : 0;
      const gaps = glyphs.slice(1).map((glyph, i) => glyph.y - glyphs[i].bottom);
      const split = gaps.indexOf(Math.max(...gaps)) + 1;
      const left = center - MAIN_GLYPH_WIDTH / 2;
      const rubies = boxes.filter((b) => {
        const offset = b.x - left;
        return b.y > LIST_TOP && widthOf(b) === RUBY_WIDTH && offset >= RUBY_OFFSET[0] && offset <= RUBY_OFFSET[1];
      });
      const middle = (glyphs[split - 1].bottom + glyphs[split].y) / 2;
      const upperRubies = rubies.filter((r) => centerY(r) < middle);
      const lowerRubies = rubies.filter((r) => centerY(r) >= middle);
      cards.push({
        no,
        page,
        upper: readLine(glyphs.slice(0, split), upperRubies, no),
        lower: readLine(glyphs.slice(split), lowerRubies, no),
      });
    }
  });
  const numbers = cards.map((card) => card.no).sort((a, b) => a - b);
  if (numbers.length !== 101 || numbers.some((no, i) => no !== i)) throw new Error('一覧から序歌と100首を1枚ずつ読み取れなかった');
  return cards.sort((a, b) => a.no - b.no);
}
