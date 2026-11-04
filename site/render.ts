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

function runLines(command: string | undefined, readName: string | undefined): string {
  if (!command) return '';
  const read = readName ? `<div class="read">● Read ${escapeHtml(readName)}</div>` : '';
  return `<div class="run"><div><span class="gt">&gt;</span> /yomimasu ${escapeHtml(command)}</div>${read}</div>`;
}

// 入力の行は飾りで、自由入力の欄は作らない。押せるのは本文の中のリンクとボタンだけである。
const ASK_LINE = '<div class="ask-line"><span class="gt">&gt;</span> /yomimasu <span class="caret"></span></div>';

// Markdown では本文の並びしか書けないので、入力の行の下に置く次の操作や一覧は印で分ける。
const ASK_MARK = '<!-- ask -->';

function screenHtml(bodyHtml: string, tool: boolean | undefined): string {
  const at = bodyHtml.indexOf(ASK_MARK);
  const [main, next] = at === -1 ? [bodyHtml, ''] : [bodyHtml.slice(0, at), bodyHtml.slice(at + ASK_MARK.length)];
  return tool ? main + next : `${main}<section class="ask">${ASK_LINE}${next}</section>`;
}

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
<main><div class="${tool ? 'screen screen--stage' : 'screen'}">${runLines(command, readName)}${screenHtml(bodyHtml, tool)}</div></main>
</div>
<script type="module" src="${scriptPath}"></script>
</body>
</html>
`;
}
