// 물건, 손님, 근무일, 업그레이드, 재료 값
// 물건 크기 d = [가로, 높이, 세로] (cm). 상자는 물건과 딱 맞게 만든다.
// fragile: 깨지기 쉬운 물건 → 꼭짓점마다 꼭짓점 보호대를 끼운다.

export const ITEMS = {
  puzzle: { name: '큐브 퍼즐', emoji: '🧩', d: [2, 2, 2], color: '#ff8a65' },
  mug: { name: '머그컵', emoji: '☕', d: [3, 3, 3], color: '#90caf9', fragile: true },
  clock: { name: '탁상시계', emoji: '⏰', d: [3, 3, 3], color: '#ef9a9a', fragile: true },
  shoe: { name: '운동화', emoji: '👟', d: [5, 2, 3], color: '#b39ddb' },
  robot: { name: '로봇 장난감', emoji: '🤖', d: [3, 4, 2], color: '#80cbc4' },
  book: { name: '동화책', emoji: '📚', d: [5, 1, 4], color: '#ffcc80' },
  phone: { name: '휴대폰', emoji: '📱', d: [3, 1, 5], color: '#b0bec5', fragile: true },
  plant: { name: '작은 화분', emoji: '🪴', d: [2, 3, 2], color: '#a5d6a7', fragile: true },
  bear: { name: '곰 인형', emoji: '🧸', d: [4, 3, 4], color: '#d7a77a' },
  cake: { name: '케이크', emoji: '🎂', d: [4, 2, 4], color: '#f8bbd0', fragile: true },
  globe: { name: '지구본', emoji: '🌍', d: [4, 4, 4], color: '#81d4fa', fragile: true },
  game: { name: '게임기', emoji: '🎮', d: [4, 1, 2], color: '#9fa8da' },
};

export const CUSTOMERS = ['🐰 토끼 문구점', '🐻 곰돌이 마트', '🦊 여우 서점', '🐱 고양이 카페', '🐼 판다 장난감 가게', '🐸 개구리 꽃집', '🦉 부엉이 도서관', '🐧 펭귄 빵집'];

// 재료 값: 테이프 1cm, 스티커 1장, 보호대 1개
export const COST = { tape: 10, sticker: 50, guard: 60 };

// time: 근무 시간(초), every: 주문 간격(초), patience: 손님 기다림(초), target: 목표 매출
export const DAYS = [
  { title: '첫 출근', items: ['puzzle', 'mug'], time: 330, every: 70, patience: 260, target: 4000,
    intro: ['어서 와요, 신입 택배 기사님! 저는 공장 로봇 박스봇이에요.', '주문을 고르면 작업대에서 골판지에 전개도를 그려 상자를 접고, 물건을 넣어요.', '오늘은 정사각형 6개로 둘러싸인 정육면체 상자만 들어와요. 정육면체도 면 6개, 모서리 12개, 꼭짓점 8개예요.', '테이프 출력기, 스티커 제작기, 보호대 선반을 돌아다니며 재료를 만들어 와서 상자를 포장해요. 바닥이나 기계를 톡 누르면 걸어가요!'] },
  { title: '직육면체 주문', items: ['puzzle', 'mug', 'shoe', 'robot'], time: 330, every: 60, patience: 240, target: 7000,
    intro: ['오늘부터 직사각형 6개로 둘러싸인 직육면체 상자도 들어와요.', '직육면체는 길이가 같은 모서리가 4개씩 있어요. 테이프를 길이별로 몇 개씩 뽑아야 할지 생각해요!'] },
  { title: '납작한 물건', items: ['shoe', 'robot', 'book', 'phone', 'plant'], time: 330, every: 55, patience: 220, target: 9000,
    intro: ['책이나 휴대폰처럼 납작한 물건이 많은 날이에요.', '높이가 1cm인 직육면체도 면 6개, 모서리 12개, 꼭짓점 8개예요. 깨지기 쉬운 물건은 꼭짓점마다 보호대를 끼워요.'] },
  { title: '바쁜 주말', items: ['mug', 'bear', 'cake', 'globe', 'book', 'game'], time: 360, every: 50, patience: 210, target: 12000,
    intro: ['주말이라 주문이 몰려요! 큰 상자도 많아요.', '재료를 한 번에 넉넉히 만들어 두면 덜 걸어도 돼요. 하지만 남으면 재료 값만 버려요!'] },
];

export function dayConfig(n) {
  if (n <= DAYS.length) return DAYS[n - 1];
  const k = n - DAYS.length;
  return { title: `${n}일차 근무`, items: Object.keys(ITEMS), time: 360, every: Math.max(32, 48 - k * 2), patience: Math.max(150, 200 - k * 8), target: 12000 + k * 2500,
    intro: ['오늘도 주문이 쏟아져요. 지금까지 배운 솜씨를 보여 줘요!'] };
}

export const UPGRADES = [
  { id: 'die', name: '금형 보관함', icon: '🗂', price: 5000, desc: '성공한 전개도를 크기별로 저장해요. 같은 크기 주문은 버튼 하나로 재단!' },
  { id: 'shoes', name: '쌩쌩 운동화', icon: '👟', price: 3000, desc: '공장 안을 1.6배 빠르게 걸어요.' },
  { id: 'truck', name: '큰 트럭', icon: '🚛', price: 4000, desc: '트럭이 30초 늦게 떠나요.' },
  { id: 'fast', name: '고속 접기 기계', icon: '⚙️', price: 3000, desc: '전개도를 두 배 빠르게 접어요.' },
  { id: 'sign', name: '반짝 간판', icon: '✨', price: 2500, desc: '손님 팁이 10% 늘어요.' },
];

export function payFor(item) {
  const [a, b, c] = item.d;
  return Math.round((1500 + 60 * 2 * (a * b + b * c + a * c) + (item.fragile ? 600 : 0)) / 100) * 100;
}
