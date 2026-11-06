// 1首のページの「気をつける点」。スキル yomimasu の references/card-rules.md の規則を札に当て、札ごとの文にする。
// 文の根拠は card-rules.md と、そこから引かれる知識のファイル（stretches.md、kana-reading.md、voice.md、first-phrase.md、revision-2020.md）にある。
// ここに知識を足すときは、先に references/ に書く。条件と当たる札は test/site/karuta.test.ts が card-rules.md の札と比べる。
// 札の番号は文に書かず、{{札 番号}} で書く。組み立てが決まり字のリンクに置き換える（画面に歌番号を出さない。docs/ui-guide.md の7節）。
//
// 入れないもの（docs/decisions.md の 2026-11-05 の項目）：
// - 「を」の読み分け。「を」に掛かる読み方一覧の注（62番）と、「を」で始まる札を母音で始まる札として扱うこと（26番）は出さない。
// - 44番と93番の二句の伸ばし方。改訂の前の二句の読みも書かない。
// - 母音の無声化の「作者の見解」。候補の一覧にない作者個人の考えなので、1首のページには出さない。
//
// 全部かほとんどの札に当たる規則（余韻で伸ばす音、四句の途中の伸ばし、鼻濁音、句切れと掛詞、字余り、2020年の改訂）は、
// card-rules.md にはあるが、1首のページには出さない（docs/decisions.md の 2026-11-06 の項目）。同じ文が101ページに並び、札ごとの点が埋もれるからである。
// 全部の札に共通の点は「ポイントを知る」にあり、1首のページはそこへ案内する。余韻で伸ばす音は、口の形の図の見出しに出す。
import { soundOffset, type Card, type Phrase } from '../../.claude/skills/yomimasu/scripts/cards.ts';

export type Priority = '高' | '中' | '低';

// source は「冊子 p.23、講習資料 s.19」のような短い印で書く。資料の名前と版は「このアプリについて」の出典にまとめてある。
// count は、その札で規則が当たる箇所の数である。発音の規則だけが持つ。
export type Point = { id: string; priority: Priority; title: string; body: string; source: string; count?: number };

const GRAND = new Set([11, 15, 31, 50, 64, 76]);
const HA_ROW = new Set('はひふへほ');
const VOICELESS_VOWEL = new Set('きしちひくすつふ');
const VOICELESS_NEXT = new Set('かきくけこさしすせそたちつてとはひふへほぱぴぷぺぽ');

const kanaOf = (card: Card, phrase: number) => card.phrases[phrase].kana;
const first = (card: Card) => kanaOf(card, 0);

export const isGrand = (card: Card) => GRAND.has(card.no);
export const isOneChar = (card: Card) => card.kimariji?.kana.length === 1;
export const isSixInitial = (card: Card) => card.no !== 0 && first(card).length === 6;
// 26番は表の発音では「お」で始まるが、「を」の読み分けを確かめるまで、母音で始まる札に数えない。
export const startsWithVowel = (card: Card) => card.no !== 0 && !first(card).startsWith('を') && 'あいうえお'.includes(card.phrases[0].sound[0]);

const quote = (text: string) => `「${text}」`;
const join = (items: readonly string[]) => items.join('、');
const refs = (nos: readonly number[]) => `{{札 ${nos.join(' ')}}}`;

// 決まり字と初句

function oyama(card: Card): Point[] {
  if (!isGrand(card)) return [];
  return [
    {
      id: 'oyama',
      priority: '高',
      title: '大山札。二句目まで一気に読む',
      body:
        `決まり字が6字の大山札です。二句目の頭の${quote(card.kimariji!.kana.slice(5))}まで聞かないと札が決まりません。初句と二句の間で伸ばさず、二句目まで続けて読みます。` +
        '決まり字までが長く読み急ぎやすいので、速すぎず遅すぎず、一定の速さを保ちます。' +
        '二句目の語の切れ目でわずかに伸ばしてもよく、読み方一覧はその読みを別の読みとして並べています。' +
        '二句目の頭は低くしても高いままでもよいのですが、同じ読手が札によって変えないようにします。',
      source: '冊子 p.3、p.27、p.28、講習資料 s.10、s.11',
    },
  ];
}

function ichiji(card: Card): Point[] {
  if (!isOneChar(card)) return [];
  return [
    {
      id: 'ichiji',
      priority: '中',
      title: '1字決まり。1音目で札が決まる',
      body: `決まり字は1音目の${quote(card.kimariji!.kana)}だけです。1音目は、強くするよりも、はっきり出すことが大事です。`,
      source: '冊子 p.15、講習資料 s.21',
    },
  ];
}

function shoku6(card: Card): Point[] {
  if (!isSixInitial(card)) return [];
  return [
    {
      id: 'shoku6',
      priority: '高',
      title: '初句が6字。長さでなく速さをそろえる',
      body: `初句の${quote(first(card))}は6字です。初句でそろえるのは長さではなく速さです。5字の初句と同じ速さで読むので、1字分長くなるのが自然です。5字の長さに詰めると、読み急いで聞こえます。`,
      source: '講習資料 s.18',
    },
  ];
}

// 冊子 p.27 の例。読んだ札 → 聞こえる札。決まり字が変わっていく途中の例は transitional にした。
const CONSONANT_DROPS: readonly { from: number[]; to: number[]; transitional?: true }[] = [
  { from: [55], to: [1] },
  { from: [89], to: [7] },
  { from: [85], to: [82] },
  { from: [62], to: [44] },
  { from: [46], to: [65] },
  { from: [100], to: [82] },
  { from: [87], to: [65] },
  { from: [81], to: [72] },
  { from: [28, 32], to: [7, 12], transitional: true },
  { from: [6], to: [31, 39, 64], transitional: true },
];

function shiin(card: Card): Point[] {
  const points: Point[] = [];
  const source = '冊子 p.27';
  for (const drop of CONSONANT_DROPS.filter((d) => d.from.includes(card.no))) {
    const when = drop.transitional ? '決まり字が変わっていく途中では、' : '';
    points.push({
      id: 'shiin',
      priority: '高',
      title: '1音目の子音を落とさない',
      body: `${when}1音目${quote(first(card)[0])}の子音がうまく出ず母音だけが届くと、${refs(drop.to)}と聞き違えられます。息を吸ったらすぐに口の形を作ると、1音目があいまいになりにくくなります。`,
      source,
    });
  }
  if (card.no === 17) {
    points.push({
      id: 'shiin',
      priority: '高',
      title: '1音目をはっきり出す',
      body: '1音目がはっきりしないと、「ちは」が「しは」に聞こえることがよくあります。',
      source: '冊子 p.27-28',
    });
  }
  for (const drop of CONSONANT_DROPS.filter((d) => d.to.includes(card.no))) {
    points.push({
      id: 'shiin-kikoe',
      priority: '低',
      title: 'ほかの札と聞き違えられやすい',
      body: `${drop.transitional ? '決まり字が変わっていく途中では、' : ''}${refs(drop.from)}の1音目の子音が落ちると、この札に聞こえることがあります。`,
      source,
    });
  }
  return points;
}

// 決まり字の1字手前まで同じ札。発音で比べ、「あふ」は「おほ」と同じ「おお」として扱う（44番と60番、95番）。
// 「を」で始まる札は、「を」の読み分けを確かめるまで比べない。
const heardKimariji = (card: Card) => card.kimariji!.sound.replaceAll('おう', 'おお');

// 項目の形にせず、札の名前だけの1行にする（2026-11-06 のユーザーの判断）。読み比べる練習の文は92首で同じになるからである。
export function sameStartLine(card: Card, cards: readonly Card[]): string | null {
  if (!card.kimariji || card.kimariji.kana.length < 2 || card.kimariji.kana.startsWith('を')) return null;
  const prefix = heardKimariji(card).slice(0, -1);
  const friends = cards
    .filter((c) => c.no !== card.no && c.kimariji && !c.kimariji.kana.startsWith('を') && heardKimariji(c).startsWith(prefix))
    .sort((a, b) => (a.kimariji!.kana < b.kimariji!.kana ? -1 : 1));
  if (friends.length === 0) return null;
  return `出だしが同じ札：${refs(friends.map((c) => c.no))}`;
}

// 発音

type Spot = { phrase: number; at: number };

// 字を指すときは、その字を含む語で示す。漢字の語には仮名を添える。
// 1字の助詞と、漢字のすぐ後ろに続く仮名（逢ふ、別れては）は、前の語と続けて示す。
function wordAt(phrase: Phrase, at: number): string {
  let cursor = 0;
  for (const [i, [text, kana]] of phrase.parts.entries()) {
    if (at < cursor + kana.length) {
      const [prevText, prevKana] = phrase.parts[i - 1] ?? ['', ''];
      const afterKanji = text === kana && prevText !== prevKana;
      if (i > 0 && (kana.length === 1 || afterKanji)) return prevText + text;
      return text === kana ? text : `${text}（${kana}）`;
    }
    cursor += kana.length;
  }
  throw new Error(`「${phrase.kana}」の ${at} 字目が語の中にない`);
}

// 表は長音を「ー」で書くことがある（#24 のあと）。「ー」とだけ書くと字に見えないので、伸ばすことを言葉で添える。
const soundText = (sound: string) => (sound === 'ー' ? '前の音を伸ばす「ー」' : quote(sound));

const spotText = (phrase: Phrase, at: number, length: number) => `${quote(wordAt(phrase, at))}の${quote(phrase.kana.slice(at, at + length))}`;

const soundAt = (phrase: Phrase, at: number, length: number) => phrase.sound.slice(soundOffset(phrase, at), soundOffset(phrase, at + length));

function museika(card: Card): Point[] {
  if (!card.kimariji) return [];
  const sound = card.phrases[0].sound;
  const spots = [...card.kimariji.sound].flatMap((char, at) =>
    VOICELESS_VOWEL.has(char) && VOICELESS_NEXT.has(sound[at + 1] ?? '') ? [`決まり字の${quote(card.kimariji!.sound)}の${quote(char)}`] : [],
  );
  if (spots.length === 0) return [];
  return [
    {
      id: 'museika',
      priority: '低',
      title: '決まり字の中に、母音が無声になりやすい音がある',
      // 無声化の仕組みと資料ごとの言い方は「ポイントを知る」にあるので、ここでは箇所と読み方だけを書く（2026-11-06 のユーザーの判断）。
      body: `${join(spots)}は、母音が無声になりやすい所です。無理に避けず、自然に読みます。`,
      source: '冊子 p.29-30、講習資料 s.19',
    },
  ];
}

const isHaShift = (phrase: Phrase, diff: Phrase['diffs'][number]) => {
  if (diff.kana.length !== 1 || !HA_ROW.has(diff.kana)) return false;
  if (!['語中のハ行', '一覧のふりがな', '一覧の注'].includes(diff.rule)) return false;
  // 長音の綴り（あふ、いふ、がふ）の「ふ」は、下の長音で扱う。
  return !(diff.kana === 'ふ' && phrase.diffs.some((d) => d.rule === '長音' && d.at + d.kana.length === diff.at));
};

function hagyo(card: Card): Point[] {
  const shifted = card.phrases.flatMap((p) =>
    p.diffs.filter((d) => isHaShift(p, d)).map((d) => `${spotText(p, d.at, 1)}は${soundText(soundAt(p, d.at, 1))}`),
  );
  const kept = card.origin.sound.kept
    .filter((k) => k.why === '語の頭' && HA_ROW.has(k.kana))
    .map((k) => spotText(card.phrases[k.phrase], k.at, 1));
  if (shifted.length === 0 && kept.length === 0) return [];
  const body = [
    shifted.length > 0 ? `語の頭にないハ行の音は、ワ行かア行の音で読みます。この札では${join(shifted)}と読みます。` : '',
    kept.length > 0 ? `${join(kept)}は、合わさった語の後ろの語の頭なので、ハ行のまま読みます。` : '',
  ].join('');
  // 読み替えのない札（語の頭のハ行だけの札）は、card-rules.md の「当たる札」に入らないので別の id にする。
  const id = shifted.length > 0 ? 'hagyo' : 'hagyo-kept';
  return [{ id, priority: '中', title: '語の途中のハ行を読み替える', body, source: '冊子 p.23', count: shifted.length }];
}

// 「いふ」のように字数の同じ綴りは、表で「い」と「ふ」の2つに分かれることがあるので、続く「ふ」までを1つの綴りとして出す。
function choon(card: Card): Point[] {
  const spellings = card.phrases.flatMap((p) =>
    p.diffs
      .filter((d) => d.rule === '長音' && d.kana !== 'ふ')
      .map((d) => {
        // 44番の「逢ふ」の「ふ」は、表では一覧の注として記録されている（#24 のあと）ので、規則の名前によらず続く「ふ」を含める。
        const length = d.kana.length + (p.diffs.some((n) => n.at === d.at + d.kana.length && n.kana === 'ふ') ? 1 : 0);
        return `${quote(p.kana.slice(d.at, d.at + length))}は${quote(soundAt(p, d.at, length))}`;
      }),
  );
  if (spellings.length === 0) return [];
  return [
    {
      id: 'choon',
      priority: '中',
      title: '長音で読む綴りがある',
      body: `母音の後に「う」の音が続くと、音が変わって長音になります。この札では${join(spellings)}と読みます。`,
      source: '冊子 p.23',
      count: spellings.length,
    },
  ];
}

function mu(card: Card): Point[] {
  const toN = card.phrases.flatMap((p) => p.diffs.filter((d) => d.rule === 'む').map((d) => spotText(p, d.at, 1)));
  const kept = card.origin.sound.kept.filter((k) => k.kana === 'む').map((k) => ({ text: spotText(card.phrases[k.phrase], k.at, 1), why: k.why }));
  if (toN.length === 0 && kept.length === 0) return [];
  const body = [
    toN.length > 0 ? `助動詞の「む」「らむ」「けむ」の「む」は「ん」と読みます。この札では${join(toN)}です。` : '',
    ...kept.map((k) => `${k.text}は${k.why === '語の頭' ? '語の頭' : '語の一部'}なので、「む」のまま読みます。`),
  ].join('');
  return [{ id: 'mu', priority: '中', title: '「む」を「ん」と読むか', body, source: '冊子 p.24' }];
}

// 「を」は「ワ行」の規則に入るが、読み分けを確かめるまで扱わない。
function kana(card: Card): Point[] {
  const spots = card.phrases.flatMap((p) =>
    p.diffs
      .filter((d) => (d.rule === 'ワ行' && (d.kana === 'ゐ' || d.kana === 'ゑ')) || d.rule === '四つ仮名')
      .map((d) => `${spotText(p, d.at, 1)}は${quote(soundAt(p, d.at, 1))}`),
  );
  if (spots.length === 0) return [];
  return [
    {
      id: 'kana',
      priority: '中',
      title: '「ゐ」「ゑ」「ぢ」「づ」の読み方',
      body: `「ゐ」「ゑ」は「い」「え」、「ぢ」「づ」は「じ」「ず」と読みます。この札では${join(spots)}と読みます。読み方一覧のふりがなでも確かめられます。`,
      source: '冊子 p.5-15',
    },
  ];
}

// 余韻で伸ばす最後の音。結句の発音の最後の字で、「ー」で終わるときはその前の字にする。
const VOWEL_ROWS: Record<string, string> = {
  あ: 'あかさたなはまやらわがざだばぱぁゃ',
  い: 'いきしちにひみりぎじぢびぴぃゐ',
  う: 'うくすつぬふむゆるぐずづぶぷぅゅ',
  え: 'えけせてねへめれげぜでべぺぇゑ',
  お: 'おこそとのほもよろをごぞどぼぽぉょ',
};

export type FinalSound = { kana: string; vowel: 'あ' | 'い' | 'う' | 'え' | 'お' | 'ん' };

export const vowelOf = (kana: string) => Object.keys(VOWEL_ROWS).find((v) => VOWEL_ROWS[v].includes(kana)) as Exclude<FinalSound['vowel'], 'ん'> | undefined;

export function finalSound(card: Card): FinalSound {
  const kana = [...card.phrases[4].sound].findLast((char) => char !== 'ー')!;
  if (kana === 'ん') return { kana, vowel: 'ん' };
  const vowel = vowelOf(kana);
  if (!vowel) throw new Error(`${card.no}番の最後の音「${kana}」の母音が分からない`);
  return { kana, vowel };
}

// 伸ばす位置

const stretchesIn = (card: Card, phrase: number) => card.stretches.filter((s) => s.phrase === phrase).map((s) => s.after);

const splitAt = (text: string, at: number) => `${quote(text.slice(0, at))}で伸ばし、${quote(text.slice(at))}と続けます`;

// 改訂で2字前に残した3首の理由（講習資料 s.29）。
const TWO_BEFORE_REASONS: Record<number, string> = {
  8: '「すむ」は係り結びの結びなので、2字を離しません。',
  83: '「おもひいる」を最後の1字の前で分けると、発音しにくくなります。',
  93: '最後の「ぐ」は鼻濁音で、1字だけを残すと違和感が出ます。',
};

const EITHER_TAIL = new Set([7, 13, 15, 17, 20, 24, 27, 28, 30, 41, 42, 46, 48, 49, 50, 51, 62, 73, 79, 86, 88, 95]);

function kamiTail(card: Card): Point[] {
  const third = kanaOf(card, 2);
  if (card.no === 0 || !stretchesIn(card, 2).includes(third.length - 2)) return [];
  const where = splitAt(third, third.length - 2);
  if (EITHER_TAIL.has(card.no)) {
    return [
      {
        id: 'kami-tail-either',
        priority: '中',
        title: '上の句の終わりは1字前でも2字前でもよい',
        body: `読み方一覧は最後の2字の前に印を付けています（${where}）。2020年の改訂で、この札は最後の1字の前で伸ばしてもよくなりました。`,
        source: '冊子 p.4、講習資料 s.29',
      },
    ];
  }
  return [
    {
      id: 'kami-tail-2',
      priority: '中',
      title: '上の句の終わりは最後の2字の前で伸ばす',
      body: `ほとんどの札は最後の1字の前で伸ばしますが、この札は最後の2字の前で伸ばします（${where}）。${TWO_BEFORE_REASONS[card.no] ?? ''}`,
      source: '冊子 p.4、講習資料 s.29',
    },
  ];
}

function shimoTail(card: Card): Point[] {
  const fifth = kanaOf(card, 4);
  if (card.no === 0 || !stretchesIn(card, 4).includes(fifth.length - 3)) return [];
  return [
    {
      id: 'shimo-tail-3',
      priority: '中',
      title: '下の句の終わりは最後の3字の前で伸ばす',
      body: `多くの札は下の句の最後の2字の前で伸ばしますが、この札は最後の3字${quote(fifth.slice(-3))}をひとまとめにし、その前で伸ばします。3字は続けて読み、途中で伸ばしません。`,
      source: '冊子 p.4、p.27',
    },
  ];
}

function alt(card: Card): Point[] {
  return card.alternatives.map((a) => {
    const grand = a.phrases[0] < 3;
    return {
      id: 'alt',
      priority: '中' as const,
      title: '読み方一覧に別の読みがある',
      body:
        `読み方一覧は、本文の横にもう1つの読み方${quote(a.marked)}を並べています。` +
        (grand ? '二句の途中でも伸ばす読みです。' : '四句の伸ばす所が違う読み方です。') +
        (card.no === 99 ? '四句の伸ばし方は、2020年の改訂で2通りになりました。' : ''),
      source: `冊子 p.${card.origin.notation.page}${grand ? '、p.3、p.27' : ''}${card.no === 99 ? '、講習資料 s.31' : ''}`,
    };
  });
}

function notes(card: Card): Point[] {
  const spots = card.notes
    .filter((n) => !card.phrases[n.phrase].kana.slice(n.at, n.at + n.length).includes('を'))
    .map((n) => `${spotText(card.phrases[n.phrase], n.at, n.length)}に（${n.reading}）`);
  if (spots.length === 0) return [];
  return [
    {
      id: 'notes',
      priority: '低',
      title: '読み方一覧に括弧つきの注がある',
      body: `読み方一覧は、${join(spots)}のように、ふりがなに括弧に入れた小さな仮名を添えています。括弧の意味を説明する文は資料にありません。`,
      source: `冊子 p.${card.origin.notation.page}`,
    },
  ];
}

function joka(card: Card): Point[] {
  if (card.no !== 0) return [];
  return [
    {
      id: 'joka',
      priority: '高',
      title: '序歌は下の句を2回読む',
      body: '序歌は百人一首に入っていない歌で、1枚目の札の前に読みます。上の句、下の句と読んだ後、下の句をもう一度読んでから、1枚目の上の句へ進みます。100首の1組とは形が違います。協会は「難波津に」の歌を序歌に指定していて、昭和29年（1954年）に選ばれました。',
      source: '冊子 p.36、p.38、p.39-40、講習資料 s.13',
    },
  ];
}

// 1首のページの文のうち、規則によらない決まった文。

export const PRIORITY_NOTE = '優先の高・中・低は、資料が付けた順位ではなく、このアプリの案です。';

// 助言の候補の出典を、画面の短い印にする。資料の名前と版は「このアプリについて」の出典にまとめてある。
// 読手のメモには「読手個人のやり方」を添え、協会の資料と分けて書く（REVIEW.md）。候補の区分が「読手のメモ」でも、出典に協会の資料（読み方一覧の注、講習資料）が並ぶ行がある。
export function adviceSourceText(kind: string, source: string): string {
  const parts = source
    .replaceAll('完全版', '冊子')
    .split('、')
    .map((part) => part.replace(/^メモ([12]) /, '読手のメモ$1 '));
  if (!kind.startsWith('読手のメモ')) return parts.join('、');
  const memo = parts.filter((part) => part.startsWith('読手のメモ'));
  const others = parts.filter((part) => !part.startsWith('読手のメモ'));
  const tournament = kind.includes('大会向け') ? '。大会やきちんとした練習会での話で、ふだんの練習会では参考程度' : '';
  return [`${memo.join('、')}（読手個人のやり方${tournament}）`, ...others].join('、');
}

const ORDER: Record<Priority, number> = { 高: 0, 中: 1, 低: 2 };

export function rulePoints(card: Card): Point[] {
  const points = [
    ...joka(card),
    ...oyama(card),
    ...shoku6(card),
    ...shiin(card),
    ...ichiji(card),
    ...kamiTail(card),
    ...shimoTail(card),
    ...alt(card),
    ...hagyo(card),
    ...choon(card),
    ...mu(card),
    ...kana(card),
    ...museika(card),
    ...notes(card),
  ];
  return points.sort((a, b) => ORDER[a.priority] - ORDER[b.priority]);
}
