// コマンドの対応（docs/ui-guide.md の8節）。Web のボタンが打ち込む文字と、スキルが同じ内容を返すコマンドの対応を、ここだけに置く。
// Web は、組み立てのときに実行の行と読んだ行を、ブラウザーでは押したリンクが打ち込む文字を、この表から引く。

// {札} は、URL では札の番号（序歌は joka）、打ち込む文字と読んだ行では決まり字の仮名（序歌は「序歌」）に替える。
// 読むの組は、{下の句} と {上の句} の2枚の札で書く。
// skill は、同じ文字をスキルに打ち込んだときの答えである。open は references/ の開くファイル、run は scripts/answer.ts が組み立てる答え、note は添える文である。
// Web の content/ の本文をスキルへ写す案は採らなかった。本文は HTML と組み立ての印を含み、写すと知識の置き場が2つになる。教科書の本文のもとになった references/ を開く。
export type SkillAnswer = { open?: readonly string[]; run?: 'list' | 'card' | 'pair' | 'measure'; note?: string };
export type Command = { button: string; say: string; read?: string; path: string; skill: SkillAnswer };

const NOT_YET = 'に入れる手順は、入れて答えることを確かめてから足します。いまはコーディングエージェントに入れる手順だけがあります（`インストール エージェント`）。';

export const COMMANDS: readonly Command[] = [
  { button: 'まず1回読む', say: 'まず1回読む', path: '/read/', skill: { open: ['timing.md'], run: 'pair' } },
  { button: '総論を学ぶ', say: '総論を学ぶ', read: '総論.md', path: '/soron/', skill: { open: ['timing.md'] } },
  { button: 'ポイントを知る', say: 'ポイントを知る', read: 'ポイント.md', path: '/point/', skill: { open: ['point-candidates.md'] } },
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
    skill: { note: 'スキル yomimasu は、コーディングエージェント（Claude Code、Codex、Cursor など）に入れられます。手順は `インストール エージェント` で出ます。Claude、ChatGPT、Gemini' + NOT_YET },
  },
  { button: 'Claude', say: 'インストール Claude', read: 'Claudeに入れる.md', path: '/install/claude/', skill: { note: 'Claude' + NOT_YET } },
  { button: 'ChatGPT', say: 'インストール ChatGPT', read: 'ChatGPTに入れる.md', path: '/install/chatgpt/', skill: { note: 'ChatGPT' + NOT_YET } },
  { button: 'Gemini', say: 'インストール Gemini', read: 'Geminiに入れる.md', path: '/install/gemini/', skill: { note: 'Gemini' + NOT_YET } },
  {
    button: 'コーディングエージェント',
    say: 'インストール エージェント',
    read: 'エージェントに入れる.md',
    path: '/install/agent/',
    skill: {
      note: 'ターミナルで `npx skills add ko1ynnky/yomimasu` を実行し、入れる先のエージェントを選びます。Node.js が要ります。入れたら `/yomimasu 余韻の3秒はどこから数える？` のように聞きます。更新は `npx skills update` です。',
    },
  },
  { button: '1首のページ', say: '1首 {札}', read: '{札}.md', path: '/karuta/{札}/', skill: { open: ['card-rules.md', 'card-advice-candidates.md'], run: 'card' } },
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

// 打ち込んだ文字から表の行を引く（commandAt の逆）。結果を見るだけは、続けて音声ファイルと組を受け取る。
export function commandOf(text: string): Said | undefined {
  const words = text.trim().split(/\s+/).filter(Boolean);
  for (const command of COMMANDS) {
    const pattern = command.say.split(' ');
    if (words.length < pattern.length || (words.length > pattern.length && command.skill.run !== 'measure')) continue;
    const cards = new Map<string, string>();
    const matched = pattern.every((part, i) => {
      const slot = part.match(/^\{(.+)\}$/)?.[1];
      if (slot) cards.set(slot, words[i]);
      return slot !== undefined || part === words[i];
    });
    if (matched) return { command, cards, rest: words.slice(pattern.length) };
  }
  return undefined;
}

export const sayOfButton =(button: string): string => SCREEN_SAYS.find((row) => row.button === button)?.say ?? button;
