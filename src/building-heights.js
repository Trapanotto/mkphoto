// Recover the base of each building from its baked geometry. Some older bakes
// have invalid _relh values, making whole walls look like ground floors.
export function repairBuildingHeights(geometry) {
  const position = geometry.attributes.position;
  const ids = geometry.attributes._batchid;
  const heights = geometry.attributes._relh;
  if (!position || !ids || !heights || position.count !== ids.count || position.count !== heights.count) return;
  const bases = new Map();
  for (let i = 0; i < position.count; i++) {
    const id = ids.getX(i), y = position.getY(i);
    bases.set(id, Math.min(bases.get(id) ?? Infinity, y));
  }
  for (let i = 0; i < position.count; i++) heights.setX(i, position.getY(i) - bases.get(ids.getX(i)));
  heights.needsUpdate = true;
}
