// Battery saving: screen-on lock released when idle, GPS off in background, battery saver polls GPS
const { phone, open, createGang } = require('../helpers');
const fakes = () => {
  const L = window.__L = { watch: 0, once: 0, active: 0, wlReq: 0, wlRel: 0 };
  const fix = cb => setTimeout(() => cb({ coords: { latitude: 13 + Math.random() * 1e-4, longitude: 101, accuracy: 5 } }), 10);
  Object.defineProperty(navigator, 'geolocation', { value: { watchPosition(cb) { L.watch++; L.active++; fix(cb); return L.watch; }, clearWatch() { L.active--; }, getCurrentPosition(cb) { L.once++; fix(cb); } } });
  Object.defineProperty(navigator, 'wakeLock', { value: { request: async () => { L.wlReq++; const ls = []; return { addEventListener: (e, f) => ls.push(f), release: async () => { L.wlRel++; ls.forEach(f => f()); } }; } } });
};
const vis = (p, v) => p.evaluate(v => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v }); document.dispatchEvent(new Event('visibilitychange')); }, v);
module.exports = async t => {
  const P = await phone(t, fakes), H = await P.page();
  await H.clock.install();
  await open(t, H); await createGang(H);
  await H.tap('[data-tab=hole]'); await H.clock.runFor(1000);
  const L = () => H.evaluate(() => ({ ...window.__L }));
  let s = await L();
  t.ok('GPS watch + screen lock on in game', s.active === 1 && s.wlReq === 1, s);
  await H.clock.runFor(120000); s = await L();
  t.ok('screen lock kept at 2 min idle', s.wlRel === 0, s);
  await H.clock.runFor(80000); s = await L();
  t.ok('screen lock released after 3 min idle', s.wlRel === 1, s);
  await H.tap('[data-tab=sum]'); await H.clock.runFor(500); s = await L();
  t.ok('touch takes screen lock again', s.wlReq === 2, s);
  await vis(H, 'hidden'); s = await L();
  t.ok('GPS off when app hidden', s.active === 0, s);
  await vis(H, 'visible'); s = await L();
  t.ok('GPS back on when visible', s.active === 1, s);
  await H.tap('[data-tab=gang]'); await H.tap('[data-act=eco]'); await H.clock.runFor(500);
  await H.tap('[data-tab=hole]'); const a = await L(); await H.clock.runFor(61000); s = await L();
  t.ok('battery saver: no continuous GPS, polls ~every 20 s', s.active === 0 && s.once - a.once >= 3 && s.once - a.once <= 4, { ...s, polls: s.once - a.once });
  await H.tap('[data-tab=map]'); await H.clock.runFor(500); s = await L();
  t.ok('battery saver: map tab uses live GPS', s.active === 1, s);
  t.ok('no page errors', !P.errs.length, P.errs);
  await P.ctx.close();
};
