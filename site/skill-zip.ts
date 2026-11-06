import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { crc32, deflateRawSync } from 'node:zlib';

// 汎用の AI に入れる ZIP を、スキル yomimasu のフォルダーから2つ作る（docs/ui-guide.md の8節「保存するファイル」）。
// - /yomimasu.zip（Claude と Gemini）：一番上を yomimasu/ にしたスキルの形。Claude の資料がこの形を求めている。
// - /yomimasu-chatgpt.zip（ChatGPT）：一番上に plugin.json と skills/yomimasu/ を置くプラグインのアーカイブの形。
// 2つの知識のファイルは同じで、skillZipFiles が1か所で選ぶ。

const SKILL_DIR = '.claude/skills/yomimasu';

// ZIP に入れるファイル（スキルのフォルダーからの相対パス）。中身の選び方はここだけで変える。
// SKILL.md と references/ の Markdown だけを入れる。2026-11-06 にユーザーが Gemini で確かめた結果による。
// - Gemini の「スキルをアップロード」は commands.ts の入った ZIP を「unsupported file type」で拒んだ。ヘルプ（https://support.google.com/gemini/answer/17094296、同日に確認）も .ts を対応に挙げていない。
// - URL のあるファイル（references/mouth-shapes.md）を入れると「このスキルを保存できませんでした（1124）」になった。assets/cards.json にも URL がある。
// 汎用の AI ではスクリプトが動かない見込みなので、scripts/ が入らなくても知識の答えは変わらない。この中身で、Claude と Gemini は問いに対してスキルを読み込んで答えた（同日）。
// 名前が . で始まるファイル（.DS_Store など）は入れない。Gemini のヘルプが、アップロードの失敗の元になると書いている。
export const inZip = (path: string): boolean => path === 'SKILL.md' || /^references\/[^./][^/]*\.md$/.test(path);

const isHidden = (path: string) => path.split('/').some((part) => part.startsWith('.'));

// ZIP に入れる文からは、http:// と https:// の URL を外し、代わりにこの文を入れる。URL があると Gemini がスキルを保存できない（上の 1124）。
// 資料の名前、節、参照日、ライセンスの文は残す。リポジトリのファイルは変えない。
export const URL_NOTE = '（URL はリポジトリの同じファイルにあります）';

// Markdown のリンクは文字を残し、<URL> の形と、そのまま書いた URL は文に置き換える。そのまま書いた URL は、空白、かっこ、かぎかっこ、句読点の手前で終わるものとする。
export function withoutUrls(text: string): string {
  return text
    .replace(/\[([^\]]*)\]\(https?:\/\/[^)\s]*\)/g, `$1${URL_NOTE}`)
    .replace(/<https?:\/\/[^>\s]*>/g, URL_NOTE)
    .replace(/https?:\/\/[^\s<>()（）「」、。]+/g, URL_NOTE);
}

export type ZipFile = { path: string; data: Buffer };

function skillFiles(): string[] {
  return readdirSync(SKILL_DIR, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(SKILL_DIR, join(entry.parentPath, entry.name)).split('\\').join('/'));
}

// 入れなかったもの。フォルダーごと入れなかったときはフォルダーの名前（scripts/）で、一部だけのときはファイルのパスで返す。隠しファイルは数えない。
export function omittedOf(all: readonly string[], chosen: readonly string[]): string[] {
  const left = all.filter((path) => !isHidden(path) && !chosen.includes(path));
  const folders = [...new Set(left.filter((path) => path.includes('/')).map((path) => path.split('/')[0]))].filter(
    (folder) => !chosen.some((path) => path.startsWith(`${folder}/`)),
  );
  return [...folders.map((folder) => `${folder}/`), ...left.filter((path) => !folders.some((folder) => path.startsWith(`${folder}/`)))].sort();
}

// 入れなかったものを、SKILL.md の最初の ## の見出しの前に足す節で知らせる。この版のファイル（SKILL.md、references/ の一覧など）がそこを指しても、AI が中身を推測で埋めないようにするためである。
// リポジトリの SKILL.md は書き換えず、ZIP の中の写しにだけ足す。リポジトリの SKILL.md はコーディングエージェント（npx skills add）がそのまま使う。
// 説明（description）は変えない。AI がスキルを読み込むかを決める文で、置き場を2つにすると食い違う。測れないことは、この節で伝える。
export function editionSkill(skill: string, omitted: readonly string[]): string {
  if (omitted.length === 0) return skill;
  const names = omitted.map((name) => `\`${name}\``).join('、');
  const measure = omitted.includes('scripts/') ? '音声を測ることを頼まれたら、この版では測れないと伝え、Web アプリの /yomimasu を案内する。' : '';
  const section = `## この ZIP の版

この ZIP は汎用の AI に入れるための版で、${names} を入れていない。この版のファイルがそこを指すときは、この版にないと伝え、中身を推測で答えない。${measure}ファイルごとの扱いは \`NOTICE.md\` にある。

`;
  const at = skill.search(/^## /m);
  return at === -1 ? `${skill.trimEnd()}\n\n${section.trimEnd()}\n` : skill.slice(0, at) + section + skill.slice(at);
}

// 利用の条件は、リポジトリの NOTICE.md と LICENSE を、そのまま写して添える。行を選んで抜き出すと、NOTICE.md の書き方を変えたときに条件が黙って抜け落ちる。
export function editionNotice(notice: string, license: string): string {
  return `この ZIP は、リポジトリ ko1ynnky/yomimasu のスキルのフォルダー \`${SKILL_DIR}/\` から、汎用の AI に入れるファイルを抜き出したものです。ファイルごとの扱いは、下に写したリポジトリの NOTICE.md のとおりです。表の場所はリポジトリの中のパスで、この ZIP の中の、\`SKILL.md\` のあるフォルダーは \`${SKILL_DIR}/\` に当たります。たとえば \`SKILL.md\` は表の「スキルの \`SKILL.md\`」の行に、\`references/\` は「知識の文章」の行に当たります。LICENSE の本文は末尾に写しました。URL は外し、「${URL_NOTE}」と書きました。

${notice.trimEnd()}

## LICENSE

NOTICE.md が「MIT License」と書いたものに適用する、リポジトリの LICENSE です。

\`\`\`
${license.trimEnd()}
\`\`\`
`;
}

export function skillZipFiles(): ZipFile[] {
  const all = skillFiles();
  const chosen = all.filter(inZip);
  const omitted = omittedOf(all, chosen);
  const texts = chosen.map((path) => {
    const text = readFileSync(join(SKILL_DIR, path), 'utf8');
    return { path, text: path === 'SKILL.md' ? editionSkill(text, omitted) : text };
  });
  texts.push({ path: 'NOTICE.md', text: editionNotice(readFileSync('NOTICE.md', 'utf8'), readFileSync('LICENSE', 'utf8')) });
  return texts.map(({ path, text }) => ({ path, data: Buffer.from(withoutUrls(text)) }));
}

// 依存を足さずに、Node の zlib で ZIP を書く。同じ中身からは同じバイト列にするため、時刻は固定し、項目は名前の順に並べる。
// 時刻は ZIP の日付で表せる最小の 1980-01-01 00:00 にする。展開すると、どのファイルもこの日付になる。
const DOS_TIME = 0;
const DOS_DATE = (0 << 9) | (1 << 5) | 1;
// 一般目的のフラグの第11ビットは、名前が UTF-8 であることを示す。
const UTF8 = 0x0800;
const VERSION = 20;
// 作った環境を Unix とし、外部属性の上位16ビットに Unix のファイルの種類と権限を入れる。
const MADE_BY = (3 << 8) | VERSION;
const FILE_MODE = 0o100644;
const DIR_MODE = 0o040755;

type Entry = { name: string; method: 0 | 8; crc: number; size: number; body: Buffer; mode: number };

// フォルダーの項目も入れる。ユーザーが Gemini で試した ZIP と同じ形である。
function entriesOf(files: readonly ZipFile[]): Entry[] {
  const dirs = new Set<string>();
  for (const { path } of files) {
    const parts = path.split('/').slice(0, -1);
    parts.forEach((_, i) => dirs.add(`${parts.slice(0, i + 1).join('/')}/`));
  }
  const entries: Entry[] = [
    ...[...dirs].map((name) => ({ name, method: 0 as const, crc: 0, size: 0, body: Buffer.alloc(0), mode: DIR_MODE })),
    ...files.map(({ path, data }) => ({ name: path, method: 8 as const, crc: crc32(data), size: data.length, body: deflateRawSync(data, { level: 9 }), mode: FILE_MODE })),
  ];
  return entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

function header(entry: Entry, name: Buffer): Buffer {
  const head = Buffer.alloc(26);
  head.writeUInt16LE(VERSION, 0);
  head.writeUInt16LE(UTF8, 2);
  head.writeUInt16LE(entry.method, 4);
  head.writeUInt16LE(DOS_TIME, 6);
  head.writeUInt16LE(DOS_DATE, 8);
  head.writeUInt32LE(entry.crc, 10);
  head.writeUInt32LE(entry.body.length, 14);
  head.writeUInt32LE(entry.size, 18);
  head.writeUInt16LE(name.length, 22);
  head.writeUInt16LE(0, 24);
  return head;
}

export function zip(files: readonly ZipFile[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const entry of entriesOf(files)) {
    const name = Buffer.from(entry.name, 'utf8');
    const head = header(entry, name);
    const local = Buffer.concat([u32(0x04034b50), head, name, entry.body]);
    // 注釈の長さ、開始のディスク、内部属性、外部属性、ローカルヘッダーの位置の順である。ディレクトリには DOS の属性（0x10）も立てる。
    const central = Buffer.alloc(14);
    central.writeUInt16LE(0, 0);
    central.writeUInt16LE(0, 2);
    central.writeUInt16LE(0, 4);
    central.writeUInt32LE(((entry.mode << 16) | (entry.mode === DIR_MODE ? 0x10 : 0)) >>> 0, 6);
    central.writeUInt32LE(offset, 10);
    centrals.push(Buffer.concat([u32(0x02014b50), u16(MADE_BY), head, central, name]));
    locals.push(local);
    offset += local.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(centrals.length, 8);
  end.writeUInt16LE(centrals.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, directory, end]);
}

function u16(value: number): Buffer {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value);
  return buffer;
}

function u32(value: number): Buffer {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value);
  return buffer;
}

const under = (folder: string, files: readonly ZipFile[]) => files.map(({ path, data }) => ({ path: `${folder}${path}`, data }));

export const skillZip = (): Buffer => zip(under('yomimasu/', skillZipFiles()));

// ChatGPT は、スキルとして上げると Work でしか使われず、プラグインのアーカイブにすると、ふだんの Chat でも使われた（2026-11-06 にユーザーのアカウントで確かめた）。
// plugin.json は、そのとき通ったものと同じにする。$schema の URL は ChatGPT で通ったので、URL を外す決まりから外す。
export const PLUGIN_JSON =
  '{"$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json", "name": "yomimasu", "version": "0.1.0", "description": "競技かるたの読み（読唱）の知識。読手の読み方、時間の配分、余韻、間、伸ばす箇所を調べるときに使う。"}\n';

export const chatgptPluginZip = (): Buffer => zip([{ path: 'plugin.json', data: Buffer.from(PLUGIN_JSON) }, ...under('skills/yomimasu/', skillZipFiles())]);
