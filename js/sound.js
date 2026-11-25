// 소리: 효과음(mp3)과, 코드로 만드는 소리(테이프 찌이익·띵·동전)와 배경 음악.
// 아이패드는 첫 터치 전에는 소리를 낼 수 없어서, 첫 터치 때 소리 장치를 켠다.
// 배경 음악은 이 게임을 위해 직접 만든 가락이다(외부 음원 없음).

const VOL = { click: 0.5, ok: 0.6, no: 0.5, thud: 0.7, tape: 0.7, fold: 0.6, robot: 0.35, clear: 0.6, stamp: 0.9, coin: 0.5, door: 0.6, goal: 0.55 };
const AC = window.AudioContext || window.webkitAudioContext;
const on = { sound: true, music: true };
const bufs = {};
let ctx = null, master = null, sfxBus = null, musBus = null, noiseBuf = null;

function build() {
  ctx = new AC();
  const lim = ctx.createDynamicsCompressor(); // 소리가 겹쳐도 찢어지지 않게
  lim.threshold.value = -9; lim.ratio.value = 12; lim.attack.value = 0.002;
  const out = ctx.createGain(); out.gain.value = 0.7; // 여러 소리가 겹쳐도 최대치를 넘지 않게
  master = ctx.createGain(); master.connect(lim); lim.connect(out); out.connect(ctx.destination);
  sfxBus = ctx.createGain(); sfxBus.connect(master);
  musBus = ctx.createGain(); musBus.gain.value = 0; musBus.connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  Object.keys(VOL).forEach((name) => fetch(`sounds/${name}.mp3`).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.status))))
    .then((ab) => new Promise((res, rej) => { const p = ctx.decodeAudioData(ab, res, rej); if (p && p.catch) p.catch(rej); })).then((b) => { bufs[name] = b; }).catch(() => {}));
}
function unlock() {
  if (!AC) return;
  try {
    if (!ctx) build();
    if (ctx.state !== 'running' && !document.hidden) ctx.resume().catch(() => {});
  } catch (_) { ctx = null; }
}
['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'].forEach((ev) => window.addEventListener(ev, unlock, { capture: true, passive: true }));
document.addEventListener('visibilitychange', () => {
  if (!ctx) return;
  if (document.hidden) ctx.suspend().catch(() => {}); else ctx.resume().catch(() => {});
});
const ready = () => ctx && ctx.state === 'running';

export function setAudio({ sound, music: m }) {
  if (sound != null) on.sound = !!sound;
  if (m != null) on.music = !!m;
  applyMusic();
}

// opt.rate: 높낮이(1 = 그대로), opt.vol: 크기 배수
export function sfx(name, { rate = 1, vol = 1 } = {}) {
  if (!on.sound) return;
  const v = (VOL[name] ?? 0.6) * vol;
  if (ready() && bufs[name]) {
    const s = ctx.createBufferSource(), g = ctx.createGain();
    s.buffer = bufs[name]; s.playbackRate.value = rate; g.gain.value = v;
    s.connect(g); g.connect(sfxBus); s.start();
    return;
  }
  try { const a = new Audio(`sounds/${name}.mp3`); a.volume = Math.min(1, v); a.play().catch(() => {}); } catch (_) { /* 무시 */ }
}

// 짧은 음 하나
function note(freq, t, len, vol, type = 'triangle', bus = sfxBus) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0008, t + len);
  o.connect(g); g.connect(bus);
  o.start(t); o.stop(t + len + 0.03);
}
const midi = (n) => 440 * 2 ** ((n - 69) / 12);

// 하나 붙일 때마다 한 음씩 올라간다(1~12번째). 도레미솔라 다섯 음이라 이어서 들어도 어울린다
const STEP = [0, 2, 4, 7, 9];
const stepNote = (k) => 67 + STEP[k % 5] + 12 * Math.floor(k / 5);
export function pip(n) {
  if (!on.sound || !ready()) return;
  note(midi(stepNote(Math.max(0, n - 1))), ctx.currentTime, 0.22, 0.3);
}
// 다 붙였을 때: 화음
export function chime() {
  if (!on.sound || !ready()) return;
  [72, 76, 79, 84].forEach((m, i) => note(midi(m), ctx.currentTime + i * 0.06, 0.5, 0.16));
}
export function coin(i = 0) {
  if (!on.sound || !ready()) return;
  const t = ctx.currentTime;
  note(midi(88 + Math.min(i, 8)), t, 0.09, 0.09, 'square');
  note(midi(93 + Math.min(i, 8)), t + 0.05, 0.16, 0.08, 'square');
}
// 콤보: 길수록 높고 긴 음
export function comboSound(len) {
  if (!on.sound || !ready()) return;
  for (let i = 0; i < Math.min(len, 6); i++) note(midi(stepNote(i + Math.min(len, 5))), ctx.currentTime + i * 0.07, 0.3, 0.15);
}
export function tick() { if (on.sound && ready()) note(1050, ctx.currentTime, 0.05, 0.09, 'sine'); }

// 테이프를 끄는 동안 나는 찌이익 소리
let tapeNode = null;
export function tapeStart() {
  if (!on.sound || !ready() || tapeNode) return;
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf; s.loop = true;
  f.type = 'bandpass'; f.frequency.value = 1500; f.Q.value = 2.2;
  g.gain.value = 0;
  s.connect(f); f.connect(g); g.connect(sfxBus); s.start();
  tapeNode = { s, f, g };
}
// p: 모서리를 덮은 정도(0~1), speed: 손가락 빠르기(0~1)
export function tapeMove(p, speed) {
  if (!tapeNode) return;
  const t = ctx.currentTime;
  tapeNode.f.frequency.setTargetAtTime(1300 + 1500 * p, t, 0.03);
  tapeNode.g.gain.cancelScheduledValues(t);
  tapeNode.g.gain.setTargetAtTime(0.1 + 0.22 * speed, t, 0.015);
  tapeNode.g.gain.setTargetAtTime(0, t + 0.07, 0.05); // 손이 멈추면 소리도 잦아든다
}
export function tapeStop() {
  if (!tapeNode) return;
  const n = tapeNode, t = ctx.currentTime;
  tapeNode = null;
  n.g.gain.cancelScheduledValues(t);
  n.g.gain.setTargetAtTime(0, t, 0.02);
  n.s.stop(t + 0.15);
}

// ---------- 배경 음악 (직접 만든 가락: 8마디 반복) ----------
// 한 마디 = 8분음표 8개. 숫자는 음 높이(미디), 0은 쉼.
const CHORDS = [[48, 52, 55], [45, 48, 52], [53, 57, 60], [55, 59, 62], [48, 52, 55], [52, 55, 59], [53, 57, 60], [55, 59, 62]];
const TUNE = [
  [76, 0, 79, 0, 76, 74, 72, 0], [69, 0, 72, 0, 76, 0, 74, 72], [77, 0, 76, 74, 72, 0, 69, 0], [71, 0, 74, 0, 79, 0, 0, 0],
  [76, 0, 79, 84, 0, 83, 79, 0], [76, 0, 74, 0, 71, 0, 67, 0], [69, 72, 77, 0, 76, 0, 72, 0], [74, 0, 71, 0, 72, 0, 0, 0],
];
const M = { timer: 0, playing: false, step: 0, next: 0, bpm: 104, duck: 1 };
function applyMusic() {
  if (!ctx) return;
  const v = M.playing && on.sound && on.music ? 1.15 * M.duck : 0;
  musBus.gain.setTargetAtTime(v, ctx.currentTime, 0.15);
}
function schedule() {
  if (!ready() || !on.sound || !on.music) { M.next = 0; return; }
  if (!M.next || M.next < ctx.currentTime - 0.3) { M.next = ctx.currentTime + 0.06; applyMusic(); }
  while (M.next < ctx.currentTime + 0.25) {
    const bar = Math.floor(M.step / 8) % 8, i = M.step % 8, t = M.next, len = 30 / M.bpm;
    const c = CHORDS[bar], n = TUNE[bar][i];
    if (n) note(midi(n), t, len * 1.7, 0.11, 'triangle', musBus);
    if (i === 0 || i === 4) note(midi(c[0] - 12), t, len * 2.4, 0.17, 'sine', musBus);
    if (i % 2 === 1) { note(midi(c[1]), t, len * 0.7, 0.04, 'triangle', musBus); note(midi(c[2]), t, len * 0.7, 0.04, 'triangle', musBus); }
    if (i % 2 === 0) { // 찰칵찰칵 가벼운 박자
      const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = noiseBuf; f.type = 'highpass'; f.frequency.value = 6000;
      g.gain.setValueAtTime(i === 4 ? 0.035 : 0.018, t); g.gain.exponentialRampToValueAtTime(0.0006, t + 0.05);
      s.connect(f); f.connect(g); g.connect(musBus); s.start(t, Math.random() * 0.8, 0.07);
    }
    M.step++; M.next += len;
  }
}
export const music = {
  start() { if (M.playing) return; Object.assign(M, { playing: true, step: 0, next: 0, bpm: 104, duck: 1 }); clearInterval(M.timer); M.timer = setInterval(schedule, 60); applyMusic(); },
  stop() { M.playing = false; clearInterval(M.timer); applyMusic(); },
  hurry(v) { M.bpm = v ? 132 : 104; },
  duck(v) { const d = v ? 0.3 : 1; if (d !== M.duck) { M.duck = d; applyMusic(); } },
  get state() { return { playing: M.playing, bpm: M.bpm, duck: M.duck, step: M.step, ctx: ctx ? ctx.state : null, loaded: Object.keys(bufs).length }; },
};
