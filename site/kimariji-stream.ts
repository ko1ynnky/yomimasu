import type { Card } from '../.claude/skills/yomimasu/scripts/cards.ts';

// 入口の絵（client/kv-live.js）の体を組む字の列。札を読む順を乱数で決め、読まれた時点の決まり字を読まれた順に並べる。
// 決まり字は、それまでに読まれた札を除いて区別できる最短の頭なので、試合が進むほど短くなる。1試合では升目が埋まらないので、種を変えた試合を続ける。

const MATCHES = 12;

// 区別は音で行う（「あふこ」の音は「おおこ」）。字は札の仮名で、音と同じ字数だけ取る。
type Upper = { kana: string; sound: string };

function uppersOf(cards: readonly Card[]): Map<number, Upper> {
  const upper = (card: Card) => card.phrases.slice(0, 3);
  return new Map(
    cards
      .filter((card) => card.kimariji)
      .map((card) => [card.no, { kana: upper(card).map((p) => p.kana).join(''), sound: upper(card).map((p) => p.sound).join('') }]),
  );
}

export function kimarijiInOrder(cards: readonly Card[], order: readonly number[]): string[] {
  const uppers = uppersOf(cards);
  const unread = new Set(uppers.keys());
  return order.map((no) => {
    const { kana, sound } = uppers.get(no)!;
    const others = [...unread].filter((other) => other !== no).map((other) => uppers.get(other)!.sound);
    unread.delete(no);
    for (let length = 1; length <= sound.length; length++) {
      if (!others.some((other) => other.startsWith(sound.slice(0, length)))) return kana.slice(0, length);
    }
    throw new Error(`${no} 番は上の句で区別できない`);
  });
}

// 読む順は Python の random.Random(種).shuffle と同じにする。入口の置き方を決めるときにユーザーが見た見本は、
// Python でこの順に並べた列で描いていたので、同じ字の並びにするためである。種から順を決めるだけなら、ほかの乱数でもよい。
// 乱数は MT19937（メルセンヌ・ツイスタ）で、初期化と引き方を CPython の random に合わせて書いた。元の mt19937ar.c の著作権表示は NOTICE.md にある。
class PythonRandom {
  #state = new Uint32Array(624);
  #index = 624;

  // CPython の init_by_array に、32 bit に収まる種を1語の鍵として渡したときと同じである。
  constructor(seed: number) {
    const mt = this.#state;
    mt[0] = 19650218;
    for (let i = 1; i < 624; i++) mt[i] = Math.imul(1812433253, mt[i - 1] ^ (mt[i - 1] >>> 30)) + i;
    let i = 1;
    for (let k = 624; k > 0; k--) {
      mt[i] = (mt[i] ^ Math.imul(mt[i - 1] ^ (mt[i - 1] >>> 30), 1664525)) + seed;
      if (++i >= 624) [mt[0], i] = [mt[623], 1];
    }
    for (let k = 623; k > 0; k--) {
      mt[i] = (mt[i] ^ Math.imul(mt[i - 1] ^ (mt[i - 1] >>> 30), 1566083941)) - i;
      if (++i >= 624) [mt[0], i] = [mt[623], 1];
    }
    mt[0] = 0x80000000;
  }

  #next(): number {
    const mt = this.#state;
    if (this.#index >= 624) {
      for (let k = 0; k < 624; k++) {
        const y = (mt[k] & 0x80000000) | (mt[(k + 1) % 624] & 0x7fffffff);
        mt[k] = mt[(k + 397) % 624] ^ (y >>> 1) ^ (y & 1 ? 0x9908b0df : 0);
      }
      this.#index = 0;
    }
    let y = mt[this.#index++];
    y ^= y >>> 11;
    y ^= (y << 7) & 0x9d2c5680;
    y ^= (y << 15) & 0xefc60000;
    y ^= y >>> 18;
    return y >>> 0;
  }

  // Python の _randbelow と同じく、n の桁数の乱数を n 未満が出るまで引き直す。
  #below(n: number): number {
    const bits = 32 - Math.clz32(n);
    for (;;) {
      const r = this.#next() >>> (32 - bits);
      if (r < n) return r;
    }
  }

  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = this.#below(i + 1);
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  }
}

export const readOrder = (seed: number, nos: readonly number[]) => new PythonRandom(seed).shuffle([...nos].sort((a, b) => a - b));

export function kimarijiStream(cards: readonly Card[], matches = MATCHES): string {
  const nos = [...uppersOf(cards).keys()];
  return Array.from({ length: matches }, (_, i) => kimarijiInOrder(cards, readOrder(i + 1, nos)).join('')).join('');
}
