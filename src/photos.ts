/** Photo album storage in IndexedDB. Falls back to memory if the browser blocks storage. */

export interface PhotoMeta {
  id: string;
  created: string;
  gameTime: string;
  focal: number;
  gimbal: number;
  altitude: number;
  width: number;
  height: number;
  tags: string[];
  rating?: PhotoRating;
}

export interface PhotoRating {
  stars: number;
  comment: string;
  lines: string[];
  assignment?: string;
  fulfilled: boolean;
}

export interface Photo extends PhotoMeta {
  image: Blob;
  thumb: Blob;
}

import { run as runIn, STORES } from './db';

const memory: Photo[] = [];
const run = <T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>) => runIn(STORES.photos, mode, fn);

/** True if the photo was stored persistently, false if only in memory. */
export async function savePhoto(photo: Photo): Promise<boolean> {
  try {
    await run('readwrite', (s) => s.put(photo));
    return true;
  } catch {
    memory.unshift(photo);
    return false;
  }
}

export async function listPhotos(): Promise<Photo[]> {
  let stored: Photo[] = [];
  try {
    stored = await run('readonly', (s) => s.getAll() as IDBRequest<Photo[]>);
  } catch {
    // storage unavailable: memory only
  }
  return [...memory, ...stored].sort((a, b) => b.created.localeCompare(a.created));
}

export async function deletePhoto(id: string) {
  const i = memory.findIndex((p) => p.id === id);
  if (i >= 0) memory.splice(i, 1);
  try {
    await run('readwrite', (s) => s.delete(id));
  } catch {
    // nothing stored
  }
}
