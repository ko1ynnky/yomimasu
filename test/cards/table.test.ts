import assert from 'node:assert/strict';
import { test } from 'node:test';
import deck from '../../.claude/skills/yomimasu/assets/cards.json' with { type: 'json' };
import {
  GRAND_CARDS,
  JOKA,
  kimarijiLengths,
  markedText,
  ruleStretchesOf,
  soundOffset,
  type Card,
  type Stretch,
} from '../../.claude/skills/yomimasu/scripts/cards.ts';
import { comparable } from '../../scripts/cards/assemble.ts';
import { applyDiffs, soundDiffs, withListNotation } from '../../scripts/cards/sound.ts';

const cards = deck.cards as unknown as Card[];
const card = (no: number) => {
  const found = cards.find((c) => c.no === no);
  assert.ok(found, `${no} 番がない`);
  return found;
};
const poems = cards.filter((c) => c.no !== JOKA);
const upperSound = (c: Card) => c.phrases.slice(0, 3).map((p) => p.sound).join('');
const key = (s: Stretch) => `${s.phrase}:${s.after}`;
const countBy = <T>(items: T[], keyOf: (item: T) => string) => {
  const counts: Record<string, number> = {};
  for (const item of items) counts[keyOf(item)] = (counts[keyOf(item)] ?? 0) + 1;
  return counts;
};

test('札は序歌と100首の101枚で、番号が順に並ぶ', () => {
  assert.deepEqual(cards.map((c) => c.no), Array.from({ length: 101 }, (_, i) => i));
});

test('どの札も5つの句からなる', () => {
  for (const c of cards) assert.equal(c.phrases.length, 5, `${c.no} 番`);
});

test('句の字数は5、7、5、7、7で、字余りは1字までである', () => {
  const standard = [5, 7, 5, 7, 7];
  for (const c of cards) {
    c.phrases.forEach((p, i) => {
      const extra = p.kana.length - standard[i];
      assert.ok(extra === 0 || extra === 1, `${c.no} 番の${i + 1}句「${p.kana}」`);
    });
  }
});

test('字余りを含む札は32首で、初句が6字の札は8首である', () => {
  const standard = [5, 7, 5, 7, 7];
  assert.equal(poems.filter((c) => c.phrases.some((p, i) => p.kana.length > standard[i])).length, 32);
  assert.deepEqual(poems.filter((c) => c.phrases[0].kana.length === 6).map((c) => c.no), [4, 9, 25, 29, 48, 55, 57, 75]);
});

test('1音目が母音の札は28首である', () => {
  assert.deepEqual(countBy(poems.filter((c) => 'あいうえお'.includes(c.phrases[0].sound[0])), (c) => c.phrases[0].sound[0]), {
    あ: 16,
    い: 3,
    う: 2,
    お: 7,
  });
});

test('44番、74番、33番の本文と発音', () => {
  assert.equal(card(44).phrases[1].kana, 'たえてしなくば');
  assert.ok(card(44).phrases[1].text.endsWith('なくば'));
  assert.equal(card(74).phrases[2].kana, 'やまおろし');
  assert.ok(card(74).phrases[2].text.endsWith('山おろし'));
  assert.equal(card(33).phrases[3].sound, 'しずごころなく');
});

test('語の切れ目で読み替えが変わる札の発音', () => {
  assert.ok(card(1).phrases[1].sound.startsWith('かりお'));
  assert.ok(card(97).phrases[1].sound.startsWith('まつほ'));
  assert.ok(card(17).phrases[0].sound.startsWith('ちはや'));
  assert.ok(card(20).phrases[1].sound.startsWith('いまはた'));
  assert.ok(card(92).phrases[1].sound.startsWith('しおひ'));
});

test('語の形で読み替わる発音', () => {
  assert.equal(card(2).phrases[3].sound, 'ころもほすちょー');
  assert.ok(card(54).phrases[3].sound.startsWith('きょーお'));
  assert.ok(card(45).phrases[1].sound.startsWith('ゆーべき'));
  assert.ok(card(76).phrases[3].sound.endsWith('まごー'));
  assert.equal(card(95).phrases[2].sound, 'おおおかな');
  assert.equal(card(8).phrases[4].sound, 'ひとわゆーなり');
  assert.equal(card(3).phrases[4].sound, 'ひとりかもねん');
  assert.equal(card(15).phrases[2].sound, 'わかなつむ');
  assert.equal(card(8).phrases[2].sound, 'しかぞすむ');
});

test('発音の列は、仮名に読み替えを当てたものと一致する', () => {
  for (const c of cards) {
    for (const p of c.phrases) {
      let rebuilt = '';
      let cursor = 0;
      for (const diff of p.diffs) {
        rebuilt += p.kana.slice(cursor, diff.at) + diff.sound;
        assert.equal(p.kana.slice(diff.at, diff.at + diff.kana.length), diff.kana, `${c.no} 番「${p.kana}」`);
        cursor = diff.at + diff.kana.length;
      }
      assert.equal(rebuilt + p.kana.slice(cursor), p.sound, `${c.no} 番「${p.kana}」`);
    }
  }
});

// 規則の読み替えは、句の頭、漢字のかたまりの頭、由来に書いた字を語の頭として当てる。表を作るときと同じである。
const ruleDiffs = (c: Card, index: number) => {
  const p = c.phrases[index];
  const heads = new Set([0, ...c.origin.sound.kept.filter((k) => k.phrase === index).map((k) => k.at)]);
  let offset = 0;
  for (const [text, kana] of p.parts) {
    if (text !== kana) heads.add(offset);
    offset += kana.length;
  }
  return soundDiffs(p.kana, heads);
};
const onPhrase = (spans: Card['furigana'], index: number) => spans.filter((s) => s.phrase === index);
// 一覧のふりがなの「ー」の字が掛かる、発音の位置である。
const listedLongs = (c: Card, index: number) =>
  onPhrase(c.furigana, index).flatMap((f) => [...f.reading].flatMap((char, i) => (char === 'ー' ? [soundOffset(c.phrases[index], f.at) + i] : [])));
const notedPositions = (c: Card, index: number) =>
  onPhrase(c.notes, index).flatMap((n) => Array.from({ length: n.reading.length }, (_, i) => soundOffset(c.phrases[index], n.at) + i));

test('一覧のふりがなが「ー」の所は、表の発音も「ー」である', () => {
  for (const c of cards) {
    c.phrases.forEach((p, index) => {
      for (const at of listedLongs(c, index)) assert.equal(p.sound[at], 'ー', `${c.no} 番「${p.sound}」の ${at} 字目`);
    });
  }
});

test('表の発音の「ー」は、一覧のふりがなの「ー」の所にしかない', () => {
  for (const c of cards) {
    c.phrases.forEach((p, index) => {
      const longs = [...p.sound].flatMap((char, at) => (char === 'ー' ? [at] : []));
      assert.deepEqual(longs, listedLongs(c, index), `${c.no} 番「${p.sound}」`);
    });
  }
});

test('一覧の注の所は、表の発音が注の字である', () => {
  for (const c of cards) {
    c.phrases.forEach((p, index) => {
      for (const n of onPhrase(c.notes, index)) {
        assert.equal(p.sound.slice(soundOffset(p, n.at), soundOffset(p, n.at + n.length)), n.reading, `${c.no} 番「${p.sound}」`);
      }
    });
  }
  // 16番の「生ふる」は、一覧の注が（う）である。
  assert.equal(card(16).phrases[2].sound, 'みねにおうる');
});

test('一覧に「ー」も注もない所は、表の発音が規則の読み替えのとおりである', () => {
  for (const c of cards) {
    c.phrases.forEach((p, index) => {
      const rule = applyDiffs(p.kana, ruleDiffs(c, index));
      const listed = new Set([...listedLongs(c, index), ...notedPositions(c, index)]);
      assert.equal(p.sound.length, rule.length, `${c.no} 番「${p.sound}」`);
      for (const [at, char] of [...p.sound].entries()) {
        if (!listed.has(at)) assert.equal(char, rule[at], `${c.no} 番「${p.sound}」の ${at} 字目`);
      }
    });
  }
});

test('表の句の読み替えは、規則の読み替えに一覧のふりがなの「ー」と注を当てたものである', () => {
  for (const c of cards) {
    c.phrases.forEach((p, index) => {
      const expected = withListNotation(p.kana, ruleDiffs(c, index), { furigana: onPhrase(c.furigana, index), notes: onPhrase(c.notes, index) });
      assert.deepEqual(p.diffs, expected, `${c.no} 番「${p.kana}」`);
    });
  }
});

test('一覧の表記に合わせて、長音を「ー」、注の所を注の字で書いた31句の発音', () => {
  const expected: [no: number, phrase: number, sound: string][] = [
    // 一覧のふりがなが「ー」の27句。お段に続く「ふ」
    [40, 3, 'ものやおもーと'],
    [40, 4, 'ひとのとーまで'],
    [48, 4, 'おもーころかな'],
    [78, 1, 'かよーちどりの'],
    [85, 1, 'ものおもーころわ'],
    [96, 0, 'はなさそー'],
    [99, 3, 'よおおもーゆえに'],
    [99, 4, 'ものおもーみわ'],
    // あふ
    [10, 4, 'おーさかのせき'],
    [25, 1, 'おーさかやまの'],
    [56, 4, 'おーこともがな'],
    [62, 3, 'よにおーさかの'],
    // がふ
    [76, 3, 'くもいにまごー'],
    // てふ、けふ
    [2, 3, 'ころもほすちょー'],
    [41, 0, 'こいすちょー'],
    [54, 3, 'きょーおかぎりの'],
    [61, 3, 'きょーここのえに'],
    // いふ
    [8, 4, 'ひとわゆーなり'],
    [22, 4, 'あらしとゆーらん'],
    [45, 1, 'ゆーべきひとわ'],
    [63, 4, 'ゆーよしもがな'],
    // そのほか
    [21, 1, 'いーしばかりに'],
    [60, 2, 'とーければ'],
    [70, 4, 'あきのゆーぐれ'],
    [87, 4, 'あきのゆーぐれ'],
    [97, 2, 'ゆーなぎに'],
    [98, 2, 'ゆーぐれわ'],
    // 一覧の注が（お）の4句
    [20, 4, 'あわんとぞおもお'],
    [77, 4, 'あわんとぞおもお'],
    [44, 0, 'おおことの'],
    [95, 2, 'おおおかな'],
  ];
  assert.equal(expected.length, 31);
  for (const [no, phrase, sound] of expected) assert.equal(card(no).phrases[phrase].sound, sound, `${no} 番の${phrase + 1}句`);
});

test('一覧の注が規則の読み替えと同じ字の7句は、規則の読み替えのままである', () => {
  for (const [no, phrase] of [
    [16, 2],
    [39, 0],
    [45, 2],
    [60, 0],
    [62, 0],
    [71, 0],
    [95, 0],
  ]) {
    assert.ok(onPhrase(card(no).notes, phrase).length > 0, `${no} 番の${phrase + 1}句`);
    assert.deepEqual(card(no).phrases[phrase].diffs, ruleDiffs(card(no), phrase), `${no} 番の${phrase + 1}句`);
  }
});

test('発音の列に歴史的仮名遣いの字が残らない', () => {
  for (const c of cards) {
    for (const p of c.phrases) assert.doesNotMatch(p.sound, /[ゐゑをぢづ]/, `${c.no} 番「${p.sound}」`);
  }
});

test('読み替えずに残すハ行と「む」は、語の頭か、由来に書いた字である', () => {
  for (const c of cards) {
    c.phrases.forEach((p, phrase) => {
      const rewritten = new Set(p.diffs.flatMap((d) => Array.from({ length: d.kana.length }, (_, i) => d.at + i)));
      const heads = new Set([0]);
      let offset = 0;
      for (const [text, kana] of p.parts) {
        if (text !== kana) heads.add(offset);
        offset += kana.length;
      }
      for (const [at, kana] of [...p.kana].entries()) {
        if (!'はひふへほむ'.includes(kana) || heads.has(at) || rewritten.has(at)) continue;
        const kept = c.origin.sound.kept.some((k) => k.phrase === phrase && k.at === at && k.kana === kana);
        assert.ok(kept, `${c.no} 番「${p.kana}」の ${at} 字目`);
      }
    });
  }
});

test('本文と読みは、かたまりをつないだものと一致する', () => {
  for (const c of cards) {
    for (const p of c.phrases) {
      assert.equal(p.parts.map(([text]) => text).join(''), p.text, `${c.no} 番`);
      assert.equal(p.parts.map(([, kana]) => kana).join(''), p.kana, `${c.no} 番`);
    }
  }
});

test('決まり字はすべての札で一意である', () => {
  const lengths = kimarijiLengths(new Map(poems.map((c) => [c.no, upperSound(c)])));
  for (const c of poems) {
    assert.ok(c.kimariji);
    assert.equal(c.kimariji.sound, upperSound(c).slice(0, lengths.get(c.no)), `${c.no} 番`);
    const sharing = poems.filter((other) => upperSound(other).startsWith(c.kimariji!.sound));
    assert.deepEqual(sharing.map((o) => o.no), [c.no]);
  }
  assert.equal(new Set(poems.map((c) => c.kimariji!.sound)).size, 100);
});

test('決まり字の字数の内訳は 7、42、37、6、2、6 首である', () => {
  assert.deepEqual(countBy(poems, (c) => String(c.kimariji!.sound.length)), { 1: 7, 2: 42, 3: 37, 4: 6, 5: 2, 6: 6 });
});

test('1字決まりの7首は、む、す、め、ふ、さ、ほ、せ である', () => {
  const one = poems.filter((c) => c.kimariji!.sound.length === 1).map((c) => c.kimariji!.sound);
  assert.deepEqual(one.sort(), [...'さすせふほむめ'].sort());
});

test('仮名の決まり字は、発音の決まり字に対応する本文の頭である', () => {
  assert.deepEqual(card(44).kimariji, { kana: 'あふこ', sound: 'おおこ' });
  assert.deepEqual(card(62).kimariji, { kana: 'よを', sound: 'よお' });
  assert.deepEqual(card(31).kimariji, { kana: 'あさぼらけあ', sound: 'あさぼらけあ' });
});

test('序歌に決まり字はない', () => {
  assert.equal(card(JOKA).kimariji, null);
});

test('大山札は6字決まりの6首である', () => {
  assert.deepEqual(poems.filter((c) => c.kimariji!.sound.length === 6).map((c) => c.no).sort((a, b) => a - b), [...GRAND_CARDS].sort((a, b) => a - b));
});

test('規則の位置は、どの札でも規則の関数の結果と一致する', () => {
  for (const c of cards) assert.deepEqual(c.ruleStretches, ruleStretchesOf(c.no, c.phrases, GRAND_CARDS.has(c.no)), `${c.no} 番`);
});

test('札ごとの伸ばす箇所は、規則の位置に四句の途中の1か所を足したものである', () => {
  for (const c of cards.filter((c) => c.no !== 63)) {
    const rule = new Set(c.ruleStretches.map(key));
    const added = c.stretches.filter((s) => !rule.has(key(s)));
    assert.ok([...rule].every((r) => c.stretches.some((s) => key(s) === r)), `${c.no} 番`);
    assert.equal(added.length, 1, `${c.no} 番`);
    assert.equal(added[0].phrase, 3, `${c.no} 番`);
    assert.ok(0 < added[0].after && added[0].after < c.phrases[3].kana.length, `${c.no} 番`);
  }
});

test('63番だけ、二句の後の伸ばしが三句の「と」の後ろへずれる', () => {
  const c = card(63);
  assert.ok(c.ruleStretches.some((s) => key(s) === `1:${c.phrases[1].kana.length}`));
  assert.ok(!c.stretches.some((s) => key(s) === `1:${c.phrases[1].kana.length}`));
  assert.ok(c.stretches.some((s) => key(s) === '2:1'));
  assert.equal(c.phrases[2].kana[0], 'と');
});

test('伸ばしの印は100首で694か所あり、上の句394、下の句300である', () => {
  const stretches = poems.flatMap((c) => c.stretches);
  assert.equal(stretches.length, 694);
  assert.equal(stretches.filter((s) => s.phrase <= 2).length, 394);
  assert.equal(stretches.filter((s) => s.phrase >= 3).length, 300);
});

test('上の句の終わりが二字前の札は25首、下の句の終わりが三字前の札は11首である', () => {
  const beforeEnd = (c: Card, phrase: number) => {
    const stretches = c.stretches.filter((s) => s.phrase === phrase);
    const last = c.phrases[phrase].kana.length;
    return Math.max(...stretches.filter((s) => s.after < last).map((s) => last - s.after));
  };
  assert.equal(poems.filter((c) => beforeEnd(c, 2) === 2).length, 25);
  assert.equal(poems.filter((c) => beforeEnd(c, 4) === 3).length, 11);
});

test('伸ばす箇所は句の順に並び、どれも発音の位置へ移せる', () => {
  for (const c of cards) {
    const order = c.stretches.map((s) => s.phrase * 100 + s.after);
    assert.deepEqual(order, [...order].sort((a, b) => a - b), `${c.no} 番`);
    for (const s of c.stretches) assert.ok(Number.isInteger(soundOffset(c.phrases[s.phrase], s.after)), `${c.no} 番`);
  }
});

test('印のついた本文は、本文に伸ばす箇所を置いたものと一致する', () => {
  for (const c of cards) {
    const upper = c.stretches.filter((s) => s.phrase <= 2);
    const lower = c.stretches.filter((s) => s.phrase >= 3).map((s) => ({ ...s, phrase: s.phrase - 3 }));
    assert.equal(c.marked.upper, markedText(c.phrases.slice(0, 3), upper), `${c.no} 番`);
    assert.equal(c.marked.lower, markedText(c.phrases.slice(3), lower), `${c.no} 番`);
  }
});

test('1番、77番、29番は、手で確かめた形である', () => {
  assert.equal(card(1).marked.upper, '秋の田のーかりほの庵のー苫をあらーみー');
  assert.equal(card(77).marked.lower, 'われてもー末にー逢はむとぞー思ふ');
  assert.equal(card(29).marked.upper, '心あてにー折らばや折らむー初霜ーのー');
});

const notation = (c: Card) => [...c.furigana, ...c.notes];
const numbersWith = (has: (c: Card) => boolean) => cards.filter(has).map((c) => c.no);
const total = (count: (c: Card) => number) => cards.reduce((sum, c) => sum + count(c), 0);

test('ふりがなは序歌と100首のどの札にもあり、合わせて707か所である', () => {
  assert.equal(total((c) => c.furigana.length), 707);
  assert.deepEqual(numbersWith((c) => c.furigana.length === 0), []);
});

test('注は10首に12か所あり、95番だけ3か所である', () => {
  assert.deepEqual(numbersWith((c) => c.notes.length > 0), [16, 20, 39, 44, 45, 60, 62, 71, 77, 95]);
  assert.equal(total((c) => c.notes.length), 12);
  assert.equal(card(95).notes.length, 3);
});

test('別の読みは10首に1つずつあり、大山札は初句と二句、ほかの4首は四句の読み方である', () => {
  assert.deepEqual(numbersWith((c) => c.alternatives.length > 0), [5, 11, 15, 31, 41, 50, 64, 76, 95, 99]);
  for (const c of cards.filter((c) => c.alternatives.length > 0)) {
    assert.equal(c.alternatives.length, 1, `${c.no} 番`);
    assert.deepEqual(c.alternatives[0].phrases, GRAND_CARDS.has(c.no) ? [0, 1] : [3, 3], `${c.no} 番`);
  }
});

test('大山札の別の読みは、二句の途中で1か所多く伸ばす', () => {
  for (const no of GRAND_CARDS) {
    const c = card(no);
    const [alternative] = c.alternatives;
    const main = c.stretches.filter((s) => s.phrase <= 1);
    const added = alternative.stretches.filter((s) => !main.some((m) => key(m) === key(s)));
    assert.ok(main.every((m) => alternative.stretches.some((s) => key(s) === key(m))), `${no} 番`);
    assert.equal(added.length, 1, `${no} 番`);
    assert.equal(added[0].phrase, 1, `${no} 番`);
    assert.ok(0 < added[0].after && added[0].after < c.phrases[1].kana.length, `${no} 番`);
  }
});

test('四句の別の読みは、四句の途中の伸ばしを後ろへずらす', () => {
  for (const no of [5, 41, 95, 99]) {
    const c = card(no);
    const [alternative] = c.alternatives;
    const inside = (stretches: Stretch[]) => stretches.filter((s) => s.phrase === 3 && s.after < c.phrases[3].kana.length);
    assert.equal(inside(alternative.stretches).length, 1, `${no} 番`);
    assert.ok(inside(alternative.stretches)[0].after > inside(c.stretches)[0].after, `${no} 番`);
    assert.deepEqual(alternative.stretches.at(-1), { phrase: 3, after: c.phrases[3].kana.length }, `${no} 番`);
  }
});

test('99番の別の読みは、「思ふ」の長音の後ろで伸ばす', () => {
  assert.deepEqual(card(99).alternatives, [
    {
      phrases: [3, 3],
      marked: 'よをおもーゆえにー',
      stretches: [
        { phrase: 3, after: 5 },
        { phrase: 3, after: 8 },
      ],
    },
  ]);
});

test('余韻の印は序歌と100首のすべてにあり、下の句の終わりに置く', () => {
  for (const c of cards) assert.deepEqual(c.yoin, { phrase: 4, after: c.phrases[4].kana.length }, `${c.no} 番`);
});

test('ふりがなと注は句の中で重ならずに並び、どれも発音の位置へ移せる', () => {
  for (const c of cards) {
    c.phrases.forEach((p, phrase) => {
      const spans = notation(c).filter((f) => f.phrase === phrase).sort((a, b) => a.at - b.at);
      spans.forEach((f, i) => {
        assert.ok(f.length > 0 && f.at + f.length <= p.kana.length, `${c.no} 番「${p.kana}」`);
        assert.ok(i === 0 || spans[i - 1].at + spans[i - 1].length <= f.at, `${c.no} 番「${p.kana}」`);
        assert.doesNotThrow(() => [soundOffset(p, f.at), soundOffset(p, f.at + f.length)], `${c.no} 番「${p.kana}」`);
      });
    });
  }
});

test('ふりがなと注の読みは、掛かる範囲の発音の列と同じ音である', () => {
  for (const c of cards) {
    c.phrases.forEach((p, phrase) => {
      let read = '';
      let cursor = 0;
      for (const f of notation(c).filter((f) => f.phrase === phrase).sort((a, b) => a.at - b.at)) {
        read += p.sound.slice(cursor, soundOffset(p, f.at)) + f.reading;
        cursor = soundOffset(p, f.at + f.length);
      }
      assert.equal(comparable(read + p.sound.slice(cursor)), comparable(p.sound), `${c.no} 番「${p.kana}」`);
    });
  }
});

test('「を」のほかの読み替えた字には、どれもふりがなか注が掛かる', () => {
  for (const c of cards) {
    c.phrases.forEach((p, phrase) => {
      for (const d of p.diffs.filter((d) => d.kana !== 'を')) {
        const covered = notation(c).some((f) => f.phrase === phrase && f.at <= d.at && d.at < f.at + f.length);
        assert.ok(covered, `${c.no} 番「${p.kana}」の「${d.kana}」`);
      }
    });
  }
});

test('81番の下の句と45番の上の句は、完全版のスキャンと1字ずつ照らした形である', () => {
  assert.deepEqual(card(81).furigana.filter((f) => f.phrase >= 3), [
    { phrase: 4, at: 0, length: 2, reading: 'つき' },
    { phrase: 4, at: 3, length: 2, reading: 'のこ' },
  ]);
  assert.deepEqual(card(81).notes, []);
  assert.deepEqual(card(81).alternatives, []);
  assert.deepEqual(card(81).yoin, { phrase: 4, after: 7 });
  assert.deepEqual(card(45).furigana.filter((f) => f.phrase <= 2), [
    { phrase: 0, at: 1, length: 1, reading: 'わ' },
    { phrase: 1, at: 0, length: 1, reading: 'ゆ' },
    { phrase: 1, at: 1, length: 1, reading: 'ー' },
    { phrase: 1, at: 4, length: 2, reading: 'ひと' },
    { phrase: 1, at: 6, length: 1, reading: 'わ' },
    { phrase: 2, at: 0, length: 2, reading: 'おも' },
  ]);
  assert.deepEqual(card(45).notes, [{ phrase: 2, at: 2, length: 1, reading: 'お' }]);
});

test('どの札にも本文、発音、伸ばす箇所の由来がある', () => {
  for (const c of cards) {
    assert.ok(c.origin.text.source in deck.sources, `${c.no} 番`);
    assert.equal(c.origin.sound.basis, 'rules', `${c.no} 番`);
    assert.ok(c.origin.sound.checkedWith in deck.sources, `${c.no} 番`);
    assert.ok(c.origin.ruleStretches.source in deck.sources, `${c.no} 番`);
    assert.ok(c.origin.stretches.source in deck.sources, `${c.no} 番`);
    assert.ok(5 <= c.origin.stretches.page && c.origin.stretches.page <= 15, `${c.no} 番`);
  }
});

test('ふりがな、注、別の読み、余韻の印は、どの札も完全版の同じページから来て、抜粋版の文字のデータで読み取った', () => {
  for (const c of cards) {
    assert.equal(c.origin.notation.source, 'booklet', `${c.no} 番`);
    assert.equal(c.origin.notation.readFrom, 'list', `${c.no} 番`);
    assert.equal(c.origin.notation.page, c.origin.stretches.page, `${c.no} 番`);
  }
});

test('出典の版と置き場が記録されている', () => {
  assert.match(deck.sources.csv.url, /^https:\/\/github\.com\/nyoronjp\/Ogura_Hyakunin_Isshu\.csv/);
  assert.equal(deck.sources.csv.license, 'Unlicense');
  assert.match(deck.sources.csv.sha256, /^[0-9a-f]{64}$/);
  assert.match(deck.sources.list.edition, /令和7年4月1日/);
  assert.match(deck.sources.list.sha256, /^[0-9a-f]{64}$/);
  assert.match(deck.sources.booklet.edition, /令和2年4月1日/);
  assert.equal(deck.sources.booklet.pages, deck.sources.list.pages);
});

test('修正した札には、元の形と直した形が残る', () => {
  const fixed = cards.filter((c) => c.origin.text.fixes.length > 0).map((c) => c.no);
  assert.deepEqual(fixed, [14, 25, 33, 36, 44, 45, 61, 64, 66, 68, 73, 74, 99]);
  for (const no of fixed) {
    for (const fix of card(no).origin.text.fixes) {
      assert.notEqual(fix.from, fix.to);
      assert.ok(fix.why.length > 0);
      assert.ok(['本文', '仮名'].includes(fix.field));
    }
  }
});

test('許可の範囲の外の項目を持たない', () => {
  const allowed = ['no', 'phrases', 'kimariji', 'ruleStretches', 'stretches', 'marked', 'furigana', 'notes', 'alternatives', 'yoin', 'origin'];
  const allowedInPhrase = ['text', 'kana', 'sound', 'parts', 'diffs'];
  for (const c of cards) {
    assert.deepEqual(Object.keys(c).sort(), [...allowed].sort(), `${c.no} 番`);
    for (const p of c.phrases) assert.deepEqual(Object.keys(p).sort(), [...allowedInPhrase].sort(), `${c.no} 番`);
  }
  assert.doesNotMatch(JSON.stringify(cards), /[()（）]/);
});
