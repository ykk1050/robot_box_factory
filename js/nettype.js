// 전개도 유형: 정육면체의 전개도는 돌리거나 뒤집어 같은 것을 하나로 보면 11가지다.
// 직육면체의 전개도도 면(직사각형)을 같은 크기의 정사각형으로 바꿔 보면 이 11가지 모양 중 하나가 된다.
// (어느 면과 어느 면이 어느 쪽으로 이어졌는지가 같기 때문. 길이까지 따지면 직육면체는 더 여러 가지가 된다.)
import { canonical, cellsToRects } from './net.js';

// 칸 그림: 'X' = 면. 줄마다 놓인 면의 개수로 무리를 나눈다.
const RAW = [
  ['1-4-1', ['X...', 'XXXX', 'X...']],
  ['1-4-1', ['X...', 'XXXX', '.X..']],
  ['1-4-1', ['X...', 'XXXX', '..X.']],
  ['1-4-1', ['X...', 'XXXX', '...X']],
  ['1-4-1', ['.X..', 'XXXX', '.X..']],
  ['1-4-1', ['.X..', 'XXXX', '..X.']],
  ['2-3-1', ['XX..', '.XXX', '.X..']],
  ['2-3-1', ['XX..', '.XXX', '..X.']],
  ['2-3-1', ['XX..', '.XXX', '...X']],
  ['2-2-2', ['XX..', '.XX.', '..XX']],
  ['3-3', ['XXX..', '..XXX']],
];
const CIRCLED = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩', '⑪'];
const GROUP_NAME = { '1-4-1': '1-4-1형', '2-3-1': '2-3-1형', '2-2-2': '2-2-2형(계단)', '3-3': '3-3형' };

export const NET_TYPES = RAW.map(([group, rows], i) => {
  const cells = [];
  rows.forEach((r, y) => [...r].forEach((c, x) => { if (c === 'X') cells.push([x, y]); }));
  return { id: i + 1, group, groupName: GROUP_NAME[group], mark: CIRCLED[i], name: `${GROUP_NAME[group]} ${CIRCLED[i]}`, cells, key: canonical(cellsToRects(cells)) };
});
export const NET_GROUPS = Object.keys(GROUP_NAME).map((g) => ({ id: g, name: GROUP_NAME[g], types: NET_TYPES.filter((t) => t.group === g) }));

const STEP = { '+x': [1, 0], '-x': [-1, 0], '+z': [0, 1], '-z': [0, -1] };

// analyzeNet 결과로 유형 찾기. 상자가 되지 않으면 null
export function classifyNet(A) {
  if (!A || !A.valid) return null;
  const pos = [];
  pos[A.root] = [0, 0];
  for (const i of A.order) {
    if (A.parent[i] < 0) continue;
    const p = pos[A.parent[i]], d = STEP[A.side[i]];
    pos[i] = [p[0] + d[0], p[1] + d[1]];
  }
  const cells = A.order.map((i) => pos[i]);
  if (new Set(cells.map((c) => c.join(','))).size !== 6) return null;
  const key = canonical(cellsToRects(cells));
  return NET_TYPES.find((t) => t.key === key) || null;
}

// 작은 그림(SVG)
export function netTypePicture(t, size = 64, color = '#fbe9cf') {
  const NS = 'http://www.w3.org/2000/svg';
  const W = Math.max(...t.cells.map((c) => c[0])) + 1, H = Math.max(...t.cells.map((c) => c[1])) + 1;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `-0.15 -0.15 ${W + 0.3} ${H + 0.3}`);
  svg.setAttribute('width', size);
  svg.setAttribute('height', Math.round(size * (H + 0.3) / (W + 0.3)));
  t.cells.forEach(([x, y]) => {
    const r = document.createElementNS(NS, 'rect');
    Object.entries({ x, y, width: 1, height: 1, fill: color, stroke: '#3b2a1e', 'stroke-width': 0.08 }).forEach(([k, v]) => r.setAttribute(k, v));
    svg.append(r);
  });
  return svg;
}
