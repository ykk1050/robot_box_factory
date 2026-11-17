// 송장 도면실(겨냥도): 트럭 기사님께 보낼 상자 그림을 그린다.
// 보이는 모서리는 실선, 보이지 않는 모서리는 점선.
import { Box3D, boxShape, VL } from '../three-view.js';

const NS = 'http://www.w3.org/2000/svg';
const S = (tag, a = {}) => { const e = document.createElementNS(NS, tag); for (const k in a) e.setAttribute(k, a[k]); return e; };
const HIDDEN_V = 4; // 왼쪽 아래 뒤 꼭짓점(ㅁ)이 기본 방향에서 숨는다

export default function runSketch(stage, spec, ctx) {
  const { h } = ctx;
  return new Promise((resolve) => {
    const pane = h('div', { class: 'pane3d', style: 'flex:0.9' }, h('div', { class: 'hint' }, '실제 상자 (끌면 잠깐 돌아가요)'));
    const board = h('div', { class: 'board' }, h('div', { class: 'hint' }, '점 두 개를 차례로 누르면 선이 생겨요 · 선을 누르면 실선 → 점선 → 지우기'));
    const side = h('div', { class: 'side', style: 'max-width:300px' });
    stage.append(pane, board, side);
    const view = new Box3D(pane, { modes: [], spring: true });
    ctx.cleanup(() => view.dispose());
    const shape = boxShape(...spec.dims);
    view.setShape(shape, { labels: true });
    const edges = view.edges; // [a,b] 12개
    const isHiddenEdge = ([a, b]) => a === HIDDEN_V || b === HIDDEN_V;
    const ek = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);
    const edgeSet = new Set(edges.map(([a, b]) => ek(a, b)));

    // 사선 투영
    const [w, hh, d] = spec.dims;
    const k = 0.55, ang = (35 * Math.PI) / 180;
    const P = shape.verts.map(([x, y, z]) => { const s = d / 2 - z; return [x + s * k * Math.cos(ang), -y - s * k * Math.sin(ang)]; });
    const xs = P.map((p) => p[0]), ys = P.map((p) => p[1]);
    const pad = Math.max(w, hh, d) * 0.28;
    const vb = [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) - Math.min(...xs) + pad * 2, Math.max(...ys) - Math.min(...ys) + pad * 2];
    const u = Math.max(w, hh, d) / 10; // 선 굵기 단위
    const svg = S('svg', { viewBox: vb.join(' '), preserveAspectRatio: 'xMidYMid meet' });
    board.append(svg);
    const gLines = S('g'), gHits = S('g'), gDots = S('g');
    svg.append(gLines, gHits, gDots);

    const lines = new Map(); // key -> 'solid' | 'dashed'
    if (spec.preset === 'visible' || spec.preset === 'broken') edges.forEach(([a, b]) => { if (!isHiddenEdge([a, b])) lines.set(ek(a, b), 'solid'); });
    if (spec.preset === 'broken') {
      lines.set(ek(4, 5), 'solid');      // 숨은 모서리를 실선으로
      lines.set(ek(2, 6), 'dashed');     // 보이는 모서리를 점선으로
      lines.delete(ek(0, 1));            // 빠진 모서리
      lines.set(ek(4, 7), 'dashed');
    }
    let sel = null;
    const flash = new Set();

    function draw() {
      gLines.innerHTML = ''; gHits.innerHTML = ''; gDots.innerHTML = '';
      for (const [key, st] of lines) {
        const [a, b] = key.split('-').map(Number);
        const l = S('line', { x1: P[a][0], y1: P[a][1], x2: P[b][0], y2: P[b][1], stroke: flash.has(key) ? '#d64545' : '#3b2a1e', 'stroke-width': u * (flash.has(key) ? 0.24 : 0.16), 'stroke-linecap': 'round' });
        if (st === 'dashed') l.setAttribute('stroke-dasharray', `${u * 0.45} ${u * 0.4}`);
        gLines.append(l);
        const hit = S('line', { x1: P[a][0], y1: P[a][1], x2: P[b][0], y2: P[b][1], stroke: 'transparent', 'stroke-width': u * 1.1 });
        hit.style.cursor = 'pointer';
        hit.addEventListener('pointerup', (e) => { e.stopPropagation(); cycle(key); });
        gHits.append(hit);
      }
      for (const key of flash) if (!lines.has(key)) {
        const [a, b] = key.split('-').map(Number);
        gLines.append(S('line', { x1: P[a][0], y1: P[a][1], x2: P[b][0], y2: P[b][1], stroke: '#d6454588', 'stroke-width': u * 0.5, 'stroke-linecap': 'round' }));
      }
      P.forEach(([x, y], i) => {
        const g = S('g');
        g.style.cursor = 'pointer';
        g.append(S('circle', { cx: x, cy: y, r: u * 0.9, fill: 'transparent' }));
        g.append(S('circle', { cx: x, cy: y, r: u * (sel === i ? 0.42 : 0.3), fill: sel === i ? '#2f6fde' : '#fff', stroke: '#3b2a1e', 'stroke-width': u * 0.08 }));
        const t = S('text', { x: x + u * 0.55, y: y - u * 0.45, 'font-size': u * 0.8, fill: '#7a6a58', 'font-family': 'Jua, sans-serif' });
        t.textContent = VL[i];
        g.append(t);
        g.addEventListener('pointerup', (e) => { e.stopPropagation(); tapDot(i); });
        gDots.append(g);
      });
    }

    function tapDot(i) {
      ctx.sfx('click');
      if (sel === null) { sel = i; draw(); return; }
      if (sel === i) { sel = null; draw(); return; }
      const key = ek(sel, i);
      sel = null;
      if (!edgeSet.has(key)) { ctx.say('그 두 점을 잇는 모서리는 없어요. 상자의 모서리만 그려요.'); draw(); return; }
      if (!lines.has(key)) lines.set(key, 'solid');
      draw();
    }

    function cycle(key) {
      ctx.sfx('click');
      const st = lines.get(key);
      if (st === 'solid') lines.set(key, 'dashed');
      else lines.delete(key);
      draw();
    }

    const submit = h('button', { class: 'btn big', onclick: check }, '🖨 송장 출력');
    side.append(
      h('div', { class: 'panel order' }, h('h3', {}, '📋 송장 도면'), h('div', { class: 'big' }, spec.order || '상자 모양이 잘 보이게 그려요'),
        h('p', { class: 'muted', style: 'margin:4px 0 0' }, `상자 ${w}cm × ${d}cm × ${hh}cm`)),
      h('div', { class: 'panel' }, h('h3', {}, '✏️ 선 모양'),
        h('p', { style: 'margin:0' }, '━━ 실선  ·  ┅┅ 점선'),
        h('p', { class: 'muted', style: 'margin:4px 0 0' }, '선을 한 번 누르면 점선, 한 번 더 누르면 지워져요.')),
      submit);

    async function check() {
      ctx.sfx('click');
      const missing = [], hidSolid = [], visDash = [];
      edges.forEach(([a, b]) => {
        const key = ek(a, b), st = lines.get(key);
        if (!st) missing.push(key);
        else if (isHiddenEdge([a, b]) && st === 'solid') hidSolid.push(key);
        else if (!isHiddenEdge([a, b]) && st === 'dashed') visDash.push(key);
      });
      if (!missing.length && !hidSolid.length && !visDash.length) {
        ctx.good('기사님: "상자 모양이 한눈에 보여요! 고마워요."');
        await ctx.finish('보이는 모서리 9개는 실선, 보이지 않는 모서리 3개는 점선으로 겨냥도를 완성했어요.', spec.note);
        view.dispose();
        resolve();
        return;
      }
      [...missing, ...hidSolid, ...visDash].forEach((x) => flash.add(x));
      draw();
      if (hidSolid.length) ctx.mistake('기사님: "뒤쪽 모서리가 앞에 있는 것처럼 보여요." 보이지 않는 모서리는 점선으로 그려요.');
      else if (visDash.length) ctx.mistake('기사님: "앞쪽 모서리가 흐릿해서 헷갈려요." 보이는 모서리는 실선으로 그려요.');
      else ctx.mistake(`기사님: "상자가 덜 그려졌어요." 빠진 모서리가 ${missing.length}개 있어요. 숨은 모서리도 잊지 마요.`);
      setTimeout(() => { flash.clear(); if (ctx.alive()) draw(); }, 1600);
    }

    draw();
  });
}
