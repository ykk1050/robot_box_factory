// 골판지 재단대: 전개도를 만들고 '접어 보기'로 정말 상자가 되는지 확인한다.
// paint 모드 = 정육면체(칸 칠하기), pieces 모드 = 직육면체(조각 끌어 놓기)
import { analyzeNet, canonical, netLines, FoldView, cellsToRects } from '../net.js';

const NS = 'http://www.w3.org/2000/svg';
const S = (tag, a = {}) => { const e = document.createElementNS(NS, tag); for (const k in a) e.setAttribute(k, a[k]); return e; };
const sameDims = (a, b) => (a.w === b.w && a.h === b.h) || (a.w === b.h && a.h === b.w);
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

export function netThumb(rects, size = 90) {
  const xs = rects.flatMap((r) => [r.x, r.x + r.w]), ys = rects.flatMap((r) => [r.y, r.y + r.h]);
  const x0 = Math.min(...xs), y0 = Math.min(...ys), W = Math.max(...xs) - x0, H = Math.max(...ys) - y0;
  const svg = S('svg', { viewBox: `${x0 - 0.3} ${y0 - 0.3} ${W + 0.6} ${H + 0.6}`, width: size, height: size * Math.min(1.4, (H + 0.6) / (W + 0.6)) });
  rects.forEach((r) => svg.append(S('rect', { x: r.x, y: r.y, width: r.w, height: r.h, fill: '#d9a46a', stroke: '#3b2a1e', 'stroke-width': Math.max(W, H) * 0.02 })));
  return svg;
}

export function boxPicture(dims, size = 150) {
  const [w, hh, d] = dims;
  const k = 0.55, a = (35 * Math.PI) / 180, dx = d * k * Math.cos(a), dy = d * k * Math.sin(a);
  const m = Math.max(w, hh, d) * 0.35;
  const svg = S('svg', { viewBox: `${-m} ${-dy - m} ${w + dx + m * 2} ${hh + dy + m * 2}`, width: size, height: size * 0.75 });
  const sw = Math.max(w, hh, d) * 0.03;
  const poly = (pts, fill) => svg.append(S('polygon', { points: pts.map((p) => p.join(',')).join(' '), fill, stroke: '#3b2a1e', 'stroke-width': sw, 'stroke-linejoin': 'round' }));
  poly([[0, 0], [w, 0], [w, hh], [0, hh]], '#d9a46a');
  poly([[0, 0], [dx, -dy], [w + dx, -dy], [w, 0]], '#e6b984');
  poly([[w, 0], [w + dx, -dy], [w + dx, hh - dy], [w, hh]], '#c38b52');
  const fs = Math.max(w, hh, d) * 0.2;
  const txt = (x, y, t) => { const e = S('text', { x, y, 'font-size': fs, 'text-anchor': 'middle', fill: '#3b2a1e', 'font-family': 'Jua, sans-serif' }); e.textContent = t; svg.append(e); };
  txt(w / 2, hh + fs * 1.1, `${w}cm`);
  txt(-fs * 0.9, hh / 2 + fs * 0.3, `${hh}cm`);
  txt(w + dx / 2 + fs * 0.9, hh - dy / 2 + fs * 0.8, `${d}cm`);
  return svg;
}

export default function runCut(stage, spec, ctx) {
  const { h } = ctx;
  const paint = spec.mode === 'paint';
  return new Promise((resolve) => {
    const board = h('div', { class: 'board' }, h('div', { class: 'hint' }, paint ? '칸을 눌러 골판지를 칠해요 (다시 누르면 지워져요)' : '조각을 끌어다 놓아요 · 놓은 조각을 누르면 돌아가요 · 밖으로 끌면 빠져요'));
    const side = h('div', { class: 'side' });
    stage.append(board, side);
    const cols = spec.cols, rows = spec.rows;
    const svg = S('svg', { viewBox: `-0.4 -0.4 ${cols + 0.8} ${rows + 0.8}`, preserveAspectRatio: 'xMidYMid meet' });
    board.append(svg);
    const gGrid = S('g'), gPieces = S('g'), gLines = S('g'), gGhost = S('g');
    svg.append(gGrid, gPieces, gLines, gGhost);
    for (let x = 0; x <= cols; x++) gGrid.append(S('line', { x1: x, y1: 0, x2: x, y2: rows, stroke: '#e6dcc8', 'stroke-width': 0.03 }));
    for (let y = 0; y <= rows; y++) gGrid.append(S('line', { x1: 0, y1: y, x2: cols, y2: y, stroke: '#e6dcc8', 'stroke-width': 0.03 }));

    const order = paint ? [1, 1, 1] : spec.order;
    let rects = [];
    const tray = (spec.tray || []).map((t) => ({ ...t }));
    if (paint) {
      (spec.locked || []).forEach(([x, y]) => rects.push({ x, y, w: 1, h: 1, locked: true }));
      (spec.cells || []).forEach(([x, y]) => rects.push({ x, y, w: 1, h: 1 }));
    } else {
      (spec.locked || []).forEach((r) => rects.push({ ...r, locked: true }));
    }
    const made = [];
    const registry = (spec.registry || []).map((r) => (Array.isArray(r[0]) ? cellsToRects(r) : r));
    const regCanon = registry.map(canonical);
    let red = new Set();
    let sel = null; // 고른 트레이 조각
    let folding = false;
    let dragActive = false;

    // ---------- 그리기 ----------
    function draw() {
      gPieces.innerHTML = ''; gLines.innerHTML = '';
      rects.forEach((r, i) => {
        const g = S('g');
        g.append(S('rect', { x: r.x, y: r.y, width: r.w, height: r.h, fill: red.has(i) ? '#ef9a8c' : r.locked ? '#c99256' : '#d9a46a' }));
        if (!paint) {
          const t = S('text', { x: r.x + r.w / 2, y: r.y + r.h / 2 + 0.18, 'font-size': Math.min(0.9, Math.min(r.w, r.h) * 0.42), 'text-anchor': 'middle', fill: '#5b3d22', 'font-family': 'Jua, sans-serif' });
          t.textContent = `${r.w}×${r.h}`;
          t.style.pointerEvents = 'none';
          g.append(t);
          if (!r.locked) {
            g.style.cursor = 'grab';
            g.addEventListener('pointerdown', (e) => startPieceDrag(e, i));
          }
        }
        gPieces.append(g);
      });
      if (rects.length) {
        const A = analyzeNet(rects);
        const L = netLines(rects, A);
        L.cut.forEach(({ p, q }) => gLines.append(S('line', { x1: p[0], y1: p[1], x2: q[0], y2: q[1], stroke: '#3b2a1e', 'stroke-width': 0.07, 'stroke-linecap': 'round' })));
        L.fold.forEach(({ p, q }) => gLines.append(S('line', { x1: p[0], y1: p[1], x2: q[0], y2: q[1], stroke: '#3b2a1e', 'stroke-width': 0.06, 'stroke-dasharray': '0.18 0.14' })));
      }
      gLines.style.pointerEvents = 'none';
      drawTray();
      countEl.textContent = paint ? `칠한 칸 ${rects.length}개` : `놓은 조각 ${rects.length}개`;
    }

    function svgPoint(e) {
      const pt = svg.createSVGPoint();
      pt.x = e.clientX; pt.y = e.clientY;
      const m = svg.getScreenCTM();
      return m ? pt.matrixTransform(m.inverse()) : { x: -99, y: -99 };
    }
    const inBoard = (r) => r.x >= 0 && r.y >= 0 && r.x + r.w <= cols && r.y + r.h <= rows;
    const fits = (r, skip = -1) => inBoard(r) && rects.every((o, j) => j === skip || !overlap(o, r));

    // ---------- 칠하기 모드 ----------
    if (paint) {
      svg.addEventListener('pointerup', (e) => {
        if (folding) return;
        const p = svgPoint(e);
        const x = Math.floor(p.x), y = Math.floor(p.y);
        if (x < 0 || y < 0 || x >= cols || y >= rows) return;
        const i = rects.findIndex((r) => r.x === x && r.y === y);
        if (i >= 0) {
          if (rects[i].locked) { ctx.say('진한 칸은 이미 잘라 둔 골판지라 그대로 둬요.'); return; }
          rects.splice(i, 1);
        } else rects.push({ x, y, w: 1, h: 1 });
        red.clear();
        ctx.sfx('click');
        draw();
      });
    }

    // ---------- 조각 모드 ----------
    const trayEl = h('div', { class: 'tray' });
    function remaining(t) { return t.n - rects.filter((r) => !r.locked && r.type === t).length; }
    function drawTray() {
      if (paint) return;
      trayEl.innerHTML = '';
      tray.forEach((t) => {
        const left = remaining(t);
        const b = h('button', { class: 'piece-btn' + (sel === t ? ' sel' : '') }, netThumb([{ x: 0, y: 0, w: t.w, h: t.h }], 56), `${t.w}×${t.h} · ${left}장`);
        b.disabled = left <= 0;
        b.addEventListener('pointerdown', (e) => startTrayDrag(e, t));
        trayEl.append(b);
      });
    }

    function ghost(r, ok) {
      gGhost.innerHTML = '';
      if (!r) return;
      gGhost.append(S('rect', { x: r.x, y: r.y, width: r.w, height: r.h, fill: ok ? '#2f6fde44' : '#d6454544', stroke: ok ? '#2f6fde' : '#d64545', 'stroke-width': 0.06 }));
    }

    function dragLoop(e0, base, onDrop) {
      // base: {w,h} 조각 크기. onDrop(rect|null, moved)
      e0.preventDefault();
      dragActive = true;
      let moved = false, cur = null;
      const sx = e0.clientX, sy = e0.clientY;
      const move = (e) => {
        if (!moved && Math.hypot(e.clientX - sx, e.clientY - sy) > 8) moved = true;
        if (!moved) return;
        const p = svgPoint(e);
        cur = { x: Math.round(p.x - base.w / 2), y: Math.round(p.y - base.h / 2), w: base.w, h: base.h };
        const inside = p.x >= -0.4 && p.y >= -0.4 && p.x <= cols + 0.4 && p.y <= rows + 0.4;
        if (!inside) cur.out = true;
        ghost(cur.out ? null : cur, base.check(cur));
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
        ghost(null);
        setTimeout(() => { dragActive = false; }, 0);
        onDrop(cur, moved);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
    }

    function startTrayDrag(e, t) {
      if (folding || remaining(t) <= 0) return;
      dragLoop(e, { w: t.w, h: t.h, check: (r) => fits(r) }, (r, moved) => {
        if (!moved) { sel = sel === t ? null : t; ctx.sfx('click'); if (sel) ctx.say(`${t.w}×${t.h} 조각을 골랐어요. 놓을 자리의 왼쪽 위 칸을 눌러요.`); drawTray(); return; }
        if (!r || r.out) return;
        if (!fits(r)) { ctx.say('다른 조각과 겹치거나 판 밖이라 놓을 수 없어요.'); return; }
        rects.push({ ...r, type: t }); delete rects[rects.length - 1].out;
        red.clear(); ctx.sfx('click'); draw();
      });
    }

    function startPieceDrag(e, i) {
      if (folding) return;
      e.stopPropagation();
      const piece = rects[i];
      dragLoop(e, { w: piece.w, h: piece.h, check: (r) => fits(r, i) }, (r, moved) => {
        if (!moved) {
          const rr = { x: piece.x, y: piece.y, w: piece.h, h: piece.w };
          if (fits(rr, i)) { piece.w = rr.w; piece.h = rr.h; ctx.sfx('click'); red.clear(); draw(); } else ctx.say('돌릴 자리가 없어요. 조금 옮긴 뒤 돌려요.');
          return;
        }
        if (!r || r.out) { rects.splice(i, 1); ctx.sfx('click'); red.clear(); draw(); return; }
        if (fits(r, i)) { piece.x = r.x; piece.y = r.y; ctx.sfx('click'); red.clear(); draw(); } else ctx.say('겹치는 자리에는 놓을 수 없어요.');
      });
    }

    if (!paint) {
      svg.addEventListener('pointerup', (e) => {
        if (!sel || folding || dragActive || e.target.closest('g')?.parentNode === gPieces) return;
        const p = svgPoint(e);
        const r = { x: Math.floor(p.x), y: Math.floor(p.y), w: sel.w, h: sel.h };
        if (remaining(sel) <= 0) { sel = null; drawTray(); return; }
        if (!fits(r)) { ctx.say('그 자리에는 다 들어가지 않거나 다른 조각과 겹쳐요.'); return; }
        rects.push({ ...r, type: sel });
        if (remaining(sel) <= 0) sel = null;
        red.clear(); ctx.sfx('click'); draw();
      });
    }

    // ---------- 옆 패널 ----------
    const countEl = h('p', { class: 'muted', style: 'margin:4px 0 0' });
    const thumbs = h('div', { class: 'thumbs' });
    const orderPanel = h('div', { class: 'panel order' }, h('h3', {}, '📋 주문서'), h('div', { class: 'big' }, spec.order_text || (paint ? '정육면체 상자 전개도' : `직육면체 상자 ${order[0]}×${order[2]}×${order[1]}`)));
    if (!paint) orderPanel.append(boxPicture(order, 170));
    if (spec.goal_text) orderPanel.append(h('p', { style: 'margin:4px 0 0' }, spec.goal_text));
    orderPanel.append(countEl);
    side.append(orderPanel);
    if (!paint) side.append(h('div', { class: 'panel' }, h('h3', {}, '🧰 골판지 조각'), trayEl));
    if (spec.goal === 'distinct') side.append(h('div', { class: 'panel' }, h('h3', {}, '🗂 등록된 금형'), thumbs));
    registry.forEach((r) => thumbs.append(netThumb(r)));
    side.append(h('div', { class: 'row wrap' },
      h('button', { class: 'btn big', onclick: () => tryFold() }, '📦 접어 보기'),
      h('button', { class: 'btn ghost', onclick: () => { if (folding) return; rects = rects.filter((r) => r.locked); red.clear(); ctx.sfx('click'); draw(); } }, '모두 치우기')));

    // ---------- 접기 ----------
    async function tryFold() {
      if (folding) return;
      ctx.sfx('click');
      if (!rects.length) { ctx.say('먼저 골판지를 놓아요.'); return; }
      const A = analyzeNet(rects, order);
      if (A.problem === 'apart') {
        red = new Set(A.apart); draw();
        ctx.mistake('떨어진 조각이 있어요. 접는 선은 두 면의 모서리 길이가 같고 딱 맞닿아야 이어져요.');
        return;
      }
      folding = true;
      const over = h('div', { class: 'fold-over' });
      const bar = h('div', { class: 'bar2' });
      board.append(over);
      const fv = new FoldView(over, rects, A);
      ctx.cleanup(() => fv.dispose());
      over.append(bar);
      ctx.sfx('fold');
      await fv.fold(1700);
      if (!ctx.alive()) return;
      const unfold = h('button', { class: 'btn ghost', onclick: async () => { unfold.disabled = true; await fv.fold(700, 0); fv.dispose(); over.remove(); folding = false; } }, '다시 펴서 고치기');
      if (A.valid && !A.problem) {
        const c = canonical(rects);
        if (spec.goal === 'distinct' && (regCanon.includes(c) || made.includes(c))) {
          ctx.say('상자는 되지만, 이미 등록된 모양과 같아요. 돌리거나 뒤집으면 똑같아요. 다른 모양으로 만들어 봐요.', 'sad');
          bar.append(unfold);
          return;
        }
        ctx.sfx('tape');
        ctx.good(spec.success || '뚜껑까지 딱 닫혔어요! 겹치는 면도 빈틈도 없어요.');
        fv.spring = false;
        made.push(c);
        const need = spec.need || 1;
        if (made.length < need) {
          bar.append(h('button', { class: 'btn', onclick: () => {
            thumbs.append(netThumb(rects.map((r) => ({ ...r }))));
            regCanon.push(c);
            rects = rects.filter((r) => r.locked); red.clear();
            fv.dispose(); over.remove(); folding = false; draw();
            ctx.say(`금형 등록! 다른 모양을 하나 더 만들어요. (${made.length}/${need})`);
          } }, '등록하고 다음 모양'));
          return;
        }
        bar.append(h('button', { class: 'btn', onclick: async () => {
          await ctx.finish(spec.done || '전개도를 접어서 상자를 완성했어요.', spec.note);
          fv.dispose(); resolve();
        } }, '출고하기 ▶'));
        return;
      }
      const tintAll = (ids) => ids.forEach((i) => fv.tint(i, 0xe0614f));
      if (A.problem === 'overlap') { tintAll([...new Set(A.overlaps.flat())]); ctx.mistake('빨간 면끼리 겹쳐요! 같은 자리에 면이 두 장 생겼고, 다른 곳엔 구멍이 생겨요.'); }
      else if (A.problem === 'hole') ctx.mistake(`면이 ${A.n}개뿐이라 구멍이 생겼어요. 상자는 면이 6개 있어야 닫혀요.`);
      else if (A.problem === 'extra') ctx.mistake(`면이 ${A.n}개라 남아요. 상자의 면은 6개예요.`);
      else if (A.problem === 'misfit') { tintAll(A.misfit); ctx.mistake('접었더니 틈이 생기거나 튀어나와요. 마주 보는 면은 크기가 같아야 하고, 맞닿는 모서리 길이가 같아야 해요.'); }
      else if (A.problem === 'wrongsize') ctx.mistake(`상자는 닫혔지만 크기가 ${A.dims.join('×')}예요. 주문서 크기를 다시 봐요.`);
      bar.append(unfold);
    }

    draw();
  });
}
