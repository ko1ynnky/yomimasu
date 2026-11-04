import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { definition } from '../../.claude/skills/yomimasu/scripts/definition.ts';

const doc = readFileSync('docs/measure.md', 'utf8');
const table = doc.slice(doc.indexOf('## 定義のデータ'));
const rows = new Map([...table.matchAll(/^\| `([^`]+)` \| `([^`]+)` \|/gm)].map(([, path, value]) => [path, value]));

function leaves(value: unknown, path: string[] = []): [string, string][] {
  if (typeof value !== 'object' || value === null) return [[path.join('.'), String(value)]];
  return Object.entries(value).flatMap(([key, child]) => leaves(child, [...path, key]));
}

test('docs/measure.md の「定義のデータ」の表に、definition.ts の値がすべて同じ値で載っている', () => {
  for (const [path, value] of leaves(definition)) assert.equal(rows.get(path), value, path);
});

test('docs/measure.md の「定義のデータ」の表に、definition.ts にない行がない', () => {
  const paths = new Set(leaves(definition).map(([path]) => path));
  for (const path of rows.keys()) assert.ok(paths.has(path), path);
});
