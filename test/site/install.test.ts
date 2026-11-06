import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { COMMANDS, commandAt } from '../../.claude/skills/yomimasu/scripts/commands.ts';
import { FLOWS } from '../../content/install/flows.ts';
import { flowHtml, INSTALL_TARGETS, isOffered, pickOptionsHtml, SKETCHES, sketchSvg } from '../../site/install.ts';

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

// 「たとえば」の行は、文と、開くと出す流れの図の印でできている（content/インストール.md）。
const examples = [...readFileSync('content/インストール.md', 'utf8').matchAll(/^<details><summary>(?:<span class="prio">[^<]+<\/span>)?(.+)<\/summary><!-- 流れ (\S+) --><\/details>$/gm)].map(
  ([, text, flow]) => ({ text, flow }),
);

test('「たとえば」の各行は、開くとその行の文をそのまま問いにした流れの図を出す', () => {
  assert.equal(examples.length, 4);
  for (const { text, flow } of examples) assert.equal(FLOWS[flow]?.question, text, flow);
});

test('流れの図は、問い、スキルを読み込んだ行から始まる AI の行い、答えの抜粋、確かめた環境と回数を、画像を使わずに文字で出す', () => {
  for (const [name, flow] of Object.entries(FLOWS)) {
    const html = flowHtml(flow);
    assert.match(html, /^<figure class="flow"><figcaption>チャットでの流れの例<\/figcaption>/, name);
    assert.ok(html.includes('<ul><li>スキルを読み込みました <b>yomimasu</b></li>'), name);
    assert.ok(html.includes('<p class="flow-who">答え（抜粋）</p>'), name);
    assert.match(html, /<p class="flow-note">Claude Code で確かめた結果（\d{4}-\d{2}-\d{2}、\d+回中\d+回）<\/p><\/figure>$/, name);
    assert.doesNotMatch(html, /<img|<svg|<image|<picture/, name);
    assert.ok(flow.answered <= flow.asked, name);
  }
});

// Web のボタンが打ち込む文字には、スキルも同じ内容を返す（docs/ui-guide.md の8節）。画面とスキルの答えを、別々に直して食い違わせないための検査である。
const noteOf = (path: string) => COMMANDS.find((command) => command.path === path)?.skill.note ?? '';
const textOf = (html: string) => html.replace(/<[^>]+>/g, '').trim();

test('入れる先を尋ねるスキルの答えは、Web の選択肢と同じ入れる先を同じ順に、打ち込む文字で並べ、同じ例を挙げる', () => {
  const note = noteOf('/install/');
  assert.deepEqual(
    [...note.matchAll(/`(インストール [^`]+)`/g)].map(([, say]) => say),
    INSTALL_TARGETS.map(({ path }) => commandAt(path, noName)?.say),
  );
  assert.equal(examples.length, 4);
  for (const { text } of examples) assert.ok(note.includes(text), text);
});

for (const { path } of INSTALL_TARGETS.filter(({ path }) => path !== '/install/agent/')) {
  test(`${path} のスキルの答えは、Web の手順の画面と同じ場所の文、段の見出しと文、聞いてみる例、注記を持つ`, () => {
    const note = noteOf(path);
    const read = commandAt(path, noName)?.read ?? '';
    const page = readFileSync(`content/${read}`, 'utf8');
    const where = textOf(page.match(/^## .+\n\n(<p>.+<\/p>)$/m)?.[1] ?? '');
    const steps = [...page.matchAll(/<b>([^<]+)<\/b>(?:<p>(.+?)<\/p>)?/g)].map(([, title, text]) => [title, textOf(text ?? '')]);
    const example = textOf(page.match(/<code>([^<]+)<\/code>/)?.[1] ?? '');
    const fine = textOf(page.match(/<p class="fine">(.+)<\/p>/)?.[1] ?? '');
    assert.ok(where && note.startsWith(where), where);
    for (const [i, [title, text]] of steps.entries()) {
      const line = note.split('\n').find((l) => l.startsWith(`${i + 1}. ${title}：`));
      assert.ok(line, `${i + 1}. ${title}`);
      assert.ok(line.includes(text), `${title}：${text}`);
    }
    assert.ok(example && note.includes(example), example);
    assert.ok(fine && note.endsWith(fine), fine);
  });
}
