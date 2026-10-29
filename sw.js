// Solo se usa cuando el cotizador se instala como app web (iPhone / navegador). En Android el APK ya trae todos los archivos.
const CACHE = 'apex-cotizador-v2';
const ARCHIVOS = ['./', 'index.html', 'app.css', 'app.js', 'db.js', 'sync.js', 'config.js', 'pdf-presupuesto.js',
  'vendor/supabase.js', 'vendor/jspdf.umd.min.js', 'vendor/pdf.min.js', 'vendor/pdf.worker.min.js', 'fonts/inter-latin.woff2', 'manifest.json', 'icon.svg'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARCHIVOS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if(e.request.method !== 'GET' || u.origin !== location.origin) return;       // Supabase y fotos van directo a la red
  e.respondWith(fetch(e.request).then(r => { const copia = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copia)); return r; }).catch(() => caches.match(e.request)));
});
