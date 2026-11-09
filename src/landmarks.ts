import * as THREE from 'three';
import { ObstacleIndex, Strip, Tower } from './obstacles';
import { addHull } from './outline';
import { striped, toon } from './toon';

/** A point on a landmark used to judge photos. Points with a normal only count from the side they face. */
export interface SubjectPoint {
  p: THREE.Vector3;
  n?: THREE.Vector3;
}

export interface Landmark {
  id: string;
  name: string;
  box: THREE.Box3;
  points: SubjectPoint[];
}

/**
 * Centre line of the Kapellbrücke from swissTLM3D (LV95, converted to game metres:
 * x = east, z = south, origin at the bridge middle).
 */
const BRIDGE_PATH: [number, number][] = [
  [58.3, -75.4],
  [-12.3, 29.3],
  [-57.3, 62.9],
  [-55.4, 74.4],
];
const DECK = 1.8;
const HALF_WIDTH = 2.5;
const EAVES = DECK + 2.7;
const RIDGE = DECK + 4.6;

/** Wasserturm: octagonal stone tower in the Reuss, position from the SWISSIMAGE orthophoto. */
const TOWER = { x: -7, z: 38, radius: 6.2, wallTop: 26, roofRadius: 7.2, roofTop: 34.5 };

const WOOD = '#8a5a34';
const WOOD_DARK = '#5e3b22';
const FLOWER_COLORS = ['#e0283a', '#ff4d6d', '#c81d3a', '#e0283a', '#ff7aa8', '#d42a4a', '#f2f2f2'];
const PAINT_COLORS = ['#c9a25a', '#a8804a', '#7d8a9a', '#b59060', '#8a6a4a'];

type Materials = Record<'wood' | 'woodDark' | 'boards' | 'deck' | 'roof' | 'ridge' | 'leaves' | 'flowers' | 'painting' | 'glow' | 'iron', THREE.Material>;

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3();
const tmpP = new THREE.Vector3();
const tmpE = new THREE.Euler();

/** InstancedMesh filled from a list of [x, y, z, rotX, rotY, rotZ, sx, sy, sz]. */
function instances(geo: THREE.BufferGeometry, mat: THREE.Material, list: number[][], colors?: string[]) {
  const mesh = new THREE.InstancedMesh(geo, mat, list.length);
  list.forEach(([x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1], i) => {
    tmpM.compose(tmpP.set(x, y, z), tmpQ.setFromEuler(tmpE.set(rx, ry, rz)), tmpS.set(sx, sy, sz));
    mesh.setMatrixAt(i, tmpM);
    if (colors) mesh.setColorAt(i, new THREE.Color(colors[i % colors.length]));
  });
  return mesh;
}

/** Triangle in the x = 0 plane: base at y = 0 from z = -w/2 to w/2, tip at height h. */
function triangle(w: number, h: number) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -w / 2, 0, 0, w / 2, 0, h, 0], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0.5, 1], 2));
  g.computeVertexNormals();
  return g;
}

/**
 * Triangular gable paintings, drawn once into canvases: sky, landscape, a few figures,
 * an inscription band and a dark wooden frame. Several variants so neighbours differ.
 */
function paintingTextures(count: number, rand: () => number) {
  const skies = [['#9fc4dd', '#e8dcb8'], ['#c9b37a', '#efe2c0'], ['#7f9fb8', '#d9cfae'], ['#d8a86a', '#f0dcb0']];
  const robes = ['#8a2a1e', '#2e4a7a', '#3f6a3a', '#a07a2a', '#5a3a6a', '#e8e0d0'];
  const out: THREE.CanvasTexture[] = [];
  for (let v = 0; v < count; v++) {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 128;
    const g = c.getContext('2d')!;
    const tri = () => {
      g.beginPath();
      g.moveTo(0, 128);
      g.lineTo(256, 128);
      g.lineTo(128, 0);
      g.closePath();
    };
    g.save();
    tri();
    g.clip();
    const [top, bottom] = skies[v % skies.length];
    const sky = g.createLinearGradient(0, 0, 0, 128);
    sky.addColorStop(0, top);
    sky.addColorStop(1, bottom);
    g.fillStyle = sky;
    g.fillRect(0, 0, 256, 128);
    // hills and a town on the horizon
    g.fillStyle = '#6f8a5a';
    g.beginPath();
    g.moveTo(0, 100);
    for (let x = 0; x <= 256; x += 16) g.lineTo(x, 88 + Math.sin(x * 0.05 + v) * 6 + rand() * 4);
    g.lineTo(256, 128);
    g.lineTo(0, 128);
    g.fill();
    g.fillStyle = '#b8a07a';
    for (let i = 0; i < 6; i++) g.fillRect(60 + i * 22 + rand() * 6, 78 + rand() * 6, 10, 14);
    g.fillStyle = '#8a4a32';
    for (let i = 0; i < 6; i++) {
      const x = 60 + i * 22;
      g.beginPath();
      g.moveTo(x - 2, 80);
      g.lineTo(x + 6, 70);
      g.lineTo(x + 14, 80);
      g.fill();
    }
    // figures: robe, head, a halo for the saint in the middle
    const n = 3 + Math.floor(rand() * 3);
    for (let i = 0; i < n; i++) {
      const x = 128 + (i - (n - 1) / 2) * 30 + (rand() - 0.5) * 6;
      const h = 34 + rand() * 10;
      g.fillStyle = robes[Math.floor(rand() * robes.length)];
      g.beginPath();
      g.moveTo(x - 9, 112);
      g.lineTo(x + 9, 112);
      g.lineTo(x + 4, 112 - h);
      g.lineTo(x - 4, 112 - h);
      g.fill();
      g.fillStyle = '#e8c4a0';
      g.beginPath();
      g.arc(x, 106 - h, 5, 0, Math.PI * 2);
      g.fill();
      if (i === Math.floor(n / 2)) {
        g.strokeStyle = '#e8c040';
        g.lineWidth = 2;
        g.beginPath();
        g.arc(x, 106 - h, 8, 0, Math.PI * 2);
        g.stroke();
      }
    }
    // inscription band with lines of writing
    g.fillStyle = '#efe6cc';
    g.fillRect(0, 112, 256, 16);
    g.fillStyle = '#3a2a1a';
    for (let x = 30; x < 226; x += 7 + rand() * 6) g.fillRect(x, 117, 3 + rand() * 4, 5);
    g.restore();
    // dark frame along the three edges
    g.strokeStyle = '#3a2416';
    g.lineWidth = 9;
    tri();
    g.stroke();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    out.push(tex);
  }
  return out;
}

let paintMats: THREE.MeshToonMaterial[] | null = null;
/** Six painted variants, shared by all bridge sections. */
function paintingMaterials() {
  if (!paintMats) {
    let seed = 5;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    paintMats = paintingTextures(6, rand).map((map) => {
      const m = toon('#ffffff');
      m.map = map;
      m.side = THREE.DoubleSide;
      return m;
    });
  }
  return paintMats;
}

function bridgeSection(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  materials: Materials,
  ends: { start: boolean; end: boolean },
  rand: () => number,
) {
  const length = Math.hypot(bx - ax, bz - az) + 0.6; // small overlap at the kinks
  const g = new THREE.Group();
  g.position.set((ax + bx) / 2, 0, (az + bz) / 2);
  g.rotation.y = Math.atan2(-(bz - az), bx - ax); // local +x along the bridge

  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, hull = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    if (hull) addHull(m, hull);
    g.add(m);
    return m;
  };

  // deck, plank walls with a hand rail, flower boxes outside, eaves beams
  add(new THREE.BoxGeometry(length, 0.35, HALF_WIDTH * 2), materials.deck, 0, DECK - 0.175, 0, 0.04);
  for (const side of [-1, 1]) {
    add(new THREE.BoxGeometry(length, 1.0, 0.16), materials.boards, 0, DECK + 0.5, side * (HALF_WIDTH - 0.08), 0.03);
    add(new THREE.BoxGeometry(length, 0.08, 0.26), materials.woodDark, 0, DECK + 1.04, side * (HALF_WIDTH - 0.08));
    add(new THREE.BoxGeometry(length, 0.28, 0.38), materials.leaves, 0, DECK + 0.72, side * (HALF_WIDTH + 0.2));
    add(new THREE.BoxGeometry(length, 0.2, 0.2), materials.woodDark, 0, EAVES - 0.1, side * (HALF_WIDTH - 0.1));
  }
  // brackets under the flower boxes
  const brackets: number[][] = [];
  for (let x = -length / 2 + 0.6; x < length / 2; x += 1.2) {
    for (const side of [-1, 1]) brackets.push([x, DECK + 0.42, side * (HALF_WIDTH + 0.12), side * 0.7, 0, 0]);
  }
  g.add(instances(new THREE.BoxGeometry(0.06, 0.4, 0.07), materials.woodDark, brackets));

  // geraniums: two rows of small blooms in mixed reds along both flower boxes
  const blooms: number[][] = [];
  const bloomColors: string[] = [];
  for (const side of [-1, 1]) {
    for (let x = -length / 2 + 0.2; x < length / 2 - 0.2; x += 0.26) {
      for (const row of [-0.1, 0.1]) {
        const s = 0.75 + rand() * 0.6;
        blooms.push([x + rand() * 0.1, DECK + 0.9 + rand() * 0.08, side * (HALF_WIDTH + 0.2 + row), 0, rand() * 3, 0, s, s * 0.8, s]);
        bloomColors.push(FLOWER_COLORS[Math.floor(rand() * FLOWER_COLORS.length)]);
      }
      // trailing leaves hanging over the edge
      if (rand() < 0.5) {
        blooms.push([x, DECK + 0.52, side * (HALF_WIDTH + 0.42), 0, 0, 0, 1.3, 1.6, 1.3]);
        bloomColors.push('#3f7a2e');
      }
    }
  }
  g.add(instances(new THREE.IcosahedronGeometry(0.11, 0), materials.flowers, blooms, bloomColors));

  // posts, tie beams, rafters and the painted gable boards inside the roof
  const postCount = Math.max(2, Math.floor(length / 2.4));
  const run = HALF_WIDTH + 0.5;
  const rise = RIDGE - EAVES;
  const slope = Math.hypot(run, rise);
  const angle = Math.atan2(rise, run);
  const posts: number[][] = [];
  const ties: number[][] = [];
  const rafters: number[][] = [];
  const paintings: number[][] = [];
  const paintColors: string[] = [];
  for (let i = 0; i < postCount; i++) {
    const x = -length / 2 + (i + 0.5) * (length / postCount);
    for (const side of [-1, 1]) {
      posts.push([x, (DECK + 1.0 + EAVES) / 2, side * (HALF_WIDTH - 0.08)]);
      rafters.push([x, (EAVES + RIDGE) / 2 - 0.3, (side * run) / 2, side * angle, 0, 0]);
    }
    ties.push([x, EAVES - 0.05, 0]);
    if (i % 2 === 0) {
      paintings.push([x + 0.05, EAVES + 0.02, 0]);
      paintColors.push(PAINT_COLORS[Math.floor(rand() * PAINT_COLORS.length)]);
    }
  }
  g.add(instances(new THREE.BoxGeometry(0.16, EAVES - DECK - 1.0, 0.16), materials.wood, posts));
  g.add(instances(new THREE.BoxGeometry(0.14, 0.16, HALF_WIDTH * 2), materials.woodDark, ties));
  g.add(instances(new THREE.BoxGeometry(0.12, 0.14, slope), materials.woodDark, rafters));
  const paintGeo = triangle(HALF_WIDTH * 2 - 0.5, rise - 0.5);
  const painted = paintingMaterials();
  painted.forEach((mat, v) => {
    const mine = paintings.filter((_, i) => i % painted.length === v);
    if (mine.length) g.add(instances(paintGeo, mat, mine));
  });
  void paintColors;

  // knee braces from each post up to the eaves beam, along the bridge in both directions
  const knees: number[][] = [];
  const lanterns: number[][] = [];
  const chains: number[][] = [];
  for (let i = 0; i < postCount; i++) {
    const x = -length / 2 + (i + 0.5) * (length / postCount);
    for (const side of [-1, 1]) {
      for (const dir of [-1, 1]) knees.push([x + dir * 0.32, EAVES - 0.42, side * (HALF_WIDTH - 0.08), 0, 0, dir * 0.8]);
    }
    // lanterns hang from every fourth tie beam
    if (i % 4 === 2) {
      lanterns.push([x, EAVES - 0.75, 0]);
      chains.push([x, EAVES - 0.35, 0]);
    }
  }
  g.add(instances(new THREE.BoxGeometry(0.1, 0.9, 0.1), materials.wood, knees));
  g.add(instances(new THREE.CylinderGeometry(0.12, 0.16, 0.34, 6), materials.glow, lanterns));
  g.add(instances(new THREE.CylinderGeometry(0.015, 0.015, 0.5, 4), materials.iron, chains));

  // shingled gable roof: a dark underlay and overlapping rows of shingles, upper rows on top
  const ROWS = 9;
  const rowLen = slope / ROWS;
  const tones = ['#9a4428', '#8c3a24', '#a34c2e', '#86381f', '#93412a'];
  for (const side of [-1, 1]) {
    const under = add(new THREE.BoxGeometry(length + 0.4, 0.12, slope), materials.woodDark, 0, (EAVES + RIDGE) / 2 - 0.22, (side * run) / 2);
    under.rotation.x = side * angle;
    const nY = Math.cos(angle), nZ = Math.sin(angle) * side;
    const rows: number[][] = [];
    const rowTones: string[] = [];
    for (let k = 0; k < ROWS; k++) {
      const t = (k + 0.5) / ROWS;
      const lift = (ROWS - k) * 0.014;
      rows.push([0, RIDGE - 0.15 - rise * t + nY * lift, side * run * t + nZ * lift, side * angle, 0, 0]);
      rowTones.push(tones[Math.floor(rand() * tones.length)]);
    }
    const rowMesh = instances(new THREE.BoxGeometry(length + 0.4, 0.07, rowLen * 1.35), materials.roof, rows, rowTones);
    addHull(rowMesh, 0.03);
    g.add(rowMesh);
    // fascia board along the eaves
    add(new THREE.BoxGeometry(length + 0.45, 0.26, 0.05), materials.woodDark, 0, EAVES - 0.32, side * (run + 0.03));
  }
  add(new THREE.BoxGeometry(length + 0.4, 0.22, 0.4), materials.ridge, 0, RIDGE - 0.05, 0);

  // closed gable boards at the two ends of the bridge
  for (const [flag, x] of [
    [ends.start, -length / 2 - 0.15],
    [ends.end, length / 2 + 0.15],
  ] as [boolean, number][]) {
    if (!flag) continue;
    const gable = add(triangle(run * 2 - 0.2, rise), materials.boards, x, EAVES - 0.1, 0, 0.04);
    gable.rotation.y = 0;
    // zigzag trim along both slanted edges and a finial at the top
    const trim: number[][] = [];
    const steps = 8;
    for (const side of [-1, 1]) {
      for (let k = 0; k < steps; k++) {
        const t = (k + 0.5) / steps;
        trim.push([x + Math.sign(x) * 0.04, EAVES - 0.1 + rise * t - 0.12, side * (run - 0.1) * (1 - t), Math.PI / 4, 0, 0]);
      }
    }
    g.add(instances(new THREE.BoxGeometry(0.05, 0.16, 0.16), materials.ridge, trim));
    add(new THREE.ConeGeometry(0.1, 0.7, 6), materials.ridge, x, RIDGE + 0.4, 0);
  }

  // pile yokes every ~8 m: three piles, a cap beam under the deck and crossed braces
  const yokeCount = Math.max(1, Math.round(length / 8));
  const piles: number[][] = [];
  const caps: number[][] = [];
  const braces: number[][] = [];
  for (let i = 0; i < yokeCount; i++) {
    const x = -length / 2 + (i + 0.5) * (length / yokeCount);
    for (const z of [-(HALF_WIDTH - 0.5), 0, HALF_WIDTH - 0.5]) piles.push([x, (DECK - 3.2) / 2, z]);
    caps.push([x, DECK - 0.5, 0]);
    for (const dir of [-1, 1]) braces.push([x, 0.2, 0, dir * 0.75, 0, 0]);
  }
  g.add(instances(new THREE.CylinderGeometry(0.17, 0.2, DECK + 3.2, 6), materials.woodDark, piles));
  g.add(instances(new THREE.BoxGeometry(0.3, 0.3, HALF_WIDTH * 2 + 0.2), materials.woodDark, caps));
  g.add(instances(new THREE.BoxGeometry(0.12, 0.12, HALF_WIDTH * 2.4), materials.woodDark, braces));
  return g;
}

function wasserturm(windows: THREE.Material) {
  const g = new THREE.Group();
  const h = TOWER.wallTop;
  // stone courses, a grey plinth in the water and two string courses
  const stone = new THREE.Mesh(new THREE.CylinderGeometry(TOWER.radius, TOWER.radius + 0.3, h, 8), striped('#9c6b4e', 1, 0.55, 0.22, 0.1));
  stone.position.y = h / 2;
  addHull(stone, 0.12);
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(TOWER.radius + 0.5, TOWER.radius + 0.8, 4.5, 8), striped('#8a8580', 1, 0.7, 0.2, 0.1));
  plinth.position.y = -1;
  addHull(plinth, 0.1);
  const bandMat = toon('#c9a77c');
  const bandTop = new THREE.Mesh(new THREE.CylinderGeometry(TOWER.radius + 0.3, TOWER.radius + 0.3, 0.7, 8), bandMat);
  bandTop.position.y = h - 0.35;
  const bandMid = new THREE.Mesh(new THREE.CylinderGeometry(TOWER.radius + 0.12, TOWER.radius + 0.12, 0.35, 8), bandMat);
  bandMid.position.y = 16;

  // tall octagonal roof with ridge battens and a finial
  const roofH = TOWER.roofTop - h;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(TOWER.roofRadius, roofH, 8), striped('#6e3020', 1, 0.42, 0.25, 0.12));
  roof.position.y = h + roofH / 2;
  addHull(roof, 0.12);
  g.add(stone, plinth, bandTop, bandMid, roof);
  const ridges: number[][] = [];
  const edge = Math.hypot(TOWER.roofRadius, roofH);
  const tilt = Math.atan2(TOWER.roofRadius, roofH);
  for (let i = 0; i < 8; i++) {
    // the cone's corners sit at multiples of 45°
    const a = (i / 8) * Math.PI * 2;
    ridges.push([Math.sin(a) * TOWER.roofRadius * 0.5, h + roofH / 2, Math.cos(a) * TOWER.roofRadius * 0.5, 0, a, 0]);
  }
  const ridgeMesh = instances(new THREE.BoxGeometry(0.18, edge, 0.18), toon('#4a2016'), ridges);
  // tilt each batten outwards along its corner
  ridges.forEach(([x, y, z, , a], i) => {
    tmpM.compose(tmpP.set(x, y, z), tmpQ.setFromEuler(tmpE.set(-tilt, a, 0, 'YXZ')), tmpS.set(1, 1, 1));
    ridgeMesh.setMatrixAt(i, tmpM);
  });
  g.add(ridgeMesh);
  // corner quoins: light stone blocks, alternating long and short, up every edge
  const quoins: number[][] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    for (let k = 0, y = 0.3; y < h - 0.4; k++, y += 0.62) {
      const r = TOWER.radius + 0.3 * (1 - y / h) + 0.04;
      quoins.push([Math.sin(a) * r, y, Math.cos(a) * r, 0, a + (k % 2 ? 0.35 : -0.35), 0]);
    }
  }
  g.add(instances(new THREE.BoxGeometry(0.62, 0.5, 0.42), toon('#d2bf9f'), quoins));

  // corbel frieze under the eaves
  const corbels: number[][] = [];
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    const r = TOWER.radius * Math.cos(Math.PI / 8) / Math.cos(((a % (Math.PI / 4)) - Math.PI / 8)) + 0.12;
    corbels.push([Math.sin(a) * r, h - 1.05, Math.cos(a) * r, 0, a, 0]);
  }
  g.add(instances(new THREE.BoxGeometry(0.22, 0.42, 0.34), toon('#c9b08a'), corbels));

  // dormers on four roof faces, with windows that glow at night
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 8 + (k * Math.PI) / 2;
    const up = 0.32;
    const r = TOWER.roofRadius * Math.cos(Math.PI / 8) * (1 - up) + 0.25;
    const d = new THREE.Group();
    d.position.set(Math.sin(a) * r, h + roofH * up, Math.cos(a) * r);
    d.rotation.y = a;
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 1.4), toon('#9c6b4e'));
    box.position.z = -0.3;
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.9, 0.8, 4), toon('#6e3020'));
    cap.position.set(0, 0.95, -0.3);
    cap.rotation.y = Math.PI / 4;
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.65), windows);
    win.position.set(0, 0.05, 0.41);
    addHull(box, 0.04);
    d.add(box, cap, win);
    g.add(d);
  }

  // dark band where the water has stained the plinth
  const stain = new THREE.Mesh(new THREE.CylinderGeometry(TOWER.radius + 0.55, TOWER.radius + 0.62, 0.9, 8), toon('#4a5440'));
  stain.position.y = 0.15;
  g.add(stain);

  const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.12, 2.6, 6), toon('#3a2a20'));
  spire.position.y = TOWER.roofTop + 1.2;
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), toon('#d9b24a'));
  ball.position.y = TOWER.roofTop + 1.6;
  // weather vane: a little pennant on the spire
  const vane = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.35, 0.7), toon('#d9b24a'));
  vane.position.set(0, TOWER.roofTop + 2.25, 0.35);
  g.add(spire, ball, vane);

  // narrow windows on four sides, at three heights
  const winGeo = new THREE.PlaneGeometry(0.8, 1.6);
  const frameGeo = new THREE.PlaneGeometry(1.2, 2.1);
  const frameMat = toon('#d2bf9f');
  // the wall tapers from radius + 0.3 at the bottom to radius at the top
  const wallR = (y: number) => TOWER.radius + 0.3 * (1 - y / TOWER.wallTop);
  const apothemAt = (y: number) => (wallR(y) + 0.06) * Math.cos(Math.PI / 8);
  const apothem = apothemAt(DECK + 1.2);
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 8 + (i * Math.PI) / 2;
    for (const y of [8, 13, 20]) {
      const w = new THREE.Mesh(winGeo, windows);
      const ap = apothemAt(y);
      w.position.set(Math.sin(a) * (ap + 0.01), y, Math.cos(a) * (ap + 0.01));
      w.rotation.y = a;
      const frame = new THREE.Mesh(frameGeo, frameMat);
      frame.position.set(Math.sin(a) * ap, y + 0.05, Math.cos(a) * ap);
      frame.rotation.y = a;
      g.add(frame, w);
    }
  }
  // door towards the bridge kink
  const doorA = Math.atan2(-12.3 - TOWER.x, 29.3 - TOWER.z);
  const facet = Math.round((doorA - Math.PI / 8) / (Math.PI / 4)) * (Math.PI / 4) + Math.PI / 8;
  const door = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2.4), toon('#4a2e1c'));
  door.position.set(Math.sin(facet) * (apothem + 0.02), DECK + 1.2, Math.cos(facet) * (apothem + 0.02));
  door.rotation.y = facet;
  g.add(door);

  g.position.set(TOWER.x, 0, TOWER.z);
  return g;
}

export function createLandmarks(scene: THREE.Scene, obstacles: ObstacleIndex, windows: THREE.Material): Landmark[] {
  const painting = toon('#ffffff');
  painting.side = THREE.DoubleSide;
  const materials: Materials = {
    wood: toon(WOOD),
    woodDark: toon(WOOD_DARK),
    boards: striped(WOOD, 0, 0.22, 0.3, 0.12),
    roof: striped('#ffffff', 0, 0.26, 0.32, 0.1),
    ridge: toon('#6a2a18'),
    leaves: toon('#3f7a2e'),
    flowers: toon('#ffffff'),
    painting,
    deck: striped(WOOD_DARK, 0, 0.3, 0.3, 0.1),
    glow: windows,
    iron: toon('#2a2a2a'),
  };
  let seed = 11;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  const bridge = new THREE.Group();
  for (let i = 0; i < BRIDGE_PATH.length - 1; i++) {
    const [ax, az] = BRIDGE_PATH[i];
    const [bx, bz] = BRIDGE_PATH[i + 1];
    bridge.add(bridgeSection(ax, az, bx, bz, materials, { start: i === 0, end: i === BRIDGE_PATH.length - 2 }, rand));
    const strip = new Strip(ax, az, bx, bz, HALF_WIDTH + 0.5, DECK - 0.35, EAVES, RIDGE);
    strip.owner = 'kapellbruecke';
    obstacles.add(strip);
  }
  scene.add(bridge);

  const tower = wasserturm(windows);
  scene.add(tower);
  const towerObstacle = new Tower(TOWER.x, TOWER.z, TOWER.radius + 0.3, -3, TOWER.wallTop, TOWER.roofRadius, TOWER.roofTop);
  towerObstacle.owner = 'wasserturm';
  obstacles.add(towerObstacle);

  // bridge: points along the centre line every ~6 m, at wall and roof height
  const bridgePoints: SubjectPoint[] = [];
  for (let i = 0; i < BRIDGE_PATH.length - 1; i++) {
    const [ax, az] = BRIDGE_PATH[i];
    const [bx, bz] = BRIDGE_PATH[i + 1];
    const steps = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / 6));
    for (let k = 0; k < steps; k++) {
      const t = k / steps;
      const x = ax + (bx - ax) * t;
      const z = az + (bz - az) * t;
      bridgePoints.push({ p: new THREE.Vector3(x, DECK + 1.2, z) }, { p: new THREE.Vector3(x, RIDGE - 0.3, z) });
    }
  }
  // tower: eight sides at three heights, facing outwards, plus the roof tip
  const towerPoints: SubjectPoint[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const n = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
    for (const y of [4, 13, 22]) {
      towerPoints.push({ p: new THREE.Vector3(TOWER.x, y, TOWER.z).addScaledVector(n, TOWER.radius + 0.4), n });
    }
  }
  towerPoints.push({ p: new THREE.Vector3(TOWER.x, TOWER.roofTop - 0.5, TOWER.z) });

  return [
    { id: 'kapellbruecke', name: 'Kapellbrücke', box: new THREE.Box3().setFromObject(bridge), points: bridgePoints },
    { id: 'wasserturm', name: 'Wasserturm', box: new THREE.Box3().setFromObject(tower), points: towerPoints },
  ];
}
