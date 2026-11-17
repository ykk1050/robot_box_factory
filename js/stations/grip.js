// 로봇 집게 라인: 평행한 면(밑면)과 수직인 면(옆면)을 로봇 작업으로 익힌다.
// 과제: pair(평행한 면 집기) · allpairs(평행한 면 3쌍) · perp(옆면 스캔) · perp2(두 면에 동시에 수직)
import { Box3D, boxShape, faceName } from '../three-view.js';

const PAIR_COLORS = [0xf4b942, 0x6fc3df, 0xa4d36b];

export default function runGrip(stage, spec, ctx) {
  const { h } = ctx;
  return new Promise((resolve) => {
    const pane = h('div', { class: 'pane3d' }, h('div', { class: 'hint' }, '끌어서 돌리고, 면을 눌러요'));
    const side = h('div', { class: 'side' });
    stage.append(pane, side);
    const view = new Box3D(pane, { modes: ['face'] });
    ctx.cleanup(() => view.dispose());
    const shape = boxShape(...spec.dims);
    view.setShape(shape, { labels: true });
    const N = (i) => faceName(shape, i);

    const orderEl = h('div', { class: 'big' });
    const subEl = h('p', { class: 'muted', style: 'margin:4px 0 0' });
    const logEl = h('ul', { class: 'log' });
    const doneBtn = h('button', { class: 'btn warn', style: 'display:none' });
    side.append(
      h('div', { class: 'panel order' }, h('h3', {}, '📋 작업 지시서'), orderEl, subEl),
      h('div', { class: 'panel' }, h('h3', {}, '📝 작업 기록'), logEl),
      doneBtn);
    const log = (t) => { logEl.append(h('li', {}, t)); logEl.scrollTop = logEl.scrollHeight; };

    let ti = 0, busy = false, onFace = null, onDone = null;

    async function lift(ok) {
      busy = true;
      ctx.sfx('robot');
      if (ok) {
        await view.animate(500, (t) => { view.root.position.y = Math.sin(t * Math.PI) * view.size * 0.35; });
      } else {
        await view.animate(650, (t) => { view.root.position.y = -t * t * view.size * 0.5; view.root.rotation.z = t * 0.5; });
        view.root.position.y = 0; view.root.rotation.z = 0;
      }
      busy = false;
    }

    function nextTask() {
      view.clearMarkers(); view.resetFaceColors(); view.resetView();
      logEl.innerHTML = '';
      doneBtn.style.display = 'none';
      onDone = null;
      const task = spec.tasks[ti];
      if (!task) return end();
      ({ pair: taskPair, allpairs: taskAll, perp: taskPerp, perp2: taskPerp2 })[task.k](task);
    }

    async function taskDone(text) {
      await new Promise((r) => setTimeout(r, 900));
      if (!ctx.alive()) return;
      ti++;
      if (spec.tasks[ti]) { ctx.say(text + ' 다음 작업!', 'happy'); nextTask(); } else end(text);
    }

    // 집게 하나가 붙은 면과 평행한 면 찾기
    function taskPair(t) {
      orderEl.textContent = `${N(t.first)}을(를) 들어 올려요`;
      subEl.textContent = '집게 하나는 이미 대었어요. 다른 집게를 댈 면을 눌러요.';
      view.addPad(t.first);
      view.setFaceColor(t.first, PAIR_COLORS[0]);
      onFace = async (f) => {
        if (f === t.first) { ctx.say('거기는 이미 집게가 있어요.'); return; }
        const rel = view.faceRelation(t.first, f);
        const pad = view.addPad(f);
        if (rel === 'parallel') {
          view.setFaceColor(f, PAIR_COLORS[0]);
          log(`${N(t.first)} ↔ ${N(f)} : 들어 올림`);
          ctx.good(`번쩍! ${N(t.first)}과(와) ${N(f)}은(는) 마주 보는 면이에요. 계속 늘여도 만나지 않으니 서로 평행해요.`);
          await lift(true);
          onFace = null;
          taskDone('평행한 두 면을 잡으면 안 미끄러져요.');
        } else {
          log(`${N(t.first)} ↔ ${N(f)} : 미끄러짐`);
          ctx.mistake(`미끄러졌어요! ${N(t.first)}과(와) ${N(f)}은(는) 모서리에서 만나요(수직). 집게는 마주 보는 면을 잡아야 해요.`);
          await lift(false);
          view.markers.remove(pad);
        }
      };
    }

    // 평행한 면 쌍 모두 찾기
    function taskAll() {
      orderEl.textContent = '세 방향으로 모두 집어 봐요';
      subEl.textContent = '서로 평행한 두 면을 차례로 누르세요. 다 찾았으면 버튼을 눌러요.';
      const found = [];
      let first = null;
      doneBtn.textContent = '평행한 면을 다 찾았어요';
      doneBtn.style.display = '';
      onDone = async () => {
        if (found.length < 3) { ctx.mistake(`아직 잡아 보지 않은 방향이 있어요. 지금 ${found.length}쌍 찾았어요.`); return; }
        doneBtn.style.display = 'none';
        onFace = null;
        taskDone('직육면체에서 서로 평행한 면은 3쌍이에요. 평행한 면은 각각 밑면이 될 수 있어요.');
      };
      onFace = async (f) => {
        if (found.some((p) => p.includes(f))) { ctx.say('그 면은 이미 짝을 찾았어요.'); return; }
        if (first === null) { first = f; view.setFaceColor(f, 0xfff0a0); ctx.sfx('click'); return; }
        if (first === f) { view.setFaceColor(f); first = null; return; }
        const a = first; first = null;
        if (view.faceRelation(a, f) === 'parallel') {
          const c = PAIR_COLORS[found.length];
          found.push([a, f]);
          view.setFaceColor(a, c); view.setFaceColor(f, c);
          view.addPad(a); view.addPad(f);
          log(`${N(a)} ∥ ${N(f)}`);
          ctx.good(`${found.length}번째 평행한 면 쌍을 찾았어요!`);
          await lift(true);
        } else {
          view.setFaceColor(a);
          ctx.mistake(`${N(a)}과(와) ${N(f)}은(는) 서로 만나요(수직). 평행한 면은 마주 보는 면이에요.`);
        }
      };
    }

    // 밑면에 수직인 옆면 모두 스캔
    function taskPerp(t) {
      orderEl.textContent = `${N(t.base)}이(가) 밑면이에요`;
      subEl.textContent = '컨베이어에 닿은 면이 밑면이에요. 바코드는 옆면에 있어요. 옆면을 모두 스캔하고 버튼을 눌러요.';
      view.setFaceColor(t.base, 0x8a8f96);
      view.addSticker(t.base, '#5b6169', 0.7);
      const scanned = new Set();
      doneBtn.textContent = '스캔 끝!';
      doneBtn.style.display = '';
      onDone = () => {
        const need = shape.faces.map((_, i) => i).filter((i) => view.faceRelation(t.base, i) === 'perp');
        if (scanned.size < need.length) { ctx.mistake(`아직 스캔하지 않은 옆면이 있어요. 상자를 돌려 봐요. 지금 ${scanned.size}개.`); return; }
        doneBtn.style.display = 'none';
        onFace = null;
        taskDone(`한 밑면에 대한 옆면은 모두 4개예요. 밑면과 옆면은 수직으로 만나요.`);
      };
      onFace = (f) => {
        const rel = view.faceRelation(t.base, f);
        if (f === t.base) { ctx.mistake('그 면은 컨베이어에 닿은 밑면이에요.'); return; }
        if (rel === 'parallel') { ctx.mistake(`${N(f)}은(는) 밑면과 평행한 다른 밑면이에요. 옆면은 밑면과 수직으로 만나는 면이에요.`); return; }
        if (scanned.has(f)) { ctx.say('벌써 스캔했어요.'); return; }
        scanned.add(f);
        view.addSticker(f, 'barcode', 0.4);
        view.setFaceColor(f, 0xbfe3c8);
        ctx.sfx('ok');
        log(`${N(f)} 스캔 완료`);
        ctx.say(`삑! ${N(f)} 스캔.`, 'happy');
      };
    }

    // 두 면에 동시에 수직인 면
    function taskPerp2(t) {
      orderEl.textContent = '두 면 모두와 수직인 면 찾기';
      subEl.textContent = `빨간 ${N(t.a)}과(와) 파란 ${N(t.b)}에 동시에 수직인 면에 초록 스티커를 모두 붙이고 버튼을 눌러요.`;
      view.setFaceColor(t.a, 0xe58a7a); view.setFaceColor(t.b, 0x8fb4f0);
      const need = shape.faces.map((_, i) => i).filter((i) => view.faceRelation(t.a, i) === 'perp' && view.faceRelation(t.b, i) === 'perp');
      const got = new Set();
      doneBtn.textContent = '다 붙였어요';
      doneBtn.style.display = '';
      onDone = () => {
        if (got.size < need.length) { ctx.mistake(`더 있어요! 상자를 돌려 봐요. 지금 ${got.size}개.`); return; }
        doneBtn.style.display = 'none';
        onFace = null;
        taskDone(`${need.map(N).join('과(와) ')}이(가) 두 면 모두와 수직이에요.`);
      };
      onFace = (f) => {
        if (f === t.a || f === t.b) { ctx.say('그 면은 색칠된 기준 면이에요.'); return; }
        if (got.has(f)) { ctx.say('벌써 붙였어요.'); return; }
        const ra = view.faceRelation(t.a, f), rb = view.faceRelation(t.b, f);
        if (ra !== 'perp') { ctx.mistake(`${N(f)}은(는) 빨간 면과 평행해요. 파란 면과만 수직이에요.`); return; }
        if (rb !== 'perp') { ctx.mistake(`${N(f)}은(는) 파란 면과 평행해요. 빨간 면과만 수직이에요.`); return; }
        got.add(f);
        view.addSticker(f, '#2a9d55', 0.4);
        ctx.good(`맞아요. ${N(f)}은(는) 두 면과 모두 수직으로 만나요.`);
        log(`${N(f)} 스티커`);
      };
    }

    doneBtn.addEventListener('click', () => { ctx.sfx('click'); if (onDone) onDone(); });
    view.onTap = (hit) => { if (!hit || busy || !onFace) return; onFace(hit.index); };

    async function end(text) {
      await ctx.finish(text || '로봇 작업을 모두 마쳤어요.', spec.note);
      view.dispose();
      resolve();
    }

    ctx.say(spec.say || '작업 지시서를 읽고 면 이름을 확인해요.');
    nextTask();
  });
}
