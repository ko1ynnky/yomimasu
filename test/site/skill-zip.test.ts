import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { test } from 'node:test';
import { editionSkill, skillZip } from '../../site/skill-zip.ts';

const SKILL_DIR = '.claude/skills/yomimasu';

// 自分で書いた ZIP を自分の読み方で読むと、書き方の誤りを読み方が同じに誤って見逃す。展開は別の実装（Info-ZIP の unzip）に任せる。
function unpack(): { dir: string; files: string[]; dirs: string[] } {
  const work = mkdtempSync(join(tmpdir(), 'yomimasu-zip-'));
  const zipPath = join(work, 'yomimasu.zip');
  writeFileSync(zipPath, skillZip());
  execFileSync('unzip', ['-tq', zipPath]);
  const dir = join(work, 'out');
  execFileSync('unzip', ['-q', zipPath, '-d', dir]);
  const entries = readdirSync(dir, { recursive: true, withFileTypes: true });
  const pathOf = (entry: (typeof entries)[number]) => relative(dir, join(entry.parentPath, entry.name)).split('\\').join('/');
  return { dir, files: entries.filter((e) => e.isFile()).map(pathOf).sort(), dirs: entries.filter((e) => e.isDirectory()).map(pathOf).sort() };
}

const unpacked = unpack();
const read = (path: string) => readFileSync(join(unpacked.dir, path), 'utf8');

test('展開すると一番上は yomimasu/ のフォルダー1つで、その中に SKILL.md がある', () => {
  assert.deepEqual(readdirSync(unpacked.dir), ['yomimasu']);
  assert.ok(unpacked.files.includes('yomimasu/SKILL.md'));
  assert.match(read('yomimasu/SKILL.md'), /^---\nname: yomimasu\n/);
});

test('入るのは Gemini が受け付ける Markdown だけで、音声、鍵、スクリプト、表のデータを含まない', () => {
  for (const path of unpacked.files) assert.match(path, /^yomimasu\/[^.][^/]*(\/[^.][^/]*)*\.md$/, path);
  assert.ok(!unpacked.dirs.some((dir) => /(^|\/)(scripts|assets)$/.test(dir)), unpacked.dirs.join(','));
});

test('スキルのフォルダーの外のものは、添えた利用の条件（NOTICE.md）のほかに入らない', () => {
  const outside = unpacked.files.filter((path) => !existsSync(join(SKILL_DIR, path.replace(/^yomimasu\//, ''))));
  assert.deepEqual(outside, ['yomimasu/NOTICE.md']);
});

test('知識の文章は、スキルの references/ のすべての Markdown を、書き換えずに入れる', () => {
  const expected = readdirSync(join(SKILL_DIR, 'references')).filter((name) => name.endsWith('.md')).sort();
  const actual = unpacked.files.filter((path) => path.startsWith('yomimasu/references/')).map((path) => path.split('/').at(-1)!);
  assert.deepEqual(actual, expected);
  for (const name of expected) assert.equal(read(`yomimasu/references/${name}`), readFileSync(join(SKILL_DIR, 'references', name), 'utf8'), name);
});

test('SKILL.md の写しは、入れなかったフォルダーとその場合の答え方を知らせ、ほかはリポジトリの SKILL.md のままである', () => {
  const copy = read('yomimasu/SKILL.md');
  const section = copy.match(/## この ZIP の版\n\n([^\n]+)\n\n/)?.[1] ?? '';
  assert.match(section, /`assets\/` と `scripts\/` を入れていない/);
  assert.match(section, /推測で答えない/);
  assert.match(section, /この版では測れないと伝え/);
  assert.equal(copy.replace(/## この ZIP の版\n\n[^\n]+\n\n/, ''), readFileSync(join(SKILL_DIR, 'SKILL.md'), 'utf8'));
});

test('利用の条件として、リポジトリの NOTICE.md の全文と LICENSE の本文を添える', () => {
  const notice = read('yomimasu/NOTICE.md');
  assert.ok(notice.includes(readFileSync('NOTICE.md', 'utf8').trimEnd()));
  assert.ok(notice.includes(readFileSync('LICENSE', 'utf8').trimEnd()));
  assert.match(notice, /`references\/` は「知識の文章」に当たります/);
});

test('同じ中身からは、何度作っても同じバイト列になる', () => {
  assert.ok(skillZip().equals(skillZip()));
});

test('入れなかったフォルダーがなければ、SKILL.md に節を足さない。見出しがなければ末尾に足す', () => {
  assert.equal(editionSkill('# s\n\n## a\n', []), '# s\n\n## a\n');
  assert.match(editionSkill('# s\n本文\n', ['scripts']), /^# s\n本文\n\n## この ZIP の版\n\n.*`scripts\/` を入れていない/);
});
