// Golf Live service worker: เปิดแอปเร็ว (แคชตัวแอป) + แคชภาพดาวเทียมที่เคยดู
const C = 'golflive-v5', TILES = 'golflive-tiles';
const SHELL = ['./', './index.html', './app.js', './store.js', './golf.js', './map.js', './config.js', './vendor/fb.js', './vendor/leaflet.js', './vendor/leaflet.css', './vendor/qrcode.mjs', './manifest.webmanifest', './icon-192.png', './icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(C).then(c => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== C && x !== TILES).map(x => caches.delete(x))))); self.clients.claim(); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (u.hostname === 'server.arcgisonline.com') { // ภาพดาวเทียม: ใช้ที่แคชไว้ก่อน
    e.respondWith(caches.open(TILES).then(async c => (await c.match(e.request)) || fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; })));
    return;
  }
  if (u.origin !== location.origin) return;
  const net = fetch(e.request).then(r => { if (r.ok) { const cl = r.clone(); caches.open(C).then(c => c.put(e.request, cl)); } return r; }).catch(() => null);
  e.waitUntil(net.then(() => {}));
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => hit || net.then(r => r || caches.match('./index.html'))));
});
