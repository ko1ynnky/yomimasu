import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { test } from 'node:test';
import { chatgptPluginZip, editionSkill, omittedOf, skillZip, URL_NOTE, withoutUrls } from '../../site/skill-zip.ts';

const SKILL_DIR = '.claude/skills/yomimasu';
const URL = /https?:\/\//;

// 自分で書いた ZIP を自分の読み方で読むと、書き方の誤りを読み方が同じに誤って見逃す。展開は別の実装（Info-ZIP の unzip）に任せる。
function unpack(archive: Buffer): { dir: string; files: string[]; dirs: string[] } {
  const work = mkdtempSync(join(tmpdir(), 'yomimasu-zip-'));
  const zipPath = join(work, 'archive.zip');
  writeFileSync(zipPath, archive);
  execFileSync('unzip', ['-tq', zipPath]);
  const dir = join(work, 'out');
  execFileSync('unzip', ['-q', zipPath, '-d', dir]);
  const entries = readdirSync(dir, { recursive: true, withFileTypes: true });
  const pathOf = (entry: (typeof entries)[number]) => relative(dir, join(entry.parentPath, entry.name)).split('\\').join('/');
  return { dir, files: entries.filter((e) => e.isFile()).map(pathOf).sort(), dirs: entries.filter((e) => e.isDirectory()).map(pathOf).sort() };
}

const unpacked = unpack(skillZip());
const plugin = unpack(chatgptPluginZip());
const read = (path: string) => readFileSync(join(unpacked.dir, path), 'utf8');
const references = readdirSync(join(SKILL_DIR, 'references'))
  .filter((name) => name.endsWith('.md') && !name.startsWith('.'))
  .sort();

test('展開すると一番上は yomimasu/ のフォルダー1つで、その中に SKILL.md がある', () => {
  assert.deepEqual(readdirSync(unpacked.dir), ['yomimasu']);
  assert.ok(unpacked.files.includes('yomimasu/SKILL.md'));
  assert.match(read('yomimasu/SKILL.md'), /^---\nname: yomimasu\n/);
});

test('入るのは SKILL.md、references/ の Markdown、添えた NOTICE.md だけで、.ts と .json を含まない', () => {
  const expected = ['yomimasu/NOTICE.md', 'yomimasu/SKILL.md', ...references.map((name) => `yomimasu/references/${name}`)].sort();
  assert.deepEqual(unpacked.files, expected);
  assert.deepEqual(unpacked.dirs, ['yomimasu', 'yomimasu/references']);
  assert.deepEqual(
    unpacked.files.filter((path) => /\.(ts|json)$/.test(path)),
    [],
  );
});

test('スキルのフォルダーの外のものは、添えた利用の条件（NOTICE.md）のほかに入らない', () => {
  const outside = unpacked.files.filter((path) => !existsSync(join(SKILL_DIR, path.replace(/^yomimasu\//, ''))));
  assert.deepEqual(outside, ['yomimasu/NOTICE.md']);
});

test('ZIP の中のどのファイルにも、http:// と https:// の URL がない', () => {
  for (const path of unpacked.files) assert.doesNotMatch(read(path), URL, path);
});

test('ZIP は Gemini の上限の 100 MB より小さい', () => {
  assert.ok(skillZip().length < 100 * 1024 * 1024);
});

test('references/ の Markdown は、URL を外したほかは書き換えずに入れる', () => {
  for (const name of references) assert.equal(read(`yomimasu/references/${name}`), withoutUrls(readFileSync(join(SKILL_DIR, 'references', name), 'utf8')), name);
  const withUrl = references.filter((name) => URL.test(readFileSync(join(SKILL_DIR, 'references', name), 'utf8')));
  assert.ok(withUrl.length > 0, 'URL を外す場面を確かめるには、URL のあるファイルが要る');
  for (const name of withUrl) assert.ok(read(`yomimasu/references/${name}`).includes(URL_NOTE), name);
});

test('SKILL.md の写しは、入れなかったフォルダーとその場合の答え方を知らせ、ほかはリポジトリの SKILL.md のままである', () => {
  const copy = read('yomimasu/SKILL.md');
  const section = copy.match(/## この ZIP の版\n\n([^\n]+)\n\n/)?.[1] ?? '';
  assert.match(section, /`assets\/`、`scripts\/` を入れていない/);
  assert.match(section, /推測で答えない/);
  assert.match(section, /この版では測れないと伝え/);
  assert.equal(copy.replace(/## この ZIP の版\n\n[^\n]+\n\n/, ''), withoutUrls(readFileSync(join(SKILL_DIR, 'SKILL.md'), 'utf8')));
});

test('利用の条件として、リポジトリの NOTICE.md の全文と LICENSE の本文を、URL を外して添える', () => {
  const notice = read('yomimasu/NOTICE.md');
  assert.ok(notice.includes(withoutUrls(readFileSync('NOTICE.md', 'utf8')).trimEnd()));
  assert.ok(notice.includes(readFileSync('LICENSE', 'utf8').trimEnd()));
  assert.match(notice, /リポジトリ ko1ynnky\/yomimasu の/);
  assert.match(notice, /`SKILL\.md` のあるフォルダーは `\.claude\/skills\/yomimasu\/` に当たります/);
  assert.match(notice, /`references\/` は「知識の文章」の行に当たります/);
});

test('同じ中身からは、何度作っても同じバイト列になる', () => {
  assert.ok(skillZip().equals(skillZip()));
  assert.ok(chatgptPluginZip().equals(chatgptPluginZip()));
});

test('ChatGPT のプラグインの ZIP は、フォルダーを挟まずに plugin.json と skills/yomimasu/ を置く', () => {
  assert.deepEqual(readdirSync(plugin.dir).sort(), ['plugin.json', 'skills']);
  assert.deepEqual(readdirSync(join(plugin.dir, 'skills')), ['yomimasu']);
  assert.deepEqual(JSON.parse(readFileSync(join(plugin.dir, 'plugin.json'), 'utf8')), {
    $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
    name: 'yomimasu',
    version: '0.1.0',
    description: '競技かるたの読み（読唱）の知識。読手の読み方、時間の配分、余韻、間、伸ばす箇所を調べるときに使う。',
  });
});

test('ChatGPT のプラグインの skills/yomimasu/ は、/yomimasu.zip の yomimasu/ と同じファイルを同じ中身で持つ', () => {
  const inPlugin = plugin.files.filter((path) => path.startsWith('skills/yomimasu/')).map((path) => path.replace(/^skills\//, ''));
  assert.deepEqual(inPlugin, unpacked.files);
  for (const path of unpacked.files) assert.ok(readFileSync(join(plugin.dir, 'skills', path)).equals(readFileSync(join(unpacked.dir, path))), path);
  assert.deepEqual(
    plugin.files.filter((path) => !path.startsWith('skills/yomimasu/')),
    ['plugin.json'],
  );
});

test('ChatGPT のプラグインの ZIP にも、plugin.json の $schema の行のほかに URL がない', () => {
  for (const path of plugin.files) {
    const text = readFileSync(join(plugin.dir, path), 'utf8');
    const rest = path === 'plugin.json' ? text.replace(/"\$schema": "https:\/\/[^"]*"/, '') : text;
    assert.doesNotMatch(rest, URL, path);
  }
});

test('URL を外すと、資料の名前、参照日、ライセンスの文を残し、Markdown のリンクは文字を残す', () => {
  assert.equal(
    withoutUrls('2. Wikipedia 日本語版「日本語の音韻」の母音の節。https://ja.wikipedia.org/wiki/日本語の音韻 （2026-11-05 に参照。CC BY-SA 4.0）'),
    `2. Wikipedia 日本語版「日本語の音韻」の母音の節。${URL_NOTE} （2026-11-05 に参照。CC BY-SA 4.0）`,
  );
  assert.equal(withoutUrls('[a/b.csv](https://github.com/a/b.csv)、コミット'), `a/b.csv${URL_NOTE}、コミット`);
  assert.equal(withoutUrls('参照実装（<http://www.example.org/x.c>）の'), `参照実装（${URL_NOTE}）の`);
  assert.equal(withoutUrls('[LICENSE](LICENSE) と [節](#節)'), '[LICENSE](LICENSE) と [節](#節)');
});

test('入れなかったものは、フォルダーごとならフォルダーの名前で、一部ならファイルのパスで数え、隠しファイルは数えない', () => {
  const all = ['SKILL.md', 'scripts/a.ts', 'scripts/b.ts', 'references/a.md', 'references/b.md', 'references/.DS_Store'];
  assert.deepEqual(omittedOf(all, ['SKILL.md', 'references/a.md']), ['references/b.md', 'scripts/']);
});

test('入れなかったものがなければ SKILL.md に節を足さず、見出しがなければ末尾に足し、測れないと伝えるのは scripts/ がないときだけである', () => {
  assert.equal(editionSkill('# s\n\n## a\n', []), '# s\n\n## a\n');
  assert.match(editionSkill('# s\n本文\n', ['scripts/']), /^# s\n本文\n\n## この ZIP の版\n\n.*`scripts\/` を入れていない.*この版では測れない/);
  assert.doesNotMatch(editionSkill('# s\n', ['references/b.md']), /測れない/);
});
