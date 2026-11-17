// 물건, 손님, 근무일, 업그레이드 자료
// 물건 크기 d = [가로, 높이, 세로] (cm). 상자는 물건과 딱 맞게 만든다.

export const ITEMS = {
  puzzle: { name: '큐브 퍼즐', emoji: '🧩', d: [2, 2, 2], color: '#ff8a65' },
  mug: { name: '머그컵', emoji: '☕', d: [3, 3, 3], color: '#90caf9' },
  clock: { name: '탁상시계', emoji: '⏰', d: [3, 3, 3], color: '#ef9a9a' },
  shoe: { name: '운동화', emoji: '👟', d: [5, 2, 3], color: '#b39ddb' },
  robot: { name: '로봇 장난감', emoji: '🤖', d: [3, 4, 2], color: '#80cbc4' },
  book: { name: '동화책', emoji: '📚', d: [5, 1, 4], color: '#ffcc80' },
  phone: { name: '휴대폰', emoji: '📱', d: [3, 1, 5], color: '#b0bec5' },
  plant: { name: '작은 화분', emoji: '🪴', d: [2, 3, 2], color: '#a5d6a7' },
  bear: { name: '곰 인형', emoji: '🧸', d: [4, 3, 4], color: '#d7a77a' },
  cake: { name: '케이크', emoji: '🎂', d: [4, 2, 4], color: '#f8bbd0' },
  globe: { name: '지구본', emoji: '🌍', d: [4, 4, 4], color: '#81d4fa' },
  game: { name: '게임기', emoji: '🎮', d: [4, 1, 2], color: '#9fa8da' },
};

export const CUSTOMERS = ['🐰 토끼 문구점', '🐻 곰돌이 마트', '🦊 여우 서점', '🐱 고양이 카페', '🐼 판다 장난감 가게', '🐸 개구리 꽃집', '🦉 부엉이 도서관', '🐧 펭귄 빵집'];

// time: 근무 시간(초), every: 주문 간격(초), patience: 손님 기다림(초), target: 목표 매출
export const DAYS = [
  { title: '첫 출근', items: ['puzzle', 'mug'], time: 240, every: 40, patience: 150, target: 5000, first: 1,
    intro: ['어서 와요, 신입 택배 기사님! 저는 공장 로봇 박스봇이에요.', '주문이 오면 골판지에 상자 전개도를 그려 재단하고, 물건을 넣어 접고, 테이프와 라벨을 붙여 트럭에 실어요.', '오늘은 정육면체 상자만 들어와요. 트럭이 떠나기 전에 열심히 벌어 봐요!'] },
  { title: '직육면체 주문', items: ['puzzle', 'mug', 'shoe', 'robot'], time: 240, every: 35, patience: 140, target: 9000,
    intro: ['오늘부터 직육면체 상자도 들어와요.', '직육면체는 마주 보는 면끼리 크기가 같아요. 물건의 가로, 세로, 높이를 잘 보고 그려요!'] },
  { title: '납작한 물건', items: ['shoe', 'robot', 'book', 'phone', 'plant'], time: 240, every: 32, patience: 130, target: 12000,
    intro: ['책이나 휴대폰처럼 납작한 물건이 많은 날이에요.', '높이가 1cm인 면도 잊지 말고 그려요.'] },
  { title: '바쁜 주말', items: ['mug', 'bear', 'cake', 'globe', 'book', 'game'], time: 270, every: 28, patience: 120, target: 16000,
    intro: ['주말이라 주문이 몰려요! 큰 상자도 많아요.', '상점에서 금형 보관함을 샀다면, 한 번 만든 전개도를 다시 쓸 수 있어요.'] },
];

export function dayConfig(n) {
  if (n <= DAYS.length) return DAYS[n - 1];
  const k = n - DAYS.length;
  return { title: `${n}일차 근무`, items: Object.keys(ITEMS), time: 270, every: Math.max(18, 26 - k), patience: Math.max(90, 120 - k * 5), target: 16000 + k * 3000,
    intro: ['오늘도 주문이 쏟아져요. 지금까지 배운 솜씨를 보여 줘요!'] };
}

export const UPGRADES = [
  { id: 'die', name: '금형 보관함', icon: '🗂', price: 5000, desc: '성공한 전개도를 크기별로 저장해요. 같은 크기 주문은 버튼 하나로 재단!' },
  { id: 'truck', name: '큰 트럭', icon: '🚛', price: 4000, desc: '트럭이 30초 늦게 떠나요.' },
  { id: 'fast', name: '고속 접기 기계', icon: '⚙️', price: 3000, desc: '상자를 두 배 빠르게 접어요.' },
  { id: 'helper', name: '송장 도우미 로봇', icon: '🤖', price: 6000, desc: '송장을 윗면에 대신 붙여 줘요. (화살표는 직접!)' },
  { id: 'sign', name: '반짝 간판', icon: '✨', price: 2500, desc: '손님 팁이 10% 늘어요.' },
];

export function payFor(d) {
  const [a, b, c] = d;
  return Math.round((1000 + 60 * 2 * (a * b + b * c + a * c)) / 100) * 100;
}
