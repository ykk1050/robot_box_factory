// 입고 분류대: 상자를 돌려 보며 면을 검사하고, 주문함에 나눈다.
// 직육면체 = 직사각형 6개, 정육면체 = 정사각형 6개, 정육면체도 직육면체에 들어간다.
import { Box3D, boxShape, defectShape, describeFace } from '../three-view.js';

export default function runSort(stage, spec, ctx) {
  const { h } = ctx;
  return new Promise((resolve) => {
    const pane = h('div', { class: 'pane3d' }, h('div', { class: 'hint' }, '끌어서 돌리고, 면을 눌러 검사해요'));
    const side = h('div', { class: 'side' });
    stage.append(pane, side);
    const view = new Box3D(pane, { modes: ['face'], yaw: -0.6, pitch: 0.45 });
    ctx.cleanup(() => view.dispose());

    const items = spec.items.slice();
    const got = { cuboid: 0, cube: 0 };
    let item = null, inspected = new Set(), toldCube = false, busy = false;

    const queueEl = h('span', { class: 'inv' });
    const logEl = h('ol', { class: 'log' });
    const countEl = h('p', { class: 'muted', style: 'margin:4px 0 0' });
    const bins = {
      cuboid: h('button', { class: 'bin', onclick: () => send('cuboid') }),
      cube: h('button', { class: 'bin', onclick: () => send('cube') }),
      defect: h('button', { class: 'bin bad', onclick: () => send('defect') }, '불량 반품함', h('small', {}, '직육면체가 아닌 것')),
      spare: h('button', { class: 'bin spare', onclick: () => send('spare') }, '예비 창고', h('small', {}, '주문이 다 찼을 때')),
    };
    side.append(
      h('div', { class: 'panel order' }, h('h3', {}, '📋 오늘 주문'), h('div', { class: 'big' }, `직육면체 ${spec.orders.cuboid}개 · 정육면체 ${spec.orders.cube}개`), h('p', { class: 'muted', style: 'margin:4px 0 0' }, '남은 상자 ', queueEl)),
      h('div', { class: 'panel' }, h('h3', {}, '🔍 면 검사기'), logEl, countEl),
      h('div', { class: 'bins' }, bins.cuboid, bins.cube, bins.defect, bins.spare),
    );

    function drawBins() {
      for (const k of ['cuboid', 'cube']) {
        const need = spec.orders[k];
        bins[k].innerHTML = '';
        bins[k].append(`${k === 'cuboid' ? '직육면체' : '정육면체'} 주문함`, h('small', {}, `${got[k]} / ${need}${got[k] >= need ? ' 완료' : ''}`));
        bins[k].classList.toggle('full', got[k] >= need);
      }
      queueEl.textContent = `${items.length + (item ? 1 : 0)}개`;
    }

    function next() {
      inspected = new Set();
      logEl.innerHTML = '';
      countEl.textContent = '';
      item = items.shift() || null;
      drawBins();
      if (!item) return end();
      const shape = item.t === 'box' ? boxShape(...item.d) : defectShape(item.t, ...item.d);
      item.shape = shape;
      view.setShape(shape);
      view.resetView();
      view.root.position.set(0, 0, 0);
      busy = true;
      view.animate(450, (t) => { view.root.position.x = (1 - t) * -view.radius * 2.2; }).then(() => { busy = false; });
      ctx.sfx('thud');
    }

    view.onTap = (hit) => {
      if (!hit || !item || busy) return;
      const fi = hit.index;
      if (inspected.has(fi)) { ctx.say('이미 검사한 면이에요. 상자를 돌려서 다른 면도 살펴봐요.'); return; }
      inspected.add(fi);
      ctx.sfx('click');
      const d = describeFace(item.shape, fi);
      view.setFaceColor(fi, d.ok ? (d.square ? 0xf2d49b : 0xe9c08e) : 0xe58a7a);
      logEl.append(h('li', {}, d.text));
      logEl.scrollTop = logEl.scrollHeight;
      const total = item.shape.faces.length;
      countEl.textContent = inspected.size >= total ? `이 상자의 면을 모두 검사했어요. 면은 모두 ${total}개!` : `검사한 면 ${inspected.size}개`;
    };

    function reason() {
      const s = item.shape;
      if (item.t === 'tri') return '이 상자는 면이 5개뿐이고 삼각형 면이 있어요.';
      const bad = s.faces.map((_, i) => describeFace(s, i)).find((d) => !d.ok);
      return `이 상자에는 ${bad ? bad.name : '직사각형이 아닌'} 면이 있어요.`;
    }

    async function leave(dir) {
      busy = true;
      ctx.sfx('thud');
      await view.animate(420, (t) => { view.root.position.x = t * view.radius * 2.2 * dir; view.root.position.y = -t * t * view.radius * 0.3; });
      next();
    }

    function send(bin) {
      if (!item || busy) return;
      ctx.sfx('click');
      const isCuboid = item.t === 'box';
      const isCube = isCuboid && item.d[0] === item.d[1] && item.d[1] === item.d[2];
      if (bin === 'cuboid' || bin === 'cube') {
        if (got[bin] >= spec.orders[bin]) { ctx.say('그 주문함은 벌써 다 찼어요. 다른 곳을 골라요.'); return; }
        if (bin === 'cuboid' && !isCuboid) return ctx.mistake(`반품! ${reason()} 직육면체는 직사각형 6개로 둘러싸인 도형이에요.`);
        if (bin === 'cube' && !isCuboid) return ctx.mistake(`반품! ${reason()} 정육면체는 정사각형 6개로 둘러싸인 도형이에요.`);
        if (bin === 'cube' && !isCube) {
          const sq = item.shape.faces.map((_, i) => describeFace(item.shape, i)).find((d) => !d.square);
          return ctx.mistake(`반품! 정사각형이 아닌 면(${sq.text.replace('직사각형 ', '')})이 있어요. 정육면체는 6개 면이 모두 정사각형이에요.`);
        }
        got[bin]++;
        if (bin === 'cuboid' && isCube && !toldCube) {
          toldCube = true;
          ctx.good('접수! 정사각형도 직사각형이니까, 정육면체는 직육면체 주문에도 보낼 수 있어요.');
        } else ctx.good(isCube ? '정사각형 6개로 둘러싸인 정육면체, 접수!' : '직사각형 6개로 둘러싸인 직육면체, 접수!');
        return leave(1);
      }
      if (bin === 'defect') {
        if (isCuboid) return ctx.mistake(`이 상자는 멀쩡해요! 면이 모두 ${isCube ? '정사각형' : '직사각형'}이에요. 주문함이나 예비 창고로 보내요.`);
        ctx.good(`반품 접수! ${reason()}`);
        return leave(-1);
      }
      if (!isCuboid) return ctx.mistake(`불량 상자는 창고에 두면 안 돼요. ${reason()}`);
      ctx.say('예비 창고에 넣었어요.');
      return leave(1);
    }

    async function end() {
      let short = 0;
      if (got.cube < spec.orders.cube) short += spec.orders.cube - got.cube;
      if (got.cuboid < spec.orders.cuboid) short += spec.orders.cuboid - got.cuboid;
      if (short) {
        ctx.mistake(`주문을 ${short}개 못 채웠어요. 정육면체는 정육면체 주문에 먼저 보내야 아껴 쓸 수 있어요.`);
        await new Promise((r) => setTimeout(r, 1800));
      }
      await ctx.finish(spec.done || '오늘 들어온 상자를 모두 나눴어요.', spec.note);
      view.dispose();
      resolve();
    }

    next();
  });
}
