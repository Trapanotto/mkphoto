import type { WaterRule } from './terrain';

/** Everything that differs between the playable regions. */
export interface Region {
  id: 'luzern' | 'zermatt';
  name: string;
  water: WaterRule;
  /** Water plane over the whole map (lake town), or only over the lake cells (mountain lake). */
  waterPlane: 'everywhere' | 'lake';
  home: { x: number; z: number; yaw: number };
  /** Flying is allowed within this circle. */
  flight: { x: number; z: number; radius: number };
  style: 'city' | 'alpine';
  /** Cloud height above the base level and how far they spread around the flight area. */
  clouds: { min: number; max: number; spread: number; size: number };
  ambient: {
    people: number;
    cars: number;
    boats: boolean;
    swans: number;
    ducks: number;
    birds: 'gulls' | 'choughs';
    birdCount: number;
    birdCentres: [number, number][];
  };
}

export const REGIONS: Record<Region['id'], Region> = {
  luzern: {
    id: 'luzern',
    name: 'Luzern',
    water: { mode: 'below', seeds: [[0, 0]] },
    waterPlane: 'everywhere',
    home: { x: 12, z: 86, yaw: Math.atan2(19, 48) },
    flight: { x: 0, z: 0, radius: 650 },
    style: 'city',
    clouds: { min: 170, max: 310, spread: 900, size: 1 },
    ambient: {
      people: 380,
      cars: 60,
      boats: true,
      swans: 12,
      ducks: 24,
      birds: 'gulls',
      birdCount: 36,
      birdCentres: [
        [0, 10],
        [-120, -40],
        [250, 60],
      ],
    },
  },
  zermatt: {
    id: 'zermatt',
    name: 'Matterhorn',
    // Riffelsee at 2757 m is the base level; the Mattertal far below stays dry
    water: { mode: 'level', seeds: [[0, 0]] },
    waterPlane: 'lake',
    // east shore of the Riffelsee, looking west across the lake to the Matterhorn
    home: { x: 74, z: -6, yaw: Math.atan2(8165, -780) },
    flight: { x: -3500, z: -300, radius: 6200 },
    style: 'alpine',
    clouds: { min: 900, max: 1700, spread: 5000, size: 3 },
    ambient: {
      people: 70,
      cars: 0,
      boats: false,
      swans: 0,
      ducks: 0,
      birds: 'choughs',
      birdCount: 24,
      birdCentres: [
        [60, -30],
        [1450, 70],
        [-8090, 770],
      ],
    },
  },
};

export function pickRegion(): Region {
  const id = new URLSearchParams(location.search).get('region');
  return id === 'zermatt' ? REGIONS.zermatt : REGIONS.luzern;
}
