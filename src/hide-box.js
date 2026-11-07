import * as THREE from 'three';

// Hide meshes are exported with their rotation baked into the vertex positions.
// Recover the horizontal oriented rectangle in world space, rather than using
// the axis-aligned geometry bounding box (which can cover entire city blocks).
export function getHideBox(mesh) {
  const position = mesh.geometry.attributes.position;
  if (!position || position.count === 0) return null;
  const v = new THREE.Vector3();
  const unique = new Map();
  let maxY = -Infinity;
  for (let i = 0; i < position.count; i++) {
    v.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
    maxY = Math.max(maxY, v.y);
    const key = `${Math.round(v.x * 1000)},${Math.round(v.z * 1000)}`;
    if (!unique.has(key)) unique.set(key, [v.x, v.z]);
  }
  const points = [...unique.values()];
  const mx = points.reduce((sum, p) => sum + p[0], 0) / points.length;
  const mz = points.reduce((sum, p) => sum + p[1], 0) / points.length;
  let xx = 0, zz = 0, xz = 0;
  for (const [x, z] of points) {
    xx += (x - mx) ** 2; zz += (z - mz) ** 2; xz += (x - mx) * (z - mz);
  }
  const angle = 0.5 * Math.atan2(2 * xz, xx - zz);
  const c = Math.cos(angle), s = Math.sin(angle);
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const [x, z] of points) {
    const dx = x - mx, dz = z - mz;
    const lx = dx * c + dz * s, lz = -dx * s + dz * c;
    minX = Math.min(minX, lx); maxX = Math.max(maxX, lx);
    minZ = Math.min(minZ, lz); maxZ = Math.max(maxZ, lz);
  }
  const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
  return { x: mx + cx * c - cz * s, z: mz + cx * s + cz * c,
    hx: (maxX - minX) / 2, hz: (maxZ - minZ) / 2, angle, maxY };
}
