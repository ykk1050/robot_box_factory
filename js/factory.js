// 3D 공장: 작업대, 컨베이어, 트럭. 상자 접기·테이프·굴리기·라벨·출고 장면을 맡는다.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { getRenderer, textSprite } from './three-view.js';
import { makeFoldRig, boxEdges } from './net.js';

const U = 0.1;          // 1cm 칸 = 0.1m (상자가 진짜 택배 크기로 보이게)
const TABLE_Y = 0.82;
const BELT_END = 4.0;

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
  arrow: () => canvasTex(128, 128, (g) => {
    g.fillStyle = '#fff6e0'; g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#d63b2f';
    for (const cx of [40, 88]) { g.beginPath(); g.moveTo(cx, 14); g.lineTo(cx + 22, 50); g.lineTo(cx + 8, 50); g.lineTo(cx + 8, 96); g.lineTo(cx - 8, 96); g.lineTo(cx - 8, 50); g.lineTo(cx - 22, 50); g.closePath(); g.fill(); }
    g.fillRect(14, 104, 100, 8);
  }),
  base: () => canvasTex(128, 128, (g) => {
    g.fillStyle = '#00000000'; g.clearRect(0, 0, 128, 128);
    g.strokeStyle = '#2f5fbf'; g.lineWidth = 8; g.beginPath(); g.arc(64, 64, 52, 0, 7); g.stroke();
    g.fillStyle = '#2f5fbf'; g.font = 'bold 34px Jua, sans-serif'; g.textAlign = 'center'; g.fillText('밑면', 64, 58); g.fillText('▼', 64, 96);
  }),
};

export class Factory {
  constructor(container) {
    this.container = container;
    this.renderer = getRenderer();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    container.appendChild(this.renderer.domElement);
    const scene = this.scene = new THREE.Scene();
    scene.background = new THREE.Color(0xcfe3ef);
    scene.fog = new THREE.Fog(0xcfe3ef, 14, 30);
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.05, 80);
    scene.add(new THREE.HemisphereLight(0xffffff, 0xb8a58a, 2.0));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(-3, 8, 5);
    scene.add(sun);
    this.anims = [];
    this.pickables = [];
    this.onTap = null;
    this.allowRotate = false;
    this.cam = { target: new THREE.Vector3(3.7, 0.9, 0.3), yaw: -0.12, pitch: 0.42, dist: 11.5 };
    this.goal = { target: this.cam.target.clone(), yaw: this.cam.yaw, pitch: this.cam.pitch, dist: this.cam.dist };
    this._buildRoom();
    this._loadModels();
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
      g.fillStyle = '#f2c94c'; g.fillRect(0, 240, 256, 16);
    });
    floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
    floorTex.repeat.set(12, 8);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(36, 24), new THREE.MeshLambertMaterial({ map: floorTex }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(3, 0, 0);
    s.add(floor);
    const wallMat = new THREE.MeshLambertMaterial({ color: 0xe9dcc6 });
    const back = new THREE.Mesh(new THREE.PlaneGeometry(36, 7), wallMat);
    back.position.set(3, 3.5, -4);
    s.add(back);
    const left = new THREE.Mesh(new THREE.PlaneGeometry(24, 7), wallMat);
    left.rotation.y = Math.PI / 2; left.position.set(-5, 3.5, 0);
    s.add(left);
    // 벽 간판
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
    s.add(top);
    const legMat = new THREE.MeshLambertMaterial({ color: 0x5c6670 });
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
    // 쌓인 택배 상자(분위기)
    const boxMat = new THREE.MeshLambertMaterial({ color: 0xc99560 });
    [[-3.4, -3.2, 0.6, 0.5, 0.5], [-2.8, -3.3, 0.5, 0.4, 0.6], [-3.1, -3.25, 0.45, 0.45, 0.45, 0.5]].forEach(([x, z, w, h, d, y = 0]) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), boxMat);
      b.position.set(x, y + h / 2, z);
      s.add(b);
    });
    this.truckLoad = 0;
  }

  async _loadModels() {
    const loader = new GLTFLoader();
    const put = async (file, x, y, z, ry = 0) => {
      try {
        const g = await loader.loadAsync(`models/${file}.glb`);
        if (!this.alive) return null;
        g.scene.position.set(x, y, z);
        g.scene.rotation.y = ry;
        this.scene.add(g.scene);
        return g.scene;
      } catch (e) { console.warn('모델을 불러오지 못함', file, e); return null; }
    };
    this.truck = await put('delivery-truck-a9537e', BELT_END + 3.2, 0, 0.2, Math.PI / 2);
    if (this.truck) { this.truckHome = this.truck.position.clone(); this._makeDoor(); }
    put('rooted-gantry-arm-f35c8f', -2.4, 0, -2.2, 0.5);
    put('timber-eur-pallet-a1f655', 2.0, 0, -2.6);
    put('material-pallet-6af263', 3.5, 0, -2.7, 0.3);
    put('material-pallet-6af263', -3.7, 0, 1.6, -0.6);
  }

  // 트럭 뒷문(셔터): 모델의 문 위에 덮어서 열고 닫는다
  _makeDoor() {
    this.truck.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(this.truck);
    const W = (bb.max.z - bb.min.z) * 0.8, y0 = 0.98, y1 = bb.max.y - 0.2, H = y1 - y0;
    const g = new THREE.Group();
    g.position.set(bb.min.x, y0, (bb.min.z + bb.max.z) / 2);
    // 짐칸 안쪽(어두운 공간)
    const inside = new THREE.Mesh(new THREE.BoxGeometry(0.02, H, W), new THREE.MeshBasicMaterial({ color: 0x241c16 }));
    inside.position.set(-0.012, H / 2, 0);
    g.add(inside);
    // 실은 상자 더미
    this.cargo = new THREE.Group();
    this.cargo.position.set(-0.05, 0, 0);
    g.add(this.cargo);
    this.cargoSpace = { W, H };
    // 셔터
    const tex = canvasTex(64, 128, (c) => {
      c.fillStyle = '#d8d4cc'; c.fillRect(0, 0, 64, 128);
      c.fillStyle = '#b9b4aa'; for (let y = 0; y < 128; y += 16) c.fillRect(0, y, 64, 4);
    });
    tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(1, 3);
    this.shutter = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1, W + 0.04), new THREE.MeshLambertMaterial({ map: tex }));
    this.shutterH = H + 0.02;
    this.door = g;
    this._setDoor(0);
    g.add(this.shutter);
    // 문틀
    const frame = new THREE.MeshLambertMaterial({ color: 0x5b6168 });
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
    // open 0(닫힘)~1(열림): 셔터가 위로 말려 올라간다
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
    if (lvl * (s + 0.02) + s > H) return; // 가득 참
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.05, s, s), new THREE.MeshLambertMaterial({ color: [0xc99560, 0xd8a86e, 0xb98550][n % 3] }));
    b.position.set(0, lvl * (s + 0.02) + s / 2, -W / 2 + s / 2 + 0.03 + row * (s + 0.04));
    this.cargo.add(b);
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
      if (!down.drag && Math.hypot(dx, dy) > 8) down.drag = true;
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
    if (!this.pickables.length) return null;
    const r = this.renderer.domElement.getBoundingClientRect();
    const v = new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(v, this.camera);
    const hits = ray.intersectObjects(this.pickables, false);
    return hits.length ? hits[0].object.userData : null;
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
    // 좁은 화면(세로)에서는 더 멀리서 본다
    const narrow = this.camera.aspect < 1 ? 1.5 : 1;
    if (name === 'wide') Object.assign(g, { target: new THREE.Vector3(3.7, 0.9, 0.3), yaw: -0.12, pitch: 0.42, dist: 11.5 * narrow });
    else if (name === 'table') Object.assign(g, { target: new THREE.Vector3(0, TABLE_Y + 0.15, 0), yaw: -0.15, pitch: 0.75, dist: 2.1 * narrow });
    else if (name === 'work') Object.assign(g, { target: new THREE.Vector3(0, TABLE_Y + box / 2, 0), yaw: -0.55, pitch: 0.5, dist: (box * 2.6 + 0.5) * narrow });
    else if (name === 'ship') Object.assign(g, { target: new THREE.Vector3(4.6, 1.1, 0.2), yaw: -0.42, pitch: 0.32, dist: 7 * narrow });
    g.target = g.target.clone();
    // 세로 화면에서는 아래 패널에 가리지 않게 상자를 위쪽에 보이게 한다
    if (narrow > 1 && (name === 'work' || name === 'table')) g.target.y -= g.dist * 0.18;
  }

  _step(now, dt) {
    for (const a of this.anims.slice()) {
      const t = Math.min(1, (now - a.start) / a.ms);
      a.fn(t);
      if (t >= 1) { this.anims.splice(this.anims.indexOf(a), 1); a.res(); }
    }
    const c = this.cam, g = this.goal, k = 1 - Math.pow(0.002, dt);
    c.target.lerp(g.target, k);
    c.yaw += (g.yaw - c.yaw) * k; c.pitch += (g.pitch - c.pitch) * k; c.dist += (g.dist - c.dist) * k;
    const p = new THREE.Vector3(Math.sin(c.yaw) * Math.cos(c.pitch), Math.sin(c.pitch), Math.cos(c.yaw) * Math.cos(c.pitch)).multiplyScalar(c.dist).add(c.target);
    this.camera.position.copy(p);
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
    grp.position.set(0.55, TABLE_Y, 0.35);
    this.scene.add(grp);
    this.waitingItem = grp;
  }

  clearWork() {
    for (const k of ['waitingItem', 'parcel']) if (this[k]) { this.scene.remove(this[k]); this[k] = null; }
    this.pickables = [];
  }

  // ---------- 전개도 → 상자 ----------
  buildParcel(rects, A, item) {
    if (this.parcel) this.scene.remove(this.parcel);
    this.A = A; this.item = item;
    const parcel = new THREE.Group();             // 작업대 위 (월드)
    parcel.position.set(0, TABLE_Y + 0.002, 0);
    parcel.scale.setScalar(U);
    const pivot = new THREE.Group();              // 상자 가운데(굴릴 때 축)
    const rig = makeFoldRig(rects, A);
    const [mnx, , mnz] = A.bbox.mn, [mxx, , mxz] = A.bbox.mx;
    const dy = A.dims[1];
    this.center = [(mnx + mxx) / 2, dy / 2, (mnz + mxz) / 2];
    // 접기 전에는 펼친 전개도 가운데를 작업대 가운데에 둔다
    const xs = rects.flatMap((r) => [r.x, r.x + r.w]), zs = rects.flatMap((r) => [r.y, r.y + r.h]);
    this.flatCenter = [(Math.min(...xs) + Math.max(...xs)) / 2, 0, (Math.min(...zs) + Math.max(...zs)) / 2];
    pivot.add(rig.group);
    parcel.add(pivot);
    this.scene.add(parcel);
    this.parcel = parcel; this.pivot = pivot; this.rig = rig;
    this.parcelSize = Math.max(...A.dims) * U;
    this._placeRig(0);
    // 물건: 밑면 위에 올린다
    if (item) {
      const box = [...A.dims];
      const order = [0, 1, 2].sort((a, b) => box[a] - box[b]);
      const isz = [...item.d].sort((a, b) => a - b);
      const size = [0, 0, 0];
      order.forEach((ax, k) => { size[ax] = isz[k]; });
      const m = new THREE.Mesh(new THREE.BoxGeometry(size[0] * 0.94, size[1] * 0.94, size[2] * 0.94), new THREE.MeshLambertMaterial({ color: item.color }));
      m.position.set(this.center[0], size[1] / 2, this.center[2]);
      rig.group.add(m);
      const sp = textSprite(item.emoji, { size: 1.6, bg: '#ffffff', ring: '#ffffff' });
      sp.position.set(this.center[0], size[1] + 0.9, this.center[2]);
      rig.group.add(sp);
      this.itemSprite = sp;
      this.itemFits = isz.every((v, k) => v <= [...box].sort((a, b) => a - b)[k]);
      this.itemLoose = this.itemFits && isz.some((v, k) => v < [...box].sort((a, b) => a - b)[k]);
      if (!this.itemFits) { m.material.transparent = true; m.material.opacity = 0.45; m.material.depthWrite = false; }
    }
    if (this.waitingItem) { this.scene.remove(this.waitingItem); this.waitingItem = null; }
    return rig;
  }

  _placeRig(t) {
    const c = this.flatCenter.map((v, k) => v + (this.center[k] - v) * t);
    this.rig.group.position.set(-c[0], -this.center[1] * t, -c[2]);
    this.pivot.position.set(0, this.center[1] * t, 0);
  }

  fold(ms) {
    return this.animate(ms, (k) => {
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      this.rig.setFold(e);
      this._placeRig(e);
      if (this.itemSprite) this.itemSprite.visible = e < 0.6;
    });
  }

  tintFaces(ids, color) { ids.forEach((i) => this.rig.tint(i, color)); }

  // ---------- 테이프 ----------
  setupTape() {
    this.edges = boxEdges(this.A);
    this.pickables = this.edges.map((e) => {
      const a = new THREE.Vector3(...e.a), b = new THREE.Vector3(...e.b);
      const len = a.distanceTo(b);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, len, 6), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
      m.position.copy(a).add(b).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      m.userData = { type: 'edge', edge: e };
      this.rig.group.add(m);
      if (!e.hinge) {
        // 잘린 모서리는 살짝 벌어진 틈이 보인다
        const gap = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, len * 0.98, 6), new THREE.MeshBasicMaterial({ color: 0x3a2412 }));
        gap.position.copy(m.position); gap.quaternion.copy(m.quaternion);
        this.rig.group.add(gap);
      }
      return m;
    });
    return this.edges;
  }

  addTape(e, color = 0xc49a5c) {
    const a = new THREE.Vector3(...e.a), b = new THREE.Vector3(...e.b);
    const len = a.distanceTo(b);
    // 모서리를 감싸는 L자 테이프
    const g = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color, transparent: true, opacity: 0.88 });
    const tw = Math.min(0.7, 0.2 * Math.min(...this.A.dims));
    const c = [(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2, (e.a[2] + e.b[2]) / 2];
    const inward = c.map((v, k) => Math.sign(this.center[k] - v)); // 상자 안쪽 방향
    inward[e.axis] = 0;
    const size = [0.06, 0.06, 0.06]; size[e.axis] = len + 0.02;
    const others = [0, 1, 2].filter((k) => k !== e.axis);
    others.forEach((k) => {
      const s = [...size]; const o = others.find((x) => x !== k);
      s[o] = tw; s[k] = 0.03;
      const m = new THREE.Mesh(new THREE.BoxGeometry(...s), mat);
      const pos = [...c]; pos[o] += inward[o] * tw / 2; pos[k] += -inward[k] * 0.02;
      m.position.set(...pos);
      g.add(m);
    });
    this.rig.group.add(g);
    return g;
  }

  // ---------- 굴리기 ----------
  async tumble(kind) {
    // kind: 0~3 옆으로 눕힘, 4 뒤집힘
    const q = new THREE.Quaternion();
    const R = [[1, 0, 0, Math.PI / 2], [1, 0, 0, -Math.PI / 2], [0, 0, 1, Math.PI / 2], [0, 0, 1, -Math.PI / 2], [1, 0, 0, Math.PI]][kind];
    q.setFromAxisAngle(new THREE.Vector3(R[0], R[1], R[2]), R[3]);
    // 회전 뒤 높이의 절반
    const d = this.A.dims;
    const half = new THREE.Vector3(d[0], d[1], d[2]).applyQuaternion(q);
    const newHalf = Math.abs(half.y) / 2;
    const startH = this.pivot.position.y;
    await this.animate(900, (t) => {
      const e = 1 - Math.pow(1 - t, 3);
      this.pivot.quaternion.slerpQuaternions(new THREE.Quaternion(), q, e);
      this.pivot.position.y = startH + (newHalf - startH) * e + Math.sin(t * Math.PI) * Math.max(...d) * 0.5;
    });
    this.pivot.position.y = newHalf;
  }

  // ---------- 손으로 굴리기 ----------
  // dir: 'up'(멀리) 'down'(앞으로) 'left' 'right' — 지금 보는 방향 기준으로 상자를 90도 굴린다
  async roll(dir) {
    if (this.rolling || !this.pivot) return;
    this.rolling = true;
    const yaw = this.cam.yaw;
    const f = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const r = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const v = { up: f, down: f.clone().negate(), right: r, left: r.clone().negate() }[dir];
    // 작업대와 나란하게: 가까운 축(x 또는 z)으로 맞춘다
    const d = Math.abs(v.x) > Math.abs(v.z) ? new THREE.Vector3(Math.sign(v.x), 0, 0) : new THREE.Vector3(0, 0, Math.sign(v.z));
    const axis = new THREE.Vector3(0, 1, 0).cross(d).normalize();
    const q0 = this.pivot.quaternion.clone();
    const q1 = new THREE.Quaternion().setFromAxisAngle(axis, Math.PI / 2).multiply(q0);
    const m = new THREE.Matrix4().makeRotationFromQuaternion(q1).elements;
    const dims = this.A.dims;
    const hy = (Math.abs(m[1]) * dims[0] + Math.abs(m[5]) * dims[1] + Math.abs(m[9]) * dims[2]) / 2;
    const y0 = this.pivot.position.y;
    await this.animate(420, (t) => {
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      this.pivot.quaternion.slerpQuaternions(q0, q1, e);
      this.pivot.position.y = y0 + (hy - y0) * e + Math.sin(t * Math.PI) * Math.max(...dims) * 0.2;
    });
    this.pivot.quaternion.copy(q1);
    this.pivot.position.y = hy;
    this.rolling = false;
  }

  // ---------- 라벨 ----------
  setupFaces() {
    const { mn, mx } = this.A.bbox;
    const faces = [];
    for (let ax = 0; ax < 3; ax++) for (const sgn of [-1, 1]) {
      const n = [0, 0, 0]; n[ax] = sgn;
      const c = [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2];
      c[ax] = sgn > 0 ? mx[ax] : mn[ax];
      const others = [0, 1, 2].filter((k) => k !== ax);
      const size = others.map((k) => mx[k] - mn[k]);
      faces.push({ type: 'face', normal: n, center: c, size, axis: ax, others, id: faces.length, role: ax === 1 ? (sgn < 0 ? 'base' : 'top') : 'side' });
    }
    this.faces = faces;
    this.pickables = faces.map((f) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
      this._orientOnFace(m, f, 0.03, 1);
      m.scale.set(f.size[0], f.size[1], 1);
      m.userData = f;
      this.rig.group.add(m);
      return m;
    });
    // 밑면 도장
    this.addSticker(faces.find((f) => f.role === 'base'), 'base');
    return faces;
  }

  _orientOnFace(m, f, off) {
    const n = new THREE.Vector3(...f.normal);
    m.position.set(...f.center).addScaledVector(n, off);
    // 옆면 스티커는 위쪽(+y, 밑면 반대쪽)이 그림의 위가 되게
    m.up.set(...(f.axis === 1 ? [0, 0, -1] : [0, 1, 0]));
    m.lookAt(m.position.clone().add(n));
    // PlaneGeometry 크기를 면의 실제 가로·세로 축에 맞춘다
    if (f.axis !== 1) {
      const horiz = f.others.find((k) => k !== 1);
      f.size = [this.A.bbox.mx[horiz] - this.A.bbox.mn[horiz], this.A.bbox.mx[1] - this.A.bbox.mn[1]];
    } else f.size = [this.A.bbox.mx[0] - this.A.bbox.mn[0], this.A.bbox.mx[2] - this.A.bbox.mn[2]];
  }

  addSticker(f, kind, who = '') {
    const tex = kind === 'label' ? STICKER.label(who) : kind === 'arrow' ? STICKER.arrow() : STICKER.base();
    const ar = kind === 'label' ? 0.75 : 1;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshLambertMaterial({ map: tex, transparent: kind === 'base', side: THREE.FrontSide }));
    this._orientOnFace(m, f, 0.06);
    const s = Math.min(f.size[0] * 0.8, f.size[1] * 0.8 / ar, 3.2);
    m.scale.set(s, s * ar, 1);
    this.rig.group.add(m);
    return m;
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
    this.parcel = null;
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
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); });
    });
    const el = this.renderer.domElement;
    if (el.parentNode === this.container) this.container.removeChild(el);
  }
}
