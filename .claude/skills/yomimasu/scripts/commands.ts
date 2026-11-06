// コマンドの対応（docs/ui-guide.md の8節）。Web のボタンが打ち込む文字と、スキルが同じ内容を返すコマンドの対応を、ここだけに置く。
// Web は、組み立てのときに実行の行と読んだ行を、ブラウザーでは押したリンクが打ち込む文字を、この表から引く。

// {札} は、URL では札の番号（序歌は joka）、打ち込む文字と読んだ行では決まり字の仮名（序歌は「序歌」）に替える。
// 読むの組は、{下の句} と {上の句} の2枚の札で書く。
// skill は、同じ文字をスキルに打ち込んだときの答えである。open は references/ の開くファイル、run は scripts/answer.ts が組み立てる答え、note は添える文である。
// Web の content/ の本文をスキルへ写す案は採らなかった。本文は HTML と組み立ての印を含み、写すと知識の置き場が2つになる。教科書の本文のもとになった references/ を開く。
export type SkillAnswer = { open?: readonly string[]; run?: 'list' | 'card' | 'pair' | 'measure'; note?: string };
export type Command = { button: string; say: string; read?: string; path: string; skill: SkillAnswer };

// 候補の表は、Web の本文と違い、選ぶ前の行を区分と出典つきで並べている（references/README.md の「書き方の決まり」）。
const CANDIDATES = '候補の表から答えるときは、行の区分と出典を添え、読手のメモから来た内容は読手個人のやり方として書く。';

// コーディングエージェントに入れる手順は、リポジトリを公開してから実行して確かめる（README.md）。確かめるまで、入れられると言い切らない。
const UNCHECKED = 'この手順は、リポジトリを公開してから実行して確かめるもので、まだ確かめていません。';

// 汎用の AI（Claude、ChatGPT、Gemini）に入れる手順。Web の手順の画面（content/Claudeに入れる.md など）と同じ段と文で書く。
// Web とスキルは同じ内容を返す決まり（docs/ui-guide.md の8節）なので、食い違いは test/site/install.test.ts が見る。
// ChatGPT にはプラグインのアーカイブ（yomimasu-chatgpt.zip）を入れる。スキルとして上げると Work でしか使われなかった（2026-11-06）。
type Step = readonly [title: string, text: string];
const ASK_EXAMPLE = '競技かるたの読みで、余韻の3秒はどこから数える？';
const SCREEN_CHECKED = '画面の名前は、2026年11月4日にパソコンのブラウザーで確かめたものです。';

function procedure(where: string, path: string, steps: readonly Step[], { checked = SCREEN_CHECKED, file = 'yomimasu.zip' } = {}): string {
  const save: Step = ['ファイルを保存する', `Web アプリの https://yomimasu.karutalog.com${path} で「${file} を保存」を押します。/yomimasu の知識をまとめたファイルです。開かずに、そのまま次へ進みます。`];
  return [where, ...[save, ...steps].map(([title, text], i) => `${i + 1}. ${title}：${text}`), `プランによっては使えません。${checked}`].join('\n');
}

const CLAUDE_STEPS: readonly Step[] = [
  ['コードの実行をオンにする', '左下の名前から「設定」を開き、「機能」の「クラウドでコードを実行」をオンにします。スキルを使うのに要ります。'],
  ['ファイルをアップロードする', '左の「カスタマイズ」から「Skills」、「＋追加」、「Skills をアップロード」の順に押します。保存したファイルを選び、「アップロード」を押します。'],
  ['聞いてみる', `新しいチャットで、読みのことを聞きます。例：${ASK_EXAMPLE}`],
];

const CHATGPT_STEPS: readonly Step[] = [
  ['ファイルをアップロードする', '左の「プラグイン」を開き、右上の「追加」から「プラグインアーカイブをアップロード」を押します。保存したファイルを選び、「プラグインを追加」を押します。'],
  ['プラグインをインストールする', '開いたページで「プラグインをインストール」を押します。'],
  ['聞いてみる', `ふだんのチャットで、読みのことを聞きます。スキルを指定して聞くときは、入力欄で「@」を打ち、「yomimasu」を選んでから聞きます。例：${ASK_EXAMPLE}`],
];

const GEMINI_STEPS: readonly Step[] = [
  ['ファイルをアップロードする', '左の「カスタマイズ」から「スキル」、「作成」、「アップロード」の順に押し、保存したファイルを選びます。'],
  ['聞いてみる', `新しいチャットで、読みのことを聞きます。例：${ASK_EXAMPLE}`],
];

// 入れる先を尋ねる画面（/install/）の選択肢と例。選択肢は Web の site/install.ts の INSTALL_TARGETS と同じ順にする。
const INSTALL_MENU = [
  '/yomimasu の読みの知識（スキル yomimasu）を、ふだん使う AI に入れます。入れる先を選び、次のどれかを打ち込みます。',
  '- Claude：`インストール Claude`',
  '- ChatGPT：`インストール ChatGPT`',
  '- Gemini：`インストール Gemini`',
  '- コーディングエージェント（Claude Code、Codex、Cursor など）：`インストール エージェント`',
  'たとえば：',
  '- 読みを頼まれた日の前に、5-3-1-6 の要点を教えてほしい',
  '- 日本語を母語としない自分のために、Wikipedia などの音声学の資料も読ませて、競技かるたの読みで間違えやすい発音を英語で教えてほしい',
  '- （コーディングエージェントで）自分の読みで、大山札が決まり字の前に聞き分けられるか、聞き取りテストを作って確かめたい',
  '- （コーディングエージェントで）5-3-1-6 の区切りで鳴る、自分の練習用のタイマーを作りたい',
].join('\n');

export const COMMANDS: readonly Command[] = [
  { button: 'まず1回読む', say: 'まず1回読む', path: '/read/', skill: { open: ['timing.md'], run: 'pair' } },
  { button: '総論を学ぶ', say: '総論を学ぶ', read: '総論.md', path: '/soron/', skill: { open: ['timing.md'] } },
  { button: 'ポイントを知る', say: 'ポイントを知る', read: 'ポイント.md', path: '/point/', skill: { open: ['point-candidates.md'], note: CANDIDATES } },
  { button: '1首ずつ学ぶ', say: '1首ずつ学ぶ', read: '一覧.md', path: '/karuta/', skill: { run: 'list' } },
  {
    button: 'このアプリについて',
    say: 'このアプリについて',
    read: 'このアプリについて.md',
    path: '/about/',
    skill: {
      note: '/yomimasu は独立したプロジェクトで、全日本かるた協会の公認を受けていません。Anthropic の製品やデモではありません。Web アプリでは、録音は端末の外へ出ません。スキルでは、音声ファイルをこの端末のスクリプトが読んで測り、AI には測った秒数と文だけを返します。出典は Web アプリの /about/ にあります。',
    },
  },
  {
    button: 'インストール',
    say: 'インストール',
    read: 'インストール.md',
    path: '/install/',
    skill: { note: INSTALL_MENU },
  },
  {
    button: 'Claude',
    say: 'インストール Claude',
    read: 'Claudeに入れる.md',
    path: '/install/claude/',
    skill: { note: procedure('パソコンのブラウザーで、claude.ai を開いて進めます。', '/install/claude/', CLAUDE_STEPS) },
  },
  {
    button: 'ChatGPT',
    say: 'インストール ChatGPT',
    read: 'ChatGPTに入れる.md',
    path: '/install/chatgpt/',
    skill: {
      note: procedure('パソコンのブラウザーで、chatgpt.com を開いて進めます。', '/install/chatgpt/', CHATGPT_STEPS, {
        checked: '画面の名前は、2026年11月6日にパソコンのブラウザーで確かめたものです。',
        file: 'yomimasu-chatgpt.zip',
      }),
    },
  },
  {
    button: 'Gemini',
    say: 'インストール Gemini',
    read: 'Geminiに入れる.md',
    path: '/install/gemini/',
    skill: { note: procedure('パソコンのブラウザーで、gemini.google.com を開いて進めます。', '/install/gemini/', GEMINI_STEPS) },
  },
  {
    button: 'コーディングエージェント',
    say: 'インストール エージェント',
    read: 'エージェントに入れる.md',
    path: '/install/agent/',
    skill: {
      note: 'ターミナルで `npx skills add ko1ynnky/yomimasu` を実行し、入れる先のエージェントを選びます。Node.js が要ります。入れたら `/yomimasu 余韻の3秒はどこから数える？` のように聞きます。更新は `npx skills update` です。' + UNCHECKED,
    },
  },
  { button: '1首のページ', say: '1首 {札}', read: '{札}.md', path: '/karuta/{札}/', skill: { open: ['card-rules.md', 'card-advice-candidates.md'], run: 'card', note: CANDIDATES } },
  { button: '最低限これだけ', say: '最低限これだけ', read: '最低限これだけ.md', path: '/saitei/', skill: { open: ['minimum.md'] } },
  {
    button: '練習モード',
    say: '練習モード',
    path: '/practice/',
    skill: { note: '読む組を決めて `読む <下の句の札> <上の句の札>` と打ち込むと、その組の歌を出します。札は決まり字で書きます（例：`読む ほ あはれ`）。' },
  },
  { button: '読む', say: '読む {下の句} {上の句}', path: '/read/rec/?shimo={下の句}&kami={上の句}', skill: { run: 'pair' } },
  { button: '結果を見る', say: '結果を見る', path: '/result/', skill: { run: 'measure' } },
  { button: '例の録音で見る', say: '結果を見る', path: '/result/example/', skill: { run: 'measure' } },
  {
    button: '前回と比べる',
    say: '前回と比べる',
    path: '/result/compare/',
    skill: { note: 'スキルは録音も結果も残さないので、前回と比べられません。前回と比べるのは Web アプリの画面です。' },
  },
];

// 画面の中だけの操作（8節の2つ目の表と、7節「歌に出すもの」の表記の切り替え）。スキルには対応を作らない。
// ここにないボタンは、ボタンの文字をそのまま打ち込む。
export const SCREEN_SAYS: readonly { button: string; say: string }[] = [
  { button: '戻る', say: '戻る' },
  { button: '漢字', say: '漢字まじり' },
  { button: 'かな', say: 'ひらがな' },
  { button: '実際の読みで確認する', say: '実際の読みで確認する' },
  { button: 'お手本を再生', say: 'お手本を再生' },
  { button: '上の句', say: '上の句を再生' },
  { button: '下の句', say: '下の句を再生' },
  { button: '自分の読み', say: '自分の読みを再生' },
  { button: 'ランダムに出題する', say: '読む ランダム' },
];

export type Resolved = { say: string; read?: string };

const SLOT = /\{([^}]+)\}/g;

// 札の番号を決まり字にする方法は Web とスキルで持ち方が違うので、呼ぶ側から渡す。
export function commandAt(href: string, nameOf: (card: string) => string | undefined): Resolved | undefined {
  const url = new URL(href, 'https://yomimasu.invalid');
  for (const command of COMMANDS) {
    const [path, query = ''] = command.path.split('?');
    const found = url.pathname.match(new RegExp(`^${path.replace(SLOT, '([^/]+)')}$`));
    if (!found) continue;
    const slots = [...path.matchAll(SLOT)].map(([, slot]) => slot);
    const cards = new Map(slots.map((slot, i) => [slot, found[i + 1]]));
    for (const [key, value] of new URLSearchParams(query)) {
      const slot = value.match(/^\{(.+)\}$/)?.[1];
      const card = url.searchParams.get(key);
      if (slot && card) cards.set(slot, card);
    }
    const named = new Map([...cards].map(([slot, card]) => [slot, nameOf(card)]));
    const unnamed = [command.say, command.read ?? ''].some((text) => [...text.matchAll(SLOT)].some(([, slot]) => named.get(slot) === undefined));
    if (unnamed) return undefined;
    const fill = (text: string) => text.replace(SLOT, (_, slot: string) => named.get(slot)!);
    return command.read ? { say: fill(command.say), read: fill(command.read) } : { say: fill(command.say) };
  }
  return undefined;
}

export type Said = { command: Command; cards: Map<string, string>; rest: string[] };

const wordsOf = (text: string) => text.trim().split(/\s+/).filter(Boolean);

// 引数の配列で受けたときは、コマンドの語のあとを引数のまま返す。空白を含む音声ファイルのパスを2語に割らないためである。
function restOf(args: readonly string[], used: number, words: string[]): string[] {
  let count = 0;
  for (let i = 0; i < args.length; i++) {
    if (count === used) return args.slice(i).filter((arg) => arg.trim() !== '');
    count += wordsOf(args[i]).length;
  }
  return count === used ? [] : words.slice(used);
}

// 打ち込んだ文字から表の行を引く（commandAt の逆）。結果を見るだけは、続けて音声ファイルと組を受け取る。
export function commandOf(input: string | readonly string[]): Said | undefined {
  const args = typeof input === 'string' ? [input] : input;
  const words = args.flatMap(wordsOf);
  for (const command of COMMANDS) {
    const pattern = command.say.split(' ');
    if (words.length < pattern.length || (words.length > pattern.length && command.skill.run !== 'measure')) continue;
    const cards = new Map<string, string>();
    const matched = pattern.every((part, i) => {
      const slot = part.match(/^\{(.+)\}$/)?.[1];
      if (slot) cards.set(slot, words[i]);
      return slot !== undefined || part === words[i];
    });
    if (matched) return { command, cards, rest: restOf(args, pattern.length, words) };
  }
  return undefined;
}

export const sayOfButton =(button: string): string => SCREEN_SAYS.find((row) => row.button === button)?.say ?? button;
