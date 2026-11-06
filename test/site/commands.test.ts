import assert from 'node:assert/strict';
import { test } from 'node:test';
import deck from '../../.claude/skills/yomimasu/assets/cards.json' with { type: 'json' };
import { commandAt, COMMANDS, sayOfButton } from '../../.claude/skills/yomimasu/scripts/commands.ts';
import type { Card } from '../../.claude/skills/yomimasu/scripts/cards.ts';
import { cardName, cardPage, cardUrl } from '../../site/karuta.ts';
import { cardNameAt } from '../../site/client/ui/card-names.ts';

const cards = deck.cards as unknown as Card[];
const names: Record<string, string> = { '53': 'なげき', '81': 'ほ', '45': 'あはれ', joka: '序歌' };
const nameOf = (card: string) => names[card];

test('教科書のページは、URL から打ち込む文字と読んだファイルの名前を引ける', () => {
  assert.deepEqual(commandAt('/soron/', nameOf), { say: '総論を学ぶ', read: '総論.md' });
  assert.deepEqual(commandAt('/karuta/', nameOf), { say: '1首ずつ学ぶ', read: '一覧.md' });
  assert.deepEqual(commandAt('/install/', nameOf), { say: 'インストール', read: 'インストール.md' });
});

test('読んだファイルのない画面は、打ち込む文字だけを引ける', () => {
  assert.deepEqual(commandAt('/practice/', nameOf), { say: '練習モード' });
  assert.deepEqual(commandAt('/result/example/', nameOf), { say: '結果を見る' });
});

test('1首のページは、札の番号ではなく決まり字で書く。序歌は「序歌」と書く', () => {
  assert.deepEqual(commandAt('/karuta/53/', nameOf), { say: '1首 なげき', read: 'なげき.md' });
  assert.deepEqual(commandAt('/karuta/joka/', nameOf), { say: '1首 序歌', read: '序歌.md' });
});

test('読むは、URL の組を下の句の札、上の句の札の順に決まり字で書く', () => {
  assert.deepEqual(commandAt('/read/rec/?shimo=81&kami=45', nameOf), { say: '読む ほ あはれ' });
});

test('組を指す欄のない URL は、組を持たない画面のコマンドとして引く', () => {
  assert.deepEqual(commandAt('/read/?shimo=81&kami=45', nameOf), { say: 'まず1回読む' });
});

test('表にない URL と、名前の分からない札は引けない', () => {
  assert.equal(commandAt('/', nameOf), undefined);
  assert.equal(commandAt('/nowhere/', nameOf), undefined);
  assert.equal(commandAt('/karuta/7/', nameOf), undefined);
  assert.equal(commandAt('/read/rec/', nameOf), undefined);
});

test('画面の中だけの操作は、表の文字を打ち込み、表にないボタンはボタンの文字のまま打ち込む', () => {
  assert.equal(sayOfButton('ランダムに出題する'), '読む ランダム');
  assert.equal(sayOfButton('上の句'), '上の句を再生');
  assert.equal(sayOfButton('かな'), 'ひらがな');
  assert.equal(sayOfButton('歌番号順'), '歌番号順');
  assert.equal(sayOfButton('100首の一覧へ'), '100首の一覧へ');
});

test('表の URL はどれも別の画面を指す', () => {
  const paths = COMMANDS.map((command) => command.path);
  assert.equal(new Set(paths).size, paths.length);
});

test('ブラウザーで引く札の名前は、1首のページの名前と同じである', () => {
  for (const card of cards) {
    const token = cardUrl(card.no).split('/')[2];
    assert.equal(cardNameAt(token), cardName(card), token);
  }
  assert.equal(cardNameAt('101'), undefined);
});

test('1首のページの実行の行と読んだ行は、表から引いたものと同じである', () => {
  for (const card of cards) {
    const page = cardPage(card, cards, []);
    assert.deepEqual(commandAt(cardUrl(card.no), cardNameAt), { say: page.command, read: page.readName }, page.command);
  }
});
