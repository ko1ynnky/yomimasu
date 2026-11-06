export type SourcePage = { title: string; command?: string; readName?: string; tool?: boolean; slug?: string; markdown: string };
export type DocumentParts = {
  title: string;
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

// 「戻る」は入口のほかのどの画面にも置く決まりだが、読む流れ（聞く、読む、練習モード、結果）に置くのは別の作業（Y-18）である。
// 今は教科書のページ、つまり読んだ行のある画面にだけ置く。
export function renderDocument({ title, bodyHtml, scriptPath, stylePaths, command, readName, tool }: DocumentParts): string {
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(title)}</title>
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
