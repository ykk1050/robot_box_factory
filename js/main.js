// 로봇 상자 공장 — 택배 주문을 받아 상자를 만들고 트럭에 실어 보내는 경영 게임
import { ITEMS, CUSTOMERS, COST, BAG, EVENTS, GLUE_CHANCE, GLUE_HINT, OUTFITS, DECOR, DECOR_ONE, dayConfig, UPGRADES, payFor, CONTRACTS, CONTRACT_FROM, contractReward, contractText, contractCount } from './data.js';
import { sfx, pip, chime, coin, comboSound, tick, tapeStart, tapeMove, tapeStop, setAudio, music } from './sound.js';
import { RANK_URL, RANK_ALL, TEST, rankOn, CATS, call } from './rank.js';
import { NICK, NICK_WORDS, NICK_STEPS } from './nickwords.js';

// 게임 버전은 index.html의 window.BUILD 하나에서 고친다(+0.001). 파일 캐시 갱신에도 같은 값을 쓴다.
export const VERSION = window.BUILD || 'v1.033';

// 3D·전개도 모듈은 근무를 시작할 때 불러온다(시작 화면이 3D 라이브러리를 기다리지 않게)
let analyzeNet, netBoundary, netLines, Cutter, boxPicture, sketchPicture, STATIONS, classifyNet, NET_TYPES, NET_GROUPS, netTypePicture;
// 학교 와이파이에서 파일 하나가 잠깐 끊겨도 멈추지 않게, 실패하면 잠깐 쉬었다가 3번까지 다시 받는다
// import()는 응답 없이 멈추면 끊을 수 없으므로, 먼저 fetch로 받아 두고(8초 넘게 걸리면 끊고 다시) 그다음에 import한다
const WORK_FILES = [...['factory', 'net', 'cutter', 'nettype', 'three-view'].map((f) => `js/${f}.js?v=${VERSION}`),
  'vendor/three.module.js', 'vendor/three.core.js', 'vendor/addons/loaders/GLTFLoader.js', 'vendor/addons/utils/BufferGeometryUtils.js', 'vendor/addons/utils/SkeletonUtils.js'];
async function warm(url) {
  for (let i = 0; i < 5; i++) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 8000 + i * 4000);
    try {
      const r = await fetch(url, { signal: ac.signal });
      if (r.ok) { await r.text(); return; }
    } catch (_) { /* 다시 받는다 */ } finally { clearTimeout(t); }
    await new Promise((r) => setTimeout(r, 400 * (i + 1)));
  }
}
let workPromise = null;
const loadWork = () => {
  if (workPromise) return workPromise;
  workPromise = (async () => {
    for (let i = 0; ; i++) {
      try {
        await Promise.all(WORK_FILES.map(warm));
        const [f, n, c, t] = await Promise.all([import('./factory.js'), import('./net.js'), import('./cutter.js'), import('./nettype.js')]);
        analyzeNet = n.analyzeNet; netBoundary = n.netBoundary; netLines = n.netLines; Cutter = c.Cutter; boxPicture = c.boxPicture; sketchPicture = c.sketchPicture; STATIONS = f.STATIONS;
        classifyNet = t.classifyNet; NET_TYPES = t.NET_TYPES; NET_GROUPS = t.NET_GROUPS; netTypePicture = t.netTypePicture;
        return f.Factory;
      } catch (e) {
        if (i >= 2) { workPromise = null; throw e; }
        await new Promise((r) => setTimeout(r, 700 * (i + 1)));
      }
    }
  })();
  return workPromise;
};

// 전개도 콤보: 앞 상자들과 겹치지 않는 유형으로 이어 만들수록 보너스가 커진다
const COMBO_STEP = 300, COMBO_MAX = 1500;
const comboBonus = (len) => Math.min(COMBO_MAX, Math.max(0, len - 1) * COMBO_STEP);

// ---------- 저장 ----------
const SAVE_KEY = 'robot-box-factory-v2';
let save = { day: 1, money: 0, up: {}, dies: {}, best: {}, sound: true, char: 'm', nets: {}, tutorialDone: false, owned: {}, decor: {} };
try { save = { ...save, ...JSON.parse(localStorage.getItem(SAVE_KEY) || '{}') }; } catch (_) { /* 무시 */ }
if (save.up.helper) { delete save.up.helper; save.money += 6000; } // 없어진 업그레이드는 돈으로 돌려준다
// 랭킹 이름은 조합형 닉네임(단어 번호)만 쓴다. 예전 반 코드·직접 쓴 별명 이름표는 지우고 다시 만들게 한다
if (save.rank && !NICK.parse(save.rank.nick)) delete save.rank;
function store() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (_) { /* 무시 */ } }

// ---------- 소리 ----------
// 소리는 sound.js. 음악·흔들림은 따로 끌 수 있다(기기에서 '동작 줄이기'를 켰으면 흔들림은 처음부터 꺼짐)
const CALM = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
if (save.music == null) save.music = true;
if (save.shake == null) save.shake = !CALM;
setAudio({ sound: save.sound, music: save.music });

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
// 설정 버튼 세 개: 소리 · 음악 · 흔들림
function settingBtns(onChange) {
  const mk = (key, onT, offT) => {
    const b = h('button', { class: 'btn ghost small', onclick: () => { save[key] = !save[key]; store(); b.textContent = save[key] ? onT : offT; setAudio({ sound: save.sound, music: save.music }); sfx('click'); if (onChange) onChange(); } }, save[key] ? onT : offT);
    return b;
  };
  return h('div', { class: 'row center wrap' }, mk('sound', '🔊 소리 켬', '🔇 소리 끔'), mk('music', '🎵 음악 켬', '🎵 음악 끔'), mk('shake', '📳 흔들림 켬', '📳 흔들림 끔'));
}
// 길게 누르면 점점 빨리 반복되는 버튼 (누르자마자 한 번, 0.35초 뒤부터 반복)
function holdBtn(attrs, fn, label) {
  let t = null, n = 0;
  const stop = () => { clearTimeout(t); t = null; };
  const again = () => { if (!b.isConnected) { stop(); return; } fn(); n++; t = setTimeout(again, n < 6 ? 110 : 60); };
  const b = h('button', { ...attrs,
    onpointerdown: (e) => { if (e.button) return; stop(); n = 0; fn(); t = setTimeout(again, 350); try { b.setPointerCapture(e.pointerId); } catch (_) { /* 무시 */ } },
    onpointerup: stop, onpointercancel: stop, onlostpointercapture: stop, oncontextmenu: (e) => e.preventDefault(),
    onclick: (e) => { if (e.detail === 0) fn(); } }, label); // 키보드로 누를 때(detail 0)
  return b;
}
function stepper(value, min, max, onChange, unit = '') {
  let v = value;
  const num = h('span', { class: 'snum' }, `${v}${unit}`);
  const set = (n) => { const w = Math.max(min, Math.min(max, n)); if (w === v) return; v = w; num.textContent = `${v}${unit}`; onChange(v); sfx('click', { rate: 1 + Math.min(v, 12) * 0.03 }); };
  return h('span', { class: 'stepper' }, holdBtn({ class: 'sbtn', 'aria-label': '하나 줄이기' }, () => set(v - 1), '−'), num, holdBtn({ class: 'sbtn', 'aria-label': '하나 늘리기' }, () => set(v + 1), '+'));
}

const markIcons = (item) => (item.fragile ? ' · 🛡' : '') + (item.cold ? ' · 🧊' : '') + (item.up ? ' · ⬆️' : '');

// ---------- 시작 화면 ----------
function showTitle() {
  leave();
  const chips = h('div', { class: 'row center wrap' });
  for (let d = 1; d <= save.day; d++) {
    chips.append(h('button', { class: 'chip' + (d === save.day ? ' now' : ''), onclick: () => { sfx('click'); showIntro(d); } }, `${d}일차 ${'★'.repeat(save.best[d] || 0)}`));
  }
  const charBtns = h('div', { class: 'row center wrap' });
  const drawChar = () => {
    charBtns.innerHTML = '';
    OUTFITS.filter((o) => !o.price || save.owned[o.id]).forEach((o) => {
      charBtns.append(h('button', { class: 'charbtn' + (save.char === o.id ? ' sel' : ''), onclick: () => { save.char = o.id; store(); sfx('click'); drawChar(); } }, h('span', { class: 'cem' }, o.icon), `${o.name}(${o.who})`));
    });
  };
  drawChar();
  app.append(h('div', { class: 'screen title' },
    h('div', { class: 'title-box' },
      h('p', { class: 'kicker' }, '5학년 2학기 · 5. 직육면체'),
      h('h1', {}, '로봇 상자 공장'),
      h('p', { class: 'lead' }, '택배 주문이 밀려들어요! 골판지로 상자를 만들어 ', h('br'), '물건을 담고 트럭이 떠나기 전에 출고해요.'),
      h('img', { class: 'hero', src: 'img/robot.webp', alt: '공장 로봇 팔 박스봇' }),
      h('p', { class: 'muted', style: 'margin:0 0 4px' }, '내 캐릭터'),
      charBtns,
      h('div', { class: 'row center wrap', style: 'margin-top:12px' },
        h('button', { class: 'btn big', onclick: () => { sfx('click'); showIntro(save.day); } }, `${save.day}일차 출근하기`),
        h('button', { class: 'btn big ghost', onclick: () => { sfx('click'); showShop(); } }, '🛒 상점'),
        h('button', { class: 'btn big ghost', onclick: () => { sfx('click'); showRanking(); } }, '🏆 랭킹')),
      h('div', { class: 'row center wrap', style: 'margin-top:10px' },
        h('button', { class: 'btn ghost' + (save.tutorialDone ? '' : ' tut-glow'), onclick: () => { sfx('click'); playDay(1, { tutorial: true }); } }, '🎓 조작 연습'),
        h('button', { class: 'btn ghost', onclick: () => { sfx('click'); loadWork().then(() => showNetGuide()).catch(() => {}); } }, '📐 전개도 유형 11가지')),
      h('p', { class: 'muted', style: 'margin:10px 0 4px' }, `모은 돈 ${won(save.money)}`),
      save.day > 1 ? chips : null),
    creditLine()));
}

// ---------- 상점 ----------
// ---------- 반 랭킹 ----------
// 기기 열쇠: 닉네임 주인 확인용. 기기마다 한 번 만들어 계속 쓴다(개인정보 아님, 서버는 해시만 보관)
function deviceKey() {
  let k = save.devKey;
  if (!/^[0-9a-f]{32}$/.test(k || '')) {
    const b = new Uint8Array(16);
    crypto.getRandomValues(b);
    k = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
    save.devKey = k; store();
  }
  return k;
}
const rankQ = () => ({ cls: RANK_ALL, nick: save.rank.nick, key: deviceKey() });
const nickName = (id) => { const ix = NICK.parse(id); return ix ? NICK.text(ix) : ''; };

// 닉네임 만들기: 단어 4개(색 → 좋아하는 것 → 모습 → 캐릭터)를 골라 조합한다. 글자를 직접 쓰는 칸은 없다.
function profileDialog(after) {
  const pick = (save.rank && NICK.parse(save.rank.nick)) || [null, null, null, null];
  let step = Math.max(0, pick.findIndex((v) => v == null));
  const preview = h('p', { class: 'nick-preview' });
  const tabs = h('div', { class: 'nick-steps' });
  const grid = h('div', { class: 'nick-grid' });
  const msg = h('p', { class: 'hint' }, '실제 이름 대신 단어를 골라 닉네임을 만들어요. 이 기기에서 만든 닉네임은 다음에도 다시 고를 수 있어요.');
  const saveBtn = h('button', { class: 'btn' }, '이 닉네임으로 정하기');
  const mine = (save.myNicks || []).filter((id) => NICK.parse(id));
  const draw = () => {
    const full = pick.every((v) => v != null);
    preview.textContent = full ? NICK.text(pick) : pick.map((v, k) => (v == null ? '?' : NICK_WORDS[NICK_STEPS[k].key][v])).join(' ');
    saveBtn.disabled = !full;
    tabs.innerHTML = '';
    NICK_STEPS.forEach((st, k) => tabs.append(h('button', { class: 'nick-step' + (k === step ? ' now' : '') + (pick[k] != null ? ' done' : ''), onclick: () => { sfx('click'); step = k; draw(); } },
      h('small', {}, `${k + 1}. ${st.label}`), pick[k] == null ? '?' : NICK_WORDS[st.key][pick[k]])));
    grid.innerHTML = '';
    NICK_WORDS[NICK_STEPS[step].key].forEach((w, i) => grid.append(h('button', { class: 'nword' + (pick[step] === i ? ' sel' : ''), onclick: () => {
      sfx('click'); pick[step] = i;
      const next = pick.findIndex((v) => v == null);
      if (next >= 0) step = next;
      draw();
    } }, w)));
    grid.scrollTop = 0;
  };
  saveBtn.addEventListener('click', async () => {
    if (!pick.every((v) => v != null)) return;
    const id = NICK.id(pick);
    saveBtn.disabled = true;
    msg.textContent = '확인하는 중…';
    const res = await call({ act: 'join', cls: RANK_ALL, nick: id, key: deviceKey() });
    saveBtn.disabled = false;
    msg.textContent = res.msg || '';
    if (!res.ok) { sfx('no'); return; }
    save.rank = { nick: id };
    save.myNicks = [id, ...(save.myNicks || []).filter((x) => x !== id)].slice(0, 10);
    store(); sfx('ok');
    setTimeout(() => { ov.remove(); if (after) after(); }, 700);
  });
  const ov = h('div', { class: 'overlay' }, h('div', { class: 'card nick-card' },
    h('h2', {}, '🏆 닉네임 만들기'),
    preview,
    mine.length ? h('div', { class: 'row wrap nick-mine' }, h('small', {}, '내 닉네임:'), ...mine.map((id) => h('button', { class: 'chip small', onclick: () => { sfx('click'); NICK.parse(id).forEach((v, k) => { pick[k] = v; }); draw(); } }, nickName(id)))) : null,
    tabs, grid,
    h('div', { class: 'row wrap end' },
      h('button', { class: 'btn ghost', onclick: () => { sfx('click'); NICK_STEPS.forEach((st, k) => { pick[k] = Math.floor(Math.random() * NICK_WORDS[st.key].length); }); draw(); } }, '🎲 아무거나'),
      h('button', { class: 'btn ghost', onclick: () => { sfx('click'); ov.remove(); } }, '닫기'),
      saveBtn),
    msg));
  draw();
  app.append(ov);
}

async function showRanking(cat = 'day', day = save.day > 1 ? save.day - 1 : 1) {
  leave();
  const list = h('div', { class: 'ranklist' });
  const tabs = h('div', { class: 'row center wrap' }, ...CATS.map((c) => h('button', { class: 'chip' + (c.id === cat ? ' now' : ''), onclick: () => { sfx('click'); showRanking(c.id, day); } }, c.name)));
  const days = cat !== 'day' ? null : h('div', { class: 'row center wrap' },
    ...Array.from({ length: Math.max(save.day, 6) }, (_, i) => i + 1).map((d) => h('button', { class: 'chip small' + (d === day ? ' now' : ''), onclick: () => { sfx('click'); showRanking('day', d); } }, `${d}일차`)));
  const me = save.rank;
  const prof = h('p', { class: 'center' }, me ? `내 닉네임: ${nickName(me.nick)} ` : '닉네임을 만들면 랭킹에 올라가요. ',
    h('button', { class: 'btn ghost small', onclick: () => { sfx('click'); profileDialog(() => showRanking(cat, day)); } }, me ? '바꾸기' : '닉네임 만들기'));
  app.append(h('div', { class: 'screen shop-screen' },
    h('div', { class: 'topline' }, h('button', { class: 'btn ghost', onclick: () => { sfx('click'); showTitle(); } }, '← 돌아가기'), h('h2', {}, '🏆 전체 랭킹'), h('span')),
    RANK_URL ? null : h('p', { class: 'center hint' }, '선생님이 랭킹을 아직 연결하지 않았어요.'),
    prof, tabs, days, list, creditLine()));
  if (!RANK_URL) return;
  list.append(h('p', { class: 'center muted' }, '불러오는 중…'));
  const res = await call({ act: 'top', cls: RANK_ALL, nick: me ? me.nick : '', cat, day });
  if (!list.isConnected) return;
  list.innerHTML = '';
  if (!res.ok) { list.append(h('p', { class: 'center' }, res.msg || '불러오지 못했어요.')); return; }
  const c = CATS.find((x) => x.id === cat);
  if (!res.rows.length) list.append(h('p', { class: 'center muted' }, '아직 기록이 없어요. 첫 번째 주인공이 되어 봐요!'));
  res.rows.forEach((r) => list.append(h('div', { class: 'rankrow' + (me && r.nick === me.nick ? ' me' : '') },
    h('span', { class: 'rk' }, r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : `${r.rank}`), h('span', { class: 'rn' }, r.name || nickName(r.nick) || r.nick), h('span', { class: 'rv' }, c.unit(r.v)))));
  if (res.myRank > 30) list.append(h('p', { class: 'center' }, `내 순위: ${res.myRank}위`));
}

// 공장 꾸미기 목록: 상점과 게임 중 🎨 꾸미기 창이 함께 쓴다. 사거나 바꾸면 onChange로 바로 알린다
function fillDecor(list, onChange) {
  const draw = () => {
    list.innerHTML = '';
    DECOR.forEach((d) => {
      const one = DECOR_ONE.has(d.slot);
      const owned = !!save.owned[d.id];
      const on = one ? save.decor[d.slot] === d.id : !!save.decor[d.slot];
      const changed = () => { store(); draw(); if (onChange) onChange(); };
      const right = owned
        ? h('button', { class: 'btn ' + (on ? '' : 'ghost'), onclick: () => { sfx('click'); save.decor[d.slot] = one ? (on ? null : d.id) : !on; changed(); } }, on ? '꾸밈 중 ✔' : '꾸미기')
        : h('button', { class: 'btn', disabled: save.money < d.price ? true : null, onclick: () => {
          if (save.money < d.price) return;
          save.money -= d.price; save.owned[d.id] = true; save.decor[d.slot] = one ? d.id : true;
          sfx('ok'); changed();
        } }, won(d.price));
      const desc = `📍 ${d.where}` + (one ? ' · 하나만 고를 수 있어요' : '');
      list.append(h('div', { class: 'shop-item' + (on ? ' owned' : '') }, h('span', { class: 'sicon' }, d.icon), h('div', { class: 'sbody' }, h('b', {}, d.name), h('p', {}, desc)), right));
    });
  };
  draw();
}

function showShop(after, tab = 'up') {
  leave();
  const list = h('div', { class: 'shop' });
  const moneyEl = h('b', {}, won(save.money));
  const tabs = h('div', { class: 'row center wrap' });
  const buy = (price, fn) => { if (save.money < price) return; save.money -= price; fn(); store(); sfx('ok'); draw(); };
  const item = (icon, name, desc, right, on) => h('div', { class: 'shop-item' + (on ? ' owned' : '') }, h('span', { class: 'sicon' }, icon), h('div', { class: 'sbody' }, h('b', {}, name), desc ? h('p', {}, desc) : null), right);
  const priceBtn = (price, fn) => h('button', { class: 'btn', disabled: save.money < price ? true : null, onclick: () => buy(price, fn) }, won(price));
  const draw = () => {
    list.innerHTML = ''; tabs.innerHTML = '';
    moneyEl.textContent = won(save.money);
    [['up', '⚙️ 업그레이드'], ['decor', '🏭 공장 꾸미기'], ['outfit', '👷 기사 옷']].forEach(([id, t]) => tabs.append(h('button', { class: 'chip' + (tab === id ? ' now' : ''), onclick: () => { sfx('click'); tab = id; draw(); } }, t)));
    if (tab === 'up') UPGRADES.forEach((u) => {
      const owned = !!save.up[u.id];
      list.append(item(u.icon, u.name, u.desc, owned ? h('span', { class: 'tag' }, '보유') : priceBtn(u.price, () => { save.up[u.id] = true; }), owned));
    });
    if (tab === 'decor') fillDecor(list, () => { moneyEl.textContent = won(save.money); });
    if (tab === 'outfit') OUTFITS.forEach((o) => {
      const owned = !o.price || !!save.owned[o.id];
      const on = save.char === o.id;
      list.append(item(o.icon, `${o.name} (${o.who})`, on ? '지금 입고 있어요.' : '',
        owned ? h('button', { class: 'btn ' + (on ? '' : 'ghost'), onclick: () => { sfx('click'); save.char = o.id; store(); draw(); } }, on ? '입는 중 ✔' : '입기')
          : priceBtn(o.price, () => { save.owned[o.id] = true; save.char = o.id; }), on));
    });
  };
  draw();
  app.append(h('div', { class: 'screen shop-screen' },
    h('div', { class: 'topline' }, h('button', { class: 'btn ghost', onclick: () => { sfx('click'); (after || showTitle)(); } }, '← 돌아가기'), h('h2', {}, '🛒 공장 상점'), h('span', { class: 'pill' }, '💰 ', moneyEl)),
    h('p', { class: 'muted center' }, '택배로 번 돈으로 공장을 업그레이드하고 꾸며요.'),
    tabs, list, creditLine()));
}

// ---------- 하루 시작 ----------
// 오늘의 계약 3장(쉬움·보통·어려움 한 장씩). 근무를 마치기 전에는 다시 열어도 같은 계약이 나온다
function offersFor(n) {
  if (n < CONTRACT_FROM) return [];
  save.offers = save.offers || {};
  const known = (save.offers[n] || []).map((id) => CONTRACTS.find((c) => c.id === id)).filter(Boolean);
  if (known.length === 3) return known;
  const list = [1, 2, 3].map((lv) => { const all = CONTRACTS.filter((c) => c.lv === lv); return all[Math.floor(Math.random() * all.length)]; });
  save.offers[n] = list.map((c) => c.id); store();
  return list;
}
function showIntro(n) {
  const cfg = dayConfig(n);
  const offers = offersFor(n);
  let picked = offers[0] || null;
  const cards = h('div', { class: 'contracts' });
  const drawCards = () => {
    cards.innerHTML = '';
    offers.forEach((c) => cards.append(h('button', { class: 'contract lv' + c.lv + (c === picked ? ' sel' : ''), 'aria-pressed': c === picked ? 'true' : 'false', onclick: () => { sfx('click'); picked = c; drawCards(); } },
      h('small', {}, ['', '쉬움', '보통', '어려움'][c.lv]), h('b', {}, contractText(c)), h('span', { class: 'cpay' }, `성공하면 +${won(contractReward(c, cfg.target))}`))));
  };
  drawCards();
  const sec = cfg.time + (save.up.truck ? 30 : 0);
  const ov = h('div', { class: 'overlay' }, h('div', { class: 'card intro' },
    h('div', { class: 'intro-head' }, h('img', { src: 'img/robot.webp', alt: '' }), h('div', {}, h('p', { class: 'kicker' }, `${n}일차`), h('h2', {}, cfg.title))),
    ...cfg.intro.map((t) => h('p', { class: 'say' }, t)),
    h('p', { class: 'say' }, `📐 전개도 콤보: 앞에서 만든 상자와 다른 유형의 전개도로 이어서 상자를 만들면, 이어진 유형 수에 따라 보너스(최대 ${won(COMBO_MAX)})를 받아요. 같은 유형이 다시 나오면 콤보가 처음부터 다시 시작돼요.`),
    offers.length ? h('p', { class: 'chead' }, '📜 오늘의 계약을 하나 골라요') : null,
    offers.length ? cards : null,
    h('p', { class: 'goal' }, `🎯 목표 매출 ${won(cfg.target)} · 🚚 트럭 출발까지 ${Math.floor(sec / 60)}분${sec % 60 ? ` ${sec % 60}초` : ''}`),
    h('div', { class: 'row end wrap' },
      h('button', { class: 'btn ghost', onclick: () => { sfx('click'); ov.remove(); } }, '닫기'),
      !save.tutorialDone ? h('button', { class: 'btn ghost tut-glow', onclick: () => { sfx('click'); ov.remove(); playDay(1, { tutorial: true }); } }, '🎓 먼저 조작 연습') : null,
      h('button', { class: 'btn', onclick: () => { sfx('click'); ov.remove(); playDay(n, { contract: picked }); } }, '근무 시작!'))));
  app.append(ov);
}

// ---------- 전개도 유형 11가지 ----------
// chain: 지금 콤보에 쓴 유형 번호들(이 유형을 또 쓰면 콤보가 끊긴다)
function showNetGuide({ chain = [], onClose } = {}) {
  const got = Object.keys(save.nets || {}).length;
  const close = () => { sfx('click'); ov.remove(); if (onClose) onClose(); };
  const ov = h('div', { class: 'overlay' }, h('div', { class: 'card big-card netguide' },
    h('div', { class: 'row' }, h('h2', { style: 'flex:1' }, '📐 전개도 유형 11가지'), h('span', { class: 'pill' }, `만들어 본 유형 ${got}/11`)),
    h('p', { class: 'say' }, '정육면체의 전개도는 돌리거나 뒤집어서 같은 것을 하나로 보면 모두 11가지예요. 직육면체의 전개도도 면을 모두 같은 크기의 정사각형으로 바꿔 보면 이 11가지 모양 중 하나가 돼요.'),
    h('p', { class: 'say' }, '줄마다 놓인 면의 개수로 나누어 보면 1-4-1형(6가지), 2-3-1형(3가지), 2-2-2형(1가지), 3-3형(1가지)이에요. 한 줄에 면이 5개 이상이거나, 한 꼭짓점에 면 4개가 모이면(2×2 모양) 접었을 때 면이 겹쳐요.'),
    ...NET_GROUPS.map((g) => h('div', { class: 'ngroup' },
      h('b', {}, `${g.name} · ${g.types.length}가지`),
      h('div', { class: 'ngrid' }, ...g.types.map((t) => {
        const inChain = chain.includes(t.id), made = !!(save.nets || {})[t.id];
        return h('div', { class: 'ncell' + (inChain ? ' chain' : '') + (made ? ' made' : '') },
          netTypePicture(t, 70, inChain ? '#ffd8a8' : made ? '#cfe9d6' : '#fbe9cf'),
          h('small', {}, `${t.mark}${inChain ? ' 콤보 중' : made ? ' ✔' : ''}`));
      })))),
    chain.length ? h('p', { class: 'hint' }, '🟧 주황색 유형은 지금 콤보에 이미 쓴 유형이에요. 다른 유형으로 만들어야 콤보가 이어져요.') : null,
    h('div', { class: 'row end' }, h('button', { class: 'btn', onclick: close }, '닫기'))));
  app.append(ov);
}

// ---------- 조작 연습(튜토리얼) ----------
// 한 단계씩 하이라이트하고, 게임에서 일어난 일(ev)이 단계의 until과 같으면 다음으로 넘어간다.
const TUT_STEPS = [
  { id: 'pick', until: 'pick', target: 'ticket', coach: '주문 쪽지(🧩 큐브 퍼즐)를 눌러 주문을 받아요.', say: '손 모양이 보여 주는 대로 따라 해요. 주문 쪽지를 누르면 기사가 작업대로 걸어가요.' },
  { id: 'draw', until: 'add', target: 'sheet', coach: '파란 점선 칸을 손가락으로 끌어서 2×2 정사각형을 그려요.', say: '누른 칸에서 손을 끌어 간 칸까지 직사각형이 그려져요. 손을 떼면 면 하나가 생겨요.' },
  { id: 'erase', until: 'remove', target: 'sheet', coach: '방금 그린 면을 한 번 톡 눌러서 지워요.', say: '잘못 그린 면은 톡 눌러서 지우면 돼요.' },
  { id: 'net', until: 'work', target: 'cut', coach: '점선을 따라 2×2 정사각형 6개를 그리고 "✂️ 재단하고 접기"를 눌러요.', say: '정육면체의 전개도예요. 면끼리는 길이가 같은 변으로 딱 붙여 그려요.' },
  { id: 'look', until: 'drag', target: null, coach: '상자 주변의 빈 곳을 손가락으로 끌어서 둘러봐요.', say: '화면을 끌면 카메라가 돌아가요. 상자의 뒤쪽도 볼 수 있어요.' },
  { id: 'roll', until: 'roll', target: 'roll', coach: '◀ ▶ ▲ ▼ 버튼을 눌러 상자를 굴려요.', say: '상자를 굴리면 아래에 깔린 면도 볼 수 있어요.' },
  { id: 'goTape', until: 'at:tape', target: 'nav:tape', coach: '아래 "🩹 테이프 출력기" 버튼을 눌러 걸어가요.', say: '아래 버튼을 누르거나, 3D 화면에서 기계를 톡 눌러도 걸어가요.' },
  { id: 'tape', until: 'made:tape', target: 'panel', coach: '− + 로 길이 2cm, 개수 12줄을 맞추고 "출력하기"를 눌러요.', say: '정육면체는 모서리 12개의 길이가 모두 같아요. 첫 줄을 2cm 12줄로 맞춰요.' },
  { id: 'goSticker', until: 'at:sticker', target: 'nav:sticker', coach: '"🏷 스티커 제작기"로 가요.', say: '이번에는 면에 붙일 스티커를 만들어요.' },
  { id: 'sticker', until: 'made:sticker', target: 'panel', coach: '밑면 스티커 2장, 옆면 스티커 4장을 만들어요.', say: '밑면은 서로 평행한 두 면, 옆면은 밑면과 수직인 네 면이에요.' },
  { id: 'back', until: 'work', target: 'nav:bench', coach: '"🧰 작업대"로 돌아가요.', say: '재료를 챙겼으니 상자에 붙이러 가요.' },
  { id: 'use', until: 'use', target: 'tools', coach: '오른쪽에서 "🩹 테이프"를 고르고, 상자의 모서리를 톡 눌러요.', say: '도구를 고른 다음 상자의 모서리를 누르면 테이프가 붙어요.' },
  { id: 'ship', until: 'ship', target: 'ship', coach: '굴려 가며 모서리 12개·밑면 2개·옆면 4개를 모두 붙이고 "📦 포장 끝! 출고"를 눌러요.', say: '밑면은 파란 "밑면" 도장이 찍힌 면과 그 면과 평행한 면이에요. 다 붙였으면 출고!' },
];
// 연습 전개도(십자 모양) 안내 칸: 2×2 정사각형 6개
const TUT_NET = [[1, 0], [0, 1], [1, 1], [2, 1], [3, 1], [1, 2]].map(([x, y]) => ({ x: 5 + 2 * x, y: 3 + 2 * y, w: 2, h: 2 }));
const HAND_SVG = '<svg width="60" height="80" viewBox="0 0 60 80" aria-hidden="true"><rect x="22" y="2" width="14" height="44" rx="7"/><rect x="34" y="26" width="12" height="22" rx="6"/><rect x="44" y="30" width="11" height="20" rx="5.5"/><rect x="15" y="34" width="40" height="32" rx="12"/><rect x="4" y="36" width="12" height="26" rx="6" transform="rotate(-28 10 49)"/><rect x="20" y="62" width="28" height="16" rx="4"/></svg>';

// ---------- 근무 ----------
async function playDay(n, opts = {}) {
  const tutorial = !!opts.tutorial;
  leave();
  app.append(h('div', { class: 'screen title' }, h('p', { class: 'lead' }, '공장 문을 여는 중…')));
  // 파일이 끊기지도 않고 멈추면(약한 와이파이) 45초 뒤 '다시 열기'를 보여 준다
  const Factory = await Promise.race([loadWork(), new Promise((r) => setTimeout(() => r(null), 45000))]).catch(() => null);
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
  const juice = h('div', { class: 'juice', 'aria-hidden': 'true' });
  const rollBtn = (dir, label, aria) => h('button', { class: 'rbtn r-' + dir, 'aria-label': aria, onclick: () => { if (F.rolling || tutBlock('roll')) return; sfx('thud', { rate: 0.94 + Math.random() * 0.12 }); F.roll(dir); hiddenSeen.clear(); tutEv('roll'); tutDemoNow(); } }, label);
  const rollPad = h('div', { class: 'rollpad hidden' },
    rollBtn('up', '▲', '상자를 멀리 굴리기'), rollBtn('left', '◀', '상자를 왼쪽으로 굴리기'),
    h('span', { class: 'rmid' }, '상자', h('br'), '굴리기'),
    rollBtn('right', '▶', '상자를 오른쪽으로 굴리기'), rollBtn('down', '▼', '상자를 앞으로 굴리기'));
  const root = h('div', { class: 'screen play' }, gl, hud, leftCol, side, cutWrap, panel, rollPad, robot, nav, fx, juice);
  if (tutorial) root.classList.add('tut');
  app.append(root);
  const F = new Factory(gl, { character: (OUTFITS.find((o) => o.id === save.char) || OUTFITS[0]).model, walkSpeed: save.up.shoes ? 3.5 : 2.2, decor: save.decor || {}, netTypes: NET_TYPES });
  // 근무 시작: 공장 전체를 잠깐 비춘 뒤 기사에게 다가간다 (꾸민 공장도 한눈에)
  F.shakeOn = save.shake;
  F.onDoor = () => sfx('door');
  music.start();
  F.view('tour');
  setTimeout(() => { if (F.alive && F.mode === 'walk' && !F.follow) F.view('follow'); }, 2400);

  // 상태
  let timeLeft = cfg.time + (save.up.truck ? 30 : 0);
  const total = timeLeft;
  let earned = 0, done = 0, missed = 0, paused = false, over = false;
  let orders = [], active = null, spawnIn = 2, orderSeq = 0;
  let where = 'bench', place = 'walk'; // place: walk | cut | work | station | busy
  const inv = { tape: {}, roll: 0, base: 0, side: 0, guard: 0, foil: 0, up: 0 };
  // 가방: 재료 한 개(테이프 1줄, 스티커 1장, 보호대 1개, 은박 1장)가 한 칸
  const bagCap = () => (save.up.bag ? BAG.big : BAG.base);
  const bagUsed = () => Object.values(inv.tape).reduce((a, b) => a + b, 0) + (inv.roll > 0 ? 1 : 0) + inv.base + inv.side + inv.guard + inv.foil + inv.up;
  function bagFits(more) {
    const used = bagUsed(), cap = bagCap();
    if (used + more <= cap) return true;
    sfx('no');
    say(`🎒 가방이 넘쳐요! 지금 ${used}/${cap}칸이라 ${cap - used}개만 더 넣을 수 있어요. 개수를 줄이거나, 먼저 상자에 붙여서 가방을 비워요.`, 'sad');
    return false;
  }
  let tool = null;
  // 전개도 콤보
  let netChain = [], bestCombo = 0;
  const netsToday = new Set();
  // 랭킹: 근무표를 받고, 출고할 때마다 기록을 남긴다(서버가 이 기록으로 점수를 다시 계산한다)
  const shipLog = [];
  const contract = tutorial ? null : opts.contract || null;
  let contractDone = false;
  let rankToken = null, rankStartMsg = '';
  if (!tutorial && rankOn() && save.rank) call({ act: 'start', ...rankQ(), day: n }).then((r) => { if (r.ok) rankToken = r.token; else rankStartMsg = r.msg; });

  const say = (t, mood = 'talk') => { bubble.className = 'bubble ' + mood; bubble.textContent = t; bubble.classList.remove('pop'); void bubble.offsetWidth; bubble.classList.add('pop'); };
  const money = (v, why) => {
    earned += v;
    if (!tutorial) { save.money = Math.max(0, save.money + v); store(); } // 연습은 저장된 돈을 바꾸지 않는다
    const f = h('div', { class: 'float ' + (v >= 0 ? 'plus' : 'minus') }, `${v >= 0 ? '+' : '−'}${won(Math.abs(v))}${why ? ' ' + why : ''}`);
    f.style.top = `${fx.children.length * 34}px`; // 돈이 한꺼번에 들어와도 글자가 겹치지 않게
    fx.append(f); setTimeout(() => f.remove(), 1800);
    drawHud();
  };
  const oops = (t, cost) => { sfx('no'); say(t, 'sad'); if (active) active.mistakes++; if (cost) money(-cost); };

  // ---------- HUD ----------
  const timeBar = h('div', { class: 'tbar' }, h('i'));
  const timeTxt = h('span', { class: 'ttxt' });
  const earnEl = h('span', { class: 'pill' });
  const doneEl = h('span', { class: 'pill' });
  const contractEl = contract ? h('button', { class: 'pill contractpill', title: '오늘의 계약', onclick: () => say(`📜 오늘의 계약: ${contractText(contract)} (${contractDone ? '성공!' : `지금 ${Math.min(contract.need, contractCount(contract, shipLog))}/${contract.need}`}) · 보너스 ${won(contractReward(contract, cfg.target))}`) }) : null;
  const comboEl = h('button', { class: 'pill combo', title: '전개도 유형 보기', onclick: () => openNetGuide() });
  const coach = h('div', { class: 'coach' });
  hud.append(...[h('button', { class: 'btn ghost small', 'aria-label': '일시정지', onclick: () => { sfx('click'); pause(); } }, '⏸'),
    tutorial ? null : h('button', { class: 'btn ghost small', 'aria-label': '공장 꾸미기', onclick: () => { sfx('click'); openDecor(); } }, '🎨'),
    h('span', { class: 'pill day' }, tutorial ? '🎓 조작 연습' : `${n}일차`),
    tutorial ? coach : h('div', { class: 'timer' }, h('span', {}, '🚚'), timeBar, timeTxt),
    tutorial ? null : earnEl, contractEl, comboEl, doneEl].filter(Boolean));
  function openNetGuide() {
    if (over) return;
    sfx('click');
    const was = paused;
    paused = true;
    showNetGuide({ chain: netChain.map((t) => t.id), onClose: () => { paused = was; lastT = performance.now(); } });
  }

  // ---------- 조작 연습 ----------
  let tutStep = 0;
  function tutTarget(name) {
    if (!name) return null;
    if (name === 'ticket') return tickets.querySelector('.ticket:not(.empty)');
    if (name === 'sheet') return cutWrap.querySelector('.sheet-host');
    if (name === 'cut') return cutWrap.querySelector('.btn.warn');
    if (name === 'roll') return rollPad;
    if (name === 'panel') return panel.querySelector('.btn.warn');
    if (name === 'tools') return side.querySelector('.tools');
    if (name === 'ship') return side.querySelector('.btn.big.warn');
    if (name.startsWith('nav:')) return navBtns[name.slice(4)];
    return null;
  }
  function tutGlow() {
    if (!tutorial) return;
    const st = TUT_STEPS[tutStep];
    const el = st && tutTarget(st.target);
    root.querySelectorAll('.tut-glow').forEach((e) => { if (e !== el && !(rollHint && e === rollPad)) e.classList.remove('tut-glow'); });
    if (el && !el.classList.contains('tut-glow')) el.classList.add('tut-glow');
  }
  function tutDraw(announce = true) {
    if (!tutorial) return;
    const st = TUT_STEPS[tutStep];
    coach.innerHTML = '';
    if (!st) return;
    coach.append(h('span', { class: 'cstep' }, `${tutStep + 1}/${TUT_STEPS.length}`), h('span', { class: 'ctext' }, st.coach));
    if (announce) say(st.say);
    tutGlow();
    tutGuide();
    tutDemoNow();
  }
  // 골판지 위 점선 안내 칸
  function tutGuide() {
    if (!tutorial || !cutter) return;
    const id = TUT_STEPS[tutStep]?.id;
    cutter.setGuide(id === 'draw' ? [TUT_NET[2]] : id === 'net' ? TUT_NET : []);
  }
  // 시킨 것 말고 다른 조작은 막는다. 막았으면 true
  function tutBlock(kind, arg) {
    if (!tutorial || over) return false;
    const st = TUT_STEPS[tutStep];
    if (!st) return false;
    const free = st.id === 'ship';
    let ok = false, msg = '';
    if (kind === 'goto') ok = free || ({ goTape: 'tape', tape: 'tape', goSticker: 'sticker', sticker: 'sticker', back: 'bench' })[st.id] === arg;
    else if (kind === 'floor') ok = free;
    else if (kind === 'roll') { ok = st.id === 'roll' || st.id === 'use' || free; if (st.id === 'look') msg = '먼저 상자 주변의 빈 곳을 손가락으로 끌어서 둘러봐요.'; }
    else if (kind === 'tool') { ok = free || (st.id === 'use' && arg === 'tape'); if (st.id === 'use') msg = '지금은 "🩹 테이프"를 골라요.'; }
    else if (kind === 'ship') ok = free;
    else if (kind === 'cut') { ok = st.id === 'net'; if (st.id === 'draw' || st.id === 'erase') msg = `아직 재단하지 않아요. ${st.coach}`; }
    else if (kind === 'make:tape') {
      const two = arg.filter((r) => r.len === 2).reduce((a, r) => a + r.cnt, 0), other = arg.filter((r) => r.len !== 2).reduce((a, r) => a + r.cnt, 0);
      ok = free || (st.id === 'tape' && two === 12 && other === 0);
      if (st.id === 'tape') msg = `길이 2cm 테이프를 12줄만 뽑아요. 지금은 2cm ${two}줄${other ? `, 다른 길이 ${other}줄` : ''}이에요. 다른 길이는 0줄로 두어요.`;
    } else if (kind === 'make:sticker') {
      ok = free || (st.id === 'sticker' && arg[0] === 2 && arg[1] === 4 && arg[2] === 0);
      if (st.id === 'sticker') msg = `밑면 스티커 2장, 옆면 스티커 4장, 화살표 0장으로 맞춰요. 지금은 ${arg[0]}장, ${arg[1]}장, ${arg[2]}장이에요.`;
    } else if (kind === 'make:guard') ok = free;
    else if (kind === 'draw') {
      if (st.id === 'draw') { ok = arg.w === 2 && arg.h === 2; msg = `가로 2칸, 세로 2칸인 정사각형으로 그려요. 방금은 ${arg.w}×${arg.h}이었어요.`; }
      else if (st.id === 'erase') { ok = false; msg = '지금은 그리지 말고, 그려 둔 면을 톡 눌러서 지워요.'; }
      else ok = true;
    }
    if (ok) return false;
    sfx('no');
    say(msg || `지금은 이것부터 해요: ${st.coach}`, 'sad');
    coach.classList.remove('nudge'); void coach.offsetWidth; coach.classList.add('nudge');
    tutDemoNow();
    return true;
  }

  // ---------- 손 모양 안내(실루엣) ----------
  const hand = h('div', { class: 'ghand hidden' });
  hand.innerHTML = HAND_SVG;
  let demoTimer = null, rippleTimer = null, rollTry = 0, needRoll = null, rollHint = false;
  const hiddenSeen = new Set(); // 지금 보는 방향에서 '도구를 들고 봤더니 안 보였던' 일. 굴리거나 둘러보면 비운다
  const centerOf = (el) => { if (!el || !el.isConnected || el.offsetParent === null) return null; const r = el.getBoundingClientRect(); return r.width ? [r.left + r.width / 2, r.top + r.height / 2] : null; };
  const sheetXY = (x, y) => { const m = cutter && cutter.svg.getScreenCTM(); return m ? [m.a * x + m.e, m.d * y + m.f] : null; };
  const onCanvas = (p) => p && document.elementFromPoint(p[0], p[1])?.tagName === 'CANVAS';
  const walkingTo = (id) => place === 'walk' && where === id;
  const tap = (p) => (p ? { tap: p } : null);
  function tutDemo() {
    needRoll = null;
    const st = TUT_STEPS[tutStep];
    if (!st || paused || over || place === 'busy') return null;
    const sheetOpen = place === 'cut' && cutter && !cutWrap.classList.contains('hidden');
    const sx = (fn) => (sheetOpen ? fn() : place === 'cut' ? tap(centerOf(side.querySelector('.btn.big'))) : null);
    switch (st.id) {
      case 'pick': return tap(centerOf(tutTarget('ticket')));
      case 'draw': return sx(() => { const g = TUT_NET[2]; return { drag: [sheetXY(g.x + 0.5, g.y + 0.5), sheetXY(g.x + g.w - 0.5, g.y + g.h - 0.5)] }; });
      case 'erase': return sx(() => { const r = cutter.rects[0]; return r ? tap(sheetXY(r.x + r.w / 2, r.y + r.h / 2)) : null; });
      case 'net': return sx(() => {
        const g = cutter.rects.length < 6 && TUT_NET.find((q) => !cutter.rects.some((r) => r.x < q.x + q.w && q.x < r.x + r.w && r.y < q.y + q.h && q.y < r.y + r.h));
        return g ? { drag: [sheetXY(g.x + 0.5, g.y + 0.5), sheetXY(g.x + g.w - 0.5, g.y + g.h - 0.5)] } : tap(centerOf(tutTarget('cut')));
      });
      case 'look': {
        const b = place === 'work' && F.boxScreen();
        if (!b) return null;
        const y = b[1] - 110;
        return { drag: [[b[0] - 110, y], [b[0] + 110, y]] };
      }
      case 'roll': return place === 'work' ? tap(centerOf(rollPad.querySelector('.r-right'))) : null;
      case 'goTape': return walkingTo('tape') ? null : tap(centerOf(navBtns.tape));
      case 'goSticker': return walkingTo('sticker') ? null : tap(centerOf(navBtns.sticker));
      case 'back': return walkingTo('bench') ? null : tap(centerOf(navBtns.bench));
      case 'tape': {
        if (place !== 'station') return walkingTo('tape') ? null : tap(centerOf(navBtns.tape));
        const rows = [...panel.querySelectorAll('.srow')];
        const num = (row, k) => parseInt(row.querySelectorAll('.snum')[k].textContent, 10);
        const btn = (row, k) => centerOf(row.querySelectorAll('.sbtn')[k]);
        if (num(rows[0], 0) !== 2) return tap(btn(rows[0], num(rows[0], 0) > 2 ? 0 : 1));
        if (num(rows[0], 1) !== 12) return tap(btn(rows[0], num(rows[0], 1) > 12 ? 2 : 3));
        for (const r of rows.slice(1)) if (num(r, 1) > 0) return tap(btn(r, 2));
        return tap(centerOf(panel.querySelector('.btn.warn')));
      }
      case 'sticker': {
        if (place !== 'station') return walkingTo('sticker') ? null : tap(centerOf(navBtns.sticker));
        const rows = [...panel.querySelectorAll('.srow')];
        const want = [2, 4, 0];
        for (let i = 0; i < 3; i++) {
          const v = parseInt(rows[i].querySelector('.snum').textContent, 10);
          if (v !== want[i]) return tap(centerOf(rows[i].querySelectorAll('.sbtn')[v > want[i] ? 0 : 1]));
        }
        return tap(centerOf(panel.querySelector('.btn.warn')));
      }
      case 'use': return packDemo(['tape']);
      case 'ship': return packDemo(['tape', 'base', 'side']);
      default: return null;
    }
  }
  // 포장: 필요한 도구 고르기 → 보이는 모서리/면 누르기 → 안 보이면 굴리기 → 다 붙였으면 출고
  function packDemo(needs) {
    const o = active;
    if (!o || place !== 'work' || !F.edges) return null;
    // 남은 일마다 지금 화면에 보이는(눌러서 맞는) 곳을 찾는다
    const todo = [];
    for (const need of needs) {
      const rest = need === 'tape' ? F.edges.filter((e) => !o.taped.has(e.id))
        : F.faces.filter((f) => (need === 'base' ? f.role !== 'side' : f.role === 'side') && !o.baseS.has(f.id) && !o.sideS.has(f.id));
      if (!rest.length) continue;
      let vis = null;
      for (const t of rest) {
        const p = F.screenOf(need === 'tape' ? F.edgeHits[t.id] : F.faceHits[t.id]);
        if (!onCanvas(p)) continue;
        const hit = F.pick(p[0], p[1]);
        if (hit && (need === 'tape' ? hit.type === 'edge' && hit.edge.id === t.id : hit.type === 'face' && hit.id === t.id)) { vis = p; break; }
      }
      todo.push({ need, vis, first: rest[0] });
    }
    if (!todo.length) return needs.length > 1 ? tap(centerOf(tutTarget('ship'))) : null;
    // 보이는 일이 있으면 그것부터(지금 든 도구 우선), 하나도 안 보일 때만 굴리라고 한다
    // 모서리·면은 그 도구를 들었을 때만 눌리므로, 보이는지는 지금 든 도구로만 알 수 있다.
    // 지금 도구로 할 게 보이면 그것, 아니면 아직 확인 안 한 다른 도구로 바꿔 보고, 다 안 보일 때만 굴리라고 한다.
    todo.forEach((j) => { if (j.need === tool && !j.vis) hiddenSeen.add(j.need); });
    const job = todo.find((j) => j.need === tool && j.vis) || todo.find((j) => j.need !== tool && !hiddenSeen.has(j.need))
      || todo.find((j) => j.need === tool) || todo[0];
    if (job.need === tool && !job.vis) needRoll = job.need;
    const need = job.need;
    const have = need === 'tape' ? Object.values(inv.tape).some((c) => c > 0) : inv[need] > 0;
    if (!have) { needRoll = null; return tap(centerOf(navBtns[need === 'tape' ? 'tape' : 'sticker'])); }
    if (tool !== need) return tap(centerOf(side.querySelector(`.tool[data-tool="${need}"]`)));
    if (job.vis) { rollTry = 0; return tap(job.vis); }
    if (!needRoll) return null;
    // 보이는 곳이 없으면 굴리기: 남은 것 하나를 카메라 쪽으로 가장 잘 돌려 주는 버튼을 짚는다
    const t = job.first, dir = F.rollDirFor(need === 'tape' ? F.edgeHits[t.id] : F.faceHits[t.id]);
    return tap(centerOf(rollPad.querySelector(dir ? '.r-' + dir : rollTry++ % 2 ? '.r-up' : '.r-right')));
  }
  function showDemo(d) {
    hand.getAnimations().forEach((a) => a.cancel());
    clearTimeout(rippleTimer);
    const ok = d && (d.tap ? d.tap : d.drag && d.drag[0] && d.drag[1]);
    if (!ok) { hand.classList.add('hidden'); return; }
    hand.classList.remove('hidden');
    const R = root.getBoundingClientRect();
    const at = (p, sc = 1) => `translate(${p[0] - R.left}px, ${p[1] - R.top}px) scale(${sc})`;
    if (d.tap) {
      const p = d.tap, from = [p[0] + 40, p[1] + 50];
      hand.animate([
        { transform: at(from), opacity: 0 },
        { transform: at(p), opacity: 1, offset: 0.35 },
        { transform: at(p, 0.82), opacity: 1, offset: 0.48 },
        { transform: at(p), opacity: 1, offset: 0.6 },
        { transform: at(p), opacity: 1, offset: 0.85 },
        { transform: at(p), opacity: 0 },
      ], { duration: 1600, easing: 'ease-out', fill: 'forwards' });
      rippleTimer = setTimeout(() => ripple(p), 730);
    } else {
      const [a, b] = d.drag;
      hand.animate([
        { transform: at([a[0] + 30, a[1] + 40]), opacity: 0 },
        { transform: at(a), opacity: 1, offset: 0.2 },
        { transform: at(a, 0.82), opacity: 1, offset: 0.3 },
        { transform: at(b, 0.82), opacity: 1, offset: 0.72 },
        { transform: at(b), opacity: 1, offset: 0.82 },
        { transform: at(b), opacity: 0 },
      ], { duration: 2000, easing: 'ease-in-out', fill: 'forwards' });
      rippleTimer = setTimeout(() => ripple(a), 560);
    }
  }
  function ripple(p) {
    const R = root.getBoundingClientRect();
    const r = h('div', { class: 'gripple' });
    r.style.left = `${p[0] - R.left}px`; r.style.top = `${p[1] - R.top}px`;
    root.append(r);
    r.animate([{ transform: 'scale(.3)', opacity: 0.9 }, { transform: 'scale(1.5)', opacity: 0 }], { duration: 600, easing: 'ease-out' }).onfinish = () => r.remove();
  }
  // 눌러야 할 곳이 화면에 안 보이면: 안내 줄에 '굴려서 보이게' 문구를 붙이고, 박스봇이 한 번 말하고, 굴리기 버튼을 반짝이게 한다
  function setRollHint(need) {
    const on = !!need;
    const el = coach.querySelector('.chint');
    if (!on) { el?.remove(); if (rollHint) rollPad.classList.remove('tut-glow'); rollHint = false; return; }
    const what = need === 'tape' ? '테이프를 붙일 모서리가' : need === 'base' ? '밑면 스티커를 붙일 면이' : '옆면 스티커를 붙일 면이';
    const text = `👀 ${what} 안 보이면 ◀ ▶ ▲ ▼로 상자를 굴려서 보이게 해요.`;
    if (el) el.textContent = text; else coach.querySelector('.ctext')?.append(h('span', { class: 'chint' }, text));
    rollPad.classList.add('tut-glow');
    if (!rollHint) say(`지금 보이는 쪽에는 ${what.slice(0, -1)} 없어요. 아래 ◀ ▶ ▲ ▼ 버튼으로 상자를 굴려서 보이게 해요.`);
    rollHint = true;
  }
  function tutDemoNow() {
    if (!tutorial) return;
    clearTimeout(demoTimer);
    const loop = () => { if (over) { showDemo(null); return; } if (F.rolling) { demoTimer = setTimeout(loop, 120); return; } showDemo(tutDemo()); setRollHint(needRoll); demoTimer = setTimeout(loop, 2300); };
    demoTimer = setTimeout(loop, 450);
  }
  function tutNext() { tutStep++; tutDraw(); }
  let tutPending = -1; // 같은 단계가 두 번 넘어가지 않게(빠르게 두 번 눌러도 한 단계만)
  function tutEv(ev) {
    if (!tutorial || over) return;
    const st = TUT_STEPS[tutStep];
    if (!st || st.until !== ev || tutPending === tutStep) return;
    tutPending = tutStep;
    sfx('ok');
    setTimeout(() => { if (tutStep === tutPending) tutNext(); }, 350);
  }
  function finishTutorial() {
    over = true;
    clearInterval(timer);
    save.tutorialDone = true; store();
    sfx('clear');
    root.querySelectorAll('.tut-glow').forEach((e) => e.classList.remove('tut-glow'));
    clearTimeout(demoTimer); showDemo(null);
    root.append(h('div', { class: 'overlay' }, h('div', { class: 'card big-card' },
      h('p', { class: 'kicker' }, '조작 연습 끝'),
      h('h2', {}, '이제 출근할 준비가 됐어요! 🎉'),
      h('ul', { class: 'stats' },
        h('li', {}, '주문 쪽지 누르기 → 작업대에서 전개도 그리고 재단'),
        h('li', {}, '화면 끌어 둘러보기 · ◀ ▶ ▲ ▼로 상자 굴리기'),
        h('li', {}, '아래 버튼이나 바닥·기계를 눌러 걸어가 재료 만들기'),
        h('li', {}, '도구를 고르고 모서리·꼭짓점·면을 눌러 붙이기 → 출고'),
        h('li', {}, '🛡 깨지기 쉬운 물건은 포장재 선반에서 보호대를 가져와 꼭짓점 8개에 끼워요'),
        h('li', {}, '🎒 재료는 가방 칸만큼만 들 수 있어요. 많이 필요하면 나눠서 가져와요'),
        h('li', {}, '📐 앞 상자와 다른 유형의 전개도로 이어 만들면 콤보 보너스!')),
      h('div', { class: 'row end wrap' },
        h('button', { class: 'btn ghost', onclick: () => { sfx('click'); showTitle(); } }, '처음 화면'),
        h('button', { class: 'btn', onclick: () => { sfx('click'); showTitle(); showIntro(save.day); } }, `${save.day}일차 출근하기 ▶`)))));
  }

  function drawHud() {
    comboEl.textContent = `📐 콤보 ${netChain.length}`;
    comboEl.classList.toggle('hot', netChain.length >= 2);
    timeBar.firstChild.style.width = `${Math.max(0, timeLeft / total) * 100}%`;
    timeBar.classList.toggle('hurry', timeLeft < 30);
    const t = Math.max(0, timeLeft);
    timeTxt.textContent = `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
    earnEl.textContent = `💰 ${won(earned)} / ${won(cfg.target)}`;
    doneEl.textContent = `📦 ${done}`;
    if (contractEl) { contractEl.textContent = contractDone ? '📜 성공!' : `📜 ${Math.min(contract.need, contractCount(contract, shipLog))}/${contract.need}`; contractEl.classList.toggle('done', contractDone); }
    if (!tutorial && !goalHit && earned >= cfg.target) { goalHit = true; setTimeout(() => { if (!over) { banner('🎯 목표 달성!'); sfx('goal'); confetti(26); } }, 900); }
  }
  // ---------- 손맛: 도장·색종이·동전 ----------
  let goalHit = false;
  const bump = (el) => { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); };
  const gone = (el, ms) => { juice.append(el); setTimeout(() => el.remove(), ms); };
  // 계약을 이루면 바로 보너스
  function checkContract() {
    if (!contract || contractDone || contractCount(contract, shipLog) < contract.need) return;
    contractDone = true;
    setTimeout(() => {
      if (over) return;
      banner('📜 계약 성공!'); sfx('goal'); confetti(24); if (contractEl) bump(contractEl);
    }, 1500);
    money(contractReward(contract, cfg.target), '📜 계약 성공!');
  }
  function banner(t) { juice.querySelectorAll('.jbanner').forEach((x) => x.remove()); gone(h('div', { class: 'jbanner' }, t), 1700); }
  function stampMark(perfect) {
    sfx('stamp', { rate: perfect ? 1 : 1.15, vol: perfect ? 1 : 0.7 });
    if (save.shake) F.freeze(90);
    gone(h('div', { class: 'jstamp' + (perfect ? ' perfect' : '') }, perfect ? '완벽 포장' : '검수 합격', perfect ? h('small', {}, '★ ★ ★') : null), 1300);
  }
  function confetti(n) {
    if (CALM || !save.shake) n = Math.min(n, 8); // 흔들림을 끈 사람에게는 조금만
    const cols = ['#e94f4f', '#f4b942', '#6bcb77', '#4d96ff', '#c77dff', '#ff8fab'];
    const box = h('div', { class: 'jconf' });
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, d = 120 + Math.random() * 240;
      box.append(h('i', { style: `background:${cols[i % cols.length]};--x:${Math.round(Math.cos(a) * d)}px;--y:${Math.round(Math.sin(a) * d * 0.6 - 120)}px;--r:${Math.round(Math.random() * 900 - 450)}deg;animation-delay:${Math.round(Math.random() * 120)}ms` }));
    }
    gone(box, 1900);
  }
  function coins(n) {
    const to = earnEl.getBoundingClientRect(), from = juice.getBoundingClientRect();
    const x = to.left + 24 - (from.left + from.width / 2), y = to.top + to.height / 2 - (from.top + from.height * 0.45);
    for (let i = 0; i < n; i++) {
      const c = h('span', { class: 'jcoin', style: `--x:${Math.round(x)}px;--y:${Math.round(y)}px;--w:${Math.round(Math.random() * 120 - 60)}px;animation-delay:${i * 70}ms` }, '₩');
      gone(c, 900 + i * 70);
      setTimeout(() => { if (!over) { coin(i); bump(earnEl); } }, 620 + i * 70);
    }
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
  async function goTo(id, internal = false) {
    if (over || place === 'busy') return;
    if (!internal && tutBlock('goto', id)) return;
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
    if (tutBlock('floor')) return;
    closeAll();
    place = 'walk'; where = null; markNav();
    F.view('follow');
    setSideIdle();
    await F.walkTo(x, z);
  }
  function arrive(id) {
    sfx('click');
    tutEv('at:' + id);
    if (id === 'bench') enterBench();
    else openStation(id);
    markNav();
  }
  F.onDrag = () => { hiddenSeen.clear(); tutEv('drag'); tutDemoNow(); };
  F.canStroke = (u) => {
    const o = active;
    if (!o || o.phase !== 'packing' || place !== 'work' || over || paused) return false;
    if (tool === 'tape' && u.type === 'edge') return !o.taped.has(u.edge.id) && (inv.tape[u.edge.len] > 0 || inv.roll >= u.edge.len);
    if (tool === 'guard' && u.type === 'corner') return !!o.item.fragile && !o.guarded.has(u.id) && inv.guard > 0;
    if (tool === 'foil' && u.type === 'face') return !!o.item.cold && !o.foilS.has(u.id) && inv.foil > 0;
    return false;
  };
  F.onStroke = (u) => { if (F.canStroke(u)) useTool(u, true); };
  F.onStrokeMove = (p, speed) => { tapeStart(); tapeMove(p, speed); };
  F.onStrokeEnd = () => tapeStop();
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
    const sketch = !first && !tutorial && Math.random() < (cfg.sketch || 0);
    // 특별 손님: ⚡ 급한 주문(기다리는 시간 절반, 돈 2배), ⭐ 단골 손님(실수 없이 보내면 팁)
    const r = Math.random();
    // 계약에 필요한 손님은 조금 더 자주 온다 (운이 나빠서 못 이루는 일이 없게)
    const want = contract && !contractDone ? contract.kind : '';
    const urgentP = want === 'urgent' ? 0.35 : EVENTS.urgent.chance;
    const ev = first || tutorial ? null : n >= EVENTS.urgent.from && r < urgentP ? 'urgent' : r < urgentP + EVENTS.regular.chance ? 'regular' : null;
    // 붙이는 방식은 주문마다 섞여 나온다 (첫 주문·튜토리얼은 테이프)
    const seal = !first && !tutorial && Math.random() < (want === 'glue' ? 0.65 : GLUE_CHANCE) ? 'glue' : 'tape';
    let cust = CUSTOMERS[Math.floor(Math.random() * CUSTOMERS.length)];
    if (ev === 'regular') cust = '⭐ 단골 ' + cust;
    const base = payFor(item) + (sketch ? 300 : 0) + (seal === 'glue' ? COST.glueBonus : 0);
    const pat = ev === 'urgent' ? Math.round(cfg.patience / 2) : cfg.patience;
    orders.push({ id: ++orderSeq, item, sketch, seal, ev, cust, pay: ev === 'urgent' ? base * 2 : base, patience: pat, left: pat, mistakes: 0 });
    if (ev === 'urgent') say(`⚡ 급한 주문이 들어왔어요! 손님이 오래 못 기다리지만 돈을 2배로 줘요.`);
    else if (ev === 'regular') say(`⭐ 단골 손님 주문이에요! 실수 없이 보내면 팁 ${won(EVENTS.regular.tip)}을 줘요.`);
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
        o.el = h('button', { class: 'ticket' + (o.ev ? ' ev-' + o.ev : ''), onclick: () => pickOrder(o) },
          o.ev ? h('span', { class: 'evtag' }, o.ev === 'urgent' ? '⚡ 급한 주문 ×2' : '⭐ 단골') : null,
          h('span', { class: 'temoji' }, o.item.emoji),
          h('span', { class: 'tbody' }, h('b', {}, o.item.name), h('small', {}, o.sketch ? '📐 겨냥도 주문' : `가로 ${o.item.d[0]} · 세로 ${o.item.d[2]} · 높이 ${o.item.d[1]}`), h('small', { class: 'seal seal-' + o.seal }, o.seal === 'glue' ? `🧴 본드 상자 +${won(COST.glueBonus)}` : '🩹 테이프 상자'), h('small', { class: 'pay' }, won(o.pay) + markIcons(o.item))),
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
      o.ev === 'urgent' ? h('p', { class: 'fragile ev' }, '⚡ 급한 주문: 기다리는 시간이 절반, 돈은 2배!') : null,
      o.ev === 'regular' ? h('p', { class: 'fragile ev' }, `⭐ 단골 손님: 실수 없이 보내면 팁 ${won(EVENTS.regular.tip)}`) : null,
      o.sketch ? h('p', { class: 'fragile' }, '📐 겨냥도 주문: 길이를 보고 가로·세로·높이를 찾아요') : null,
      o.seal === 'glue' ? h('p', { class: 'fragile seal-glue' }, '🧴 본드 상자: 접기 전에, 접으면 만나는 선분 짝을 모두 찾아 본드를 칠해요. 테이프는 안 써요.')
        : h('p', { class: 'fragile seal-tape' }, '🩹 테이프 상자: 접은 뒤 모서리 12개에 테이프를 붙여요.'),
      (o.sketch ? sketchPicture : boxPicture)(o.item.d, 210),
      o.item.fragile ? h('p', { class: 'fragile' }, '🛡 깨지기 쉬워요! 꼭짓점 8개마다 꼭짓점 보호대') : null,
      o.item.cold ? h('p', { class: 'fragile' }, '🧊 냉장! 면 6개 모두에 보냉 은박') : null,
      o.item.up ? h('p', { class: 'fragile' }, '⬆️ 이쪽이 위! 옆면 4개에 화살표 스티커') : null,
      h('span', { class: 'pat' }, o.pinBar)].filter(Boolean));
    orderPin.classList.remove('hidden');
  }
  function pickOrder(o) {
    if (over || paused) return;
    if (active) { say('지금 주문을 먼저 끝내요. 출고하면 다음 주문을 받을 수 있어요.'); return; }
    sfx('click');
    active = o;
    o.phase = 'cut';
    o.taped = new Set(); o.guarded = new Set(); o.baseS = new Set(); o.sideS = new Set(); o.foilS = new Set(); o.upS = new Set();
    if (o.el) o.el.remove();
    pinOrder(o);
    drawTickets();
    F.showItem(o.item);
    say(`${o.item.name} 주문! 작업대로 가서 골판지를 재단해요.`);
    goTo('bench', true);
    tutEv('pick');
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
    const sheetInfo = h('small', { class: 'sheetinfo' });
    const rec = (save.sheets || {})[dieKey];
    cutWrap.append(h('div', { class: 'ctools' },
      h('span', { class: 'ctitle' }, '✂️ 손가락으로 끌어서 면을 그려요', sheetInfo),
      hasDie ? h('button', { class: 'btn ghost small', onclick: () => { sfx('click'); cutter.set(save.dies[dieKey]); say('금형으로 한 번에 그렸어요!'); } }, '🗂 금형') : null,
      h('button', { class: 'btn ghost small', onclick: () => openNetGuide() }, '📐 유형'),
      h('button', { class: 'btn ghost small', onclick: () => { sfx('click'); const had = cutter.rects.length; cutter.set([]); if (had) tutEv('remove'); } }, '모두 지우기'),
      h('button', { class: 'btn warn', onclick: doCut }, '✂️ 재단하고 접기')));
    const host = h('div', { class: 'sheet-host' });
    cutWrap.append(host);
    cutter = new Cutter(host, {
      onDraw: (b) => { sheetInfo.textContent = b ? `📏 골판지 ${b.w}×${b.h} = ${b.area}칸 · ${won(b.area * COST.sheet)}` : `📏 골판지는 1칸에 ${won(COST.sheet)}${rec ? ` · 내 기록 ${rec}칸` : ''}`; },
      onChange: (k, r) => {
        if (k === 'overlap') say('다른 면과 겹치게 그릴 수 없어요.');
        else if (k === 'add' && tutBlock('draw', r)) { cutter.rects.pop(); cutter.draw(); }
        else if (k === 'add') { sfx('click'); say(`${r.w === r.h ? `한 변이 ${r.w}cm인 정사각형` : `가로 ${r.w}cm, 세로 ${r.h}cm인 직사각형`} 면을 그렸어요. 그린 면을 한 번 누르면 지워져요.`); tutEv('add'); }
        else { sfx('click'); if (k === 'remove') tutEv('remove'); }
      },
    });
    if (keep) cutter.set(keep);
    setSide(h('p', { class: 'hint' }, `주문서의 ${new Set(o.item.d).size === 1 ? '정육면체' : '직육면체'}와 크기가 같은 전개도를 그려요. 잘리지 않은 모서리는 점선, 잘린 모서리는 실선으로 나타나요.`), comboView(), invView());
    if (tutorial) { tutGlow(); tutGuide(); if (keep) return; tutDraw(); return; }
    if (keep) return;
    if (o.item === ITEMS.puzzle && n === 1 && done === 0) say('큐브 퍼즐은 가로·세로·높이가 모두 2cm인 정육면체에 넣어요. 한 변이 2cm인 정사각형 6개로 정육면체의 전개도를 그려 봐요!');
    else if (o.sketch) say('겨냥도 주문이에요! 실선과 점선으로 그린 모서리의 길이를 보고 가로·세로·높이를 찾아서 전개도를 그려요. 보이지 않는 모서리(점선)도 모서리예요.');
    else say(`가로 ${o.item.d[0]}cm, 세로 ${o.item.d[2]}cm, 높이 ${o.item.d[1]}cm인 ${new Set(o.item.d).size === 1 ? '정육면체' : '직육면체'}의 전개도를 그려요.`);
  }

  async function doCut() {
    if (place !== 'cut' || !active) return;
    if (tutBlock('cut')) return;
    const rects = cutter.rects.map((r) => ({ ...r }));
    if (!rects.length) { say('먼저 골판지에 면을 그려요.'); return; }
    const A = analyzeNet(rects, active.item.d);
    if (A.problem === 'apart') {
      cutter.red = new Set(A.apart); cutter.draw();
      oops('빨간 면이 떨어져 있어요! 전개도의 면은 길이가 같은 모서리끼리 이어져 있어야 접을 수 있어요.');
      return;
    }
    // 본드 상자는 맞는 전개도를 자른 뒤, 접기 전에 만나는 선분 짝을 모두 찾아 본드를 칠한다
    let glued = [];
    if (A.valid && !A.problem && active.seal === 'glue') {
      glued = await glueStage(rects, A);
      if (!active || over) return;
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
    // 골판지 값: 전개도를 둘러싼 직사각형 넓이만큼 (못 쓰게 된 골판지는 앞에서 300원만 냈다)
    const bx = cutter.box();
    active.area = bx ? bx.area : active.item.sheet;
    active.thrift = active.area === active.item.sheet;
    if (!tutorial) {
      money(-active.area * COST.sheet, `골판지 ${active.area}칸`);
      const dk = [...active.item.d].sort((a, b) => a - b).join('x');
      save.sheets = save.sheets || {};
      if (active.thrift) { const it = active.item; setTimeout(() => { if (active && active.item === it) { banner('✂️ 가장 알뜰한 재단!'); chime(); } }, 700); }
      if (!save.sheets[dk] || active.area < save.sheets[dk]) { save.sheets[dk] = active.area; store(); }
    }
    if (save.up.die) { save.dies[[...active.item.d].sort((a, b) => a - b).join('x')] = rects; store(); }
    active.net = classifyNet(A);
    if (active.net) {
      const t = active.net, again = netChain.some((x) => x.id === t.id);
      const f = h('div', { class: 'float plus' }, `📐 ${t.name}${again ? ' (콤보에 이미 있음)' : ` · 출고하면 콤보 ${netChain.length + 1}`}`);
      fx.append(f); setTimeout(() => f.remove(), 2200);
    }
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
    // 본드를 칠해 둔 선분은 접으면서 딱 붙은 모서리가 된다
    if (glued.length) {
      const key = (p) => p.map((v) => Math.round(v * 1000) / 1000).join(',');
      let k = 0;
      glued.forEach((sg) => {
        const want = [key(sg.p3a), key(sg.p3b)].sort().join('|');
        const e = F.edges.find((x) => [key(x.a), key(x.b)].sort().join('|') === want);
        if (e && !active.taped.has(e.id)) { active.taped.add(e.id); F.addGlue(e); k++; }
      });
      // 접힌 모서리(전개도에서 면과 면이 이어져 있던 곳)는 붙일 필요가 없다
      let fold = 0;
      F.edges.forEach((e) => { if (e.hinge && !active.taped.has(e.id)) { active.taped.add(e.id); fold++; } });
      if (k) setTimeout(() => { if (active) say(`🧴 본드로 붙은 모서리 ${k}개 + 접힌 모서리 ${fold}개 = 모서리 ${k + fold}개가 모두 붙었어요! 테이프는 필요 없어요. 이제 스티커를 붙여요.`, 'happy'); }, 1500);
    }
    enterWork();
  }

  // ---------- 본드 칠하기: 접었을 때 만나는 선분 잇기 (겹치는 점·선분) ----------
  function glueStage(rects, A) {
    return new Promise((resolve) => {
      const { points, segs } = netBoundary(rects, A);
      place = 'glue';
      const glued = [];
      const color = new Map();
      const COLORS = ['#f4b942', '#6fc3df', '#a4d36b', '#f08fb5', '#b79cf0', '#f5925a', '#5fd1b0'];
      const total = Math.floor(segs.filter((sg) => sg.partner >= 0).length / 2);
      let sel = null, hintSeg = null;
      const foldBtn = h('button', { class: 'btn warn', onclick: () => { if (glued.length < total) { say(`아직 본드를 칠하지 않은 선분 짝이 ${total - glued.length}쌍 있어요. 모두 칠해야 접을 수 있어요.`); sfx('no'); return; } sfx('click'); resolve(glued); } });
      const hintBtn = h('button', { class: 'btn ghost', onclick: () => {
        const a = segs.find((sg) => !color.has(sg.id) && sg.partner != null && sg.id < sg.partner);
        if (!a) return;
        money(-GLUE_HINT, '힌트'); sfx('click');
        sel = a; hintSeg = segs.find((x) => x.id === a.partner);
        draw();
        say(`💡 파란 ${nm(a)}과 점선으로 반짝이는 선분이 짝이에요. 반짝이는 선분을 눌러요.`);
      } }, `💡 짝 하나 보기 ${won(GLUE_HINT)}`);
      const upd = () => { foldBtn.textContent = glued.length < total ? `🧴 ${glued.length}/${total}쌍` : '접기 ▶'; foldBtn.classList.toggle('dim', glued.length < total); };
      cutWrap.innerHTML = '';
      cutWrap.append(h('div', { class: 'ctools' },
        h('span', { class: 'ctitle' }, `🧴 본드 상자 · 접었을 때 만나는 두 선분을 차례로 눌러 ${total}쌍을 모두 찾아요`),
        hintBtn, foldBtn));
      upd();
      const host = h('div', { class: 'sheet-host' });
      cutWrap.append(host);
      const NS = 'http://www.w3.org/2000/svg';
      const S = (tag, a = {}) => { const e = document.createElementNS(NS, tag); for (const k in a) e.setAttribute(k, a[k]); return e; };
      const xs = rects.flatMap((r) => [r.x, r.x + r.w]), ys = rects.flatMap((r) => [r.y, r.y + r.h]);
      const x0 = Math.min(...xs), y0 = Math.min(...ys), W = Math.max(...xs) - x0, H = Math.max(...ys) - y0;
      const u = Math.max(W, H) / 12;
      const svg = S('svg', { viewBox: `${x0 - u * 1.6} ${y0 - u * 1.6} ${W + u * 3.2} ${H + u * 3.2}`, preserveAspectRatio: 'xMidYMid meet', class: 'sheet' });
      host.append(svg);
      const cx = x0 + W / 2, cy = y0 + H / 2;
      const draw = () => {
        svg.innerHTML = '';
        rects.forEach((r) => svg.append(S('rect', { x: r.x, y: r.y, width: r.w, height: r.h, fill: '#fbe9cf' })));
        netLines(rects, A).fold.forEach(({ p, q }) => svg.append(S('line', { x1: p[0], y1: p[1], x2: q[0], y2: q[1], stroke: '#3b2a1e', 'stroke-width': u * 0.07, 'stroke-dasharray': `${u * 0.25} ${u * 0.2}` })));
        segs.forEach((sg) => {
          if (hintSeg === sg && !color.has(sg.id)) svg.append(S('line', { x1: sg.a.x, y1: sg.a.y, x2: sg.b.x, y2: sg.b.y, stroke: '#2f6fde', 'stroke-width': u * 0.3, 'stroke-dasharray': `${u * 0.3} ${u * 0.2}`, 'stroke-linecap': 'round', class: 'glue-hint' }));
          const c = sel === sg ? '#2f6fde' : color.get(sg.id) || '#3b2a1e';
          const wide = color.has(sg.id) || sel === sg;
          svg.append(S('line', { x1: sg.a.x, y1: sg.a.y, x2: sg.b.x, y2: sg.b.y, stroke: c, 'stroke-width': u * (wide ? 0.34 : 0.1), 'stroke-linecap': 'round' }));
          const hit = S('line', { x1: sg.a.x, y1: sg.a.y, x2: sg.b.x, y2: sg.b.y, stroke: 'transparent', 'stroke-width': u * 1.1 });
          hit.style.cursor = 'pointer';
          hit.addEventListener('pointerup', () => onSeg(sg));
          svg.append(hit);
        });
        points.forEach((p) => {
          svg.append(S('circle', { cx: p.x, cy: p.y, r: u * 0.18, fill: '#fff', stroke: '#3b2a1e', 'stroke-width': u * 0.05 }));
          const dx = p.x - cx, dy = p.y - cy, dl = Math.hypot(dx, dy) || 1;
          const t = S('text', { x: p.x + (dx / dl) * u * 0.7, y: p.y + (dy / dl) * u * 0.7 + u * 0.26, 'font-size': u * 0.72, 'text-anchor': 'middle', fill: '#3b2a1e', 'font-family': 'Jua, sans-serif' });
          t.textContent = p.name; t.style.pointerEvents = 'none';
          svg.append(t);
        });
      };
      const nm = (sg) => `선분 ${sg.a.name}${sg.b.name}`;
      function onSeg(sg) {
        if (color.has(sg.id)) { say(`${nm(sg)}에는 벌써 본드를 칠했어요.`); return; }
        if (!sel) { sel = sg; sfx('click'); draw(); say(`${nm(sg)}을 골랐어요. 접었을 때 이 선분과 만나는 선분을 눌러요.`); return; }
        if (sel === sg) { sel = null; draw(); return; }
        const a = sel; sel = null; hintSeg = null;
        if (a.partner === sg.id) {
          const c = COLORS[glued.length % COLORS.length];
          color.set(a.id, c); color.set(sg.id, c);
          glued.push(a);
          money(-a.len * COST.glue, '본드');
          sfx('tape');
          // 겹치는 점도 알려 준다
          const pair = [a.a, a.b].map((p) => `점 ${p.name}은 점 ${[sg.a, sg.b].find((q) => q.k3 === p.k3).name}과`).join(', ');
          upd();
          say(glued.length < total ? `쓱싹! ${nm(a)}과 ${nm(sg)}에 본드를 칠했어요. 접으면 두 선분이 만나요. ${pair} 겹쳐요. (${glued.length}/${total}쌍)`
            : `쓱싹! ${pair} 겹쳐요. ${total}쌍을 모두 찾았어요! 접기 ▶를 눌러요.`, 'happy');
        } else {
          oops(`${nm(a)}과 ${nm(sg)}은 접으면 서로 다른 곳에 가요. 선분 끝의 두 점이 접었을 때 각각 어느 점과 겹칠지 생각해 봐요.`, 0);
        }
        draw();
      }
      draw();
      setSide(h('p', { class: 'hint' }, `🧴 본드 상자는 테이프를 쓰지 않아요. 접었을 때 만나는 선분 짝 ${total}쌍에 모두 본드를 칠해야 상자가 닫혀요. 선분 끝의 두 점이 접으면 각각 어느 점과 겹칠지 생각해 봐요.`),
        h('p', { class: 'hint' }, `본드는 1cm에 ${won(COST.glue)}이에요. 접었을 때 만나는 선분은 길이가 같아요.`), invView());
      say('전개도를 접으면 어떤 선분끼리 만날까요? 만나는 두 선분에 본드를 칠해 봐요!');
    });
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
    if (!tool && !tutorial) say('오른쪽에서 도구를 고르고 상자를 눌러 붙여요. 재료가 없으면 기계에 가서 만들어 와요.');
    tutEv('work');
  }

  function invView() {
    const tapes = Object.entries(inv.tape).filter(([, c]) => c > 0).map(([l, c]) => `${l}cm×${c}`);
    return h('div', { class: 'inv' }, h('b', {}, '🎒 들고 있는 재료'),
      h('p', {}, `🩹 테이프 ${tapes.length ? tapes.join(', ') : '없음'}${inv.roll > 0 ? ` · 🧻 롤 ${inv.roll}cm` : ''}`),
      h('p', {}, `📦 밑면 스티커 ${inv.base}장 · 🏷 옆면 스티커 ${inv.side}장 · ⬆️ 화살표 ${inv.up}장`),
      h('p', {}, `🛡 보호대 ${inv.guard}개 · 🧊 은박 ${inv.foil}장`),
      h('p', { class: 'bagline' + (bagUsed() >= bagCap() ? ' full' : '') }, `🎒 가방 ${bagUsed()}/${bagCap()}칸`));
  }

  function drawWorkSide() {
    if (place !== 'work') return;
    const o = active;
    const tapeCount = Object.values(inv.tape).reduce((a, b) => a + b, 0);
    const tb = (id, label, count) => h('button', { class: 'tool' + (tool === id ? ' sel' : ''), 'data-tool': id, onclick: () => { if (tutBlock('tool', id)) return; tool = id; F.setTool(id); sfx('click'); drawWorkSide(); hintTool(); tutDemoNow(); } }, label, h('small', {}, count));
    setSide(
      h('div', { class: 'tools' },
        tb('tape', '🩹 테이프', `${tapeCount}줄`),
        tb('guard', '🛡 보호대', `${inv.guard}개`),
        tb('base', '📦 밑면 스티커', `${inv.base}장`),
        tb('side', '🏷 옆면 스티커', `${inv.side}장`),
        tb('foil', '🧊 보냉 은박', `${inv.foil}장`),
        tb('up', '⬆️ 화살표', `${inv.up}장`)),
      h('button', { class: 'btn big warn', onclick: tryShip }, '📦 포장 끝! 출고'),
      h('p', { class: 'done-count' }, `붙인 것: 테이프 ${o.taped.size}줄 · 보호대 ${o.guarded.size}개 · 밑면 ${o.baseS.size}장 · 옆면 ${o.sideS.size}장 · 은박 ${o.foilS.size}장 · 화살표 ${o.upS.size}장`),
      comboView(),
      invView(),
      h('p', { class: 'hint' }, '👆 화면을 끌면 둘러보고, ◀ ▶ ▲ ▼로 상자를 굴려요.'));
    tutGlow();
  }

  function comboView() {
    const o = active;
    const t = o && o.net;
    const chainTxt = netChain.length ? netChain.map((x) => x.mark).join(' → ') : '아직 없음';
    let next;
    if (!t) next = `다음 상자를 지금 콤보에 없는 유형으로 접으면 콤보 ${netChain.length + 1}!`;
    else if (netChain.some((x) => x.id === t.id)) next = `이 상자(${t.name})는 콤보에 이미 있는 유형이라, 출고하면 콤보가 1부터 다시 시작돼요.`;
    else next = `이 상자는 ${t.name}! 출고하면 콤보 ${netChain.length + 1}${netChain.length ? ` · 보너스 +${won(comboBonus(netChain.length + 1))}` : ''}`;
    return h('div', { class: 'combobox' },
      h('div', { class: 'row' }, h('b', { style: 'flex:1' }, `📐 전개도 콤보 ${netChain.length}`), h('button', { class: 'btn ghost small', onclick: () => openNetGuide() }, '유형 보기')),
      h('p', {}, `이어 온 유형: ${chainTxt}`),
      h('p', {}, next));
  }

  function hintTool() {
    if (tool === 'tape') say('모서리를 손가락으로 쓱 그어서 테이프를 붙여요. 눌러도 붙어요. 모서리는 면과 면이 만나는 선분이에요. 그 모서리의 길이와 같은 테이프가 필요해요.');
    else if (tool === 'guard') say('보호대를 끼울 꼭짓점을 눌러요. 꼭짓점은 모서리와 모서리가 만나는 점이에요.');
    else if (tool === 'base') say('밑면 스티커(쌓는 면)는 밑면에 붙여요. 창고에서는 밑면끼리 맞닿게 상자를 쌓아요. 직육면체에서 서로 평행한 두 면이 밑면이에요. 파란 "밑면" 도장이 찍힌 면과, 그 면과 평행한 면을 찾아요.');
    else if (tool === 'side') say('옆면 스티커는 옆면에 붙여요. 옆면은 밑면과 만나는 면이고, 밑면과 수직이에요.');
    else if (tool === 'foil') say('보냉 은박은 냉장 물건 상자의 면마다 붙여요. 직육면체의 면은 모두 몇 개일까요? 굴려 가며 빠짐없이 붙여요.');
    else if (tool === 'up') say('⬆️ 화살표 스티커는 옆면에 붙이면 밑면의 반대쪽(위)을 가리켜요. 밑면과 수직인 옆면을 찾아요.');
  }

  // 붙일 때마다 한 음씩 올라가고, 다 붙이면 화음
  function stuck(n, all, label) {
    pip(n);
    const f = h('div', { class: 'jcount' }, `${n}/${all}`);
    juice.querySelectorAll('.jcount').forEach((x) => x.remove());
    gone(f, 700);
    if (n === all) { setTimeout(chime, 120); banner(label); }
  }
  function useTool(hit, stroke = false) {
    const o = active;
    if (!o || o.phase !== 'packing') return;
    if (!tool) { say('먼저 오른쪽에서 도구를 골라요.'); return; }
    if (tool === 'tape' && hit.type === 'edge') {
      const e = hit.edge;
      if (o.taped.has(e.id)) { say(o.seal === 'glue' ? (e.hinge ? '접힌 모서리라 붙일 필요가 없어요.' : '이 모서리는 본드로 붙였어요.') : '이 모서리는 벌써 붙였어요.'); return; }
      if (!inv.tape[e.len] && inv.roll >= e.len) {
        inv.roll -= e.len;
        o.taped.add(e.id); F.addTape(e, !stroke); if (!stroke) sfx('tape', { rate: 0.95 + Math.random() * 0.1 });
        stuck(o.taped.size, 12, '모서리 12개 완성!');
        drawWorkSide(); tutEv('use'); tutDemoNow();
        if (inv.roll < 1) say('🧻 테이프 롤을 다 썼어요.');
        return;
      }
      if (!inv.tape[e.len]) {
        if (inv.roll > 0) { say(`이 모서리는 ${e.len}cm인데 롤이 ${inv.roll}cm밖에 안 남았어요. 테이프 출력기에서 더 뽑아 와요.`, 'sad'); sfx('no'); return; }
        const have = Object.keys(inv.tape).filter((l) => inv.tape[l] > 0);
        say(have.length ? `이 모서리는 ${e.len}cm예요. ${e.len}cm 테이프가 없어요. 테이프 출력기에서 뽑아 와요.` : '테이프가 없어요. 테이프 출력기에 가서 길이와 개수를 넣고 뽑아 와요.', 'sad');
        sfx('no');
        return;
      }
      inv.tape[e.len]--;
      o.taped.add(e.id); F.addTape(e, !stroke); if (!stroke) sfx('tape', { rate: 0.95 + Math.random() * 0.1 });
      stuck(o.taped.size, 12, '모서리 12개 완성!');
    } else if (tool === 'guard' && hit.type === 'corner') {
      if (!o.item.fragile) { say('이 물건은 깨지지 않아서 보호대가 필요 없어요.'); return; }
      if (o.guarded.has(hit.id)) { say('이 꼭짓점에는 벌써 끼웠어요.'); return; }
      if (inv.guard <= 0) { say('보호대가 없어요. 포장재 선반에서 가져와요.', 'sad'); sfx('no'); return; }
      inv.guard--; o.guarded.add(hit.id); F.addGuard(hit); sfx('click');
      stuck(o.guarded.size, 8, '꼭짓점 8개 완성!');
    } else if (tool === 'foil' && hit.type === 'face') {
      if (!o.item.cold) { say('이 물건은 차갑게 보내지 않아서 보냉 은박이 필요 없어요.'); return; }
      if (o.foilS.has(hit.id)) { say('이 면에는 벌써 은박을 붙였어요.'); return; }
      if (inv.foil <= 0) { say('보냉 은박이 없어요. 포장재 선반에서 가져와요.', 'sad'); sfx('no'); return; }
      inv.foil--; o.foilS.add(hit.id); F.addFoil(hit); sfx('tape');
      stuck(o.foilS.size, 6, '면 6개 완성!');
    } else if (tool === 'up' && hit.type === 'face') {
      if (!o.item.up) { say('이 물건은 "이쪽이 위" 표시가 필요 없어요.'); return; }
      if (o.upS.has(hit.id)) { say('이 면에는 벌써 화살표가 있어요.'); return; }
      if (inv.up <= 0) { say('화살표 스티커가 없어요. 스티커 제작기에서 만들어 와요.', 'sad'); sfx('no'); return; }
      inv.up--;
      if (hit.role !== 'side') { oops('여기는 밑면이에요! 화살표는 밑면과 수직인 옆면에 붙여야 위쪽을 가리킬 수 있어요. (스티커 버림)', 0); drawWorkSide(); return; }
      o.upS.add(hit.id); F.addUpArrow(hit); sfx('tape');
      stuck(o.upS.size, 4, '옆면 4개 완성!');
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
      stuck(set.size, want ? 2 : 4, want ? '밑면 2개 완성!' : '옆면 4개 완성!');
    } else return;
    drawWorkSide();
    tutEv('use');
    tutDemoNow();
  }

  function tryShip() {
    const o = active;
    if (!o || place !== 'work') return;
    if (tutBlock('ship')) return;
    sfx('click');
    const miss = [];
    if (o.taped.size < 12) miss.push(o.seal === 'glue' ? '안 붙은 모서리' : '테이프가 안 붙은 모서리');
    if (o.item.fragile && o.guarded.size < 8) miss.push('보호대가 없는 꼭짓점');
    if (o.baseS.size < 2) miss.push('스티커가 없는 밑면');
    if (o.sideS.size < 4) miss.push('스티커가 없는 옆면');
    if (o.item.cold && o.foilS.size < 6) miss.push('은박이 없는 면');
    if (o.item.up && o.upS.size < 4) miss.push('화살표가 없는 옆면');
    if (miss.length) { oops(`검수 불합격! 아직 ${miss.join(', ')}이(가) 있어요. 직육면체의 면·모서리·꼭짓점이 모두 몇 개인지 생각하며 상자를 굴려 봐요.`, 0); return; }
    ship();
  }

  async function ship() {
    const o = active;
    place = 'busy';
    rollPad.classList.add('hidden');
    F.allowRotate = false; F.mode = 'busy'; F.pickables = [];
    setSide(h('p', { class: 'hint' }, '출고 중…'));
    stampMark(o.mistakes === 0);
    sfx('robot');
    F.view('ship');
    await F.ship();
    if (over) return;
    let pay = o.pay;
    const fast = o.left / o.patience > 0.5;
    if (o.loose) pay = Math.round(pay * 0.7 / 100) * 100;
    if (fast) pay += Math.round(o.pay * (save.up.sign ? 0.3 : 0.2) / 100) * 100;
    done++;
    money(pay, fast ? '빠른 배송 팁!' : o.ev === 'urgent' ? '⚡ 급한 주문 2배!' : '');
    if (o.ev === 'regular' && o.mistakes === 0) setTimeout(() => { if (!over) money(EVENTS.regular.tip, '⭐ 단골 손님 팁!'); }, 900);
    shipLog.push({ ev: o.ev || null, seal: o.seal, t: Math.round(total - timeLeft), item: Object.keys(ITEMS).find((k) => ITEMS[k] === o.item), sketch: o.sketch ? 1 : 0, net: o.net ? o.net.id : null, mistakes: o.mistakes, a: o.area });
    sfx('ok');
    sfx('coin');
    coins(o.mistakes === 0 ? 8 : 4);
    if (o.mistakes === 0) confetti(Math.min(48, 18 + netChain.length * 6));
    let comboMsg = '';
    if (o.net) {
      const t = o.net;
      const broke = netChain.some((x) => x.id === t.id);
      const before = netChain.length;
      netChain = broke ? [t] : [...netChain, t];
      bestCombo = Math.max(bestCombo, netChain.length);
      netsToday.add(t.id);
      if (!tutorial) { save.nets = { ...(save.nets || {}), [t.id]: true }; store(); }
      const bonus = comboBonus(netChain.length);
      if (bonus) {
        comboSound(netChain.length); bump(comboEl);
        if (netChain.length >= 3) banner(`📐 콤보 ×${netChain.length}`);
        setTimeout(() => { if (!over || tutorial) money(bonus, `📐 전개도 콤보 ×${netChain.length}!`); }, 600);
        comboMsg = ` 📐 ${t.name} 전개도로 콤보 ${netChain.length}! 보너스 +${won(bonus)}`;
      } else if (broke && before >= 2) comboMsg = ` 📐 ${t.name} 전개도는 콤보에 이미 있던 유형이라 콤보가 1부터 다시 시작해요.`;
      else comboMsg = ` 📐 ${t.name} 전개도! 다음 상자를 다른 유형으로 접으면 콤보 보너스!`;
    }
    checkContract();
    say((o.mistakes === 0 ? `${o.cust}: "완벽한 상자예요! 고마워요!"` : `${o.cust}: "잘 받았어요!"`) + comboMsg, 'happy');
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
    drawHud();
    if (tutorial) { tutEv('ship'); setTimeout(finishTutorial, 1600); }
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
      // 두 가지 방법: ✂️ 길이별로 잘라 뽑기, 🧻 모서리 길이를 모두 더한 총 길이로 롤 하나 뽑기
      let mode = save.tapeMode || 'cut';
      const body = h('div');
      const tabs = h('div', { class: 'row wrap' });
      const draw = () => {
        tabs.innerHTML = ''; body.innerHTML = '';
        [['cut', '✂️ 길이별로 자르기'], ['roll', '🧻 총 길이 롤']].forEach(([m, t]) => tabs.append(h('button', { class: 'tool' + (mode === m ? ' sel' : ''), onclick: () => { if (tutorial && m === 'roll') return; mode = m; save.tapeMode = m; store(); sfx('click'); draw(); } }, t)));
        if (mode === 'cut') {
          const rows = [{ len: 2, cnt: 0 }, { len: 3, cnt: 0 }, { len: 4, cnt: 0 }];
          const sum = h('p', { class: 'sum' });
          const upd = () => { const L = rows.reduce((s, r) => s + r.len * r.cnt, 0), C = rows.reduce((s, r) => s + r.cnt, 0); sum.textContent = `테이프 ${C}줄 · 모두 ${L}cm · 재료 값 ${won(L * COST.tape)}`; };
          body.append(h('p', { class: 'hint' }, `직육면체의 모서리에 붙일 테이프의 길이와 개수를 넣으면 잘라서 나와요. 길이가 같은 모서리가 몇 개씩인지 세어 봐요. (1cm에 ${won(COST.tape)})`),
            ...rows.map((r) => h('div', { class: 'srow' }, h('span', {}, '길이'), stepper(r.len, 1, 9, (v) => { r.len = v; upd(); }, 'cm'), h('span', {}, '개수'), stepper(r.cnt, 0, 12, (v) => { r.cnt = v; upd(); }, '줄'))),
            sum,
            h('div', { class: 'row end' }, close, h('button', { class: 'btn warn', onclick: () => {
              const L = rows.reduce((s, r) => s + r.len * r.cnt, 0);
              if (tutBlock('make:tape', rows)) return;
              if (!L) { say('개수를 넣어야 테이프가 나와요.'); return; }
              if (!bagFits(rows.reduce((s, r) => s + r.cnt, 0))) return;
              rows.forEach((r) => { if (r.cnt) inv.tape[r.len] = (inv.tape[r.len] || 0) + r.cnt; });
              money(-L * COST.tape, '테이프');
              sfx('tape');
              tutEv('made:tape');
              stationDone(`테이프 ${rows.filter((r) => r.cnt).map((r) => `${r.len}cm ${r.cnt}줄`).join(', ')}이 나왔어요!`);
            } }, '출력하기')));
          upd();
        } else {
          let L = 0;
          const num = h('span', { class: 'snum big' }, '0cm');
          const sum = h('p', { class: 'sum' });
          const set = (v) => { L = Math.max(0, Math.min(300, v)); num.textContent = `${L}cm`; sum.textContent = `재료 값 ${won(L * COST.roll)} (자를 때보다 싸요)`; sfx('click'); };
          const b = (d) => holdBtn({ class: 'sbtn wide' }, () => set(L + d), d > 0 ? `+${d}` : `${d}`);
          body.append(h('p', { class: 'hint' }, `붙일 모서리 길이를 모두 더한 만큼 롤로 뽑아요. 모서리에 붙일 때마다 그 길이만큼 잘려 나가요. 모서리 12개를 하나하나 더하지 않고 빨리 구하는 방법은 없을까요? (1cm에 ${won(COST.roll)})`),
            h('div', { class: 'srow center' }, b(-10), b(-1), num, b(1), b(10)),
            sum,
            h('div', { class: 'row end' }, close, h('button', { class: 'btn warn', onclick: () => {
              if (!L) { say('총 길이를 넣어야 롤이 나와요.'); return; }
              if (inv.roll <= 0 && !bagFits(1)) return;
              inv.roll += L;
              money(-L * COST.roll, '테이프 롤');
              sfx('tape');
              stationDone(`🧻 ${L}cm 테이프 롤이 나왔어요! 지금 롤은 모두 ${inv.roll}cm예요.`);
            } }, '롤 뽑기')));
          set(0);
        }
      };
      panel.append(h('h3', {}, '🩹 테이프 출력기'), tabs, body);
      if (tutorial) mode = 'cut';
      draw();
    } else if (id === 'sticker') {
      let b = 0, s = 0, u = 0;
      const sum = h('p', { class: 'sum' });
      const upd = () => { sum.textContent = `${b + s + u}장 · 재료 값 ${won((b + s + u) * COST.sticker)} · 🎒 ${bagUsed()}/${bagCap()}칸`; };
      panel.append(h('h3', {}, '🏷 스티커 제작기'), h('p', { class: 'hint' }, `📦 밑면 스티커(쌓는 면)는 밑면마다, 🏷 옆면 스티커(취급주의)는 옆면마다 붙여요. 창고에서는 밑면끼리 맞닿게 상자를 쌓거든요. 밑면과 옆면은 각각 몇 개일까요? (1장에 ${won(COST.sticker)})`),
        h('div', { class: 'srow' }, h('span', {}, '📦 밑면 스티커'), stepper(0, 0, 12, (v) => { b = v; upd(); }, '장')),
        h('div', { class: 'srow' }, h('span', {}, '🏷 옆면 스티커'), stepper(0, 0, 12, (v) => { s = v; upd(); }, '장')),
        h('div', { class: 'srow' }, h('span', {}, '⬆️ 화살표(이쪽이 위)'), stepper(0, 0, 12, (v) => { u = v; upd(); }, '장')),
        sum,
        h('div', { class: 'row end' }, close, h('button', { class: 'btn warn', onclick: () => {
          if (tutBlock('make:sticker', [b, s, u])) return;
          if (!b && !s && !u) { say('몇 장 만들지 넣어요.'); return; }
          if (!bagFits(b + s + u)) return;
          inv.base += b; inv.side += s; inv.up += u;
          money(-(b + s + u) * COST.sticker, '스티커');
          sfx('click');
          tutEv('made:sticker');
          stationDone(`밑면 스티커 ${b}장, 옆면 스티커 ${s}장${u ? `, 화살표 스티커 ${u}장` : ''}을 만들었어요!`);
        } }, '만들기')));
      upd();
    } else if (id === 'guard') {
      let g = 0, fo = 0;
      const sum = h('p', { class: 'sum' });
      const upd = () => { sum.textContent = `재료 값 ${won(g * COST.guard + fo * COST.foil)} · 🎒 ${bagUsed()}/${bagCap()}칸`; };
      panel.append(h('h3', {}, '🛡 포장재 선반'), h('p', { class: 'hint' }, `깨지기 쉬운 물건은 꼭짓점마다 꼭짓점 보호대를, 차갑게 보내는 물건은 면마다 보냉 은박을 붙여요. (보호대 1개 ${won(COST.guard)}, 은박 1장 ${won(COST.foil)})`),
        h('div', { class: 'srow' }, h('span', {}, '🛡 꼭짓점 보호대'), stepper(0, 0, 16, (v) => { g = v; upd(); }, '개')),
        h('div', { class: 'srow' }, h('span', {}, '🧊 보냉 은박'), stepper(0, 0, 12, (v) => { fo = v; upd(); }, '장')),
        sum,
        h('div', { class: 'row end' }, close, h('button', { class: 'btn warn', onclick: () => {
          if (tutBlock('make:guard')) return;
          if (!g && !fo) { say('몇 개 가져갈지 넣어요.'); return; }
          if (!bagFits(g + fo)) return;
          inv.guard += g; inv.foil += fo;
          money(-(g * COST.guard + fo * COST.foil), '포장재');
          sfx('click');
          tutEv('made:guard');
          stationDone(`포장재를 챙겼어요! ${[g ? `보호대 ${g}개` : '', fo ? `보냉 은박 ${fo}장` : ''].filter(Boolean).join(', ')}`);
        } }, '가져가기')));
      upd();
    }
    setSideIdle();
    tutGlow();
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
    music.duck(paused);
    if (paused || over) return;
    if (tutorial) {
      // 연습: 시간이 흐르지 않고 주문은 하나만
      if (orderSeq === 0) spawn();
      drawTickets(); tutGlow();
      return;
    }
    const before = timeLeft;
    timeLeft -= dt;
    spawnIn -= dt;
    music.hurry(timeLeft < 30);
    if (timeLeft < 10 && timeLeft > 0 && Math.ceil(before) !== Math.ceil(timeLeft)) tick();
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

  // 🎨 공장 꾸미기: 근무 중에도 열 수 있다. 여는 동안 시간은 멈추고, 고르면 공장이 바로 바뀐다
  function openDecor(back) {
    if (over) return;
    const was = paused;
    paused = true;
    const cash = h('b', {}, won(save.money));
    const list = h('div', { class: 'shop decor-pop' });
    const close = () => { ov.remove(); if (back) back(); else { paused = was; lastT = performance.now(); } };
    fillDecor(list, () => { cash.textContent = won(save.money); F.setDecor(save.decor || {}); });
    const ov = h('div', { class: 'overlay' }, h('div', { class: 'card decor-card' },
      h('div', { class: 'row' }, h('h2', {}, '🎨 공장 꾸미기'), h('span', { class: 'pill' }, '💰 ', cash)),
      h('p', { class: 'muted' }, '고르면 공장이 바로 바뀌어요. 여는 동안은 시간이 멈춰요.'),
      list,
      h('div', { class: 'row end' }, h('button', { class: 'btn', onclick: () => { sfx('click'); close(); } }, '다 꾸몄어요'))));
    root.append(ov);
  }

  function pause() {
    if (over) return;
    paused = true;
    const ov = h('div', { class: 'overlay' }, h('div', { class: 'card pause' },
      h('h2', {}, '잠깐 쉬기'),
      h('div', { class: 'col' },
        h('button', { class: 'btn', onclick: () => { sfx('click'); ov.remove(); paused = false; lastT = performance.now(); } }, '계속하기'),
        tutorial ? null : h('button', { class: 'btn ghost', onclick: () => { sfx('click'); ov.remove(); openDecor(pause); } }, '🎨 공장 꾸미기'),
        h('button', { class: 'btn ghost', onclick: () => { sfx('click'); playDay(n, opts); } }, tutorial ? '연습 처음부터' : '오늘 처음부터'),
        h('button', { class: 'btn ghost', onclick: () => { sfx('click'); showTitle(); } }, '처음 화면'),
        settingBtns(() => { F.shakeOn = save.shake; })),
      creditLine()));
    root.append(ov);
  }

  async function endDay() {
    if (over) return;
    over = true;
    clearInterval(timer);
    music.stop(); tapeStop();
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
    if (save.offers) delete save.offers[n];
    store();
    sfx(pass ? 'clear' : 'no');
    if (pass) confetti(stars === 3 ? 48 : 28);
    // 랭킹에 올리기: 점수 대신 출고 기록을 보내고, 서버가 다시 계산해서 순위를 알려 준다
    const rankLi = !tutorial && rankOn() ? h('li', { class: 'rankline' }, save.rank ? '🏆 랭킹에 올리는 중…' : '🏆 시작 화면의 🏆 랭킹에서 닉네임을 만들면 랭킹에 올라가요.') : null;
    if (rankLi && save.rank) {
      if (!rankToken) rankLi.textContent = '🏆 ' + (rankStartMsg || '랭킹 서버와 연결이 안 돼서 이번 기록은 올라가지 않아요.');
      else call({ act: 'submit', ...rankQ(), day: n, token: rankToken, log: shipLog, earned, contract: contract ? contract.id : '' }).then((r) => {
        rankLi.textContent = r.ok ? `🏆 ${n}일차 매출 전체 ${r.myRank}위! (완벽한 상자 ${r.perfect}개 · 최고 콤보 ${r.bestCombo})` : `🏆 ${r.msg}`;
      });
    }
    const left = bagUsed();
    root.append(h('div', { class: 'overlay' }, h('div', { class: 'card big-card' },
      h('p', { class: 'kicker' }, `${n}일차 근무 끝`),
      h('h2', {}, pass ? '목표 달성! 🎉' : '목표에 조금 모자라요'),
      h('p', { class: 'big-stars' }, '★'.repeat(stars) + '☆'.repeat(3 - stars)),
      h('ul', { class: 'stats' },
        h('li', {}, `오늘 매출 ${won(earned)} (목표 ${won(cfg.target)}, 재료 값 뺀 금액)`),
        h('li', {}, `보낸 상자 ${done}개 · 놓친 주문 ${missed}개`),
        h('li', {}, `📐 오늘 만든 전개도 유형 ${netsToday.size}가지 · 최고 콤보 ${bestCombo} · 지금까지 모은 유형 ${Object.keys(save.nets || {}).length}/11`),
        contract ? h('li', {}, `📜 계약 「${contractText(contract)}」 ${contractDone ? `성공! +${won(contractReward(contract, cfg.target))}` : `${Math.min(contract.need, contractCount(contract, shipLog))}/${contract.need} — 다음에 다시 도전해요`}`) : null,
        left ? h('li', {}, `쓰지 못하고 남은 재료 ${left}개`) : null,
        h('li', {}, `모은 돈 ${won(save.money)}`), rankLi),
      h('div', { class: 'row end wrap' },
        h('button', { class: 'btn ghost', onclick: () => { sfx('click'); showTitle(); showIntro(n); } }, '다시 하기'),
        h('button', { class: 'btn ghost', onclick: () => { sfx('click'); showShop(showTitle); } }, '🛒 상점'),
        pass ? h('button', { class: 'btn', onclick: () => { sfx('click'); showTitle(); showIntro(n + 1); } }, `${n + 1}일차로 ▶`) : null))));
  }

  if (tutorial) root.append(hand);
  cleanup = () => { over = true; music.stop(); tapeStop(); clearInterval(timer); clearTimeout(demoTimer); F.dispose(); };
  setSideIdle();
  drawHud();
  drawTickets();
  markNav();
  if (tutorial) tutDraw();
  else say(n === 1 ? '곧 첫 주문이 들어와요! 주문 쪽지가 오면 눌러요.' : '오늘도 힘내요! 주문 쪽지를 눌러 시작해요.');
  if (TEST) window.__game = { F, inv, get place() { return place; }, get active() { return active; }, get orders() { return orders; }, pick: pickOrder, get cutter() { return cutter; }, doCut, get tutStep() { return tutStep; }, tutDemo: () => tutDemo(), get netChain() { return netChain; }, goTo, useTool, tryShip, endDay, setTime: (t) => { timeLeft = t; } }; // 점검 봇(?test=1)에서만 게임 속을 연다
}

if (TEST) window.__factory = { save, showTitle, playDay, showShop, music }; // F12에서 게임을 조작하지 못하게, 점검 봇(?test=1)에서만 연다
try { sessionStorage.removeItem('rbf-reload'); } catch (_) { /* 무시 */ }
showTitle();
setTimeout(() => loadWork().catch(() => {}), 600);
