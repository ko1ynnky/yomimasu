import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';

const SKILL_DIR = '.claude/skills/yomimasu';
const skill = readFileSync(join(SKILL_DIR, 'SKILL.md'), 'utf8');
const frontmatter = skill.match(/^---\n([\s\S]*?)\n---\n/)?.[1] ?? '';
const description = frontmatter.match(/^description: (.*)$/m)?.[1] ?? '';

test('/yomimasu の名前で読み込める', () => {
  assert.match(frontmatter, /^name: yomimasu$/m);
});

test('説明の先頭で、競技かるたの読みのスキルだと分かる', () => {
  assert.match(description.slice(0, 40), /競技かるた/);
});

test('名前の似た文章の推敲のスキルと取り違えないよう、説明に対象外を書く', () => {
  assert.match(description, /関わらない文章の推敲には使わない/);
});

test('説明はスキルの一覧に載る長さに収まる', () => {
  assert.ok(description.length <= 250, `${description.length} 文字`);
});

for (const [name, file] of [
  ['SKILL.md', join(SKILL_DIR, 'SKILL.md')],
  ['知識の入口', join(SKILL_DIR, 'references/README.md')],
]) {
  test(`${name} のリンク先がある`, () => {
    const links = [...readFileSync(file, 'utf8').matchAll(/\]\(([^)#]+\.md)\)/g)].map((match) => match[1]);
    for (const link of links) assert.ok(existsSync(join(dirname(file), link)), link);
  });
}

test('SKILL.md は入口の知識の本文へつなぐ', () => {
  assert.match(skill, /\(references\/README\.md\)/);
});

for (const file of ['SKILL.md', 'references/README.md']) {
  test(`${file} が書名で挙げるファイルがある`, () => {
    const names = [...readFileSync(join(SKILL_DIR, file), 'utf8').matchAll(/`([^`\s]+\.(?:md|ts))`/g)].map((match) => match[1]);
    assert.ok(names.length > 0);
    for (const name of names) assert.ok(existsSync(name.replace('${CLAUDE_SKILL_DIR}', SKILL_DIR)), name);
  });
}
