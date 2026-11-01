// Service worker: deja abrir la app sin conexión. Los archivos propios van "red primero"
// (así cada publicación llega al toque) y las librerías y fuentes, "caché primero".
const CACHE = 'bolsillo-v1';
const ARCHIVOS = [
  './', './index.html', './styles.css', './app.js', './store.js', './config.js',
  './manifest.webmanifest', './icons/icon-192.png', './icons/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(claves => Promise.all(claves.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

function redPrimero(req) {
  // no-cache: revalida contra el servidor en vez de usar la caché HTTP del navegador.
  return fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }).then(res => {
    if (res.ok) {
      const copia = res.clone();
      caches.open(CACHE).then(c => c.put(req, copia));
    }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('./index.html')));
}

function cachePrimero(req) {
  return caches.match(req).then(r => r || fetch(req).then(res => {
    if (res.ok || res.type === 'opaque') {
      const copia = res.clone();
      caches.open(CACHE).then(c => c.put(req, copia));
    }
    return res;
  }));
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    e.respondWith(redPrimero(req));
  } else if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com'
    || (url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/'))) {
    e.respondWith(cachePrimero(req));
  }
  // El resto (Firestore, login, cotización del dólar) va directo a la red.
});
