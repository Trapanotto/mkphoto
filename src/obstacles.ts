import * as THREE from 'three';

/**
 * Solid things the drone can hit or land on. Each shape answers two questions:
 * how far is a point from its footprint (negative = inside), and how high is its top there.
 */
export interface Obstacle {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  bottom: number;
  /** Landmark this belongs to, so a landmark does not hide itself in the visibility test. */
  owner?: string;
  /** Signed distance to the footprint edge; writes the outward normal into n. */
  distance(x: number, z: number, n: { x: number; z: number }): number;
  /** Height of the top surface at a point inside the footprint. */
  topAt(x: number, z: number): number;
}

/** Vertical prism over a polygon (buildings). */
export class Prism implements Obstacle {
  owner?: string;
  /** Hip roof on top: rises with the distance from the edge, up to roofRise. */
  roofRise = 0;
  roofSlope = 1;
  minX = Infinity;
  maxX = -Infinity;
  minZ = Infinity;
  maxZ = -Infinity;

  constructor(
    readonly ring: [number, number][],
    readonly bottom: number,
    readonly top: number,
  ) {
    for (const [x, z] of ring) {
      this.minX = Math.min(this.minX, x);
      this.maxX = Math.max(this.maxX, x);
      this.minZ = Math.min(this.minZ, z);
      this.maxZ = Math.max(this.maxZ, z);
    }
  }

  distance(x: number, z: number, n: { x: number; z: number }) {
    const r = this.ring;
    let inside = false;
    let best = Infinity;
    let bx = 0;
    let bz = 0;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [xi, zi] = r[i];
      const [xj, zj] = r[j];
      if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
      const ex = xj - xi;
      const ez = zj - zi;
      const t = Math.max(0, Math.min(1, ((x - xi) * ex + (z - zi) * ez) / (ex * ex + ez * ez || 1)));
      const px = xi + ex * t;
      const pz = zi + ez * t;
      const d = Math.hypot(x - px, z - pz);
      if (d < best) {
        best = d;
        bx = px;
        bz = pz;
      }
    }
    const len = best || 1;
    // outward: away from the edge when outside, towards it when inside
    n.x = ((inside ? bx - x : x - bx) / len);
    n.z = ((inside ? bz - z : z - bz) / len);
    return inside ? -best : best;
  }

  private readonly n = { x: 0, z: 0 };

  topAt(x: number, z: number) {
    if (!this.roofRise) return this.top;
    const inside = -this.distance(x, z, this.n);
    return this.top + Math.min(this.roofRise, Math.max(0, inside) * this.roofSlope);
  }
}

/** Straight strip with a gable roof (a bridge section). */
export class Strip implements Obstacle {
  owner?: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  private readonly dx: number;
  private readonly dz: number;
  private readonly length: number;

  constructor(
    readonly ax: number,
    readonly az: number,
    bx: number,
    bz: number,
    readonly halfWidth: number,
    readonly bottom: number,
    readonly eaves: number,
    readonly ridge: number,
  ) {
    this.length = Math.hypot(bx - ax, bz - az);
    this.dx = (bx - ax) / this.length;
    this.dz = (bz - az) / this.length;
    this.minX = Math.min(ax, bx) - halfWidth;
    this.maxX = Math.max(ax, bx) + halfWidth;
    this.minZ = Math.min(az, bz) - halfWidth;
    this.maxZ = Math.max(az, bz) + halfWidth;
  }

  private local(x: number, z: number) {
    const rx = x - this.ax;
    const rz = z - this.az;
    return { t: rx * this.dx + rz * this.dz, s: -rx * this.dz + rz * this.dx };
  }

  distance(x: number, z: number, n: { x: number; z: number }) {
    const { t, s } = this.local(x, z);
    const dt = Math.max(-t, t - this.length);
    const ds = Math.abs(s) - this.halfWidth;
    // side normal (most common hit); ends use the strip direction
    if (ds >= dt) {
      const sign = Math.sign(s) || 1;
      n.x = -this.dz * sign;
      n.z = this.dx * sign;
    } else {
      const sign = t < this.length / 2 ? -1 : 1;
      n.x = this.dx * sign;
      n.z = this.dz * sign;
    }
    if (ds > 0 && dt > 0) return Math.hypot(ds, dt);
    return Math.max(ds, dt);
  }

  topAt(x: number, z: number) {
    const { s } = this.local(x, z);
    const k = Math.min(1, Math.abs(s) / this.halfWidth);
    return this.ridge - (this.ridge - this.eaves) * k;
  }
}

/** Round tower with a cone roof. */
export class Tower implements Obstacle {
  owner?: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;

  constructor(
    readonly x: number,
    readonly z: number,
    readonly radius: number,
    readonly bottom: number,
    readonly wallTop: number,
    readonly roofRadius: number,
    readonly roofTop: number,
  ) {
    const r = Math.max(radius, roofRadius);
    this.minX = x - r;
    this.maxX = x + r;
    this.minZ = z - r;
    this.maxZ = z + r;
  }

  distance(x: number, z: number, n: { x: number; z: number }) {
    const dx = x - this.x;
    const dz = z - this.z;
    const d = Math.hypot(dx, dz) || 1;
    n.x = dx / d;
    n.z = dz / d;
    return d - this.radius;
  }

  topAt(x: number, z: number) {
    const d = Math.hypot(x - this.x, z - this.z);
    return this.wallTop + (this.roofTop - this.wallTop) * Math.max(0, 1 - d / this.roofRadius);
  }
}

const CELL = 40;

/** Uniform grid so the drone only checks obstacles near it. */
/** Building tops per square metre (see RoofMap in buildings3d.ts). */
export interface HeightMap {
  top(x: number, z: number): number;
}

const DIRS = Array.from({ length: 8 }, (_, i) => [Math.cos((i / 8) * Math.PI * 2), Math.sin((i / 8) * Math.PI * 2)]);

export class ObstacleIndex {
  private readonly cells = new Map<number, Obstacle[]>();
  private readonly n = { x: 0, z: 0 };
  /** Buildings from swissBUILDINGS3D, handled as a height map. */
  roofs: HeightMap | null = null;

  add(o: Obstacle) {
    for (let cx = Math.floor(o.minX / CELL); cx <= Math.floor(o.maxX / CELL); cx++)
      for (let cz = Math.floor(o.minZ / CELL); cz <= Math.floor(o.maxZ / CELL); cz++) {
        const key = cx * 100003 + cz;
        let list = this.cells.get(key);
        if (!list) this.cells.set(key, (list = []));
        list.push(o);
      }
  }

  private near(x: number, z: number) {
    return this.cells.get(Math.floor(x / CELL) * 100003 + Math.floor(z / CELL)) ?? [];
  }

  /** Highest top the point stands over, if it is above that top (roofs work as ground). */
  groundAt(x: number, z: number, y: number, terrain: number) {
    let ground = terrain;
    if (this.roofs) {
      const roof = this.roofs.top(x, z);
      if (y >= roof - 0.8 && roof > ground) ground = roof;
    }
    for (const o of this.near(x, z)) {
      if (o.distance(x, z, this.n) > 0) continue;
      const top = o.topAt(x, z);
      if (y >= top - 0.8 && top > ground) ground = top;
    }
    return ground;
  }

  /** True if the point is inside a solid obstacle (with a margin around it). */
  solidAt(x: number, y: number, z: number, margin = 0, ignoreOwner?: string) {
    if (this.roofs && y <= this.roofs.top(x, z) + margin) return true;
    for (const o of this.near(x, z)) {
      if (ignoreOwner && o.owner === ignoreOwner) continue;
      if (o.distance(x, z, this.n) > margin) continue;
      if (y >= o.bottom - margin && y <= o.topAt(x, z) + margin) return true;
    }
    return false;
  }

  /** Walls from the height map: anything higher than us around the drone pushes it away. */
  private pushOutOfBuildings(p: THREE.Vector3, vel: THREE.Vector3, radius: number) {
    const roofs = this.roofs!;
    const wallAt = (x: number, z: number) => roofs.top(x, z) > p.y + 0.8;
    if (wallAt(p.x, p.z)) {
      // inside a building: step out to the nearest free spot
      for (let r = 0.5; r <= 4; r += 0.5) {
        for (const [dx, dz] of DIRS) {
          if (!wallAt(p.x + dx * r, p.z + dz * r)) {
            p.x += dx * r;
            p.z += dz * r;
            vel.x = vel.z = 0;
            return;
          }
        }
      }
      return;
    }
    for (const [dx, dz] of DIRS) {
      if (!wallAt(p.x + dx * radius, p.z + dz * radius)) continue;
      p.x -= dx * 0.12;
      p.z -= dz * 0.12;
      const vn = vel.x * dx + vel.z * dz;
      if (vn > 0) {
        vel.x -= vn * dx;
        vel.z -= vn * dz;
      }
    }
  }

  /** Pushes a point of the given radius out of walls and from under overhangs. */
  pushOut(p: THREE.Vector3, vel: THREE.Vector3, radius: number) {
    if (this.roofs) this.pushOutOfBuildings(p, vel, radius);
    for (const o of this.near(p.x, p.z)) {
      const d = o.distance(p.x, p.z, this.n);
      if (d >= radius) continue;
      const top = o.topAt(p.x, p.z);
      if (p.y >= top - 0.8 || p.y < o.bottom - radius) continue;
      if (p.y < o.bottom + 0.5) {
        // under an overhang (bridge deck): keep below it
        p.y = o.bottom - radius;
        vel.y = Math.min(0, vel.y);
        continue;
      }
      const push = radius - d;
      p.x += this.n.x * push;
      p.z += this.n.z * push;
      const vn = vel.x * this.n.x + vel.z * this.n.z;
      if (vn < 0) {
        vel.x -= vn * this.n.x;
        vel.z -= vn * this.n.z;
      }
    }
  }
}
