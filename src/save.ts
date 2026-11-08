import { run, STORES } from './db';

export interface JobRecord {
  /** Best stars delivered so far. */
  stars: number;
  /** Total paid for this job. */
  paid: number;
  date: string;
}

export interface SaveGame {
  version: 1;
  money: number;
  reputation: number;
  activeJob: string | null;
  jobs: Record<string, JobRecord>;
  hour: number;
  pro: boolean;
  introSeen: boolean;
}

const KEY = 'slot1';
const FALLBACK = 'mkphoto.save';

export const newGame = (): SaveGame => ({
  version: 1,
  money: 0,
  reputation: 0,
  activeJob: null,
  jobs: {},
  hour: 9,
  pro: false,
  introSeen: false,
});

export async function loadGame(): Promise<SaveGame | null> {
  try {
    const s = await run<SaveGame | undefined>(STORES.save, 'readonly', (st) => st.get(KEY));
    if (s) return { ...newGame(), ...s };
  } catch {
    // IndexedDB unavailable: try localStorage
  }
  try {
    const raw = localStorage.getItem(FALLBACK);
    return raw ? { ...newGame(), ...JSON.parse(raw) } : null;
  } catch {
    return null;
  }
}

export async function storeGame(game: SaveGame) {
  try {
    await run(STORES.save, 'readwrite', (st) => st.put(game, KEY));
    return;
  } catch {
    // fall through to localStorage
  }
  try {
    localStorage.setItem(FALLBACK, JSON.stringify(game));
  } catch {
    // nothing we can do; the game keeps running without a save
  }
}

export async function deleteGame() {
  try {
    await run(STORES.save, 'readwrite', (st) => st.delete(KEY));
  } catch {
    // ignore
  }
  try {
    localStorage.removeItem(FALLBACK);
  } catch {
    // ignore
  }
}
