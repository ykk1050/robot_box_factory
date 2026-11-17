// 로봇 상자 공장 — 택배 주문을 받아 상자를 만들고 트럭에 실어 보내는 경영 게임
import { ITEMS, CUSTOMERS, dayConfig, UPGRADES, payFor } from './data.js';
import { analyzeNet } from './net.js';
import { Cutter, boxPicture } from './cutter.js';

export const VERSION = 'v1.003'; // 고칠 때마다 +0.001 (화면 아래 제작자 줄에 표시)

// ---------- 저장 ----------
const SAVE_KEY = 'robot-box-factory-v2';
let save = { day: 1, money: 0, up: {}, dies: {}, best: {}, sound: true };
try { save = { ...save, ...JSON.parse(localStorage.getItem(SAVE_KEY) || '{}') }; } catch (_) { /* 무시 */ }
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

// ---------- 시작 화면 ----------
function showTitle() {
  leave();
  const chips = h('div', { class: 'row center wrap' });
  for (let d = 1; d <= save.day; d++) {
    chips.append(h('button', { class: 'chip' + (d === save.day ? ' now' : ''), onclick: () => { sfx('click'); showIntro(d); } }, `${d}일차 ${'★'.repeat(save.best[d] || 0)}`));
  }
  app.append(h('div', { class: 'screen title' },
    h('div', { class: 'title-box' },
      h('p', { class: 'kicker' }, '5학년 2학기 · 5. 직육면체'),
      h('h1', {}, '로봇 상자 공장'),
      h('p', { class: 'lead' }, '택배 주문이 밀려들어요! 골판지로 상자를 만들어', h('br'), '물건을 담고 트럭이 떠나기 전에 출고해요.'),
      h('img', { class: 'hero', src: 'img/robot.webp', alt: '공장 로봇 팔 박스봇' }),
      h('div', { class: 'row center wrap' },
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
  const { Factory } = await import('./factory.js').catch(() => ({}));
  app.innerHTML = '';
  if (!Factory) { app.append(h('div', { class: 'screen title' }, h('div', { class: 'card' }, h('p', {}, '공장을 불러오지 못했어요. 인터넷 연결을 확인하고 다시 열어 주세요.'), h('button', { class: 'btn', onclick: () => location.reload() }, '다시 열기')))); return; }
  const cfg = dayConfig(n);
  const gl = h('div', { class: 'gl-wrap' });
  const hud = h('header', { class: 'hud' });
  const tickets = h('div', { class: 'tickets' });
  const side = h('aside', { class: 'side' });
  const bubble = h('div', { class: 'bubble' });
  const robot = h('footer', { class: 'robot' }, h('img', { src: 'img/robot.webp', alt: '박스봇' }), bubble);
  const cutWrap = h('div', { class: 'cutter hidden' });
  const fx = h('div', { class: 'fx' });
  const rollBtn = (dir, label, aria) => h('button', { class: 'rbtn r-' + dir, 'aria-label': aria, onclick: () => { if (F.rolling) return; sfx('thud'); F.roll(dir); } }, label);
  const rollPad = h('div', { class: 'rollpad hidden' },
    rollBtn('up', '▲', '상자를 멀리 굴리기'), rollBtn('left', '◀', '상자를 왼쪽으로 굴리기'),
    h('span', { class: 'rmid' }, '상자', h('br'), '굴리기'),
    rollBtn('right', '▶', '상자를 오른쪽으로 굴리기'), rollBtn('down', '▼', '상자를 앞으로 굴리기'));
  const root = h('div', { class: 'screen play' }, gl, hud, tickets, side, cutWrap, rollPad, robot, fx);
  app.append(root);
  const F = new Factory(gl);
  F.view('wide');

  // 상태
  let timeLeft = cfg.time + (save.up.truck ? 30 : 0);
  const total = timeLeft;
  let earned = 0, done = 0, missed = 0, paused = false, over = false;
  let orders = [], active = null, step = 'pick', spawnIn = 2, orderSeq = 0;

  const say = (t, mood = 'talk') => { bubble.className = 'bubble ' + mood; bubble.textContent = t; bubble.classList.remove('pop'); void bubble.offsetWidth; bubble.classList.add('pop'); };
  const money = (v, why) => {
    earned += v; save.money = Math.max(0, save.money + v); store();
    const f = h('div', { class: 'float ' + (v >= 0 ? 'plus' : 'minus') }, `${v >= 0 ? '+' : '−'}${won(Math.abs(v))}${why ? ' ' + why : ''}`);
    fx.append(f); setTimeout(() => f.remove(), 1800);
    drawHud();
  };
  const oops = (t, cost) => { sfx('no'); say(t, 'sad'); if (active) active.mistakes++; if (cost) money(-cost); };

  // HUD
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

  // 주문
  function spawn() {
    const first = n === 1 && orderSeq === 0;
    const key = first ? 'puzzle' : cfg.items[Math.floor(Math.random() * cfg.items.length)];
    const item = ITEMS[key];
    orders.push({ id: ++orderSeq, item, cust: CUSTOMERS[Math.floor(Math.random() * CUSTOMERS.length)], pay: payFor(item.d), patience: cfg.patience, left: cfg.patience, mistakes: 0 });
    sfx('click');
    drawTickets();
  }
  // 쪽지는 한 번만 만들고 그 뒤에는 막대·색만 바꾼다(누르는 도중 버튼이 바뀌지 않게)
  const emptyTicket = h('div', { class: 'ticket empty' }, '주문을 기다리는 중…');
  function drawTickets() {
    for (const el of [...tickets.children]) if (el !== emptyTicket && !orders.some((o) => o.el === el)) el.remove();
    orders.forEach((o) => {
      if (!o.el) {
        o.bar = h('i');
        o.el = h('button', { class: 'ticket', onclick: () => pickOrder(o) },
          h('span', { class: 'temoji' }, o.item.emoji),
          h('span', { class: 'tbody' }, h('b', {}, o.item.name), h('small', {}, `${o.item.d[0]}×${o.item.d[2]}×${o.item.d[1]} cm`), h('small', {}, o.cust), h('small', { class: 'pay' }, won(o.pay))),
          h('span', { class: 'pat' }, o.bar));
        tickets.append(o.el);
      }
      o.el.classList.toggle('active', o === active);
      o.el.classList.toggle('angry', o.left < o.patience * 0.3);
      o.bar.style.width = `${Math.max(0, o.left / o.patience) * 100}%`;
    });
    if (!orders.length) { if (!emptyTicket.isConnected) tickets.append(emptyTicket); } else emptyTicket.remove();
  }
  function pickOrder(o) {
    if (over || paused) return;
    if (active && active !== o) { say('지금 상자를 먼저 끝내요. 출고하면 다음 주문을 받을 수 있어요.'); return; }
    if (active) return;
    sfx('click');
    active = o;
    drawTickets();
    startCut();
  }

  // ---------- 단계 표시 ----------
  let cutter = null;
  function stepsBar(cur) {
    const names = [['cut', '✂️ 재단'], ['tape', '🩹 테이프'], ['label', '🏷 라벨'], ['ship', '🚚 출고']];
    const idx = names.findIndex((x) => x[0] === cur);
    return h('ol', { class: 'steps' }, ...names.map(([k, t], i) => h('li', { class: i < idx ? 'done' : i === idx ? 'now' : '' }, t)));
  }
  function orderCard(o) {
    return h('div', { class: 'ocard' }, h('div', { class: 'row' }, h('span', { class: 'temoji big' }, o.item.emoji), h('div', {}, h('b', {}, o.item.name), h('br'), h('small', {}, o.cust))), boxPicture(o.item.d, 190));
  }
  function setSide(...kids) { side.innerHTML = ''; side.append(...kids); }

  // ---------- 단계: 재단 ----------
  function startCut(keep) {
    step = 'cut';
    const o = active;
    F.onTap = null;
    F.clearWork();
    F.showItem(o.item);
    F.view('table');
    F.allowRotate = false;
    cutWrap.classList.remove('hidden');
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
        else if (k === 'add') { sfx('click'); say(`${r.w}×${r.h} 면을 그렸어요. 그린 면을 한 번 누르면 지워져요.`); }
        else sfx('click');
      },
    });
    if (keep) cutter.set(keep);
    setSide(stepsBar('cut'), orderCard(o),
      h('p', { class: 'hint' }, '물건과 딱 맞는 상자의 전개도를 그려요. 면끼리 맞닿은 곳은 접는 선(점선)이 돼요.'));
    if (keep) return;
    if (n === 1 && done === 0) say('큐브 퍼즐은 가로·세로·높이가 모두 2cm예요. 2×2 정사각형 면을 이어 붙여 상자 전개도를 그려 봐요!');
    else say(`${o.item.name} 주문! 가로 ${o.item.d[0]}, 세로 ${o.item.d[2]}, 높이 ${o.item.d[1]}cm 상자를 만들어요.`);
  }

  async function doCut() {
    if (step !== 'cut' || !active) return;
    const rects = cutter.rects.map((r) => ({ ...r }));
    if (!rects.length) { say('먼저 골판지에 면을 그려요.'); return; }
    const A = analyzeNet(rects, active.item.d);
    if (A.problem === 'apart') {
      cutter.red = new Set(A.apart); cutter.draw();
      oops('빨간 면이 떨어져 있어요! 이웃한 면과 같은 길이의 모서리로 딱 맞닿아야 접을 수 있어요.');
      return;
    }
    step = 'folding';
    sfx('fold');
    cutWrap.classList.add('hidden');
    F.buildParcel(rects, A, active.item);
    F.view('work');
    setSide(stepsBar('cut'), orderCard(active), h('p', { class: 'hint' }, '접는 중…'));
    say('물건을 밑면에 올리고 접어요!');
    await F.fold(save.up.fast ? 800 : 1700);
    if (!active || over) return;
    let fail = null;
    if (A.problem === 'overlap') { F.tintFaces([...new Set(A.overlaps.flat())], 0xff8a7a); fail = '빨간 면끼리 겹쳐요! 한쪽에는 면이 두 장, 다른 쪽에는 구멍이 생겼어요.'; }
    else if (A.problem === 'hole') fail = `면이 ${A.n}개뿐이라 구멍이 뚫렸어요. 상자는 면이 6개 있어야 닫혀요.`;
    else if (A.problem === 'extra') fail = `면이 ${A.n}개라 남는 면이 생겼어요. 상자의 면은 6개예요.`;
    else if (A.problem === 'misfit') { F.tintFaces(A.misfit, 0xff8a7a); fail = '틈이 벌어지거나 튀어나왔어요. 마주 보는 면은 크기가 같고, 맞닿는 모서리는 길이가 같아야 해요.'; }
    else if (!F.itemFits) fail = `상자가 작아서 ${active.item.name}이(가) 안 들어가요! 상자 크기 ${A.dims.join('×')}를 다시 확인해요.`;
    if (fail) {
      oops(fail + ' (골판지 버림)', 300);
      setSide(stepsBar('cut'), orderCard(active), h('button', { class: 'btn big', onclick: () => { sfx('click'); startCut(rects); } }, '다시 재단하기'));
      return;
    }
    if (save.up.die) { save.dies[[...active.item.d].sort((a, b) => a - b).join('x')] = rects; store(); }
    active.loose = F.itemLoose;
    sfx('ok');
    if (F.itemLoose) say('상자는 닫혔는데 물건보다 커서 흔들려요. 완충재 값이 들어요.', 'sad');
    else say('딱 맞게 접혔어요! 이제 테이프를 붙여요.', 'happy');
    startTape();
  }

  // ---------- 단계: 테이프 ----------
  function startTape() {
    step = 'tape';
    rollPad.classList.remove('hidden');
    const edges = F.setupTape();
    const seams = edges.filter((e) => !e.hinge);
    const taped = new Set();
    F.allowRotate = true;
    const cnt = h('b', {}, '0');
    setSide(stepsBar('tape'), orderCard(active),
      h('p', { class: 'hint' }, '잘라서 맞닿은 모서리는 벌어져 있어요. 그 모서리를 눌러 테이프를 붙여요. 접혀서 이어진 모서리는 붙일 필요가 없어요.'),
      h('p', { class: 'hint' }, '👆 화면을 끌면 둘러볼 수 있어요. 바닥에 닿은 쪽은 ◀ ▶ ▲ ▼ 버튼으로 상자를 굴려서 봐요.'),
      h('p', { class: 'big-num' }, '붙인 테이프 ', cnt, '줄'),
      h('button', { class: 'btn big', onclick: () => {
        sfx('click');
        const left = seams.filter((e) => !taped.has(e.id)).length;
        if (left) { oops('아직 벌어진 모서리가 있어요! 상자를 돌려서 뒤쪽과 아래쪽도 봐요.', 100); return; }
        F.pickables = [];
        say(`잘린 모서리 ${seams.length}곳을 모두 붙였어요! 모서리 12개 중 ${12 - seams.length}개는 접혀서 이어진 곳이었어요.`, 'happy');
        startTumble();
      } }, '다 붙였어요'));
    if (!F.itemLoose) say(n === 1 && done === 0 ? '종이를 자른 모서리끼리 만난 곳에 테이프를 붙여요. 상자를 돌려 가며 빠짐없이!' : '잘린 모서리에 테이프를 붙여요.');
    F.onTap = (hit) => {
      if (step !== 'tape' || !hit || hit.type !== 'edge') return;
      const e = hit.edge;
      if (taped.has(e.id)) { say('거기는 벌써 붙였어요.'); return; }
      if (e.hinge) { oops('여기는 골판지가 접혀서 이어진 모서리예요. 테이프가 필요 없어요. (테이프 낭비)', 50); return; }
      taped.add(e.id);
      F.addTape(e);
      sfx('tape');
      cnt.textContent = taped.size;
    };
  }

  // ---------- 단계: 굴러 넘어짐 → 라벨 ----------
  async function startTumble() {
    step = 'tumble';
    rollPad.classList.add('hidden');
    F.allowRotate = false;
    F.view('work');
    await new Promise((r) => setTimeout(r, 700));
    if (!active || over) return;
    say('앗! 저울로 옮기다가 상자가 데굴 굴렀어요!', 'sad');
    sfx('thud');
    await F.tumble(Math.floor(Math.random() * 5));
    if (!active || over) return;
    startLabel();
  }

  function startLabel() {
    step = 'label';
    rollPad.classList.remove('hidden');
    F.allowRotate = true;
    const faces = F.setupFaces();
    const placed = new Set();
    let tool = 'label', labelDone = false, arrows = 0;
    const btnLabel = h('button', { class: 'tool sel', onclick: () => { tool = 'label'; sfx('click'); mark(); } }, '📄 송장');
    const btnArrow = h('button', { class: 'tool', onclick: () => { tool = 'arrow'; sfx('click'); mark(); } }, '⬆️ 이쪽이 위');
    const status = h('p', { class: 'big-num' });
    function mark() {
      btnLabel.classList.toggle('sel', tool === 'label'); btnArrow.classList.toggle('sel', tool === 'arrow');
      btnLabel.disabled = labelDone;
      status.textContent = `송장 ${labelDone ? '✔' : '0/1'} · 화살표 ${arrows}장`;
    }
    setSide(stepsBar('label'), orderCard(active),
      h('p', { class: 'hint' }, '파란 "밑면" 도장이 찍힌 면이 상자의 밑면이에요. 바닥에 깔린 면은 ◀ ▶ ▲ ▼ 버튼으로 상자를 굴려서 찾아요.'),
      h('p', { class: 'hint' }, '📄 송장은 밑면과 평행한 윗면에, ⬆️ 화살표는 밑면과 수직인 옆면마다 붙여요.'),
      h('div', { class: 'row wrap' }, btnLabel, btnArrow), status,
      h('button', { class: 'btn big', onclick: () => {
        sfx('click');
        const sides = faces.filter((f) => f.role === 'side' && !placed.has(f.id)).length;
        if (!labelDone) { oops('송장을 아직 안 붙였어요.', 0); return; }
        if (sides) { oops('화살표가 빠진 옆면이 있어요. 밑면과 수직인 옆면은 모두 몇 개일까요? 상자를 돌려 봐요.', 100); return; }
        F.pickables = [];
        say('완벽해요! 기사님이 어느 쪽이 위인지 바로 알겠어요.', 'happy');
        startShip();
      } }, '라벨 끝!'));
    if (save.up.helper) {
      const top = faces.find((f) => f.role === 'top');
      F.addSticker(top, 'label', active.cust); placed.add(top.id); labelDone = true; tool = 'arrow';
      say('송장 도우미 로봇이 윗면에 송장을 붙였어요. 화살표는 직접 붙여요!');
    } else say('상자가 굴러서 밑면이 어디로 갔을까요? 파란 "밑면" 도장을 찾아봐요!');
    mark();
    F.onTap = (hit) => {
      if (step !== 'label' || !hit || hit.type !== 'face') return;
      if (placed.has(hit.id)) { say('거기는 벌써 붙였어요.'); return; }
      if (hit.role === 'base') { oops('그 면은 밑면이에요. 밑면에는 붙이지 않아요.', 0); return; }
      if (tool === 'label') {
        if (hit.role !== 'top') { oops('송장은 밑면과 평행한 윗면에 붙여요. 이 면은 밑면과 수직인 옆면이에요.', 100); return; }
        F.addSticker(hit, 'label', active.cust); placed.add(hit.id); labelDone = true; tool = 'arrow'; sfx('tape');
        say('송장 완료! 이제 옆면마다 화살표를 붙여요.', 'happy');
      } else {
        if (hit.role === 'top') { oops('그 면은 밑면과 평행한 윗면이에요. 화살표는 밑면과 수직인 옆면에 붙여요.', 100); return; }
        F.addSticker(hit, 'arrow'); placed.add(hit.id); arrows++; sfx('tape');
      }
      mark();
    };
  }

  // ---------- 단계: 출고 ----------
  function startShip() {
    step = 'ship';
    rollPad.classList.add('hidden');
    F.allowRotate = false;
    F.onTap = null;
    const btn = h('button', { class: 'btn big warn', onclick: async () => {
      btn.disabled = true;
      sfx('robot');
      F.view('ship');
      const o = active;
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
      F.clearWork();
      F.view('wide');
      step = 'pick';
      idleSide();
      drawTickets();
    } }, '🚚 출고!');
    setSide(stepsBar('ship'), orderCard(active), btn);
    say('트럭으로 보내요!');
  }

  function idleSide() {
    setSide(h('div', { class: 'ocard' }, h('b', {}, '📋 주문 쪽지를 골라요'), h('p', { class: 'hint' }, '주문 쪽지를 누르면 작업을 시작해요. 손님이 너무 오래 기다리면 주문을 취소해요!')));
  }

  function cancelActive(reason) {
    if (!active) return;
    rollPad.classList.add('hidden');
    orders = orders.filter((x) => x !== active);
    active = null;
    step = 'pick';
    cutWrap.classList.add('hidden');
    F.clearWork(); F.allowRotate = false; F.onTap = null; F.view('wide');
    idleSide();
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
    if (spawnIn <= 0 && orders.length < 3 && timeLeft > 25) { spawn(); spawnIn = cfg.every; }
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
    rollPad.classList.add('hidden');
    cutWrap.classList.add('hidden');
    F.onTap = null; F.allowRotate = false;
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
    root.append(h('div', { class: 'overlay' }, h('div', { class: 'card big-card' },
      h('p', { class: 'kicker' }, `${n}일차 근무 끝`),
      h('h2', {}, pass ? '목표 달성! 🎉' : '목표에 조금 모자라요'),
      h('p', { class: 'big-stars' }, '★'.repeat(stars) + '☆'.repeat(3 - stars)),
      h('ul', { class: 'stats' },
        h('li', {}, `오늘 매출 ${won(earned)} (목표 ${won(cfg.target)})`),
        h('li', {}, `보낸 상자 ${done}개 · 놓친 주문 ${missed}개`),
        h('li', {}, `모은 돈 ${won(save.money)}`)),
      h('div', { class: 'row end wrap' },
        h('button', { class: 'btn ghost', onclick: () => { sfx('click'); playDay(n); } }, '다시 하기'),
        h('button', { class: 'btn ghost', onclick: () => { sfx('click'); showShop(showTitle); } }, '🛒 상점'),
        pass ? h('button', { class: 'btn', onclick: () => { sfx('click'); showTitle(); showIntro(n + 1); } }, `${n + 1}일차로 ▶`) : null))));
  }

  cleanup = () => { over = true; clearInterval(timer); F.dispose(); };
  idleSide();
  drawHud();
  drawTickets();
  say(n === 1 ? '곧 첫 주문이 들어와요! 주문 쪽지가 오면 눌러요.' : '오늘도 힘내요! 주문 쪽지를 눌러 시작해요.');
  window.__game = { F, get step() { return step; }, get orders() { return orders; }, pick: pickOrder, get cutter() { return cutter; }, doCut, endDay, setTime: (t) => { timeLeft = t; } };
}

window.__factory = { save, showTitle, playDay, showShop };
showTitle();
setTimeout(() => import('./factory.js').catch(() => {}), 600);
