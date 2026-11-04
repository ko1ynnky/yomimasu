// 読手テキスト抜粋版の読み方一覧を、語の座標と画像の位置から札ごとの列に戻す。
// 本文の列の字は照合にだけ使い、ファイルにも標準出力にも書き出さない。
// 表に入れるのは、伸ばしの印の位置と、ふりがな、注、別の読み、余韻の印である。

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

type Box = { x: number; right: number; y: number; bottom: number; text: string };

// ふりがなが続いて掛かる本文の字の並びである。start は reading の中の位置、text は一覧のふりがなの字で、注の括弧を含む。
// base は照合にだけ使う。
export type ListRuby = { start: number; text: string; base: string };

export type ListLine = {
  plain: string; // 本文の列の字。伸ばしの印は含まない
  marked: string; // 本文の列の字と伸ばしの印
  reading: string; // 本文の字をふりがなと注で置き換えた読み
  marks: number[]; // reading の中で伸ばしの印がある位置
  rubies: ListRuby[];
  alternative: string | null; // 本文の右の遠い列の別の読み。伸ばしの印は「ー」に揃える
};

export type ListCard = { no: number; page: number; upper: ListLine; lower: ListLine; yoin: boolean };

const FIRST_PDF_PAGE = 6;
const LAST_PDF_PAGE = 16;
const MAIN_GLYPH_WIDTH = 14;
const SMALL_MARK_WIDTH = 9;
const RUBY_WIDTH = 8;
const NUMBER_WIDTHS = [4, 8.1, 12.1];
const LIST_TOP = 80;
const LIST_BOTTOM = 640;
const SAME_COLUMN = 6;
// 本文の列の右に2列ある。近い方がふりがなと注、遠い方が別の読みである。
const RUBY_OFFSET = [12, 16];
const ALTERNATIVE_OFFSET = [20, 24];
// 余韻の印は、下の句の最後の字のすぐ下に置いた画像である。
const YOIN_GAP = 4;
// 別の読みの列は、句の途中の伸ばしを短い線、句の終わりを長い線で刷っている。本文の列の大小2つの印と同じく、どちらも伸ばしの印として扱う。
const ALTERNATIVE_MARKS = /[‐ー]/g;

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

// pdftotext は画像の位置を出さないので pdftohtml を使う。pdftohtml は -stdout でも画像のファイルを PDF の隣に書くので、一時フォルダーに書かせて消す。
function imagesOf(pdf: string): Box[][] {
  const dir = mkdtempSync(join(tmpdir(), 'yomimasu-list-'));
  try {
    execFileSync('pdftohtml', ['-xml', '-q', '-zoom', '1', '-f', String(FIRST_PDF_PAGE), '-l', String(LAST_PDF_PAGE), pdf, join(dir, 'list')]);
    return readFileSync(join(dir, 'list.xml'), 'utf8')
      .split('<page ')
      .slice(1)
      .map((page) =>
        [...page.matchAll(/<image top="([\d.]+)" left="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/g)].map((m) => ({
          x: Number(m[2]),
          y: Number(m[1]),
          right: Number(m[2]) + Number(m[3]),
          bottom: Number(m[1]) + Number(m[4]),
          text: '',
        })),
      );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
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
    const last = clusters.at(-1);
    if (last && ruby.y - last.bottom < 3) {
      last.text += ruby.text;
      last.bottom = ruby.bottom;
    } else {
      clusters.push({ top: ruby.y, bottom: ruby.bottom, text: ruby.text });
    }
  }
  return clusters;
}

function readLine(glyphs: Box[], rubies: Box[], far: Box[], no: number): ListLine {
  const clusters = rubyClusters(rubies);
  const covering = (glyph: Box) => clusters.find((c) => c.top <= centerY(glyph) && centerY(glyph) <= c.bottom);
  let plain = '';
  let marked = '';
  let reading = '';
  const marks: number[] = [];
  const found: ListRuby[] = [];
  const used = new Set<object>();
  // ふりがなの塊の切れ目は字の間隔で決めるので、隣の語のふりがなとつながることも、1語のふりがなが割れることもある。
  // 塊のままでは持たず、ふりがなの掛かる字が続く範囲にまとめ、語への分け方は表の仮名と照らして決める。
  let run: ListRuby | null = null;
  for (const glyph of glyphs) {
    const cluster = covering(glyph);
    if (glyph.text === 'ー') {
      if (cluster) throw new Error(`${no} 番のふりがなの途中に伸ばしの印がある`);
      marks.push(reading.length);
      marked += 'ー';
      run = null;
      continue;
    }
    plain += glyph.text;
    marked += glyph.text;
    if (!cluster) {
      reading += glyph.text;
      run = null;
      continue;
    }
    if (!run) {
      run = { start: reading.length, text: '', base: '' };
      found.push(run);
    }
    run.base += glyph.text;
    if (!used.has(cluster)) {
      used.add(cluster);
      run.text += cluster.text;
      reading += cluster.text.replace(/[()]/g, '');
    }
  }
  if (used.size !== clusters.length) throw new Error(`${no} 番に、本文の字に掛からないふりがながある`);
  const alternative = far.length === 0 ? null : [...far].sort((a, b) => a.y - b.y).map((b) => b.text).join('').replace(ALTERNATIVE_MARKS, 'ー');
  return { plain, marked, reading, marks, rubies: found, alternative };
}

function hasYoin(images: Box[], center: number, last: Box, no: number): boolean {
  const inColumn = images.filter((image) => Math.abs(centerX(image) - center) <= SAME_COLUMN);
  if (inColumn.some((image) => Math.abs(image.y - last.bottom) > YOIN_GAP)) throw new Error(`${no} 番の列に、下の句の終わりから離れた画像がある`);
  if (inColumn.length > 1) throw new Error(`${no} 番の下の句の終わりに画像が2つある`);
  return inColumn.length === 1;
}

export function readList(pdf: string): ListCard[] {
  const cards: ListCard[] = [];
  const images = imagesOf(pdf);
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
      const beside = ([from, to]: number[]) =>
        boxes.filter((b) => b.y > LIST_TOP && widthOf(b) === RUBY_WIDTH && b.x - left >= from && b.x - left <= to);
      const middle = (glyphs[split - 1].bottom + glyphs[split].y) / 2;
      const upperOf = (side: Box[]) => side.filter((r) => centerY(r) < middle);
      const lowerOf = (side: Box[]) => side.filter((r) => centerY(r) >= middle);
      const rubies = beside(RUBY_OFFSET);
      const far = beside(ALTERNATIVE_OFFSET);
      cards.push({
        no,
        page,
        upper: readLine(glyphs.slice(0, split), upperOf(rubies), upperOf(far), no),
        lower: readLine(glyphs.slice(split), lowerOf(rubies), lowerOf(far), no),
        yoin: hasYoin(images[index], center, glyphs.at(-1)!, no),
      });
    }
  });
  const numbers = cards.map((card) => card.no).sort((a, b) => a - b);
  if (numbers.length !== 101 || numbers.some((no, i) => no !== i)) throw new Error('一覧から序歌と100首を1枚ずつ読み取れなかった');
  return cards.sort((a, b) => a.no - b.no);
}
