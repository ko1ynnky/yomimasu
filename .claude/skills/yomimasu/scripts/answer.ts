// スキルに打ち込んだコマンドへの答え。Web のボタンが打ち込む文字と同じ文字を受け、commands.ts の表から答えを組み立てる。
// 測った結果の文と次に直す1点は、Web の結果の画面と同じ result.ts と next-point.ts から作る。
import deck from '../assets/cards.json' with { type: 'json' };
import type { Card } from './cards.ts';
import { commandOf, COMMANDS, SCREEN_SAYS, type Said } from './commands.ts';
import { measure } from './measure.ts';
import { nextPoint, type Pair } from './next-point.ts';
import { levelSentence, NOT_MEASURED, noticeOf, resultRows, UNMEASURED_ROW } from './result.ts';
import { decodeWav } from './wav.ts';

export type Reply = { ok: boolean; text: string };
export type Io = { readFile: (path: string) => Uint8Array };

const cards = deck.cards as unknown as Card[];
const JOKA = 0;

// まず1回読む の組（docs/ui-guide.md の8節「練習モードの組の選び方」）。Web では site/client/ui/stage.tsx の READ_PAIR である。
const FIRST_PAIR: Pair = { shimo: 81, kami: 45 };

const DEFINITION_URL = 'https://github.com/ko1ynnky/yomimasu/blob/main/docs/measure.md';

const nameOf = (card: Card) => card.kimariji?.kana ?? '序歌';

function cardAt(token: string): Card | undefined {
  if (token === '序歌' || token === 'joka') return cards.find((card) => card.no === JOKA);
  return cards.find((card) => card.kimariji?.kana === token);
}

const fail = (text: string): Reply => ({ ok: false, text });

function pairOf(shimoToken: string, kamiToken: string): { pair: Pair } | { error: string } {
  const [shimo, kami] = [cardAt(shimoToken), cardAt(kamiToken)];
  const unknown = [[shimoToken, shimo], [kamiToken, kami]].find(([, card]) => !card)?.[0];
  if (unknown !== undefined) return { error: `「${unknown}」の札が分かりません。札は決まり字の仮名で書きます（例：ほ、あはれ）。` };
  if (shimo!.no === JOKA || kami!.no === JOKA) return { error: '序歌を含む組は、まだ測れません。序歌は下の句を2回読むので、100首の1組の測り方をそのまま当てないためです。' };
  if (shimo!.no === kami!.no) return { error: '同じ札の下の句と上の句は1組になりません。1組は、前の札の下の句と次の札の上の句です。' };
  return { pair: { shimo: shimo!.no, kami: kami!.no } };
}

const pairName = ({ shimo, kami }: Pair) => `${nameOf(cards[shimo])} → ${nameOf(cards[kami])}`;

function cardText(card: Card): string[] {
  return [`## ${nameOf(card)}`, '', card.kimariji ? `決まり字：${card.kimariji.kana}` : '序歌は100首に数えない歌で、決まり字はありません。', '', `上の句：${card.marked.upper}`, `下の句：${card.marked.lower}`, '', '「ー」は伸ばす箇所です。'];
}

function listText(): string[] {
  return cards.map((card) => `- ${nameOf(card)}：${card.phrases[0].text}`);
}

function pairText(pair: Pair): string[] {
  const shimo = cards[pair.shimo];
  const kami = cards[pair.kami];
  return [
    `## ${pairName(pair)}`,
    '',
    `下の句（${nameOf(shimo)}）：${shimo.marked.lower}`,
    `上の句（${nameOf(kami)}）：${kami.marked.upper}`,
    '',
    '前の札の下の句を読み、最後の音を伸ばす余韻と間を挟んで、次の札の上の句を読みます。「ー」は伸ばす箇所です。',
    `読んだら WAV で録音し、\`結果を見る <WAV のパス> ${nameOf(shimo)} ${nameOf(kami)}\` で測ります。録音の頭と終わりには、声のない時間を少し入れます。`,
  ];
}

function measureText(rest: string[], io: Io): Reply {
  const [path, ...pairTokens] = rest;
  if (!path) return fail('測る音声の WAV のパスを渡してください：`結果を見る <WAV のパス> <下の句の札> <上の句の札>`');
  if (pairTokens.length !== 0 && pairTokens.length !== 2) return fail('組は下の句の札と上の句の札の2つを、決まり字で渡してください（例：ほ あはれ）。');
  const chosen = pairTokens.length === 2 ? pairOf(pairTokens[0], pairTokens[1]) : { pair: FIRST_PAIR };
  if ('error' in chosen) return fail(chosen.error);
  const { pair } = chosen;
  let bytes: Uint8Array;
  try {
    bytes = io.readFile(path);
  } catch {
    return fail(`${path} を読めません。パスを確かめてください。`);
  }
  let decoded;
  try {
    decoded = decodeWav(bytes);
  } catch (error) {
    return fail((error as Error).message);
  }
  // ファイルには合図の間の音がないとみなし、頭から測る。Web の例の録音（site/client/example.ts）と同じである。
  // 自動の音量調整が切れているかはファイルから分からないので、autoGainControl を渡さず、声の大きさは出さない。
  const measurement = measure({ ...decoded, readingStartSec: 0 });
  const rows = resultRows(measurement).map((row) => `| ${row.label} | ${row.reference} | ${row.value ?? '—'} | ${row.unmeasured ? UNMEASURED_ROW : (row.verdict ?? '')} |`);
  const lines = [`組：${pairName(pair)}`];
  if (pairTokens.length === 0) lines.push(`組の指定がないので、${pairName(pair)} の組として測りました。組は秒数を変えず、次に直す1点の教科書のページだけを変えます。`);
  lines.push('', '| 項目 | 標準の値 | 測った値 | 判定 |', '| --- | --- | --- | --- |', ...rows, '');
  const notice = noticeOf(measurement) ?? levelSentence(measurement);
  if (notice) lines.push(notice);
  lines.push(NOT_MEASURED, '');
  const next = nextPoint(measurement, pair);
  if (next.kind === 'clear') lines.push('## 次に直す1点', '', `**${next.fix}**`, '', next.reason, '');
  if (next.kind === 'point') {
    const { fix, reason, how, link } = next.point;
    lines.push('## 次に直す1点', '', `**${fix}**`, '', reason, '', how, '', `次は？：${link.label}（Web アプリの ${link.url}）`, '');
  }
  lines.push('幅はどれも目安です。音声はこの端末で読み、測った秒数と文だけを返しました。',`測定の定義：${DEFINITION_URL}`);
  return { ok: true, text: lines.join('\n') };
}

function run(said: Said, io: Io): Reply {
  const { command, cards: named, rest } = said;
  if (command.skill.run === 'measure') return measureText(rest, io);
  const lines: string[] = [];
  if (command.skill.run === 'list') lines.push('## 100首と序歌', '', ...listText());
  if (command.skill.run === 'card') {
    const token = named.get('札')!;
    const card = cardAt(token);
    if (!card) return fail(`「${token}」の札が分かりません。札は決まり字の仮名で書きます（例：なげき）。序歌は「序歌」です。`);
    // 知識のファイルは札を歌番号で挙げるので、探すための番号を渡す。Web の1首のページは歌番号を出さないが、ここは AI が読む行である。
    const target = card.no === JOKA ? '序歌の行' : `歌番号 ${card.no} の札`;
    lines.push(...cardText(card), '', `この札に当たる決まりと助言は、開いたファイルから${target}を探して答えます。`);
  }
  if (command.skill.run === 'pair') {
    const chosen = command.say.includes('{') ? pairOf(named.get('下の句')!, named.get('上の句')!) : { pair: FIRST_PAIR };
    if ('error' in chosen) return fail(chosen.error);
    lines.push(...pairText(chosen.pair));
  }
  if (command.skill.note) lines.push(command.skill.note);
  return { ok: true, text: lines.join('\n') };
}

export function answer(text: string, io: Io): Reply {
  const said = commandOf(text);
  const header = `> /yomimasu ${text.trim()}`;
  if (!said) {
    if (SCREEN_SAYS.some(({ say }) => say === text.trim())) return fail(`${header}\n\nWeb アプリの画面の中だけの操作で、スキルには対応がありません。`);
    const says = [...new Set(COMMANDS.map(({ say }) => `\`${say}\``))].join('、');
    return fail(`${header}\n\n表にないコマンドです。使えるのは ${says} です。札は決まり字で書きます。`);
  }
  const opened = (said.command.skill.open ?? []).map((file) => `● Read references/${file}`);
  const reply = run(said, io);
  const body = reply.ok ? [...opened, ...(opened.length ? ['（このファイルを開いて、その内容で答える）'] : []), '', reply.text] : ['', reply.text];
  return { ok: reply.ok, text: [header, ...body].join('\n') };
}
