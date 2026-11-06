// コマンドの対応（docs/ui-guide.md の8節）。Web のボタンが打ち込む文字と、スキルが同じ内容を返すコマンドの対応を、ここだけに置く。
// Web は、組み立てのときに実行の行と読んだ行を、ブラウザーでは押したリンクが打ち込む文字を、この表から引く。

// {札} は、URL では札の番号（序歌は joka）、打ち込む文字と読んだ行では決まり字の仮名（序歌は「序歌」）に替える。
// 読むの組は、{下の句} と {上の句} の2枚の札で書く。
export type Command = { button: string; say: string; read?: string; path: string };

export const COMMANDS: readonly Command[] = [
  { button: 'まず1回読む', say: 'まず1回読む', path: '/read/' },
  { button: '総論を学ぶ', say: '総論を学ぶ', read: '総論.md', path: '/soron/' },
  { button: 'ポイントを知る', say: 'ポイントを知る', read: 'ポイント.md', path: '/point/' },
  { button: '1首ずつ学ぶ', say: '1首ずつ学ぶ', read: '一覧.md', path: '/karuta/' },
  { button: 'このアプリについて', say: 'このアプリについて', read: 'このアプリについて.md', path: '/about/' },
  { button: 'インストール', say: 'インストール', read: 'インストール.md', path: '/install/' },
  { button: 'Claude', say: 'インストール Claude', read: 'Claudeに入れる.md', path: '/install/claude/' },
  { button: 'ChatGPT', say: 'インストール ChatGPT', read: 'ChatGPTに入れる.md', path: '/install/chatgpt/' },
  { button: 'Gemini', say: 'インストール Gemini', read: 'Geminiに入れる.md', path: '/install/gemini/' },
  { button: 'コーディングエージェント', say: 'インストール エージェント', read: 'エージェントに入れる.md', path: '/install/agent/' },
  { button: '1首のページ', say: '1首 {札}', read: '{札}.md', path: '/karuta/{札}/' },
  { button: '最低限これだけ', say: '最低限これだけ', read: '最低限これだけ.md', path: '/saitei/' },
  { button: '練習モード', say: '練習モード', path: '/practice/' },
  { button: '読む', say: '読む {下の句} {上の句}', path: '/read/rec/?shimo={下の句}&kami={上の句}' },
  { button: '結果を見る', say: '結果を見る', path: '/result/' },
  { button: '例の録音で見る', say: '結果を見る', path: '/result/example/' },
  { button: '前回と比べる', say: '前回と比べる', path: '/result/compare/' },
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

export const sayOfButton = (button: string): string => SCREEN_SAYS.find((row) => row.button === button)?.say ?? button;
