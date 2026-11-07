export type SourcePage = { title: string; command?: string; readName?: string; tool?: boolean; slug?: string; markdown: string };
export type DocumentParts = {
  title: string;
  // ページの URL のパス。ないページ（404.html）は、どの URL にも出るので持たない。
  path?: string;
  bodyHtml: string;
  scriptPath: string;
  stylePaths: readonly string[];
  command?: string;
  readName?: string;
  tool?: boolean;
};

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };

const escapeHtml = (text: string) => text.replace(/[&<>"]/g, (character) => HTML_ESCAPES[character]);

export function parseSource(source: string): SourcePage {
  const match = source.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  const fields = new Map((match?.[1].split('\n') ?? []).map((line) => [line.slice(0, line.indexOf(':')), line.slice(line.indexOf(':') + 1).trim()]));
  const title = fields.get('title');
  if (!match || !title) throw new Error('先頭に title の行がない Markdown は組み立てられません');
  const command = fields.get('command');
  const readName = fields.get('read');
  const slug = fields.get('slug');
  if (slug !== undefined && !SLUG.test(slug)) throw new Error(`slug「${slug}」は英小文字、数字、ハイフンを / で区切って書きます`);
  return {
    title,
    ...(command ? { command } : {}),
    ...(readName ? { readName } : {}),
    ...(fields.get('tool') === 'true' ? { tool: true } : {}),
    ...(slug ? { slug } : {}),
    markdown: match[2],
  };
}

// 読んだ行にはファイルの名前を日本語のまま出すが、URL は共有しやすい英字にする（docs/ui-guide.md の8節）。
const SLUG = /^[a-z0-9-]+(\/[a-z0-9-]+)*$/;

export function outputPathOf(contentPath: string, slug?: string): string {
  const route = slug ?? contentPath.replace(/\.md$/, '');
  return route === 'index' ? 'index.html' : `${route}/index.html`;
}

export type Run = { command?: string; readName?: string };

// 実行の行と読んだ行はコマンドの表（.claude/skills/yomimasu/scripts/commands.ts）から引き、Markdown の先頭の行は表と食い違わないかだけを見る。
// 読んだ行には、その画面の content/ のファイルの名前を出す（docs/ui-guide.md の8節）。
export function runFor(sourcePath: string, page: Run, fromTable: { say: string; read?: string } | undefined): Run {
  if (!fromTable) return page;
  const { say, read } = fromTable;
  if (page.command !== undefined && page.command !== say) throw new Error(`${sourcePath} の command「${page.command}」が、コマンドの表の「${say}」と違います`);
  if (page.readName !== undefined && page.readName !== read) throw new Error(`${sourcePath} の read「${page.readName}」が、コマンドの表の「${read}」と違います`);
  const fileName = sourcePath.split('/').at(-1);
  if (read !== undefined && read !== fileName) throw new Error(`コマンドの表の読んだ行「${read}」が、${sourcePath} のファイルの名前と違います`);
  return read === undefined ? { command: say } : { command: say, readName: read };
}

function runLines(command: string | undefined, readName: string | undefined): string {
  if (!command) return '';
  const read = readName ? `<div class="read">● Read ${escapeHtml(readName)}</div>` : '';
  return `<div class="run"><div><span class="gt">&gt;</span> <span data-run>/yomimasu ${escapeHtml(command)}</span></div>${read}</div>`;
}

// 入力の行は飾りで、自由入力の欄は作らない。押せるのは本文の中のリンクとボタンだけで、押したものを殻（client/ui/shell.ts）がここへ打ち込む。
const ASK_LINE = '<div class="ask-line"><span class="gt">&gt;</span> <span data-typed>/yomimasu </span><span class="caret"></span></div>';

// Markdown では本文の並びしか書けないので、入力の行の下に置く次の操作や一覧と、その下の下端の行は印で分ける。
const ASK_MARK = '<!-- ask -->';
const FOOT_MARK = '<!-- foot -->';

// JS がないときは入口へのリンクとして働く。JS があれば殻が行き先を尋ねる（docs/ui-guide.md の8節「戻る」）。
const BACK = '<a class="btn btn--line back" href="/" data-back>戻る</a>';
const BACK_ROW = `<div class="back-row">${BACK}</div>`;
const FILL = /<a class="btn btn--fill"[^>]*>[\s\S]*?<\/a>/;

function withBack(next: string): string {
  return FILL.test(next) ? next.replace(FILL, (fill) => `<div class="main-row">${fill}${BACK}</div>`) : next + BACK_ROW;
}

function screenHtml(bodyHtml: string, tool: boolean | undefined, back: boolean): string {
  const [body, foot = ''] = bodyHtml.split(FOOT_MARK);
  const at = body.indexOf(ASK_MARK);
  const [main, next] = at === -1 ? [body, ''] : [body.slice(0, at), body.slice(at + ASK_MARK.length)];
  if (tool) return main + next + (back ? BACK_ROW : '') + foot;
  return `${main}<section class="ask">${ASK_LINE}${back ? withBack(next) : next}</section>${foot}`;
}

// 共有したときの URL と画像は、プレビューの URL で開いても本番を指すよう、本番のオリジンで書く。
const ORIGIN = 'https://yomimasu.karutalog.com';
const SITE_NAME = '/yomimasu';
// 題と説明の文は 2026-11-07 にユーザーが決めた（docs/decisions.md）。入口の題は、アプリの名前のあとに入口の標語と題を続ける。
const HOME_TITLE = `${SITE_NAME} - 競技かるたにかかわるすべての人に、読みを身近に。「読みます」と言うために。`;
// 説明は今はサイトで1つにする。ページごとに替えるときは DocumentParts に足す。
const DESCRIPTION = '競技かるたの読みを、家で録音して測り、次に直す1点を受け取る Web アプリ。総論、ポイント、100首の読み方も学べます。';
// 画像は scripts/brand/make.ts が作る。
const OG_IMAGE = { url: `${ORIGIN}/og.png`, width: 1200, height: 630, alt: '「読みます」と言うために。かなで描いた読手の絵' };

const documentTitle = (title: string, path?: string) => (path === '/' ? HOME_TITLE : `${title} - ${SITE_NAME}`);

const meta = (key: 'name' | 'property', name: string, content: string | number) => `<meta ${key}="${name}" content="${escapeHtml(String(content))}">`;

// SNS は JS を動かさずに head を読むので、題、説明、アイコン、共有したときの絵は組み立てのときに書く。殻（client/ui/shell.ts）が入れ替えるのは題だけである。
function headTags(title: string, path: string | undefined): string {
  return [
    `<title>${escapeHtml(title)}</title>`,
    meta('name', 'description', DESCRIPTION),
    '<link rel="icon" href="/favicon.ico" sizes="16x16 32x32 48x48">',
    '<link rel="apple-touch-icon" href="/apple-touch-icon.png">',
    meta('property', 'og:type', 'website'),
    meta('property', 'og:site_name', SITE_NAME),
    meta('property', 'og:locale', 'ja_JP'),
    meta('property', 'og:title', title),
    meta('property', 'og:description', DESCRIPTION),
    ...(path === undefined ? [] : [meta('property', 'og:url', `${ORIGIN}${path}`)]),
    meta('property', 'og:image', OG_IMAGE.url),
    meta('property', 'og:image:width', OG_IMAGE.width),
    meta('property', 'og:image:height', OG_IMAGE.height),
    meta('property', 'og:image:alt', OG_IMAGE.alt),
    meta('name', 'twitter:card', 'summary_large_image'),
  ].join('\n');
}

// 「戻る」は入口のほかのどの画面にも置く（docs/ui-guide.md の8節「戻る」）。ここで置くのは教科書のページ、つまり読んだ行のある画面である。
// 読む流れ（聞く、読む、練習モード、結果、前回と比べる）は、画面の部品が置く（client/ui/back.tsx）。主の操作が部品の中にあって状態で替わり、録音中は出さないからである。
export function renderDocument({ title, path, bodyHtml, scriptPath, stylePaths, command, readName, tool }: DocumentParts): string {
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
${headTags(documentTitle(title, path), path)}
${stylePaths.map((path) => `<link rel="stylesheet" href="${path}">`).join('\n')}
</head>
<body>
<div class="app">
<header class="bar"><a href="/">/yomimasu</a><span class="step"></span></header>
<main tabindex="-1"><div class="${tool ? 'screen screen--stage' : 'screen'}">${runLines(command, readName)}${screenHtml(bodyHtml, tool, readName !== undefined)}</div></main>
</div>
<script type="module" src="${scriptPath}"></script>
</body>
</html>
`;
}
