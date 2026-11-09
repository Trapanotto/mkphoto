import type { WaterRule } from './terrain';

/** Everything that differs between the playable regions. */
export interface Region {
  id: 'luzern' | 'zermatt' | 'chillon' | 'landwasser' | 'bern' | 'aarau' | 'lenzburg';
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
    /** Train colours, if the region has a railway with trains. */
    train?: { body: string; roof: string; stripe: string };
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
  chillon: {
    id: 'chillon',
    name: 'Château de Chillon',
    // Lake Geneva at 372 m: like Luzern, everything at or below the lake is water
    water: { mode: 'below', seeds: [[-150, 120]] },
    waterPlane: 'everywhere',
    // lakeside below the castle, looking north at it (free spot found against roads, roofs and trees)
    home: { x: 20, z: 65, yaw: Math.atan2(5, 53) },
    flight: { x: 100, z: -100, radius: 900 },
    style: 'city',
    clouds: { min: 300, max: 600, spread: 1400, size: 1.4 },
    ambient: {
      people: 160,
      cars: 30,
      boats: true,
      swans: 10,
      ducks: 14,
      birds: 'gulls',
      birdCount: 26,
      birdCentres: [
        [0, 0],
        [-200, 150],
        [150, -200],
      ],
      train: { body: '#d9001b', roof: '#5a5f66', stripe: '#f2f2f2' },
    },
  },
  landwasser: {
    id: 'landwasser',
    name: 'Landwasserviadukt',
    water: { mode: 'level', seeds: [] },
    waterPlane: 'lake',
    // in the valley by the Landwasser, clear view up to the arches (checked against terrain and trees)
    home: { x: -104, z: 144, yaw: Math.atan2(-104, 144) },
    flight: { x: 150, z: 190, radius: 900 },
    style: 'alpine',
    clouds: { min: 500, max: 1000, spread: 1500, size: 1.6 },
    ambient: {
      people: 40,
      cars: 6,
      boats: false,
      swans: 0,
      ducks: 0,
      birds: 'choughs',
      birdCount: 14,
      birdCentres: [
        [0, 0],
        [300, 300],
      ],
      train: { body: '#c8102e', roof: '#5a5f66', stripe: '#f2f2f2' },
    },
  },
  bern: {
    id: 'bern',
    name: 'Berner Münster',
    // the Aare runs as a river ribbon through its gorge; no lake
    water: { mode: 'level', seeds: [] },
    waterPlane: 'lake',
    // across the Aare south of the old town, looking north up at the Münster (free spot with a view)
    home: { x: 32, z: 209, yaw: 0.158 },
    flight: { x: 150, z: 0, radius: 900 },
    style: 'city',
    clouds: { min: 250, max: 500, spread: 1400, size: 1.3 },
    ambient: {
      people: 260,
      cars: 40,
      boats: false,
      swans: 0,
      ducks: 0,
      birds: 'gulls',
      birdCount: 24,
      birdCentres: [
        [0, 0],
        [200, 100],
      ],
      train: { body: '#d9001b', roof: '#5a5f66', stripe: '#f2f2f2' },
    },
  },
  aarau: {
    id: 'aarau',
    name: 'Aarau Kettenbrücke',
    water: { mode: 'level', seeds: [] },
    waterPlane: 'lake',
    // on the bank downstream, looking along the Aare at the bridge (free spot with a view)
    home: { x: -134, z: 89, yaw: -0.99 },
    flight: { x: 0, z: 100, radius: 900 },
    style: 'city',
    clouds: { min: 250, max: 500, spread: 1400, size: 1.3 },
    ambient: {
      people: 180,
      cars: 40,
      boats: false,
      swans: 0,
      ducks: 0,
      birds: 'gulls',
      birdCount: 20,
      birdCentres: [
        [0, 0],
        [-150, 200],
      ],
      train: { body: '#d9001b', roof: '#5a5f66', stripe: '#f2f2f2' },
    },
  },
  lenzburg: {
    id: 'lenzburg',
    name: 'Schloss Lenzburg',
    water: { mode: 'level', seeds: [] },
    waterPlane: 'lake',
    // south-east below the castle hill, looking up at it (free spot with a view)
    home: { x: 229, z: 163, yaw: 0.96 },
    flight: { x: 0, z: 0, radius: 900 },
    style: 'city',
    clouds: { min: 300, max: 550, spread: 1400, size: 1.3 },
    ambient: {
      people: 140,
      cars: 30,
      boats: false,
      swans: 0,
      ducks: 0,
      birds: 'gulls',
      birdCount: 18,
      birdCentres: [
        [0, 0],
        [200, 200],
      ],
      train: { body: '#d9001b', roof: '#5a5f66', stripe: '#f2f2f2' },
    },
  },
};

export function pickRegion(): Region {
  const id = new URLSearchParams(location.search).get('region') as Region['id'] | null;
  return (id && REGIONS[id]) || REGIONS.luzern;
}

/** Order in the region menu. */
export const REGION_ORDER: Region['id'][] = ['luzern', 'zermatt', 'chillon', 'landwasser', 'bern', 'aarau', 'lenzburg'];
