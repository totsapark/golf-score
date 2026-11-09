// ชั้นเก็บข้อมูล: Firebase Realtime Database (ใช้งานจริง) หรือฐานข้อมูลจำลองในเบราว์เซอร์ (?mock=1 สำหรับทดสอบ)
const clean = v => v === undefined ? null : JSON.parse(JSON.stringify(v));

class MockStore {
  constructor() {
    this.k = 'golf_mockdb'; this.subs = new Set(); this.kind = 'mock'; this.off = false; this.q = []; this.ocb = [];
    // ใช้ทดสอบ: window.__mockOffline(true) = จำลองสัญญาณหาย (การเขียนค้างจนกว่าจะกลับมา)
    window.__mockOffline = v => { this.off = v; this.ocb.forEach(f => f(!v)); if (!v) { const q = this.q; this.q = []; q.forEach(f => f()); } };
    this.bc = new BroadcastChannel('golf_mockdb');
    this.bc.onmessage = () => this.emit();
    addEventListener('storage', e => { if (e.key === this.k) this.emit(); });
  }
  root() { try { return JSON.parse(localStorage.getItem(this.k)) || {}; } catch (e) { return {}; } }
  write(r) { localStorage.setItem(this.k, JSON.stringify(r)); this.bc.postMessage(1); setTimeout(() => this.emit()); }
  at(r, p) { return p.split('/').filter(Boolean).reduce((o, k) => o == null ? undefined : o[k], r); }
  put(r, p, v) {
    const ks = p.split('/').filter(Boolean); let o = r;
    ks.slice(0, -1).forEach(k => { if (typeof o[k] !== 'object' || o[k] === null) o[k] = {}; o = o[k]; });
    const last = ks[ks.length - 1];
    if (v === null || v === undefined) delete o[last]; else o[last] = clean(v);
  }
  set(p, v) { if (this.off) return new Promise(res => this.q.push(() => this.set(p, v).then(res))); const r = this.root(); this.put(r, p, v); this.write(r); return Promise.resolve(); }
  async update(p, obj) { const r = this.root(); for (const k in obj) this.put(r, p + '/' + k, obj[k]); this.write(r); }
  async get(p) { return clean(this.at(this.root(), p) ?? null); }
  async txn(p, fn) { const r = this.root(); const nv = fn(clean(this.at(r, p) ?? null)); if (nv !== undefined) { this.put(r, p, nv); this.write(r); } return nv; }
  on(p, cb) { const s = { p, cb, last: undefined }; this.subs.add(s); setTimeout(() => this.fire(s)); return () => this.subs.delete(s); }
  fire(s) { const v = this.at(this.root(), s.p) ?? null, j = JSON.stringify(v); if (j !== s.last) { s.last = j; s.cb(clean(v)); } }
  emit() { this.subs.forEach(s => this.fire(s)); }
  async auth() { let u = sessionStorage.getItem('mockuid'); if (!u) { u = 'u' + Math.random().toString(36).slice(2, 9); sessionStorage.setItem('mockuid', u); } return u; }
  online(cb) { cb(navigator.onLine && !this.off); this.ocb.push(cb); }
  reconnect() {}
}

class FireStore {
  constructor(F, cfg) {
    this.F = F; this.kind = 'firebase';
    this.app = F.initializeApp(cfg); this.db = F.getDatabase(this.app); this.au = F.getAuth(this.app);
  }
  r(p) { return this.F.ref(this.db, p); }
  set(p, v) { return this.F.set(this.r(p), clean(v)); }
  update(p, o) { const c = {}; for (const k in o) c[k] = clean(o[k]); return this.F.update(this.r(p), c); }
  async get(p) { return (await this.F.get(this.r(p))).val(); }
  async txn(p, fn) { const res = await this.F.runTransaction(this.r(p), cur => { const n = fn(cur); return n === undefined ? undefined : clean(n); }); return res.snapshot.val(); }
  on(p, cb) { return this.F.onValue(this.r(p), s => cb(s.val())); }
  // ใช้ตัวตนเดิมที่จำไว้ในเครื่องก่อน (เปิดแอปตอนไม่มีเน็ตก็ได้) ถ้าไม่มีค่อยสมัครแบบไม่ระบุตัวตน
  async auth() {
    await this.au.authStateReady();
    if (this.au.currentUser) return this.au.currentUser.uid;
    return (await this.F.signInAnonymously(this.au)).user.uid;
  }
  online(cb) { this.F.onValue(this.r('.info/connected'), s => cb(!!s.val())); }
  reconnect() { try { this.F.goOnline(this.db); } catch (e) {} }
}

export async function makeStore(cfg) {
  const mock = new URLSearchParams(location.search).has('mock');
  if (mock || !cfg) return mock ? new MockStore() : null;
  const F = await import('./vendor/fb.js');
  return new FireStore(F, cfg);
}
