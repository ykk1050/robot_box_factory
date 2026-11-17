// 테이프 이음대: 전개도를 접었을 때 맞닿는 선분(겹치는 선분)과 만나는 점(겹치는 점)을 찾는다.
import { analyzeNet, netBoundary, netLines, FoldView, cellsToRects } from '../net.js';

const NS = 'http://www.w3.org/2000/svg';
const S = (tag, a = {}) => { const e = document.createElementNS(NS, tag); for (const k in a) e.setAttribute(k, a[k]); return e; };
const TAPE = ['#f4b942', '#6fc3df', '#a4d36b', '#f08fb5', '#b79cf0', '#f5925a', '#5fd1b0'];

export default function runSeam(stage, spec, ctx) {
  const { h } = ctx;
  return new Promise((resolve) => {
    const rects = spec.cells ? cellsToRects(spec.cells) : spec.rects.map((r) => ({ ...r }));
    const A = analyzeNet(rects);
    const { points, segs } = netBoundary(rects, A);
    const xs = rects.flatMap((r) => [r.x, r.x + r.w]), ys = rects.flatMap((r) => [r.y, r.y + r.h]);
    const x0 = Math.min(...xs), y0 = Math.min(...ys), W = Math.max(...xs) - x0, H = Math.max(...ys) - y0;
    const u = Math.max(W, H) / 12;

    const board = h('div', { class: 'board' }, h('div', { class: 'hint' }, '전개도 위의 선분과 점을 눌러요'));
    const side = h('div', { class: 'side' });
    stage.append(board, side);
    const svg = S('svg', { viewBox: `${x0 - u * 1.6} ${y0 - u * 1.6} ${W + u * 3.2} ${H + u * 3.2}`, preserveAspectRatio: 'xMidYMid meet' });
    board.append(svg);
    const mini = h('div', { class: 'mini3d' }, h('div', { class: 'hint' }, '접은 모습 (돌려 볼 수 있어요)'));
    const orderEl = h('div', { class: 'big' });
    const subEl = h('p', { class: 'muted', style: 'margin:4px 0 0' });
    const okBtn = h('button', { class: 'btn warn', style: 'display:none' }, '확인');
    side.append(h('div', { class: 'panel order' }, h('h3', {}, '📋 작업 지시'), orderEl, subEl), mini, okBtn);
    const fv = new FoldView(mini, rects, A, { pitch: 0.5 });
    ctx.cleanup(() => fv.dispose());
    fv.setFold(1);
    fv.fit(Math.max(...A.dims) * 0.95);
    const mr = Math.max(...A.dims) * 0.035;

    const segColor = new Map(); // id -> color
    const ptSel = new Set();
    let segSel = null, ti = 0, onSeg = null, onPoint = null, onOk = null;
    let flashSeg = new Set();

    function draw() {
      svg.innerHTML = '';
      rects.forEach((r) => svg.append(S('rect', { x: r.x, y: r.y, width: r.w, height: r.h, fill: '#d9a46a' })));
      const L = netLines(rects, A);
      L.fold.forEach(({ p, q }) => svg.append(S('line', { x1: p[0], y1: p[1], x2: q[0], y2: q[1], stroke: '#3b2a1e', 'stroke-width': u * 0.07, 'stroke-dasharray': `${u * 0.25} ${u * 0.2}` })));
      segs.forEach((s) => {
        const c = flashSeg.has(s.id) ? '#d64545' : segSel === s.id ? '#2f6fde' : segColor.get(s.id) || '#3b2a1e';
        const wide = segColor.has(s.id) || segSel === s.id || flashSeg.has(s.id);
        svg.append(S('line', { x1: s.a.x, y1: s.a.y, x2: s.b.x, y2: s.b.y, stroke: c, 'stroke-width': u * (wide ? 0.32 : 0.09), 'stroke-linecap': 'round' }));
        if (onSeg) {
          const hit = S('line', { x1: s.a.x, y1: s.a.y, x2: s.b.x, y2: s.b.y, stroke: 'transparent', 'stroke-width': u * 1.1 });
          hit.style.cursor = 'pointer';
          hit.addEventListener('pointerup', () => onSeg(s));
          svg.append(hit);
        }
      });
      const cx = x0 + W / 2, cy = y0 + H / 2;
      points.forEach((p) => {
        const g = S('g');
        const on = ptSel.has(p.id) || p.target;
        g.append(S('circle', { cx: p.x, cy: p.y, r: u * (on ? 0.32 : 0.2), fill: p.target ? '#e0442f' : ptSel.has(p.id) ? '#2f6fde' : '#fff', stroke: '#3b2a1e', 'stroke-width': u * 0.06 }));
        const dx = p.x - cx, dy = p.y - cy, dl = Math.hypot(dx, dy) || 1;
        const t = S('text', { x: p.x + (dx / dl) * u * 0.75, y: p.y + (dy / dl) * u * 0.75 + u * 0.28, 'font-size': u * 0.8, 'text-anchor': 'middle', fill: '#3b2a1e', 'font-family': 'Jua, sans-serif' });
        t.textContent = p.name;
        g.append(t);
        if (onPoint) {
          g.append(S('circle', { cx: p.x, cy: p.y, r: u * 0.75, fill: 'transparent' }));
          g.style.cursor = 'pointer';
          g.addEventListener('pointerup', () => onPoint(p));
        }
        svg.append(g);
      });
    }

    const findSeg = (name) => segs.find((s) => s.a.name + s.b.name === name || s.b.name + s.a.name === name);
    const findPt = (name) => points.find((p) => p.name === name);
    let tapeN = 0;
    function tape(s, t) {
      const col = TAPE[tapeN++ % TAPE.length];
      segColor.set(s.id, col); segColor.set(t.id, col);
      fv.markSeg(s.p3a, s.p3b, col, mr);
      ctx.sfx('tape');
    }

    function next() {
      onSeg = onPoint = onOk = null; segSel = null; ptSel.clear();
      points.forEach((p) => { p.target = false; });
      okBtn.style.display = 'none';
      const t = spec.tasks[ti];
      if (!t) return end();
      ({ seg: taskSeg, point: taskPoint, tapeAll: taskTapeAll })[t.k](t);
      draw();
    }
    async function taskDone(text) {
      onSeg = onPoint = onOk = null; draw();
      ctx.good(text);
      await new Promise((r) => setTimeout(r, 1300));
      if (!ctx.alive()) return;
      ti++; next();
    }

    function taskSeg(t) {
      const pool = segs.filter((x) => x.partner >= 0 && ![x.a.id, x.b.id].some((i) => [segs[x.partner].a.id, segs[x.partner].b.id].includes(i)));
      const s = t.s ? findSeg(t.s) : (pool[t.pick % Math.max(1, pool.length)] || segs.find((x) => x.partner >= 0));
      const partner = segs[s.partner];
      orderEl.textContent = `선분 ${s.a.name}${s.b.name}과(와) 맞닿는 선분은?`;
      subEl.textContent = '접었을 때 겹치는 선분을 눌러 테이프로 이어요.';
      segSel = s.id;
      const m = fv.markSeg(s.p3a, s.p3b, 0x2f6fde, mr);
      onSeg = (x) => {
        if (x.id === s.id) return;
        if (x.id === partner.id) { fv.unmark(m); tape(s, x); taskDone(`선분 ${s.a.name}${s.b.name}과(와) 선분 ${x.a.name}${x.b.name}이(가) 겹쳐요.`); return; }
        wrongSeg(x);
      };
    }

    function wrongSeg(x) {
      const m = fv.markSeg(x.p3a, x.p3b, 0xd64545, mr);
      flashSeg = new Set([x.id]); draw();
      ctx.mistake(`선분 ${x.a.name}${x.b.name}은(는) 접으면 다른 곳에 가요. 오른쪽 접은 모습에서 빨간 선을 봐요.`);
      setTimeout(() => { fv.unmark(m); flashSeg = new Set(); if (ctx.alive()) draw(); }, 1500);
    }

    function taskPoint(t) {
      const pool = [...points.filter((x) => x.same.length >= 2), ...points.filter((x) => x.same.length === 1)];
      const p = t.p ? findPt(t.p) : pool[t.pick % Math.max(1, pool.length)];
      p.target = true;
      orderEl.textContent = `점 ${p.name}과(와) 만나는 점을 모두`;
      subEl.textContent = '접었을 때 같은 꼭짓점이 되는 점을 모두 누르고 확인을 눌러요.';
      okBtn.style.display = '';
      onPoint = (q) => {
        if (q.id === p.id) return;
        ctx.sfx('click');
        if (ptSel.has(q.id)) ptSel.delete(q.id); else ptSel.add(q.id);
        draw();
      };
      onOk = () => {
        const want = new Set(p.same);
        const wrong = [...ptSel].filter((i) => !want.has(i));
        const miss = [...want].filter((i) => !ptSel.has(i));
        const pm = fv.markPoint(p.p3, 0xe0442f, mr * 2.2);
        if (!wrong.length && !miss.length) {
          taskDone(`점 ${[p, ...p.same.map((i) => points[i])].map((q) => q.name).join(', ')}이(가) 한 꼭짓점에서 만나요.`);
          setTimeout(() => fv.unmark(pm), 1300);
          return;
        }
        if (wrong.length) ctx.mistake(`점 ${wrong.map((i) => points[i].name).join(', ')}은(는) 다른 꼭짓점으로 가요. 빨간 공이 점 ${p.name}이 가는 곳이에요.`);
        else ctx.mistake(`아직 ${miss.length}개 더 있어요. 빨간 공이 점 ${p.name}이 가는 곳이에요.`);
        setTimeout(() => fv.unmark(pm), 1800);
      };
    }

    function taskTapeAll() {
      const total = segs.filter((s) => s.partner >= 0).length / 2;
      let first = null;
      const left = () => total - segColor.size / 2;
      orderEl.textContent = '잘린 모서리를 모두 테이프로 이어요';
      subEl.textContent = `맞닿는 두 선분을 차례로 누르면 테이프가 붙어요. 남은 이음 ${left()}곳`;
      onSeg = (x) => {
        if (segColor.has(x.id)) { ctx.say('이미 테이프를 붙였어요.'); return; }
        if (first === null) { first = x; segSel = x.id; ctx.sfx('click'); draw(); return; }
        if (first.id === x.id) { first = null; segSel = null; draw(); return; }
        const a = first; first = null; segSel = null;
        if (a.partner === x.id) {
          tape(a, x);
          subEl.textContent = `맞닿는 두 선분을 차례로 누르면 테이프가 붙어요. 남은 이음 ${left()}곳`;
          if (left() === 0) { taskDone(`잘린 모서리 ${total}곳을 모두 붙여 상자를 완성했어요!`); return; }
          ctx.say('착! 딱 맞아요.', 'happy');
          draw();
        } else wrongSeg(x);
      };
    }

    okBtn.addEventListener('click', () => { ctx.sfx('click'); if (onOk) onOk(); });

    async function end() {
      await ctx.finish(spec.done || '접었을 때 겹치는 점과 선분을 모두 찾았어요.', spec.note);
      fv.dispose();
      resolve();
    }
    next();
  });
}
