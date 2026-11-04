// 1首のページの「気をつける点」。スキル yomimasu の references/card-rules.md の規則を札に当て、札ごとの文にする。
// 文の根拠は card-rules.md と、そこから引かれる知識のファイル（stretches.md、kana-reading.md、voice.md、first-phrase.md、revision-2020.md）にある。
// ここに知識を足すときは、先に references/ に書く。条件と当たる札は test/site/karuta.test.ts が card-rules.md の札と比べる。
// 札の番号は文に書かず、{{札 番号}} で書く。組み立てが決まり字のリンクに置き換える（画面に歌番号を出さない。docs/ui-guide.md の7節）。
//
// 入れないもの（docs/decisions.md の 2026-11-05 の項目）：
// - 「を」の読み分け。「を」に掛かる読み方一覧の注（62番）と、「を」で始まる札を母音で始まる札として扱うこと（26番）は出さない。
// - 44番と93番の二句の伸ばし方。改訂の前の二句の読みも書かない。
// - 母音の無声化の「作者の見解」。候補の一覧にない作者個人の考えなので、1首のページには出さない。
import { soundOffset, type Card, type Phrase } from '../../.claude/skills/yomimasu/scripts/cards.ts';

export type Priority = '高' | '中' | '低';

// count は、その札で規則が当たる箇所の数である。発音の規則だけが持つ。
export type Point = { id: string; priority: Priority; title: string; body: string; source: string; count?: number };

const GRAND = new Set([11, 15, 31, 50, 64, 76]);
const PHRASE_LENGTHS = [5, 7, 5, 7, 7];
const HA_ROW = new Set('はひふへほ');
const NASAL = new Set('がぎぐげご');
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
      source: '協会の資料（冊子 p.3、p.27、p.28、講習資料 s.10、s.11）',
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
      source: '協会の資料（冊子 p.15、講習資料 s.21）',
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
      source: '協会の資料（講習資料 s.18）',
    },
  ];
}

// 初句の6字は上の shoku6 で扱うので、ここでは二句から後の字余りだけを出す。
function jiamari(card: Card): Point[] {
  if (card.no === 0) return [];
  const long = card.phrases.flatMap((p, i) => (i > 0 && p.kana.length > PHRASE_LENGTHS[i] ? [`${quote(p.kana)}（${p.kana.length}字）`] : []));
  if (long.length === 0) return [];
  return [
    {
      id: 'jiamari',
      priority: '低',
      title: '字余りの句がある',
      body: `${join(long)}は、決まった字数より多い字余りの句です。`,
      source: '協会の資料（講習資料 s.18）',
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
  const source = '協会の資料（冊子 p.27）';
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
      source: '協会の資料（冊子 p.27-28）',
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

function tomofuda(card: Card, cards: readonly Card[]): Point[] {
  if (!card.kimariji || card.kimariji.kana.length < 2 || card.kimariji.kana.startsWith('を')) return [];
  const prefix = heardKimariji(card).slice(0, -1);
  const friends = cards
    .filter((c) => c.no !== card.no && c.kimariji && !c.kimariji.kana.startsWith('を') && heardKimariji(c).startsWith(prefix))
    .sort((a, b) => (a.kimariji!.kana < b.kimariji!.kana ? -1 : 1));
  if (friends.length === 0) return [];
  return [
    {
      id: 'tomofuda',
      priority: '中',
      title: '出だしが同じ札と読み比べる',
      body: `${refs(friends.map((c) => c.no))}と、決まり字の1字手前まで同じ音です。続けて読み比べ、決まり字までの速さと読み方がそろっているかを確かめます。`,
      source: '協会の資料（講習資料 s.15-16、s.18）',
    },
  ];
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

// 字数の変わる読み替え（てふ、けふ）の途中の字は、1字の音に分けられないので null を返す。
function soundCharAt(phrase: Phrase, at: number): string | null {
  const changing = phrase.diffs.find((d) => d.sound.length !== d.kana.length && d.at <= at && at < d.at + d.kana.length);
  if (changing) return at === changing.at ? changing.sound[0] : null;
  return phrase.sound[soundOffset(phrase, at)] ?? null;
}

const soundAt = (phrase: Phrase, at: number, length: number) => phrase.sound.slice(soundOffset(phrase, at), soundOffset(phrase, at + length));

function bidakuon(card: Card): Point[] {
  const spots = card.phrases.flatMap((p) =>
    [...p.kana].flatMap((_, at) => (at > 0 && NASAL.has(soundCharAt(p, at) ?? '') ? [spotText(p, at, 1)] : [])),
  );
  if (spots.length === 0) return [];
  return [
    {
      id: 'bidakuon',
      priority: '低',
      title: '語の途中のガ行は鼻濁音',
      body: `語の途中か終わりにあるガ行の音は、原則として鼻濁音で読みます。この札では${join(spots)}です。`,
      source: '協会の資料（冊子 p.27、p.29、p.33-34）',
      count: spots.length,
    },
  ];
}

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
      body:
        `${join(spots)}は、母音の i か u が無声の子音にはさまれ、喉を震わせない音になりやすい所です。` +
        '冊子は、無声化を意識して避けると読みがかえって不自然になると注意します。講習資料は、読みは会話よりはっきり発音するので有声になることもあり、読手によって違うとしたうえで、差を大げさに出さず、無理にそろえもしない自然な読みを勧めます。',
      source: '協会の資料（冊子 p.29-30、講習資料 s.19）',
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
  return [{ id, priority: '中', title: '語の途中のハ行を読み替える', body, source: '協会の資料（冊子 p.23）', count: shifted.length }];
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
      source: '協会の資料（冊子 p.23）',
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
  return [{ id: 'mu', priority: '中', title: '「む」を「ん」と読むか', body, source: '協会の資料（冊子 p.24）' }];
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
      source: '協会の資料（冊子 p.5-15）',
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

export function finalSound(card: Card): FinalSound {
  const kana = [...card.phrases[4].sound].findLast((char) => char !== 'ー')!;
  if (kana === 'ん') return { kana, vowel: 'ん' };
  const vowel = Object.keys(VOWEL_ROWS).find((v) => VOWEL_ROWS[v].includes(kana));
  if (!vowel) throw new Error(`${card.no}番の最後の音「${kana}」の母音が分からない`);
  return { kana, vowel: vowel as FinalSound['vowel'] };
}

// 弱め方の練習は作者の経験なので、ここでは協会の資料の余韻の決まりと、その札の音だけを書き、練習は「ポイントを知る」に分ける。
function yoinOto(card: Card): Point[] {
  const { kana, vowel } = finalSound(card);
  const which = vowel === 'ん' || vowel === kana ? quote(kana) : `${quote(kana)}（母音は${quote(vowel)}）`;
  return [
    {
      id: 'yoin-oto',
      priority: '中',
      title: `余韻で伸ばす音は${quote(kana)}`,
      body: `余韻は、下の句の最後の音を伸ばしていく部分です。この札では最後の${which}を伸ばし、消えていく間に${vowel === 'ん' ? '音' : '母音の音'}を変えません。最後の音ごとに弱め方を練習する方法は「ポイントを知る」にあります（作者の経験）。`,
      source: '協会の資料（冊子 p.3、講習資料 s.8、s.24）',
    },
  ];
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
        source: '協会の資料（冊子 p.4、講習資料 s.29）',
      },
    ];
  }
  return [
    {
      id: 'kami-tail-2',
      priority: '中',
      title: '上の句の終わりは最後の2字の前で伸ばす',
      body: `ほとんどの札は最後の1字の前で伸ばしますが、この札は最後の2字の前で伸ばします（${where}）。${TWO_BEFORE_REASONS[card.no] ?? ''}`,
      source: '協会の資料（冊子 p.4、講習資料 s.29）',
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
      source: '協会の資料（冊子 p.4、p.27）',
    },
  ];
}

const SHIKU_EXAMPLES = new Set([3, 14, 16, 22, 27, 33, 50, 57, 58, 68, 74, 79, 86, 87]);

function shiku(card: Card): Point[] {
  const fourth = kanaOf(card, 3);
  const inside = stretchesIn(card, 3).filter((after) => after < fourth.length);
  if (inside.length !== 1) return [];
  const example = SHIKU_EXAMPLES.has(card.no) ? '句の途中には伸ばしてよい所と悪い所があり、冊子はこの札を例に挙げて区切りを示しています。' : '';
  return [
    {
      id: 'shiku',
      priority: '中',
      title: '四句の途中で1回伸ばす',
      body: `四句は${splitAt(fourth, inside[0])}。どの札も四句の途中で1回伸ばします。${example}`,
      source: `協会の資料（冊子 p.26${example ? '、p.27' : ''}、講習資料 s.30）`,
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
      source: `協会の資料（冊子 p.${card.origin.notation.page}${grand ? '、p.3、p.27' : ''}${card.no === 99 ? '、講習資料 s.31' : ''}）`,
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
      source: `協会の資料（冊子 p.${card.origin.notation.page}）`,
    },
  ];
}

// 講習資料 s.28-31 が挙げた札。44番と93番の二句の項目は入れない（このファイルの冒頭）。
const REVISION: readonly { cards: number[]; text: (card: Card) => string; source: string }[] = [
  {
    cards: [10, 19, 23, 33, 37, 38, 53, 57, 75, 87, 99, 100],
    text: () => '上の句の終わりは、前は最後の1字の前でも2字の前でも伸ばせましたが、最後の1字の前にそろえました。',
    source: '講習資料 s.28',
  },
  {
    cards: [8, 83, 93],
    text: () => '上の句の終わりを最後の2字の前で伸ばす決まりは、改訂の後も残りました。',
    source: '講習資料 s.29',
  },
  {
    cards: [...EITHER_TAIL],
    text: () => '上の句の終わりは、前は最後の2字の前で伸ばす決まりでしたが、最後の1字の前でもよくなりました。',
    source: '講習資料 s.29',
  },
  {
    cards: [17, 42],
    text: (card) => `四句の途中に伸ばしがありませんでしたが、${quote(kanaOf(card, 3).slice(0, stretchesIn(card, 3)[0]))}の後で伸ばすようになりました。`,
    source: '講習資料 s.30',
  },
  {
    cards: [7, 14, 29, 37, 58, 69, 86],
    text: () => '四句の途中の伸ばし方を1通りにそろえました。',
    source: '講習資料 s.31',
  },
  { cards: [99], text: () => '四句の途中の伸ばし方が2通りになりました。', source: '講習資料 s.31' },
  { cards: [95], text: () => '三句「おほふかな」の注が変わりました。', source: '講習資料 s.31' },
];

function kaitei(card: Card): Point[] {
  const changes = REVISION.filter((r) => r.cards.includes(card.no));
  if (changes.length === 0) return [];
  return [
    {
      id: 'kaitei',
      priority: '低',
      title: '2020年の改訂で読み方が変わった',
      body: `改訂の前の読み方を覚えている人向けです。${changes.map((r) => r.text(card)).join('')}新しい読みは2021年4月1日からです。`,
      source: `協会の資料（${[...new Set(changes.map((r) => r.source))].join('、')}、冊子 p.1）`,
    },
  ];
}

// 品詞分解の印。表に列がないので、card-rules.md が冊子を目で見て数えた札をそのまま使う。
const KUGIRE = new Set([2, 8, 9, 11, 12, 13, 17, 20, 23, 24, 28, 29, 34, 35, 38, 40, 41, 42, 51, 59, 60, 66, 72, 73, 74, 78, 83, 84, 86, 89, 90, 91, 93, 95, 99]);
const KAKEKOTOBA = new Set([1, 8, 9, 10, 14, 16, 19, 20, 22, 24, 25, 27, 28, 30, 48, 51, 60, 61, 62, 64, 67, 71, 72, 77, 83, 88, 91, 94, 95, 96, 97, 98, 100]);

function hinshi(card: Card): Point[] {
  return [
    ...(KUGIRE.has(card.no)
      ? [{ id: 'kugire', priority: '低' as const, title: '歌の途中に句切れがある', body: '歌の途中で意味や内容が切れる所（句切れ）があります。冊子の品詞分解に印があります。語のまとまりを分かったうえで読むための資料です。', source: '協会の資料（冊子 p.16-22）' }]
      : []),
    ...(KAKEKOTOBA.has(card.no)
      ? [{ id: 'kakekotoba', priority: '低' as const, title: '掛詞がある', body: '1つの言葉に2つ以上の意味を持たせた語（掛詞）があります。冊子の品詞分解で枠に囲まれています。', source: '協会の資料（冊子 p.16-22）' }]
      : []),
  ];
}

const ORDER: Record<Priority, number> = { 高: 0, 中: 1, 低: 2 };

export function rulePoints(card: Card, cards: readonly Card[]): Point[] {
  const points = [
    ...oyama(card),
    ...shoku6(card),
    ...shiin(card),
    ...ichiji(card),
    ...tomofuda(card, cards),
    ...yoinOto(card),
    ...kamiTail(card),
    ...shiku(card),
    ...shimoTail(card),
    ...alt(card),
    ...hagyo(card),
    ...choon(card),
    ...mu(card),
    ...kana(card),
    ...bidakuon(card),
    ...museika(card),
    ...notes(card),
    ...jiamari(card),
    ...kaitei(card),
    ...hinshi(card),
  ];
  return points.sort((a, b) => ORDER[a.priority] - ORDER[b.priority]);
}
