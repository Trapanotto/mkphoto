/** One IndexedDB database for photos and the save game. Resolves to null if the browser blocks storage. */
const DB_NAME = 'mkphoto';
const VERSION = 2;
export const STORES = { photos: 'photos', save: 'save' } as const;

let dbPromise: Promise<IDBDatabase | null> | null = null;

export function db(): Promise<IDBDatabase | null> {
  dbPromise ??= new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains(STORES.photos)) d.createObjectStore(STORES.photos, { keyPath: 'id' });
        if (!d.objectStoreNames.contains(STORES.save)) d.createObjectStore(STORES.save);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

export function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        if (!d) return reject(new Error('no storage'));
        const req = fn(d.transaction(store, mode).objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}
