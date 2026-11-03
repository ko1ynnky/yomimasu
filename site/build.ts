import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { marked } from 'marked';
import { build } from 'vite';
import { outputPathOf, parseSource, renderDocument } from './render.ts';

const CONTENT_DIR = 'content';
const OUT_DIR = 'dist';
const CLIENT_ENTRY = 'site/client/main.ts';

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

for (const entry of readdirSync(CONTENT_DIR, { recursive: true, withFileTypes: true })) {
  if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
  const sourcePath = join(entry.parentPath, entry.name);
  const { title, command, readName, tool, markdown } = parseSource(readFileSync(sourcePath, 'utf8'));
  const outputPath = join(OUT_DIR, outputPathOf(relative(CONTENT_DIR, sourcePath)));
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, renderDocument({ title, bodyHtml: await marked.parse(markdown), scriptPath, stylePaths, command, readName, tool }));
}
