/** Photo jobs, loaded from public/data/<region>/assignments.json. */
export interface Assignment {
  id: string;
  client: string;
  contact: string;
  title: string;
  brief: string;
  /** Landmarks that must be in the picture. */
  subjects: string[];
  orientation?: 'landscape' | 'portrait';
  /** Share of the frame the subjects together should fill. */
  size?: { min: number; max: number };
  /** Compass direction the camera should face, in degrees (0 = north). */
  heading?: { from: number; to: number; label: string };
  /** Horizon must be in the picture. */
  horizon?: boolean;
  /** Game time window; from > to wraps over midnight. */
  hours?: { from: number; to: number; label: string };
  /** Camera tilted at least this far down (negative degrees). */
  gimbalMax?: { deg: number; label: string };
  /** Drone at most this high above ground or water. */
  altitudeMax?: { m: number; label: string };
  /** Focal length at least this long. */
  focalMin?: { mm: number; label: string };
  /** The light the client wants; default is daylight. */
  light?: 'day' | 'night';
  /** Fee in CHF for a 4.5-star photo. */
  reward: number;
  reputation: number;
  /** Reputation level needed to take the job. */
  level: number;
}

export async function loadAssignments(baseUrl: string): Promise<Assignment[]> {
  const res = await fetch(`${baseUrl}assignments.json`);
  if (!res.ok) throw new Error(`assignments.json: ${res.status}`);
  return res.json();
}

/** Reputation levels from the concept. */
export const LEVEL_NAMES = ['Hobbypilot', 'Freelancer', 'Profi', 'Studio', 'Legende'];
const LEVEL_MIN = [0, 40, 120, 250, 450];

export function levelOf(reputation: number) {
  let level = 1;
  for (let i = 0; i < LEVEL_MIN.length; i++) if (reputation >= LEVEL_MIN[i]) level = i + 1;
  const next = LEVEL_MIN[level] ?? null;
  return {
    level,
    name: LEVEL_NAMES[level - 1],
    min: LEVEL_MIN[level - 1],
    next,
    progress: next === null ? 1 : (reputation - LEVEL_MIN[level - 1]) / (next - LEVEL_MIN[level - 1]),
  };
}

/** Fee for a photo: 60 % at 3 stars up to 120 % at 5 stars, plus 10 % in Pro mode. Rounded to 10 CHF. */
export function feeFor(a: Assignment, stars: number, pro: boolean) {
  const factor = stars >= 5 ? 1.2 : stars >= 4.5 ? 1 : stars >= 4 ? 0.9 : stars >= 3.5 ? 0.75 : stars >= 3 ? 0.6 : 0;
  return Math.round((a.reward * factor * (pro ? 1.1 : 1)) / 10) * 10;
}

export function reputationFor(a: Assignment, stars: number) {
  return Math.round((a.reputation * stars) / 5);
}

export const chf = (n: number) => `CHF ${n.toLocaleString('de-CH')}`;
