// 물건, 손님, 근무일, 업그레이드, 재료 값
// 물건 크기 d = [가로, 높이, 세로] (cm). 상자는 물건과 딱 맞게 만든다.
// fragile: 깨지기 쉬운 물건 → 꼭짓점마다 꼭짓점 보호대를 끼운다.
// cold: 차갑게 보내는 물건 → 면 6개에 모두 보냉 은박을 붙인다.
// up: 이쪽이 위 → 옆면 4개에 위쪽 화살표 스티커를 붙인다(밑면과 수직인 면).

export const ITEMS = {
  puzzle: { name: '큐브 퍼즐', emoji: '🧩', d: [2, 2, 2], color: '#ff8a65' },
  mug: { name: '머그컵', emoji: '☕', d: [3, 3, 3], color: '#90caf9', fragile: true },
  clock: { name: '탁상시계', emoji: '⏰', d: [3, 3, 3], color: '#ef9a9a', fragile: true },
  shoe: { name: '운동화', emoji: '👟', d: [5, 2, 3], color: '#b39ddb' },
  robot: { name: '로봇 장난감', emoji: '🤖', d: [3, 4, 2], color: '#80cbc4' },
  book: { name: '동화책', emoji: '📚', d: [5, 1, 4], color: '#ffcc80' },
  phone: { name: '휴대폰', emoji: '📱', d: [3, 1, 5], color: '#b0bec5', fragile: true },
  plant: { name: '작은 화분', emoji: '🌵', d: [2, 3, 2], color: '#a5d6a7', fragile: true, up: true },
  bear: { name: '곰 인형', emoji: '🧸', d: [4, 3, 4], color: '#d7a77a' },
  cake: { name: '케이크', emoji: '🎂', d: [4, 2, 4], color: '#f8bbd0', fragile: true, cold: true },
  globe: { name: '지구본', emoji: '🌍', d: [4, 4, 4], color: '#81d4fa', fragile: true },
  game: { name: '게임기', emoji: '🎮', d: [4, 1, 2], color: '#9fa8da' },
  umbrella: { name: '접이식 우산', emoji: '☂️', d: [1, 1, 6], color: '#7986cb' },
  milk: { name: '우유', emoji: '🥛', d: [2, 4, 2], color: '#e3f2fd', cold: true, up: true },
  pizza: { name: '피자', emoji: '🍕', d: [5, 1, 5], color: '#ffb74d', up: true },
  icecream: { name: '아이스크림', emoji: '🍦', d: [3, 2, 2], color: '#fff3e0', cold: true },
  blocks: { name: '블록 세트', emoji: '🧱', d: [6, 2, 3], color: '#e57373' },
  frame: { name: '액자', emoji: '🖼️', d: [4, 5, 1], color: '#bcaaa4', fragile: true, up: true },
};

export const CUSTOMERS = ['🐰 토끼 문구점', '🐻 곰돌이 마트', '🦊 여우 서점', '🐱 고양이 카페', '🐼 판다 장난감 가게', '🐸 개구리 꽃집', '🦉 부엉이 도서관', '🐧 펭귄 빵집'];

// 재료 값: 테이프 1cm, 스티커 1장, 보호대 1개
// roll: 테이프 롤(총 길이로 뽑기) 1cm, glue: 본드 1cm
export const COST = { tape: 10, sticker: 50, guard: 60, foil: 40, roll: 8, glue: 5 };
// 특별 손님: 급한 주문(기다리는 시간 절반, 돈 2배), 단골 손님(실수 없이 보내면 팁)
// 붙이는 방식: 🩹 테이프 상자(접은 뒤 모서리 12개에 테이프) / 🧴 본드 상자(접기 전 만나는 선분 짝을 모두 찾아 본드)
export const GLUE_CHANCE = 0.4;
export const GLUE_HINT = 100;
export const EVENTS = { urgent: { chance: 0.15, from: 2 }, regular: { chance: 0.12, from: 1, tip: 500 } };

// 가방: 테이프 1줄, 스티커 1장, 보호대 1개, 은박 1장이 각각 한 칸
export const BAG = { base: 30, big: 50 };

// time: 근무 시간(초), every: 주문 간격(초), patience: 손님 기다림(초), target: 목표 매출
export const DAYS = [
  { title: '첫 출근', items: ['puzzle', 'mug'], time: 330, every: 70, patience: 260, target: 4000,
    intro: ['어서 와요, 신입 택배 기사님! 저는 공장 로봇 박스봇이에요.', '주문을 고르면 작업대에서 골판지에 전개도를 그려 상자를 접고, 물건을 넣어요.', '오늘은 정사각형 6개로 둘러싸인 정육면체 상자만 들어와요. 정육면체도 면 6개, 모서리 12개, 꼭짓점 8개예요.', '테이프 출력기, 스티커 제작기, 포장재 선반을 돌아다니며 재료를 만들어 와서 상자를 포장해요. 재료는 가방에 30칸까지 들어가요. 바닥이나 기계를 톡 누르면 걸어가요!'] },
  { title: '직육면체 주문', items: ['puzzle', 'mug', 'shoe', 'robot'], time: 330, every: 60, patience: 240, target: 7000,
    intro: ['오늘부터 직사각형 6개로 둘러싸인 직육면체 상자도 들어와요.', '직육면체는 길이가 같은 모서리가 4개씩 있어요. 테이프를 길이별로 몇 개씩 뽑아야 할지 생각해요!'] },
  { title: '납작한 물건', items: ['shoe', 'robot', 'book', 'phone', 'plant'], time: 330, every: 55, patience: 220, target: 9000,
    intro: ['책이나 휴대폰처럼 납작한 물건이 많은 날이에요.', '높이가 1cm인 직육면체도 면 6개, 모서리 12개, 꼭짓점 8개예요. 깨지기 쉬운 물건은 꼭짓점마다 보호대를 끼워요.'] },
  { title: '바쁜 주말', items: ['mug', 'bear', 'cake', 'globe', 'book', 'game'], time: 360, every: 50, patience: 210, target: 12000,
    intro: ['주말이라 주문이 몰려요! 큰 상자도 많아요.', '재료를 한 번에 넉넉히 만들어 두면 덜 걸어도 돼요. 하지만 남으면 재료 값만 버려요!', '가방에는 재료를 정해진 칸만큼만 넣을 수 있어요. 케이크처럼 재료가 많이 드는 상자는 나눠서 가져와요.'] },
  { title: '시원한 배송', items: ['icecream', 'milk', 'cake', 'pizza', 'plant', 'frame', 'mug'], time: 360, every: 52, patience: 220, target: 13000,
    intro: ['🧊 아이스크림과 우유는 녹지 않게 보냉 은박으로 감싸요. 직육면체의 면 6개에 모두 붙여야 해요!', '⬆️ "이쪽이 위" 물건은 옆면 4개에 위쪽 화살표 스티커를 붙여요. 옆면은 밑면과 수직인 면이에요.', '보냉 은박은 포장재 선반, 화살표 스티커는 스티커 제작기에서 만들어요.'] },
  { title: '겨냥도 주문', items: ['umbrella', 'blocks', 'shoe', 'robot', 'book', 'game', 'milk', 'pizza'], time: 360, every: 50, patience: 220, target: 14000, sketch: 1,
    intro: ['오늘 주문서에는 길이 대신 겨냥도만 그려져 있어요.', '겨냥도에서 보이는 모서리는 실선, 보이지 않는 모서리는 점선이에요. 점선 3개도 모서리예요!', '겨냥도에 적힌 길이를 보고 가로·세로·높이를 찾아 전개도를 그려요.'] },
];

export function dayConfig(n) {
  if (n <= DAYS.length) return DAYS[n - 1];
  const k = n - DAYS.length;
  return { title: `${n}일차 근무`, items: Object.keys(ITEMS), sketch: 0.3, time: 360, every: Math.max(32, 48 - k * 2), patience: Math.max(150, 200 - k * 8), target: 12000 + k * 2500,
    intro: ['오늘도 주문이 쏟아져요. 지금까지 배운 솜씨를 보여 줘요!'] };
}

export const UPGRADES = [
  { id: 'die', name: '금형 보관함', icon: '🗂', price: 5000, desc: '성공한 전개도를 크기별로 저장해요. 같은 크기 주문은 버튼 하나로 재단! (같은 전개도라 콤보는 끊겨요)' },
  { id: 'bag', name: '큰 가방', icon: '🎒', price: 3500, desc: `재료를 ${BAG.base}칸이 아니라 ${BAG.big}칸까지 들고 다녀요.` },
  { id: 'shoes', name: '쌩쌩 운동화', icon: '👟', price: 3000, desc: '공장 안을 1.6배 빠르게 걸어요.' },
  { id: 'truck', name: '큰 트럭', icon: '🚛', price: 4000, desc: '트럭이 30초 늦게 떠나요.' },
  { id: 'fast', name: '고속 접기 기계', icon: '⚙️', price: 3000, desc: '전개도를 두 배 빠르게 접어요.' },
  { id: 'sign', name: '반짝 간판', icon: '✨', price: 2500, desc: '손님 팁이 10% 늘어요.' },
];

export function payFor(item) {
  const [a, b, c] = item.d;
  return Math.round((1500 + 60 * 2 * (a * b + b * c + a * c) + (item.fragile ? 600 : 0) + (item.cold ? 500 : 0) + (item.up ? 300 : 0)) / 100) * 100;
}

// 기사 옷(캐릭터): model = models/ 안의 Polyfork 캐릭터 파일
export const OUTFITS = [
  { id: 'm', name: '안전모 기사', who: '남', icon: '👷‍♂️', model: 'construction-worker-c1ad8c', price: 0 },
  { id: 'f', name: '초록 제복 기사', who: '여', icon: '👷‍♀️', model: 'railway-carter-971897', price: 0 },
  { id: 'courier', name: '배달 기사', who: '남', icon: '🧑‍🔧', model: 'delivery-courier-327e30', price: 3000 },
  { id: 'station', name: '남색 제복 기사', who: '여', icon: '👩‍✈️', model: 'station-master-1d6a0a', price: 3000 },
];

// 공장 꾸미기: slot이 같은 것(바닥, 벽)은 하나만 고른다
// slot이 같은 것이 여러 개면 그중 하나만 고른다(바닥·벽·작업대·동물 친구). 나머지는 켜고 끄기.
// where: 공장 어디에 생기는지 (상점에서 알려 준다)
export const DECOR = [
  { id: 'floor-blue', slot: 'floor', name: '하늘 타일 바닥', icon: '🟦', price: 1500, where: '공장 바닥 전체' },
  { id: 'floor-wood', slot: 'floor', name: '나무 마루 바닥', icon: '🟫', price: 2500, where: '공장 바닥 전체' },
  { id: 'floor-check', slot: 'floor', name: '체크무늬 바닥', icon: '🏁', price: 2000, where: '공장 바닥 전체' },
  { id: 'wall-mint', slot: 'wall', name: '민트색 벽', icon: '🟩', price: 1000, where: '기계 뒤 칸막이와 공장 벽' },
  { id: 'wall-peach', slot: 'wall', name: '복숭아색 벽', icon: '🟧', price: 1000, where: '기계 뒤 칸막이와 공장 벽' },
  { id: 'wall-sky', slot: 'wall', name: '하늘색 벽', icon: '🔷', price: 1000, where: '기계 뒤 칸막이와 공장 벽' },
  { id: 'table-white', slot: 'table', name: '하얀 작업대', icon: '⬜', price: 1200, where: '상자를 접고 붙이는 작업대' },
  { id: 'table-mint', slot: 'table', name: '민트 작업대', icon: '🟢', price: 1200, where: '상자를 접고 붙이는 작업대' },
  { id: 'rug', slot: 'rug', name: '알록달록 둥근 깔개', icon: '🔴', price: 1500, where: '작업대 앞 바닥' },
  { id: 'balloons', slot: 'balloons', name: '풍선 다발', icon: '🎈', price: 1500, where: '작업대 왼쪽' },
  { id: 'poster', slot: 'poster', name: '전개도 11가지 포스터', icon: '🖼️', price: 1200, where: '칸막이 벽 오른쪽' },
  { id: 'clock', slot: 'clock', name: '똑딱 벽시계', icon: '🕰️', price: 1000, where: '칸막이 벽 왼쪽' },
  { id: 'lights', slot: 'lights', name: '반짝 전구 줄', icon: '💡', price: 2000, where: '칸막이 벽 위' },
  { id: 'bunting', slot: 'bunting', name: '삼각 깃발 줄', icon: '🚩', price: 1200, where: '컨베이어 위' },
  { id: 'plants', slot: 'plants', name: '화분 두 개', icon: '🌱', price: 1500, where: '작업대 옆, 스티커 제작기 옆' },
  { id: 'arcade', slot: 'arcade', name: '오락기', icon: '🕹️', price: 3000, where: '작업대 뒤' },
  { id: 'trophy', slot: 'trophy', name: '트로피 진열장', icon: '🏆', price: 2500, where: '컨베이어 뒤' },
  { id: 'lounge', slot: 'lounge', name: '쉼터 소파와 스탠드', icon: '🛋️', price: 3000, where: '공장 오른쪽 끝' },
  { id: 'pet-dog', slot: 'pet', name: '강아지 친구', icon: '🐕', price: 4000, where: '기사를 졸졸 따라다녀요' },
  { id: 'pet-cat', slot: 'pet', name: '고양이 친구', icon: '🐈', price: 4000, where: '기사를 졸졸 따라다녀요' },
];
export const DECOR_ONE = new Set(DECOR.map((d) => d.slot).filter((sl, i, a) => a.indexOf(sl) !== i));
