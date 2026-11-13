// แอปออฟไลน์ตัวเดิมเลิกใช้แล้ว: ลบแคชเก่า ถอนตัวเอง แล้วพาไปแอปใหม่
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k.startsWith('golf-v')) await caches.delete(k);
  await self.registration.unregister();
  for (const c of await self.clients.matchAll({ type: 'window' })) c.navigate(new URL('../', self.registration.scope).href);
})()));
