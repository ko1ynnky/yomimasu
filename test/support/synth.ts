export type ReadingPlan = {
  sampleRate: number;
  leadSec: number;
  shimoSec: number;
  yoinSec: number;
  maSec: number;
  kamiSec: number;
  tailSec: number;
  noiseDb: number;
  seed: number;
  kamiBreath?: { atSec: number; lengthSec: number };
  gainDb?: number;
  // 声の周期を持たない、ささやき声の読みにする。
  whisper?: boolean;
  // 読みの前後に入る音。時刻は録音の頭からの秒である。
  extras?: Extra[];
};

// thud は机に端末を置く音、click はボタンの音、voice は「はい」のような短い声、blip は部屋の音に混じる一瞬の周期の音である。
export type Extra = { kind: 'thud' | 'click' | 'voice' | 'blip'; atSec: number; lengthSec: number };

export const standardReading: ReadingPlan = {
  sampleRate: 48000,
  leadSec: 0.7,
  shimoSec: 5,
  yoinSec: 3,
  maSec: 1,
  kamiSec: 6,
  tailSec: 0.8,
  noiseDb: -58,
  seed: 20261102,
};

const seededRandom = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const MORA_SEC = 0.42;
const PITCH_HZ = 220;

function addVoice(pcm: Float32Array, rate: number, startSec: number, phraseSec: number, sustainSec: number, random: () => number, whisper = false) {
  const moraCount = Math.max(1, Math.round(phraseSec / MORA_SEC));
  const moraSec = phraseSec / moraCount;
  const endSec = startSec + phraseSec + sustainSec;
  let phase = 0;
  for (let i = Math.floor(startSec * rate); i < Math.min(pcm.length, Math.floor(endSec * rate)); i++) {
    const t = i / rate;
    const local = t - startSec;
    const sustaining = local >= phraseSec;
    const inMora = sustaining ? 1 : (local % moraSec) / moraSec;
    const moraShape = sustaining ? 1 : 0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, inMora * 1.15));
    const fall = sustaining ? 1 - 0.45 * ((local - phraseSec) / sustainSec) : 1;
    const attack = Math.min(1, local / 0.04);
    const release = Math.min(1, (endSec - t) / 0.08);
    phase += (2 * Math.PI * PITCH_HZ * (1 + 0.004 * Math.sin(2 * Math.PI * 5.2 * t))) / rate;
    let voiced = 0;
    for (let k = 1; k <= 12; k++) {
      const f = k * PITCH_HZ;
      const formant = 1 / (1 + ((f - 700) / 500) ** 2) + 0.4 / (1 + ((f - 1200) / 400) ** 2);
      voiced += (Math.sin(k * phase) * formant) / k;
    }
    const consonant = !sustaining && inMora < 0.08 ? (random() * 2 - 1) * 0.5 : 0;
    const source = whisper ? 0.8 * (random() * 2 - 1) : voiced;
    pcm[i] += 0.22 * attack * release * moraShape * fall * source + 0.05 * attack * consonant;
  }
}

// 読みの声と背景の雑音の乱数の並びを変えないよう、前後の音は別の乱数で作る。
function addExtra(pcm: Float32Array, rate: number, extra: Extra, random: () => number) {
  if (extra.kind === 'voice') {
    addVoice(pcm, rate, extra.atSec, extra.lengthSec, 0.0001, random);
    return;
  }
  const from = Math.floor(extra.atSec * rate);
  const to = Math.min(pcm.length, from + Math.floor(extra.lengthSec * rate));
  let low = 0;
  for (let i = from; i < to; i++) {
    const t = (i - from) / rate;
    const white = random() * 2 - 1;
    if (extra.kind === 'click') pcm[i] += 0.6 * white;
    else if (extra.kind === 'blip') pcm[i] += 0.02 * Math.sin(2 * Math.PI * 330 * t);
    else {
      low += 0.2 * (white - low);
      pcm[i] += 1.5 * low * Math.exp(-t / (extra.lengthSec / 4));
    }
  }
}

export function addExtras(pcm: Float32Array, rate: number, extras: readonly Extra[], seed: number) {
  const random = seededRandom(seed);
  for (const extra of extras) addExtra(pcm, rate, extra, random);
}

export function synthesize(plan: ReadingPlan): Float32Array {
  const { sampleRate: rate, leadSec, shimoSec, yoinSec, maSec, kamiSec, tailSec } = plan;
  const pcm = new Float32Array(Math.ceil((leadSec + shimoSec + yoinSec + maSec + kamiSec + tailSec) * rate));
  const random = seededRandom(plan.seed);
  const noise = 10 ** (plan.noiseDb / 20);
  const gain = 10 ** ((plan.gainDb ?? 0) / 20);
  const voice = new Float32Array(pcm.length);
  const kamiStartSec = leadSec + shimoSec + yoinSec + maSec;
  // 序歌の上の句のように、上の句だけを読む録音は shimoSec と yoinSec を 0 にして作る。
  if (shimoSec + yoinSec > 0) addVoice(voice, rate, leadSec, shimoSec, yoinSec, random, plan.whisper);
  if (kamiSec > 0) addVoice(voice, rate, kamiStartSec, kamiSec, 0.0001, random, plan.whisper);
  if (plan.kamiBreath) {
    const from = Math.floor((kamiStartSec + plan.kamiBreath.atSec) * rate);
    voice.fill(0, from, from + Math.floor(plan.kamiBreath.lengthSec * rate));
  }
  addExtras(voice, rate, plan.extras ?? [], plan.seed + 1);
  for (let i = 0; i < pcm.length; i++) {
    pcm[i] = gain * voice[i] + noise * (random() * 2 - 1) + noise * 0.5 * Math.sin((2 * Math.PI * 60 * i) / rate);
  }
  return pcm;
}
