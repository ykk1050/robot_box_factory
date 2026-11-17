// 포장 마감대: 필요한 개수를 먼저 정해 가져온 뒤, 상자를 돌려 가며 붙인다.
// 보호대 = 꼭짓점, 테이프 = 모서리, 스티커 = 면
import { Box3D, boxShape } from '../three-view.js';

const TASK = {
  corner: { mode: 'vertex', thing: '모서리 보호대', unit: '개', part: '꼭짓점', total: 8 },
  tape: { mode: 'edge', thing: '테이프 조각', unit: '줄', part: '모서리', total: 12 },
  sticker: { mode: 'face', thing: '취급주의 스티커', unit: '장', part: '면', total: 6 },
};

export default function runFinish(stage, spec, ctx) {
  const { h } = ctx;
  const T = TASK[spec.task];
  return new Promise((resolve) => {
    const pane = h('div', { class: 'pane3d' }, h('div', { class: 'hint' }, `끌어서 돌리고, ${T.part}을(를) 눌러 붙여요`));
    const side = h('div', { class: 'side' });
    stage.append(pane, side);
    const view = new Box3D(pane, { modes: [T.mode] });
    ctx.cleanup(() => view.dispose());
    const shape = boxShape(...spec.dims);
    view.setShape(shape);
    const total = T.total;
    const done = new Set();
    let inv = 0, taken = false, outTold = false;

    let n = spec.start ?? 4;
    const num = h('span', { class: 'num' }, String(n));
    const minus = h('button', { class: 'btn ghost', onclick: () => { n = Math.max(1, n - 1); num.textContent = n; ctx.sfx('click'); } }, '−');
    const plus = h('button', { class: 'btn ghost', onclick: () => { n = Math.min(30, n + 1); num.textContent = n; ctx.sfx('click'); } }, '+');
    const takeBtn = h('button', { class: 'btn', onclick: take }, '창고에서 가져오기');
    const invEl = h('p', { class: 'inv', style: 'margin:6px 0 0' });
    const stepPanel = h('div', { class: 'panel' },
      h('h3', {}, `📦 ${T.thing} 몇 ${T.unit} 가져갈까요?`),
      h('p', { class: 'muted', style: 'margin:0 0 6px' }, `${T.part}마다 하나씩 붙여야 해요. 남거나 모자라지 않게 세어 보세요.`),
      h('div', { class: 'stepper' }, minus, num, plus),
      h('div', { class: 'row center', style: 'margin-top:8px' }, takeBtn),
      invEl);
    const dims = spec.dims;
    side.append(
      h('div', { class: 'panel order' }, h('h3', {}, '📋 작업 지시'), h('div', { class: 'big' }, spec.order || `${T.part}마다 ${T.thing} 붙이기`),
        h('p', { class: 'muted', style: 'margin:4px 0 0' }, `${shape.kind === 'cube' ? '정육면체' : '직육면체'} 상자 ${dims[0]}cm × ${dims[2]}cm × ${dims[1]}cm`)),
      stepPanel);

    function showInv() { invEl.textContent = taken ? `손에 든 ${T.thing}: ${inv}${T.unit} · 붙인 것: ${done.size}${T.unit}` : ''; }

    function take() {
      ctx.sfx('click');
      if (!taken) {
        taken = true; inv = n;
        ctx.say(`${n}${T.unit}를 가져왔어요. 이제 상자를 돌려 가며 ${T.part}마다 붙여요.`);
      } else {
        inv += n;
        ctx.say(`${n}${T.unit} 더 가져왔어요.`);
      }
      stepPanel.querySelector('h3').textContent = `📦 ${T.thing} 더 가져오기`;
      takeBtn.textContent = '더 가져오기';
      showInv();
    }

    view.onTap = (hit) => {
      if (!hit) return;
      if (!taken) { ctx.say(`먼저 ${T.thing}을(를) 몇 ${T.unit} 가져갈지 정해서 가져와요.`); return; }
      const i = hit.index;
      if (done.has(i)) { ctx.say(`거기는 벌써 붙였어요. 상자를 돌려서 빈 ${T.part}을(를) 찾아봐요.`); return; }
      if (inv <= 0) {
        if (!outTold) { outTold = true; ctx.mistake(`${T.thing}이(가) 모자라요! 아직 ${T.part}이(가) 남았어요. 창고에서 더 가져와요.`); }
        else ctx.say('손에 든 것이 없어요. 더 가져와요.');
        return;
      }
      inv--; done.add(i);
      if (spec.task === 'corner') view.addCorner(i);
      else if (spec.task === 'tape') view.addTape(i);
      else view.addSticker(i, '#e0442f', 0.35);
      ctx.sfx(spec.task === 'tape' ? 'tape' : 'click');
      showInv();
      if (done.size === total) finish();
    };

    async function finish() {
      if (inv > 0) {
        ctx.mistake(`${T.thing}이(가) ${inv}${T.unit} 남았어요. ${T.part}은(는) 모두 ${total}개였어요.`);
        await new Promise((r) => setTimeout(r, 1600));
      } else ctx.good(`딱 맞아요! ${T.part}은(는) 모두 ${total}개!`);
      view.resetView();
      const vis = { corner: '보이는 꼭짓점 7개, 숨은 꼭짓점 1개', tape: '보이는 모서리 9개, 숨은 모서리 3개', sticker: '보이는 면 3개, 숨은 면 3개' }[spec.task];
      await ctx.finish(`${T.part}마다 하나씩, 모두 ${total}${T.unit}를 붙였어요. 처음 보이는 방향에서는 ${vis}였어요.`, spec.note);
      view.dispose();
      resolve();
    }
    showInv();
  });
}
