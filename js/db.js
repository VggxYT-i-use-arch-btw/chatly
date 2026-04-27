// ╔══════════════════════════════════════════════════╗
// ║  CHATLY — db.js                                  ║
// ║  IndexedDB local cache + helpers                 ║
// ╚══════════════════════════════════════════════════╝

const DB_NAME    = 'chatly_db';
const DB_VERSION = 2;

let _db = null;

// ── INIT ──────────────────────────────────────────
function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      // Stores genéricos (keyed por id)
      ['users', 'conversations', 'messages'].forEach(name => {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: 'id' });
        }
      });
      // Store de perfil (chave fixa)
      if (!db.objectStoreNames.contains('profile')) {
        db.createObjectStore('profile');
      }
      // Cache de blobs (keyed pela URL)
      if (!db.objectStoreNames.contains('blobcache')) {
        const bs = db.createObjectStore('blobcache', { keyPath: 'url' });
        bs.createIndex('by_ts', 'ts');
      }
      // Stickers (keyed por id)
      if (!db.objectStoreNames.contains('stickers')) {
        db.createObjectStore('stickers', { keyPath: 'id' });
      }
    };

    req.onsuccess  = (e) => { _db = e.target.result; resolve(_db); };
    req.onerror    = ()  => reject(req.error);
  });
}

// ── CRUD GENÉRICO ─────────────────────────────────

/**
 * Grava (ou atualiza) um registro num store.
 * @param {string} store   - nome do object store
 * @param {*}      value   - objeto a gravar (deve ter .id quando o store usa keyPath:'id')
 */
async function dbPut(store, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).put(value);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

/**
 * Lê um registro pelo key primário.
 * @param {string} store
 * @param {*}      key
 */
async function dbGet(store, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror   = () => reject(req.error);
  });
}

/**
 * Lê registros por um índice secundário.
 * @param {string} store
 * @param {string} indexName
 * @param {*}      value
 */
async function dbGetByIndex(store, indexName, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(store, 'readonly');
    const index = tx.objectStore(store).index(indexName);
    const req   = index.getAll(value);
    req.onsuccess = () => resolve(req.result ?? []);
    req.onerror   = () => reject(req.error);
  });
}

// ── PERFIL LOCAL ──────────────────────────────────

async function getLocalProfile() {
  return dbGet('profile', 'me');
}

async function saveLocalProfile(data) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction('profile', 'readwrite');
    const req = tx.objectStore('profile').put(data, 'me');
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

// ── FETCH COM CACHE DE BLOB ───────────────────────
const MAX_CACHE_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias
const _blobUrlMap      = new Map(); // URL original → blob URL em memória
const _blobUrlOrder    = [];        // FIX #18: controla ordem de inserção para eviction
const MAX_BLOB_URLS    = 60;        // FIX #18: limite para evitar memory leak

// FIX #18: armazena blob URL com eviction do mais antigo quando necessário
function _setBlobUrl(originalUrl, blobUrl) {
  if (_blobUrlMap.has(originalUrl)) return; // já existe, não sobrescreve referência viva
  if (_blobUrlMap.size >= MAX_BLOB_URLS) {
    const oldest = _blobUrlOrder.shift();
    if (oldest && _blobUrlMap.has(oldest)) {
      URL.revokeObjectURL(_blobUrlMap.get(oldest));
      _blobUrlMap.delete(oldest);
    }
  }
  _blobUrlMap.set(originalUrl, blobUrl);
  _blobUrlOrder.push(originalUrl);
}

/**
 * Faz fetch de uma URL e devolve um blob URL cacheado.
 * Evita recarregar mídia já vista.
 * @param {string} url
 * @returns {Promise<string>} blob URL
 */
async function fetchWithCache(url) {
  if (!url) return url;

  // Já em memória nesta sessão?
  if (_blobUrlMap.has(url)) return _blobUrlMap.get(url);

  // Checa IndexedDB
  try {
    const db = await openDB();
    const cached = await new Promise((res, rej) => {
      const tx  = db.transaction('blobcache', 'readonly');
      const req = tx.objectStore('blobcache').get(url);
      req.onsuccess = () => res(req.result ?? null);
      req.onerror   = () => rej(req.error);
    });

    if (cached && (Date.now() - cached.ts) < MAX_CACHE_AGE_MS) {
      const blobUrl = URL.createObjectURL(cached.blob);
      _setBlobUrl(url, blobUrl); // FIX #18
      return _blobUrlMap.get(url) || blobUrl;
    }
  } catch (e) {
    console.warn('[fetchWithCache] IDB read fail:', e);
  }

  // Faz o fetch e salva
  try {
    const res  = await fetch(url);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    _setBlobUrl(url, blobUrl); // FIX #18

    // Salva no IDB de forma assíncrona (não bloqueia o retorno)
    openDB().then(db => {
      const tx = db.transaction('blobcache', 'readwrite');
      tx.objectStore('blobcache').put({ url, blob, ts: Date.now() });
    }).catch(() => {});

    return blobUrl;
  } catch (e) {
    console.warn('[fetchWithCache] fetch fail:', e);
    return url; // fallback: URL original
  }
}

// ── STORAGE PERSISTENTE ───────────────────────────

async function requestPersistentStorage() {
  if (navigator?.storage?.persist) {
    try {
      const granted = await navigator.storage.persist();
      console.log('[DB] Persistent storage:', granted ? 'granted' : 'denied');
    } catch (e) {
      console.warn('[DB] persist() failed:', e);
    }
  }
}
