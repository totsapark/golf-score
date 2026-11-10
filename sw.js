// Golf Live service worker
// - ตัวแอป: ดึงจากเน็ตก่อน (ได้เวอร์ชันล่าสุดทันที) ถ้าไม่มีเน็ตหรือช้าเกิน 3 วินาที ใช้สำเนาในเครื่อง
// - ภาพดาวเทียม: ใช้ที่เก็บไว้ในเครื่องก่อน (เก็บเฉพาะส่วนที่เคยเปิดดู)
const C = 'golflive-v8', TILES = 'golflive-tiles';
const SHELL = ['./', './index.html', './app.js', './store.js', './golf.js', './map.js', './config.js', './vendor/fb.js', './vendor/leaflet.js', './vendor/leaflet.css', './vendor/qrcode.mjs', './manifest.webmanifest', './icon-192.png', './icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(C).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' }))))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== C && x !== TILES).map(x => caches.delete(x))))); self.clients.claim(); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (u.hostname === 'server.arcgisonline.com') {
    e.respondWith(caches.open(TILES).then(async c => (await c.match(e.request)) || fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; })));
    return;
  }
  if (u.origin !== location.origin) return;
  const net = fetch(e.request, { cache: 'no-cache' }).then(r => { if (r.ok) { const cl = r.clone(); caches.open(C).then(c => c.put(e.request, cl)); } return r; });
  e.waitUntil(net.then(() => {}, () => {}));
  const cached = () => caches.match(e.request, { ignoreSearch: true }).then(hit => hit || caches.match('./index.html'));
  e.respondWith(new Promise(resolve => {
    let done = false; const fin = r => { if (!done && r) { done = true; resolve(r); } };
    const t = setTimeout(() => cached().then(fin), 3000);           // เน็ตช้า → ใช้สำเนาในเครื่องไปก่อน
    net.then(r => { clearTimeout(t); fin(r); }, () => { clearTimeout(t); cached().then(r => r ? fin(r) : fin(Response.error())); });
  }));
});
