import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { marked } from 'marked';
import { build } from 'vite';
import deck from '../.claude/skills/yomimasu/assets/cards.json' with { type: 'json' };
import type { Card } from '../.claude/skills/yomimasu/scripts/cards.ts';
import { mouthFiguresHtml, nasalEndingsText, nasalFigureHtml } from '../content/karuta/mouth.ts';
import { cardPage, expandCardRefs, finalSoundCounts, listHtml, parseAdvice } from './karuta.ts';
import { outputPathOf, parseSource, renderDocument } from './render.ts';

const CONTENT_DIR = 'content';
const OUT_DIR = 'dist';
const CLIENT_ENTRY = 'site/client/main.ts';
const ADVICE_PATH = '.claude/skills/yomimasu/references/card-advice-candidates.md';
// 100首の一覧は札の読みの表から組むので、一覧.md には置き場の印だけを書く。
const LIST_MARK = '<!-- 100首の一覧 -->';
const FINAL_SOUND_MARK = '<!-- 最後の音の数 -->';
// 口の形の図と「ん」の数も、文に書き写さず、組み立てのたびに作る。
const MARKS: Record<string, () => string> = {
  '<!-- 最後の音の口の形 -->': mouthFiguresHtml,
  '<!-- 「ん」の位置の図 -->': nasalFigureHtml,
  '<!-- 「ん」で終わる札の数 -->': () => nasalEndingsText(cards),
};

await build({
  logLevel: 'warn',
  publicDir: 'site/public',
  oxc: { jsx: { runtime: 'automatic', importSource: 'preact' } },
  build: { outDir: OUT_DIR, manifest: true, rollupOptions: { input: CLIENT_ENTRY } },
});

const manifestDir = join(OUT_DIR, '.vite');
const manifest = JSON.parse(readFileSync(join(manifestDir, 'manifest.json'), 'utf8'));
const scriptPath = `/${manifest[CLIENT_ENTRY].file}`;
const stylePaths = (manifest[CLIENT_ENTRY].css ?? []).map((file: string) => `/${file}`);
rmSync(manifestDir, { recursive: true });

const cards = deck.cards as unknown as Card[];

function writePage(path: string, html: string) {
  const outputPath = join(OUT_DIR, path);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, html);
}

for (const entry of readdirSync(CONTENT_DIR, { recursive: true, withFileTypes: true })) {
  if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
  const sourcePath = join(entry.parentPath, entry.name);
  const { title, command, readName, tool, slug, markdown } = parseSource(readFileSync(sourcePath, 'utf8'));
  const parsed = (await marked.parse(markdown)).replace(LIST_MARK, () => listHtml(cards)).replace(FINAL_SOUND_MARK, () => finalSoundCounts(cards));
  const bodyHtml = expandCardRefs(Object.entries(MARKS).reduce((html, [mark, make]) => html.replace(mark, make), parsed), cards);
  writePage(outputPathOf(relative(CONTENT_DIR, sourcePath), slug), renderDocument({ title, bodyHtml, scriptPath, stylePaths, command, readName, tool }));
}

// 1首のページは手で書かず、札の読みの表、規則、助言の候補から組む。表が変わってもページが追いつくようにするためである。
const advice = parseAdvice(readFileSync(ADVICE_PATH, 'utf8'));
for (const card of cards) {
  const { path, title, command, readName, bodyHtml } = cardPage(card, cards, advice);
  writePage(path, renderDocument({ title, bodyHtml, scriptPath, stylePaths, command, readName }));
}
