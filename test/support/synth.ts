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
};

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

function addVoice(pcm: Float32Array, rate: number, startSec: number, phraseSec: number, sustainSec: number, random: () => number) {
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
    pcm[i] += 0.22 * attack * release * moraShape * fall * voiced + 0.05 * attack * consonant;
  }
}

export function synthesize(plan: ReadingPlan): Float32Array {
  const { sampleRate: rate, leadSec, shimoSec, yoinSec, maSec, kamiSec, tailSec } = plan;
  const pcm = new Float32Array(Math.ceil((leadSec + shimoSec + yoinSec + maSec + kamiSec + tailSec) * rate));
  const random = seededRandom(plan.seed);
  const noise = 10 ** (plan.noiseDb / 20);
  const voice = new Float32Array(pcm.length);
  const kamiStartSec = leadSec + shimoSec + yoinSec + maSec;
  addVoice(voice, rate, leadSec, shimoSec, yoinSec, random);
  addVoice(voice, rate, kamiStartSec, kamiSec, 0.0001, random);
  if (plan.kamiBreath) {
    const from = Math.floor((kamiStartSec + plan.kamiBreath.atSec) * rate);
    voice.fill(0, from, from + Math.floor(plan.kamiBreath.lengthSec * rate));
  }
  for (let i = 0; i < pcm.length; i++) {
    pcm[i] = voice[i] + noise * (random() * 2 - 1) + noise * 0.5 * Math.sin((2 * Math.PI * 60 * i) / rate);
  }
  return pcm;
}
