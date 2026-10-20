// IndexedDB 저장소. 상태(JSON)와 레이어 이미지(Blob)를 따로 보관한다.
const DB_NAME = 'feathertalk';
const DB_VERSION = 1;

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in self)) {
      reject(new Error('IndexedDB를 지원하지 않는 브라우저예요.'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('state')) db.createObjectStore('state');
      if (!db.objectStoreNames.contains('images')) db.createObjectStore('images');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(storeName, mode, fn) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(storeName, mode);
    const store = t.objectStore(storeName);
    let result;
    Promise.resolve(fn(store)).then((r) => { result = r; });
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('저장이 중단됐어요.'));
  }));
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function loadState() {
  return tx('state', 'readonly', (s) => reqToPromise(s.get('main')));
}

export function saveState(state) {
  return tx('state', 'readwrite', (s) => { s.put(state, 'main'); });
}

export function getImage(id) {
  return tx('images', 'readonly', (s) => reqToPromise(s.get(id)));
}

export function putImage(id, blob) {
  return tx('images', 'readwrite', (s) => { s.put(blob, id); });
}

export function deleteImages(ids) {
  if (!ids.length) return Promise.resolve();
  return tx('images', 'readwrite', (s) => { ids.forEach((id) => s.delete(id)); });
}

export function listImageIds() {
  return tx('images', 'readonly', (s) => reqToPromise(s.getAllKeys()));
}

export function clearImages() {
  return tx('images', 'readwrite', (s) => { s.clear(); });
}
