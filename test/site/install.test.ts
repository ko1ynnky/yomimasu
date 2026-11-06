import assert from 'node:assert/strict';
import { test } from 'node:test';
import { COMMANDS, commandAt } from '../../.claude/skills/yomimasu/scripts/commands.ts';
import { INSTALL_TARGETS, isOffered, pickOptionsHtml, SKETCHES, sketchSvg } from '../../site/install.ts';

const noName = () => undefined;

test('選択肢は一覧の順に番号を付けたリンクで、選んだあとに出す答えは一覧の名前である', () => {
  const links = [...pickOptionsHtml().matchAll(/<a class="btn" href="([^"]+)" data-label="([^"]+)">(?:<span>)?(\d+)\. /g)];
  assert.deepEqual(
    links.map(([, href, label, n]) => [href, label, Number(n)]),
    INSTALL_TARGETS.map(({ path, label }, i) => [path, label, i + 1]),
  );
});

test('選択肢の名前は、コマンドの表のその行のボタンの名前と同じで、行き先は「インストール」で始まるコマンドを打ち込む', () => {
  for (const { path, label } of INSTALL_TARGETS) {
    assert.equal(COMMANDS.find((command) => command.path === path)?.button, label, path);
    assert.match(commandAt(path, noName)?.say ?? '', /^インストール /, path);
  }
});

test('手順の画面は選択肢に出す入れる先だけを組み立て、尋ねる画面とほかの画面はいつも組み立てる', () => {
  for (const { path } of INSTALL_TARGETS) assert.equal(isOffered(path), true, path);
  assert.equal(isOffered('/install/unlisted/'), false);
  assert.equal(isOffered('/install/'), true);
  assert.equal(isOffered('/soron/'), true);
  assert.equal(isOffered('/'), true);
});

test('略図は押す順を文で書いた名前を持つ図で、押す場所の番号を1から順に付ける', () => {
  for (const [name, spec] of Object.entries(SKETCHES)) {
    const svg = sketchSvg(spec);
    assert.match(svg, /^<svg [^>]*role="img"/, name);
    assert.ok(svg.includes(`aria-label="${spec.alt}"`), name);
    assert.doesNotMatch(svg, /<image|<img|href=/, name);
    const badges = [...svg.matchAll(/text-anchor="middle"[^>]*>(\d+)</g)].map(([, n]) => Number(n));
    assert.deepEqual(badges, badges.map((_, i) => i + 1), name);
  }
});
