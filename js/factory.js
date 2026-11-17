// 3D 공장: 일꾼이 걸어 다니는 작업장, 작업대·기계·컨베이어·트럭.
// 상자 접기(뚜껑 열고 물건 넣기), 테이프·보호대·스티커 붙이기, 굴리기, 출고 장면을 맡는다.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { getRenderer, textSprite } from './three-view.js';
import { makeFoldRig, boxEdges } from './net.js';

const U = 0.1;          // 1cm 칸 = 0.1m (상자가 진짜 택배 크기로 보이게)
const TABLE_Y = 0.82;
const BELT_END = 4.0;
// 걸어 다닐 수 있는 곳
const WALK = { x0: -3.9, x1: 3.6, z0: 1.05, z1: 3.7 };

// 기계 위치와 서는 자리
export const STATIONS = {
  bench: { name: '작업대', icon: '🧰', stand: [0, 1.25], face: Math.PI },
  tape: { name: '테이프 출력기', icon: '🩹', pos: [-2.3, 0.45], stand: [-2.3, 1.3], face: Math.PI },
  sticker: { name: '스티커 제작기', icon: '🏷', pos: [-4.6, 2.4], rot: Math.PI / 2, stand: [-3.8, 2.4], face: -Math.PI / 2 },
  guard: { name: '보호대 선반', icon: '🛡', pos: [-3.7, 0.45], stand: [-3.6, 1.3], face: Math.PI },
};

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const STICKER = {
  label: (who) => canvasTex(256, 192, (g) => {
    g.fillStyle = '#fff'; g.fillRect(0, 0, 256, 192);
    g.strokeStyle = '#333'; g.lineWidth = 6; g.strokeRect(3, 3, 250, 186);
    g.fillStyle = '#222'; g.font = 'bold 30px Jua, sans-serif'; g.fillText('택배 송장', 16, 42);
    g.font = '24px Jua, sans-serif'; g.fillText('받는 곳: ' + who, 16, 82);
    let x = 18; while (x < 238) { const w = 2 + ((x * 7) % 5); g.fillRect(x, 108, w, 64); x += w + 3 + ((x * 3) % 4); }
  }),
  care: () => canvasTex(128, 128, (g) => {
    g.fillStyle = '#fff6e0'; g.fillRect(0, 0, 128, 128);
    g.strokeStyle = '#d63b2f'; g.lineWidth = 8; g.strokeRect(6, 6, 116, 116);
    g.fillStyle = '#d63b2f'; g.font = 'bold 30px Jua, sans-serif'; g.textAlign = 'center';
    g.fillText('취급', 64, 56); g.fillText('주의', 64, 96);
  }),
  stamp: () => canvasTex(128, 128, (g) => {
    g.clearRect(0, 0, 128, 128);
    g.strokeStyle = '#2f5fbf'; g.lineWidth = 8; g.beginPath(); g.arc(64, 64, 52, 0, 7); g.stroke();
    g.fillStyle = '#2f5fbf'; g.font = 'bold 38px Jua, sans-serif'; g.textAlign = 'center'; g.fillText('밑면', 64, 78);
  }),
};

export class Factory {
  constructor(container, { character = 'm', walkSpeed = 2.2 } = {}) {
    this.container = container;
    this.renderer = getRenderer();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    container.appendChild(this.renderer.domElement);
    const scene = this.scene = new THREE.Scene();
    scene.background = new THREE.Color(0xcfe3ef);
    scene.fog = new THREE.Fog(0xcfe3ef, 16, 34);
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.05, 80);
    scene.add(new THREE.HemisphereLight(0xffffff, 0xb8a58a, 2.0));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(-3, 8, 5);
    scene.add(sun);
    this.anims = [];
    this.pickables = [];
    this.stationMeshes = [];
    this.onTap = null;
    this.allowRotate = false;
    this.mode = 'walk';
    this.walkSpeed = walkSpeed;
    this.cam = { target: new THREE.Vector3(-1, 0.9, 2), yaw: -0.15, pitch: 0.8, dist: 7.5 };
    this.goal = { target: this.cam.target.clone(), yaw: this.cam.yaw, pitch: this.cam.pitch, dist: this.cam.dist };
    this._buildRoom();
    this._buildStations();
    this._loadModels(character);
    this._bindPointer();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.resize();
    this.alive = true;
    this.last = performance.now();
    const loop = (now) => {
      if (!this.alive) return;
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this._step(now, dt);
    };
    this.raf = requestAnimationFrame(loop);
  }

  // ---------- 방 ----------
  _buildRoom() {
    const s = this.scene;
    const floorTex = canvasTex(256, 256, (g) => {
      g.fillStyle = '#a7adb3'; g.fillRect(0, 0, 256, 256);
      g.strokeStyle = '#959ba1'; g.lineWidth = 3; g.strokeRect(0, 0, 256, 256);
    });
    floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
    floorTex.repeat.set(12, 8);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(36, 24), new THREE.MeshLambertMaterial({ map: floorTex }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(3, 0, 0);
    floor.userData = { type: 'floor' };
    s.add(floor);
    this.floor = floor;
    // 걷는 길 노란 선
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xf2c94c });
    [[WALK.x0 - 0.1, WALK.z0 - 0.1, WALK.x1 + 0.1, WALK.z0 - 0.1], [WALK.x0 - 0.1, WALK.z1 + 0.1, WALK.x1 + 0.1, WALK.z1 + 0.1]].forEach(([x0, z0, x1]) => {
      const l = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, 0.08), lineMat);
      l.rotation.x = -Math.PI / 2; l.position.set((x0 + x1) / 2, 0.005, z0);
      s.add(l);
    });
    const wallMat = new THREE.MeshLambertMaterial({ color: 0xe9dcc6 });
    const back = new THREE.Mesh(new THREE.PlaneGeometry(36, 7), wallMat);
    back.position.set(3, 3.5, -4);
    s.add(back);
    const left = new THREE.Mesh(new THREE.PlaneGeometry(24, 7), wallMat);
    left.rotation.y = Math.PI / 2; left.position.set(-5.2, 3.5, 0);
    s.add(left);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 0.9), new THREE.MeshBasicMaterial({ map: canvasTex(512, 110, (g) => {
      g.fillStyle = '#23706c'; g.fillRect(0, 0, 512, 110);
      g.fillStyle = '#fff'; g.font = 'bold 64px Jua, sans-serif'; g.textAlign = 'center'; g.fillText('📦 로봇 상자 공장', 256, 78);
    }) }));
    sign.position.set(0.5, 3.6, -3.98);
    s.add(sign);
    // 작업대
    const wood = new THREE.MeshLambertMaterial({ color: 0xb98552 });
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.08, 1.2), wood);
    top.position.set(0, TABLE_Y - 0.04, 0);
    top.userData = { type: 'station', id: 'bench' };
    s.add(top);
    this.stationMeshes.push(top);
    const legMat = new THREE.MeshLambertMaterial({ color: 0x5c6670 });
    this.legMat = legMat;
    for (const [x, z] of [[-0.8, -0.5], [0.8, -0.5], [-0.8, 0.5], [0.8, 0.5]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, TABLE_Y - 0.08, 0.07), legMat);
      leg.position.set(x, (TABLE_Y - 0.08) / 2, z);
      s.add(leg);
    }
    // 컨베이어
    this.beltTex = canvasTex(64, 64, (g) => { g.fillStyle = '#3d4248'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#4c535a'; g.fillRect(0, 0, 10, 64); });
    this.beltTex.wrapS = this.beltTex.wrapT = THREE.RepeatWrapping;
    this.beltTex.repeat.set(16, 1);
    const belt = new THREE.Mesh(new THREE.BoxGeometry(BELT_END - 0.9, 0.06, 0.7), new THREE.MeshLambertMaterial({ map: this.beltTex }));
    belt.position.set((0.9 + BELT_END) / 2, TABLE_Y - 0.03, 0);
    s.add(belt);
    const rail = new THREE.MeshLambertMaterial({ color: 0xf2c94c });
    for (const z of [-0.38, 0.38]) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(BELT_END - 0.9, 0.1, 0.05), rail);
      r.position.set((0.9 + BELT_END) / 2, TABLE_Y, z);
      s.add(r);
    }
    for (let x = 1.2; x < BELT_END; x += 1.1) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, TABLE_Y - 0.06, 0.6), legMat);
      leg.position.set(x, (TABLE_Y - 0.06) / 2, 0);
      s.add(leg);
    }
    const boxMat = new THREE.MeshLambertMaterial({ color: 0xc99560 });
    [[-4.4, -3.2, 0.6, 0.5, 0.5], [-3.8, -3.3, 0.5, 0.4, 0.6], [-4.1, -3.25, 0.45, 0.45, 0.45, 0.5]].forEach(([x, z, w, h, d, y = 0]) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), boxMat);
      b.position.set(x, y + h / 2, z);
      s.add(b);
    });
    this.truckLoad = 0;
  }

  // ---------- 기계 3대 ----------
  _buildStations() {
    const add = (id, build) => {
      const st = STATIONS[id];
      const g = new THREE.Group();
      build(g);
      g.position.set(st.pos[0], 0, st.pos[1]);
      if (st.rot) g.rotation.y = st.rot;
      g.traverse((o) => { if (o.isMesh) { o.userData = { type: 'station', id }; this.stationMeshes.push(o); } });
      const label = textSprite(st.name, { size: 0.3, w: 512, bg: '#fffaf1', ring: '#23706c', fg: '#23706c' });
      label.position.set(st.pos[0], 1.95, st.pos[1]);
      this.scene.add(g, label);
    };
    const M = (c) => new THREE.MeshLambertMaterial({ color: c });
    add('tape', (g) => {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.1, 0.6), M(0xe07a2f)); body.position.y = 0.55; g.add(body);
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.3), new THREE.MeshBasicMaterial({ map: canvasTex(128, 76, (c) => { c.fillStyle = '#1f3b3a'; c.fillRect(0, 0, 128, 76); c.fillStyle = '#7ff0c8'; c.font = 'bold 26px Jua, sans-serif'; c.fillText('길이 cm', 12, 32); c.fillText('개수 ×', 12, 64); }) }));
      screen.position.set(0, 0.8, 0.301); g.add(screen);
      const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.16, 20), M(0xc49a5c)); roll.rotation.x = Math.PI / 2; roll.position.set(0, 1.28, 0); g.add(roll);
      const slot = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.1), M(0x333333)); slot.position.set(0, 0.35, 0.3); g.add(slot);
    });
    add('sticker', (g) => {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.95, 0.6), M(0x2f6fde)); body.position.y = 0.475; g.add(body);
      const top = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.12, 0.5), M(0xdfe7f5)); top.position.y = 1.0; g.add(top);
      const paper = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.02, 0.3), M(0xffffff)); paper.position.set(0, 0.7, 0.32); paper.rotation.x = -0.4; g.add(paper);
    });
    add('guard', (g) => {
      const shelfMat = M(0x8a6a4a);
      for (const y of [0.05, 0.6, 1.15]) { const p = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.05, 0.45), shelfMat); p.position.y = y; g.add(p); }
      for (const x of [-0.48, 0.48]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.2, 0.45), shelfMat); p.position.set(x, 0.6, 0); g.add(p); }
      for (let i = 0; i < 8; i++) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), M(0x2f6fde)); c.position.set(-0.35 + (i % 4) * 0.23, i < 4 ? 0.13 : 0.68, 0.05); g.add(c); }
    });
  }

  async _loadModels(character) {
    const loader = new GLTFLoader();
    const put = async (file, x, y, z, ry = 0) => {
      try {
        const g = await loader.loadAsync(`models/${file}.glb`);
        if (!this.alive) return null;
        g.scene.position.set(x, y, z);
        g.scene.rotation.y = ry;
        this.scene.add(g.scene);
        return g;
      } catch (e) { console.warn('모델을 불러오지 못함', file, e); return null; }
    };
    const who = character === 'f' ? 'railway-carter-971897' : 'construction-worker-c1ad8c';
    const st = STATIONS.bench.stand;
    const pg = await put(who, st[0], 0, st[1], Math.PI);
    if (pg) this._setupPlayer(pg);
    const tg = await put('delivery-truck-a9537e', BELT_END + 3.2, 0, 0.2, Math.PI / 2);
    if (tg) { this.truck = tg.scene; this.truckHome = this.truck.position.clone(); this._makeDoor(); }
    put('rooted-gantry-arm-f35c8f', -1.6, 0, -2.4, 0.5);
    put('timber-eur-pallet-a1f655', 2.0, 0, -2.6);
    put('material-pallet-6af263', 3.5, 0, -2.7, 0.3);
  }

  // ---------- 일꾼 ----------
  _setupPlayer(g) {
    this.player = g.scene;
    this.mixer = new THREE.AnimationMixer(this.player);
    this.actions = {};
    for (const clip of g.animations) {
      // 걷기 동작이 제자리에서 움직이게(앞으로 미끄러지지 않게) 엉덩이 앞뒤 이동을 없앤다
      clip.tracks.forEach((t) => {
        if (/Hips\.position$/.test(t.name)) {
          const v = t.values, x0 = v[0], z0 = v[2];
          for (let i = 0; i < v.length; i += 3) { v[i] = x0; v[i + 2] = z0; }
        }
      });
      this.actions[clip.name] = this.mixer.clipAction(clip);
    }
    this.moving = false;
    this._play('Idle');
  }

  _play(name) {
    if (!this.actions || !this.actions[name] || this.curAction === name) return;
    const next = this.actions[name];
    next.reset().play();
    if (this.curAction) this.actions[this.curAction].crossFadeTo(next, 0.2, false);
    this.curAction = name;
  }

  playerPos() { return this.player ? this.player.position : new THREE.Vector3(STATIONS.bench.stand[0], 0, STATIONS.bench.stand[1]); }

  // 목표 지점까지 걸어간다. 다른 곳을 누르면 이전 걷기는 취소된다.
  walkTo(x, z, face = null) {
    x = Math.max(WALK.x0, Math.min(WALK.x1, x));
    z = Math.max(WALK.z0, Math.min(WALK.z1, z));
    if (this.walkDone) this.walkDone(false);
    return new Promise((res) => {
      this.walkGoal = { x, z, face };
      this.walkDone = (ok) => { this.walkDone = null; res(ok); };
    });
  }

  goStation(id) {
    const st = STATIONS[id];
    return this.walkTo(st.stand[0], st.stand[1], st.face);
  }

  // ---------- 카메라·입력 ----------
  _bindPointer() {
    const el = this.renderer.domElement;
    this.ac = new AbortController();
    const sig = { signal: this.ac.signal };
    let down = null;
    el.addEventListener('pointerdown', (e) => {
      down = { x: e.clientX, y: e.clientY, yaw: this.goal.yaw, pitch: this.goal.pitch, drag: false, id: e.pointerId };
      try { el.setPointerCapture(e.pointerId); } catch (_) { /* 무시 */ }
    }, sig);
    el.addEventListener('pointermove', (e) => {
      if (!down || e.pointerId !== down.id) return;
      const dx = e.clientX - down.x, dy = e.clientY - down.y;
      if (!down.drag && Math.hypot(dx, dy) > 10) down.drag = true;
      if (down.drag && this.allowRotate) {
        this.goal.yaw = this.cam.yaw = down.yaw - dx * 0.01;
        this.goal.pitch = this.cam.pitch = Math.max(-0.2, Math.min(1.35, down.pitch + dy * 0.01));
      }
    }, sig);
    el.addEventListener('pointerup', (e) => {
      if (!down || e.pointerId !== down.id) return;
      const tap = !down.drag;
      down = null;
      if (tap && this.onTap) this.onTap(this.pick(e.clientX, e.clientY));
    }, sig);
    el.addEventListener('pointercancel', () => { down = null; }, sig);
  }

  pick(cx, cy) {
    const list = this.mode === 'walk' ? [...this.stationMeshes, this.floor] : this.pickables;
    if (!list.length) return null;
    const r = this.renderer.domElement.getBoundingClientRect();
    const v = new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(v, this.camera);
    const hits = ray.intersectObjects(list, false);
    if (!hits.length) return null;
    const u = hits[0].object.userData;
    if (u.type === 'floor') return { type: 'floor', x: hits[0].point.x, z: hits[0].point.z };
    return u;
  }

  resize() {
    const w = Math.max(10, this.container.clientWidth), h = Math.max(10, this.container.clientHeight);
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  view(name) {
    const g = this.goal;
    const box = this.parcelSize || 0.4;
    const narrow = this.camera.aspect < 1 ? 1.5 : 1;
    this.follow = false;
    if (name === 'follow') { this.follow = true; Object.assign(g, { yaw: -0.12, pitch: 0.82, dist: 7.2 * narrow }); g.target = this.playerPos().clone().add(new THREE.Vector3(0, 0.8, -0.6)); }
    else if (name === 'table') Object.assign(g, { target: new THREE.Vector3(0, TABLE_Y + 0.15, 0), yaw: -0.15, pitch: 0.75, dist: 2.1 * narrow });
    else if (name === 'work') Object.assign(g, { target: new THREE.Vector3(0, TABLE_Y + box / 2, 0), yaw: -0.55, pitch: 0.5, dist: (box * 2.6 + 0.6) * narrow });
    else if (name === 'pack') Object.assign(g, { target: new THREE.Vector3(0, TABLE_Y + box / 2, 0), yaw: -0.35, pitch: 0.85, dist: (box * 2.6 + 0.9) * narrow });
    else if (name === 'ship') Object.assign(g, { target: new THREE.Vector3(4.6, 1.1, 0.2), yaw: -0.42, pitch: 0.32, dist: 7 * narrow });
    g.target = g.target.clone();
    if (narrow > 1 && (name === 'work' || name === 'table' || name === 'pack')) g.target.y -= g.dist * 0.18;
  }

  _step(now, dt) {
    for (const a of this.anims.slice()) {
      const t = Math.min(1, (now - a.start) / a.ms);
      a.fn(t);
      if (t >= 1) { this.anims.splice(this.anims.indexOf(a), 1); a.res(); }
    }
    // 걷기
    if (this.player && this.walkGoal) {
      const p = this.player.position, gl = this.walkGoal;
      const dx = gl.x - p.x, dz = gl.z - p.z, d = Math.hypot(dx, dz);
      const step = this.walkSpeed * dt;
      if (d <= step) {
        p.x = gl.x; p.z = gl.z;
        if (gl.face != null) this.player.rotation.y = gl.face;
        this.walkGoal = null;
        this._play('Idle');
        if (this.walkDone) this.walkDone(true);
      } else {
        p.x += dx / d * step; p.z += dz / d * step;
        const want = Math.atan2(dx, dz);
        let diff = want - this.player.rotation.y;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        this.player.rotation.y += diff * Math.min(1, dt * 12);
        this._play('Walk');
      }
    }
    if (this.mixer) this.mixer.update(dt);
    if (this.follow && this.player) this.goal.target.copy(this.player.position).add(new THREE.Vector3(0, 0.8, -0.6));
    const c = this.cam, g = this.goal, k = 1 - Math.pow(0.002, dt);
    c.target.lerp(g.target, k);
    c.yaw += (g.yaw - c.yaw) * k; c.pitch += (g.pitch - c.pitch) * k; c.dist += (g.dist - c.dist) * k;
    const pos = new THREE.Vector3(Math.sin(c.yaw) * Math.cos(c.pitch), Math.sin(c.pitch), Math.cos(c.yaw) * Math.cos(c.pitch)).multiplyScalar(c.dist).add(c.target);
    this.camera.position.copy(pos);
    this.camera.lookAt(c.target);
    if (this.beltMoving) this.beltTex.offset.x -= dt * 1.6;
    this.renderer.render(this.scene, this.camera);
  }

  animate(ms, fn) { return new Promise((res) => this.anims.push({ start: performance.now(), ms, fn, res })); }

  // ---------- 물건 ----------
  showItem(item) {
    this.clearWork();
    const [w, h, d] = item.d;
    const grp = new THREE.Group();
    const m = new THREE.Mesh(new THREE.BoxGeometry(w * U, h * U, d * U), new THREE.MeshLambertMaterial({ color: item.color }));
    m.position.y = h * U / 2;
    grp.add(m);
    const sp = textSprite(item.emoji, { size: 0.18, bg: '#ffffff', ring: '#ffffff' });
    sp.position.y = h * U + 0.14;
    grp.add(sp);
    grp.position.set(0.6, TABLE_Y, 0.38);
    this.scene.add(grp);
    this.waitingItem = grp;
  }

  clearWork() {
    for (const k of ['waitingItem', 'parcel']) if (this[k]) { this.scene.remove(this[k]); this[k] = null; }
    this.pickables = [];
    this.A = null; this.pivot = null;
  }

  // ---------- 전개도 → 상자 ----------
  buildParcel(rects, A, item) {
    if (this.parcel) this.scene.remove(this.parcel);
    this.A = A; this.item = item;
    const parcel = new THREE.Group();
    parcel.position.set(0, TABLE_Y + 0.002, 0);
    parcel.scale.setScalar(U);
    const pivot = new THREE.Group();
    const rig = makeFoldRig(rects, A);
    const [mnx, , mnz] = A.bbox.mn, [mxx, , mxz] = A.bbox.mx;
    const dy = A.dims[1];
    this.center = [(mnx + mxx) / 2, dy / 2, (mnz + mxz) / 2];
    const xs = rects.flatMap((r) => [r.x, r.x + r.w]), zs = rects.flatMap((r) => [r.y, r.y + r.h]);
    this.flatCenter = [(Math.min(...xs) + Math.max(...xs)) / 2, 0, (Math.min(...zs) + Math.max(...zs)) / 2];
    pivot.add(rig.group);
    parcel.add(pivot);
    this.scene.add(parcel);
    this.parcel = parcel; this.pivot = pivot; this.rig = rig;
    this.parcelSize = Math.max(...A.dims) * U;
    // 뚜껑 = 밑면(뿌리)과 마주 보는 면
    this.lidIdx = A.faces.findIndex((f) => f && f.axis === 1 && f.sign < 0);
    this._placeRig(0);
    // 물건 크기를 상자 방향에 맞춘다
    this.itemMesh = null;
    if (item) {
      const box = [...A.dims];
      const order = [0, 1, 2].sort((a, b) => box[a] - box[b]);
      const isz = [...item.d].sort((a, b) => a - b);
      const bs = [...box].sort((a, b) => a - b);
      const size = [0, 0, 0];
      order.forEach((ax, k) => { size[ax] = isz[k]; });
      this.itemFits = isz.every((v, k) => v <= bs[k]);
      this.itemLoose = this.itemFits && isz.some((v, k) => v < bs[k]);
      const m = new THREE.Mesh(new THREE.BoxGeometry(size[0] * 0.94, size[1] * 0.94, size[2] * 0.94), new THREE.MeshLambertMaterial({ color: item.color }));
      if (!this.itemFits) { m.material.transparent = true; m.material.opacity = 0.45; m.material.depthWrite = false; }
      m.visible = false;
      this.itemSize = size;
      rig.group.add(m);
      this.itemMesh = m;
      const sp = textSprite(item.emoji, { size: 1.6, bg: '#ffffff', ring: '#ffffff' });
      sp.visible = false;
      rig.group.add(sp);
      this.itemSprite = sp;
    }
    return rig;
  }

  _placeRig(t) {
    const c = this.flatCenter.map((v, k) => v + (this.center[k] - v) * t);
    this.rig.group.position.set(-c[0], -this.center[1] * t, -c[2]);
    this.pivot.position.set(0, this.center[1] * t, 0);
  }

  // 뚜껑만 열어 두고 접는다(openLid=true). 실패한 전개도는 모두 접는다.
  fold(ms, openLid = false) {
    const hold = openLid && this.lidIdx >= 0 ? this.lidIdx : -1;
    return this.animate(ms, (k) => {
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      this.rig.setFold(e, hold, 0);
      this._placeRig(e);
    });
  }

  // 작업대 옆에서 물건이 날아올라 상자 속으로 쏙
  async dropItem() {
    if (!this.itemMesh) return;
    const m = this.itemMesh, sp = this.itemSprite;
    const end = new THREE.Vector3(this.center[0], this.itemSize[1] / 2, this.center[2]);
    let start = end.clone().add(new THREE.Vector3(6, 0, 4));
    if (this.waitingItem) {
      const wp = this.waitingItem.position.clone().add(new THREE.Vector3(0, this.itemSize[1] * U / 2, 0));
      this.parcel.updateMatrixWorld(true);
      start = this.rig.group.worldToLocal(wp);
      this.scene.remove(this.waitingItem); this.waitingItem = null;
    }
    const high = Math.max(...this.A.dims) + this.itemSize[1] + 1.5;
    m.visible = true; sp.visible = true;
    await this.animate(1300, (t) => {
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const p = new THREE.Vector3().lerpVectors(start, end, e);
      p.y = (1 - e) * start.y + e * end.y + Math.sin(e * Math.PI) * high;
      if (!this.itemFits) p.y = Math.max(p.y, end.y);
      m.position.copy(p);
      sp.position.set(p.x, p.y + this.itemSize[1] / 2 + 0.9, p.z);
    });
    sp.visible = false;
  }

  closeLid(ms) {
    if (this.lidIdx < 0) return Promise.resolve();
    return this.animate(ms, (k) => {
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      this.rig.setFold(1, this.lidIdx, e);
    });
  }

  tintFaces(ids, color) { ids.forEach((i) => this.rig.tint(i, color)); }

  // ---------- 굴리기 ----------
  _halfHeight(q) {
    const m = new THREE.Matrix4().makeRotationFromQuaternion(q).elements;
    const d = this.A.dims;
    return (Math.abs(m[1]) * d[0] + Math.abs(m[5]) * d[1] + Math.abs(m[9]) * d[2]) / 2;
  }

  async tumble(kind) {
    const R = [[1, 0, 0, Math.PI / 2], [1, 0, 0, -Math.PI / 2], [0, 0, 1, Math.PI / 2], [0, 0, 1, -Math.PI / 2], [1, 0, 0, Math.PI]][kind];
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(R[0], R[1], R[2]), R[3]);
    const newHalf = this._halfHeight(q);
    const startH = this.pivot.position.y;
    await this.animate(900, (t) => {
      const e = 1 - Math.pow(1 - t, 3);
      this.pivot.quaternion.slerpQuaternions(new THREE.Quaternion(), q, e);
      this.pivot.position.y = startH + (newHalf - startH) * e + Math.sin(t * Math.PI) * Math.max(...this.A.dims) * 0.5;
    });
    this.pivot.position.y = newHalf;
  }

  async roll(dir) {
    if (this.rolling || !this.pivot) return;
    this.rolling = true;
    const yaw = this.cam.yaw;
    const f = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const r = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const v = { up: f, down: f.clone().negate(), right: r, left: r.clone().negate() }[dir];
    const d = Math.abs(v.x) > Math.abs(v.z) ? new THREE.Vector3(Math.sign(v.x), 0, 0) : new THREE.Vector3(0, 0, Math.sign(v.z));
    const axis = new THREE.Vector3(0, 1, 0).cross(d).normalize();
    const q0 = this.pivot.quaternion.clone();
    const q1 = new THREE.Quaternion().setFromAxisAngle(axis, Math.PI / 2).multiply(q0);
    const hy = this._halfHeight(q1);
    const y0 = this.pivot.position.y;
    await this.animate(420, (t) => {
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      this.pivot.quaternion.slerpQuaternions(q0, q1, e);
      this.pivot.position.y = y0 + (hy - y0) * e + Math.sin(t * Math.PI) * Math.max(...this.A.dims) * 0.2;
    });
    this.pivot.quaternion.copy(q1);
    this.pivot.position.y = hy;
    this.rolling = false;
  }

  // ---------- 포장 준비: 모서리·꼭짓점·면 ----------
  setupPacking() {
    const A = this.A, { mn, mx } = A.bbox;
    this.edges = boxEdges(A);
    this.edgeHits = this.edges.map((e) => {
      const a = new THREE.Vector3(...e.a), b = new THREE.Vector3(...e.b);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, a.distanceTo(b), 6), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
      m.position.copy(a).add(b).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      e.len = Math.round(a.distanceTo(b));
      m.userData = { type: 'edge', edge: e };
      this.rig.group.add(m);
      if (!e.hinge) {
        const gap = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, a.distanceTo(b) * 0.98, 6), new THREE.MeshBasicMaterial({ color: 0x3a2412 }));
        gap.position.copy(m.position); gap.quaternion.copy(m.quaternion);
        this.rig.group.add(gap);
      }
      return m;
    });
    // 꼭짓점 8개
    this.corners = [];
    for (const x of [mn[0], mx[0]]) for (const y of [mn[1], mx[1]]) for (const z of [mn[2], mx[2]]) this.corners.push({ type: 'corner', id: this.corners.length, p: [x, y, z] });
    this.cornerHits = this.corners.map((c) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
      m.position.set(...c.p); m.userData = c; this.rig.group.add(m); return m;
    });
    // 면 6개: 물건이 놓인 면(도장)과 마주 보는 면이 밑면, 나머지 4개가 옆면
    const faces = [];
    for (let ax = 0; ax < 3; ax++) for (const sgn of [-1, 1]) {
      const n = [0, 0, 0]; n[ax] = sgn;
      const c = [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2];
      c[ax] = sgn > 0 ? mx[ax] : mn[ax];
      faces.push({ type: 'face', normal: n, center: c, axis: ax, others: [0, 1, 2].filter((k) => k !== ax), id: faces.length, role: ax === 1 ? (sgn < 0 ? 'base' : 'base2') : 'side' });
    }
    this.faces = faces;
    this.faceHits = faces.map((f) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
      this._orientOnFace(m, f, 0.03);
      m.scale.set(f.size[0], f.size[1], 1);
      m.userData = f;
      this.rig.group.add(m);
      return m;
    });
    this.addSticker(faces.find((f) => f.role === 'base'), 'stamp');
    this.setTool(null);
  }

  // 지금 쓰는 도구에 맞는 것만 누를 수 있게
  setTool(tool) {
    this.pickables = tool === 'tape' ? this.edgeHits : tool === 'guard' ? this.cornerHits : tool === 'base' || tool === 'side' ? this.faceHits : [];
  }

  // 면 위에 판을 놓는다. upWorld를 주면 지금 화면에서 바로 읽히는 방향으로 놓는다.
  _orientOnFace(m, f, off, readable = false) {
    const n = new THREE.Vector3(...f.normal);
    m.position.set(...f.center).addScaledVector(n, off);
    const axes = f.others.map((k) => { const v = new THREE.Vector3(); v.setComponent(k, 1); return v; });
    let up = axes[0].clone();
    if (readable) {
      // 화면의 위쪽(카메라 up)을 상자 안 좌표로 바꿔, 면 위에서 가장 가까운 축을 고른다
      this.rig.group.updateMatrixWorld(true);
      const inv = this.rig.group.getWorldQuaternion(new THREE.Quaternion()).invert();
      const camUp = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion).applyQuaternion(inv);
      let best = -Infinity;
      for (const a of axes) for (const sg of [1, -1]) {
        const v = a.clone().multiplyScalar(sg), d = v.dot(camUp);
        if (d > best) { best = d; up = v; }
      }
    } else if (f.axis !== 1) up = new THREE.Vector3(0, 1, 0);
    const right = up.clone().cross(n);
    m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, n));
    const { mn, mx } = this.A.bbox;
    const ext = (v) => [0, 1, 2].reduce((s, k) => s + Math.abs(v.getComponent(k)) * (mx[k] - mn[k]), 0);
    f.size = [ext(right), ext(up)];
  }

  addSticker(f, kind, who = '') {
    const tex = STICKER[kind](who);
    const ar = kind === 'label' ? 0.75 : 1;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshLambertMaterial({ map: tex, transparent: kind === 'stamp' }));
    this._orientOnFace(m, f, 0.06, kind !== 'stamp');
    const s = Math.min(f.size[0] * 0.75, f.size[1] * 0.75 / ar, 3.2);
    m.scale.set(s, s * ar, 1);
    this.rig.group.add(m);
    return m;
  }

  addTape(e, color = 0xc49a5c) {
    const a = new THREE.Vector3(...e.a), b = new THREE.Vector3(...e.b);
    const len = a.distanceTo(b);
    const g = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color, transparent: true, opacity: 0.9 });
    const tw = Math.min(0.7, 0.2 * Math.min(...this.A.dims));
    const c = [(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2, (e.a[2] + e.b[2]) / 2];
    const ctr = [(this.A.bbox.mn[0] + this.A.bbox.mx[0]) / 2, (this.A.bbox.mn[1] + this.A.bbox.mx[1]) / 2, (this.A.bbox.mn[2] + this.A.bbox.mx[2]) / 2];
    const inward = c.map((v, k) => Math.sign(ctr[k] - v));
    inward[e.axis] = 0;
    const others = [0, 1, 2].filter((k) => k !== e.axis);
    others.forEach((k) => {
      const s = [0.03, 0.03, 0.03]; s[e.axis] = len + 0.02;
      const o = others.find((x) => x !== k);
      s[o] = tw;
      const m = new THREE.Mesh(new THREE.BoxGeometry(...s), mat);
      const pos = [...c]; pos[o] += inward[o] * tw / 2; pos[k] += -inward[k] * 0.02;
      m.position.set(...pos);
      g.add(m);
    });
    this.rig.group.add(g);
    return g;
  }

  addGuard(c) {
    const ctr = [(this.A.bbox.mn[0] + this.A.bbox.mx[0]) / 2, (this.A.bbox.mn[1] + this.A.bbox.mx[1]) / 2, (this.A.bbox.mn[2] + this.A.bbox.mx[2]) / 2];
    const out = c.p.map((v, k) => Math.sign(v - ctr[k]));
    const s = Math.min(0.9, 0.35 * Math.min(...this.A.dims));
    const g = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: 0x2f6fde });
    // 꼭짓점을 감싸는 세 장짜리 모서리 보호대
    for (let ax = 0; ax < 3; ax++) {
      const size = [s, s, s]; size[ax] = 0.08;
      const m = new THREE.Mesh(new THREE.BoxGeometry(...size), mat);
      const pos = c.p.map((v, k) => (k === ax ? v + out[k] * 0.04 : v - out[k] * s / 2));
      m.position.set(...pos);
      g.add(m);
    }
    this.rig.group.add(g);
    return g;
  }

  // ---------- 트럭 뒷문 ----------
  _makeDoor() {
    this.truck.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(this.truck);
    const W = (bb.max.z - bb.min.z) * 0.8, y0 = 0.98, y1 = bb.max.y - 0.2, H = y1 - y0;
    const g = new THREE.Group();
    g.position.set(bb.min.x, y0, (bb.min.z + bb.max.z) / 2);
    const inside = new THREE.Mesh(new THREE.BoxGeometry(0.02, H, W), new THREE.MeshBasicMaterial({ color: 0x241c16 }));
    inside.position.set(-0.012, H / 2, 0);
    g.add(inside);
    this.cargo = new THREE.Group();
    this.cargo.position.set(-0.05, 0, 0);
    g.add(this.cargo);
    this.cargoSpace = { W, H };
    const tex = canvasTex(64, 128, (c) => {
      c.fillStyle = '#d8d4cc'; c.fillRect(0, 0, 64, 128);
      c.fillStyle = '#b9b4aa'; for (let y = 0; y < 128; y += 16) c.fillRect(0, y, 64, 4);
    });
    tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(1, 3);
    this.shutter = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1, W + 0.04), new THREE.MeshLambertMaterial({ map: tex }));
    this.shutterH = H + 0.02;
    this._setDoor(0);
    g.add(this.shutter);
    const frame = this.legMat;
    for (const z of [-W / 2 - 0.05, W / 2 + 0.05]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, H + 0.1, 0.08), frame);
      post.position.set(-0.06, H / 2, z);
      g.add(post);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, W + 0.2), frame);
    lintel.position.set(-0.07, H + 0.06, 0);
    g.add(lintel);
    this.truck.attach(g);
  }

  _setDoor(open) {
    const h = this.shutterH * (1 - open * 0.94);
    this.shutter.scale.y = h;
    this.shutter.position.set(-0.1, this.shutterH - h / 2 - 0.01, 0);
    this.doorOpen = open;
  }

  async openDoor() { if (!this.shutter || this.doorOpen >= 1) return; const a = this.doorOpen; await this.animate(600, (t) => this._setDoor(a + (1 - a) * t)); }
  async closeDoor() { if (!this.shutter || this.doorOpen <= 0) return; const a = this.doorOpen; await this.animate(600, (t) => this._setDoor(a * (1 - t))); }

  _stackCargo() {
    if (!this.cargo) return;
    const { W, H } = this.cargoSpace;
    const n = this.cargo.children.length;
    const per = 4, s = Math.min(0.42, W / per - 0.04);
    const row = n % per, lvl = Math.floor(n / per);
    if (lvl * (s + 0.02) + s > H) return;
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.05, s, s), new THREE.MeshLambertMaterial({ color: [0xc99560, 0xd8a86e, 0xb98550][n % 3] }));
    b.position.set(0, lvl * (s + 0.02) + s / 2, -W / 2 + s / 2 + 0.03 + row * (s + 0.04));
    this.cargo.add(b);
  }

  // ---------- 출고 ----------
  async ship() {
    this.pickables = [];
    const p = this.parcel;
    if (!p) return;
    const startX = p.position.x;
    this.openDoor();
    this.beltMoving = true;
    await this.animate(500, (t) => { p.position.x = startX + t * 0.9; });
    await this.animate(1900, (t) => { p.position.x = startX + 0.9 + t * (BELT_END - 0.9); });
    await this.animate(500, (t) => { p.position.x = BELT_END + t * 1.4; p.position.y = TABLE_Y + 0.002 + Math.sin(t * Math.PI) * 0.15; p.scale.setScalar(U * (1 - t * 0.5)); });
    this.beltMoving = false;
    this.scene.remove(p);
    this.parcel = null; this.A = null; this.pivot = null;
    this.truckLoad++;
    this._stackCargo();
    setTimeout(() => { if (this.alive && !this.parcel) this.closeDoor(); }, 900);
  }

  async truckLeave() {
    if (!this.truck) return;
    await this.closeDoor();
    const s = this.truck.position.clone();
    await this.animate(2200, (t) => { this.truck.position.z = s.z + t * t * 14; });
  }

  dispose() {
    this.alive = false;
    cancelAnimationFrame(this.raf);
    this.ac.abort();
    this.ro.disconnect();
    this.anims.forEach((a) => a.res());
    if (this.walkDone) this.walkDone(false);
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); });
    });
    const el = this.renderer.domElement;
    if (el.parentNode === this.container) this.container.removeChild(el);
  }
}
