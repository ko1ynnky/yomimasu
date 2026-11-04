// 公開の本文データに当てる修正と、規則だけでは決まらない語の切れ目。

import type { KeptKana, TextFix } from '../../.claude/skills/yomimasu/scripts/cards.ts';

export type LineKey = 'upperText' | 'lowerText' | 'upperKana' | 'lowerKana';

export type LineFix = Omit<TextFix, 'field'> & { line: LineKey };

const TYPO = 'データの漢字の列の誤りで、同じデータの仮名の列と合わない';
const KANA_FOR_STRETCH = '漢字1字の読みの途中で伸ばすので、仮名で書いた';
const AS_LIST = '読み方一覧の形に合わせた';

export const LINE_FIXES: Readonly<Record<number, readonly LineFix[]>> = {
  14: [{ line: 'upperText', from: 'たれゆえに', to: 'たれゆゑに', why: TYPO }],
  25: [{ line: 'upperText', from: 'さねかずら', to: 'さねかづら', why: TYPO }],
  33: [{ line: 'lowerKana', from: 'しづこころ', to: 'しづごころ', why: AS_LIST }],
  36: [{ line: 'lowerText', from: 'いずこ', to: 'いづこ', why: TYPO }],
  44: [
    { line: 'upperText', from: 'なくは', to: 'なくば', why: AS_LIST },
    { line: 'upperKana', from: 'なくは', to: 'なくば', why: AS_LIST },
  ],
  45: [{ line: 'lowerText', from: 'いたずら', to: 'いたづら', why: TYPO }],
  61: [{ line: 'upperText', from: '八重桜', to: '八重ざくら', why: KANA_FOR_STRETCH }],
  64: [{ line: 'lowerText', from: '網代木', to: 'あじろ木', why: KANA_FOR_STRETCH }],
  66: [
    { line: 'upperText', from: '思え', to: '思へ', why: TYPO },
    { line: 'upperText', from: '山桜', to: '山ざくら', why: KANA_FOR_STRETCH },
  ],
  68: [{ line: 'upperText', from: '憂き夜', to: '憂き世', why: 'データの漢字の誤りである' }],
  73: [{ line: 'upperText', from: '尾の上', to: '尾上', why: '1つの語として「上」を語の頭から外した' }],
  74: [
    { line: 'upperText', from: '山おろしよ', to: '山おろし', why: AS_LIST },
    { line: 'upperKana', from: 'やまおろしよ', to: 'やまおろし', why: AS_LIST },
  ],
  99: [{ line: 'upperText', from: 'あじきなく', to: 'あぢきなく', why: TYPO }],
};

// 公開の本文データに序歌はないので、ここに持つ。四句の頭は競技かるたで読む形で、一般の形とは違う。
export const JOKA_LINES = {
  upperText: '難波津に咲くやこの花冬ごもり',
  lowerText: '今を春べと咲くやこの花',
  upperKana: 'なにはづにさくやこのはなふゆごもり',
  lowerKana: 'いまをはるべとさくやこのはな',
};

// 字余りの札の句の字数。ほかの札は 5、7、5、7、7 である。
export const PHRASE_LENGTHS: Readonly<Record<number, readonly number[]>> = {
  1: [5, 7, 6, 7, 7],
  4: [6, 8, 5, 7, 7],
  9: [6, 7, 5, 7, 7],
  11: [5, 7, 6, 7, 7],
  15: [5, 8, 5, 7, 7],
  16: [5, 7, 6, 7, 7],
  20: [5, 7, 5, 7, 8],
  21: [5, 7, 5, 8, 8],
  22: [5, 7, 5, 7, 8],
  23: [5, 7, 5, 7, 8],
  24: [5, 8, 5, 7, 7],
  25: [6, 7, 5, 7, 7],
  26: [5, 7, 6, 7, 7],
  28: [5, 7, 5, 7, 8],
  29: [6, 7, 5, 7, 7],
  31: [5, 8, 5, 7, 7],
  38: [5, 7, 5, 7, 8],
  40: [5, 8, 5, 7, 7],
  48: [6, 7, 5, 7, 7],
  49: [5, 7, 5, 7, 8],
  55: [6, 7, 5, 7, 7],
  57: [6, 7, 5, 7, 7],
  70: [5, 8, 5, 7, 7],
  73: [5, 7, 5, 7, 8],
  75: [6, 7, 5, 7, 7],
  76: [5, 8, 5, 7, 7],
  77: [5, 7, 5, 7, 8],
  79: [5, 7, 5, 8, 7],
  80: [5, 7, 5, 7, 8],
  85: [5, 8, 5, 7, 7],
  92: [5, 7, 6, 7, 7],
  99: [5, 7, 5, 8, 7],
};

// 続いた漢字を語ごとに分ける。句の切れ目、語の頭、伸ばす箇所が途中に来ないようにするためである。
export const KANJI_SPLITS: Readonly<Record<string, readonly (readonly [string, string])[]>> = {
  '春過:はるす': [['春', 'はる'], ['過', 'す']],
  '夏来:なつき': [['夏', 'なつ'], ['来', 'き']],
  '衣干:ころもほ': [['衣', 'ころも'], ['干', 'ほ']],
  '香具山:かぐやま': [['香具', 'かぐ'], ['山', 'やま']],
  '声聞:こゑき': [['声', 'こゑ'], ['聞', 'き']],
  '身世:みよ': [['身', 'み'], ['世', 'よ']],
  '原八十島:はらやそしま': [['原', 'はら'], ['八十島', 'やそしま']],
  '風雲:かぜくも': [['風', 'かぜ'], ['雲', 'くも']],
  '路吹:ぢふ': [['路', 'ぢ'], ['吹', 'ふ']],
  '若菜摘:わかなつ': [['若菜', 'わかな'], ['摘', 'つ']],
  '今帰:いまかへ': [['今', 'いま'], ['帰', 'かへ']],
  '路人目:ぢひとめ': [['路', 'ぢ'], ['人目', 'ひとめ']],
  '難波潟短:なにはがたみじか': [['難波潟', 'なにはがた'], ['短', 'みじか']],
  '今来:いまこ': [['今', 'いま'], ['来', 'こ']],
  '月見:つきみ': [['月', 'つき'], ['見', 'み']],
  '錦神:にしきかみ': [['錦', 'にしき'], ['神', 'かみ']],
  '小倉山峰:をぐらやまみね': [['小倉山', 'をぐらやま'], ['峰', 'みね']],
  '葉心:ばこころ': [['葉', 'ば'], ['心', 'こころ']],
  '月宿:つきやど': [['月', 'つき'], ['宿', 'やど']],
  '人知:ひとし': [['人', 'ひと'], ['知', 'し']],
  '松山波越:まつやまなみこ': [['松山', 'まつやま'], ['波', 'なみ'], ['越', 'こ']],
  '御垣守衛士:みかきもりゑじ': [['御垣守', 'みかきもり'], ['衛士', 'ゑじ']],
  '有馬山猪名:ありまやまゐな': [['有馬山', 'ありまやま'], ['猪名', 'ゐな']],
  '笹原風吹:ささはらかぜふ': [['笹原', 'ささはら'], ['風', 'かぜ'], ['吹', 'ふ']],
  '小夜更:さよふ': [['小夜', 'さよ'], ['更', 'ふ']],
  '桜咲:さくらさ': [['桜', 'さくら'], ['咲', 'さ']],
  '霞立:かすみた': [['霞', 'かすみ'], ['立', 'た']],
  '原漕:はらこ': [['原', 'はら'], ['漕', 'こ']],
  '淡路島通:あはぢしまかよ': [['淡路島', 'あはぢしま'], ['通', 'かよ']],
  '夜寝覚:よねざ': [['夜', 'よ'], ['寝覚', 'ねざ']],
  '関守:せきもり': [['関', 'せき'], ['守', 'もり']],
  '霧立:きりた': [['霧', 'きり'], ['立', 'た']],
  '渚漕:なぎさこ': [['渚', 'なぎさ'], ['漕', 'こ']],
  '秋風小夜更:あきかぜさよふ': [['秋風', 'あきかぜ'], ['小夜', 'さよ'], ['更', 'ふ']],
  '紅葉踏:もみぢふ': [['紅葉', 'もみぢ'], ['踏', 'ふ']],
  '篠原忍:しのはらしの': [['篠原', 'しのはら'], ['忍', 'しの']],
  '釣船:つりぶね': [['釣', 'つり'], ['船', 'ぶね']],
  '竜田川:たつたがは': [['竜田', 'たつた'], ['川', 'がは']],
  '手向山:たむけやま': [['手向', 'たむけ'], ['山', 'やま']],
  '泉川:いづみがは': [['泉', 'いづみ'], ['川', 'がは']],
  '橋立:はしだて': [['橋', 'はし'], ['立', 'だて']],
  '花冬:はなふゆ': [['花', 'はな'], ['冬', 'ふゆ']],
  '白波:しらなみ': [['白', 'しら'], ['波', 'なみ']],
  '白雪:しらゆき': [['白', 'しら'], ['雪', 'ゆき']],
  '夕暮:ゆふぐ': [['夕', 'ゆふ'], ['暮', 'ぐ']],
  '夕暮:ゆふぐれ': [['夕', 'ゆふ'], ['暮', 'ぐれ']],
  '潮干:しほひ': [['潮', 'しほ'], ['干', 'ひ']],
  '松帆:まつほ': [['松', 'まつ'], ['帆', 'ほ']],
};

// 前後の仮名だけでは漢字の読みの範囲が決まらないときに、読みを指定する。
export const KANJI_HINTS: Readonly<Record<number, Readonly<Record<string, string>>>> = {
  0: { 難波津: 'なにはづ' },
  5: { 紅葉踏: 'もみぢふ', 分: 'わ' },
  31: { 吉野: 'よしの', 里: 'さと' },
  38: { 命: 'いのち', 惜: 'を' },
  39: { 小野: 'をの', 篠原忍: 'しのはらしの' },
  73: { 尾上: 'をのへ' },
  94: { 吉野: 'よしの', 山: 'やま' },
};

const IN_WORD = '語の一部';

// 規則のとおりに読み替えない字。「|」の直後の字を読み替えない。語の切れ目は一覧と比べて見つけた。
export type Kept = { no: number; phrase: number; word: string; why?: string };

export const KANA_WORD_HEADS: readonly Kept[] = [
  { no: 8, phrase: 2, word: 'す|む', why: IN_WORD },
  { no: 9, phrase: 3, word: 'よに|ふる' },
  { no: 15, phrase: 2, word: 'つ|む', why: IN_WORD },
  { no: 17, phrase: 0, word: 'ち|はやぶる' },
  { no: 20, phrase: 1, word: 'いま|はた' },
  { no: 23, phrase: 3, word: 'わがみ|ひとつ' },
  { no: 24, phrase: 2, word: 'た|むけ', why: IN_WORD },
  { no: 26, phrase: 3, word: 'いま|ひとたび' },
  { no: 39, phrase: 1, word: 'しの|はら' },
  { no: 47, phrase: 0, word: 'やへ|むぐら' },
  { no: 56, phrase: 1, word: 'よの|ほか' },
  { no: 56, phrase: 3, word: 'いま|ひとたび' },
  { no: 58, phrase: 1, word: 'ささ|はら' },
  { no: 60, phrase: 3, word: 'まだ|ふみ' },
  { no: 66, phrase: 3, word: 'より|ほか' },
  { no: 69, phrase: 0, word: 'あらし|ふく' },
  { no: 69, phrase: 1, word: 'み|むろ', why: IN_WORD },
  { no: 70, phrase: 2, word: 'なが|むれば', why: IN_WORD },
  { no: 77, phrase: 0, word: 'せを|はやみ' },
  { no: 81, phrase: 2, word: 'なが|むれば', why: IN_WORD },
  { no: 85, phrase: 3, word: 'ねやの|ひま' },
  { no: 91, phrase: 2, word: 'さ|むしろ', why: IN_WORD },
  { no: 94, phrase: 3, word: 'さ|むく', why: IN_WORD },
];

// 一覧の表記を当てた発音に代えて、ユーザーが聞いて決めた読みで書く所。at は句の仮名の位置、listed は例外がなければ入る発音である。
export type SoundException = { no: number; phrase: number; at: number; kana: string; listed: string; sound: string; why: string };

// ユーザーが101首の画面の字を見直し、一覧から外すのはこの1か所だけと決めた（2026-11-04）。
// 95番の三句、20番と77番の結句、長音の「ー」と伸ばしの印が並ぶ所も見たうえで、一覧のままにした。
export const SOUND_EXCEPTIONS: readonly SoundException[] = [
  {
    no: 54,
    phrase: 3,
    at: 0,
    kana: 'けふ',
    listed: 'きょー',
    sound: 'きょ',
    why: '一覧は「今日（きょー）をー」と書くが、ユーザーの判断で「きょおー」と読む（2026-11-04）。ユーザーには、実際の読みが「きょーおー」とは聞こえないため。',
  },
];

export const soundExceptionsOf = (no: number, phrase: number): SoundException[] => SOUND_EXCEPTIONS.filter((e) => e.no === no && e.phrase === phrase);

export const keptOf = (no: number, phrase: number, kana: string): KeptKana[] =>
  KANA_WORD_HEADS.filter((k) => k.no === no && k.phrase === phrase).map((k) => {
    const start = kana.indexOf(k.word.replace('|', ''));
    if (start < 0) throw new Error(`${no} 番の「${kana}」に「${k.word}」がない`);
    const at = start + k.word.indexOf('|');
    return { phrase, at, kana: kana[at], why: k.why ?? '語の頭' };
  });
