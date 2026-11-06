/* /yomimasu 入口のキービジュアル（動く版）。
 * 立体の人形を WebGL の距離関数で写し、升目ごとの明るさを決まり字の字に置き換えて Canvas に描く。
 * 使い方：YomimasuKv.mount(要素, { stream: "決まり字を読まれた順に並べた列" })
 * 入口での動かし方（升目の大きさ、止めるとき）は client/kv.ts にある。
 */
(() => {
  'use strict';

  // ------------------------------------------------------------ ベクトル
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const len = (a) => Math.hypot(a[0], a[1], a[2]);
  const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const rad = (d) => (d * Math.PI) / 180;
  const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
  const ease = (u) => u * u * (3 - 2 * u);

  // 3×3 行列は列の配列 [右, 上, 前] で持つ
  const apply = (M, v) => add(add(mul(M[0], v[0]), mul(M[1], v[1])), mul(M[2], v[2]));
  const mmul = (A, B) => [apply(A, B[0]), apply(A, B[1]), apply(A, B[2])];
  const rotY = (d) => { const c = Math.cos(rad(d)), s = Math.sin(rad(d)); return [[c, 0, -s], [0, 1, 0], [s, 0, c]]; };
  const rotX = (d) => { const c = Math.cos(rad(d)), s = Math.sin(rad(d)); return [[1, 0, 0], [0, c, s], [0, -s, c]]; };
  const frame = (n, upHint) => {
    n = norm(n);
    const up = norm(sub(upHint, mul(n, dot(upHint, n))));
    return [cross(up, n), up, n];
  };
  const flat = (M) => [...M[0], ...M[1], ...M[2]];

  // 四元数（回転の補間に使う）
  const quatOf = (M) => {
    const [m00, m10, m20] = M[0], [m01, m11, m21] = M[1], [m02, m12, m22] = M[2];
    const tr = m00 + m11 + m22;
    let q;
    if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; q = [(m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, s / 4]; }
    else if (m00 > m11 && m00 > m22) { const s = Math.sqrt(1 + m00 - m11 - m22) * 2; q = [s / 4, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s]; }
    else if (m11 > m22) { const s = Math.sqrt(1 + m11 - m00 - m22) * 2; q = [(m01 + m10) / s, s / 4, (m12 + m21) / s, (m02 - m20) / s]; }
    else { const s = Math.sqrt(1 + m22 - m00 - m11) * 2; q = [(m02 + m20) / s, (m12 + m21) / s, s / 4, (m10 - m01) / s]; }
    return q;
  };
  const matOf = ([x, y, z, w]) => [
    [1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w)],
    [2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w)],
    [2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y)],
  ];
  const slerp = (a, b, t) => {
    let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
    if (d < 0) { b = b.map((v) => -v); d = -d; }
    if (d > 0.9995) { const q = a.map((v, i) => v + (b[i] - v) * t); const l = Math.hypot(...q); return q.map((v) => v / l); }
    const th = Math.acos(d), s = Math.sin(th);
    const wa = Math.sin((1 - t) * th) / s, wb = Math.sin(t * th) / s;
    return a.map((v, i) => v * wa + b[i] * wb);
  };

  // ------------------------------------------------------------ 舞台（長さはメートル。人物は +z を向き、右手は -x 側）
  // 札は実物（53×74mm）の2倍で描く。実物の大きさでは升目4つ分ほどになり、札を持っているのが分からない
  const CARD_SCALE = 2.0;
  const CARD_W = 0.053 * CARD_SCALE, CARD_H = 0.074 * CARD_SCALE;
  const TABLE_TOP = 0.89;
  const TABLE = { c: [0, TABLE_TOP - 0.015, 0.42], half: [0.5, 0.015, 0.26] };
  const BOX = { c: [-0.03, TABLE_TOP + 0.065, 0.34], half: [0.075, 0.065, 0.09] };
  const STACK_TOP = BOX.c[1] + 0.2 * BOX.half[1];
  const STACK = { c: [BOX.c[0], (STACK_TOP + BOX.c[1] - BOX.half[1] + 0.012) / 2, BOX.c[2]],
    half: [BOX.half[0] - 0.012, (STACK_TOP - (BOX.c[1] - BOX.half[1] + 0.012)) / 2, BOX.half[2] - 0.012] };
  const PILE = { c: [-0.25, TABLE_TOP + 0.005, 0.34], half: [CARD_W / 2, 0.005, CARD_H / 2] };
  const PILE_TOP = PILE.c[1] + PILE.half[1];

  const SH_R = [-0.17, 1.35, -0.015], SH_L = [0.17, 1.35, -0.015];
  const NECK_BASE = [0, 1.43, -0.02], HEAD_C = [0, 1.615, 0], PIVOT = [0, 1.5, -0.01];
  const UPPER = 0.28, FORE = 0.26;

  // 札を持つ手の位置は札の座標系から決める。札を動かせば手と腕が付いてくる
  const handOn = (c, M) => {
    const [right, up, n] = M;
    const grip = sub(c, mul(up, CARD_H * 0.4));
    const palm = sub(sub(grip, mul(n, 0.022)), mul(up, 0.006));
    const wrist = sub(sub(palm, mul(up, 0.055)), mul(n, 0.02));
    const thumbA = sub(sub(add(grip, mul(n, 0.008)), mul(right, CARD_W * 0.3)), mul(up, 0.012));
    const thumbB = add(sub(add(grip, mul(n, 0.008)), mul(right, CARD_W * 0.08)), mul(up, 0.012));
    return { palm, wrist, thumbA, thumbB, M };
  };

  const ik = (S, W, pole, a, b) => {
    const dv = sub(W, S);
    const d = clamp(len(dv), Math.abs(a - b) + 1e-3, a + b - 1e-3);
    const dir = norm(dv);
    const cosA = clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1);
    const perp = norm(sub(pole, mul(dir, dot(pole, dir))));
    return add(S, add(mul(dir, a * cosA), mul(perp, a * Math.sqrt(1 - cosA * cosA))));
  };

  // 札（と、札がないときは手）の置き場所。n は札の面の向き、up は札の上の向き
  const EYE_LEVEL = [0, 1.62, 0.08];
  const F = (c, n, up) => ({ c, q: quatOf(frame(n, up)) });
  const toEye = (c) => sub(EYE_LEVEL, c);
  const FRAMES = {
    dip: F([BOX.c[0], STACK_TOP + 0.002, BOX.c[2] + 0.005], [0, -1, 0], [0, 0, 1]),
    onBox: F([BOX.c[0] + 0.005, BOX.c[1] + BOX.half[1] + 0.006, BOX.c[2] - 0.035], [0, -1, 0], [0, 0, 1]),
    // みぞおちの前で、裏を目へ向けて持つ。めくるときは札の縦の軸で回す。表と裏は向きが正反対なので、
    // 間に横向きの1枚（turn）を挟まないと、回る向きが定まらない
    faceDown: F([-0.07, 1.2, 0.3], [-0.1, -0.35, 1], [0, 1, 0]),
    turn: F([-0.07, 1.21, 0.3], [-1, 0, 0], [0, 1, 0]),
    look: F([-0.07, 1.22, 0.3], [0.1, 0.5, -1], [0, 1, 0]),
    // 読むときは札を胸の前で立てて持つ。面を目へ向けて寝かせると、前から見て札が線になり、持っているのが分からない
    read: F([-0.08, 1.3, 0.31], [0.1, 0.35, -1], [0, 1, 0]),
    over: F([PILE.c[0], PILE_TOP + 0.07, PILE.c[2] - 0.01], [0, 1, -0.25], [0, 0, 1]),
    place: F([PILE.c[0], PILE_TOP + 0.03, PILE.c[2]], [0, 1, 0], [0, 0, 1]),
    back: F([BOX.c[0] - 0.06, BOX.c[1] + 0.1, BOX.c[2] - 0.06], [0, -1, 0.1], [0, 0, 1]),
  };

  // 1周は上の句の読み始めから。読み終えた札を表にして脇へ置き、次の札を裏のまま読唱箱の上に置いて下の句を読む。
  // 下の句の終わりの2〜3字で札を手に取ってみぞおちの前へ運び、余韻でめくって初めて見る。
  // 次の札を先に見ないのは、下の句を読む前に次の上の句を知ると読みに出て、競技者に伝わりうるからである
  const LOOP = 12;
  const KEYS = [
    { t: 0.0, f: 'read', pitch: -4, yaw: 0, lean: 0, card: 1 },
    { t: 4.4, f: 'read', pitch: -4, yaw: 0, lean: 0, card: 1 },
    { t: 4.9, f: 'over', pitch: 16, yaw: -16, lean: 7, card: 1 },
    { t: 5.25, f: 'place', pitch: 18, yaw: -18, lean: 9, card: 1 },
    { t: 5.45, f: 'place', pitch: 16, yaw: -16, lean: 8, card: 0 },
    { t: 5.9, f: 'back', pitch: 10, yaw: -6, lean: 4, card: 0 },
    { t: 6.25, f: 'dip', pitch: 16, yaw: -4, lean: 9, card: 0 },
    { t: 6.45, f: 'dip', pitch: 16, yaw: -4, lean: 9, card: 1 },
    { t: 6.9, f: 'onBox', pitch: 4, yaw: -2, lean: 2, card: 1 },
    { t: 7.1, f: 'onBox', pitch: -3, yaw: 0, lean: 0, card: 1 },
    { t: 8.7, f: 'onBox', pitch: -3, yaw: 0, lean: 0, card: 1 },
    { t: 9.3, f: 'faceDown', pitch: 4, yaw: -2, lean: 1, card: 1 },
    { t: 9.6, f: 'faceDown', pitch: 4, yaw: -2, lean: 1, card: 1 },
    { t: 9.85, f: 'turn', pitch: 18, yaw: -4, lean: 1, card: 1 },
    { t: 10.1, f: 'look', pitch: 28, yaw: -4, lean: 1, card: 1 },
    { t: 10.45, f: 'look', pitch: 28, yaw: -4, lean: 1, card: 1 },
    { t: 11.1, f: 'read', pitch: -4, yaw: 0, lean: 0, card: 1 },
    { t: LOOP, f: 'read', pitch: -4, yaw: 0, lean: 0, card: 1 },
  ];
  const READ_SPAN = [0, 4.4];
  const READ_T = 2.0;

  const LEFT_HAND = (() => {
    const M = frame([0, -1, 0], [0.15, 0, 1]);
    return handOn([0.14, TABLE_TOP + 0.004, 0.27], M);
  })();

  function pose(t) {
    t = ((t % LOOP) + LOOP) % LOOP;
    let i = 0;
    while (i < KEYS.length - 2 && KEYS[i + 1].t <= t) i++;
    const a = KEYS[i], b = KEYS[i + 1];
    const u = ease(clamp((t - a.t) / (b.t - a.t), 0, 1));
    const fa = FRAMES[a.f], fb = FRAMES[b.f];
    const c = lerp(fa.c, fb.c, u);
    const M = matOf(slerp(fa.q, fb.q, u));
    const reading = t >= READ_SPAN[0] && t <= READ_SPAN[1];
    const sway = reading ? Math.sin(((t - READ_SPAN[0]) / (READ_SPAN[1] - READ_SPAN[0])) * Math.PI * 2) * 1.2 : 0;
    const pitch = a.pitch + (b.pitch - a.pitch) * u + sway;
    const yaw = a.yaw + (b.yaw - a.yaw) * u;
    const lean = a.lean + (b.lean - a.lean) * u;
    const breath = Math.sin((t / LOOP) * Math.PI * 4) * 0.003;
    return { c, M, pitch, yaw, lean, card: u < 0.5 ? a.card : b.card, breath };
  }

  // 上体は腰を軸に前へ傾ける（箱へ手を入れる、札を脇へ置くとき）
  const HIP = [0, 0.95, -0.02];
  function rig(p) {
    const L = rotX(p.lean);
    const lift = [0, p.breath, 0];
    const lean = (q) => add(add(HIP, apply(L, sub(q, HIP))), lift);
    const Mh = mmul(L, mmul(rotY(p.yaw), rotX(p.pitch)));
    const pivot = lean(PIVOT);
    const headC = add(pivot, apply(Mh, sub(HEAD_C, PIVOT)));
    const hf = Mh[2], hu = Mh[1];
    const jaw = add(headC, apply(Mh, [0, -0.062, 0.022]));
    const neckA = lean(NECK_BASE);
    const neckB = sub(sub(headC, mul(hu, 0.06)), mul(hf, 0.015));
    const hr = handOn(p.c, p.M);
    const shR = lean(SH_R), shL = lean(SH_L);
    const elbR = ik(shR, hr.wrist, [-0.3, -0.75, -0.2], UPPER, FORE);
    const elbL = ik(shL, LEFT_HAND.wrist, [0.3, -0.75, -0.2], UPPER, FORE);
    return {
      uHeadC: headC, uHeadM: flat(Mh), uJawC: jaw, uNeckA: neckA, uNeckB: neckB,
      uCollarA: sub(neckA, apply(L, [0, 0.03, 0])), uCollarB: add(neckA, apply(L, [0, 0.02, 0])),
      uTorsoC: lean([0, 1.12, -0.015]), uTorsoM: flat(L), uShR: shR, uShL: shL,
      uElbR: elbR, uWriR: hr.wrist, uPalmR: hr.palm, uHandR: flat(hr.M), uThA: hr.thumbA, uThB: hr.thumbB,
      uElbL: elbL, uWriL: LEFT_HAND.wrist, uPalmL: LEFT_HAND.palm, uHandL: flat(LEFT_HAND.M),
      uCardC: p.c, uCardM: flat(p.M), uCardHalf: [CARD_W / 2, CARD_H / 2, 0.0018], uCardOn: p.card,
      uBoxC: BOX.c, uBoxHalf: BOX.half, uStackC: STACK.c, uStackHalf: STACK.half,
      uTableC: TABLE.c, uTableHalf: TABLE.half, uPileC: PILE.c, uPileHalf: PILE.half,
    };
  }

  // ------------------------------------------------------------ シェーダー
  const VS = `#version 300 es
in vec2 aPos; void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }`;

  const FS = `#version 300 es
precision highp float;
out vec4 outColor;
uniform vec2 uRes; uniform vec3 uCamPos; uniform mat3 uCam; uniform vec2 uTan; uniform vec3 uLight;
uniform vec3 uHeadC; uniform mat3 uHeadM; uniform vec3 uJawC; uniform vec3 uNeckA; uniform vec3 uNeckB;
uniform vec3 uTorsoC; uniform mat3 uTorsoM; uniform vec3 uCollarA; uniform vec3 uCollarB; uniform vec3 uShR; uniform vec3 uShL;
uniform vec3 uElbR; uniform vec3 uWriR; uniform vec3 uPalmR; uniform mat3 uHandR; uniform vec3 uThA; uniform vec3 uThB;
uniform vec3 uElbL; uniform vec3 uWriL; uniform vec3 uPalmL; uniform mat3 uHandL;
uniform vec3 uCardC; uniform mat3 uCardM; uniform vec3 uCardHalf; uniform float uCardOn;
uniform vec3 uBoxC; uniform vec3 uBoxHalf; uniform vec3 uStackC; uniform vec3 uStackHalf;
uniform vec3 uTableC; uniform vec3 uTableHalf; uniform vec3 uPileC; uniform vec3 uPileHalf;

float sdEll(vec3 q, vec3 r){ float k0 = length(q / r); float k1 = length(q / (r * r)); return k0 * (k0 - 1.0) / max(k1, 1e-6); }
float sdCap(vec3 p, vec3 a, vec3 b, float ra, float rb){ vec3 pa = p - a, ba = b - a; float t = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * t) - mix(ra, rb, t); }
float sdBox(vec3 q, vec3 h, float rr){ vec3 d = abs(q) - (h - rr); return length(max(d, 0.0)) + min(max(d.x, max(d.y, d.z)), 0.0) - rr; }
float smin(float a, float b, float k){ float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }
vec2 U(vec2 a, float d, float m){ return d < a.x ? vec2(d, m) : a; }

// 材質：1 肌、2 着物、3 札、4 箱、5 箱の中の札、6 机
vec2 map(vec3 p){
  float head = sdEll((p - uHeadC) * uHeadM, vec3(0.077, 0.098, 0.097));
  head = smin(head, sdEll((p - uJawC) * uHeadM, vec3(0.058, 0.055, 0.062)), 0.035);
  head = smin(head, sdCap(p, uNeckA, uNeckB, 0.05, 0.047), 0.035);
  vec2 r = vec2(head, 1.0);
  float body = sdBox((p - uTorsoC) * uTorsoM, vec3(0.165, 0.26, 0.095), 0.09);
  body = smin(body, sdCap(p, uShL, uShR, 0.06, 0.06), 0.07);
  body = smin(body, sdCap(p, uCollarA, uCollarB, 0.062, 0.055), 0.07);
  r = U(r, body, 2.0);
  float ar = sdEll(p - uShR, vec3(0.06, 0.062, 0.06));
  ar = smin(ar, sdCap(p, uShR, uElbR, 0.054, 0.045), 0.04);
  ar = smin(ar, sdCap(p, uElbR, uWriR, 0.043, 0.032), 0.04);
  r = U(r, ar, 2.0);
  float hr = sdCap(p, uWriR, uPalmR, 0.027, 0.024);
  hr = smin(hr, sdEll((p - uPalmR) * uHandR, vec3(0.036, 0.042, 0.017)), 0.012);
  hr = smin(hr, sdCap(p, uThA, uThB, 0.0105, 0.0095), 0.012);
  r = U(r, hr, 1.0);
  float al = sdEll(p - uShL, vec3(0.06, 0.062, 0.06));
  al = smin(al, sdCap(p, uShL, uElbL, 0.054, 0.045), 0.04);
  al = smin(al, sdCap(p, uElbL, uWriL, 0.043, 0.032), 0.04);
  r = U(r, al, 2.0);
  float hl = sdCap(p, uWriL, uPalmL, 0.027, 0.024);
  hl = smin(hl, sdEll((p - uPalmL) * uHandL, vec3(0.036, 0.042, 0.017)), 0.012);
  r = U(r, hl, 1.0);
  if (uCardOn > 0.5) r = U(r, sdBox((p - uCardC) * uCardM, uCardHalf, 0.0), 3.0);
  float outer = sdBox(p - uBoxC, uBoxHalf, 0.004);
  float inner = sdBox(p - (uBoxC + vec3(0.0, 0.016, 0.0)), uBoxHalf - vec3(0.008, 0.0, 0.008), 0.0);
  r = U(r, max(outer, -inner), 4.0);
  r = U(r, sdBox(p - uStackC, uStackHalf, 0.002), 5.0);
  r = U(r, sdBox(p - uTableC, uTableHalf, 0.004), 6.0);
  r = U(r, sdBox(p - uPileC, uPileHalf, 0.002), 3.0);
  return r;
}
vec3 nrm(vec3 p){
  const vec2 k = vec2(1.0, -1.0); const float e = 4e-4;
  return normalize(k.xyy * map(p + k.xyy * e).x + k.yyx * map(p + k.yyx * e).x + k.yxy * map(p + k.yxy * e).x + k.xxx * map(p + k.xxx * e).x);
}
float shadow(vec3 o, vec3 L){
  float s = 1.0, t = 0.01;
  for (int i = 0; i < 40; i++) { float d = map(o + L * t).x; s = min(s, clamp(10.0 * d / t, 0.0, 1.0)); t += clamp(d, 0.004, 0.05); if (s < 0.01 || t > 2.0) break; }
  return s;
}
float occl(vec3 p, vec3 n){
  float a = 1.0;
  for (int i = 1; i <= 5; i++) { float h = 0.012 * float(i); a -= (h - map(p + n * h).x) * (0.6 / exp2(float(i))) / 0.012; }
  return clamp(a, 0.0, 1.0);
}
void main(){
  vec2 uv = gl_FragCoord.xy / uRes * 2.0 - 1.0;
  vec3 rd = normalize(uCam * vec3(uv.x * uTan.x, uv.y * uTan.y, 1.0));
  float t = 0.05; vec2 h = vec2(1.0, 0.0); bool hit = false;
  for (int i = 0; i < 160; i++) { h = map(uCamPos + rd * t); if (h.x < 2e-4) { hit = true; break; } t += max(h.x, 1e-4) * 0.85; if (t > 8.0) break; }
  if (!hit) { outColor = vec4(0.0); return; }
  vec3 p = uCamPos + rd * t; vec3 n = nrm(p);
  float diff = clamp(dot(n, uLight), 0.0, 1.0);
  float sh = shadow(p + n * 1e-3, uLight);
  float ao = occl(p, n);
  float m = h.y;
  float alb = m < 1.5 ? 0.95 : m < 2.5 ? 0.55 : m < 3.5 ? 1.0 : m < 4.5 ? 0.5 : m < 5.5 ? 0.9 : 0.75;
  float rim = pow(1.0 - clamp(abs(dot(n, -rd)), 0.0, 1.0), 2.5);
  float b = clamp(alb * (0.22 + 0.85 * diff * (0.35 + 0.65 * sh)) * (0.55 + 0.45 * ao) - 0.25 * rim, 0.0, 1.0);
  if (m > 2.5 && m < 3.5) b = 0.8 + 0.2 * diff;
  outColor = vec4(b, 1.0, m / 8.0, clamp((t - 1.0) / 3.0, 0.004, 1.0));
}`;

  function compile(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }

  class Tracer {
    constructor() {
      this.canvas = document.createElement('canvas');
      const gl = this.canvas.getContext('webgl2', { antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: true, powerPreference: 'low-power' });
      if (!gl) throw new Error('WebGL2 が使えない');
      this.gl = gl;
      const prog = gl.createProgram();
      gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VS));
      gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
      this.prog = prog;
      gl.useProgram(prog);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, 'aPos');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      this.loc = {};
    }
    u(name) { return name in this.loc ? this.loc[name] : (this.loc[name] = this.gl.getUniformLocation(this.prog, name)); }
    set(name, v) {
      const gl = this.gl, l = this.u(name);
      if (l === null) return;
      if (typeof v === 'number') gl.uniform1f(l, v);
      else if (v.length === 2) gl.uniform2fv(l, v);
      else if (v.length === 3) gl.uniform3fv(l, v);
      else gl.uniformMatrix3fv(l, false, v);
    }
    trace(w, h, uniforms) {
      const gl = this.gl;
      if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; this.px = new Uint8Array(w * h * 4); }
      gl.viewport(0, 0, w, h);
      this.set('uRes', [w, h]);
      for (const k in uniforms) this.set(k, uniforms[k]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, this.px);
      return this.px;
    }
  }

  // WebGL2 がない端末で、止めた1コマ（still）を描くための写し方。シェーダーの map と陰影を、同じ式のまま JS に写した。
  // 1コマに数十〜数百 ms かかるので、動かす mount では使わない。
  // WebGL1 に落とす案は採らなかった。WebGL そのものを切った端末（iOS のロックダウンモードなど）で、絵が何も出なくなるからである。
  const l3 = (x, y, z) => Math.sqrt(x * x + y * y + z * z);
  // GLSL の v * M（列ごとの内積）。M は uniformMatrix3fv に渡すのと同じ、列を並べた9つの数
  const vm = (v, M) => [v[0] * M[0] + v[1] * M[1] + v[2] * M[2], v[0] * M[3] + v[1] * M[4] + v[2] * M[5], v[0] * M[6] + v[1] * M[7] + v[2] * M[8]];
  const sdEll = (q, r) => {
    const k0 = l3(q[0] / r[0], q[1] / r[1], q[2] / r[2]);
    const k1 = l3(q[0] / (r[0] * r[0]), q[1] / (r[1] * r[1]), q[2] / (r[2] * r[2]));
    return (k0 * (k0 - 1)) / Math.max(k1, 1e-6);
  };
  const sdCap = (p, a, b, ra, rb) => {
    const pa = sub(p, a), ba = sub(b, a);
    const t = clamp(dot(pa, ba) / dot(ba, ba), 0, 1);
    return l3(pa[0] - ba[0] * t, pa[1] - ba[1] * t, pa[2] - ba[2] * t) - (ra + (rb - ra) * t);
  };
  const sdBox = (q, h, rr) => {
    const dx = Math.abs(q[0]) - (h[0] - rr), dy = Math.abs(q[1]) - (h[1] - rr), dz = Math.abs(q[2]) - (h[2] - rr);
    return l3(Math.max(dx, 0), Math.max(dy, 0), Math.max(dz, 0)) + Math.min(Math.max(dx, dy, dz), 0) - rr;
  };
  const smin = (a, b, k) => { const h = clamp(0.5 + (0.5 * (b - a)) / k, 0, 1); return b + (a - b) * h - k * h * (1 - h); };

  class CpuTracer {
    constructor(reason) { this.reason = reason; }
    map(p) {
      const u = this.u;
      let d, m;
      const U = (e, n) => { if (e < d) { d = e; m = n; } };
      d = sdEll(vm(sub(p, u.uHeadC), u.uHeadM), [0.077, 0.098, 0.097]);
      d = smin(d, sdEll(vm(sub(p, u.uJawC), u.uHeadM), [0.058, 0.055, 0.062]), 0.035);
      d = smin(d, sdCap(p, u.uNeckA, u.uNeckB, 0.05, 0.047), 0.035);
      m = 1;
      let body = sdBox(vm(sub(p, u.uTorsoC), u.uTorsoM), [0.165, 0.26, 0.095], 0.09);
      body = smin(body, sdCap(p, u.uShL, u.uShR, 0.06, 0.06), 0.07);
      body = smin(body, sdCap(p, u.uCollarA, u.uCollarB, 0.062, 0.055), 0.07);
      U(body, 2);
      let ar = sdEll(sub(p, u.uShR), [0.06, 0.062, 0.06]);
      ar = smin(ar, sdCap(p, u.uShR, u.uElbR, 0.054, 0.045), 0.04);
      ar = smin(ar, sdCap(p, u.uElbR, u.uWriR, 0.043, 0.032), 0.04);
      U(ar, 2);
      let hr = sdCap(p, u.uWriR, u.uPalmR, 0.027, 0.024);
      hr = smin(hr, sdEll(vm(sub(p, u.uPalmR), u.uHandR), [0.036, 0.042, 0.017]), 0.012);
      hr = smin(hr, sdCap(p, u.uThA, u.uThB, 0.0105, 0.0095), 0.012);
      U(hr, 1);
      let al = sdEll(sub(p, u.uShL), [0.06, 0.062, 0.06]);
      al = smin(al, sdCap(p, u.uShL, u.uElbL, 0.054, 0.045), 0.04);
      al = smin(al, sdCap(p, u.uElbL, u.uWriL, 0.043, 0.032), 0.04);
      U(al, 2);
      let hl = sdCap(p, u.uWriL, u.uPalmL, 0.027, 0.024);
      hl = smin(hl, sdEll(vm(sub(p, u.uPalmL), u.uHandL), [0.036, 0.042, 0.017]), 0.012);
      U(hl, 1);
      if (u.uCardOn > 0.5) U(sdBox(vm(sub(p, u.uCardC), u.uCardM), u.uCardHalf, 0), 3);
      const outer = sdBox(sub(p, u.uBoxC), u.uBoxHalf, 0.004);
      const inner = sdBox(sub(p, add(u.uBoxC, [0, 0.016, 0])), sub(u.uBoxHalf, [0.008, 0, 0.008]), 0);
      U(Math.max(outer, -inner), 4);
      U(sdBox(sub(p, u.uStackC), u.uStackHalf, 0.002), 5);
      U(sdBox(sub(p, u.uTableC), u.uTableHalf, 0.004), 6);
      U(sdBox(sub(p, u.uPileC), u.uPileHalf, 0.002), 3);
      return [d, m];
    }
    nrm(p) {
      const e = 4e-4;
      const a = this.map([p[0] + e, p[1] - e, p[2] - e])[0], b = this.map([p[0] - e, p[1] - e, p[2] + e])[0];
      const c = this.map([p[0] - e, p[1] + e, p[2] - e])[0], f = this.map([p[0] + e, p[1] + e, p[2] + e])[0];
      return norm([a - b - c + f, -a - b + c + f, -a + b - c + f]);
    }
    shadow(o, L) {
      let s = 1, t = 0.01;
      for (let i = 0; i < 40; i++) {
        const d = this.map(add(o, mul(L, t)))[0];
        s = Math.min(s, clamp((10 * d) / t, 0, 1));
        t += clamp(d, 0.004, 0.05);
        if (s < 0.01 || t > 2) break;
      }
      return s;
    }
    occl(p, n) {
      let a = 1;
      for (let i = 1; i <= 5; i++) { const h = 0.012 * i; a -= ((h - this.map(add(p, mul(n, h)))[0]) * (0.6 / 2 ** i)) / 0.012; }
      return clamp(a, 0, 1);
    }
    trace(w, h, uniforms) {
      // still は、濃さの幅を決める1枚と描く1枚に、同じ場面を2回写す。2回目は前の結果を返す
      const key = JSON.stringify([w, h, uniforms]);
      if (key === this.key) return this.px;
      this.key = key;
      this.u = uniforms;
      const px = (this.px = new Uint8Array(w * h * 4));
      const { uCamPos: o, uCam: C, uTan: tan, uLight: L } = uniforms;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const ux = (((x + 0.5) / w) * 2 - 1) * tan[0], uy = (((y + 0.5) / h) * 2 - 1) * tan[1];
          const rd = norm([C[0] * ux + C[3] * uy + C[6], C[1] * ux + C[4] * uy + C[7], C[2] * ux + C[5] * uy + C[8]]);
          let t = 0.05, hit = null;
          for (let i = 0; i < 160; i++) {
            const r = this.map(add(o, mul(rd, t)));
            if (r[0] < 2e-4) { hit = r; break; }
            t += Math.max(r[0], 1e-4) * 0.85;
            if (t > 8) break;
          }
          if (!hit) continue;
          const p = add(o, mul(rd, t)), n = this.nrm(p), m = hit[1];
          const diff = clamp(dot(n, L), 0, 1);
          const sh = this.shadow(add(p, mul(n, 1e-3)), L);
          const ao = this.occl(p, n);
          const alb = m < 1.5 ? 0.95 : m < 2.5 ? 0.55 : m < 3.5 ? 1.0 : m < 4.5 ? 0.5 : m < 5.5 ? 0.9 : 0.75;
          const rim = (1 - clamp(Math.abs(dot(n, rd)), 0, 1)) ** 2.5;
          let b = clamp(alb * (0.22 + 0.85 * diff * (0.35 + 0.65 * sh)) * (0.55 + 0.45 * ao) - 0.25 * rim, 0, 1);
          if (m > 2.5 && m < 3.5) b = 0.8 + 0.2 * diff;
          const k = (y * w + x) * 4;
          px[k] = Math.round(b * 255);
          px[k + 1] = 255;
          px[k + 2] = Math.round((m / 8) * 255);
          px[k + 3] = Math.round(clamp((t - 1) / 3, 0.004, 1) * 255);
        }
      }
      return px;
    }
  }

  // ------------------------------------------------------------ カメラ
  const TARGET = [-0.03, 1.3, 0.1];
  const RADIUS = 2.45, FOV = 24;

  function camera(yaw, pitch, aspect) {
    const cp = Math.cos(rad(pitch));
    const pos = [TARGET[0] - RADIUS * cp * Math.sin(rad(yaw)), TARGET[1] + RADIUS * Math.sin(rad(pitch)), TARGET[2] + RADIUS * cp * Math.cos(rad(yaw))];
    const f = norm(sub(TARGET, pos));
    const r = norm(cross(f, [0, 1, 0]));
    const u = cross(r, f);
    const tan = Math.tan(rad(FOV) / 2);
    // 光はカメラに付けて、画面の左上の横寄りから当てる。どの向きから見ても体に明るい側と陰の側ができ、形が字の濃淡で読める。
    // 部屋に固定した光にすると、後ろへ回ったとき体が一面の陰になって形が消える
    const light = norm(add(add(mul(r, -0.7), mul(u, 0.65)), mul(f, -0.35)));
    return { uCamPos: pos, uCam: [...r, ...u, ...f], uTan: [tan * aspect, tan], uLight: light };
  }

  // ------------------------------------------------------------ 升目を字にする
  const SYMBOLS = '・ー＋';

  function cells(px, cols, rows, ss) {
    const W = cols * ss, H = rows * ss, n = ss * ss;
    const N = cols * rows;
    const cov = new Float32Array(N), bright = new Float32Array(N), card = new Float32Array(N), prop = new Float32Array(N), table = new Float32Array(N), depth = new Float32Array(N);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        let hit = 0, cd = 0, bs = 0, pr = 0, ds = 0, tb = 0;
        for (let j = 0; j < ss; j++) {
          const y = H - 1 - (r * ss + j);
          for (let i = 0; i < ss; i++) {
            const k = (y * W + c * ss + i) * 4;
            if (px[k + 1] > 127) {
              hit++; bs += px[k]; ds += px[k + 3];
              const m = Math.round((px[k + 2] / 255) * 8);
              if (m === 3) cd++; else if (m >= 4) pr++;
              if (m === 6) tb++;
            }
          }
        }
        const idx = r * cols + c;
        cov[idx] = hit / n;
        card[idx] = cd / n;
        prop[idx] = pr / n;
        table[idx] = tb / n;
        bright[idx] = hit ? bs / hit / 255 : 0;
        depth[idx] = hit ? 1 + (ds / hit / 255) * 3 : 0;
      }
    }
    return { cov, bright, card, prop, table, depth };
  }

  function percentile(arr, q) {
    const s = Float32Array.from(arr).sort();
    return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : 0;
  }

  // 字の並べ方。縦書きは右の列から上から下へ、横書きは上の行から左から右へ、決まり字の列を流し込む
  const layouts = {
    tate: (r, c, cols, rows) => (cols - 1 - c) * rows + r,
    yoko: (r, c, cols) => r * cols + c,
  };

  // 字の選び方：人物は決まり字の列から、札と机と箱は記号から取る。明るい所（明るい地では淡い所）は記号に落とす
  const EDGE_DEPTH = 0.07;
  function glyphs(st, cols, rows, opt, calib) {
    const out = [];
    const dark = opt.mode === 'dark';
    const order = layouts[opt.layout] || layouts.tate;
    const stream = opt.stream;
    const covered = (i) => st.cov[i] > 0.18;
    const isCard = (i) => covered(i) && st.card[i] > st.cov[i] * 0.5;
    // 手前の部位が奥の部位に重なる境の升目。腕が胴の前を通る所などに輪郭が出る
    const edge = (r, c, i) => {
      const d = st.depth[i];
      for (const [rr, cc] of [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]) {
        if (rr < 0 || rr >= rows || cc < 0 || cc >= cols) continue;
        const j = rr * cols + cc;
        if (covered(j) && st.depth[j] > d + EDGE_DEPTH) return true;
      }
      return false;
    };
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const cov = st.cov[i];
        if (!covered(i)) continue;
        const tone = dark ? st.bright[i] : 1 - st.bright[i];
        let level = clamp((tone - calib.lo) / Math.max(calib.hi - calib.lo, 1e-6), 0, 1) ** (dark ? 1.1 : 1.5);
        level *= clamp(cov / 0.7, 0, 1);
        if (isCard(i)) {
          const inner = r > 0 && r < rows - 1 && c > 0 && c < cols - 1 && isCard(i - 1) && isCard(i + 1) && isCard(i - cols) && isCard(i + cols);
          out.push(dark ? [r, c, '＋', 1, 1] : [r, c, inner ? '・' : '＋', inner ? 0.6 : 1, 1]);
          continue;
        }
        if (edge(r, c, i)) level = dark ? level * 0.35 : Math.max(level, 0.8);
        // 机は面を「ー」で淡く、箱は記号の濃淡で描く。人物より目立たせない
        if (st.table[i] > st.cov[i] * 0.5) { out.push([r, c, 'ー', 0.3 + 0.3 * level]); continue; }
        if (st.prop[i] > st.cov[i] * 0.5) { out.push([r, c, level < 0.35 ? '・' : level < 0.7 ? 'ー' : '＋', 0.5 + 0.5 * level]); continue; }
        if (level < 0.12) { out.push([r, c, '・', 0.8]); continue; }
        if (level < 0.24) { out.push([r, c, 'ー', 0.85]); continue; }
        if (level < 0.36) { out.push([r, c, '＋', 0.9]); continue; }
        const ch = stream[order(r, c, cols, rows) % stream.length];
        out.push([r, c, ch, 0.32 + 0.68 * ((level - 0.36) / 0.64)]);
      }
    }
    return out;
  }

  // ------------------------------------------------------------ 傾きとスワイプ
  // 端末の画面の裏が向く方角と仰角。W3C の deviceorientation は地面の座標で x 東、y 北、z 上
  function heading(e) {
    const a = rad(e.alpha || 0), b = rad(e.beta || 0), g = rad(e.gamma || 0);
    const x = -Math.cos(a) * Math.sin(g) - Math.sin(a) * Math.sin(b) * Math.cos(g);
    const y = -Math.sin(a) * Math.sin(g) + Math.cos(a) * Math.sin(b) * Math.cos(g);
    const z = -Math.cos(b) * Math.cos(g);
    return { yaw: (Math.atan2(x, y) * 180) / Math.PI, pitch: (Math.asin(clamp(z, -1, 1)) * 180) / Math.PI };
  }
  const wrap = (d) => ((((d + 180) % 360) + 360) % 360) - 180;

  // ------------------------------------------------------------ 描く
  // WebGL の文脈は1つを使い回す。1コマごとに写して読み戻すので、絵が何枚あっても同時には使わない。
  // WebGL2 の文脈を作れなければ CpuTracer に替える。mount はそれを断り、still だけが使う
  let shared = null;
  const tracer = () => {
    if (!shared) try { shared = new Tracer(); } catch (err) { shared = new CpuTracer(String(err.message || err)); }
    return shared;
  };

  function inkOf(el, mode) {
    const cs = getComputedStyle(el);
    const m = cs.color.match(/\d+(\.\d+)?/g) || ['0', '0', '0'];
    const lum = (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255;
    // 札の升目だけ別の色にできる（--kv-card）。体を淡くして題の後ろに置くときも、札は濃く残す
    const card = cs.getPropertyValue('--kv-card').trim() || cs.color;
    return { color: cs.color, card, font: cs.fontFamily, mode: mode === 'auto' ? (lum > 0.5 ? 'dark' : 'light') : mode };
  }

  function stats(t, yaw, pitch, cols, rows, ss) {
    const u = { ...rig(pose(t)), ...camera(yaw, pitch, cols / rows) };
    return cells(tracer().trace(cols * ss, rows * ss, u), cols, rows, ss);
  }

  // 明るさを字の濃さへ移す幅は、読んでいる場面を既定の向きから見た1枚で決めて固定する。毎コマ決めると動くたびに濃さがちらつく
  const calibCache = new Map();
  function calibrate(mode, cols, rows, ss, yaw, pitch) {
    const key = [mode, cols, rows, ss, yaw, pitch].join(':');
    if (calibCache.has(key)) return calibCache.get(key);
    const st = stats(READ_T, yaw, pitch, cols, rows, ss);
    const tones = [];
    for (let i = 0; i < st.cov.length; i++) if (st.cov[i] > 0.18) tones.push(mode === 'dark' ? st.bright[i] : 1 - st.bright[i]);
    const c = { lo: percentile(tones, 0.03), hi: percentile(tones, 0.97) };
    calibCache.set(key, c);
    return c;
  }

  // 升目が字の読めない大きさ（DOT_BELOW px 未満）では、升目ごとに fillText をせず、字の濃さの印を置く。
  // 記号はその形（点、横線、十字）に、字は四角にして、もとの濃淡に近づける。字は虫眼鏡（client/kv-lens.ts）で読ませる。
  // 字を1回だけ並べて描いた帯（atlas）から drawImage で写す案は、Chromium で fillText より重かったので採らなかった。
  const DOT_BELOW = 8;
  function mark(ctx, ch, x, y, cw) {
    if (ch === '・') ctx.fillRect(x + cw * 0.38, y + cw * 0.38, cw * 0.24, cw * 0.24);
    else if (ch === 'ー') ctx.fillRect(x + cw * 0.1, y + cw * 0.42, cw * 0.8, cw * 0.16);
    else if (ch === '＋') {
      ctx.fillRect(x + cw * 0.15, y + cw * 0.42, cw * 0.7, cw * 0.16);
      ctx.fillRect(x + cw * 0.42, y + cw * 0.15, cw * 0.16, cw * 0.7);
    } else ctx.fillRect(x + cw * 0.2, y + cw * 0.2, cw * 0.6, cw * 0.6);
  }

  // Canvas ごとの、最後に描いた字の並び。入口の虫眼鏡（client/kv-lens.ts）が、指の下の升目の字を拡大して描くのに使う
  const painted = new WeakMap();

  function paint(ctx, ink, opt, cols, rows, t, yaw, pitch) {
    const calib = calibrate(ink.mode, cols, rows, opt.ss, opt.yaw, opt.pitch);
    const list = glyphs(stats(t, yaw, pitch, cols, rows, opt.ss), cols, rows, { ...opt, mode: ink.mode }, calib);
    const cw = opt.cell;
    const dots = cw < DOT_BELOW;
    ctx.clearRect(0, 0, cols * cw, rows * cw);
    ctx.fillStyle = ink.color;
    ctx.font = `700 ${cw * 0.96}px ${ink.font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const [r, c, ch, a, card] of list) {
      ctx.globalAlpha = a;
      ctx.fillStyle = card ? ink.card : ink.color;
      if (dots) mark(ctx, ch, c * cw, r * cw, cw);
      else ctx.fillText(ch, c * cw + cw / 2, r * cw + cw / 2 + cw * 0.04);
    }
    ctx.globalAlpha = 1;
    painted.set(ctx.canvas, { list, cell: cw, ink });
    return list.length;
  }

  function sizeCanvas(view, ctx, el, cell) {
    const cols = Math.max(8, Math.floor(el.clientWidth / cell));
    const rows = Math.max(8, Math.floor(el.clientHeight / cell));
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    view.width = Math.round(cols * cell * dpr);
    view.height = Math.round(rows * cell * dpr);
    view.style.width = `${cols * cell}px`;
    view.style.height = `${rows * cell}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { cols, rows };
  }

  const DEFAULTS = { cell: 9, ss: 3, layout: 'tate', mode: 'auto', yaw: 55, pitch: 8, fps: 30, playing: true, time: 0, gyroGain: 1, tapGyro: true };

  // 止めた1コマを描く。コマ送りや、動かさない設定（prefers-reduced-motion）の代わりに使う
  function still(el, options) {
    const opt = { ...DEFAULTS, ...options };
    const view = document.createElement('canvas');
    view.setAttribute('aria-hidden', 'true');
    view.style.display = 'block';
    el.appendChild(view);
    const ctx = view.getContext('2d');
    try {
      const { cols, rows } = sizeCanvas(view, ctx, el, opt.cell);
      paint(ctx, inkOf(el, opt.mode), opt, cols, rows, opt.time, opt.view?.yaw ?? opt.yaw, opt.view?.pitch ?? opt.pitch);
    } catch (err) { el.dataset.kvError = String(err.message || err); }
    return view;
  }

  function mount(el, options) {
    const opt = { ...DEFAULTS, ...options };
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) opt.playing = false;
    const view = document.createElement('canvas');
    view.setAttribute('aria-hidden', 'true');
    view.style.cssText = 'display:block;touch-action:pan-y;cursor:grab;-webkit-user-select:none;user-select:none';
    el.appendChild(view);
    const ctx = view.getContext('2d');
    if (tracer() instanceof CpuTracer) { el.dataset.kvError = tracer().reason; view.remove(); return null; }

    const s = {
      cols: 0, rows: 0, t: opt.time, last: 0, acc: 0,
      yaw: opt.yaw, pitch: opt.pitch, dragYaw: 0, dragPitch: 0, vel: 0,
      gyro: null, gyroRef: null, gyroYaw: 0, gyroPitch: 0,
      frames: 0, fpsT: 0, fps: 0, cost: 0, count: 0, visible: true, drag: null, raf: 0,
    };

    // 止めたあとは、時刻が変わらず、向きも 1.5 度より動かないあいだは描き直さない。止めても毎コマ写し続けると、熱と電池の負担が動いているときと変わらない。
    // 向きを細かく比べないのは、許可の要らない端末が mount の時点から傾きを受け、手に持った端末のぶれだけでも写し直すからである
    const draw = () => { if (s.cols) { s.count = paint(ctx, inkOf(el, opt.mode), opt, s.cols, s.rows, s.t, s.yaw, s.pitch); s.drawn = { t: s.t, yaw: s.yaw, pitch: s.pitch }; } };
    const unchanged = () => s.drawn && !s.drag && s.t === s.drawn.t && Math.abs(s.yaw - s.drawn.yaw) < 1.5 && Math.abs(s.pitch - s.drawn.pitch) < 1.5;
    const resize = () => { Object.assign(s, sizeCanvas(view, ctx, el, opt.cell)); draw(); };

    function tick(now) {
      s.raf = requestAnimationFrame(tick);
      const dt = s.last ? Math.min(0.1, (now - s.last) / 1000) : 0;
      s.last = now;
      if (!s.visible) return;
      if (!s.drag) { s.dragYaw += s.vel * dt; s.vel *= Math.exp(-dt * 3); }
      const tYaw = opt.yaw + s.dragYaw + s.gyroYaw;
      const tPitch = clamp(opt.pitch + s.dragPitch + s.gyroPitch, -12, 40);
      const k = 1 - Math.exp(-dt * 14);
      s.yaw += (tYaw - s.yaw) * k;
      s.pitch += (tPitch - s.pitch) * k;
      if (opt.playing) { s.t += dt; if (s.t >= LOOP) s.t -= LOOP; }
      s.acc += dt;
      if (s.acc < 1 / opt.fps) return;
      s.acc = 0;
      if (unchanged()) return;
      const t0 = performance.now();
      draw();
      s.cost = performance.now() - t0;
      s.frames++;
      if (now - s.fpsT > 1000) { s.fps = (s.frames * 1000) / (now - s.fpsT); s.frames = 0; s.fpsT = now; }
    }

    // スワイプ：横に動かした分だけ回す。縦はページのスクロールに残す（touch-action: pan-y）
    view.addEventListener('pointerdown', (e) => {
      s.drag = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0, type: e.pointerType };
      s.vel = 0;
      view.setPointerCapture(e.pointerId);
      view.style.cursor = 'grabbing';
    });
    view.addEventListener('pointermove', (e) => {
      if (!s.drag) return;
      const dx = e.clientX - s.drag.x, dy = e.clientY - s.drag.y;
      const now = performance.now();
      const perPx = 300 / Math.max(240, view.clientWidth);
      s.dragYaw += dx * perPx;
      if (s.drag.type === 'mouse') s.dragPitch = clamp(s.dragPitch + dy * perPx * 0.5, -18, 34);
      s.vel = (dx * perPx) / Math.max(0.008, (now - s.drag.t) / 1000);
      s.drag.moved += Math.abs(dx) + Math.abs(dy);
      s.drag.x = e.clientX; s.drag.y = e.clientY; s.drag.t = now;
    });
    const end = () => {
      if (!s.drag) return;
      if (s.drag.moved < 6 && opt.tapGyro) enableGyro();
      s.drag = null;
      view.style.cursor = 'grab';
    };
    view.addEventListener('pointerup', end);
    view.addEventListener('pointercancel', end);
    const front = () => { s.dragYaw = 0; s.dragPitch = 0; s.vel = 0; s.gyroRef = s.gyro; s.gyroYaw = 0; s.gyroPitch = 0; };
    view.addEventListener('dblclick', front);

    // 傾き：端末を回した分だけ人物を回す（360度動画と同じく、最初に受けた向きを正面とする）
    function onOrient(e) {
      if (e.alpha == null || s.held) return;
      s.gyro = heading(e);
      if (!s.gyroRef) s.gyroRef = s.gyro;
      if (Math.abs(s.gyro.pitch) < 75) s.gyroYaw = -wrap(s.gyro.yaw - s.gyroRef.yaw) * opt.gyroGain;
      s.gyroPitch = clamp(-(s.gyro.pitch - s.gyroRef.pitch) * 0.5, -20, 20);
      el.dataset.kvGyro = 'on';
    }
    async function enableGyro() {
      if (s.gyroAsked) return;
      s.gyroAsked = true;
      const D = window.DeviceOrientationEvent;
      if (!D) { el.dataset.kvGyro = 'none'; return; }
      try {
        if (typeof D.requestPermission === 'function') {
          const res = await D.requestPermission();
          if (res !== 'granted') { el.dataset.kvGyro = 'denied'; return; }
        }
        window.addEventListener('deviceorientation', onOrient);
        el.dataset.kvGyro = 'waiting';
      } catch (err) {
        el.dataset.kvGyro = 'blocked';
      }
    }
    if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission !== 'function') enableGyro();

    const ro = new ResizeObserver(resize);
    ro.observe(el);
    const io = new IntersectionObserver((es) => { s.visible = es[0].isIntersecting; });
    io.observe(el);
    resize();
    s.raf = requestAnimationFrame(tick);

    return {
      state: s,
      // 升目の大きさを変えたら、列と段の数から測り直す
      set(next) { Object.assign(opt, next); if (next.time != null) s.t = next.time; if (next.cell != null) resize(); else draw(); },
      front,
      // 長押しの虫眼鏡（client/kv-lens.ts）に指を渡す。release まで、なぞって回す動き、離したあとの惰性、傾きで回さない
      hold() { s.held = true; s.drag = null; s.vel = 0; view.style.cursor = 'grab'; },
      release() { s.held = false; },
      orient: onOrient,
      enableGyro,
      destroy() { cancelAnimationFrame(s.raf); ro.disconnect(); io.disconnect(); window.removeEventListener('deviceorientation', onOrient); view.remove(); },
    };
  }

  window.YomimasuKv = { mount, still, glyphsOf: (canvas) => painted.get(canvas), LOOP, READ_T };
})();
