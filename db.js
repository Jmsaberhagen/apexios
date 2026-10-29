'use strict';
// =====================================================================
// Base local del teléfono (IndexedDB): todo lo que hace falta para cotizar sin señal.
// =====================================================================
const DB = (() => {
  let _db = null;
  function open(){
    if(_db) return Promise.resolve(_db);
    return new Promise((res, rej) => {
      const r = indexedDB.open('apex-cotizador', 1);
      r.onupgradeneeded = () => {
        const d = r.result;
        d.createObjectStore('kv');                                   // perfil, catálogo, sucursales, última sync...
        d.createObjectStore('clientes', { keyPath:'id' });
        d.createObjectStore('presupuestos', { keyPath:'key' });      // 'srv:<id>' o 'loc:<uuid>' (creados sin señal)
        d.createObjectStore('fotos');                                // url -> { data, w, h }
      };
      r.onsuccess = () => { _db = r.result; res(_db); };
      r.onerror = () => rej(r.error);
    });
  }
  function run(store, mode, fn){
    return open().then(db => new Promise((res, rej) => {
      const t = db.transaction(store, mode);
      const s = t.objectStore(store);
      let req;
      try{ req = fn(s); } catch(e){ rej(e); return; }
      t.oncomplete = () => res(req instanceof IDBRequest ? req.result : undefined);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error);
    }));
  }
  return {
    get:  (store, key)      => run(store, 'readonly',  s => s.get(key)),
    all:  (store)           => run(store, 'readonly',  s => s.getAll()),
    put:  (store, val, key) => run(store, 'readwrite', s => key === undefined ? s.put(val) : s.put(val, key)),
    del:  (store, key)      => run(store, 'readwrite', s => s.delete(key)),
    clear:(store)           => run(store, 'readwrite', s => s.clear()),
    keys: (store)           => run(store, 'readonly',  s => s.getAllKeys()),
    putMany: (store, arr)   => run(store, 'readwrite', s => { arr.forEach(v => s.put(v)); return s.count(); }),
  };
})();

// Fotos de modelos guardadas en el teléfono (las usa el generador de PDF)
async function fotoCacheGet(url){ try{ return (await DB.get('fotos', url)) || null; } catch(e){ return null; } }
async function fotoCachePut(url, out){ try{ await DB.put('fotos', out, url); } catch(e){ console.warn('No se pudo guardar la foto', e); } }
