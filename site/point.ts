// 「ポイントを知る」のテーマの目次（docs/ui-guide.md の6節）。テーマの見出しと、その下のたたんだ行の数から組み立てる。
// 数を Markdown に手で書くと、行を足し引きしたときに目次と食い違う。

const THEME = /<h3 id="(t-[a-z0-9-]+)">([^<]+)<\/h3>/g;
// 行の中の折りたたみ（「ん」の説明の details.more）は数えない。
const ROW = /<details class="pt"[\s>]/g;

export function themeTocHtml(html: string): string {
  const themes = [...html.matchAll(THEME)];
  if (themes.length === 0) throw new Error('テーマの見出し（<h3 id="t-…">）がないので、目次を組み立てられません');
  const links = themes.map((theme, i) => {
    const rows = html.slice(theme.index + theme[0].length, themes[i + 1]?.index ?? html.length).match(ROW)?.length ?? 0;
    return `<a href="#${theme[1]}">${theme[2]}<small>${rows}</small></a>`;
  });
  return `<nav class="card toc" aria-label="テーマ">${links.join('')}</nav>`;
}
