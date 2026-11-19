/**
 * 로봇 상자 공장 — 반 랭킹 서버 (구글 Apps Script + 구글 시트)
 *
 * 하는 일
 *  - join   : 조합형 닉네임(단어 번호 4개) 등록·확인. 주인은 기기 열쇠의 해시로 확인한다
 *             (전역 지침: 학생이 글자를 직접 쓰지 않으므로 실명·나쁜 말이 들어갈 수 없다)
 *  - start  : 근무를 시작할 때 일회용 근무표(token)를 준다
 *  - submit : 근무가 끝나면 "출고 기록"을 받아 서버에서 다시 계산·검사한 뒤 저장한다
 *  - top    : 전체 랭킹 (일차별 매출, 최고 콤보, 완벽한 상자, 전개도 수집, 최고 도달 일차)
 *
 * 점수 조작 막기
 *  - 패드가 보낸 점수를 믿지 않는다. 출고 기록(물건·전개도·실수·시각)으로 서버가 다시 계산한다.
 *  - 근무 시간이 다 지나기 전 제출, 같은 근무표 두 번 제출, 그날 나오지 않는 물건,
 *    그날 올 수 있는 주문 수보다 많은 상자, 너무 빠른 출고 간격, 계산한 최대 매출보다 큰 매출 → 거절
 *
 * ⚠ js/data.js의 물건·근무일·값, js/nickwords.js의 닉네임 단어를 바꾸면 python tools/ranking/sync.py로
 *   아래 표(ITEMS, DAYS, COST, NICK_WORDS)를 맞추고 Apps Script를 새 버전으로 배포해야 한다.
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
var COST = { tape: 10, sticker: 50, guard: 60, foil: 40, roll: 8, glue: 5 };
var COMBO_STEP = 300, COMBO_MAX = 1500, SKETCH_PAY = 300, TRUCK_PLUS = 30, MAX_TIP = 0.3;
var REGULAR_TIP = 500;      // 단골 손님: 실수 없이 보내면 팁 (js/data.js EVENTS.regular.tip)
var MAX_EVENT_SHARE = 0.5; // 급한 주문·단골 손님은 많아야 상자의 절반쯤
var MIN_GAP = 15;          // 상자 하나를 출고하는 데 걸리는 가장 짧은 시간(초)
var NET_COUNT = 11;        // 정육면체 전개도 유형 수

// ---------- 조합형 닉네임 (js/nickwords.js와 같아야 함: sync.py가 채운다) ----------
var NICK_WORDS = {"color": ["민트빛", "칠흑의", "황금빛", "파스텔", "형광색", "보랏빛", "투명한", "노을빛", "하늘빛", "은빛", "무지갯빛", "진홍빛", "연둣빛", "새하얀", "바닷빛", "별빛", "달빛", "햇살빛", "복숭앗빛", "레몬빛", "초록빛", "산호빛", "라벤더빛", "청록빛", "구릿빛", "샛노란", "오로라빛", "벚꽃빛", "단풍빛", "쪽빛", "주황빛", "우윳빛", "크림빛", "숲빛", "비취빛", "호박빛", "은하수빛", "진주빛", "새파란", "분홍빛", "초콜릿빛", "솜사탕빛", "봄빛", "눈빛", "푸른", "붉은", "하얀", "노란"], "like": ["보드게임 즐기는", "떡볶이 좋아하는", "노래 부르는", "수학을 사랑하는", "야식을 탐내는", "코딩하는", "젤리 좋아하는", "책 읽는", "그림 그리는", "축구하는", "피아노 치는", "줄넘기하는", "춤추는", "요리하는", "별을 보는", "공룡 박사인", "곤충을 관찰하는", "식물을 키우는", "블록 쌓는", "종이접기하는", "퍼즐 푸는", "역사를 탐험하는", "박물관 좋아하는", "유물을 찾는", "지도를 그리는", "여행을 꿈꾸는", "수영하는", "자전거 타는", "농구하는", "배드민턴 치는", "달리기하는", "태권도하는", "바둑 두는", "체스 두는", "만화 그리는", "동화를 쓰는", "시를 쓰는", "일기 쓰는", "사진 찍는", "우쿨렐레 치는", "리코더 부는", "드럼 치는", "콧노래 부르는", "과학 실험하는", "로봇 만드는", "발명하는", "우주를 꿈꾸는", "바다를 좋아하는", "산을 오르는", "캠핑 가는", "낚시하는", "김밥 싸는", "아이스크림 좋아하는", "붕어빵 좋아하는", "귤 좋아하는", "수박 좋아하는", "딸기 좋아하는", "호떡 좋아하는", "쿠키 굽는", "핫초코 마시는", "라면 끓이는", "볶음밥 만드는", "고구마 좋아하는", "감자 좋아하는", "옥수수 좋아하는", "팝콘 좋아하는", "강아지 좋아하는", "고양이 좋아하는", "꽃을 가꾸는", "구름을 세는", "낮잠 자는", "수수께끼 내는", "퀴즈 푸는", "탐정놀이 하는", "보물을 찾는", "마술하는", "노을을 보는", "비눗방울 부는", "연날리기 하는", "눈사람 만드는", "줄다리기 하는", "팽이 돌리는", "공기놀이 하는", "제기 차는", "윷놀이 하는", "딱지 치는", "실뜨기 하는", "썰매 타는", "스케이트 타는", "인라인 타는", "탁구 치는", "야구하는", "배구하는", "피구하는", "등산하는", "산책하는", "별자리 찾는", "돌멩이 모으는", "스티커 모으는", "우표 모으는", "조개 줍는", "나뭇잎 모으는", "화석을 찾는", "고분을 탐사하는", "탑을 그리는", "도자기 빚는", "한자 공부하는", "영어 공부하는", "받아쓰기 잘하는", "구구단 외우는", "과일 깎는", "샌드위치 만드는", "케이크 굽는", "주먹밥 만드는", "만두 빚는", "떡 좋아하는", "송편 빚는", "수제비 좋아하는", "팥빙수 좋아하는", "식혜 마시는", "기타 치는", "바이올린 켜는", "하모니카 부는", "노래 만드는", "동요 부르는", "랩 하는", "박수 치는", "휘파람 부는", "실로폰 치는", "장구 치는"], "mood": ["전설의", "엉뚱한", "느긋한", "위풍당당한", "수줍은", "재빠른", "천재적인", "씩씩한", "용감한", "다정한", "똑똑한", "명랑한", "신비로운", "차분한", "부지런한", "호기심 많은", "행복한", "꿈꾸는", "상냥한", "활발한", "든든한", "웃음 많은", "친절한", "슬기로운", "날쌘", "침착한", "유쾌한", "귀여운", "멋진", "늠름한", "끈기 있는", "성실한", "기운찬", "포근한", "당당한", "지혜로운", "상상력 넘치는", "꼼꼼한", "대담한", "졸린", "배고픈", "빛나는", "즐거운", "신나는", "조용한", "평화로운", "반가운", "사랑스러운", "듬직한", "재치 있는", "센스 있는", "깜찍한", "총명한", "부드러운", "튼튼한", "날렵한", "산뜻한", "말랑말랑한", "보송보송한", "반짝반짝한"], "who": ["고양이", "드래곤", "펭귄", "마법사", "너구리", "해적", "탐정", "슬라임", "개발자", "강아지", "토끼", "다람쥐", "판다", "수달", "고래", "돌고래", "거북이", "부엉이", "독수리", "여우", "사슴", "기린", "코끼리", "사자", "호랑이", "곰", "햄스터", "알파카", "미어캣", "카멜레온", "공룡", "유니콘", "로봇", "우주인", "기사", "탐험가", "고고학자", "박물관장", "역사가", "화가", "요리사", "과학자", "발명가", "음악가", "작가", "시인", "선장", "비행사", "정원사", "등대지기", "우체부", "사서", "천문학자", "마술사", "요정", "도깨비", "해태", "봉황", "장수풍뎅이", "무당벌레", "나비", "반딧불이", "해파리", "문어", "상어", "앵무새", "참새", "까치", "두루미", "백조", "홍학", "코알라", "캥거루", "고슴도치", "두더지", "아기 양", "아기 염소", "망아지", "병아리", "오리", "청설모", "물개", "바다사자", "북극곰", "눈표범", "치타", "얼룩말", "하마", "낙타", "라마", "거북선 선장", "탐사대장", "해설사", "큐레이터", "복원 전문가", "지도 제작자", "파수꾼", "수호신", "용사", "모험가"]};
var NICK_KEYS = ['color', 'like', 'mood', 'who'];
var LIMIT_NEW_PER_DEVICE_HOUR = 10;   // 기기 하나: 1시간에 새 닉네임 10개까지
var LIMIT_NEW_PER_10MIN = 80;         // 전체: 10분에 새 닉네임 80개까지
function parseNick(id) {
  var ix = String(id || '').split('-').map(Number);
  if (ix.length !== 4) return null;
  for (var k = 0; k < 4; k++) if (!(ix[k] >= 0 && ix[k] % 1 === 0 && ix[k] < (NICK_WORDS[NICK_KEYS[k]] || []).length)) return null;
  return ix;
}
function nickText(ix) { return ix.map(function (n, k) { return NICK_WORDS[NICK_KEYS[k]][n]; }).join(' '); }
function nameOf(id) { var ix = parseNick(id); return ix ? nickText(ix) : String(id); }
function allowNew(ownerHash) {
  var cache = CacheService.getScriptCache(), now = Date.now();
  var gk = 'new10m_' + Math.floor(now / 600000), dk = 'newDev_' + ownerHash.slice(0, 32) + '_' + Math.floor(now / 3600000);
  var g = Number(cache.get(gk)) || 0, d = Number(cache.get(dk)) || 0;
  if (g >= LIMIT_NEW_PER_10MIN || d >= LIMIT_NEW_PER_DEVICE_HOUR) return false;
  cache.put(gk, String(g + 1), 900); cache.put(dk, String(d + 1), 3900);
  return true;
}

// ---------- 시트 ----------
function sheet(name, head) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.appendRow(head); sh.setFrozenRows(1); }
  return sh;
}
var H = {
  players: ['반', '닉네임 번호', '닉네임 주인(기기 열쇠 해시)', '처음 등록', '닉네임 글자'],
  sessions: ['근무표', '반', '닉네임 번호', '일차', '시작 시각', '제출함'],
  scores: ['제출 시각', '반', '닉네임 번호', '일차', '매출', '보낸 상자', '완벽한 상자', '최고 콤보', '만든 전개도', '목표 달성', '출고 기록', '닉네임 글자'],
  rejected: ['시각', '반', '닉네임 번호', '일차', '거절 이유', '보낸 내용'],
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
  // 붙이기: 🩹 테이프 상자는 모서리 12곳에 테이프, 🧴 본드 상자는 잘린 모서리 7곳에 본드(접힌 모서리 5곳은 그냥 접힘).
  // 어느 쪽인지는 게임이 정하므로 둘 중 싼 쪽을 최소로 본다
  var m = Math.min(a, b, c);
  var tapeMin = Math.min(12 * m * Math.min(COST.tape, COST.roll || COST.tape), 7 * m * (COST.glue || 0));
  return tapeMin + 6 * COST.sticker + (it.fragile ? 8 * COST.guard : 0) + (it.cold ? 6 * COST.foil : 0) + (it.up ? 4 * COST.sticker : 0);
}
function maxOrders(cfg) { return 1 + Math.floor((cfg.time + TRUCK_PLUS - 42) / cfg.every); }
function hashKey(key) {
  var raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, 'rbf-key|' + key);
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
  var cls = clean(q.cls, 12) || '전체';
  if (q.act === 'top') return top(cls, q.cat, Number(q.day) || 1, String(q.nick || ''));
  var ix = parseNick(q.nick);
  if (!ix) return { ok: false, msg: '닉네임은 단어 네 개를 골라 만들어요.' };
  var nick = ix.join('-');
  if (!/^[A-Za-z0-9-]{16,64}$/.test(String(q.key || ''))) return { ok: false, msg: '기기 열쇠가 이상해요. 게임을 다시 열어 주세요.' };
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var who = checkPlayer(cls, nick, String(q.key));
    if (!who.ok) return who;
    if (q.act === 'join') return { ok: true, name: nickText(ix), msg: who.isNew ? '닉네임을 만들었어요!' : '다시 만나서 반가워요!' };
    if (q.act === 'start') return start(cls, nick, Number(q.day));
    if (q.act === 'submit') return submit(cls, nick, q);
    return { ok: false, msg: '알 수 없는 요청' };
  } finally { lock.releaseLock(); }
}

function checkPlayer(cls, nick, key) {
  var sh = sheet('players', H.players);
  var rows = sh.getDataRange().getValues();
  var hk = hashKey(key);
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][0] === cls && String(rows[i][1]) === nick) {
      return rows[i][2] === hk ? { ok: true } : { ok: false, msg: '그 닉네임은 다른 친구가 먼저 만들었어요. 다른 조합을 골라 주세요.' };
    }
  }
  if (!allowNew(hk)) return { ok: false, msg: '새 닉네임을 너무 많이 만들었어요. 조금 뒤에 다시 해 주세요.' };
  sh.appendRow([cls, nick, hk, new Date(), nameOf(nick)]);
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
  var last = -MIN_GAP, maxRev = 0, chain = [], bestCombo = 0, perfect = 0, nets = {}, events = 0;
  for (var j = 0; j < log.length; j++) {
    var b = log[j], it = ITEMS[b.item];
    if (!it || cfg.items.indexOf(b.item) < 0) return fail('그날 나오지 않는 물건이 있어요');
    if (b.sketch && !cfg.sketch) return fail('겨냥도 주문이 없는 날이에요');
    var t = Number(b.t);
    if (!(t >= 5 && t <= cfg.time + TRUCK_PLUS + 5)) return fail('출고 시각이 근무 시간 밖이에요');
    if (t - last < MIN_GAP) return fail('상자를 너무 빨리 출고했어요');
    last = t;
    var pay = payFor(it) + (b.sketch ? SKETCH_PAY : 0);
    if (b.ev === 'urgent' || b.ev === 'regular') events++;
    if (b.ev === 'urgent') pay *= 2;                       // 급한 주문: 돈 2배
    maxRev += pay + Math.round(pay * MAX_TIP / 100) * 100 - minMaterial(it);
    if (b.ev === 'regular' && Number(b.mistakes) === 0) maxRev += REGULAR_TIP;
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
  if (events > Math.ceil(log.length * MAX_EVENT_SHARE) + 1) return fail('특별 손님이 너무 많아요');
  // 3) 매출: 기록으로 계산한 최대치를 넘으면 조작
  var earned = Math.round(Number(q.earned) || 0);
  if (earned > maxRev + 100) return fail('매출이 출고 기록보다 많아요');
  var netList = Object.keys(nets).join(',');
  sheet('scores', H.scores).appendRow([new Date(), cls, nick, day, earned, log.length, perfect, bestCombo, netList,
    earned >= cfg.target ? '예' : '', JSON.stringify(log).slice(0, 4000), nameOf(nick)]);
  var rank = top(cls, 'day', day, nick);
  return { ok: true, earned: earned, perfect: perfect, bestCombo: bestCombo, myRank: rank.myRank, total: rank.rows.length };
}

// ---------- 랭킹 ----------
function top(cls, cat, day, me) {
  var rows = sheet('scores', H.scores).getDataRange().getValues().slice(1).filter(function (x) { return x[1] === cls; });
  var by = {};
  rows.forEach(function (x) {
    var nick = String(x[2]), p = by[nick] || (by[nick] = { nick: nick, day: 0, combo: 0, perfect: 0, nets: {}, reach: 0 });
    if (Number(x[3]) === day) p.day = Math.max(p.day, Number(x[4]));
    p.combo = Math.max(p.combo, Number(x[7]));
    p.perfect += Number(x[6]);
    String(x[8] || '').split(',').forEach(function (n) { if (n) p.nets[n] = 1; });
    if (x[9] === '예') p.reach = Math.max(p.reach, Number(x[3]));
  });
  var list = Object.keys(by).map(function (k) {
    var p = by[k];
    var v = cat === 'combo' ? p.combo : cat === 'perfect' ? p.perfect : cat === 'nets' ? Object.keys(p.nets).length : cat === 'reach' ? p.reach : p.day;
    return { nick: p.nick, name: nameOf(p.nick), v: v };
  }).filter(function (x) { return x.v > 0; });
  list.sort(function (a, b) { return b.v - a.v; });
  var myRank = 0;
  list.forEach(function (x, i) { x.rank = i > 0 && list[i - 1].v === x.v ? list[i - 1].rank : i + 1; if (x.nick === me) myRank = x.rank; });
  return { ok: true, rows: list.slice(0, 30), myRank: myRank };
}
