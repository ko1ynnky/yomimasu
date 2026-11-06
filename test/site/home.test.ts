import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { commandAt } from '../../.claude/skills/yomimasu/scripts/commands.ts';

const home = readFileSync('content/index.md', 'utf8');
const noName = () => undefined;

test('入口の一覧の項目の名前は、行き先のコマンドの表の打ち込む文字と同じである', () => {
  const menu = home.match(/<nav class="menu"[\s\S]*?<\/nav>/)?.[0] ?? '';
  const items = [...menu.matchAll(/href="([^"]+)"[^>]*>.*?<span>\/(.+?)<\/span>/g)];
  assert.equal(items.length, 7);
  assert.equal(items.at(-1)?.[2], 'インストール');
  for (const [, href, name] of items) assert.equal(commandAt(href, noName)?.say, name, href);
});

test('入口の下端のリンクの名前は、このアプリについてのコマンドと同じである', () => {
  const [, href, name] = home.match(/<a class="foot-link" href="([^"]+)">\/(.+?)<\/a>/) ?? [];
  assert.equal(commandAt(href, noName)?.say, name);
});
