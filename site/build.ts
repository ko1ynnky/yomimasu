import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { marked } from 'marked';
import { build } from 'vite';
import deck from '../.claude/skills/yomimasu/assets/cards.json' with { type: 'json' };
import type { Card } from '../.claude/skills/yomimasu/scripts/cards.ts';
import { commandAt } from '../.claude/skills/yomimasu/scripts/commands.ts';
import { mouthFiguresHtml, nasalEndingsText, nasalFigureHtml } from '../content/karuta/mouth.ts';
import { INSTALL_MARKS, isOffered } from './install.ts';
import { cardName, cardPage, cardUrl, expandCardRefs, finalSoundCounts, listHtml, parseAdvice } from './karuta.ts';
import { kimarijiStream } from './kimariji-stream.ts';
import { themeTocHtml } from './point.ts';
import { outputPathOf, parseSource, renderDocument, runFor } from './render.ts';
import { chatgptPluginZip, skillZip } from './skill-zip.ts';

const CONTENT_DIR = 'content';
const OUT_DIR = 'dist';
// 画面の部品（main.ts）と、本文を入れ替える殻（ui/shell.ts）を読み込む入口である。
const CLIENT_ENTRY = 'site/client/ui/app.ts';
const ADVICE_PATH = '.claude/skills/yomimasu/references/card-advice-candidates.md';
// 100首の一覧は札の読みの表から組むので、一覧.md には置き場の印だけを書く。
const LIST_MARK = '<!-- 100首の一覧 -->';
const FINAL_SOUND_MARK = '<!-- 最後の音の数 -->';
// 「ポイントを知る」のテーマの目次は、組み立てたページの見出しと行から作る（site/point.ts）。
const THEME_TOC_MARK = '<!-- テーマの目次 -->';
// 口の形の図と「ん」の数も、文に書き写さず、組み立てのたびに作る。
const MARKS: Record<string, () => string> = {
  '<!-- 最後の音の口の形 -->': mouthFiguresHtml,
  '<!-- 「ん」の位置の図 -->': nasalFigureHtml,
  '<!-- 「ん」で終わる札の数 -->': () => nasalEndingsText(cards),
  ...INSTALL_MARKS,
};

const cards = deck.cards as unknown as Card[];

await build({
  logLevel: 'warn',
  publicDir: 'site/public',
  oxc: { jsx: { runtime: 'automatic', importSource: 'preact' } },
  // 入口の絵の決まり字の列は、札の読みの表から組み立てのたびに作り、絵の処理と同じファイルに入れる（client/kv.ts）。
  define: { __KIMARIJI_STREAM__: JSON.stringify(kimarijiStream(cards)) },
  build: { outDir: OUT_DIR, manifest: true, rollupOptions: { input: CLIENT_ENTRY } },
});

const manifestDir = join(OUT_DIR, '.vite');
const manifest = JSON.parse(readFileSync(join(manifestDir, 'manifest.json'), 'utf8'));
const scriptPath = `/${manifest[CLIENT_ENTRY].file}`;
const stylePaths = (manifest[CLIENT_ENTRY].css ?? []).map((file: string) => `/${file}`);
rmSync(manifestDir, { recursive: true });

const cardNames = new Map(cards.map((card) => [cardUrl(card.no).split('/')[2], cardName(card)]));
const urlOf = (outputPath: string) => `/${outputPath.replace(/index\.html$/, '')}`;

function writePage(path: string, html: string) {
  const outputPath = join(OUT_DIR, path);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, html);
}

for (const entry of readdirSync(CONTENT_DIR, { recursive: true, withFileTypes: true })) {
  if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
  const sourcePath = join(entry.parentPath, entry.name);
  const contentPath = relative(CONTENT_DIR, sourcePath);
  const { title, command, readName, tool, slug, markdown } = parseSource(readFileSync(sourcePath, 'utf8'));
  const outputPath = outputPathOf(contentPath, slug);
  if (!isOffered(urlOf(outputPath))) continue;
  const run = runFor(contentPath, { command, readName }, commandAt(urlOf(outputPath), (token) => cardNames.get(token)));
  const rendered = await marked.parse(markdown);
  const parsed = rendered
    .replace(LIST_MARK, () => listHtml(cards))
    .replace(FINAL_SOUND_MARK, () => finalSoundCounts(cards))
    .replace(THEME_TOC_MARK, () => themeTocHtml(rendered));
  const bodyHtml = expandCardRefs(Object.entries(MARKS).reduce((html, [mark, make]) => html.replace(mark, make), parsed), cards);
  writePage(outputPath, renderDocument({ title, path: urlOf(outputPath), bodyHtml, scriptPath, stylePaths, ...run, tool }));
}

// 1首のページは手で書かず、札の読みの表、規則、助言の候補から組む。表が変わってもページが追いつくようにするためである。
const advice = parseAdvice(readFileSync(ADVICE_PATH, 'utf8'));
for (const card of cards) {
  const { path, title, command, readName, bodyHtml } = cardPage(card, cards, advice);
  writePage(path, renderDocument({ title, path: urlOf(path), bodyHtml, scriptPath, stylePaths, command, readName }));
}

// AI に入れる手順の画面が配るスキルのファイル。保存のボタンは <a href="/yomimasu.zip" download> である（docs/ui-guide.md の8節）。
// ChatGPT にだけは、同じ知識をプラグインのアーカイブの形で配る（site/skill-zip.ts）。
writeFileSync(join(OUT_DIR, 'yomimasu.zip'), skillZip());
writeFileSync(join(OUT_DIR, 'yomimasu-chatgpt.zip'), chatgptPluginZip());
