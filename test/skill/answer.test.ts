import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import deck from '../../.claude/skills/yomimasu/assets/cards.json' with { type: 'json' };
import { answer } from '../../.claude/skills/yomimasu/scripts/answer.ts';
import type { Card } from '../../.claude/skills/yomimasu/scripts/cards.ts';
import { COMMANDS, SCREEN_SAYS } from '../../.claude/skills/yomimasu/scripts/commands.ts';
import { measure } from '../../.claude/skills/yomimasu/scripts/measure.ts';
import { nextPoint } from '../../.claude/skills/yomimasu/scripts/next-point.ts';
import { NOT_MEASURED, resultRows } from '../../.claude/skills/yomimasu/scripts/result.ts';
import { decodeWav } from '../../.claude/skills/yomimasu/scripts/wav.ts';
import { standardReading, synthesize, type ReadingPlan } from '../support/synth.ts';
import { encodeWav } from '../support/wav.ts';

const SKILL_DIR = '.claude/skills/yomimasu';
const cards = deck.cards as unknown as Card[];
const card = (no: number) => cards.find((c) => c.no === no)!;

const wavOf = (plan: ReadingPlan) => encodeWav(synthesize(plan), plan.sampleRate);
const files = new Map<string, Uint8Array>([
  ['standard.wav', wavOf(standardReading)],
  ['long-ma.wav', wavOf({ ...standardReading, maSec: 2 })],
  ['long-kami.wav', wavOf({ ...standardReading, kamiSec: 8.5 })],
  ['silent.wav', encodeWav(new Float32Array(48000 * 3), 48000)],
  ['song.mp3', new TextEncoder().encode('ID3 mp3 です')],
]);
const io = {
  readFile(path: string) {
    const bytes = files.get(path);
    if (!bytes) throw new Error(`ENOENT: ${path}`);
    return bytes;
  },
};
const ask = (text: string) => answer(text, io);

test('Web のコマンドの表のどの行にも、スキルの答えがあり、開く知識のファイルがある', () => {
  for (const command of COMMANDS) {
    assert.ok(command.skill.open || command.skill.run || command.skill.note, command.say);
    for (const file of command.skill.open ?? []) assert.ok(existsSync(join(SKILL_DIR, 'references', file)), file);
  }
});

test('教科書のコマンドは、Web の読んだ行のように、開く知識のファイルを返す', () => {
  const reply = ask('総論を学ぶ');
  assert.equal(reply.ok, true);
  assert.match(reply.text, /^> \/yomimasu 総論を学ぶ$/m);
  assert.match(reply.text, /^● Read references\/timing\.md$/m);
  assert.match(ask('最低限これだけ').text, /^● Read references\/minimum\.md$/m);
});

test('1首のコマンドは、決まり字で札を引き、伸ばす印の付いた歌と、知識のファイルで札を探す歌番号を返す', () => {
  const reply = ask('1首 なげき');
  assert.equal(reply.ok, true);
  assert.ok(reply.text.includes(card(53).marked.upper), reply.text);
  assert.ok(reply.text.includes(card(53).marked.lower));
  assert.match(reply.text, /決まり字：なげき/);
  assert.match(reply.text, /歌番号 53 の札/);
  assert.match(ask('1首 序歌').text, /序歌の行/);
  assert.ok(ask('1首 序歌').text.includes(card(0).marked.upper));
});

test('候補の表を開く答えは、区分と出典を添え、メモの内容を読手個人のやり方として書くよう伝える', () => {
  for (const say of ['1首 なげき', 'ポイントを知る']) assert.match(ask(say).text, /区分と出典を添え、読手のメモから来た内容は読手個人のやり方として書く/, say);
});

test('コーディングエージェントに入れる答えは、yomimasu だけを入れるコマンド、確かめた日と skills の版、Codex と Cursor で答えることと更新を確かめたことを書き、確かめていない入れ方とエージェントを断る', () => {
  const { ok, text } = ask('インストール エージェント');
  assert.equal(ok, true);
  assert.ok(text.includes('`npx skills add ko1ynnky/yomimasu --skill yomimasu`'), text);
  assert.match(text, /Claude Code に yomimasu だけが入ることを、2026年11月7日に skills 1\.7\.6 で、`--copy` を付けて確かめました/);
  const checked = text.match(/2026年11月8日には、[^。]+も確かめました。/)?.[0] ?? '';
  for (const fact of ['Codex と Cursor の CLI', '答える', '`npx skills update -p -y`']) assert.ok(checked.includes(fact), `${fact}：${text}`);
  const unchecked = text.match(/[^。]+は確かめていません。/)?.[0] ?? '';
  for (const scope of ['選ぶ画面', 'ユーザー全体', 'Gemini CLI']) assert.ok(unchecked.includes(scope), `${scope}：${text}`);
  assert.doesNotMatch(unchecked, /Codex|Cursor|update/);
  assert.doesNotMatch(text, /まだ確かめていません/);
});

test('Claude、ChatGPT、Gemini に入れる答えは、保存するファイルからの段を番号つきで返し、「確かめてから足す」とは書かない', () => {
  for (const [say, file] of [
    ['インストール Claude', 'yomimasu.zip'],
    ['インストール ChatGPT', 'yomimasu-chatgpt.zip'],
    ['インストール Gemini', 'yomimasu.zip'],
  ]) {
    const { ok, text } = ask(say);
    assert.equal(ok, true, say);
    assert.match(text, new RegExp(`^1\\. ファイルを保存する：.*「${file} を保存」`, 'm'), say);
    assert.match(text, /^\d\. 聞いてみる：/m, say);
    assert.doesNotMatch(text, /確かめてから足します/, say);
  }
});

test('決まり字の分からない札は、答えずに理由を返す', () => {
  const reply = ask('1首 なになに');
  assert.equal(reply.ok, false);
  assert.match(reply.text, /「なになに」/);
});

test('1首ずつ学ぶは、序歌と100首を決まり字で並べる', () => {
  const reply = ask('1首ずつ学ぶ');
  const lines = reply.text.split('\n').filter((line) => line.startsWith('- '));
  assert.equal(lines.length, 101);
  assert.ok(lines[0].includes('序歌'));
});

test('読むのコマンドは、前の札の下の句と次の札の上の句を並べ、測り方を案内する', () => {
  const reply = ask('読む ほ あはれ');
  assert.equal(reply.ok, true);
  assert.ok(reply.text.indexOf(card(81).marked.lower) >= 0 && reply.text.indexOf(card(81).marked.lower) < reply.text.indexOf(card(45).marked.upper), reply.text);
  assert.match(reply.text, /結果を見る <WAV のパス> ほ あはれ/);
});

test('まず1回読むは、5・3・1・6の知識と、ほ → あはれ の組を返す', () => {
  const reply = ask('まず1回読む');
  assert.match(reply.text, /^● Read references\/timing\.md$/m);
  assert.ok(reply.text.includes(card(81).marked.lower) && reply.text.includes(card(45).marked.upper));
});

test('結果を見るは、Web の結果の画面と同じ行、同じ文、同じ次に直す1点を返す', () => {
  const reply = ask('結果を見る standard.wav ほ あはれ');
  assert.equal(reply.ok, true);
  const decoded = decodeWav(files.get('standard.wav')!);
  const measurement = measure({ ...decoded, readingStartSec: 0 });
  for (const row of resultRows(measurement)) assert.ok(reply.text.includes(`| ${row.label} | ${row.reference} | ${row.value} | ${row.verdict} |`), reply.text);
  assert.ok(reply.text.includes(NOT_MEASURED));
  const answerOfWeb = nextPoint(measurement, { shimo: 81, kami: 45 });
  assert.equal(answerOfWeb.kind, 'clear');
  if (answerOfWeb.kind === 'clear') assert.ok(reply.text.includes(answerOfWeb.fix) && reply.text.includes(answerOfWeb.reason));
});

test('幅の外の項目があれば、次に直す1点の文と、関わる教科書のページを返す', () => {
  const reply = ask('結果を見る long-ma.wav ほ あはれ');
  const point = nextPoint(measure({ ...decodeWav(files.get('long-ma.wav')!), readingStartSec: 0 }), { shimo: 81, kami: 45 });
  assert.equal(point.kind, 'point');
  if (point.kind !== 'point') return;
  assert.equal(point.point.item, 'ma');
  for (const text of [point.point.fix, point.point.reason, point.point.how, point.point.link.label]) assert.ok(reply.text.includes(text), text);
  assert.match(reply.text, /`総論を学ぶ`/);
});

test('次に直す1点の札のページは、スキルで開ける1首のコマンドで示す', () => {
  const reply = ask('結果を見る long-kami.wav ほ あはれ');
  assert.match(reply.text, /上の句の札を見る/);
  assert.match(reply.text, /`1首 あはれ`/);
});

test('引数で渡すと、空白を含む音声ファイルのパスも1つのパスとして読む', () => {
  files.set('新規録音 3.wav', files.get('standard.wav')!);
  const reply = answer(['結果を見る', '新規録音 3.wav', 'ほ', 'あはれ'], io);
  assert.equal(reply.ok, true, reply.text);
  assert.match(reply.text, /^> \/yomimasu 結果を見る 新規録音 3\.wav ほ あはれ$/m);
});

test('測れなかったときは、理由の文を返し、次に直す1点を出さない', () => {
  const reply = ask('結果を見る silent.wav ほ あはれ');
  assert.equal(reply.ok, true);
  assert.match(reply.text, /声を聞き取れず、測れませんでした。/);
  assert.match(reply.text, /\| 間 \| 目安 [\d.]+〜[\d.]+秒 \| — \| 測れませんでした \|/);
  assert.doesNotMatch(reply.text, /次に直す1点/);
});

test('組を渡さなければ、まず1回読む の組として測り、そう書く', () => {
  const reply = ask('結果を見る standard.wav');
  assert.equal(reply.ok, true);
  assert.match(reply.text, /組の指定がないので、ほ → あはれ の組として測りました。/);
});

test('序歌を含む組と、同じ札の組は測らない', () => {
  assert.match(ask('結果を見る standard.wav 序歌 あはれ').text, /序歌を含む組は、まだ測れません。/);
  assert.equal(ask('結果を見る standard.wav ほ ほ').ok, false);
});

test('音声ファイルがないとき、読めないときは、理由を返す', () => {
  assert.match(ask('結果を見る').text, /WAV のパス/);
  assert.equal(ask('結果を見る').ok, false);
  const missing = ask('結果を見る nowhere.wav ほ あはれ');
  assert.equal(missing.ok, false);
  assert.match(missing.text, /nowhere\.wav を読めません/);
  assert.match(ask('結果を見る song.mp3 ほ あはれ').text, /WAV ではありません/);
});

test('画面の中だけの操作と、表にないコマンドは、答えずに理由を返す', () => {
  for (const { say } of SCREEN_SAYS) assert.match(ask(say).text, /画面の中だけの操作/, say);
  const unknown = ask('天気を教えて');
  assert.equal(unknown.ok, false);
  assert.match(unknown.text, /総論を学ぶ/);
});

test('スクリプトとして動かすと、引数をコマンドとして読み、答えを出す', () => {
  const dir = mkdtempSync(join(tmpdir(), 'yomimasu-skill-'));
  const path = join(dir, 'reading.wav');
  writeFileSync(path, files.get('long-ma.wav')!);
  const output = execFileSync(process.execPath, [join(SKILL_DIR, 'scripts/yomimasu.ts'), '結果を見る', path, 'ほ', 'あはれ'], { encoding: 'utf8' });
  assert.match(output, /間を1\.0秒にそろえる/);
  assert.throws(() => execFileSync(process.execPath, [join(SKILL_DIR, 'scripts/yomimasu.ts'), '天気'], { stdio: 'pipe' }));
});
