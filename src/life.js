// Leben in der Welt: Autos auf dem echten Strassennetz, Fussgänger auf Gehwegen und Fusswegen,
// Boote auf den Seen, Schwäne auf der Reuss, Vogelschwärme. Alles instanziert (wenige Draw-Calls).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const lifeTime = { value: 0 };   // gemeinsame Zeit für Wind, Flügelschlag, Wolkenschatten

const rnd = (() => { let s = 12345; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
const pick = (a) => a[Math.floor(rnd() * a.length)];

function colored(geo, hex) {
  const c = new THREE.Color(hex), n = geo.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo.toNonIndexed ? geo : geo;
}
const box = (w, h, d, x, y, z, hex) => colored(new THREE.BoxGeometry(w, h, d).translate(x, y, z).toNonIndexed(), hex);
const cyl = (r0, r1, h, x, y, z, hex, seg = 8) => colored(new THREE.CylinderGeometry(r0, r1, h, seg).translate(x, y, z).toNonIndexed(), hex);
const sph = (r, x, y, z, hex, sx = 1, sy = 1, sz = 1) => colored(new THREE.SphereGeometry(r, 10, 7).scale(sx, sy, sz).translate(x, y, z).toNonIndexed(), hex);
const clean = (g) => { for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k); return g; };
const merge = (list) => mergeGeometries(list.map(clean));

// ---------- Modelle (Fahrtrichtung +z, Boden y = 0)
function carGeos() {
  // lackierte Teile (Farbe je Instanz) und dunkle Teile (Scheiben, Räder, Stossstangen)
  const paint = merge([box(1.78, 0.62, 4.25, 0, 0.62, 0, 0xffffff), box(1.6, 0.12, 2.0, 0, 1.45, -0.25, 0xffffff)]);
  const dark = merge([
    box(1.62, 0.5, 2.1, 0, 1.17, -0.25, 0x1b2228), box(1.8, 0.18, 0.12, 0, 0.42, 2.12, 0x222222), box(1.8, 0.18, 0.12, 0, 0.42, -2.12, 0x222222),
    ...[[-0.8, 1.35], [0.8, 1.35], [-0.8, -1.35], [0.8, -1.35]].map(([x, z]) => colored(new THREE.CylinderGeometry(0.33, 0.33, 0.24, 12).rotateZ(Math.PI / 2).translate(x, 0.33, z).toNonIndexed(), 0x111111)),
    box(0.3, 0.12, 0.05, -0.6, 0.72, 2.13, 0xfff6d8), box(0.3, 0.12, 0.05, 0.6, 0.72, 2.13, 0xfff6d8),
    box(0.3, 0.12, 0.05, -0.65, 0.75, -2.13, 0xb01010), box(0.3, 0.12, 0.05, 0.65, 0.75, -2.13, 0xb01010),
  ]);
  return { paint, dark };
}
function personGeos() {
  const cloth = merge([box(0.42, 0.62, 0.24, 0, 1.12, 0, 0xffffff), box(0.12, 0.55, 0.12, -0.27, 1.1, 0, 0xffffff), box(0.12, 0.55, 0.12, 0.27, 1.1, 0, 0xffffff)]);
  const rest = merge([box(0.16, 0.82, 0.16, -0.1, 0.41, 0, 0x2b3346), box(0.16, 0.82, 0.16, 0.1, 0.41, 0, 0x2b3346), sph(0.12, 0, 1.6, 0, 0xd9a988, 1, 1.15, 1), sph(0.125, 0, 1.66, -0.01, 0x3a2a1c, 1, 0.8, 1)]);
  return { cloth, rest };
}
function boatGeos(sail) {
  const shape = new THREE.Shape();
  const L = sail ? 8 : 7, W = sail ? 2.6 : 2.4;
  shape.moveTo(-W / 2, -L / 2); shape.lineTo(W / 2, -L / 2); shape.lineTo(W / 2, L * 0.15); shape.quadraticCurveTo(W / 2, L * 0.4, 0, L / 2);
  shape.quadraticCurveTo(-W / 2, L * 0.4, -W / 2, L * 0.15); shape.lineTo(-W / 2, -L / 2);
  const hull = colored(new THREE.ExtrudeGeometry(shape, { depth: 0.9, bevelEnabled: false }).rotateX(-Math.PI / 2).translate(0, -0.3, 0).toNonIndexed(), 0xf4f4f0);
  const parts = [hull, box(W - 0.2, 0.06, L - 1.2, 0, 0.62, -0.3, 0xa77a4f)];
  if (sail) {
    parts.push(cyl(0.06, 0.06, 10, 0, 5.6, 0.6, 0xdddddd, 6));
    const s = new THREE.BufferGeometry();
    s.setAttribute('position', new THREE.Float32BufferAttribute([0, 1.2, 0.7, 0, 10.2, 0.7, 0, 1.2, -3.2, 0, 1.2, 0.7, 0, 1.2, -3.2, 0, 10.2, 0.7], 3));
    s.computeVertexNormals();
    parts.push(colored(s, 0xfafafa));
  } else {
    parts.push(box(W - 0.6, 1.1, 2.2, 0, 1.15, -0.4, 0xffffff), box(W - 0.55, 0.45, 2.3, 0, 1.45, -0.4, 0x24323c));
  }
  return merge(parts);
}
function swanGeo() {
  return merge([sph(0.55, 0, 0.25, 0, 0xf6f6f2, 0.75, 0.55, 1.2), cyl(0.07, 0.09, 0.75, 0, 0.75, 0.45, 0xf6f6f2, 6),
    sph(0.11, 0, 1.12, 0.55, 0xf6f6f2, 1, 0.9, 1.4), colored(new THREE.ConeGeometry(0.05, 0.16, 6).rotateX(Math.PI / 2).translate(0, 1.1, 0.75).toNonIndexed(), 0xe0701c)]);
}
function birdGeo() {
  const g = new THREE.BufferGeometry();
  // Körper + zwei Flügel (die Flügelspitzen werden im Shader bewegt: |x| > 0.1)
  g.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, 0.35, -0.08, 0, -0.3, 0.08, 0, -0.3,
    0, 0, 0.12, -0.6, 0, -0.05, 0, 0, -0.12,
    0, 0, 0.12, 0, 0, -0.12, 0.6, 0, -0.05,
  ], 3));
  g.computeVertexNormals();
  return g;
}

function vcMat(extra = {}) { return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.0, ...extra }); }

// ---------- Wege: Polylinien mit Höhen, verknüpft an gemeinsamen Endpunkten
function buildNet(lines, ground, step = 6) {
  const paths = [];
  const nodes = new Map();
  const key = (x, z) => `${Math.round(x / 1.5)},${Math.round(z / 1.5)}`;
  for (const ln of lines) {
    const raw = ln.pts;
    const pts = [];
    for (let i = 0; i + 3 < raw.length + 2 && i + 1 < raw.length; i += 2) {
      const ax = raw[i], az = raw[i + 1];
      if (i + 3 < raw.length) {
        const bx = raw[i + 2], bz = raw[i + 3], d = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(d / step));
        for (let k = 0; k < n; k++) pts.push([ax + (bx - ax) * k / n, az + (bz - az) * k / n]);
      } else pts.push([ax, az]);
    }
    if (pts.length < 2) continue;
    const P = [], cum = [0];
    let ok = true;
    for (const [x, z] of pts) { const y = ground(x, z); if (y === null) { ok = false; break; } P.push(new THREE.Vector3(x, y, z)); }
    if (!ok) continue;
    for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i].x - P[i - 1].x, P[i].z - P[i - 1].z));
    if (cum.at(-1) < 4) continue;
    const p = { ...ln, P, cum, len: cum.at(-1), id: paths.length };
    paths.push(p);
    for (const [end, pt] of [[0, P[0]], [1, P.at(-1)]]) {
      const k = key(pt.x, pt.z);
      if (!nodes.has(k)) nodes.set(k, []);
      nodes.get(k).push([p.id, end]);
    }
  }
  return { paths, nodes, key };
}

function sample(path, s, out, dirOut) {
  const c = path.cum;
  let lo = 0, hi = c.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c[m] <= s) lo = m; else hi = m; }
  const a = path.P[lo], b = path.P[hi], t = (s - c[lo]) / Math.max(c[hi] - c[lo], 1e-6);
  out.lerpVectors(a, b, THREE.MathUtils.clamp(t, 0, 1));
  dirOut.set(b.x - a.x, 0, b.z - a.z).normalize();
}

// Agent folgt dem Netz; am Ende geht es auf einem verbundenen Weg weiter (sonst umdrehen)
function advance(net, a, dt) {
  a.s += a.dir * a.speed * dt;
  const p = net.paths[a.path];
  if (a.s >= 0 && a.s <= p.len) return;
  const atEnd = a.s > p.len ? 1 : 0;
  const pt = atEnd ? p.P.at(-1) : p.P[0];
  const opts = (net.nodes.get(net.key(pt.x, pt.z)) || []).filter(([id]) => id !== a.path && (!a.filter || a.filter(net.paths[id])));
  if (opts.length) {
    const [id, end] = pick(opts);
    a.path = id; a.dir = end === 0 ? 1 : -1; a.s = end === 0 ? 0.01 : net.paths[id].len - 0.01;
  } else { a.dir *= -1; a.s = THREE.MathUtils.clamp(a.s, 0, p.len); }
}

export class Life {
  constructor({ scene, world, level, water, waterMask, quality }) {
    this.scene = scene; this.group = new THREE.Group(); this.group.name = 'life';
    scene.add(this.group);
    this.quality = quality; this.level = level; this.world = world;
    this.water = water; this.waterMask = waterMask;
    this.tmp = { p: new THREE.Vector3(), d: new THREE.Vector3(), m: new THREE.Matrix4(), q: new THREE.Quaternion(), s: new THREE.Vector3(1, 1, 1), e: new THREE.Euler() };
  }

  async init(dir) {
    const small = !!this.quality.smallTex;
    const g = (x, z) => this.world.groundHeight(x, z);
    let net = null;
    try { net = await (await fetch(`${dir}network.json`)).json(); } catch { /* keine Daten */ }
    if (net) {
      this.roads = buildNet(net.roads.map(([c, w, pts, urban]) => ({ c, w, pts, urban })), g, 8);
      const walkLines = [...net.walks.map(([c, pts]) => ({ c, w: 0, pts, side: 0 })),
        ...net.roads.filter((r) => r[3]).map(([c, w, pts]) => ({ c, w, pts, side: 1 }))];
      this.walks = buildNet(walkLines, g, 5);
      this.initStreets(small);
      this.initCars(small ? 70 : 260);
      this.initPeople(small ? 90 : 420);
    }
    this.initWaterLife(small);
    this.initBirds(small);
  }

  // Strassenlaternen und parkierte Autos entlang der Strassen in Siedlungen (statisch)
  initStreets(small) {
    const T = this.tmp, lamps = [], parked = [];
    const urban = this.roads.paths.filter((p) => p.urban && ['minor', 'tertiary', 'secondary', 'primary'].includes(p.c));
    for (const p of urban) {
      for (let s = 10, k = 0; s < p.len - 5; s += 28, k++) {
        sample(p, s, T.p, T.d);
        const side = k % 2 ? 1 : -1, off = p.w / 2 + 0.7;
        lamps.push([T.p.x - T.d.z * off * side, T.p.y, T.p.z + T.d.x * off * side, Math.atan2(T.d.x, T.d.z) + (side > 0 ? -Math.PI / 2 : Math.PI / 2)]);
      }
      if (p.c !== 'minor') continue;
      for (let s = 6; s < p.len - 6; s += 6.2) {
        if (rnd() > 0.45) continue;
        sample(p, s, T.p, T.d);
        const side = rnd() < 0.5 ? 1 : -1, off = p.w / 2 - 0.95;
        parked.push([T.p.x - T.d.z * off * side, T.p.y, T.p.z + T.d.x * off * side, Math.atan2(T.d.x, T.d.z) + (rnd() < 0.5 ? Math.PI : 0)]);
      }
    }
    const cap = (a, n) => { while (a.length > n) a.splice(Math.floor(rnd() * a.length), 1); return a; };
    cap(lamps, small ? 300 : 1400); cap(parked, small ? 150 : 900);
    const put = (mesh, list, sc = 1) => { list.forEach(([x, y, z, yaw], i) => { T.p.set(x, y, z); T.e.set(0, yaw, 0); T.q.setFromEuler(T.e); T.s.setScalar(sc); T.m.compose(T.p, T.q, T.s); mesh.setMatrixAt(i, T.m); }); mesh.instanceMatrix.needsUpdate = true; this.group.add(mesh); };
    if (lamps.length) {
      const g = merge([cyl(0.07, 0.1, 6.0, 0, 3.0, 0, 0x30353a, 6), box(0.08, 0.08, 1.4, 0, 5.95, 0.65, 0x30353a), box(0.36, 0.14, 0.6, 0, 5.88, 1.25, 0x2a2e33), box(0.3, 0.03, 0.5, 0, 5.8, 1.25, 0xfff3d0)]);
      const m = new THREE.InstancedMesh(g, vcMat({ roughness: 0.5, metalness: 0.4 }), lamps.length);
      m.castShadow = true; put(m, lamps);
    }
    if (parked.length) {
      const { paint, dark } = carGeos();
      const COLORS = [0xf2f2f2, 0x111316, 0x8d9399, 0x2b3f6b, 0x7a1b1b, 0xc9ccd0, 0x3c4a3c, 0x1f5f8f, 0xd8d2c0, 0x5c5f63];
      const mp = new THREE.InstancedMesh(paint, vcMat({ roughness: 0.28, metalness: 0.5 }), parked.length);
      const md = new THREE.InstancedMesh(dark, vcMat({ roughness: 0.25, metalness: 0.2 }), parked.length);
      for (let i = 0; i < parked.length; i++) mp.setColorAt(i, new THREE.Color(pick(COLORS)));
      mp.castShadow = md.castShadow = true;
      put(mp, parked); put(md, parked);
    }
  }

  initCars(max) {
    const net = this.roads;
    const usable = net.paths.filter((p) => !['service', 'track'].includes(p.c));
    const total = usable.reduce((a, p) => a + p.len, 0);
    const n = Math.min(max, Math.floor(total / 55));
    if (!n) return;
    const { paint, dark } = carGeos();
    const mp = new THREE.InstancedMesh(paint, vcMat({ roughness: 0.28, metalness: 0.5 }), n);
    const md = new THREE.InstancedMesh(dark, vcMat({ roughness: 0.25, metalness: 0.2 }), n);
    const COLORS = [0xf2f2f2, 0x111316, 0x8d9399, 0x2b3f6b, 0x7a1b1b, 0xc9ccd0, 0x3c4a3c, 0x1f5f8f, 0xd8d2c0, 0x5c5f63];
    this.cars = [];
    for (let i = 0; i < n; i++) {
      const p = pick(usable);
      this.cars.push({ path: p.id, s: rnd() * p.len, dir: rnd() < 0.5 ? 1 : -1, speed: (p.c === 'motorway' ? 24 : p.c === 'primary' || p.c === 'trunk' ? 13 : 9) * (0.8 + 0.4 * rnd()),
        len: 1 + (rnd() < 0.15 ? 0.25 : 0), filter: (q) => !['service', 'track'].includes(q.c) });
      mp.setColorAt(i, new THREE.Color(pick(COLORS)));
    }
    for (const m of [mp, md]) { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; this.group.add(m); }
    this.carMeshes = [mp, md];
  }

  initPeople(max) {
    const net = this.walks;
    const total = net.paths.reduce((a, p) => a + p.len, 0);
    const n = Math.min(max, Math.floor(total / 25));
    if (!n) return;
    const { cloth, rest } = personGeos();
    const mc = new THREE.InstancedMesh(cloth, vcMat({ roughness: 0.8 }), n);
    const mr = new THREE.InstancedMesh(rest, vcMat({ roughness: 0.8 }), n);
    const COLORS = [0xb33a3a, 0x2f5f9e, 0xe8e0d0, 0x2d2d2d, 0x5e7d3c, 0xd99a2b, 0x7b4f9e, 0x9aa3ab, 0x1f3550, 0xc46f8a];
    this.people = [];
    for (let i = 0; i < n; i++) {
      const p = pick(net.paths);
      this.people.push({ path: p.id, s: rnd() * p.len, dir: rnd() < 0.5 ? 1 : -1, speed: 1.0 + 0.6 * rnd(), off: (rnd() < 0.5 ? -1 : 1), ph: rnd() * 6.28, h: 0.92 + 0.16 * rnd() });
      mc.setColorAt(i, new THREE.Color(pick(COLORS)));
    }
    for (const m of [mc, mr]) { m.castShadow = true; m.frustumCulled = false; this.group.add(m); }
    this.pMeshes = [mc, mr];
  }

  // Wasserflächen aus der Maske (R = Wasser, G = Uferabstand)
  waterAt(x, z) {
    const M = this.waterMask;
    if (!M) return [0, 0];
    const u = (x - M.x0) / M.size, v = (z - M.z0) / M.size;
    if (u < 0 || v < 0 || u >= 1 || v >= 1) return [0, 0];
    const i = (Math.floor(v * M.h) * M.w + Math.floor(u * M.w)) * 4;
    return [M.data[i] / 255, M.data[i + 1] / 255];
  }

  randomWater(minShore, near = null, radius = 0) {
    for (let k = 0; k < 400; k++) {
      const M = this.waterMask;
      const x = near ? near.x + (rnd() * 2 - 1) * radius : M.x0 + rnd() * M.size;
      const z = near ? near.z + (rnd() * 2 - 1) * radius : M.z0 + rnd() * M.size;
      const [w, sh] = this.waterAt(x, z);
      if (w > 0.9 && sh >= minShore) return new THREE.Vector3(x, 0, z);
    }
    return null;
  }

  initWaterLife(small) {
    if (!this.water || !this.waterMask) return;
    const wy = this.water.position.y;
    this.wy = wy;
    const id = this.level.id;
    const nBoats = small ? 4 : id === 'chillon' ? 22 : id === 'luzern' ? 12 : 0;
    this.boats = [];
    if (nBoats) {
      const sail = new THREE.InstancedMesh(boatGeos(true), vcMat({ side: THREE.DoubleSide, roughness: 0.5 }), nBoats);
      const motor = new THREE.InstancedMesh(boatGeos(false), vcMat({ roughness: 0.4 }), nBoats);
      // Kielwasser: heller, auslaufender Streifen hinter dem Boot
      const wc = document.createElement('canvas'); wc.width = 64; wc.height = 256;
      const g2 = wc.getContext('2d');
      const grd = g2.createLinearGradient(0, 0, 0, 256); grd.addColorStop(0, 'rgba(255,255,255,0.85)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
      g2.fillStyle = grd; g2.beginPath(); g2.moveTo(26, 0); g2.lineTo(38, 0); g2.lineTo(64, 256); g2.lineTo(0, 256); g2.fill();
      for (let i = 0; i < 400; i++) { g2.fillStyle = `rgba(0,0,0,${0.25 * Math.random()})`; g2.globalCompositeOperation = 'destination-out'; g2.fillRect(Math.random() * 64, Math.random() * 256, 3, 3); }
      const wake = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, -0.5),
        new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(wc), transparent: true, depthWrite: false, opacity: 0.7 }), nBoats);
      for (let i = 0; i < nBoats; i++) {
        const p = this.randomWater(0.35);
        if (!p) continue;
        this.boats.push({ p, yaw: rnd() * 6.28, speed: 0, max: 2.5 + rnd() * 4, sail: rnd() < 0.5, target: this.randomWater(0.35) });
      }
      for (const m of [sail, motor, wake]) { m.frustumCulled = false; this.group.add(m); }
      sail.castShadow = motor.castShadow = true;
      this.boatMeshes = { sail, motor, wake };
    }
    // Schwäne in Ufernähe beim Wahrzeichen (Luzern: Reuss bei der Kapellbrücke)
    const lm = this.level.landmarkPos;
    const nSw = id === 'luzern' ? 16 : id === 'aarau' ? 6 : id === 'chillon' ? 8 : 0;
    this.swans = [];
    if (nSw && lm) {
      const m = new THREE.InstancedMesh(swanGeo(), vcMat({ roughness: 0.9 }), nSw);
      for (let i = 0; i < nSw; i++) {
        const p = this.randomWater(0.02, lm, 220);
        if (p) this.swans.push({ p, yaw: rnd() * 6.28, ph: rnd() * 6.28, home: p.clone() });
      }
      m.frustumCulled = false; m.castShadow = true; this.group.add(m); this.swanMesh = m;
    }
  }

  initBirds(small) {
    const lm = this.level.landmarkPos || new THREE.Vector3();
    const alpine = this.level.id === 'matterhorn';
    const flocks = small ? 2 : 4, per = small ? 8 : 14;
    const n = flocks * per;
    const geo = birdGeo();
    const ph = new Float32Array(n);
    for (let i = 0; i < n; i++) ph[i] = rnd() * 6.28;
    geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(ph, 1));
    const mat = new THREE.MeshStandardMaterial({ color: alpine ? 0x1a1a1a : 0xf2f2ee, roughness: 0.8, side: THREE.DoubleSide });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = lifeTime;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;\nattribute float aPhase;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n  float fl = sin(uTime * 9.0 + aPhase);\n  transformed.y += fl * abs(position.x) * 0.9;\n  transformed.x *= 1.0 - 0.15 * abs(fl);');
    };
    const m = new THREE.InstancedMesh(geo, mat, n);
    m.frustumCulled = false; this.group.add(m); this.birdMesh = m;
    this.birds = [];
    for (let f = 0; f < flocks; f++) {
      const c = new THREE.Vector3(lm.x + (rnd() * 2 - 1) * 500, lm.y + (alpine ? 300 + rnd() * 500 : 25 + rnd() * 50), lm.z + (rnd() * 2 - 1) * 500);
      const R = 40 + rnd() * 120, w = (0.1 + rnd() * 0.12) * (rnd() < 0.5 ? 1 : -1);
      for (let i = 0; i < per; i++) this.birds.push({ c, R: R + (rnd() * 2 - 1) * 12, w, a: rnd() * 0.6, dy: (rnd() * 2 - 1) * 6, sc: alpine ? 0.9 : 1.2, ph: rnd() * 6.28 });
    }
  }

  update(dt, camPos) {
    lifeTime.value += dt;
    const T = this.tmp, t = lifeTime.value;
    const place = (mesh, i, pos, yaw, sc = 1, pitch = 0, roll = 0) => {
      T.e.set(pitch, yaw, roll, 'YXZ'); T.q.setFromEuler(T.e); T.s.setScalar(sc);
      T.m.compose(pos, T.q, T.s); mesh.setMatrixAt(i, T.m);
    };
    if (this.cars) {
      const [mp, md] = this.carMeshes;
      this.cars.forEach((c, i) => {
        advance(this.roads, c, dt);
        const p = this.roads.paths[c.path];
        sample(p, c.s, T.p, T.d);
        if (c.dir < 0) T.d.negate();
        const lane = Math.max(1.3, p.w * 0.25);
        T.p.x += -T.d.z * -lane; T.p.z += T.d.x * -lane;   // Rechtsverkehr
        const yaw = Math.atan2(T.d.x, T.d.z);
        place(mp, i, T.p, yaw, c.len); place(md, i, T.p, yaw, c.len);
      });
      mp.instanceMatrix.needsUpdate = md.instanceMatrix.needsUpdate = true;
    }
    if (this.people) {
      const [mc, mr] = this.pMeshes;
      this.people.forEach((h, i) => {
        advance(this.walks, h, dt);
        const p = this.walks.paths[h.path];
        sample(p, h.s, T.p, T.d);
        if (h.dir < 0) T.d.negate();
        const off = p.side ? (p.w / 2 + 1.0) * h.off : 0.4 * h.off;
        T.p.x += -T.d.z * off; T.p.z += T.d.x * off;
        T.p.y += Math.abs(Math.sin(t * 6 * h.speed + h.ph)) * 0.05;
        const yaw = Math.atan2(T.d.x, T.d.z);
        place(mc, i, T.p, yaw, h.h); place(mr, i, T.p, yaw, h.h);
      });
      mc.instanceMatrix.needsUpdate = mr.instanceMatrix.needsUpdate = true;
    }
    if (this.boats?.length) {
      const { sail, motor, wake } = this.boatMeshes;
      const hidden = new THREE.Vector3(0, -1e4, 0);
      this.boats.forEach((b, i) => {
        if (!b.target || b.p.distanceTo(b.target) < 30) b.target = this.randomWater(0.35);
        if (b.target) {
          const want = Math.atan2(b.target.x - b.p.x, b.target.z - b.p.z);
          let d = want - b.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
          b.yaw += THREE.MathUtils.clamp(d, -0.15 * dt, 0.15 * dt);
          b.speed += (b.max * (Math.abs(d) > 1 ? 0.4 : 1) - b.speed) * Math.min(1, dt * 0.3);
        }
        const nx = b.p.x + Math.sin(b.yaw) * b.speed * dt, nz = b.p.z + Math.cos(b.yaw) * b.speed * dt;
        if (this.waterAt(nx, nz)[0] > 0.8) { b.p.x = nx; b.p.z = nz; } else { b.yaw += Math.PI * 0.5; b.target = this.randomWater(0.35); }
        T.p.set(b.p.x, this.wy + 0.05 + Math.sin(t * 1.3 + i) * 0.06, b.p.z);
        const roll = Math.sin(t * 0.9 + i * 2) * (b.sail ? 0.06 : 0.025) + (b.sail ? 0.12 : 0);
        place(sail, i, b.sail ? T.p : hidden, b.yaw, 1, Math.sin(t * 1.1 + i) * 0.02, roll);
        place(motor, i, b.sail ? hidden : T.p, b.yaw, 1, Math.sin(t * 1.1 + i) * 0.02 - 0.03, roll);
        // Kielwasser hinter dem Heck, Länge mit der Geschwindigkeit
        T.p.set(b.p.x - Math.sin(b.yaw) * 3.5, this.wy + 0.08, b.p.z - Math.cos(b.yaw) * 3.5);
        T.e.set(0, b.yaw, 0, 'YXZ'); T.q.setFromEuler(T.e); T.s.set(3 + b.speed * 1.5, 1, 8 + b.speed * 9);
        T.m.compose(T.p, T.q, T.s); wake.setMatrixAt(i, T.m);
      });
      sail.instanceMatrix.needsUpdate = motor.instanceMatrix.needsUpdate = wake.instanceMatrix.needsUpdate = true;
    }
    if (this.swans?.length) {
      this.swans.forEach((s, i) => {
        s.yaw += Math.sin(t * 0.2 + s.ph) * 0.2 * dt;
        const nx = s.p.x + Math.sin(s.yaw) * 0.25 * dt, nz = s.p.z + Math.cos(s.yaw) * 0.25 * dt;
        if (this.waterAt(nx, nz)[0] > 0.9 && Math.hypot(nx - s.home.x, nz - s.home.z) < 60) { s.p.x = nx; s.p.z = nz; } else s.yaw += 1.5 * dt;
        T.p.set(s.p.x, this.wy - 0.02 + Math.sin(t * 1.4 + s.ph) * 0.03, s.p.z);
        place(this.swanMesh, i, T.p, s.yaw, 1.0);
      });
      this.swanMesh.instanceMatrix.needsUpdate = true;
    }
    if (this.birds) {
      this.birds.forEach((b, i) => {
        const a = b.a + t * b.w;
        T.p.set(b.c.x + Math.cos(a) * b.R, b.c.y + b.dy + Math.sin(t * 0.5 + b.ph) * 3, b.c.z + Math.sin(a) * b.R);
        const yaw = Math.atan2(-Math.sin(a) * Math.sign(b.w), Math.cos(a) * Math.sign(b.w));
        place(this.birdMesh, i, T.p, yaw, b.sc, 0, -0.35 * Math.sign(b.w));
      });
      this.birdMesh.instanceMatrix.needsUpdate = true;
    }
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  }
}
