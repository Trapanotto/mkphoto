// Auftragshilfe: ideale Fotoposition berechnen, 3D-Zielmarke, Randpfeil und Geister-Rahmen.
import * as THREE from 'three';

const DEG = Math.PI / 180;

// Ideale Kameraposition für einen Auftrag
export function idealShot(mission, subj, sunAzDeg, groundAt) {
  const c = subj.center;
  // Ausdehnung horizontal (Rh) und vertikal (Rv)
  let Rh = 2, Rv = 2;
  for (const p of subj.points) { Rh = Math.max(Rh, Math.hypot(p.x - c.x, p.z - c.z)); Rv = Math.max(Rv, Math.abs(p.y - c.y)); }
  const [lo, hi] = mission.fill || [0.35, 0.85];
  const fill = (lo + hi) / 2;
  const tanV = Math.tan(36 * DEG), aspect = Math.max(1, innerWidth / innerHeight);
  const elev0 = mission.elev ? (mission.elev[0] + mission.elev[1]) / 2 : 10;
  let d = elev0 > 60
    ? Rh / (fill * tanV)
    : Math.max(Rh * 0.85 / (fill * tanV * aspect), Rv / (fill * tanV)) + Rh * 0.3;
  if (mission.dist) d = THREE.MathUtils.clamp(d, mission.dist[0] * 1.1, mission.dist[1] * 0.9);
  let az = mission.az ? mission.az[0] : mission.backlight ? sunAzDeg + 180 : sunAzDeg;
  const el = mission.elev ? (mission.elev[0] + mission.elev[1]) / 2 : 10;
  const ce = Math.cos(el * DEG);
  const pos = new THREE.Vector3(
    c.x + d * Math.sin(az * DEG) * ce,
    c.y + d * Math.sin(el * DEG),
    c.z - d * Math.cos(az * DEG) * ce,
  );
  const g = groundAt?.(pos.x, pos.z);
  if (g != null) pos.y = THREE.MathUtils.clamp(pos.y, g + 4, g + 115);
  return { pos, look: c.clone(), dist: d, fill, el, az };
}

// Sichtbarkeit eines Motivs von einer Position aus (Anteil freier Sichtlinien)
function visibility(from, subj, occluders, ray) {
  let vis = 0, n = 0;
  for (let i = 0; i < subj.points.length; i += 3) {
    const p = subj.points[i];
    const dir = p.clone().sub(from);
    const d = dir.length();
    ray.set(from, dir.divideScalar(d));
    ray.far = d - Math.max(1, d * 0.03);
    const hit = ray.intersectObjects(occluders, true).find((h) => !isPartOf(h.object, subj.root));
    if (!hit) vis++;
    n++;
  }
  return n ? vis / n : 0;
}
function isPartOf(o, root) { if (!root) return false; for (let x = o; x; x = x.parent) if (x === root) return true; return false; }

// Wenn die Idealposition verdeckt ist: bessere Position in der Nähe suchen
export function refineShot(mission, subj, shot, groundAt, occluders) {
  const ray = new THREE.Raycaster();
  let best = { shot, v: visibility(shot.pos, subj, occluders, ray) };
  if (best.v > 0.7) return shot;
  const tol = mission.az ? mission.az[1] : 60;
  const els = mission.elev ? [mission.elev[0] + 2, (mission.elev[0] + mission.elev[1]) / 2, mission.elev[1] - 2] : [5, 15, 30];
  for (const da of [-tol, -tol / 2, 0, tol / 2, tol]) {
    for (const k of [0.8, 1.0, 1.3, 1.7]) {
      for (const el of els) {
        const az = shot.az + da, d = shot.dist * k, c = subj.center;
        const pos = new THREE.Vector3(c.x + d * Math.sin(az * DEG) * Math.cos(el * DEG), c.y + d * Math.sin(el * DEG), c.z - d * Math.cos(az * DEG) * Math.cos(el * DEG));
        const g = groundAt?.(pos.x, pos.z);
        if (g != null) pos.y = THREE.MathUtils.clamp(pos.y, g + 4, g + 115);
        const v = visibility(pos, subj, occluders, ray) - Math.abs(da) / 900 - Math.abs(k - 1) * 0.05;
        if (v > best.v) best = { v, shot: { ...shot, pos, az, dist: d, el } };
      }
    }
  }
  return best.shot;
}

export class MissionHelp {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.name = 'help';
    const yellow = new THREE.MeshBasicMaterial({ color: 0xffd400, transparent: true, opacity: 0.85, depthWrite: false, fog: false });
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xffd400, transparent: true, opacity: 0.22, depthWrite: false, fog: false, blending: THREE.AdditiveBlending });
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(2.5, 0.18, 8, 48), yellow);
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 400, 8, 1, true), beamMat);
    this.beam.position.y = -200;
    this.cone = new THREE.Mesh(new THREE.ConeGeometry(0.8, 2.2, 12), yellow);
    this.group.add(this.ring, this.beam, this.cone);
    this.group.visible = false;
    for (const m of this.group.children) m.renderOrder = 10;
    scene.add(this.group);
    this.enabled = true;
    this.target = null;
    this.frame = 0;
    this.el = {
      arrow: document.querySelector('#targetArrow'),
      dist: document.querySelector('#targetDist'),
      box: document.querySelector('#ghostBox'),
      ideal: document.querySelector('#ghostIdeal'),
      ok: document.querySelector('#ghostOk'),
    };
  }

  setTarget(t) {
    this.target = t;
    if (!t) { this.group.visible = false; return; }
    this.group.position.copy(t.pos);
    this.ring.lookAt(t.look);
    const dir = t.look.clone().sub(t.pos).normalize();
    this.cone.position.copy(dir.clone().multiplyScalar(3.2));
    this.cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  }

  hideForPhoto(v) { this.group.visible = !v && this.enabled && !!this.target && (!this.lastCam || this.lastCam.distanceTo(this.target.pos) > 9); }

  // pro Frame: HUD-Elemente aktualisieren
  update(camera, subj, t) {
    const on = this.enabled && this.target;
    this.group.visible = !!on && camera.position.distanceTo(this.target.pos) > 9;
    const { arrow, dist, box, ideal, ok } = this.el;
    if (!on) { arrow.classList.add('hidden'); box.classList.add('hidden'); ideal.classList.add('hidden'); ok.classList.add('hidden'); return; }
    this.ring.rotation.z += 0.01;
    const s = 1 + 0.08 * Math.sin(t * 3);
    this.ring.scale.setScalar(s);
    const camPos = camera.position;
    this.lastCam = camPos;
    const d = camPos.distanceTo(this.target.pos);
    // Pfeil am Bildrand, wenn Ziel ausserhalb
    const p = this.target.pos.clone().project(camera);
    const behind = p.z > 1;
    const inside = !behind && Math.abs(p.x) < 0.9 && Math.abs(p.y) < 0.85;
    if (d > 8 && !inside) {
      let x = p.x, y = p.y;
      if (behind) { x = -x; y = -y; }
      const a = Math.atan2(y, x);
      const r = 0.82;
      const k = Math.min(r / Math.abs(Math.cos(a) || 1e-3), r / Math.abs(Math.sin(a) || 1e-3));
      const sx = (Math.cos(a) * k * 0.5 + 0.5) * innerWidth, sy = (-Math.sin(a) * k * 0.5 + 0.5) * innerHeight;
      arrow.style.transform = `translate(${sx}px, ${sy}px)`;
      arrow.firstElementChild.style.transform = `rotate(${-a}rad)`;
      arrow.classList.remove('hidden');
      dist.textContent = `${Math.round(d)} m`;
    } else arrow.classList.add('hidden');

    // Geister-Rahmen in der Nähe der Zielposition
    const near = d < Math.max(14, this.target.dist * 0.3);
    if (!near || !subj) { box.classList.add('hidden'); ideal.classList.add('hidden'); ok.classList.add('hidden'); return; }
    if (this.frame++ % 3 === 0) {
      let minX = 2, minY = 2, maxX = -2, maxY = -2, n = 0;
      const v = new THREE.Vector3();
      for (let i = 0; i < subj.points.length; i += 2) {
        v.copy(subj.points[i]).project(camera);
        if (v.z > 1) continue;
        minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x);
        minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
        n++;
      }
      if (n > 3) {
        const toPx = (x, y) => [(x * 0.5 + 0.5) * innerWidth, (-y * 0.5 + 0.5) * innerHeight];
        const [x0, y0] = toPx(Math.max(-1, minX), Math.min(1, maxY));
        const [x1, y1] = toPx(Math.min(1, maxX), Math.max(-1, minY));
        Object.assign(box.style, { left: `${x0}px`, top: `${y0}px`, width: `${x1 - x0}px`, height: `${y1 - y0}px` });
        box.classList.remove('hidden');
        // Idealrahmen: gleiches Seitenverhältnis, Grösse = Ziel-Füllgrad, Bildmitte
        const fill = this.target.fill;
        const bw = (maxX - minX) / 2, bh = (maxY - minY) / 2;
        const sc = fill / Math.max(bw, bh, 1e-3);
        const hw = bw * sc * innerWidth / 2, hh = bh * sc * innerHeight / 2;
        Object.assign(ideal.style, { left: `${innerWidth / 2 - hw}px`, top: `${innerHeight / 2 - hh}px`, width: `${2 * hw}px`, height: `${2 * hh}px` });
        ideal.classList.remove('hidden');
        const match = Math.abs(Math.max(bw, bh) - fill) < 0.12 && Math.abs((minX + maxX) / 2) < 0.2 && Math.abs((minY + maxY) / 2) < 0.2;
        box.classList.toggle('good', match);
        ok.classList.toggle('hidden', !match);
      }
    }
  }

  dispose(scene) { scene.remove(this.group); }
}
