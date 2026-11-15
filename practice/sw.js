// ซ้อมกอล์ฟ service worker: ดึงจากเน็ตก่อน ถ้าไม่มีเน็ตหรือช้าเกิน 3 วินาที ใช้สำเนาในเครื่อง
const C = 'golfpractice-v1';
const SHELL = ['./', './index.html', './app.js', './practice.js', './core.js', './manifest.webmanifest', './icon-192.png', './icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(C).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' }))))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x.startsWith('golfpractice') && x !== C).map(x => caches.delete(x))))); self.clients.claim(); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || !u.pathname.startsWith(new URL('./', self.registration.scope).pathname)) return;
  const net = fetch(e.request, { cache: 'no-cache' }).then(r => { if (r.ok) { const cl = r.clone(); caches.open(C).then(c => c.put(e.request, cl)); } return r; });
  e.waitUntil(net.then(() => {}, () => {}));
  const cached = () => caches.open(C).then(c => c.match(e.request, { ignoreSearch: true }).then(hit => hit || c.match('./index.html')));
  e.respondWith(new Promise(resolve => {
    let done = false; const fin = r => { if (!done && r) { done = true; resolve(r); } };
    const t = setTimeout(() => cached().then(fin), 3000);
    net.then(r => { clearTimeout(t); fin(r); }, () => { clearTimeout(t); cached().then(r => r ? fin(r) : fin(Response.error())); });
  }));
});
