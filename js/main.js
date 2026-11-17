// 로봇 상자 공장 — 택배 주문을 받아 상자를 만들고 트럭에 실어 보내는 경영 게임
import { ITEMS, CUSTOMERS, COST, dayConfig, UPGRADES, payFor } from './data.js';

// 게임 버전은 index.html의 window.BUILD 하나에서 고친다(+0.001). 파일 캐시 갱신에도 같은 값을 쓴다.
export const VERSION = window.BUILD || 'v1.011';

// 3D·전개도 모듈은 근무를 시작할 때 불러온다(시작 화면이 3D 라이브러리를 기다리지 않게)
let analyzeNet, Cutter, boxPicture, STATIONS;
const loadWork = () => Promise.all([import('./factory.js'), import('./net.js'), import('./cutter.js')]).then(([f, n, c]) => {
  analyzeNet = n.analyzeNet; Cutter = c.Cutter; boxPicture = c.boxPicture; STATIONS = f.STATIONS;
  return f.Factory;
});

// ---------- 저장 ----------
const SAVE_KEY = 'robot-box-factory-v2';
let save = { day: 1, money: 0, up: {}, dies: {}, best: {}, sound: true, char: 'm' };
try { save = { ...save, ...JSON.parse(localStorage.getItem(SAVE_KEY) || '{}') }; } catch (_) { /* 무시 */ }
if (save.up.helper) { delete save.up.helper; save.money += 6000; } // 없어진 업그레이드는 돈으로 돌려준다
function store() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (_) { /* 무시 */ } }

// ---------- 소리 ----------
const VOL = { click: 0.5, ok: 0.6, no: 0.5, thud: 0.7, tape: 0.7, fold: 0.6, robot: 0.35, clear: 0.6 };
function sfx(name) {
  if (!save.sound) return;
  try { const a = new Audio(`sounds/${name}.mp3`); a.volume = VOL[name] ?? 0.6; a.play().catch(() => {}); } catch (_) { /* 무시 */ }
}

// ---------- DOM ----------
function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
  return e;
}
const won = (n) => `${n < 0 ? '−' : ''}₩${Math.abs(Math.round(n)).toLocaleString('ko-KR')}`;
const app = document.getElementById('app');
let cleanup = null;
function leave() { if (cleanup) { const f = cleanup; cleanup = null; f(); } app.innerHTML = ''; }

function creditLine() {
  return h('p', { class: 'credit-line' }, `Created by gamtudyssam using AI · ${VERSION} · `,
    h('a', { href: 'credits.html', target: '_blank', rel: 'noopener' }, '출처와 라이선스'));
}
function soundBtn() {
  const b = h('button', { class: 'btn ghost small', onclick: () => { save.sound = !save.sound; store(); b.textContent = save.sound ? '🔊 소리 켬' : '🔇 소리 끔'; sfx('click'); } }, save.sound ? '🔊 소리 켬' : '🔇 소리 끔');
  return b;
}
function stepper(value, min, max, onChange, unit = '') {
  let v = value;
  const num = h('span', { class: 'snum' }, `${v}${unit}`);
  const set = (n) => { v = Math.max(min, Math.min(max, n)); num.textContent = `${v}${unit}`; onChange(v); sfx('click'); };
  return h('span', { class: 'stepper' }, h('button', { class: 'sbtn', onclick: () => set(v - 1) }, '−'), num, h('button', { class: 'sbtn', onclick: () => set(v + 1) }, '+'));
}

// ---------- 시작 화면 ----------
function showTitle() {
  leave();
  const chips = h('div', { class: 'row center wrap' });
  for (let d = 1; d <= save.day; d++) {
    chips.append(h('button', { class: 'chip' + (d === save.day ? ' now' : ''), onclick: () => { sfx('click'); showIntro(d); } }, `${d}일차 ${'★'.repeat(save.best[d] || 0)}`));
  }
  const charBtns = h('div', { class: 'row center' });
  const drawChar = () => {
    charBtns.innerHTML = '';
    [['m', '👷‍♂️', '남자 기사'], ['f', '👷‍♀️', '여자 기사']].forEach(([id, em, name]) => {
      charBtns.append(h('button', { class: 'charbtn' + (save.char === id ? ' sel' : ''), onclick: () => { save.char = id; store(); sfx('click'); drawChar(); } }, h('span', { class: 'cem' }, em), name));
    });
  };
  drawChar();
  app.append(h('div', { class: 'screen title' },
    h('div', { class: 'title-box' },
      h('p', { class: 'kicker' }, '5학년 2학기 · 5. 직육면체'),
      h('h1', {}, '로봇 상자 공장'),
      h('p', { class: 'lead' }, '택배 주문이 밀려들어요! 골판지로 상자를 만들어', h('br'), '물건을 담고 트럭이 떠나기 전에 출고해요.'),
      h('img', { class: 'hero', src: 'img/robot.webp', alt: '공장 로봇 팔 박스봇' }),
      h('p', { class: 'muted', style: 'margin:0 0 4px' }, '내 캐릭터'),
      charBtns,
      h('div', { class: 'row center wrap', style: 'margin-top:12px' },
        h('button', { class: 'btn big', onclick: () => { sfx('click'); showIntro(save.day); } }, `${save.day}일차 출근하기`),
        h('button', { class: 'btn big ghost', onclick: () => { sfx('click'); showShop(); } }, '🛒 상점')),
      h('p', { class: 'muted', style: 'margin:10px 0 4px' }, `모은 돈 ${won(save.money)}`),
      save.day > 1 ? chips : null),
    creditLine()));
}

// ---------- 상점 ----------
function showShop(after) {
  leave();
  const list = h('div', { class: 'shop' });
  const moneyEl = h('b', {}, won(save.money));
  const draw = () => {
    list.innerHTML = '';
    moneyEl.textContent = won(save.money);
    UPGRADES.forEach((u) => {
      const owned = !!save.up[u.id];
      list.append(h('div', { class: 'shop-item' + (owned ? ' owned' : '') },
        h('span', { class: 'sicon' }, u.icon),
        h('div', { class: 'sbody' }, h('b', {}, u.name), h('p', {}, u.desc)),
        owned ? h('span', { class: 'tag' }, '보유') :
          h('button', { class: 'btn', disabled: save.money < u.price ? true : null, onclick: () => { save.money -= u.price; save.up[u.id] = true; store(); sfx('ok'); draw(); } }, won(u.price))));
    });
  };
  draw();
  app.append(h('div', { class: 'screen shop-screen' },
    h('div', { class: 'topline' }, h('button', { class: 'btn ghost', onclick: () => { sfx('click'); (after || showTitle)(); } }, '← 돌아가기'), h('h2', {}, '🛒 공장 상점'), h('span', { class: 'pill' }, '💰 ', moneyEl)),
    h('p', { class: 'muted center' }, '택배로 번 돈으로 공장을 업그레이드해요.'),
    list, creditLine()));
}

// ---------- 하루 시작 ----------
function showIntro(n) {
  const cfg = dayConfig(n);
  const sec = cfg.time + (save.up.truck ? 30 : 0);
  const ov = h('div', { class: 'overlay' }, h('div', { class: 'card intro' },
    h('div', { class: 'intro-head' }, h('img', { src: 'img/robot.webp', alt: '' }), h('div', {}, h('p', { class: 'kicker' }, `${n}일차`), h('h2', {}, cfg.title))),
    ...cfg.intro.map((t) => h('p', { class: 'say' }, t)),
    h('p', { class: 'goal' }, `🎯 목표 매출 ${won(cfg.target)} · 🚚 트럭 출발까지 ${Math.floor(sec / 60)}분${sec % 60 ? ` ${sec % 60}초` : ''}`),
    h('div', { class: 'row end' },
      h('button', { class: 'btn ghost', onclick: () => { sfx('click'); ov.remove(); } }, '닫기'),
      h('button', { class: 'btn', onclick: () => { sfx('click'); ov.remove(); playDay(n); } }, '근무 시작!'))));
  app.append(ov);
}

// ---------- 근무 ----------
async function playDay(n) {
  leave();
  app.append(h('div', { class: 'screen title' }, h('p', { class: 'lead' }, '공장 문을 여는 중…')));
  const Factory = await loadWork().catch(() => null);
  app.innerHTML = '';
  if (!Factory) { app.append(h('div', { class: 'screen title' }, h('div', { class: 'card' }, h('p', {}, '공장을 불러오지 못했어요. 인터넷 연결을 확인하고 다시 열어 주세요.'), h('button', { class: 'btn', onclick: () => location.reload() }, '다시 열기')))); return; }
  const cfg = dayConfig(n);
  const gl = h('div', { class: 'gl-wrap' });
  const hud = h('header', { class: 'hud' });
  const leftCol = h('div', { class: 'leftcol' });
  const orderPin = h('div', { class: 'orderpin hidden' });
  const tickets = h('div', { class: 'tickets' });
  leftCol.append(orderPin, tickets);
  const side = h('aside', { class: 'side' });
  const bubble = h('div', { class: 'bubble' });
  const robot = h('div', { class: 'robot' }, h('img', { src: 'img/robot.webp', alt: '박스봇' }), bubble);
  const nav = h('nav', { class: 'navbar' });
  const cutWrap = h('div', { class: 'cutter hidden' });
  const panel = h('div', { class: 'stpanel hidden' });
  const fx = h('div', { class: 'fx' });
  const rollBtn = (dir, label, aria) => h('button', { class: 'rbtn r-' + dir, 'aria-label': aria, onclick: () => { if (F.rolling) return; sfx('thud'); F.roll(dir); } }, label);
  const rollPad = h('div', { class: 'rollpad hidden' },
    rollBtn('up', '▲', '상자를 멀리 굴리기'), rollBtn('left', '◀', '상자를 왼쪽으로 굴리기'),
    h('span', { class: 'rmid' }, '상자', h('br'), '굴리기'),
    rollBtn('right', '▶', '상자를 오른쪽으로 굴리기'), rollBtn('down', '▼', '상자를 앞으로 굴리기'));
  const root = h('div', { class: 'screen play' }, gl, hud, leftCol, side, cutWrap, panel, rollPad, robot, nav, fx);
  app.append(root);
  const F = new Factory(gl, { character: save.char, walkSpeed: save.up.shoes ? 3.5 : 2.2 });
  F.view('follow');

  // 상태
  let timeLeft = cfg.time + (save.up.truck ? 30 : 0);
  const total = timeLeft;
  let earned = 0, done = 0, missed = 0, paused = false, over = false;
  let orders = [], active = null, spawnIn = 2, orderSeq = 0;
  let where = 'bench', place = 'walk'; // place: walk | cut | work | station | busy
  const inv = { tape: {}, base: 0, side: 0, guard: 0 };
  let tool = null;

  const say = (t, mood = 'talk') => { bubble.className = 'bubble ' + mood; bubble.textContent = t; bubble.classList.remove('pop'); void bubble.offsetWidth; bubble.classList.add('pop'); };
  const money = (v, why) => {
    earned += v; save.money = Math.max(0, save.money + v); store();
    const f = h('div', { class: 'float ' + (v >= 0 ? 'plus' : 'minus') }, `${v >= 0 ? '+' : '−'}${won(Math.abs(v))}${why ? ' ' + why : ''}`);
    fx.append(f); setTimeout(() => f.remove(), 1800);
    drawHud();
  };
  const oops = (t, cost) => { sfx('no'); say(t, 'sad'); if (active) active.mistakes++; if (cost) money(-cost); };

  // ---------- HUD ----------
  const timeBar = h('div', { class: 'tbar' }, h('i'));
  const timeTxt = h('span', { class: 'ttxt' });
  const earnEl = h('span', { class: 'pill' });
  const doneEl = h('span', { class: 'pill' });
  hud.append(h('button', { class: 'btn ghost small', 'aria-label': '일시정지', onclick: () => { sfx('click'); pause(); } }, '⏸'),
    h('span', { class: 'pill day' }, `${n}일차`), h('div', { class: 'timer' }, h('span', {}, '🚚'), timeBar, timeTxt), earnEl, doneEl);
  function drawHud() {
    timeBar.firstChild.style.width = `${Math.max(0, timeLeft / total) * 100}%`;
    timeBar.classList.toggle('hurry', timeLeft < 30);
    const t = Math.max(0, timeLeft);
    timeTxt.textContent = `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
    earnEl.textContent = `💰 ${won(earned)} / ${won(cfg.target)}`;
    doneEl.textContent = `📦 ${done}`;
  }

  // ---------- 가는 곳 ----------
  const navBtns = {};
  ['bench', 'tape', 'sticker', 'guard'].forEach((id) => {
    navBtns[id] = h('button', { class: 'navbtn', onclick: () => { sfx('click'); goTo(id); } }, h('span', { class: 'nicon' }, STATIONS[id].icon), h('span', {}, STATIONS[id].name));
    nav.append(navBtns[id]);
  });
  function markNav() { Object.entries(navBtns).forEach(([id, b]) => b.classList.toggle('here', id === where && place !== 'walk')); }

  function closeAll() {
    root.classList.remove('cutting');
    cutWrap.classList.add('hidden'); panel.classList.add('hidden'); rollPad.classList.add('hidden');
    F.mode = 'walk'; F.allowRotate = false; F.pickables = [];
  }
  async function goTo(id) {
    if (over || place === 'busy') return;
    closeAll();
    place = 'walk'; where = id; markNav();
    F.view('follow');
    setSideIdle();
    const ok = await F.goStation(id);
    if (!ok || over || where !== id || place !== 'walk') return;
    arrive(id);
  }
  async function walkFloor(x, z) {
    if (place === 'busy') return;
    closeAll();
    place = 'walk'; where = null; markNav();
    F.view('follow');
    setSideIdle();
    await F.walkTo(x, z);
  }
  function arrive(id) {
    sfx('click');
    if (id === 'bench') enterBench();
    else openStation(id);
    markNav();
  }
  F.onTap = (hit) => {
    if (!hit || over || paused) return;
    if (F.mode === 'walk') {
      if (hit.type === 'station') goTo(hit.id);
      else if (hit.type === 'floor') walkFloor(hit.x, hit.z);
      return;
    }
    if (place === 'work') useTool(hit);
  };

  // ---------- 주문 ----------
  function spawn() {
    const first = n === 1 && orderSeq === 0;
    const key = first ? 'puzzle' : cfg.items[Math.floor(Math.random() * cfg.items.length)];
    const item = ITEMS[key];
    orders.push({ id: ++orderSeq, item, cust: CUSTOMERS[Math.floor(Math.random() * CUSTOMERS.length)], pay: payFor(item), patience: cfg.patience, left: cfg.patience, mistakes: 0 });
    sfx('click');
    drawTickets();
  }
  const emptyTicket = h('div', { class: 'ticket empty' }, '주문을 기다리는 중…');
  function drawTickets() {
    for (const el of [...tickets.children]) if (el !== emptyTicket && !orders.some((o) => o.el === el && o !== active)) el.remove();
    orders.forEach((o) => {
      if (o === active) return;
      if (!o.el) {
        o.bar = h('i');
        o.el = h('button', { class: 'ticket', onclick: () => pickOrder(o) },
          h('span', { class: 'temoji' }, o.item.emoji),
          h('span', { class: 'tbody' }, h('b', {}, o.item.name), h('small', {}, `가로 ${o.item.d[0]} · 세로 ${o.item.d[2]} · 높이 ${o.item.d[1]}`), h('small', { class: 'pay' }, won(o.pay) + (o.item.fragile ? ' · 🛡' : ''))),
          h('span', { class: 'pat' }, o.bar));
      }
      if (!o.el.isConnected) tickets.append(o.el);
      o.el.classList.toggle('angry', o.left < o.patience * 0.3);
      o.bar.style.width = `${Math.max(0, o.left / o.patience) * 100}%`;
    });
    const waiting = orders.filter((o) => o !== active).length;
    if (!waiting) { if (!emptyTicket.isConnected) tickets.append(emptyTicket); } else emptyTicket.remove();
    if (active && active.pinBar) active.pinBar.style.width = `${Math.max(0, active.left / active.patience) * 100}%`;
  }
  function pinOrder(o) {
    orderPin.innerHTML = '';
    if (!o) { orderPin.classList.add('hidden'); return; }
    o.pinBar = h('i');
    orderPin.append(...[
      h('div', { class: 'row' }, h('span', { class: 'temoji big' }, o.item.emoji), h('div', { class: 'pname' }, h('b', {}, o.item.name), h('small', {}, o.cust)), h('span', { class: 'pay' }, won(o.pay))),
      boxPicture(o.item.d, 210),
      o.item.fragile ? h('p', { class: 'fragile' }, '🛡 깨지기 쉬워요! 꼭짓점 8개마다 꼭짓점 보호대') : null,
      h('span', { class: 'pat' }, o.pinBar)].filter(Boolean));
    orderPin.classList.remove('hidden');
  }
  function pickOrder(o) {
    if (over || paused) return;
    if (active) { say('지금 주문을 먼저 끝내요. 출고하면 다음 주문을 받을 수 있어요.'); return; }
    sfx('click');
    active = o;
    o.phase = 'cut';
    o.taped = new Set(); o.guarded = new Set(); o.baseS = new Set(); o.sideS = new Set();
    if (o.el) o.el.remove();
    pinOrder(o);
    drawTickets();
    F.showItem(o.item);
    say(`${o.item.name} 주문! 작업대로 가서 골판지를 재단해요.`);
    goTo('bench');
  }

  // ---------- 작업대 ----------
  function enterBench() {
    if (!active) { place = 'walk'; F.view('follow'); setSideIdle(); say('먼저 왼쪽 주문 쪽지를 골라요.'); return; }
    if (active.phase === 'cut') openCutter();
    else if (active.phase === 'packing') enterWork();
  }

  let cutter = null;
  function openCutter(keep) {
    place = 'cut';
    F.mode = 'busy';
    F.view('table');
    const o = active;
    cutWrap.classList.remove('hidden');
    root.classList.add('cutting');
    cutWrap.innerHTML = '';
    const dieKey = [...o.item.d].sort((a, b) => a - b).join('x');
    const hasDie = save.up.die && save.dies[dieKey];
    cutWrap.append(h('div', { class: 'ctools' },
      h('span', { class: 'ctitle' }, '✂️ 재단기 · 손가락으로 끌어서 면을 그려요'),
      hasDie ? h('button', { class: 'btn ghost small', onclick: () => { sfx('click'); cutter.set(save.dies[dieKey]); say('금형으로 한 번에 그렸어요!'); } }, '🗂 금형') : null,
      h('button', { class: 'btn ghost small', onclick: () => { sfx('click'); cutter.set([]); } }, '모두 지우기'),
      h('button', { class: 'btn warn', onclick: doCut }, '✂️ 재단하고 접기')));
    const host = h('div', { class: 'sheet-host' });
    cutWrap.append(host);
    cutter = new Cutter(host, {
      onChange: (k, r) => {
        if (k === 'overlap') say('다른 면과 겹치게 그릴 수 없어요.');
        else if (k === 'add') { sfx('click'); say(`${r.w === r.h ? `한 변이 ${r.w}cm인 정사각형` : `가로 ${r.w}cm, 세로 ${r.h}cm인 직사각형`} 면을 그렸어요. 그린 면을 한 번 누르면 지워져요.`); }
        else sfx('click');
      },
    });
    if (keep) cutter.set(keep);
    setSide(h('p', { class: 'hint' }, `주문서의 ${new Set(o.item.d).size === 1 ? '정육면체' : '직육면체'}와 크기가 같은 전개도를 그려요. 잘리지 않은 모서리는 점선, 잘린 모서리는 실선으로 나타나요.`), invView());
    if (keep) return;
    if (o.item === ITEMS.puzzle && n === 1 && done === 0) say('큐브 퍼즐은 가로·세로·높이가 모두 2cm인 정육면체에 넣어요. 한 변이 2cm인 정사각형 6개로 정육면체의 전개도를 그려 봐요!');
    else say(`가로 ${o.item.d[0]}cm, 세로 ${o.item.d[2]}cm, 높이 ${o.item.d[1]}cm인 ${new Set(o.item.d).size === 1 ? '정육면체' : '직육면체'}의 전개도를 그려요.`);
  }

  async function doCut() {
    if (place !== 'cut' || !active) return;
    const rects = cutter.rects.map((r) => ({ ...r }));
    if (!rects.length) { say('먼저 골판지에 면을 그려요.'); return; }
    const A = analyzeNet(rects, active.item.d);
    if (A.problem === 'apart') {
      cutter.red = new Set(A.apart); cutter.draw();
      oops('빨간 면이 떨어져 있어요! 전개도의 면은 길이가 같은 모서리끼리 이어져 있어야 접을 수 있어요.');
      return;
    }
    place = 'busy';
    sfx('fold');
    cutWrap.classList.add('hidden');
    root.classList.remove('cutting');
    F.buildParcel(rects, A, active.item);
    F.view('pack');
    setSide(h('p', { class: 'hint' }, '골판지를 접는 중…'));
    const fast = save.up.fast ? 0.5 : 1;
    const good = A.valid && !A.problem;
    say(good ? '밑면과 평행한 면 하나만 열어 두고 접어요!' : '접어 볼게요…');
    await F.fold(1500 * fast, good);
    if (!active || over) return;
    if (good) {
      say(F.itemFits ? `${active.item.name}을(를) 상자에 쏙!` : '어? 물건이 안 들어가요!');
      sfx('robot');
      await F.dropItem();
      if (!active || over) return;
    }
    let fail = null;
    if (A.problem === 'overlap') { F.tintFaces([...new Set(A.overlaps.flat())], 0xff8a7a); fail = '빨간 면끼리 겹쳐요! 접었을 때 겹치는 면이 있으면 직육면체의 전개도가 될 수 없어요.'; }
    else if (A.problem === 'hole') fail = `면이 ${A.n}개뿐이라 빈 곳이 생겼어요. 직육면체는 면이 6개예요.`;
    else if (A.problem === 'extra') fail = `면이 ${A.n}개라 남는 면이 생겼어요. 직육면체의 면은 6개예요.`;
    else if (A.problem === 'misfit') { F.tintFaces(A.misfit, 0xff8a7a); fail = '빨간 면이 맞지 않아요! 직육면체에서 서로 평행한 면은 모양과 크기가 같고, 접었을 때 겹치는 모서리는 길이가 같아야 해요.'; }
    else if (!F.itemFits) fail = `직육면체가 작아서 ${active.item.name}이(가) 안 들어가요! 접어 보니 가로 ${A.dims[0]}cm, 세로 ${A.dims[2]}cm, 높이 ${A.dims[1]}cm예요. 주문서의 길이와 비교해요.`;
    if (fail) {
      oops(fail + ' (골판지 버림)', 300);
      place = 'cut';
      setSide(h('button', { class: 'btn big', onclick: () => { sfx('click'); F.clearWork(); F.showItem(active.item); openCutter(rects); } }, '다시 재단하기'), invView());
      return;
    }
    sfx('fold');
    await F.closeLid(900 * fast);
    if (!active || over) return;
    if (save.up.die) { save.dies[[...active.item.d].sort((a, b) => a - b).join('x')] = rects; store(); }
    active.loose = F.itemLoose;
    active.phase = 'packing';
    if (F.itemLoose) say('직육면체는 만들어졌는데 물건보다 커서 흔들려요. 완충재 값이 들어요.', 'sad');
    await new Promise((r) => setTimeout(r, 900));
    if (!active || over) return;
    say('앗! 작업대에 내려놓다가 상자가 데굴 굴렀어요! 물건을 올려 두었던 밑면에 파란 "밑면" 도장이 있어요. 어디로 갔는지 찾아봐요.', 'sad');
    sfx('thud');
    await F.tumble(Math.floor(Math.random() * 5));
    if (!active || over) return;
    F.setupPacking();
    enterWork();
  }

  // ---------- 포장 (작업대에서 재료 붙이기) ----------
  function enterWork() {
    place = 'work';
    F.mode = 'work';
    F.allowRotate = true;
    F.view('work');
    rollPad.classList.remove('hidden');
    F.setTool(tool);
    drawWorkSide();
    if (!tool) say('오른쪽에서 도구를 고르고 상자를 눌러 붙여요. 재료가 없으면 기계에 가서 만들어 와요.');
  }

  function invView() {
    const tapes = Object.entries(inv.tape).filter(([, c]) => c > 0).map(([l, c]) => `${l}cm×${c}`);
    return h('div', { class: 'inv' }, h('b', {}, '🎒 들고 있는 재료'),
      h('p', {}, `🩹 테이프 ${tapes.length ? tapes.join(', ') : '없음'}`),
      h('p', {}, `📦 밑면 스티커 ${inv.base}장 · 🏷 옆면 스티커 ${inv.side}장 · 🛡 보호대 ${inv.guard}개`));
  }

  function drawWorkSide() {
    if (place !== 'work') return;
    const o = active;
    const tapeCount = Object.values(inv.tape).reduce((a, b) => a + b, 0);
    const tb = (id, label, count) => h('button', { class: 'tool' + (tool === id ? ' sel' : ''), onclick: () => { tool = id; F.setTool(id); sfx('click'); drawWorkSide(); hintTool(); } }, label, h('small', {}, count));
    setSide(
      h('div', { class: 'tools' },
        tb('tape', '🩹 테이프', `${tapeCount}줄`),
        tb('guard', '🛡 보호대', `${inv.guard}개`),
        tb('base', '📦 밑면 스티커', `${inv.base}장`),
        tb('side', '🏷 옆면 스티커', `${inv.side}장`)),
      h('button', { class: 'btn big warn', onclick: tryShip }, '📦 포장 끝! 출고'),
      h('p', { class: 'done-count' }, `붙인 것: 테이프 ${o.taped.size}줄 · 보호대 ${o.guarded.size}개 · 밑면 ${o.baseS.size}장 · 옆면 ${o.sideS.size}장`),
      invView(),
      h('p', { class: 'hint' }, '👆 화면을 끌면 둘러보고, ◀ ▶ ▲ ▼로 상자를 굴려요.'));
  }

  function hintTool() {
    if (tool === 'tape') say('테이프를 붙일 모서리를 눌러요. 모서리는 면과 면이 만나는 선분이에요. 그 모서리의 길이와 같은 테이프가 필요해요.');
    else if (tool === 'guard') say('보호대를 끼울 꼭짓점을 눌러요. 꼭짓점은 모서리와 모서리가 만나는 점이에요.');
    else if (tool === 'base') say('밑면 스티커(쌓는 면)는 밑면에 붙여요. 창고에서는 밑면끼리 맞닿게 상자를 쌓아요. 직육면체에서 서로 평행한 두 면이 밑면이에요. 파란 "밑면" 도장이 찍힌 면과, 그 면과 평행한 면을 찾아요.');
    else if (tool === 'side') say('옆면 스티커는 옆면에 붙여요. 옆면은 밑면과 만나는 면이고, 밑면과 수직이에요.');
  }

  function useTool(hit) {
    const o = active;
    if (!o || o.phase !== 'packing') return;
    if (!tool) { say('먼저 오른쪽에서 도구를 골라요.'); return; }
    if (tool === 'tape' && hit.type === 'edge') {
      const e = hit.edge;
      if (o.taped.has(e.id)) { say('이 모서리는 벌써 붙였어요.'); return; }
      if (!inv.tape[e.len]) {
        const have = Object.keys(inv.tape).filter((l) => inv.tape[l] > 0);
        say(have.length ? `이 모서리는 ${e.len}cm예요. ${e.len}cm 테이프가 없어요. 테이프 출력기에서 뽑아 와요.` : '테이프가 없어요. 테이프 출력기에 가서 길이와 개수를 넣고 뽑아 와요.', 'sad');
        sfx('no');
        return;
      }
      inv.tape[e.len]--;
      o.taped.add(e.id); F.addTape(e); sfx('tape');
    } else if (tool === 'guard' && hit.type === 'corner') {
      if (!o.item.fragile) { say('이 물건은 깨지지 않아서 보호대가 필요 없어요.'); return; }
      if (o.guarded.has(hit.id)) { say('이 꼭짓점에는 벌써 끼웠어요.'); return; }
      if (inv.guard <= 0) { say('보호대가 없어요. 보호대 선반에서 가져와요.', 'sad'); sfx('no'); return; }
      inv.guard--; o.guarded.add(hit.id); F.addGuard(hit); sfx('click');
    } else if ((tool === 'base' || tool === 'side') && hit.type === 'face') {
      const isBase = hit.role === 'base' || hit.role === 'base2';
      const want = tool === 'base';
      const set = want ? o.baseS : o.sideS;
      if (o.baseS.has(hit.id) || o.sideS.has(hit.id)) { say('그 면에는 벌써 스티커가 있어요.'); return; }
      if ((want ? inv.base : inv.side) <= 0) { say(`${want ? '밑면' : '옆면'} 스티커가 없어요. 스티커 제작기에서 만들어 와요.`, 'sad'); sfx('no'); return; }
      if (want) inv.base--; else inv.side--;
      if (want !== isBase) {
        oops(want ? '이 면은 밑면과 수직인 옆면이에요! 밑면은 파란 도장이 찍힌 면과, 그 면과 평행한 면이에요. (스티커 버림)' : '이 면은 밑면이에요! 옆면은 밑면과 만나는 면으로, 밑면과 수직이에요. (스티커 버림)', 0);
        drawWorkSide();
        return;
      }
      set.add(hit.id);
      F.addSticker(hit, want ? 'stack' : 'care', o.cust); sfx('tape');
    } else return;
    drawWorkSide();
  }

  function tryShip() {
    const o = active;
    if (!o || place !== 'work') return;
    sfx('click');
    const miss = [];
    if (o.taped.size < 12) miss.push('테이프가 안 붙은 모서리');
    if (o.item.fragile && o.guarded.size < 8) miss.push('보호대가 없는 꼭짓점');
    if (o.baseS.size < 2) miss.push('스티커가 없는 밑면');
    if (o.sideS.size < 4) miss.push('스티커가 없는 옆면');
    if (miss.length) { oops(`검수 불합격! 아직 ${miss.join(', ')}이(가) 있어요. 직육면체의 면·모서리·꼭짓점이 모두 몇 개인지 생각하며 상자를 굴려 봐요.`, 0); return; }
    ship();
  }

  async function ship() {
    const o = active;
    place = 'busy';
    rollPad.classList.add('hidden');
    F.allowRotate = false; F.mode = 'busy'; F.pickables = [];
    setSide(h('p', { class: 'hint' }, '출고 중…'));
    sfx('robot');
    F.view('ship');
    await F.ship();
    if (over) return;
    let pay = o.pay;
    const fast = o.left / o.patience > 0.5;
    if (o.loose) pay = Math.round(pay * 0.7 / 100) * 100;
    if (fast) pay += Math.round(o.pay * (save.up.sign ? 0.3 : 0.2) / 100) * 100;
    done++;
    money(pay, fast ? '빠른 배송 팁!' : '');
    sfx('ok');
    say(o.mistakes === 0 ? `${o.cust}: "완벽한 상자예요! 고마워요!"` : `${o.cust}: "잘 받았어요!"`, 'happy');
    orders = orders.filter((x) => x !== o);
    active = null;
    pinOrder(null);
    F.clearWork();
    tool = null;
    place = 'walk'; where = 'bench'; F.mode = 'walk';
    F.view('follow');
    setSideIdle();
    drawTickets();
    markNav();
  }

  // ---------- 기계 ----------
  function stationDone(msg) {
    say(msg, 'happy');
    panel.classList.add('hidden'); place = 'walk'; markNav(); setSideIdle();
  }
  function openStation(id) {
    place = 'station';
    panel.innerHTML = '';
    panel.classList.remove('hidden');
    const close = h('button', { class: 'btn ghost small', onclick: () => { sfx('click'); panel.classList.add('hidden'); place = 'walk'; markNav(); } }, '닫기');
    if (id === 'tape') {
      const rows = [{ len: 2, cnt: 0 }, { len: 3, cnt: 0 }, { len: 4, cnt: 0 }];
      const sum = h('p', { class: 'sum' });
      const upd = () => { const L = rows.reduce((s, r) => s + r.len * r.cnt, 0), C = rows.reduce((s, r) => s + r.cnt, 0); sum.textContent = `테이프 ${C}줄 · 모두 ${L}cm · 재료 값 ${won(L * COST.tape)}`; };
      panel.append(h('h3', {}, '🩹 테이프 출력기'), h('p', { class: 'hint' }, `직육면체의 모서리에 붙일 테이프의 길이와 개수를 넣으면 잘라서 나와요. 길이가 같은 모서리가 몇 개씩인지 세어 봐요. (1cm에 ${won(COST.tape)})`),
        ...rows.map((r) => h('div', { class: 'srow' }, h('span', {}, '길이'), stepper(r.len, 1, 9, (v) => { r.len = v; upd(); }, 'cm'), h('span', {}, '개수'), stepper(r.cnt, 0, 12, (v) => { r.cnt = v; upd(); }, '줄'))),
        sum,
        h('div', { class: 'row end' }, close, h('button', { class: 'btn warn', onclick: () => {
          const L = rows.reduce((s, r) => s + r.len * r.cnt, 0);
          if (!L) { say('개수를 넣어야 테이프가 나와요.'); return; }
          rows.forEach((r) => { if (r.cnt) inv.tape[r.len] = (inv.tape[r.len] || 0) + r.cnt; });
          money(-L * COST.tape, '테이프');
          sfx('tape');
          stationDone(`테이프 ${rows.filter((r) => r.cnt).map((r) => `${r.len}cm ${r.cnt}줄`).join(', ')}이 나왔어요!`);
        } }, '출력하기')));
      upd();
    } else if (id === 'sticker') {
      let b = 0, s = 0;
      const sum = h('p', { class: 'sum' });
      const upd = () => { sum.textContent = `재료 값 ${won((b + s) * COST.sticker)}`; };
      panel.append(h('h3', {}, '🏷 스티커 제작기'), h('p', { class: 'hint' }, `📦 밑면 스티커(쌓는 면)는 밑면마다, 🏷 옆면 스티커(취급주의)는 옆면마다 붙여요. 창고에서는 밑면끼리 맞닿게 상자를 쌓거든요. 밑면과 옆면은 각각 몇 개일까요? (1장에 ${won(COST.sticker)})`),
        h('div', { class: 'srow' }, h('span', {}, '📦 밑면 스티커'), stepper(0, 0, 12, (v) => { b = v; upd(); }, '장')),
        h('div', { class: 'srow' }, h('span', {}, '🏷 옆면 스티커'), stepper(0, 0, 12, (v) => { s = v; upd(); }, '장')),
        sum,
        h('div', { class: 'row end' }, close, h('button', { class: 'btn warn', onclick: () => {
          if (!b && !s) { say('몇 장 만들지 넣어요.'); return; }
          inv.base += b; inv.side += s;
          money(-(b + s) * COST.sticker, '스티커');
          sfx('click');
          stationDone(`밑면 스티커 ${b}장, 옆면 스티커 ${s}장을 만들었어요!`);
        } }, '만들기')));
      upd();
    } else if (id === 'guard') {
      let g = 0;
      const sum = h('p', { class: 'sum' });
      const upd = () => { sum.textContent = `재료 값 ${won(g * COST.guard)}`; };
      panel.append(h('h3', {}, '🛡 보호대 선반'), h('p', { class: 'hint' }, `깨지기 쉬운 물건이 든 직육면체에는 꼭짓점마다 꼭짓점 보호대를 끼워요. (1개에 ${won(COST.guard)})`),
        h('div', { class: 'srow' }, h('span', {}, '🛡 꼭짓점 보호대'), stepper(0, 0, 16, (v) => { g = v; upd(); }, '개')),
        sum,
        h('div', { class: 'row end' }, close, h('button', { class: 'btn warn', onclick: () => {
          if (!g) { say('몇 개 가져갈지 넣어요.'); return; }
          inv.guard += g;
          money(-g * COST.guard, '보호대');
          sfx('click');
          stationDone(`보호대 ${g}개를 챙겼어요!`);
        } }, '가져가기')));
      upd();
    }
    setSideIdle();
  }

  function setSide(...kids) { side.innerHTML = ''; side.append(...kids); }
  function setSideIdle() {
    if (place === 'work') { drawWorkSide(); return; }
    const o = active;
    const tip = !o ? '📋 왼쪽 주문 쪽지를 골라요. 손님이 너무 오래 기다리면 취소해요!'
      : o.phase === 'cut' ? '🧰 작업대로 가서 직육면체의 전개도를 재단해요.'
        : '🧰 재료를 챙겼으면 작업대로 가서 직육면체의 모서리·꼭짓점·면에 붙여요.';
    setSide(h('p', { class: 'hint' }, tip),
      h('p', { class: 'hint' }, '👆 바닥이나 기계를 톡 누르면 걸어가요. 아래 버튼으로도 갈 수 있어요.'),
      invView());
  }

  function cancelActive(reason) {
    if (!active) return;
    orders = orders.filter((x) => x !== active);
    active = null;
    pinOrder(null);
    closeAll();
    F.clearWork();
    place = 'walk'; tool = null;
    F.view('follow');
    setSideIdle();
    say(reason, 'sad');
  }

  // ---------- 시간 ----------
  let lastT = performance.now();
  const timer = setInterval(() => {
    const now = performance.now();
    const dt = Math.min(1, (now - lastT) / 1000);
    lastT = now;
    if (paused || over) return;
    timeLeft -= dt;
    spawnIn -= dt;
    if (spawnIn <= 0 && orders.length < 3 && timeLeft > 40) { spawn(); spawnIn = cfg.every; }
    for (const o of orders.slice()) {
      o.left -= dt * (o === active ? 0.5 : 1);
      if (o.left <= 0) {
        missed++;
        sfx('no');
        if (o === active) cancelActive(`${o.cust} 손님이 너무 오래 기다려서 주문을 취소했어요…`);
        else { orders = orders.filter((x) => x !== o); say(`${o.cust} 손님이 기다리다 돌아갔어요. 주문 쪽지를 빨리 골라요!`, 'sad'); }
      }
    }
    drawTickets();
    drawHud();
    if (timeLeft <= 0) endDay();
  }, 250);

  function pause() {
    if (over) return;
    paused = true;
    const ov = h('div', { class: 'overlay' }, h('div', { class: 'card pause' },
      h('h2', {}, '잠깐 쉬기'),
      h('div', { class: 'col' },
        h('button', { class: 'btn', onclick: () => { sfx('click'); ov.remove(); paused = false; lastT = performance.now(); } }, '계속하기'),
        h('button', { class: 'btn ghost', onclick: () => { sfx('click'); playDay(n); } }, '오늘 처음부터'),
        h('button', { class: 'btn ghost', onclick: () => { sfx('click'); showTitle(); } }, '처음 화면'),
        soundBtn()),
      creditLine()));
    root.append(ov);
  }

  async function endDay() {
    if (over) return;
    over = true;
    clearInterval(timer);
    closeAll();
    F.onTap = null;
    F.clearWork();
    F.view('ship');
    say('트럭이 출발해요! 부릉부릉~');
    sfx('robot');
    await F.truckLeave();
    if (cleanup === null) return;
    const stars = earned >= cfg.target * 1.4 ? 3 : earned >= cfg.target ? 2 : earned >= cfg.target * 0.5 ? 1 : 0;
    const pass = stars >= 2;
    if (pass) save.day = Math.max(save.day, n + 1);
    save.best[n] = Math.max(save.best[n] || 0, stars);
    store();
    sfx(pass ? 'clear' : 'no');
    const left = Object.values(inv.tape).reduce((a, b) => a + b, 0) + inv.base + inv.side + inv.guard;
    root.append(h('div', { class: 'overlay' }, h('div', { class: 'card big-card' },
      h('p', { class: 'kicker' }, `${n}일차 근무 끝`),
      h('h2', {}, pass ? '목표 달성! 🎉' : '목표에 조금 모자라요'),
      h('p', { class: 'big-stars' }, '★'.repeat(stars) + '☆'.repeat(3 - stars)),
      h('ul', { class: 'stats' },
        h('li', {}, `오늘 매출 ${won(earned)} (목표 ${won(cfg.target)}, 재료 값 뺀 금액)`),
        h('li', {}, `보낸 상자 ${done}개 · 놓친 주문 ${missed}개`),
        left ? h('li', {}, `쓰지 못하고 남은 재료 ${left}개`) : null,
        h('li', {}, `모은 돈 ${won(save.money)}`)),
      h('div', { class: 'row end wrap' },
        h('button', { class: 'btn ghost', onclick: () => { sfx('click'); playDay(n); } }, '다시 하기'),
        h('button', { class: 'btn ghost', onclick: () => { sfx('click'); showShop(showTitle); } }, '🛒 상점'),
        pass ? h('button', { class: 'btn', onclick: () => { sfx('click'); showTitle(); showIntro(n + 1); } }, `${n + 1}일차로 ▶`) : null))));
  }

  cleanup = () => { over = true; clearInterval(timer); F.dispose(); };
  setSideIdle();
  drawHud();
  drawTickets();
  markNav();
  say(n === 1 ? '곧 첫 주문이 들어와요! 주문 쪽지가 오면 눌러요.' : '오늘도 힘내요! 주문 쪽지를 눌러 시작해요.');
  window.__game = { F, inv, get place() { return place; }, get active() { return active; }, get orders() { return orders; }, pick: pickOrder, get cutter() { return cutter; }, doCut, goTo, useTool, tryShip, endDay, setTime: (t) => { timeLeft = t; } };
}

window.__factory = { save, showTitle, playDay, showShop };
showTitle();
setTimeout(() => loadWork().catch(() => {}), 600);
