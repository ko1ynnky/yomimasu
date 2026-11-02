export type SourcePage = { title: string; markdown: string };
export type DocumentParts = { title: string; bodyHtml: string; scriptPath: string };

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };

const escapeHtml = (text: string) => text.replace(/[&<>"]/g, (character) => HTML_ESCAPES[character]);

export function parseSource(source: string): SourcePage {
  const match = source.match(/^---\ntitle: (.+)\n---\n([\s\S]*)$/);
  if (!match) throw new Error('先頭に title の行がない Markdown は組み立てられません');
  return { title: match[1], markdown: match[2] };
}

export function outputPathOf(contentPath: string): string {
  const route = contentPath.replace(/\.md$/, '');
  return route === 'index' ? 'index.html' : `${route}/index.html`;
}

export function renderDocument({ title, bodyHtml, scriptPath }: DocumentParts): string {
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
</head>
<body>
<main>${bodyHtml}</main>
<script type="module" src="${scriptPath}"></script>
</body>
</html>
`;
}
