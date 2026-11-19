// playtest 전용 봇: sh /d/자동화/playtest/run.sh /d/자동화/cuboid-factory --path '?test=1' --bot tools/bot.js
// (?test=1일 때만 게임 속 window.__game이 열리고, 랭킹에는 올리지 않는다)
// 일반 상자, 깨지기 쉬운 물건(보호대), 차갑고 세워야 하는 물건(보냉 은박·화살표)을 하나씩 출고해 본다.
async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn, ms = 30000) => { const t0 = Date.now(); while (!fn()) { if (Date.now() - t0 > ms) return false; await wait(200); } return true; };
  const { ITEMS, payFor } = await import('/js/data.js?v=' + window.BUILD);
  // 가로 a, 높이 b, 세로 c인 직육면체 전개도(가로로 펼친 모양)
  const netFor = ([a, b, c]) => [
    { x: 0, y: b, w: b, h: c }, { x: b, y: b, w: a, h: c }, { x: b + a, y: b, w: b, h: c }, { x: 2 * b + a, y: b, w: a, h: c },
    { x: b, y: 0, w: a, h: b }, { x: b, y: b + c, w: a, h: b },
  ];
  const result = { 출고: [], 방식: [], 막힘: null };
  window.__factory.showTitle();
  await wait(300);
  window.__factory.playDay(5);
  if (!(await until(() => window.__game && window.__game.F.player && window.__game.orders.length > 0, 40000))) { result.막힘 = '근무가 시작되지 않음'; return result; }
  const G = window.__game;
  for (const key of ['shoe', 'mug', 'milk']) {
    // 다음 주문은 최대 50초 뒤에 온다
    if (!(await until(() => G.orders.length > 0 && G.place === 'walk' && !G.active, 70000))) { result.막힘 = `${key}: 주문이 오지 않음`; return result; }
    const o = G.orders[0];
    o.item = ITEMS[key]; o.pay = payFor(o.item); o.seal = key === 'mug' ? 'tape' : 'glue'; if (o.el) o.el.remove(); o.el = null;
    G.pick(o);
    if (!(await until(() => G.place === 'cut', 15000))) { result.막힘 = `${key}: 재단기가 열리지 않음`; return result; }
    G.cutter.set(netFor(o.item.d));
    G.doCut();
    if (o.seal === 'glue') {
      // 🧴 본드 상자: 짝 2쌍만 칠하면 접기가 막히고, 7쌍을 모두 칠해야 접힌다
      if (!(await until(() => G.place === 'glue', 15000))) { result.막힘 = `${key}: 본드 칠하기 단계가 나오지 않음`; return result; }
      const hits = [...document.querySelectorAll('.sheet-host svg line')].filter((l) => l.getAttribute('stroke') === 'transparent');
      const tap = (i) => hits[i] && hits[i].dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
      const { analyzeNet, netBoundary } = await import('/js/net.js?v=' + window.BUILD);
      const nb = netBoundary(G.cutter.rects, analyzeNet(G.cutter.rects));
      const pairs = nb.segs.filter((sg) => sg.partner > sg.id);
      const foldBtn = () => [...document.querySelectorAll('.cutter .ctools button')].pop();
      pairs.slice(0, 2).forEach((sg) => { tap(sg.id); tap(sg.partner); });
      foldBtn().click();
      await wait(300);
      if (G.place !== 'glue') { result.막힘 = `${key}: 본드 짝을 다 찾지 않았는데 접힘`; return result; }
      pairs.slice(2).forEach((sg) => { tap(sg.id); tap(sg.partner); });
      if (!foldBtn().textContent.includes('접기')) { result.막힘 = `${key}: 7쌍을 칠했는데 접기 버튼이 안 켜짐 (${foldBtn().textContent})`; return result; }
      foldBtn().click();
      if (!(await until(() => G.place === 'work', 20000))) { result.막힘 = `${key}: 포장 단계로 가지 못함`; return result; }
      if (G.active.taped.size !== 12) { result.막힘 = `${key}: 본드 상자의 모서리가 다 붙지 않음 (${G.active.taped.size})`; return result; }
    } else {
      // 🩹 테이프 상자: 본드 단계 없이 바로 접는다
      if (!(await until(() => G.place === 'work' || G.place === 'glue', 20000)) || G.place === 'glue') { result.막힘 = `${key}: 테이프 상자인데 포장 단계로 가지 못함 (${G.place})`; return result; }
      if (G.active.taped.size !== 0) { result.막힘 = `${key}: 테이프 상자인데 미리 붙은 모서리가 있음`; return result; }
    }
    // 재료를 넉넉히 손에 쥐여 주고 모두 붙인다
    G.F.edges.forEach((e) => { G.inv.tape[e.len] = (G.inv.tape[e.len] || 0) + 1; });
    Object.assign(G.inv, { guard: 8, base: 2, side: 4, foil: 6, up: 4 });
    const use = (tool, list) => { document.querySelector(`[data-tool="${tool}"]`).click(); list.forEach((x) => G.useTool(x)); };
    use('tape', G.F.edges.map((e) => ({ type: 'edge', edge: e })));
    if (o.item.fragile) use('guard', G.F.corners);
    if (o.item.cold) use('foil', G.F.faces);
    use('base', G.F.faces.filter((f) => f.role !== 'side'));
    use('side', G.F.faces.filter((f) => f.role === 'side'));
    if (o.item.up) use('up', G.F.faces.filter((f) => f.role === 'side'));
    G.tryShip();
    if (!(await until(() => G.place === 'walk' && !G.active, 20000))) { result.막힘 = `${key}: 출고되지 않음 (${document.querySelector('.bubble')?.textContent})`; return result; }
    result.출고.push(key); result.방식.push(o.seal);
  }
  return result;
}
