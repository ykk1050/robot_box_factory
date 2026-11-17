// 3D 화면 공통: 렌더러 하나를 돌려 쓰고, 끌어서 돌리기·눌러서 고르기를 처리한다.
import * as THREE from 'three';

export const VL = ['ㄱ', 'ㄴ', 'ㄷ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅅ', 'ㅇ'];
export const CARD = 0xd9a46a;       // 골판지 색
export const INK = 0x3b2a1e;

let sharedRenderer = null;
export function getRenderer() {
  if (!sharedRenderer) {
    sharedRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    sharedRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    sharedRenderer.domElement.className = 'gl';
  }
  return sharedRenderer;
}

export class View {
  constructor(container, { yaw = -0.6, pitch = 0.45, spring = false, rotate = true } = {}) {
    this.container = container;
    this.renderer = getRenderer();
    container.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 2000);
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xcbb89c, 2.2));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(3, 6, 5);
    this.scene.add(sun);
    this.baseYaw = this.yaw = yaw;
    this.basePitch = this.pitch = pitch;
    this.spring = spring;
    this.rotate = rotate;
    this.onTap = null;
    this.anims = [];
    this.alive = true;
    this.radius = 5;
    this.ac = new AbortController();
    const el = this.renderer.domElement;
    const sig = { signal: this.ac.signal };
    let down = null;
    el.addEventListener('pointerdown', (e) => {
      down = { x: e.clientX, y: e.clientY, yaw: this.yaw, pitch: this.pitch, drag: false, id: e.pointerId };
      this._pressing = true;
      try { el.setPointerCapture(e.pointerId); } catch (_) { /* 무시 */ }
    }, sig);
    el.addEventListener('pointermove', (e) => {
      if (!down || e.pointerId !== down.id) return;
      const dx = e.clientX - down.x, dy = e.clientY - down.y;
      if (!down.drag && Math.hypot(dx, dy) > 7) down.drag = true;
      if (down.drag && this.rotate) {
        this.yaw = down.yaw + dx * 0.012;
        this.pitch = Math.max(-1.35, Math.min(1.35, down.pitch + dy * 0.012));
      }
    }, sig);
    const up = (e) => {
      if (!down || e.pointerId !== down.id) return;
      const wasDrag = down.drag;
      down = null;
      this._pressing = false;
      if (!wasDrag && this.onTap) this.onTap(this.pick(e.clientX, e.clientY), e);
    };
    el.addEventListener('pointerup', up, sig);
    el.addEventListener('pointercancel', () => { down = null; this._pressing = false; }, sig);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.resize();
    this._tick = this._tick.bind(this);
    this.raf = requestAnimationFrame(this._tick);
  }

  resize() {
    const w = Math.max(10, this.container.clientWidth), h = Math.max(10, this.container.clientHeight);
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.fit(this.radius);
  }

  fit(radius) {
    this.radius = radius;
    const vfov = THREE.MathUtils.degToRad(this.camera.fov / 2);
    const hfov = Math.atan(Math.tan(vfov) * this.camera.aspect);
    const dist = radius / Math.sin(Math.min(vfov, hfov)) * 1.08;
    this.camera.position.set(0, 0, dist);
    this.camera.near = dist / 50; this.camera.far = dist * 10;
    this.camera.lookAt(0, 0, 0);
    this.camera.updateProjectionMatrix();
  }

  resetView() { this.yaw = this.baseYaw; this.pitch = this.basePitch; }

  // 시간 애니메이션: fn(t 0..1). Promise로 끝을 알린다.
  animate(ms, fn) {
    return new Promise((res) => {
      this.anims.push({ start: performance.now(), ms, fn, res });
    });
  }

  _tick(now) {
    if (!this.alive) return;
    this.raf = requestAnimationFrame(this._tick);
    for (const a of this.anims.slice()) {
      const t = Math.min(1, (now - a.start) / a.ms);
      a.fn(t);
      if (t >= 1) { this.anims.splice(this.anims.indexOf(a), 1); a.res(); }
    }
    if (this.spring && !this._dragging()) {
      this.yaw += (this.baseYaw - this.yaw) * 0.08;
      this.pitch += (this.basePitch - this.pitch) * 0.08;
    }
    const qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    const qp = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), this.pitch);
    this.root.quaternion.copy(qp.multiply(qy));
    this.renderer.render(this.scene, this.camera);
  }

  _dragging() {
    // spring 모드에서 손가락이 닿아 있는 동안은 돌아가지 않게
    return this._pressing === true;
  }

  pickables() { return []; }

  pick(cx, cy) {
    const r = this.renderer.domElement.getBoundingClientRect();
    const v = new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(v, this.camera);
    this.scene.updateMatrixWorld(true);
    return ray.intersectObjects(this.pickables(), false);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.alive = false;
    cancelAnimationFrame(this.raf);
    this.ac.abort();
    this.ro.disconnect();
    this.anims.forEach((a) => a.res());
    this.anims = [];
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        ms.forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); });
      }
    });
    const el = this.renderer.domElement;
    if (el.parentNode === this.container) this.container.removeChild(el);
  }
}

// ---------- 글자 스프라이트 ----------
export function textSprite(text, { size = 1, bg = '#ffffff', fg = '#3b2a1e', ring = '#3b2a1e', w = 128 } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.strokeStyle = ring; g.lineWidth = 8;
  g.beginPath();
  if (w === 128) g.arc(64, 64, 52, 0, Math.PI * 2);
  else g.roundRect(6, 14, w - 12, 100, 40);
  g.fill(); g.stroke();
  g.fillStyle = fg;
  g.font = `bold ${w === 128 ? 64 : 56}px "Jua", sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, w / 2, 68);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: true, transparent: true }));
  sp.scale.set(size * (w / 128), size, 1);
  sp.renderOrder = 10;
  return sp;
}

function stickerTexture(kind) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  if (kind === 'barcode') {
    g.fillStyle = '#fff'; g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#111';
    let x = 14;
    while (x < 114) { const w = 2 + ((x * 7) % 5); g.fillRect(x, 20, w, 88); x += w + 3 + ((x * 3) % 4); }
  } else if (kind === 'check') {
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(64, 64, 58, 0, 7); g.fill();
    g.strokeStyle = '#2a9d55'; g.lineWidth = 16; g.lineCap = 'round';
    g.beginPath(); g.moveTo(32, 66); g.lineTo(56, 90); g.lineTo(98, 40); g.stroke();
  } else {
    g.fillStyle = kind; g.fillRect(0, 0, 128, 128);
    g.strokeStyle = '#ffffffaa'; g.lineWidth = 10; g.strokeRect(10, 10, 108, 108);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------- 도형 자료 ----------
// 꼭짓점 이름은 교과서처럼 윗면 ㄱㄴㄷㄹ, 아랫면 ㅁㅂㅅㅇ (ㄱ 아래 ㅁ ...)
export function boxShape(w, h, d) {
  const x = w / 2, y = h / 2, z = d / 2;
  const verts = [
    [-x, y, -z], [-x, y, z], [x, y, z], [x, y, -z],
    [-x, -y, -z], [-x, -y, z], [x, -y, z], [x, -y, -z],
  ];
  const faces = [
    [0, 1, 2, 3], // 위  ㄱㄴㄷㄹ
    [4, 5, 6, 7], // 아래 ㅁㅂㅅㅇ
    [1, 5, 6, 2], // 앞  ㄴㅂㅅㄷ
    [0, 4, 7, 3], // 뒤  ㄱㅁㅇㄹ
    [1, 5, 4, 0], // 왼  ㄴㅂㅁㄱ
    [2, 6, 7, 3], // 오른 ㄷㅅㅇㄹ
  ];
  return { kind: w === h && h === d ? 'cube' : 'cuboid', dims: [w, h, d], verts, faces };
}

export function faceName(shape, fi) {
  return '면 ' + shape.faces[fi].map((i) => VL[i]).join('');
}

// 직육면체가 아닌 불량 상자들
export function defectShape(type, a = 4, b = 3, c = 3) {
  const x = a / 2, y = b / 2, z = c / 2;
  if (type === 'trap') { // 앞뒤가 사다리꼴인 기둥
    const t = x * 0.45;
    return {
      kind: 'trap', dims: [a, b, c],
      verts: [[-t, y, -z], [-t, y, z], [t, y, z], [t, y, -z], [-x, -y, -z], [-x, -y, z], [x, -y, z], [x, -y, -z]],
      faces: [[0, 1, 2, 3], [4, 5, 6, 7], [1, 5, 6, 2], [0, 4, 7, 3], [1, 5, 4, 0], [2, 6, 7, 3]],
    };
  }
  if (type === 'shear') { // 기울어진 상자(평행사변형 면)
    const s = a * 0.3;
    return {
      kind: 'shear', dims: [a, b, c],
      verts: [[-x + s, y, -z], [-x + s, y, z], [x + s, y, z], [x + s, y, -z], [-x, -y, -z], [-x, -y, z], [x, -y, z], [x, -y, -z]],
      faces: [[0, 1, 2, 3], [4, 5, 6, 7], [1, 5, 6, 2], [0, 4, 7, 3], [1, 5, 4, 0], [2, 6, 7, 3]],
    };
  }
  // 삼각기둥
  return {
    kind: 'tri', dims: [a, b, c],
    verts: [[0, y, -z], [0, y, z], [-x, -y, -z], [-x, -y, z], [x, -y, -z], [x, -y, z]],
    faces: [[0, 2, 4], [1, 3, 5], [0, 1, 3, 2], [0, 1, 5, 4], [2, 3, 5, 4]],
  };
}

// 면 하나의 모양을 말로 (분류 검사기)
export function describeFace(shape, fi) {
  const P = shape.faces[fi].map((i) => new THREE.Vector3(...shape.verts[i]));
  const n = P.length;
  if (n === 3) return { name: '삼각형', ok: false, text: '삼각형' };
  const L = [], ang = [];
  for (let i = 0; i < n; i++) {
    const a = P[i], b = P[(i + 1) % n], c = P[(i + n - 1) % n];
    L.push(a.distanceTo(b));
    const u = b.clone().sub(a).normalize(), v = c.clone().sub(a).normalize();
    ang.push(Math.abs(u.dot(v)) < 1e-6);
  }
  const r = (v) => Math.round(v * 10) / 10;
  if (ang.every(Boolean)) {
    const sq = Math.abs(L[0] - L[1]) < 1e-6;
    return { name: sq ? '정사각형' : '직사각형', ok: true, square: sq, text: `${sq ? '정사각형' : '직사각형'} (${r(L[0])}cm × ${r(L[1])}cm)` };
  }
  const par = Math.abs(L[0] - L[2]) < 1e-6 && Math.abs(L[1] - L[3]) < 1e-6;
  return { name: par ? '평행사변형' : '사다리꼴', ok: false, text: `${par ? '평행사변형' : '사다리꼴'} — 직각이 아닌 모서리가 있어요` };
}

// ---------- 상자 3D ----------
export class Box3D extends View {
  constructor(container, opts = {}) {
    super(container, opts);
    this.modes = opts.modes || ['face'];
    this.content = new THREE.Group();
    this.root.add(this.content);
    this.markers = new THREE.Group();
  }

  setShape(shape, { labels = false, color = CARD } = {}) {
    this.shape = shape;
    this.root.remove(this.content);
    this.content = new THREE.Group();
    this.root.add(this.content);
    const V = shape.verts.map((p) => new THREE.Vector3(...p));
    this.V = V;
    const center = V.reduce((a, b) => a.clone().add(b), new THREE.Vector3()).multiplyScalar(1 / V.length);
    this.center = center;
    const size = Math.max(...shape.dims);
    this.size = size;
    this.faceMeshes = []; this.edgeHits = []; this.vertHits = []; this.edgeLines = [];
    shape.faces.forEach((f, fi) => {
      const pts = f.map((i) => V[i]);
      const pos = [];
      for (let k = 1; k < pts.length - 1; k++) pos.push(...pts[0].toArray(), ...pts[k].toArray(), ...pts[k + 1].toArray());
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.computeVertexNormals();
      const m = new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
      const mesh = new THREE.Mesh(g, m);
      mesh.userData = { type: 'face', index: fi, base: color };
      // 바깥쪽 법선과 중심
      const fc = pts.reduce((a, b) => a.clone().add(b), new THREE.Vector3()).multiplyScalar(1 / pts.length);
      const nrm = new THREE.Vector3().subVectors(pts[1], pts[0]).cross(new THREE.Vector3().subVectors(pts[2], pts[0])).normalize();
      if (nrm.dot(fc.clone().sub(center)) < 0) nrm.negate();
      mesh.userData.center = fc; mesh.userData.normal = nrm;
      this.content.add(mesh);
      this.faceMeshes.push(mesh);
    });
    // 모서리
    const seen = new Map();
    shape.faces.forEach((f) => f.forEach((a, k) => {
      const b = f[(k + 1) % f.length];
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      if (!seen.has(key)) seen.set(key, [Math.min(a, b), Math.max(a, b)]);
    }));
    this.edges = [...seen.values()];
    const er = size * 0.012;
    this.edges.forEach(([a, b], ei) => {
      const line = cylinderBetween(V[a], V[b], er, new THREE.MeshBasicMaterial({ color: INK }));
      this.content.add(line); this.edgeLines.push(line);
      const hit = cylinderBetween(V[a], V[b], size * 0.06, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
      hit.userData = { type: 'edge', index: ei };
      this.content.add(hit); this.edgeHits.push(hit);
    });
    V.forEach((p, vi) => {
      const hit = new THREE.Mesh(new THREE.SphereGeometry(size * 0.1, 10, 8), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
      hit.position.copy(p);
      hit.userData = { type: 'vertex', index: vi };
      this.content.add(hit); this.vertHits.push(hit);
    });
    if (labels) {
      V.forEach((p, vi) => {
        const sp = textSprite(VL[vi], { size: size * 0.16 });
        const dir = p.clone().sub(center).normalize();
        sp.position.copy(p).addScaledVector(dir, size * 0.13);
        this.content.add(sp);
      });
    }
    this.markers = new THREE.Group();
    this.content.add(this.markers);
    this.content.position.copy(center).negate();
    this.fit(V.reduce((m, p) => Math.max(m, p.distanceTo(center)), 0) * 1.25);
  }

  pickables() {
    const list = [...this.faceMeshes];
    if (this.modes.includes('edge')) list.push(...this.edgeHits);
    if (this.modes.includes('vertex')) list.push(...this.vertHits);
    return list;
  }

  // 가장 앞의 것을 고른다. 면에 가려진 모서리·꼭짓점은 고를 수 없다.
  pick(cx, cy) {
    const hits = super.pick(cx, cy);
    if (!hits.length) return null;
    const first = hits[0];
    const tol = this.size * 0.12;
    // 꼭짓점 > 모서리 > 면 순서로 가까운 것을 우선
    for (const t of ['vertex', 'edge']) {
      if (!this.modes.includes(t)) continue;
      const h = hits.find((x) => x.object.userData.type === t && x.distance - first.distance < tol);
      if (h) return { type: t, index: h.object.userData.index };
    }
    if (this.modes.includes('face') && first.object.userData.type === 'face') return { type: 'face', index: first.object.userData.index };
    const f = hits.find((x) => x.object.userData.type === 'face');
    if (this.modes.includes('face') && f) return { type: 'face', index: f.object.userData.index };
    return null;
  }

  setFaceColor(fi, color) { this.faceMeshes[fi].material.color.set(color ?? this.faceMeshes[fi].userData.base); }
  resetFaceColors() { this.faceMeshes.forEach((m) => m.material.color.set(m.userData.base)); }

  addCorner(vi, color = 0x2f6fde) {
    const s = this.size * 0.12;
    const m = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), new THREE.MeshLambertMaterial({ color }));
    m.position.copy(this.V[vi]);
    this.markers.add(m);
    return m;
  }

  addTape(ei, color = 0x4fa3e0) {
    const [a, b] = this.edges[ei];
    const m = cylinderBetween(this.V[a], this.V[b], this.size * 0.035, new THREE.MeshLambertMaterial({ color, transparent: true, opacity: 0.9 }));
    this.markers.add(m);
    return m;
  }

  addSticker(fi, kind = 'check', scale = 0.4) {
    const f = this.faceMeshes[fi].userData;
    const s = this.size * scale;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(s, s), new THREE.MeshBasicMaterial({ map: stickerTexture(kind), side: THREE.DoubleSide }));
    m.position.copy(f.center).addScaledVector(f.normal, this.size * 0.01);
    m.lookAt(m.position.clone().add(f.normal));
    this.markers.add(m);
    return m;
  }

  addPad(fi, color = 0x6c7a89) {
    const f = this.faceMeshes[fi].userData;
    const s = this.size * 0.45;
    const g = new THREE.Group();
    const pad = new THREE.Mesh(new THREE.BoxGeometry(s, s, this.size * 0.08), new THREE.MeshLambertMaterial({ color }));
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(this.size * 0.04, this.size * 0.04, this.size * 0.5), new THREE.MeshLambertMaterial({ color: 0xe07a2f }));
    rod.rotation.x = Math.PI / 2;
    rod.position.z = this.size * 0.29;
    g.add(pad, rod);
    g.position.copy(f.center).addScaledVector(f.normal, this.size * 0.05);
    g.lookAt(g.position.clone().add(f.normal));
    this.markers.add(g);
    return g;
  }

  clearMarkers() {
    this.markers.children.slice().forEach((m) => {
      this.markers.remove(m);
      m.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } });
    });
  }

  faceRelation(a, b) {
    const na = this.faceMeshes[a].userData.normal, nb = this.faceMeshes[b].userData.normal;
    const d = na.dot(nb);
    if (a === b) return 'same';
    if (d < -0.99) return 'parallel';
    if (Math.abs(d) < 0.01) return 'perp';
    return 'other';
  }
}

export function cylinderBetween(a, b, r, mat) {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r, r, len, 8);
  const m = new THREE.Mesh(g, mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return m;
}

export { THREE };
