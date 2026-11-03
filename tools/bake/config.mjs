// Bake-Konfiguration pro Level: Ausdehnung der Ringe (halbe Kantenlänge in Metern) und Auflösungen.
import { LEVELS } from '../../src/levels.js';
import { toLV95 } from './lv95.mjs';

const SIZE = {
  // core: Detailgebiet (Gebäude, Bäume, 2–4 m Gelände), mid: 20 m Gelände, far: Horizont
  luzern: { core: 1200, mid: 5000, far: 30000 },
  aarau: { core: 1200, mid: 5000, far: 25000 },
  bern: { core: 1200, mid: 5000, far: 30000 },
  lenzburg: { core: 1200, mid: 5000, far: 25000 },
  chillon: { core: 1200, mid: 6000, far: 35000 },
  matterhorn: { core: 2000, mid: 7000, far: 40000 },
};

export const CHUNK = 400;        // Kachelgrösse Kerngebiet (m)
export const MID_CHUNK = 2000;   // Kachelgrösse Mittelring (m)

export function bakeConfig(id) {
  const L = LEVELS.find((l) => l.id === id);
  if (!L) throw new Error('Level unbekannt: ' + id);
  const { E, N } = toLV95(L.lat, L.lon);
  // Ursprung auf 10 m runden -> saubere Kachelgrenzen
  const E0 = Math.round(E / 10) * 10, N0 = Math.round(N / 10) * 10;
  return { id, level: L, E0, N0, ...SIZE[id] };
}

export const ALL_IDS = Object.keys(SIZE);
