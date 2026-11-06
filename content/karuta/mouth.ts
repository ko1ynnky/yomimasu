// 余韻の最後の音の口の形と、発話の終わりの「ん」の口の中の位置。教科書の「ポイントを知る」と1首のページで使う。
// 図と文は、一般の音声学の公開の資料と、「ん」を実測した研究から、このアプリが自分で描き、書いた。出典はスキルの references/mouth-shapes.md にあり、画面では「このアプリについて」の出典（#src-phonetics、#src-research）に出す。
// 読手テキストの調音点・調音法の一覧と口腔断面図（完全版 p.31-32）は、開かず、もとにもしていない（REVIEW.md の「資料の範囲」）。
// 何を図にするかも、その一覧の作りではなく、余韻の練習で要る2つ（最後の音ごとの口の形と、「ん」の位置の幅）から決めた。
// 断面は形を伝えるためのスケッチで、寸法は測っていない。研究の論文の図も写していない。

import type { Card } from '../../.claude/skills/yomimasu/scripts/cards.ts';
import { finalSound, vowelOf, type FinalSound } from './rules.ts';

export type FinalVowel = FinalSound['vowel'];

export const FINAL_SOUNDS: readonly FinalVowel[] = ['あ', 'い', 'う', 'え', 'お', 'ん'];

type Ellipse = readonly [rx: number, ry: number];

type Shape = {
  tongue: string;
  lips: string;
  keep: string;
  front: { outer: Ellipse; inner: Ellipse };
  // 横から見た口。lower は下唇の高さ、hump は舌の最も高い所、protrude は唇の突き出し。
  side: { lower: number; hump: readonly [x: number, y: number]; protrude: number };
};

// 舌と唇の文は、一般の音声学の母音の記述（Wikipedia の Japanese phonology と「日本語の音韻」）を自分の言葉で書いた。
// keep は、母音の違いを決めている所（舌の高さと前後、唇の丸め）を余韻の弱め方に当てた、このアプリの解釈である。研究で確かめたものではない。
export const SHAPES: Record<FinalVowel, Shape> = {
  あ: {
    tongue: '舌は低く、前後のまん中にある',
    lips: 'あごを下げて、口を大きく開く',
    keep: 'あごを下げた口の開き',
    front: { outer: [40, 34], inner: [27, 23] },
    side: { lower: 74, hump: [176, 68], protrude: 0 },
  },
  い: {
    tongue: '舌の前の方が高く、上あごに近い',
    lips: '開きは狭く、唇は丸めない',
    keep: '舌の前の高さと、丸めない唇の狭い開き',
    front: { outer: [48, 17], inner: [37, 4] },
    side: { lower: 55, hump: [160, 40], protrude: -2 },
  },
  う: {
    tongue: '舌の奥の方が高い',
    lips: '開きは小さく、唇は丸めないか両端を寄せる程度で、前に突き出さない',
    keep: '舌の奥の高さと、突き出さない唇の小さな開き',
    front: { outer: [27, 17], inner: [12, 5] },
    side: { lower: 56, hump: [188, 42], protrude: 0 },
  },
  え: {
    tongue: '舌の前の方が、中くらいの高さにある',
    lips: '中くらいに開き、唇は丸めない',
    keep: '中くらいの開きと、舌の前の位置',
    front: { outer: [45, 24], inner: [32, 12] },
    side: { lower: 63, hump: [162, 52], protrude: 0 },
  },
  お: {
    tongue: '舌の奥の方が、中くらいの高さにある',
    lips: '唇を丸める。丸めは弱い',
    keep: '唇の丸めと、舌の奥の位置',
    front: { outer: [31, 29], inner: [17, 17] },
    side: { lower: 63, hump: [190, 54], protrude: 5 },
  },
  ん: {
    tongue: '舌で口の中を閉じ、息を鼻へ通す。研究では、閉じる所は人によって違い、閉じない例もあった',
    lips: '唇で閉じる人もいる',
    keep: '自分の閉じ方と、鼻へ抜ける息',
    front: { outer: [40, 15], inner: [16, 3] },
    side: { lower: 54, hump: [176, 44], protrude: 0 },
  },
};

const n = (value: number) => Math.round(value * 10) / 10;

// 上唇の中央がくぼむ形にして、楕円より唇らしく見せる。
function lipsPath(cx: number, cy: number, [rx, ry]: Ellipse) {
  return [
    `M${n(cx - rx)} ${cy}`,
    `C${n(cx - rx * 0.7)} ${n(cy - ry * 0.95)} ${n(cx - rx * 0.25)} ${n(cy - ry * 1.1)} ${cx} ${n(cy - ry * 0.82)}`,
    `C${n(cx + rx * 0.25)} ${n(cy - ry * 1.1)} ${n(cx + rx * 0.7)} ${n(cy - ry * 0.95)} ${n(cx + rx)} ${cy}`,
    `C${n(cx + rx * 0.75)} ${n(cy + ry * 1.3)} ${n(cx - rx * 0.75)} ${n(cy + ry * 1.3)} ${n(cx - rx)} ${cy}Z`,
  ].join('');
}

function frontView({ outer, inner }: Shape['front']) {
  const [cx, cy] = [56, 55];
  return `<path class="m-lip" d="${lipsPath(cx, cy, outer)}"/><ellipse class="m-open" cx="${cx}" cy="${cy}" rx="${inner[0]}" ry="${inner[1]}"/>`;
}

// 横から見た口。左が唇、右がのど。上あごの線は、前から歯茎、硬口蓋、軟口蓋、口蓋垂の順に続く。
const ROOF = 'M138 44C142 38 148 34 157 32C171 29 186 30 196 34C204 37 209 42 211 48C212 52 211 55 208 56';

function sideView({ lower, hump: [hx, hy], protrude }: Shape['side'], nasal: boolean) {
  const x = 125 - protrude;
  const upperLip = `M138 33C${x + 4} 33 ${x - 1} 39 ${x} 45C${x + 1} 49 132 50 138 48Z`;
  const lowerLip = `M138 ${lower - 3}C${x + 4} ${lower - 4} ${x - 1} ${lower + 1} ${x} ${lower + 6}C${x + 1} ${lower + 10} 132 ${lower + 11} 138 ${lower + 9}Z`;
  const chin = `M134 ${lower + 10}C128 ${lower + 22} 130 98 134 106`;
  const tip = lower + 1;
  const tongue = `M142 ${tip}C146 ${tip - 6} ${hx - 26} ${hy} ${hx} ${hy}C${hx + 22} ${hy} 218 ${hy + 16} 218 106L178 106C160 106 146 ${tip + 16} 142 ${tip}Z`;
  return [
    '<path class="m-wall" d="M226 14C228 40 228 80 226 106"/>',
    `<path class="m-wall" d="M140 12C138 20 136 26 136 33"/>`,
    nasal ? `<path class="m-range" d="${ROOF}"/>` : '',
    `<path class="m-roof" d="${ROOF}"/>`,
    `<path class="m-tooth" d="M138 44L138 50"/><path class="m-tooth" d="M138 ${lower - 2}L138 ${lower + 4}"/>`,
    `<path class="${nasal ? 'm-tongue m-tongue--any' : 'm-tongue'}" d="${tongue}"/>`,
    nasal ? '' : `<circle class="m-top" cx="${hx}" cy="${hy}" r="3.2"/>`,
    `<path class="m-lip" d="${upperLip}"/><path class="m-lip" d="${lowerLip}"/>`,
    `<path class="m-wall" d="${chin}"/>`,
  ].join('');
}

// 1首のページには「余韻」の名前の印が別にあるので、図の名前に「余韻」を入れない。
export function mouthSvg(sound: FinalVowel): string {
  const shape = SHAPES[sound];
  const label = `「${sound}」の口の形。正面から見た唇と、横から見た口の中`;
  return `<svg class="mouth-svg" viewBox="0 0 240 110" role="img" aria-label="${label}">${frontView(shape.front)}${sideView(shape.side, sound === 'ん')}</svg>`;
}

// 6つを並べる「ポイントを知る」では、狭い画面で2列に収めるため、舌と唇の文を省いて保つ所だけを書く。1首のページは1つなので文も書く。
// 1首のページは図の下の説明を1行に縮めたので、保つ所がこのアプリの解釈であることを、説明の代わりに保つ所の頭に書く。
export function mouthPanelHtml(sound: FinalVowel, { detail }: { detail: boolean }): string {
  const { tongue, lips, keep } = SHAPES[sound];
  const description = detail ? `<p>${tongue}。${lips}。</p>` : '';
  return `<div class="mouth"><span class="mouth-name">${sound}</span>${mouthSvg(sound)}${description}<p class="mouth-keep">${detail ? '保つ（このアプリの解釈）' : '保つ'}：${keep}</p></div>`;
}

// 「ん」の断面。舌が上あごに付く所は、研究で歯茎から口蓋垂まで幅があった。幅は朱の帯で示し、1点に決めて描かない。
// 帯は研究が報告した範囲の両端（歯茎と口蓋垂）を結んだもので、その間のどこが多いかや、前の母音ごとの位置は描かない。研究どうしで結論が食い違うからである。
// 舌は位置が決まらないので点線で描く。唇を閉じる例があることは、唇を囲む点線で示す。
const NASAL_ROOF = 'M96 112C128 105 170 104 204 111C216 115 230 126 240 138C246 146 249 150 251 149';

export function nasalSvg(): string {
  const label = '「ん」の口の中の位置。舌が上あごに付く所は人と語で違い、歯茎から口蓋垂まで幅がある。唇を閉じる人もいる。息は鼻へ抜ける';
  return [
    `<svg class="nasal-svg" viewBox="0 0 360 290" role="img" aria-label="${label}">`,
    // 鼻の通り道は、輪郭を強くせず地の色だけで示す。
    '<path class="m-nose" d="M70 100C86 76 116 64 164 62C214 60 254 66 280 84L276 96C230 98 140 96 70 104Z"/>',
    // 顔の線：額から鼻、上唇、下唇、あご、首
    '<path class="m-face" d="M80 4C76 30 66 56 46 86C42 92 46 98 54 100C60 101 64 101 68 101"/>',
    '<path class="m-lip" d="M68 101C62 106 56 114 56 120C56 125 61 128 70 128L76 124Z"/>',
    '<path class="m-lip" d="M70 142C61 143 56 149 58 155C60 160 66 162 74 161L77 148Z"/>',
    '<path class="m-face" d="M74 161C76 174 74 188 82 198C94 206 114 208 132 212L150 288"/>',
    // 上あご：硬口蓋と、下がった軟口蓋、口蓋垂
    '<path class="m-palate" d="M70 104C110 98 170 96 214 102C228 106 244 118 254 134C258 142 256 150 250 151C244 150 238 138 230 128C220 118 212 113 204 111C170 104 128 105 96 112C90 113 84 113 79 112L76 104Z"/>',
    '<path class="m-tooth" d="M79 112L79 127"/><path class="m-tooth" d="M80 144L80 157"/>',
    // のどの奥の壁
    '<path class="m-wall" d="M280 84C287 120 290 200 286 288"/>',
    '<path class="m-tongue m-tongue--any" d="M86 158C98 148 130 154 170 156C214 158 246 170 256 202C264 234 262 262 258 288L152 288L134 214C116 208 96 196 86 158Z"/>',
    `<path class="m-range" d="${NASAL_ROOF}"/>`,
    // 息の流れ：のどから軟口蓋の後ろを通って鼻へ
    '<path class="m-air" d="M270 216C270 172 270 124 266 102C256 90 210 88 160 89C118 90 92 93 74 99"/><path class="m-air-head" d="M70 100l10-2l-4 8z"/>',
    '<ellipse class="m-alt-lips" cx="62" cy="141" rx="17" ry="27"/>',
    '<g class="m-label">',
    '<text x="172" y="86" text-anchor="middle">鼻へ抜ける息</text>',
    '<text x="104" y="140" text-anchor="middle">歯茎</text>',
    '<text x="160" y="140" text-anchor="middle">硬口蓋</text>',
    '<path class="m-leader" d="M234 126L292 120"/><text x="296" y="126">軟口蓋</text>',
    '<path class="m-leader" d="M254 150L292 170"/><text x="296" y="178">口蓋垂</text>',
    '<text x="190" y="232" text-anchor="middle">舌</text>',
    '<path class="m-leader" d="M54 168L40 248"/><text x="2" y="270">唇を閉じる人も</text>',
    '</g>',
    '<g class="m-legend"><path class="m-range" d="M150 18L172 18"/><text x="178" y="24">舌が付いた所の幅</text></g>',
    '</svg>',
  ].join('');
}

const MARKS_NOTE: Record<'vowel' | 'nasal', string> = {
  vowel: '朱の点は舌の最も高い所の目安です。',
  nasal: '「ん」の朱の帯は、話し言葉の「ん」を実測した研究で、舌が上あごに付いていた所の幅です。',
};

const mouthsCaption = (marks: readonly ('vowel' | 'nasal')[]) =>
  `左は正面から見た唇、右は横から見た口の中（左が唇、右がのど）のスケッチで、寸法は測っていません。${marks.map((m) => MARKS_NOTE[m]).join('')}舌と唇の形は、一般の音声学の資料（Wikipedia 英語版「Japanese phonology」「Vowel」、日本語版「日本語の音韻」）をもとに、このアプリが描きました。余韻の間に口の形と舌の位置を保つことは、協会の資料にあります（講習資料 s.24-25）。音ごとに何を「保つ」かは、母音の違いを決める舌と唇の形から当てた、このアプリの解釈です。`;

const NASAL_CAPTION =
  '「ん」の口の中を横から見たスケッチです。朱の帯は、研究で舌が上あごに付いていた所の幅で、1か所ではありません。舌の点線は位置が人によって違うことを、唇の点線の囲みは唇を閉じる人もいることを示します。息は、下がった軟口蓋の後ろを通って鼻へ抜けます（一般の音声学）。';

export function mouthFiguresHtml(): string {
  return `<figure class="mouths">${FINAL_SOUNDS.map((sound) => mouthPanelHtml(sound, { detail: false })).join('')}<figcaption>${mouthsCaption(['vowel', 'nasal'])}</figcaption></figure>`;
}

export function nasalFigureHtml(): string {
  return `<figure class="nasal">${nasalSvg()}<figcaption>${NASAL_CAPTION}</figcaption></figure>`;
}

// 1首のページの図の下の説明。資料の名前は「このアプリについて」の出典にまとめ、ここでは1行にする（2026-11-06 のユーザーの判断）。
const CARD_MARKS_NOTE: Record<'vowel' | 'nasal', string> = {
  vowel: '朱の点は舌の最も高い所の目安です。',
  nasal: '「ん」の朱の帯は、<a href="/about/#src-research">研究</a>で舌が上あごに付いていた所の幅です。',
};

const cardMouthCaption = (mark: 'vowel' | 'nasal') =>
  `図は、一般の音声学の資料（<a href="/about/#src-phonetics">Wikipedia ほか</a>）をもとにこのアプリが描いたスケッチで、寸法は測っていません。${CARD_MARKS_NOTE[mark]}`;

// 1首のページの、その札の最後の音の図。「ん」の位置の説明は長いので、「ポイントを知る」の「余韻が消えるまで口の形を変えない」の行（id="yoin-oto"）の中の折りたたみ（id="yoin-n"）へ案内する。
export function cardMouthHtml(card: Card): string {
  const { vowel } = finalSound(card);
  const nasal = vowel === 'ん' ? '<p>話し言葉の研究では、発話の終わりの「ん」をどこで閉じるかは、人によって違いました。研究でわかっていることと、このアプリの考えは、<a href="/point/#yoin-n">ポイントを知る</a>にあります。</p>' : '';
  return `<figure class="mouths mouths--one">${mouthPanelHtml(vowel, { detail: true })}<figcaption>${nasal}<p>${cardMouthCaption(vowel === 'ん' ? 'nasal' : 'vowel')}</p></figcaption></figure>`;
}

// 「ん」で終わる札

export type NasalEnding = { ending: string; vowel: Exclude<FinalVowel, 'ん'>; cards: Card[] };

const lastTwo = (card: Card) => card.phrases[4].sound.replace(/ー+$/, '').slice(-2);

export function nasalEndings(cards: readonly Card[]): NasalEnding[] {
  const groups = new Map<string, Card[]>();
  for (const card of cards.filter((c) => finalSound(c).vowel === 'ん')) groups.set(lastTwo(card), [...(groups.get(lastTwo(card)) ?? []), card]);
  return [...groups]
    .map(([ending, members]) => {
      const vowel = vowelOf(ending[0]);
      if (!vowel) throw new Error(`「${ending}」の「ん」の前の音の母音が分からない`);
      return { ending, vowel, cards: members };
    })
    .sort((a, b) => b.cards.length - a.cards.length || (a.ending < b.ending ? -1 : 1));
}

// 本文の数。表が変わっても追いつくよう、書き写さずに組み立てのたびに数える。
export function nasalEndingsText(cards: readonly Card[]): string {
  const groups = nasalEndings(cards);
  const total = groups.reduce((sum, g) => sum + g.cards.length, 0);
  const byVowel = new Map<string, number>();
  for (const g of groups) byVowel.set(g.vowel, (byVowel.get(g.vowel) ?? 0) + g.cards.length);
  const vowels = [...byVowel].map(([vowel, count]) => `「${vowel}」が${count}首`).join('、');
  return `${total}首で、${groups.map((g) => `${g.ending}${g.cards.length}首`).join('、')}です。「ん」の前の母音は${vowels}`;
}
