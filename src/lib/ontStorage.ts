/**
 * IndexedDB simples para cache de bases grandes do módulo Rastreabilidade ONT.
 * Evita o erro "exceeded the quota" do localStorage com bases como Cruzamento SAP x Gestech.
 * Fallback para localStorage em ambientes sem IndexedDB.
 */
const DB_NAME = "ont_rastreabilidade";
const STORE = "bases";
const VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;
const openDb = (): Promise<IDBDatabase> => {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("IndexedDB indisponível"));
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
};

export const ontGet = async <T = any>(key: string): Promise<T | null> => {
  try {
    const db = await openDb();
    return await new Promise<T | null>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve((req.result ?? null) as T | null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    try { const r = localStorage.getItem(key); return r ? (JSON.parse(r) as T) : null; } catch { return null; }
  }
};

export const ontSet = async (key: string, value: any): Promise<void> => {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    // limpa eventual versão antiga em localStorage para não conflitar
    try { localStorage.removeItem(key); } catch {}
  } catch (err) {
    // fallback (pode falhar se exceder quota — re-lança para a UI tratar)
    localStorage.setItem(key, JSON.stringify(value));
  }
};

export const ontDel = async (key: string): Promise<void> => {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {}
  try { localStorage.removeItem(key); } catch {}
};