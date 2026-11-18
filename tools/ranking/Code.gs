/**
 * 로봇 상자 공장 — 반 랭킹 서버 (구글 Apps Script + 구글 시트)
 *
 * 하는 일
 *  - join   : 반 코드 + 별명 + 4자리 비밀번호 등록·확인 (남의 별명으로 점수를 못 올리게)
 *  - start  : 근무를 시작할 때 일회용 근무표(token)를 준다
 *  - submit : 근무가 끝나면 "출고 기록"을 받아 서버에서 다시 계산·검사한 뒤 저장한다
 *  - top    : 반별 랭킹 (일차별 매출, 최고 콤보, 완벽한 상자, 전개도 수집, 최고 도달 일차)
 *
 * 점수 조작 막기
 *  - 패드가 보낸 점수를 믿지 않는다. 출고 기록(물건·전개도·실수·시각)으로 서버가 다시 계산한다.
 *  - 근무 시간이 다 지나기 전 제출, 같은 근무표 두 번 제출, 그날 나오지 않는 물건,
 *    그날 올 수 있는 주문 수보다 많은 상자, 너무 빠른 출고 간격, 계산한 최대 매출보다 큰 매출 → 거절
 *
 * ⚠ js/data.js의 물건·근무일·값을 바꾸면 아래 표(ITEMS, DAYS, COST 등)도 똑같이 바꿔야 한다.
 */

// ---------- 게임 자료 (js/data.js와 같아야 함) ----------
var ITEMS = {
  puzzle: { d: [2, 2, 2] },
  mug: { d: [3, 3, 3], fragile: 1 },
  clock: { d: [3, 3, 3], fragile: 1 },
  shoe: { d: [5, 2, 3] },
  robot: { d: [3, 4, 2] },
  book: { d: [5, 1, 4] },
  phone: { d: [3, 1, 5], fragile: 1 },
  plant: { d: [2, 3, 2], fragile: 1, up: 1 },
  bear: { d: [4, 3, 4] },
  cake: { d: [4, 2, 4], fragile: 1, cold: 1 },
  globe: { d: [4, 4, 4], fragile: 1 },
  game: { d: [4, 1, 2] },
  umbrella: { d: [1, 1, 6] },
  milk: { d: [2, 4, 2], cold: 1, up: 1 },
  pizza: { d: [5, 1, 5], up: 1 },
  icecream: { d: [3, 2, 2], cold: 1 },
  blocks: { d: [6, 2, 3] },
  frame: { d: [4, 5, 1], fragile: 1, up: 1 },
};
var DAYS = [
  { items: ['puzzle', 'mug'], time: 330, every: 70, target: 4000 },
  { items: ['puzzle', 'mug', 'shoe', 'robot'], time: 330, every: 60, target: 7000 },
  { items: ['shoe', 'robot', 'book', 'phone', 'plant'], time: 330, every: 55, target: 9000 },
  { items: ['mug', 'bear', 'cake', 'globe', 'book', 'game'], time: 360, every: 50, target: 12000 },
  { items: ['icecream', 'milk', 'cake', 'pizza', 'plant', 'frame', 'mug'], time: 360, every: 52, target: 13000 },
  { items: ['umbrella', 'blocks', 'shoe', 'robot', 'book', 'game', 'milk', 'pizza'], time: 360, every: 50, target: 14000, sketch: 1 },
];
var COST = { tape: 10, sticker: 50, guard: 60, foil: 40 };
var COMBO_STEP = 300, COMBO_MAX = 1500, SKETCH_PAY = 300, TRUCK_PLUS = 30, MAX_TIP = 0.3;
var MIN_GAP = 15;          // 상자 하나를 출고하는 데 걸리는 가장 짧은 시간(초)
var NET_COUNT = 11;        // 정육면체 전개도 유형 수

// ---------- 시트 ----------
function sheet(name, head) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.appendRow(head); sh.setFrozenRows(1); }
  return sh;
}
var H = {
  players: ['반', '별명', '비밀번호(암호화)', '처음 등록'],
  sessions: ['근무표', '반', '별명', '일차', '시작 시각', '제출함'],
  scores: ['제출 시각', '반', '별명', '일차', '매출', '보낸 상자', '완벽한 상자', '최고 콤보', '만든 전개도', '목표 달성', '출고 기록'],
  rejected: ['시각', '반', '별명', '일차', '거절 이유', '보낸 내용'],
};

function dayConfig(n) {
  if (n <= DAYS.length) return DAYS[n - 1];
  var k = n - DAYS.length;
  return { items: Object.keys(ITEMS), time: 360, every: Math.max(32, 48 - k * 2), target: 12000 + k * 2500, sketch: 1 };
}
function payFor(it) {
  var a = it.d[0], b = it.d[1], c = it.d[2];
  return Math.round((1500 + 60 * 2 * (a * b + b * c + a * c) + (it.fragile ? 600 : 0) + (it.cold ? 500 : 0) + (it.up ? 300 : 0)) / 100) * 100;
}
function minMaterial(it) {
  var a = it.d[0], b = it.d[1], c = it.d[2];
  return 4 * (a + b + c) * COST.tape + 6 * COST.sticker + (it.fragile ? 8 * COST.guard : 0) + (it.cold ? 6 * COST.foil : 0) + (it.up ? 4 * COST.sticker : 0);
}
function maxOrders(cfg) { return 1 + Math.floor((cfg.time + TRUCK_PLUS - 42) / cfg.every); }
function hashPin(cls, nick, pin) {
  var raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, 'rbf|' + cls + '|' + nick + '|' + pin);
  return raw.map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('');
}
function clean(s, max) { return String(s || '').replace(/[<>"'`\\]/g, '').trim().slice(0, max); }

// ---------- 입구 ----------
function doGet(e) {
  var out;
  try {
    var q = JSON.parse((e && e.parameter && e.parameter.q) || '{}');
    out = route(q);
  } catch (err) { out = { ok: false, msg: '서버 오류: ' + err }; }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function route(q) {
  var cls = clean(q.cls, 12), nick = clean(q.nick, 10);
  if (q.act === 'top') return top(cls, q.cat, Number(q.day) || 1, nick);
  if (!cls || !nick) return { ok: false, msg: '반 코드와 별명을 넣어 주세요.' };
  if (!/^\d{4}$/.test(String(q.pin || ''))) return { ok: false, msg: '비밀번호는 숫자 4자리예요.' };
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var who = checkPlayer(cls, nick, String(q.pin));
    if (!who.ok) return who;
    if (q.act === 'join') return { ok: true, msg: who.isNew ? '별명을 등록했어요!' : '다시 만나서 반가워요!' };
    if (q.act === 'start') return start(cls, nick, Number(q.day));
    if (q.act === 'submit') return submit(cls, nick, q);
    return { ok: false, msg: '알 수 없는 요청' };
  } finally { lock.releaseLock(); }
}

function checkPlayer(cls, nick, pin) {
  var sh = sheet('players', H.players);
  var rows = sh.getDataRange().getValues();
  var hp = hashPin(cls, nick, pin);
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][0] === cls && rows[i][1] === nick) {
      return rows[i][2] === hp ? { ok: true } : { ok: false, msg: '이 반에 같은 별명이 이미 있어요. 비밀번호가 틀렸거나, 다른 별명을 써야 해요.' };
    }
  }
  sh.appendRow([cls, nick, hp, new Date()]);
  return { ok: true, isNew: true };
}

function start(cls, nick, day) {
  if (!(day >= 1 && day <= 99)) return { ok: false, msg: '일차가 이상해요.' };
  var sh = sheet('sessions', H.sessions);
  var token = Utilities.getUuid();
  sh.appendRow([token, cls, nick, day, Date.now(), '']);
  return { ok: true, token: token };
}

// ---------- 제출 검사 ----------
function submit(cls, nick, q) {
  var day = Number(q.day), cfg = dayConfig(day);
  var fail = function (why) {
    sheet('rejected', H.rejected).appendRow([new Date(), cls, nick, day, why, JSON.stringify(q).slice(0, 4000)]);
    return { ok: false, msg: '기록을 올리지 못했어요: ' + why };
  };
  // 1) 근무표
  var ss = sheet('sessions', H.sessions), rows = ss.getDataRange().getValues(), row = -1;
  for (var i = rows.length - 1; i >= 1; i--) if (rows[i][0] === q.token) { row = i; break; }
  if (row < 0) return fail('근무표가 없어요');
  var r = rows[row];
  if (r[1] !== cls || r[2] !== nick || Number(r[3]) !== day) return fail('근무표 주인이 달라요');
  if (r[5]) return fail('이미 제출한 근무예요');
  ss.getRange(row + 1, 6).setValue('예');
  var elapsed = (Date.now() - Number(r[4])) / 1000;
  if (elapsed < cfg.time - 15) return fail('근무 시간이 끝나기 전에 제출했어요');
  if (elapsed > 3 * 3600) return fail('근무를 시작한 지 너무 오래됐어요');
  // 2) 출고 기록
  var log = Array.isArray(q.log) ? q.log : [];
  if (log.length > maxOrders(cfg)) return fail('그날 올 수 있는 주문보다 상자가 많아요');
  var last = -MIN_GAP, maxRev = 0, chain = [], bestCombo = 0, perfect = 0, nets = {};
  for (var j = 0; j < log.length; j++) {
    var b = log[j], it = ITEMS[b.item];
    if (!it || cfg.items.indexOf(b.item) < 0) return fail('그날 나오지 않는 물건이 있어요');
    if (b.sketch && !cfg.sketch) return fail('겨냥도 주문이 없는 날이에요');
    var t = Number(b.t);
    if (!(t >= 5 && t <= cfg.time + TRUCK_PLUS + 5)) return fail('출고 시각이 근무 시간 밖이에요');
    if (t - last < MIN_GAP) return fail('상자를 너무 빨리 출고했어요');
    last = t;
    var pay = payFor(it) + (b.sketch ? SKETCH_PAY : 0);
    maxRev += pay + Math.round(pay * MAX_TIP / 100) * 100 - minMaterial(it);
    if (b.net != null) {
      var n = Number(b.net);
      if (!(n >= 1 && n <= NET_COUNT)) return fail('전개도 유형이 이상해요');
      nets[n] = 1;
      chain = chain.indexOf(n) >= 0 ? [n] : chain.concat([n]);
      bestCombo = Math.max(bestCombo, chain.length);
      maxRev += Math.min(COMBO_MAX, Math.max(0, chain.length - 1) * COMBO_STEP);
    }
    if (Number(b.mistakes) === 0) perfect++;
  }
  // 3) 매출: 기록으로 계산한 최대치를 넘으면 조작
  var earned = Math.round(Number(q.earned) || 0);
  if (earned > maxRev + 100) return fail('매출이 출고 기록보다 많아요');
  var netList = Object.keys(nets).join(',');
  sheet('scores', H.scores).appendRow([new Date(), cls, nick, day, earned, log.length, perfect, bestCombo, netList,
    earned >= cfg.target ? '예' : '', JSON.stringify(log).slice(0, 4000)]);
  var rank = top(cls, 'day', day, nick);
  return { ok: true, earned: earned, perfect: perfect, bestCombo: bestCombo, myRank: rank.myRank, total: rank.rows.length };
}

// ---------- 랭킹 ----------
function top(cls, cat, day, me) {
  var rows = sheet('scores', H.scores).getDataRange().getValues().slice(1).filter(function (x) { return x[1] === cls; });
  var by = {};
  rows.forEach(function (x) {
    var nick = x[2], p = by[nick] || (by[nick] = { nick: nick, day: 0, combo: 0, perfect: 0, nets: {}, reach: 0 });
    if (Number(x[3]) === day) p.day = Math.max(p.day, Number(x[4]));
    p.combo = Math.max(p.combo, Number(x[7]));
    p.perfect += Number(x[6]);
    String(x[8] || '').split(',').forEach(function (n) { if (n) p.nets[n] = 1; });
    if (x[9] === '예') p.reach = Math.max(p.reach, Number(x[3]));
  });
  var list = Object.keys(by).map(function (k) {
    var p = by[k];
    var v = cat === 'combo' ? p.combo : cat === 'perfect' ? p.perfect : cat === 'nets' ? Object.keys(p.nets).length : cat === 'reach' ? p.reach : p.day;
    return { nick: p.nick, v: v };
  }).filter(function (x) { return x.v > 0; });
  list.sort(function (a, b) { return b.v - a.v; });
  var myRank = 0;
  list.forEach(function (x, i) { x.rank = i > 0 && list[i - 1].v === x.v ? list[i - 1].rank : i + 1; if (x.nick === me) myRank = x.rank; });
  return { ok: true, rows: list.slice(0, 30), myRank: myRank };
}
