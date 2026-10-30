// Foto aufnehmen und bewerten.
import * as THREE from 'three';
import { isHiddenPoint } from './geo.js';

const DEG = Math.PI / 180;
const clamp01 = (v) => Math.max(0, Math.min(1, v));

export const CRITERIA = [
  { key: 'subject', label: 'Motiv sichtbar' },
  { key: 'framing', label: 'Bildaufbau' },
  { key: 'angle', label: 'Perspektive' },
  { key: 'sharp', label: 'Schärfe' },
  { key: 'light', label: 'Licht' },
];

export function starsFor(score) {
  return score >= 90 ? 3 : score >= 75 ? 2 : score >= 55 ? 1 : 0;
}

// Bild vom Canvas holen (direkt nach dem Rendern aufrufen)
export function grabImage(canvas, blur, maxW = 1280) {
  const w = Math.min(maxW, canvas.width);
  const h = Math.round(canvas.height * (w / canvas.width));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.drawImage(canvas, 0, 0, w, h);
  // Bewegungsunschärfe sichtbar machen
  if (blur > 0.25) {
    const n = 5, off = (blur - 0.2) * w * 0.012;
    g.globalAlpha = 0.28;
    for (let i = 1; i <= n; i++) g.drawImage(canvas, (i / n) * off, (i / n) * off * 0.3, w, h);
    g.globalAlpha = 1;
  }
  const full = c.toDataURL('image/jpeg', 0.88);
  const t = document.createElement('canvas');
  t.width = 320; t.height = Math.round(320 * h / w);
  t.getContext('2d').drawImage(c, 0, 0, t.width, t.height);
  const thumb = t.toDataURL('image/jpeg', 0.75);
  return { full, thumb };
}

function angDiff(a, b) {
  let d = ((a - b) % 360 + 540) % 360 - 180;
  return Math.abs(d);
}

// Bewertet ein Foto gegen einen Auftrag.
// ctx: { camera, subjects: Map(id -> {points, center}), occluders: Object3D[], sunDir, blur, subjectRoots }
export function evaluate(mission, ctx) {
  const subj = ctx.subjects.get(mission.subject);
  if (!subj) return null;
  const cam = ctx.camera;
  const camPos = cam.getWorldPosition(new THREE.Vector3());
  const ray = new THREE.Raycaster();
  ray.firstHitOnly = false;

  let inFrame = 0, visible = 0;
  let minX = 2, minY = 2, maxX = -2, maxY = -2, sx = 0, sy = 0;
  const p = new THREE.Vector3();
  const pts = subj.points;
  for (const wp of pts) {
    p.copy(wp).project(cam);
    if (p.z > 1 || p.z < -1 || Math.abs(p.x) > 1 || Math.abs(p.y) > 1) continue;
    inFrame++;
    // Verdeckung prüfen
    const dir = wp.clone().sub(camPos);
    const dist = dir.length();
    dir.divideScalar(dist);
    ray.set(camPos, dir);
    ray.far = dist - Math.max(1.0, dist * 0.03); // Toleranz bei grossen Distanzen (Berggrate)
    const hits = ray.intersectObjects(ctx.occluders, true);
    const blocked = hits.find((h) => !isPartOf(h.object, subj.root) && !(h.object.userData.isBuilding && isHiddenPoint(h.point)));
    if (blocked) continue;
    visible++;
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    sx += p.x; sy += p.y;
  }
  const n = pts.length;
  const visFrac = visible / n;
  const frameFrac = inFrame / n;

  const s = {};
  // 1) Motiv: wie viel des Motivs ist im Bild und frei sichtbar
  const needed = Math.min(0.95, (mission.coverage ?? 0.7) + 0.15);
  s.subject = 20 * clamp01(visFrac / needed) ** 1.5;

  // 2) Bildaufbau: Füllgrad + Platzierung (Mitte oder Drittel)
  let framing = 0;
  if (visible >= 3) {
    const bw = (maxX - minX) / 2, bh = (maxY - minY) / 2;
    const fill = Math.max(bw, bh);
    const [lo, hi] = mission.fill || [0.35, 0.85];
    // ideal: Mitte des Bereichs; voller Wert nur nahe am Ideal
    const ideal = (lo + hi) / 2, tolF = (hi - lo) / 4;
    const dev = Math.max(0, Math.abs(fill - ideal) - tolF);
    const fillScore = clamp01(1 - dev / (tolF + 0.25)) ** 1.3;
    const cx = sx / visible, cy = sy / visible;
    const anchors = [[0, 0], [-1 / 3, 1 / 3], [1 / 3, 1 / 3], [-1 / 3, -1 / 3], [1 / 3, -1 / 3], [-1 / 3, 0], [1 / 3, 0]];
    let best = 9;
    for (const [ax, ay] of anchors) best = Math.min(best, Math.hypot(cx - ax, cy - ay));
    const placeScore = clamp01(1 - (best - 0.05) / 0.22);
    // abgeschnittenes Motiv kostet
    const cut = frameFrac < 0.97 ? 0.7 + 0.3 * frameFrac ** 4 : 1;
    framing = 20 * (0.55 * fillScore + 0.45 * placeScore) * cut;
  }
  s.framing = framing;

  // 3) Perspektive: Richtung vom Motiv zur Kamera
  const v = camPos.clone().sub(subj.center);
  const horiz = Math.hypot(v.x, v.z);
  const az = ((Math.atan2(v.x, -v.z) / DEG) + 360) % 360; // Kompass, 0 = Kamera nördlich des Motivs
  const el = Math.atan2(v.y, horiz) / DEG;
  let angle = 1;
  if (mission.az) {
    const [c, tol] = mission.az;
    const d = angDiff(az, c);
    angle *= d <= tol ? 1 - 0.15 * (d / tol) ** 2 : clamp01(0.85 - (d - tol) / 20);
  }
  if (mission.elev) {
    const [emin, emax] = mission.elev;
    const d = el < emin ? emin - el : el > emax ? el - emax : 0;
    angle *= clamp01(1 - d / 12);
  }
  if (mission.dist) {
    const dist = v.length();
    const [dmin, dmax] = mission.dist;
    const d = dist < dmin ? (dmin - dist) / dmin : dist > dmax ? (dist - dmax) / dmax : 0;
    angle *= clamp01(1 - d * 2.5);
  }
  s.angle = 20 * angle * (visible >= 3 ? 1 : 0);

  // 4) Schärfe
  s.sharp = 20 * clamp01(1 - ctx.blur) ** 1.5 * (visible >= 3 ? 1 : 0.3);

  // 5) Licht: Gegenlicht kostet (ausser der Auftrag will es)
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.getWorldQuaternion(new THREE.Quaternion()));
  const sunDot = fwd.dot(ctx.sunDir);
  let light = mission.backlight ? clamp01((sunDot + 0.2) / 0.9) : clamp01(1 - Math.max(0, sunDot - 0.15) / 0.75);
  s.light = 20 * light * (visible >= 3 ? 1 : 0.3);

  const total = Math.round(s.subject + s.framing + s.angle + s.sharp + s.light);
  return { total, parts: s, az, el, visFrac };
}

function isPartOf(obj, root) {
  if (!root) return false;
  for (let o = obj; o; o = o.parent) if (o === root) return true;
  return false;
}

// Zufällige Punkte auf den Dreiecken eines Objekts (Weltkoordinaten), gleichmässig nach Fläche
export function samplePoints(root, count = 70, filter = null, minY = -Infinity) {
  const nrm = new THREE.Vector3();
  const tris = [];
  let total = 0;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!o.isMesh || (filter && !filter(o))) return;
    const g = o.geometry, pos = g.attributes.position, idx = g.index;
    const triCount = idx ? idx.count / 3 : pos.count / 3;
    for (let i = 0; i < triCount; i++) {
      const i0 = idx ? idx.getX(i * 3) : i * 3, i1 = idx ? idx.getX(i * 3 + 1) : i * 3 + 1, i2 = idx ? idx.getX(i * 3 + 2) : i * 3 + 2;
      a.fromBufferAttribute(pos, i0).applyMatrix4(o.matrixWorld);
      b.fromBufferAttribute(pos, i1).applyMatrix4(o.matrixWorld);
      c.fromBufferAttribute(pos, i2).applyMatrix4(o.matrixWorld);
      const tri = new THREE.Triangle(a, b, c);
      const area = tri.getArea();
      if (area < 1e-4) continue;
      // Unterseiten und Teile unter Wasser/Boden zählen nicht als Motiv
      if (tri.getNormal(nrm).y < -0.5 || Math.max(a.y, b.y, c.y) < minY) continue;
      total += area;
      tris.push({ a: a.clone(), b: b.clone(), c: c.clone(), cum: total });
    }
  });
  const pts = [];
  if (!tris.length) return pts;
  // deterministischer Zufall
  let seed = 12345;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < count; i++) {
    const r = rnd() * total;
    let lo = 0, hi = tris.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (tris[m].cum < r) lo = m + 1; else hi = m; }
    const t = tris[lo];
    let u = rnd(), v = rnd();
    if (u + v > 1) { u = 1 - u; v = 1 - v; }
    const p = t.a.clone().multiplyScalar(1 - u - v).addScaledVector(t.b, u).addScaledVector(t.c, v);
    // leicht nach aussen versetzen, damit der Punkt nicht in der eigenen Fläche steckt
    pts.push(p);
  }
  return pts;
}
