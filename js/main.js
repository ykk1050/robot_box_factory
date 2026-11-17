// 로봇 상자 공장 — 화면 흐름, 저장, 소리, 로봇 말풍선
import { DAYS } from './levels.js';

export const VERSION = 'v1.001'; // 고칠 때마다 +0.001 (화면 아래 제작자 줄에 표시)

// 작업장은 필요할 때 불러온다(시작 화면이 3D 라이브러리를 기다리지 않게)
const STATIONS = {
  sort: () => import('./stations/sort.js'), finish: () => import('./stations/finish.js'), sketch: () => import('./stations/sketch.js'),
  grip: () => import('./stations/grip.js'), cut: () => import('./stations/cut.js'), seam: () => import('./stations/seam.js'),
};
const STATION_NAME = { sort: '입고 분류대', finish: '포장 마감대', sketch: '송장 도면실', grip: '로봇 집게 라인', cut: '골판지 재단대', seam: '테이프 이음대' };

// ---------- 저장 ----------
const SAVE_KEY = 'cuboid-factory-save';
let save = { stars: {}, sound: true };
try { save = { ...save, ...JSON.parse(localStorage.getItem(SAVE_KEY) || '{}') }; } catch (_) { /* 무시 */ }
function store() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (_) { /* 무시 */ } }

// ---------- 소리 ----------
const SFX = {};
['click', 'ok', 'no', 'thud', 'tape', 'fold', 'robot', 'clear'].forEach((n) => { SFX[n] = `sounds/${n}.mp3`; });
const VOL = { click: 0.5, ok: 0.6, no: 0.5, thud: 0.7, tape: 0.7, fold: 0.6, robot: 0.35, clear: 0.6 };
export function sfx(name) {
  if (!save.sound || !SFX[name]) return;
  try {
    const a = new Audio(SFX[name]);
    a.volume = VOL[name] ?? 0.6;
    a.play().catch(() => {});
  } catch (_) { /* 무시 */ }
}

// ---------- DOM 도우미 ----------
export function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'html') e.innerHTML = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
  return e;
}

const app = document.getElementById('app');
let cleanups = [];
let current = null;
function runCleanups() { cleanups.splice(0).forEach((f) => { try { f(); } catch (_) { /* 무시 */ } }); }

function creditLine() {
  return h('p', { class: 'credit-line' }, `Created by gamtudyssam using AI · ${VERSION} · `,
    h('a', { href: 'credits.html', target: '_blank', rel: 'noopener' }, '출처와 라이선스'));
}

// ---------- 시작 화면 ----------
function showTitle() {
  current = null; runCleanups();
  app.innerHTML = '';
  const total = DAYS.reduce((s, d) => s + (save.stars[d.id] || 0), 0);
  app.append(h('div', { class: 'screen title' },
    h('div', { class: 'title-box' },
      h('p', { class: 'kicker' }, '5학년 2학기 · 5. 직육면체'),
      h('h1', {}, '로봇 상자 공장'),
      h('p', { class: 'lead' }, '국제 물류 센터에 신입 엔지니어로 출근했어요.', h('br'), '로봇 박스봇과 함께 상자를 분류하고, 재단하고, 포장해요!'),
      h('img', { class: 'hero', src: 'img/robot.webp', alt: '공장 로봇 팔 박스봇' }),
      h('div', { class: 'row center' },
        h('button', { class: 'btn big', onclick: () => { sfx('click'); showMap(); } }, total ? '이어서 출근하기' : '출근하기')),
    ),
    creditLine()));
}

// ---------- 근무표 ----------
function showMap() {
  current = null; runCleanups();
  app.innerHTML = '';
  const grid = h('div', { class: 'days' });
  DAYS.forEach((d, i) => {
    const st = save.stars[d.id] || 0;
    grid.append(h('button', { class: 'day' + (st ? ' done' : ''), onclick: () => { sfx('click'); showIntro(d); } },
      h('span', { class: 'dnum' }, `${i + 1}일차`),
      h('span', { class: 'dicon' }, d.icon),
      h('b', {}, d.title),
      h('span', { class: 'dsub' }, d.sub),
      h('span', { class: 'stars' }, '★'.repeat(st) + '☆'.repeat(3 - st))));
  });
  app.append(h('div', { class: 'screen map' },
    h('div', { class: 'topline' },
      h('button', { class: 'btn ghost', onclick: () => { sfx('click'); showTitle(); } }, '← 처음 화면'),
      h('h2', {}, '근무표'),
      soundBtn()),
    h('p', { class: 'muted center' }, '1일차부터 차례대로 하면 교과서 순서와 같아요.'),
    grid,
    creditLine()));
}

function soundBtn() {
  const b = h('button', { class: 'btn ghost small', onclick: () => { save.sound = !save.sound; store(); b.textContent = save.sound ? '🔊 소리 켬' : '🔇 소리 끔'; sfx('click'); } }, save.sound ? '🔊 소리 켬' : '🔇 소리 끔');
  return b;
}

// ---------- 하루 시작 이야기 ----------
function showIntro(day) {
  const ov = h('div', { class: 'overlay' },
    h('div', { class: 'card intro' },
      h('div', { class: 'intro-head' }, h('img', { src: 'img/robot.webp', alt: '' }), h('div', {}, h('p', { class: 'kicker' }, `${DAYS.indexOf(day) + 1}일차 · ${STATION_NAME[day.station] || day.sub}`), h('h2', {}, day.title))),
      ...day.intro.map((t) => h('p', { class: 'say' }, t)),
      h('div', { class: 'row end' },
        h('button', { class: 'btn ghost', onclick: () => { sfx('click'); ov.remove(); } }, '닫기'),
        h('button', { class: 'btn', onclick: () => { sfx('click'); ov.remove(); playDay(day); } }, '작업 시작'))));
  app.append(ov);
}

// ---------- 하루 진행 ----------

async function playDay(day) {
  runCleanups();
  const token = {};
  current = token;
  app.innerHTML = '';
  const bar = h('header', { class: 'bar' });
  const stage = h('main', { class: 'stage' });
  const bubble = h('div', { class: 'bubble' });
  const robot = h('footer', { class: 'robot' }, h('img', { src: 'img/robot.webp', alt: '박스봇' }), bubble);
  const play = h('div', { class: 'screen play' }, bar, stage, robot);
  app.append(play);
  let mistakes = 0;
  const notes = [];
  const misEl = h('span', { class: 'mis' });
  const progEl = h('span', { class: 'prog' });
  const titleEl = h('span', { class: 'ttl' });
  bar.append(h('button', { class: 'btn ghost small', 'aria-label': '일시정지', onclick: () => { sfx('click'); pauseMenu(day); } }, '⏸'), titleEl, h('span', { class: 'spacer' }), progEl, misEl);
  const setMis = () => { misEl.textContent = mistakes ? `실수 ${mistakes}` : '실수 0'; };
  setMis();

  const ctx = {
    say(text, mood = 'talk') {
      bubble.className = 'bubble ' + mood;
      bubble.innerHTML = '';
      bubble.append(...[].concat(text).map((t) => (typeof t === 'string' ? h('span', {}, t) : t)));
      bubble.classList.remove('pop'); void bubble.offsetWidth; bubble.classList.add('pop');
    },
    mistake(text) { mistakes++; setMis(); sfx('no'); ctx.say(text, 'sad'); misEl.classList.remove('shake'); void misEl.offsetWidth; misEl.classList.add('shake'); },
    good(text) { sfx('ok'); ctx.say(text, 'happy'); },
    sfx,
    h,
    alive: () => current === token,
    cleanup(fn) { cleanups.push(fn); },
    finish(text, note) {
      if (note) notes.push(note);
      sfx('clear');
      return new Promise((res) => {
        const ov = h('div', { class: 'overlay soft' }, h('div', { class: 'card done-card' },
          h('h3', {}, '작업 완료! 📦'),
          h('p', {}, text),
          note ? h('p', { class: 'note' }, '📒 ', note) : null,
          h('div', { class: 'row end' }, h('button', { class: 'btn', onclick: () => { sfx('click'); ov.remove(); res(); } }, '다음 ▶'))));
        play.append(ov);
      });
    },
  };

  for (let i = 0; i < day.levels.length; i++) {
    if (current !== token) return;
    const lv = day.levels[i];
    titleEl.textContent = `${DAYS.indexOf(day) + 1}일차 · ${lv.title || day.title}`;
    progEl.textContent = `${i + 1} / ${day.levels.length}`;
    runCleanups();
    stage.innerHTML = '';
    stage.className = 'stage st-' + lv.type;
    ctx.say(lv.say || '시작해 볼까요?');
    try {
      stage.append(h('p', { class: 'muted loading' }, '작업장 준비 중…'));
      let mod;
      try { mod = await STATIONS[lv.type](); } catch (e) {
        stage.innerHTML = '';
        stage.append(h('div', { class: 'card' }, h('p', {}, '작업장을 불러오지 못했어요. 인터넷 연결을 확인하고 다시 열어 주세요.'), h('button', { class: 'btn', onclick: () => location.reload() }, '다시 열기')));
        return;
      }
      if (current !== token) return;
      stage.innerHTML = '';
      await mod.default(stage, lv, ctx);
    } catch (err) {
      if (current !== token) return;
      console.error(err);
      throw err;
    }
  }
  if (current !== token) return;
  const stars = mistakes <= 1 ? 3 : mistakes <= 4 ? 2 : 1;
  save.stars[day.id] = Math.max(save.stars[day.id] || 0, stars);
  store();
  showResult(day, stars, mistakes, notes);
}

function showResult(day, stars, mistakes, notes) {
  current = null; runCleanups();
  app.innerHTML = '';
  const idx = DAYS.indexOf(day);
  const next = DAYS[idx + 1];
  app.append(h('div', { class: 'screen result' },
    h('div', { class: 'card big-card' },
      h('p', { class: 'kicker' }, `${idx + 1}일차 근무 끝`),
      h('h2', {}, day.title),
      h('p', { class: 'big-stars' }, '★'.repeat(stars) + '☆'.repeat(3 - stars)),
      h('p', { class: 'muted' }, `실수 ${mistakes}번`),
      h('div', { class: 'notes' }, h('h3', {}, '📒 오늘의 작업 노트'), h('ul', {}, ...[...new Set(notes)].map((n) => h('li', {}, n)))),
      h('div', { class: 'row end wrap' },
        h('button', { class: 'btn ghost', onclick: () => { sfx('click'); playDay(day); } }, '다시 하기'),
        h('button', { class: 'btn ghost', onclick: () => { sfx('click'); showMap(); } }, '근무표'),
        next ? h('button', { class: 'btn', onclick: () => { sfx('click'); showIntro(next); } }, `${idx + 2}일차로 ▶`) : null)),
    creditLine()));
}

function pauseMenu(day) {
  const ov = h('div', { class: 'overlay' },
    h('div', { class: 'card pause' },
      h('h2', {}, '잠깐 쉬기'),
      h('div', { class: 'col' },
        h('button', { class: 'btn', onclick: () => { sfx('click'); ov.remove(); } }, '계속하기'),
        h('button', { class: 'btn ghost', onclick: () => { sfx('click'); ov.remove(); current = null; playDay(day); } }, '이 날 처음부터'),
        h('button', { class: 'btn ghost', onclick: () => { sfx('click'); ov.remove(); current = null; showMap(); } }, '근무표로'),
        soundBtn()),
      creditLine()));
  document.querySelector('.play').append(ov);
}

window.__factory = { DAYS, playDay, showMap, showTitle, save };
showTitle();
setTimeout(() => Object.values(STATIONS).forEach((f) => f().catch(() => {})), 800);
