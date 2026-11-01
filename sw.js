// แคชแบบ stale-while-revalidate: เปิดจากแคชทันที (ออฟไลน์ได้) และอัปเดตเบื้องหลังเมื่อมีเน็ต
const C='golf-v8';const F=['./','./index.html','./manifest.webmanifest','./icon-192.png','./icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(F)));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C).map(x=>caches.delete(x)))));self.clients.claim()});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET'||new URL(e.request.url).origin!==location.origin)return;
  const net=fetch(e.request).then(r=>{if(r.ok){const cl=r.clone();caches.open(C).then(c=>c.put(e.request,cl))}return r}).catch(()=>null);
  e.waitUntil(net.then(()=>{}));
  e.respondWith(caches.match(e.request,{ignoreSearch:true}).then(hit=>hit||net.then(r=>r||caches.match('./index.html'))));
});
