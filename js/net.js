// 전개도 계산: 직사각형 조각들을 접는 선(같은 길이로 맞닿은 변)으로 이어 접고,
// 정확한 정수 계산으로 상자가 되는지 판단한다. 3D 접기 애니메이션도 여기서.
import { View, THREE, CARD, INK, VL } from './three-view.js';

const ROT = {
  '+x': [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
  '-x': [[0, 1, 0], [-1, 0, 0], [0, 0, 1]],
  '+z': [[1, 0, 0], [0, 0, 1], [0, -1, 0]],
  '-z': [[1, 0, 0], [0, 0, -1], [0, 1, 0]],
};
const FLIP = { '+x': '-x', '-x': '+x', '+z': '-z', '-z': '+z' };
const mm = (A, B) => A.map((r) => B[0].map((_, j) => r.reduce((s, v, k) => s + v * B[k][j], 0)));
const mv = (A, v) => A.map((r) => r[0] * v[0] + r[1] * v[1] + r[2] * v[2]);
const add = (a, b) => a.map((v, i) => v + b[i]);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const I3 = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
const key3 = (p) => p.map((v) => Math.round(v * 1000) / 1000).join(',');

export function cellsToRects(cells) { return cells.map(([x, y]) => ({ x, y, w: 1, h: 1 })); }

// 두 조각 사이의 접는 선 찾기 (b가 a의 어느 쪽에 붙었는지)
function hingeBetween(A, B) {
  if (A.x + A.w === B.x && A.y === B.y && A.h === B.h) return { side: '+x', H: [B.x, 0, A.y], p: [B.x, A.y], q: [B.x, A.y + A.h] };
  if (B.x + B.w === A.x && A.y === B.y && A.h === B.h) return { side: '-x', H: [A.x, 0, A.y], p: [A.x, A.y], q: [A.x, A.y + A.h] };
  if (A.y + A.h === B.y && A.x === B.x && A.w === B.w) return { side: '+z', H: [A.x, 0, B.y], p: [A.x, B.y], q: [A.x + A.w, B.y] };
  if (B.y + B.h === A.y && A.x === B.x && A.w === B.w) return { side: '-z', H: [A.x, 0, A.y], p: [A.x, A.y], q: [A.x + A.w, A.y] };
  return null;
}

export function analyzeNet(rects, orderDims = null) {
  const n = rects.length;
  const hinges = [];
  const adj = rects.map(() => []);
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const h = hingeBetween(rects[i], rects[j]);
    if (h) { const k = hinges.length; hinges.push({ a: i, b: j, ...h }); adj[i].push(k); adj[j].push(k); }
  }
  const res = { n, hinges, parent: Array(n).fill(-1), via: Array(n).fill(-1), side: Array(n).fill(null), T: Array(n).fill(null), order: [] };
  if (!n) return { ...res, problem: 'empty' };
  let root = 0;
  for (let i = 0; i < n; i++) if (adj[i].length > adj[root].length) root = i;
  res.root = root;
  res.T[root] = { M: I3, t: [0, 0, 0] };
  const q = [root];
  while (q.length) {
    const p = q.shift();
    res.order.push(p);
    for (const k of adj[p]) {
      const h = hinges[k];
      const c = h.a === p ? h.b : h.a;
      if (res.T[c]) continue;
      const side = h.a === p ? h.side : FLIP[h.side];
      const R = ROT[side];
      const Tp = res.T[p];
      res.T[c] = { M: mm(Tp.M, R), t: add(mv(Tp.M, sub(h.H, mv(R, h.H))), Tp.t) };
      res.parent[c] = p; res.via[c] = k; res.side[c] = side;
      q.push(c);
    }
  }
  res.reached = res.order.slice();
  res.apart = [...Array(n).keys()].filter((i) => !res.T[i]);
  // 접은 뒤 각 면
  res.faces = rects.map((r, i) => {
    if (!res.T[i]) return null;
    const T = res.T[i];
    const cs = [[r.x, 0, r.y], [r.x + r.w, 0, r.y], [r.x + r.w, 0, r.y + r.h], [r.x, 0, r.y + r.h]].map((v) => add(mv(T.M, v), T.t));
    const nrm = mv(T.M, [0, 1, 0]);
    const ax = nrm.findIndex((v) => v !== 0);
    const others = [0, 1, 2].filter((k) => k !== ax);
    const ext = others.map((k) => [Math.min(...cs.map((c) => c[k])), Math.max(...cs.map((c) => c[k]))]);
    return { corners: cs, normal: nrm, axis: ax, sign: nrm[ax], plane: cs[0][ax], others, ext };
  });
  const F = res.faces;
  res.overlaps = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    if (!F[i] || !F[j]) continue;
    if (F[i].axis !== F[j].axis || Math.abs(F[i].plane - F[j].plane) > 1e-9) continue;
    const ov = F[i].ext.every(([a0, a1], k) => Math.min(a1, F[j].ext[k][1]) - Math.max(a0, F[j].ext[k][0]) > 1e-9);
    if (ov) res.overlaps.push([i, j]);
  }
  const all = F.filter(Boolean).flatMap((f) => f.corners);
  const mn = [0, 1, 2].map((k) => Math.min(...all.map((c) => c[k])));
  const mx = [0, 1, 2].map((k) => Math.max(...all.map((c) => c[k])));
  res.bbox = { mn, mx };
  res.center = mn.map((v, k) => (v + mx[k]) / 2);
  res.dims = mn.map((v, k) => mx[k] - v);
  // 상자 검사: 6면이 모두 경계면에 딱 맞게 붙는지
  res.misfit = [];
  F.forEach((f, i) => {
    if (!f) return;
    const want = f.sign > 0 ? mn[f.axis] : mx[f.axis];
    const onPlane = Math.abs(f.plane - want) < 1e-9;
    const fits = f.others.every((k, m) => Math.abs(f.ext[m][0] - mn[k]) < 1e-9 && Math.abs(f.ext[m][1] - mx[k]) < 1e-9);
    if (!onPlane || !fits) res.misfit.push(i);
  });
  res.valid = res.apart.length === 0 && n === 6 && res.overlaps.length === 0 && res.misfit.length === 0;
  if (res.apart.length) res.problem = 'apart';
  else if (res.overlaps.length) res.problem = 'overlap';
  else if (n < 6) res.problem = 'hole';
  else if (n > 6) res.problem = 'extra';
  else if (!res.valid) res.problem = 'misfit';
  else if (orderDims) {
    const a = [...res.dims].sort((x, y) => x - y).join(','), b = [...orderDims].sort((x, y) => x - y).join(',');
    if (a !== b) res.problem = 'wrongsize';
  }
  return res;
}

// 같은 모양(돌리거나 뒤집은 것 포함)인지 비교하는 표준형
export function canonical(rects) {
  const fs = [
    (x, y) => [x, y], (x, y) => [-x, y], (x, y) => [x, -y], (x, y) => [-x, -y],
    (x, y) => [y, x], (x, y) => [-y, x], (x, y) => [y, -x], (x, y) => [-y, -x],
  ];
  let best = null;
  for (const f of fs) {
    const rs = rects.map((r) => {
      const a = f(r.x, r.y), b = f(r.x + r.w, r.y + r.h);
      return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1])];
    });
    const x0 = Math.min(...rs.map((r) => r[0])), y0 = Math.min(...rs.map((r) => r[1]));
    const s = rs.map((r) => [r[0] - x0, r[1] - y0, r[2], r[3]].join(':')).sort().join('|');
    if (best === null || s < best) best = s;
  }
  return best;
}

// ---------- 테두리 점과 선분 (테이프 이음용) ----------
export function netBoundary(rects, A) {
  // 단위 길이 선분으로 쪼개 한 번만 나오는 것이 테두리
  const cnt = new Map();
  const addSeg = (x1, y1, x2, y2) => {
    const k = x1 < x2 || (x1 === x2 && y1 < y2) ? `${x1},${y1},${x2},${y2}` : `${x2},${y2},${x1},${y1}`;
    cnt.set(k, (cnt.get(k) || 0) + 1);
  };
  rects.forEach((r) => {
    for (let i = 0; i < r.w; i++) { addSeg(r.x + i, r.y, r.x + i + 1, r.y); addSeg(r.x + i, r.y + r.h, r.x + i + 1, r.y + r.h); }
    for (let j = 0; j < r.h; j++) { addSeg(r.x, r.y + j, r.x, r.y + j + 1); addSeg(r.x + r.w, r.y + j, r.x + r.w, r.y + j + 1); }
  });
  const nb = new Map();
  for (const [k, c] of cnt) {
    if (c !== 1) continue;
    const [x1, y1, x2, y2] = k.split(',').map(Number);
    const a = `${x1},${y1}`, b = `${x2},${y2}`;
    if (!nb.has(a)) nb.set(a, []); if (!nb.has(b)) nb.set(b, []);
    nb.get(a).push(b); nb.get(b).push(a);
  }
  // 왼쪽 위 점부터 시계 방향으로 한 바퀴
  const pts = [...nb.keys()].map((s) => s.split(',').map(Number));
  pts.sort((p, q) => p[1] - q[1] || p[0] - q[0]);
  const start = `${pts[0][0]},${pts[0][1]}`;
  const walk = [start];
  let prev = null, cur = start;
  // 첫 걸음은 오른쪽
  const first = nb.get(start).find((s) => s.split(',').map(Number)[1] === pts[0][1]) || nb.get(start)[0];
  prev = cur; cur = first;
  let guard = 0;
  while (cur !== start && guard++ < 1000) {
    walk.push(cur);
    const opts = nb.get(cur).filter((s) => s !== prev);
    let next = opts[0];
    if (opts.length > 1) {
      // 갈림길(모서리끼리 닿은 점): 오른손 법칙으로 가장 오른쪽으로 꺾는 길
      const [cx, cy] = cur.split(',').map(Number), [px, py] = prev.split(',').map(Number);
      const dir = [cx - px, cy - py];
      const score = (s) => { const [sx, sy] = s.split(',').map(Number); const d = [sx - cx, sy - cy]; const cr = dir[0] * d[1] - dir[1] * d[0]; const dt = dir[0] * d[0] + dir[1] * d[1]; return cr > 0 ? 2 : dt > 0 ? 1 : 0; };
      next = opts.sort((a, b) => score(b) - score(a))[0];
    }
    prev = cur; cur = next;
  }
  const isCorner = (x, y) => rects.some((r) => (x === r.x || x === r.x + r.w) && (y === r.y || y === r.y + r.h));
  const labeled = walk.filter((s, i) => { const [x, y] = s.split(',').map(Number); return isCorner(x, y) && walk.indexOf(s) === i; });
  const letters = ['ㄱ', 'ㄴ', 'ㄷ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅅ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
  const points = labeled.map((s, i) => {
    const [x, y] = s.split(',').map(Number);
    return { x, y, name: letters[i] || `점${i + 1}`, p3: point3(rects, A, x, y) };
  });
  // 이웃한 이름 붙은 점 사이 = 선분
  const order = walk.filter((s) => labeled.includes(s));
  const segs = [];
  // 걸음 순서대로 이름 점 사이를 잇는다 (같은 점을 두 번 지나는 경우도 고려)
  const seq = walk.filter((s) => labeled.includes(s)).concat([walk[0]]);
  for (let i = 0; i < seq.length - 1; i++) {
    const a = points.find((p) => `${p.x},${p.y}` === seq[i]);
    const b = points.find((p) => `${p.x},${p.y}` === seq[i + 1]);
    if (!a || !b || a === b) continue;
    const ri = rects.findIndex((r) => onRectSide(r, a) && onRectSide(r, b) && (a.x === b.x || a.y === b.y));
    const T = A.T[ri];
    const p3a = T ? add(mv(T.M, [a.x, 0, a.y]), T.t) : null;
    const p3b = T ? add(mv(T.M, [b.x, 0, b.y]), T.t) : null;
    segs.push({ a, b, name: a.name + b.name, rect: ri, p3a, p3b, len: Math.abs(a.x - b.x) + Math.abs(a.y - b.y) });
  }
  void order;
  segs.forEach((s, i) => {
    s.id = i;
    const k = [key3(s.p3a), key3(s.p3b)].sort().join('|');
    s.key3 = k;
  });
  segs.forEach((s) => { s.partner = segs.find((t) => t !== s && t.key3 === s.key3)?.id ?? -1; });
  points.forEach((p, i) => { p.id = i; p.k3 = key3(p.p3); });
  points.forEach((p) => { p.same = points.filter((q) => q !== p && q.k3 === p.k3).map((q) => q.id); });
  return { points, segs };
}

function onRectSide(r, p) {
  const inX = p.x >= r.x && p.x <= r.x + r.w, inY = p.y >= r.y && p.y <= r.y + r.h;
  return inX && inY && (p.x === r.x || p.x === r.x + r.w || p.y === r.y || p.y === r.y + r.h);
}

function point3(rects, A, x, y) {
  for (const i of A.order) {
    const r = rects[i];
    if ((x === r.x || x === r.x + r.w) && (y === r.y || y === r.y + r.h)) return add(mv(A.T[i].M, [x, 0, y]), A.T[i].t);
  }
  return [x, 0, y];
}

// 접는 선(점선)과 자르는 선(실선)
export function netLines(rects, A) {
  const fold = A.hinges.map((h) => ({ p: h.p, q: h.q }));
  const isHinge = (p, q) => fold.some((f) => (f.p[0] === p[0] && f.p[1] === p[1] && f.q[0] === q[0] && f.q[1] === q[1]));
  const cut = [];
  rects.forEach((r) => {
    const s = [[[r.x, r.y], [r.x + r.w, r.y]], [[r.x, r.y + r.h], [r.x + r.w, r.y + r.h]], [[r.x, r.y], [r.x, r.y + r.h]], [[r.x + r.w, r.y], [r.x + r.w, r.y + r.h]]];
    s.forEach(([p, q]) => { if (!isHinge(p, q)) cut.push({ p, q }); });
  });
  return { fold, cut };
}

// ---------- 3D 접기 ----------
export class FoldView extends View {
  constructor(container, rects, A, opts = {}) {
    super(container, { yaw: -0.5, pitch: 0.75, ...opts });
    this.rects = rects; this.A = A;
    this.content = new THREE.Group();
    this.root.add(this.content);
    this.nodes = []; this.meshes = [];
    const H = (i) => (i === A.root || A.parent[i] < 0 ? [0, 0, 0] : A.hinges[A.via[i]].H);
    const order = [...A.order, ...A.apart];
    for (const i of order) {
      const node = new THREE.Object3D();
      const r = rects[i];
      const hi = A.T[i] ? H(i) : [0, 0, 0];
      if (A.parent[i] >= 0) {
        const hp = H(A.parent[i]);
        node.position.set(hi[0] - hp[0], 0, hi[2] - hp[2]);
        this.nodes[A.parent[i]].add(node);
      } else this.content.add(node);
      const shade = new THREE.Color(CARD).offsetHSL(0, 0, ((i * 37) % 7 - 3) * 0.012);
      const g = new THREE.PlaneGeometry(r.w, r.h);
      g.rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: shade, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1, transparent: true, opacity: A.T[i] ? 1 : 0.55 }));
      mesh.userData.base = shade.getHex();
      mesh.position.set(r.x + r.w / 2 - hi[0], 0, r.y + r.h / 2 - hi[2]);
      const ed = new THREE.LineSegments(new THREE.EdgesGeometry(g), new THREE.LineBasicMaterial({ color: INK }));
      mesh.add(ed);
      node.add(mesh);
      this.nodes[i] = node; this.meshes[i] = mesh;
    }
    const xs = rects.flatMap((r) => [r.x, r.x + r.w]), zs = rects.flatMap((r) => [r.y, r.y + r.h]);
    this.flatCenter = [(Math.min(...xs) + Math.max(...xs)) / 2, 0, (Math.min(...zs) + Math.max(...zs)) / 2];
    const flatR = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)) / 2;
    this.boxCenter = A.center || this.flatCenter;
    this.fit(Math.max(flatR, 2) * 1.05);
    this.marks = new THREE.Group();
    this.content.add(this.marks);
    this.setFold(0);
  }

  setFold(t) {
    this.t = t;
    const th = t * Math.PI / 2;
    this.A.order.forEach((i) => {
      if (this.A.parent[i] < 0) return;
      const s = this.A.side[i];
      const node = this.nodes[i];
      node.rotation.set(0, 0, 0);
      if (s === '+x') node.rotation.z = th;
      else if (s === '-x') node.rotation.z = -th;
      else if (s === '+z') node.rotation.x = -th;
      else node.rotation.x = th;
    });
    const c = this.flatCenter.map((v, k) => v + (this.boxCenter[k] - v) * t);
    this.content.position.set(-c[0], -c[1], -c[2]);
  }

  fold(ms = 1600, to = 1) {
    const from = this.t;
    return this.animate(ms, (k) => {
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      this.setFold(from + (to - from) * e);
    });
  }

  tint(i, color) { this.meshes[i].material.color.set(color ?? this.meshes[i].userData.base); }

  markSeg(p3a, p3b, color, r = 0.07) {
    const a = new THREE.Vector3(...p3a), b = new THREE.Vector3(...p3b);
    const len = a.distanceTo(b);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 8), new THREE.MeshBasicMaterial({ color }));
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    this.marks.add(m);
    return m;
  }

  markPoint(p3, color, r = 0.16, label = null) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), new THREE.MeshBasicMaterial({ color }));
    m.position.set(...p3);
    this.marks.add(m);
    return m;
  }

  unmark(m) { if (m) { this.marks.remove(m); m.geometry.dispose(); m.material.dispose(); } }
}

export { VL };
