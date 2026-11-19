// 쉬는 시간 미니게임: 도장 큐브 굴리기
// 여섯 면에 서로 다른 색 도장이 묻은 정육면체를 굴린다. 바닥에 닿은 면의 색이 칸에 찍힌다.
// 목표 모양(정육면체 전개도) 6칸에 여섯 면을 한 번씩 찍으면 성공 → 찍힌 무늬가 바로 전개도가 된다.

const COLORS = [
  { name: '빨강', c: '#e74c3c' }, { name: '주황', c: '#f39c12' }, { name: '노랑', c: '#f4d03f' },
  { name: '초록', c: '#27ae60' }, { name: '파랑', c: '#2f6fde' }, { name: '보라', c: '#8e44ad' },
];
const NS = 'http://www.w3.org/2000/svg';
const S = (tag, a = {}) => { const e = document.createElementNS(NS, tag); for (const k in a) e.setAttribute(k, a[k]); return e; };

// 굴릴 때 면이 바뀌는 규칙 (예: 오른쪽으로 굴리면 오른쪽 면이 바닥에 닿는다)
function roll(f, dir) {
  const n = { ...f };
  if (dir === 'e') { n.bottom = f.e; n.e = f.top; n.top = f.w; n.w = f.bottom; }
  if (dir === 'w') { n.bottom = f.w; n.w = f.top; n.top = f.e; n.e = f.bottom; }
  if (dir === 'n') { n.bottom = f.n; n.n = f.top; n.top = f.s; n.s = f.bottom; }
  if (dir === 's') { n.bottom = f.s; n.s = f.top; n.top = f.n; n.n = f.bottom; }
  return n;
}
const STEP = { e: [1, 0], w: [-1, 0], n: [0, -1], s: [0, 1] };

export function stampCube(root, { h, sfx, types, cleared = {}, onReward, onExit }) {
  const COLS = 7, ROWS = 5;
  let target, cells, stamps, pos, faces, moves, done;
  const board = h('div', { class: 'cube-board' });
  const info = h('p', { class: 'hint center' });
  const legend = h('div', { class: 'cube-legend' });
  const svg = S('svg', { viewBox: `-0.2 -0.2 ${COLS + 0.4} ${ROWS + 0.4}`, class: 'cube-svg' });
  board.append(svg);
  const say = (t, mood = '') => { info.className = 'hint center ' + mood; info.textContent = t; };

  function newPuzzle(keep) {
    if (!keep) target = types[Math.floor(Math.random() * types.length)];
    const w = Math.max(...target.cells.map((c) => c[0])) + 1, hh = Math.max(...target.cells.map((c) => c[1])) + 1;
    const ox = Math.floor((COLS - w) / 2), oy = Math.floor((ROWS - hh) / 2);
    cells = new Set(target.cells.map(([x, y]) => `${x + ox},${y + oy}`));
    stamps = new Map(); // "x,y" -> 색 번호
    const start = [...cells][0].split(',').map(Number);
    pos = start;
    faces = { top: 0, bottom: 5, n: 1, s: 3, e: 2, w: 4 }; // 마주 보는 면: 빨강-보라, 주황-초록, 노랑-파랑
    moves = 0; done = false;
    stamp();
    say('화살표를 누르거나 판을 밀어서 큐브를 굴려요. 노란 테두리 칸 6개에 여섯 가지 색을 하나씩 찍어요!');
    draw();
  }

  function stamp() {
    const k = `${pos[0]},${pos[1]}`;
    if (stamps.has(k)) return;
    if ([...stamps.values()].includes(faces.bottom)) { say(`${COLORS[faces.bottom].name} 면은 벌써 찍었어요! 한 면은 한 번만 찍어요. 다른 길로 굴려 봐요.`, 'bad'); sfx('no'); return; }
    stamps.set(k, faces.bottom);
    sfx('thud');
  }

  function move(dir) {
    if (done) return;
    const [dx, dy] = STEP[dir];
    const nx = pos[0] + dx, ny = pos[1] + dy, k = `${nx},${ny}`;
    if (!cells.has(k)) { say('노란 테두리 칸 밖으로는 굴릴 수 없어요.', 'bad'); sfx('no'); return; }
    const nf = roll(faces, dir);
    if (stamps.has(k) && stamps.get(k) !== nf.bottom) { say(`그 칸에는 ${COLORS[stamps.get(k)].name}이 찍혀 있어서, ${COLORS[nf.bottom].name} 면이 닿으면 번져요.`, 'bad'); sfx('no'); return; }
    faces = nf; pos = [nx, ny]; moves++;
    say(`바닥에 닿은 면: ${COLORS[faces.bottom].name}`);
    stamp();
    draw();
    if (stamps.size === 6) win();
  }

  function win() {
    done = true;
    const first = !cleared[target.id];
    const reward = first ? 500 : 100;
    sfx('clear');
    say(`성공! 찍힌 무늬는 정육면체의 전개도 ${target.name}이에요. 이 무늬를 접으면 마주 보는 색끼리 평행한 면이 돼요. ${first ? '새 유형 ' : ''}보상 ₩${reward}`, 'good');
    onReward(reward, target.id);
    draw();
  }

  function draw() {
    svg.innerHTML = '';
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const k = `${x},${y}`, inT = cells.has(k), st = stamps.get(k);
      svg.append(S('rect', { x: x + 0.04, y: y + 0.04, width: 0.92, height: 0.92, rx: 0.1, fill: st != null ? COLORS[st].c : inT ? '#fff7dc' : '#e8dcc6', stroke: inT ? '#e0a800' : '#d6c7ad', 'stroke-width': inT ? 0.07 : 0.03 }));
    }
    // 큐브: 가운데 = 위 면, 네 변 = 옆면 색
    const [x, y] = pos;
    const g = S('g', { class: 'cube-piece' });
    g.append(S('rect', { x: x + 0.1, y: y + 0.1, width: 0.8, height: 0.8, rx: 0.12, fill: COLORS[faces.top].c, stroke: '#3b2a1e', 'stroke-width': 0.06 }));
    const bar = (bx, by, bw, bh, c) => g.append(S('rect', { x: bx, y: by, width: bw, height: bh, rx: 0.04, fill: COLORS[c].c, stroke: '#3b2a1e', 'stroke-width': 0.02 }));
    bar(x + 0.22, y + 0.12, 0.56, 0.12, faces.n);
    bar(x + 0.22, y + 0.76, 0.56, 0.12, faces.s);
    bar(x + 0.12, y + 0.22, 0.12, 0.56, faces.w);
    bar(x + 0.76, y + 0.22, 0.12, 0.56, faces.e);
    svg.append(g);
    legend.innerHTML = '';
    legend.append(h('span', {}, '🎲 위: ', h('b', { style: `color:${COLORS[faces.top].c}` }, COLORS[faces.top].name)),
      h('span', {}, '바닥: ', h('b', { style: `color:${COLORS[faces.bottom].c}` }, COLORS[faces.bottom].name)),
      h('span', {}, `찍은 면 ${stamps.size}/6 · ${moves}번 굴림`));
  }

  // 판을 밀어서 굴리기(패드), 화살표 버튼, 키보드 화살표(PC)
  let st = null;
  svg.addEventListener('pointerdown', (e) => { st = [e.clientX, e.clientY]; });
  svg.addEventListener('pointerup', (e) => {
    if (!st) return;
    const dx = e.clientX - st[0], dy = e.clientY - st[1]; st = null;
    if (Math.hypot(dx, dy) < 30) return;
    move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'e' : 'w') : (dy > 0 ? 's' : 'n'));
  });
  const key = (e) => { const d = { ArrowRight: 'e', ArrowLeft: 'w', ArrowUp: 'n', ArrowDown: 's' }[e.key]; if (d) { e.preventDefault(); move(d); } };
  window.addEventListener('keydown', key);
  const btn = (dir, t, aria) => h('button', { class: 'rbtn r-' + { n: 'up', s: 'down', e: 'right', w: 'left' }[dir], 'aria-label': aria, onclick: () => move(dir) }, t);
  const pad = h('div', { class: 'rollpad cube-pad' }, btn('n', '▲', '위로 굴리기'), btn('w', '◀', '왼쪽으로 굴리기'), h('span', { class: 'rmid' }, '굴리기'), btn('e', '▶', '오른쪽으로 굴리기'), btn('s', '▼', '아래로 굴리기'));

  root.append(h('div', { class: 'screen shop-screen cube-screen' },
    h('div', { class: 'topline' },
      h('button', { class: 'btn ghost', onclick: () => { sfx('click'); window.removeEventListener('keydown', key); onExit(); } }, '← 돌아가기'),
      h('h2', {}, '🎲 쉬는 시간: 도장 큐브'),
      h('span')),
    h('p', { class: 'muted center' }, '정육면체의 여섯 면에 서로 다른 색 도장이 묻어 있어요. 굴리면 바닥에 닿은 면 색이 찍혀요.'),
    legend, board, info,
    h('div', { class: 'row center wrap cube-ctrl' }, pad,
      h('div', { class: 'col' },
        h('button', { class: 'btn ghost', onclick: () => { sfx('click'); newPuzzle(true); } }, '↺ 다시 하기'),
        h('button', { class: 'btn', onclick: () => { sfx('click'); newPuzzle(false); } }, '🎲 새 모양')))));
  newPuzzle(false);
  return () => window.removeEventListener('keydown', key);
}
