// 재단기: 골판지 위에 손가락으로 끌어서 면(직사각형)을 그린다. 그린 면을 누르면 지워진다.
import { analyzeNet, netLines } from './net.js';

const NS = 'http://www.w3.org/2000/svg';
const S = (tag, a = {}) => { const e = document.createElementNS(NS, tag); for (const k in a) e.setAttribute(k, a[k]); return e; };
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

export function boxPicture(dims, size = 150) {
  const [w, hh, d] = dims;
  const k = 0.55, a = (35 * Math.PI) / 180, dx = d * k * Math.cos(a), dy = d * k * Math.sin(a);
  // 글자 크기를 먼저 정하고, 글자가 들어갈 여백을 넉넉히 잡는다(높이·세로 글자가 잘리지 않게)
  const fs = Math.max(w, hh, d) * 0.2;
  const label = (n) => fs * (2.0 + 0.62 * String(n).length); // "높이 4" 같은 글자의 대략 너비
  const left = label(hh) + fs * 0.5, right = label(d) + fs * 0.6, top = fs * 0.6, bottom = fs * 1.7;
  const vbW = left + w + dx + right, vbH = top + dy + hh + bottom;
  const svg = S('svg', { viewBox: `${-left} ${-dy - top} ${vbW} ${vbH}`, width: size, height: Math.round(size * vbH / vbW) });
  const sw = Math.max(w, hh, d) * 0.03;
  const poly = (pts, fill) => svg.append(S('polygon', { points: pts.map((p) => p.join(',')).join(' '), fill, stroke: '#3b2a1e', 'stroke-width': sw, 'stroke-linejoin': 'round' }));
  poly([[0, 0], [w, 0], [w, hh], [0, hh]], '#f3e3c9');
  poly([[0, 0], [dx, -dy], [w + dx, -dy], [w, 0]], '#fbf0dc');
  poly([[w, 0], [w + dx, -dy], [w + dx, hh - dy], [w, hh]], '#e6d0ac');
  const txt = (x, y, t, col, anchor = 'middle') => { const e = S('text', { x, y, 'font-size': fs, 'text-anchor': anchor, fill: col, 'font-family': 'Jua, sans-serif' }); e.textContent = t; svg.append(e); };
  txt(w / 2, hh + fs * 1.15, `가로 ${w}`, '#c0392b');
  txt(-fs * 0.35, hh / 2 + fs * 0.35, `높이 ${hh}`, '#2f6fde', 'end');
  txt(w + dx + fs * 0.3, hh - dy * 0.5 + fs * 0.35, `세로 ${d}`, '#2a9d55', 'start');
  return svg;
}

export class Cutter {
  constructor(host, { cols = 18, rows = 13, onCut, onChange } = {}) {
    this.cols = cols; this.rows = rows; this.rects = []; this.red = new Set();
    this.onCut = onCut; this.onChange = onChange;
    this.svg = S('svg', { viewBox: `-0.3 -0.3 ${cols + 0.6} ${rows + 0.6}`, preserveAspectRatio: 'xMidYMid meet', class: 'sheet' });
    host.append(this.svg);
    const bg = S('rect', { x: 0, y: 0, width: cols, height: rows, fill: '#e8c79a', rx: 0.15 });
    this.svg.append(bg);
    this.gGrid = S('g'); this.gPieces = S('g'); this.gLines = S('g'); this.gGhost = S('g');
    this.gLines.style.pointerEvents = 'none'; this.gGhost.style.pointerEvents = 'none';
    this.svg.append(this.gGrid, this.gPieces, this.gLines, this.gGhost);
    for (let x = 0; x <= cols; x++) this.gGrid.append(S('line', { x1: x, y1: 0, x2: x, y2: rows, stroke: '#cfa875', 'stroke-width': 0.025 }));
    for (let y = 0; y <= rows; y++) this.gGrid.append(S('line', { x1: 0, y1: y, x2: cols, y2: y, stroke: '#cfa875', 'stroke-width': 0.025 }));
    this.gGrid.style.pointerEvents = 'none';
    this._bind();
    this.draw();
  }

  pt(e) {
    const p = this.svg.createSVGPoint();
    p.x = e.clientX; p.y = e.clientY;
    const m = this.svg.getScreenCTM();
    return m ? p.matrixTransform(m.inverse()) : { x: -9, y: -9 };
  }

  _bind() {
    let start = null, cur = null, id = null;
    const cell = (p) => [Math.max(0, Math.min(this.cols - 1, Math.floor(p.x))), Math.max(0, Math.min(this.rows - 1, Math.floor(p.y)))];
    const rectOf = (a, b) => ({ x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: Math.abs(a[0] - b[0]) + 1, h: Math.abs(a[1] - b[1]) + 1 });
    this.svg.addEventListener('pointerdown', (e) => {
      if (this.locked) return;
      const p = this.pt(e);
      if (p.x < 0 || p.y < 0 || p.x > this.cols || p.y > this.rows) return;
      e.preventDefault();
      id = e.pointerId;
      try { this.svg.setPointerCapture(id); } catch (_) { /* 무시 */ }
      start = cell(p); cur = start;
      this.ghost(rectOf(start, cur));
    });
    this.svg.addEventListener('pointermove', (e) => {
      if (start === null || e.pointerId !== id) return;
      const c = cell(this.pt(e));
      if (c[0] !== cur[0] || c[1] !== cur[1]) { cur = c; this.ghost(rectOf(start, cur)); }
    });
    const end = (e) => {
      if (start === null || e.pointerId !== id) return;
      const r = rectOf(start, cur);
      const tap = r.w === 1 && r.h === 1;
      start = null;
      this.ghost(null);
      const hit = this.rects.findIndex((o) => overlap(o, r));
      if (tap && hit >= 0) { this.rects.splice(hit, 1); this.red.clear(); this.draw(); this.onChange?.('remove'); return; }
      if (hit >= 0) { this.onChange?.('overlap'); return; }
      this.rects.push(r); this.red.clear(); this.draw(); this.onChange?.('add', r);
    };
    this.svg.addEventListener('pointerup', end);
    this.svg.addEventListener('pointercancel', () => { start = null; this.ghost(null); });
  }

  ghost(r) {
    this.gGhost.innerHTML = '';
    if (!r) return;
    const bad = this.rects.some((o) => overlap(o, r));
    this.gGhost.append(S('rect', { x: r.x, y: r.y, width: r.w, height: r.h, fill: bad ? '#d6454544' : '#2f6fde33', stroke: bad ? '#d64545' : '#2f6fde', 'stroke-width': 0.08 }));
    const t = S('text', { x: r.x + r.w / 2, y: r.y + r.h / 2 + 0.25, 'font-size': 0.8, 'text-anchor': 'middle', fill: '#1d3f8a', 'font-family': 'Jua, sans-serif' });
    t.textContent = `${r.w}×${r.h}`;
    this.gGhost.append(t);
  }

  set(rects) { this.rects = rects.map((r) => ({ x: r.x, y: r.y, w: r.w, h: r.h })); this.red.clear(); this.draw(); }

  draw() {
    this.gPieces.innerHTML = ''; this.gLines.innerHTML = '';
    this.rects.forEach((r, i) => {
      this.gPieces.append(S('rect', { x: r.x, y: r.y, width: r.w, height: r.h, fill: this.red.has(i) ? '#f2a093' : '#fbe9cf' }));
      const t = S('text', { x: r.x + r.w / 2, y: r.y + r.h / 2 + 0.22, 'font-size': Math.min(0.75, Math.min(r.w, r.h) * 0.45), 'text-anchor': 'middle', fill: '#8a5a2b', 'font-family': 'Jua, sans-serif' });
      t.textContent = `${r.w}×${r.h}`;
      t.style.pointerEvents = 'none';
      this.gPieces.append(t);
    });
    if (this.rects.length) {
      const L = netLines(this.rects, analyzeNet(this.rects));
      L.cut.forEach(({ p, q }) => this.gLines.append(S('line', { x1: p[0], y1: p[1], x2: q[0], y2: q[1], stroke: '#3b2a1e', 'stroke-width': 0.08, 'stroke-linecap': 'round' })));
      L.fold.forEach(({ p, q }) => this.gLines.append(S('line', { x1: p[0], y1: p[1], x2: q[0], y2: q[1], stroke: '#3b2a1e', 'stroke-width': 0.06, 'stroke-dasharray': '0.2 0.15' })));
    }
  }
}
