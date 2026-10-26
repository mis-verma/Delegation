const DB_NAME = 'tm-uploads';
const STORE = 'pending';

export interface PendingFile {
  field: string;
  blob: Blob;
  name: string;
  type: string;
  lastModified: number;
}

export interface PendingUpload {
  id: string;
  path: string;
  fields: [string, string][];
  files: PendingFile[];
  createdAt: number;
}

const open = (): Promise<IDBDatabase | null> =>
  new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    try {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore(STORE, { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });

const withStore = async <T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>, fallback: T): Promise<T> => {
  const db = await open();
  if (!db) return fallback;
  return new Promise<T>((resolve) => {
    try {
      const request = work(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(fallback);
    } catch {
      resolve(fallback);
    }
  }).finally(() => db.close());
};

export const putPending = (upload: PendingUpload): Promise<unknown> =>
  withStore<IDBValidKey | null>('readwrite', (store) => store.put(upload) as IDBRequest<IDBValidKey | null>, null);

export const removePending = (id: string): Promise<unknown> => withStore('readwrite', (store) => store.delete(id), undefined);

export const listPending = (): Promise<PendingUpload[]> => withStore('readonly', (store) => store.getAll() as IDBRequest<PendingUpload[]>, []);
