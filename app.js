import { FIREBASE_CONFIG } from './config.js';
import { makeStore } from './store.js';
import * as K from './golf.js';
import qrcode from './vendor/qrcode.mjs';
import { createMap, CLUB_MAIN, CLUB_SUB, CLUB_ORDER, clubCat, SAT, personIcon, searchCourses, importOSM } from './map.js';

const APPVER = '2.5.1';
const $app = document.getElementById('app');
const Q = new URLSearchParams(location.search), MOCK = Q.has('mock');
const DEV = MOCK ? sessionStorage : localStorage;   // ตัวตนของเครื่อง (mock = แยกต่อแท็บเพื่อทดสอบ)
const { hk } = K;
let ST = null, UID = null, G = null, CODE = null, ME = null, unsub = null, online = true, firstSnap = true, pending = false, mapObj = null, gps = null, gpsWatch = null, lastPosSent = 0, lastPos = null, LOCS = {}, locUnsub = null, liveMap = null;
const UI = { view: 'loading', tab: 'hole', cur: 0, editPid: null, sortBy: 'gross', joinMeta: null, pinOk: false, courses: {} };

/* ---------- local storage helpers ---------- */
const jget = (s, k, d) => { try { return JSON.parse(s.getItem(k)) ?? d; } catch (e) { return d; } };
const jset = (s, k, v) => { try { s.setItem(k, JSON.stringify(v)); } catch (e) {} };
const ids = () => jget(DEV, 'golf2_ids', {}), setId = (c, v) => { const o = ids(); if (v) o[c] = v; else delete o[c]; jset(DEV, 'golf2_ids', o); };
const myGames = () => jget(DEV, 'golf2_games', []);
// ลบแก๊งออกจากเครื่องนี้ (รายการล่าสุด + ข้อมูลที่เก็บไว้)
function forgetGame(code) {
  jset(DEV, 'golf2_games', myGames().filter(x => x.code !== code)); setId(code, null);
  ['golf2_cache_', 'golf2_outbox_', 'golf2_geo_', 'golf2_geop_', 'golf2_cur_', 'golf2_pin_', 'golf2_seen_'].forEach(k => DEV.removeItem(k + code));
  const a = jget(DEV, 'golf2_active', null); if (a && a.code === code) jset(DEV, 'golf2_active', null);
}
const addMyGame = g => { const a = myGames().filter(x => x.code !== g.code); a.unshift(g); jset(DEV, 'golf2_games', a.slice(0, 15)); };
const PREF = jget(localStorage, 'golf2_prefs', { unit: 'y', sun: false, wake: true, sat: true });
const setPref = (k, v) => { PREF[k] = v; jset(localStorage, 'golf2_prefs', PREF); };
let HIST = jget(localStorage, 'golf2_hist', []);

function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function today() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function thDate(s) { if (!s) return ''; const [y, m, d] = s.split('-'); return `${+d} ${['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'][m - 1]} ${(+y + 543) % 100}`; }
function ago(t) { const s = Math.round((Date.now() - t) / 1000); return s < 60 ? 'เมื่อกี้' : s < 3600 ? Math.round(s / 60) + ' นาทีที่แล้ว' : Math.round(s / 3600) + ' ชม.ที่แล้ว'; }
async function sha(s) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); }
const COLORS = ['#2e7d32', '#ef6c00', '#6a1b9a', '#1565c0', '#c62828', '#00838f', '#5d4037', '#ad1457', '#558b2f', '#283593'];
function newCode() { const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789', a = new Uint32Array(6); crypto.getRandomValues(a); return [...a].map(x => A[x % A.length]).join(''); }
const slug = s => s.trim().toLowerCase().replace(/[.#$\[\]\/\s]+/g, '-').slice(0, 60);

/* ---------- dialogs ---------- */
function dlg(html, bind) { const d = document.createElement('div'); d.className = 'dlg'; d.innerHTML = `<div class="dlgbox">${html}</div>`; document.body.appendChild(d); bind && bind(d); return d; }
function ask(msg) { return new Promise(res => { dlg(`<p>${esc(msg)}</p><div class="grid2"><button class="btn sec" data-r="0">ยกเลิก</button><button class="btn" data-r="1">ตกลง</button></div>`, d => d.addEventListener('click', e => { const b = e.target.closest('[data-r]'); if (!b) return; d.remove(); res(b.dataset.r === '1'); })); }); }
function info(title, html) { dlg(`<h3 style="margin:0 0 10px;color:#1b5e20">${title}</h3><div style="text-align:left;font-size:15px;line-height:1.6">${html}</div><button class="btn full" data-r>ปิด</button>`, d => d.addEventListener('click', e => { if (e.target.closest('[data-r]')) d.remove(); })); }
function choose(title, opts) { return new Promise(res => { dlg(`<p><b>${title}</b></p>${opts.map(([v, t]) => `<button class="btn sec full" data-v="${v}">${t}</button>`).join('')}<button class="btn red full" data-v="">ยกเลิก</button>`, d => d.addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (!b) return; d.remove(); res(b.dataset.v || null); })); }); }
// เลือกไม้ 2 ขั้น: ประเภท → เบอร์ (จำเบอร์ล่าสุดของแต่ละประเภท)
function chooseClub(title = 'ตีด้วยไม้อะไร?') { return new Promise(res => {
  const last = jget(localStorage, 'golf2_lastclub', {}), d = dlg(''), box = d.querySelector('.dlgbox');
  const step1 = () => { box.innerHTML = `<p><b>${title}</b></p><div class="cmain">${CLUB_MAIN.map(([c, t]) => `<button data-c="${c}"><b>${c}</b><small>${CLUB_SUB[c] ? (last[c] ? 'ล่าสุด ' + last[c] + ' ›' : 'เลือกเบอร์ ›') : t}</small></button>`).join('')}</div><button class="btn red full" data-x="1">ยกเลิก</button>`; };
  const step2 = c => { box.innerHTML = `<p><b>${c} · เบอร์อะไร?</b></p><div class="cnum">${CLUB_SUB[c].map(n => `<button data-v="${n}" class="${last[c] === n ? 'on' : ''}">${n}</button>`).join('')}</div>
    <button class="btn sec full" data-v="${c}">ไม่ระบุเบอร์ (${c})</button><button class="btn sec full" data-back="1">‹ เปลี่ยนประเภทไม้</button>`; };
  step1();
  d.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.x) { d.remove(); res(null); return; }
    if (b.dataset.back) { step1(); return; }
    if (b.dataset.c) { const c = b.dataset.c; if (CLUB_SUB[c]) step2(c); else { d.remove(); res(c); } return; }
    if (b.dataset.v) { const v = b.dataset.v, cat = clubCat(v); if (v !== cat) { last[cat] = v; jset(localStorage, 'golf2_lastclub', last); } d.remove(); res(v); } });
}); }
function toast(msg) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2600); }

/* ---------- กันหลุด: แคชแก๊งไว้ในเครื่อง + คิวรอส่ง (ส่งซ้ำจนเซิร์ฟเวอร์ยืนยัน) ---------- */
let OUT = {}, cacheTimer = null;
const ckey = () => 'golf2_cache_' + CODE, okey = () => 'golf2_outbox_' + CODE;
function loadOutbox() { OUT = jget(DEV, okey(), {}); }
function saveOutbox() { jset(DEV, okey(), OUT); hdr(); }
function saveCache() { clearTimeout(cacheTimer); const code = CODE, g = G; cacheTimer = setTimeout(() => { if (g && code) jset(DEV, 'golf2_cache_' + code, g); }, 300); }
function setIn(o, rel, v) { const ks = rel.split('/'); let x = o; ks.slice(0, -1).forEach(k => { if (typeof x[k] !== 'object' || x[k] === null) x[k] = {}; x = x[k]; }); const l = ks[ks.length - 1]; if (v === null || v === undefined) delete x[l]; else x[l] = JSON.parse(JSON.stringify(v)); }
// เขียนข้อมูลแก๊ง: แสดงผลทันที → เก็บในคิวในเครื่อง → ส่งขึ้นเซิร์ฟเวอร์ (ปิดแอป/เน็ตหลุด ก็ส่งต่อเองเมื่อกลับมา)
function gw(rel, v) {
  OUT[rel] = { v: v ?? null, seq: Date.now() + Math.random() }; saveOutbox();
  if (G) { setIn(G, rel, v); saveCache(); refresh(); }
  push(rel);
}
function push(rel) {
  const e = OUT[rel], code = CODE; if (!e || !ST) return;
  ST.set(`games/${code}/${rel}`, e.v).then(() => { if (CODE === code && OUT[rel] && OUT[rel].seq === e.seq) { delete OUT[rel]; saveOutbox(); } }).catch(() => {});
}
function flushOutbox() { Object.keys(OUT).forEach(push); }
function refresh() {
  if (UI.view !== 'game' || !G) return;
  if (UI.tab === 'map' && mapObj) { mapObj.update(false); hdr(); return; }
  if (document.activeElement && document.activeElement.matches('#app input,#app textarea,#app select')) { pending = true; hdr(); return; }
  render();
}
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
// กลับมาที่แอป (เปิดจอ/สลับแอปกลับมา/เน็ตกลับมา): ต่อเน็ตใหม่ ส่งของค้าง เปิด GPS ใหม่
function onResume() {
  if (document.visibilityState !== 'visible') return;
  keepAwake(); if (!ST) return;
  ST.reconnect(); flushOutbox();
  if (UI.view === 'game' && G) { stopGps(); startGps(); sendLoc(true); autoDraw(); refresh(); }
}
document.addEventListener('visibilitychange', onResume);
addEventListener('pageshow', onResume); addEventListener('focus', onResume); addEventListener('online', onResume);
const ACTIVE_MS = 36 * 3600e3;
function setActive(code) { jset(DEV, 'golf2_active', code ? { code, t: Date.now() } : null); }

/* ---------- boot / routing ---------- */
async function boot() {
  applyPrefs();
  try { ST = await makeStore(FIREBASE_CONFIG); } catch (e) { ST = null; }
  if (!ST) { UI.view = 'nocfg'; render(); return; }
  try { UID = await ST.auth(); } catch (e) {
    const c = String(e.code || e.message || '');
    UI.err = c.includes('configuration-not-found') || c.includes('operation-not-allowed') ? 'ระบบยังตั้งค่าไม่เสร็จ: ต้องเปิด Anonymous ใน Firebase Authentication ก่อน (คนสร้างแอป)'
      : c.includes('network') ? 'ยังเชื่อมต่ออินเทอร์เน็ตไม่ได้ · เปิดแอปครั้งแรกต้องมีเน็ต' : e.message;
    UI.view = 'err'; render(); return; }
  ST.online(v => { const was = online; online = v; hdr(); if (v && !was) onResume(); });
  CODE = (Q.get('g') || '').toUpperCase() || null;
  if (!CODE) { // เปิดแอปใหม่ (เช่น iPhone ปิดแอปไปเอง) → กลับเข้าแก๊งที่เล่นอยู่ทันที
    const a = jget(DEV, 'golf2_active', null);
    if (a && Date.now() - a.t < ACTIVE_MS && ids()[a.code]) { CODE = a.code; const u = new URL(location.href); u.searchParams.set('g', CODE); history.replaceState({}, '', u); }
  }
  if (CODE) history.pushState({}, '', location.href); // กันปุ่มย้อนกลับของ Android หลุดออกจากแอป
  route();
}
function setUrl(code) { const u = new URL(location.href); if (code) u.searchParams.set('g', code); else u.searchParams.delete('g'); history.pushState({}, '', u); }
function go(code) { if (!code) setActive(null); setUrl(code); CODE = code; route(); }
// ปุ่มย้อนกลับ (Android): ปิดหน้าต่าง → กลับแท็บจดสกอร์ → ไม่หลุดออกจากแก๊ง
addEventListener('popstate', () => {
  const nc = (new URLSearchParams(location.search).get('g') || '').toUpperCase() || null;
  const keep = () => { const u = new URL(location.href); u.searchParams.set('g', CODE); history.pushState({}, '', u); };
  const d = document.querySelector('.dlg');
  if (d && UI.view === 'game') { d.remove(); keep(); return; }
  if (UI.view === 'game' && CODE) { keep(); if (UI.tab !== 'hole') { UI.tab = 'hole'; jset(DEV, 'golf2_tab', 'hole'); render(); scrollTo(0, 0); } else toast('ยังอยู่ในแก๊ง · กลับหน้าแรกได้ที่แท็บ 👥 แก๊ง'); return; }
  CODE = nc; route();
});
async function route() {
  if (locUnsub) { locUnsub(); locUnsub = null; LOCS = {}; } if (liveMap) { liveMap.m.remove(); liveMap = null; }
  if (unsub) { unsub(); unsub = null; } if (geoUnsub) { geoUnsub(); geoUnsub = null; geoCache = null; } if (mapObj) { mapObj.destroy(); mapObj = null; } G = null; firstSnap = true; stopGps();
  if (!CODE) { UI.view = 'home'; render(); ST.get('courses').then(c => { UI.courses = c || {}; if (UI.view === 'home' || UI.view === 'create') render(); }).catch(() => {}); return; }
  const id = ids()[CODE], cached = id ? jget(DEV, ckey(), null) : null;
  loadOutbox();
  if (id && cached && cached.meta && cached.players?.[id.pid]) { // มีข้อมูลในเครื่อง → เปิดได้ทันทีแม้ไม่มีเน็ต
    ME = id.pid; UI.editPid = ME; UI.view = 'game'; UI.tab = jget(DEV, 'golf2_tab', 'hole');
    G = cached; G.meta.code = CODE; for (const r in OUT) setIn(G, r, OUT[r].v);
    UI.cur = Math.min(jget(DEV, 'golf2_cur_' + CODE, 0), K.nHoles(G) - 1); setActive(CODE); render();
  } else {
    UI.view = 'loading'; render();
    let meta = null, err = null; try { meta = await withTimeout(ST.get('games/' + CODE + '/meta'), 12000); } catch (e) { err = e; }
    if (!meta) { UI.view = err ? 'nonet' : 'notfound'; render(); return; }
    if (!id) { UI.view = 'join'; UI.joinMeta = meta; UI.pinOk = false; render(); return; }
    ME = id.pid; UI.editPid = ME; UI.view = 'game'; UI.tab = jget(DEV, 'golf2_tab', 'hole');
    UI.cur = jget(DEV, 'golf2_cur_' + CODE, 0); setActive(CODE);
  }
  flushOutbox();
  unsub = ST.on('games/' + CODE, g => onGame(g));
  locUnsub = ST.on('locs/' + CODE, v => { LOCS = v || {}; if (mapObj) mapObj.people(); updateLiveMap(); });
  geoCache = jget(DEV, 'golf2_geo_' + CODE, null); geoChanged();
  geoUnsub = ST.on('geos/' + CODE, v => {
    const pend = jget(DEV, 'golf2_geop_' + CODE, 0);
    if (pend && geoCache && (v?.t || 0) < (geoCache.t || 0)) { ST.set('geos/' + CODE, geoCache).then(() => jset(DEV, 'golf2_geop_' + CODE, 0)); return; } // ของในเครื่องใหม่กว่า → ส่งขึ้น
    geoCache = v; jset(DEV, 'golf2_geo_' + CODE, v); geoChanged();
  });
}
function onGame(g) {
  if (!g || !g.meta) { if (!Object.keys(OUT).length) forgetGame(CODE); UI.view = 'notfound'; render(); return; }
  for (const r in OUT) setIn(g, r, OUT[r].v); // ของที่ยังส่งไม่สำเร็จ ให้แสดงค่าล่าสุดของเครื่องนี้
  g.meta.code = CODE; G = g; saveCache(); setActive(CODE);
  if (!G.players?.[ME]) { setId(CODE, null); toast('คุณไม่ได้อยู่ในแก๊งนี้แล้ว'); route(); return; }
  if (firstSnap) { const p = G.pos?.[ME]; if (p && p.hole == null) sendHole(UI.cur); else if (!p) sendHole(UI.cur); UI.cur = Math.min(UI.cur, K.nHoles(G) - 1); }
  addMyGame({ code: CODE, name: G.meta.course || 'รอบกอล์ฟ', date: G.meta.date });
  autoDraw(); drawPopups();
  firstSnap = false;
  refresh();
}
document.addEventListener('focusout', () => setTimeout(() => { if (pending && !(document.activeElement && document.activeElement.matches('#app input,#app textarea'))) { pending = false; render(); } }, 50));

/* ---------- money draw (ทุกเครื่องพยายามสุ่ม แต่ transaction ให้ผลเดียว) ---------- */
// สุ่มเมื่อทุกคนจดครบ และไม่มีใครแก้คะแนนหลุมนั้นมา 20 วินาที (เผื่อแก้ตัวเลข)
const DRAW_DELAY = Q.has('fast') ? 0 : 20000;
function lastEdit(i) { return Math.max(0, ...K.players(G).map(p => K.ent(G, p.id, i)?.t || 0)); }
function autoDraw() {
  if (!G) return;
  const n = K.players(G).length; if (n < 2 || !K.moneyOn(G)) return;
  for (let i = 0; i < K.nHoles(G); i++) if (K.holeDone(G, i) && !G.draws?.[hk(i)] && Date.now() - lastEdit(i) >= DRAW_DELAY)
    ST.txn(`games/${CODE}/draws/${hk(i)}`, cur => cur || { picks: K.makePicks(n), t: Date.now() }).catch(() => {});
}
setInterval(() => { if (UI.view === 'game') autoDraw(); }, 4000);
function drawPopups() {
  const key = 'golf2_seen_' + CODE, seen = jget(DEV, key, {});
  const fresh = Object.keys(G.draws || {}).filter(h => !seen[h]);
  fresh.forEach(h => seen[h] = 1); jset(DEV, key, seen);
  if (firstSnap || !fresh.length || !K.moneyOn(G)) return;
  fresh.forEach(h => showDraw(+h.slice(1)));
}
function showDraw(i) {
  const d = dlg(`<p><b>🎲 สุ่มเงินหลุม ${i + 1}</b></p><div class="dice">🎲</div><p class="muted">กำลังสุ่ม...</p>`);
  setTimeout(() => {
    const mo = K.holeMoney(G, i), P = G.players || {};
    d.querySelector('.dlgbox').innerHTML = `<p><b>🎲 ผลสุ่มหลุม ${i + 1}</b></p>${mo.hits.map((h, k) => `<div class="pick"><span>ครั้งที่ ${k + 1}: อันดับ <b>${h.rank}</b><br><b>${h.who.map(id => esc(P[id]?.name)).join(', ')}</b></span><span class="pay">${h.amount}฿</span></div>`).join('') || '<p class="muted">ไม่มีใครโดน</p>'}
      ${mo.pay[ME] ? `<p class="pay">คุณเสีย ${mo.pay[ME]} บาท 😅</p>` : '<p>คุณรอด 😎</p>'}<button class="btn full" data-r>ตกลง</button>`;
    d.addEventListener('click', e => { if (e.target.closest('[data-r]')) d.remove(); });
  }, 1400);
}

/* ---------- GPS ---------- */
function startGps() {
  if (gpsWatch != null || !navigator.geolocation) return;
  gpsWatch = navigator.geolocation.watchPosition(p => {
    gps = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy, t: Date.now() };
    if (mapObj) mapObj.gps();
    if (UI.tab === 'hole') { const el = document.getElementById('gpsd'); if (el) el.innerHTML = gpsLine(); }
    sendLoc();
  }, () => {}, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
}
// ส่งตำแหน่งตัวเองให้เพื่อนเห็น: ทุก ~5 วิเมื่อขยับเกิน 5 ม. และอย่างน้อยทุก 30 วิ
function sendLoc(force) {
  if (!CODE || !ME || !gps || UI.view !== 'game') return;
  const now = Date.now(), moved = lastPos ? K.dist([lastPos.lat, lastPos.lng], [gps.lat, gps.lng]) : 1e9;
  if (!force && (now - lastPosSent < 5000 || (moved < 5 && now - lastPosSent < 30000))) return;
  lastPosSent = now; lastPos = { ...gps };
  ST.set(`locs/${CODE}/${ME}`, { lat: +gps.lat.toFixed(6), lng: +gps.lng.toFixed(6), acc: Math.round(gps.acc || 0), gt: now });
}
setInterval(() => sendLoc(), 10000);
function stopGps() { if (gpsWatch != null) { navigator.geolocation.clearWatch(gpsWatch); gpsWatch = null; } }
let geoCache = null, geoUnsub = null; // แผนที่สนามของแก๊ง (เก็บในเครื่องด้วย ใช้ได้ตอนไม่มีเน็ต)
window.__wiz = () => { UI.tab = 'map'; jset(DEV, 'golf2_tab', 'map'); render(); setTimeout(() => mapObj && mapObj.wizard(), 300); };
function geoChanged() { const el = document.getElementById('gpsd'); if (el) el.innerHTML = gpsLine(); if (mapObj) mapObj.setGeo(geoCache); updateLiveMap(); if (UI.view === 'game' && UI.tab === 'gang') refresh(); }
function saveGeo(g) {
  if (g) g.t = Date.now();
  geoCache = g; jset(DEV, 'golf2_geo_' + CODE, g); jset(DEV, 'golf2_geop_' + CODE, 1); geoChanged();
  const code = CODE; ST.set('geos/' + code, g).then(() => { if (CODE === code) jset(DEV, 'golf2_geop_' + code, 0); }).catch(() => {});
}
const geoStat = g => { const nh = Object.values(g?.holes || {}).filter(h => h.green).length, nf = (g?.features || []).length; return { nh, nf, ok: nh > 0 || nf > 0 }; };

/* ---------- ค้นหา / ดาวน์โหลดแผนที่สนาม ---------- */
function courseSearchDialog(initial) { return new Promise(res => {
  const d = dlg(`<p><b>🔎 ค้นหาสนามกอล์ฟ</b></p><div style="display:flex;gap:6px"><input id="cs_q" value="${esc(initial || '')}" placeholder="เช่น ปัญญาอินทรา, Alpine"><button class="btn" id="cs_go" style="flex:none">ค้นหา</button></div>
    <div id="cs_res" style="text-align:left;margin-top:10px"></div><button class="btn red full" data-x="1">ยกเลิก</button>`);
  let results = [];
  const run = async () => { const q = d.querySelector('#cs_q').value.trim(); if (!q) return; const box = d.querySelector('#cs_res');
    box.innerHTML = '<p class="muted center">กำลังค้นหา...</p>';
    try { results = await searchCourses(q); } catch (e) { box.innerHTML = '<p class="muted center">ค้นหาไม่ได้ ต้องมีอินเทอร์เน็ต</p>'; return; }
    box.innerHTML = results.length ? results.map((r, k) => `<button class="btn sec full" style="text-align:left" data-k="${k}">${r.golf ? '⛳' : '📍'} <b>${esc(r.name)}</b><br><span class="muted">${esc(r.addr)}</span></button>`).join('')
      : '<p class="muted center">ไม่พบ ลองพิมพ์ชื่อภาษาอังกฤษหรือไทยแบบอื่น</p>'; };
  d.querySelector('#cs_go').onclick = run; d.querySelector('#cs_q').addEventListener('keydown', e => { if (e.key === 'Enter') run(); });
  d.addEventListener('click', e => { const b = e.target.closest('[data-k],[data-x]'); if (!b) return; d.remove(); res(b.dataset.x ? null : results[+b.dataset.k]); });
  if (initial) run(); else setTimeout(() => d.querySelector('#cs_q').focus(), 50);
}); }
async function fetchCourse(at) {
  const w = dlg(`<p><b>⬇️ กำลังดาวน์โหลดแผนที่สนาม...</b></p><div class="dice">⛳</div><p class="muted">${esc(at.name || '')}</p>`);
  try {
    const d = await importOSM(at.lat, at.lng, at.radius || 2000); if (at.name && !d.name) d.name = at.name;
    d.cid = at.cid || (d.name ? slug(d.name) : '');
    if (d.cid) { // ข้อมูลที่เคยบันทึกไว้ (Par/HCP, ตำแหน่งหลุมที่ปักเอง) จากคลังสนามกลาง
      const [lib, lg] = await Promise.all([withTimeout(ST.get('courses/' + d.cid), 8000).catch(() => null), withTimeout(ST.get('coursegeo/' + d.cid), 8000).catch(() => null)]);
      d.lib = lib;
      if (lg?.holes) Object.entries(lg.holes).forEach(([h, x]) => { if (!d.holes[h] && x.green) d.holes[h] = x; });
      if (!d.features.length && lg?.features) d.features = lg.features;
      if (!d.outline && lg?.outline) d.outline = lg.outline;
    }
    w.remove(); return d;
  }
  catch (e) { w.remove(); info('ดาวน์โหลดไม่สำเร็จ', 'ต้องมีอินเทอร์เน็ต ลองใหม่อีกครั้ง<br><span class="muted">' + esc(e.message) + '</span>'); return null; }
}
// Par/HCP ของแต่ละหลุมจากข้อมูลที่ได้ (OpenStreetMap ก่อน แล้วคลังสนาม)
function parsOf(d) { const pars = {}, si = {}; for (let i = 0; i < 18; i++) { const h = hk(i), x = d.holes?.[h]; const p = x?.par || d.lib?.pars?.[h]; const s2 = x?.si || d.lib?.si?.[h]; if (p) pars[h] = +p; if (s2) si[h] = s2; } return { pars, si, n: Object.keys(pars).length }; }
function courseReport(d) {
  const nh = Object.values(d.holes).filter(h => h.green).length, nf = d.features.filter(f => !f.line && f.k !== 'course').length, P = parsOf(d);
  const tp = Object.values(P.pars).reduce((a, b) => a + b, 0);
  if (!nh && !nf && !P.n && !d.outline) return { ok: false, html: 'ไม่พบข้อมูลสนามนี้ใน OpenStreetMap<br>ตั้งค่าหลุมเองได้ที่แท็บ 🗺️ แผนที่ → ⚙️ → 🛠 ตั้งค่าหลุมเอง' };
  return { ok: true, nh, html: `${d.name ? '<b>' + esc(d.name) + '</b><br>' : ''}${P.n >= 18 ? `✅ Par ครบ 18 หลุม (Par ${tp})` : P.n ? `⚠️ Par ${P.n} หลุม` : '⚠️ ยังไม่มี Par (ตั้งได้ในแท็บแก๊ง)'}<br>
    ${nh >= 18 ? '✅' : '⚠️'} ตำแหน่งหลุม <b>${nh}</b>/18 หลุม · รูปทรงกรีน/บังเกอร์/น้ำ <b>${nf}</b> ชิ้น` };
}
function geoFrom(d) { return { holes: d.holes, features: d.features, center: d.center, outline: d.outline || null }; }
// ดาวน์โหลดเข้าแก๊งปัจจุบัน + เก็บเป็นแผนที่สนามไว้ใช้รอบหน้า
async function downloadIntoGame(at) {
  const d = await fetchCourse(at); if (!d) return;
  const rep = courseReport(d); if (!rep.ok) { info('ไม่พบข้อมูลสนาม', rep.html); return; }
  saveGeo({ ...geoFrom(d), holes: { ...(geoCache?.holes || {}), ...d.holes }, features: d.features.length ? d.features : (geoCache?.features || []) });
  const P = parsOf(d); Object.entries(P.pars).forEach(([h, v]) => gw(`holes/${h}/par`, v)); Object.entries(P.si).forEach(([h, v]) => gw(`holes/${h}/si`, v));
  if (P.n) gw('meta/parSrc', 'course');
  if (d.cid) gw('meta/cid', d.cid);
  if (d.lib?.cr && !G.meta.cr) gw('meta/cr', d.lib.cr); if (d.lib?.slope && !G.meta.slope) gw('meta/slope', d.lib.slope);
  if (!G.meta.course && (d.name || at.name)) gw('meta/course', d.name || at.name);
  info('ดาวน์โหลดแผนที่แล้ว ✓', rep.html + (rep.nh < 18 ? '<button class="btn full" onclick="this.closest(\'.dlg\').remove();window.__wiz()">🛠 ตั้งค่าหลุมเลย</button>' : ''));
}
async function searchDownload() { const r = await courseSearchDialog(G?.meta?.course || ''); if (r) downloadIntoGame(r); }
function gpsLine() {
  const h = geoCache?.holes?.[hk(UI.cur)];
  if (!h?.green || !gps) return '';
  const me = [gps.lat, gps.lng], d = K.dist(me, h.green), u = x => Math.round(PREF.unit === 'y' ? x * 1.09361 : x), un = PREF.unit === 'y' ? 'หลา' : 'ม.';
  if (d > 1500) return '';
  if (h.front && h.back) return `<div class="gpsrow"><div><b>${u(K.dist(me, h.front))}</b><small>หน้า</small></div><div><b class="c">${u(d)}</b><small>กลางกรีน (${un})</small></div><div><b>${u(K.dist(me, h.back))}</b><small>หลัง</small></div></div>`;
  return `ถึงกลางกรีน <b style="font-size:24px;color:#1b5e20">${u(d)}</b> ${un}`;
}

/* ---------- prefs / header ---------- */
function applyPrefs() { document.body.classList.toggle('sun', !!PREF.sun); keepAwake(); }
let wl = null;
async function keepAwake() {
  if (!PREF.wake) { if (wl) { try { await wl.release(); } catch (e) {} wl = null; } return; }
  if (wl || !('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
  try { wl = await navigator.wakeLock.request('screen'); wl.addEventListener('release', () => { wl = null; }); } catch (e) {}
}

function hdr() {
  document.getElementById('dot').classList.toggle('on', online);
  document.querySelector('[data-act=sun]').classList.toggle('on', !!PREF.sun);
  document.querySelector('[data-act=wake]').classList.toggle('on', !!PREF.wake);
  const game = UI.view === 'game' && G;
  document.getElementById('title').textContent = game ? '⛳ ' + (G.meta.course || 'Golf Live') : '⛳ Golf Live';
  const np = Object.keys(OUT).length;
  document.getElementById('hinfo').innerHTML = game ? `${CODE}<br>${online ? (np ? `กำลังส่ง ${np}` : 'ออนไลน์') : `<b style="color:#ffab91">ออฟไลน์${np ? ' · รอส่ง ' + np : ''}</b>`}` : (MOCK ? 'โหมดทดสอบ' : '');
  const nav = document.getElementById('tabs'); nav.hidden = !game; document.body.classList.toggle('nonav', !game);
  nav.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.tab === UI.tab));
}

/* ---------- render ---------- */
function render() {
  hdr();
  if (UI.view !== 'game' || UI.tab !== 'map') { if (mapObj) { mapObj.destroy(); mapObj = null; } }
  const v = UI.view;
  if (v === 'loading') $app.innerHTML = '<div class="card center muted">กำลังโหลด...</div>';
  else if (v === 'nocfg') rNoCfg();
  else if (v === 'err') $app.innerHTML = `<div class="card"><h2>เชื่อมต่อไม่ได้</h2><p>${esc(UI.err)}</p><button class="btn full" onclick="location.reload()">ลองใหม่</button></div>`;
  else if (v === 'home') rHome();
  else if (v === 'create') rCreate();
  else if (v === 'notfound') $app.innerHTML = `<div class="card center"><h2>ไม่พบแก๊ง ${esc(CODE)}</h2><p class="muted">รหัสอาจผิด หรือแก๊งถูกลบไปแล้ว</p><button class="btn full" data-act="home">กลับหน้าแรก</button></div>`;
  else if (v === 'join') rJoin();
  else if (v === 'nonet') $app.innerHTML = `<div class="card center"><h2>📶 ยังเชื่อมต่อไม่ได้</h2><p class="muted">เข้าแก๊งครั้งแรกต้องใช้อินเทอร์เน็ต หลังจากนั้นเปิดได้แม้สัญญาณหาย</p><button class="btn full" data-act="retry">ลองใหม่</button><button class="btn sec full" data-act="home">กลับหน้าแรก</button></div>`;
  else if (v === 'hist') rHist();
  else if (v === 'game' && G) {
    ({ hole: rHole, map: rMap, live: rLive, sum: rSum, gang: rGang })[UI.tab]();
    startGps(); if (UI.tab === 'live') mountLiveMap();
  }
}
function rNoCfg() {
  $app.innerHTML = `<div class="card"><h2>⚙️ ยังไม่ได้เชื่อมฐานข้อมูล</h2>
    <p>แอปออนไลน์ต้องใช้ Firebase (ฟรี) เป็นที่เก็บคะแนนกลาง เจ้าของแอปต้องใส่ค่าใน <code>config.js</code> ก่อน</p>
    <a class="btn full" href="?mock=1">ลองโหมดทดสอบ (ข้อมูลอยู่ในเครื่องนี้เท่านั้น)</a>
    <a class="btn sec full" href="offline/">ใช้แอปออฟไลน์ตัวเดิม</a></div>`;
}
function rHome() {
  const mg = myGames();
  $app.innerHTML = `
  <div class="card center"><div style="font-size:52px">⛳</div><h2 style="font-size:20px">Golf Live</h2>
    <button class="btn full big-btn" data-act="create">🏌️ สร้างแก๊งใหม่</button></div>
  <div class="card"><h2>🔑 เข้าร่วมแก๊ง</h2>
    <div style="display:flex;gap:8px"><input id="jcode" maxlength="6" placeholder="รหัสแก๊ง" style="text-transform:uppercase;font-weight:700;letter-spacing:3px"><button class="btn" data-act="joincode" style="flex:none">เข้า</button></div></div>
  ${mg.length ? `<div class="card"><h2>🕘 แก๊งล่าสุดของฉัน</h2>${mg.map(g => `<div class="trow"><span><b>${esc(g.name)}</b><br><span class="muted">${thDate(g.date)} · ${g.code}</span></span><span style="display:flex;gap:6px"><button class="btn sec" data-act="open" data-v="${g.code}">เปิด</button><button class="x" data-act="forget" data-v="${g.code}">🗑</button></span></div>`).join('')}
    <button class="btn red full" data-act="forgetall">ลบรายการทั้งหมด</button></div>` : ''}
  <button class="btn sec full" data-act="hist">📚 ประวัติ & Handicap Index</button>
  <p class="muted center" style="margin-top:16px">เวอร์ชัน ${APPVER}${MOCK ? ' · โหมดทดสอบ' : ''} · <a href="offline/" style="color:#1b5e20">แอปออฟไลน์ตัวเดิม</a></p>`;
}
function rCreate() {
  const cs = Object.values(UI.courses || {});
  $app.innerHTML = `
  <div class="card"><h2>🏌️ สร้างแก๊งใหม่</h2>
    <label class="lb">สนาม</label><input id="c_course" list="clist" placeholder="ชื่อสนาม" value="${esc(UI.pendGeo?.name || '')}"><datalist id="clist">${cs.map(c => `<option value="${esc(c.name)}">`).join('')}</datalist>
    <button class="btn sec full" data-act="csearch">🔎 ค้นหาสนาม & ดาวน์โหลดแผนที่</button>
    <div id="c_geo">${UI.pendGeo ? `<div class="note ok">🗺️ ${courseReport(UI.pendGeo.d).html}</div>` : ''}</div>
    <div class="grid2"><div><label class="lb">วันที่</label><input id="c_date" type="date" value="${today()}"></div><div><label class="lb">Tee</label><input id="c_tee" list="teelist" placeholder="เช่น Blue"><datalist id="teelist">${['Black', 'Gold', 'Blue', 'White', 'Red'].map(t => `<option value="${t}">`).join('')}</datalist></div></div>
    <label class="lb">จำนวนหลุม</label><div class="seg" id="c_holes"><button data-v="9">9 หลุม</button><button data-v="18" class="on">18 หลุม</button></div>
    <div class="grid2"><div><label class="lb">ชื่อของคุณ</label><input id="c_name" placeholder="ชื่อ"></div><div><label class="lb">แต้มต่อของคุณ</label><input id="c_hc" type="number" inputmode="numeric" placeholder="ไม่ต่อเว้นว่าง"></div></div>
    <label class="lb">PIN แก๊ง 4 หลัก</label><input id="c_pin" class="pin" type="tel" inputmode="numeric" maxlength="4" placeholder="••••"></div>
  <div class="card"><div class="trow"><h2 style="margin:0">💰 กินตัง: สุ่ม 3 อันดับทุกหลุม</h2><button class="sw on" id="c_money" type="button"></button></div>
    <div id="c_moneyopts">
    
    <div class="grid3"><div><label class="lb">สุ่มครั้งที่ 1</label><input id="c_a1" type="number" inputmode="numeric" value="30"></div><div><label class="lb">ครั้งที่ 2</label><input id="c_a2" type="number" inputmode="numeric" value="20"></div><div><label class="lb">ครั้งที่ 3</label><input id="c_a3" type="number" inputmode="numeric" value="10"></div></div>
    <label class="lb">จัดอันดับด้วย</label><div class="seg" id="c_by"><button data-v="gross" class="on">Gross</button><button data-v="net">Net (หักแต้มต่อ)</button></div>
    <label class="lb">อันดับที่สุ่มได้มีคนเสมอกัน</label><div class="seg" id="c_tie"><button data-v="all" class="on">เสียทุกคน</button><button data-v="putt">ตัดด้วยพัตต์</button><button data-v="one">สุ่ม 1 คน</button></div></div>
    </div>
  <button class="btn full big-btn" data-act="docreate">✅ สร้างแก๊ง</button>
  <button class="btn sec full" data-act="home">ยกเลิก</button>`;
  document.getElementById('c_money').onclick = e => { const on = e.currentTarget.classList.toggle('on'); document.getElementById('c_moneyopts').style.display = on ? '' : 'none';  };
  $app.querySelectorAll('.seg').forEach(s => s.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; s.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); }));
}
async function doCreate() {
  const v = id => document.getElementById(id).value.trim(), seg = id => document.querySelector(`#${id} .on`).dataset.v;
  const name = v('c_name'), pin = v('c_pin'), course = v('c_course');
  if (!name) return toast('ใส่ชื่อของคุณ'); if (!/^\d{4}$/.test(pin)) return toast('PIN ต้องเป็นตัวเลข 4 หลัก');
  let code; for (let k = 0; k < 5; k++) { code = newCode(); if (!(await ST.get('games/' + code + '/meta'))) break; }
  const holes = +seg('c_holes'), cid = UI.pendGeo?.d?.cid || (course ? slug(course) : ''), lib = UI.pendGeo?.d?.lib || (cid ? UI.courses?.[cid] || UI.courses?.[slug(course)] : null);
  const meta = { code, course, cid, date: v('c_date') || today(), tee: v('c_tee') || lib?.tee || '', holes, cr: lib?.cr || '', slope: lib?.slope || '',
    pinHash: await sha(code + ':' + pin), amounts: [+v('c_a1') || 0, +v('c_a2') || 0, +v('c_a3') || 0], moneyBy: seg('c_by'), tieRule: seg('c_tie'), money: document.getElementById('c_money').classList.contains('on'), host: UID, lunch: '', createdAt: Date.now() };
  const pid = 'p' + Date.now().toString(36);
  const game = { meta, players: { [pid]: { name, hc: v('c_hc'), uid: UID, color: COLORS[0], joinedAt: Date.now(), host: true } }, holes: {} };
  const pg = UI.pendGeo?.d, P = pg ? parsOf(pg) : { pars: lib?.pars || {}, si: lib?.si || {}, n: Object.keys(lib?.pars || {}).length };
  for (let i = 0; i < 18; i++) game.holes[hk(i)] = { par: +P.pars[hk(i)] || 4, si: P.si[hk(i)] || '' };
  if (P.n) meta.parSrc = 'course';
  await ST.set('games/' + code, game);
  let cg = pg ? { ...geoFrom(pg), t: Date.now() } : null;
  if (!cg && cid) cg = await withTimeout(ST.get('coursegeo/' + cid), 8000).catch(() => null);
  if (cg) { jset(DEV, 'golf2_geo_' + code, cg); await ST.set('geos/' + code, cg); if (pg && cid) ST.set('coursegeo/' + cid, cg).catch(() => {}); }
  UI.pendGeo = null;
  setId(code, { pid }); jset(DEV, 'golf2_pin_' + code, pin); addMyGame({ code, name: course || 'รอบกอล์ฟ', date: meta.date });
  UI.tab = 'gang'; jset(DEV, 'golf2_tab', 'gang'); go(code);
}
function rJoin() {
  const m = UI.joinMeta;
  if (!UI.pinOk) {
    $app.innerHTML = `<div class="card center"><div style="font-size:44px">🔑</div><h2>เข้าร่วมแก๊ง ${esc(CODE)}</h2>
      <p><b>${esc(m.course || 'รอบกอล์ฟ')}</b><br><span class="muted">${thDate(m.date)}${m.tee ? ' · Tee ' + esc(m.tee) : ''} · ${m.holes} หลุม</span></p>
      <label class="lb">PIN แก๊ง</label><input id="j_pin" class="pin" type="tel" inputmode="numeric" maxlength="4" placeholder="••••" autofocus>
      <button class="btn full big-btn" data-act="checkpin">ยืนยัน</button><button class="btn sec full" data-act="home">กลับหน้าแรก</button></div>`;
    return;
  }
  ST.get('games/' + CODE + '/players').then(ps => {
    const list = Object.entries(ps || {}).map(([id, p]) => ({ id, ...p })).sort((a, b) => a.joinedAt - b.joinedAt);
    $app.innerHTML = `<div class="card"><h2>👋 คุณคือใคร?</h2>
      ${list.map(p => `<button class="btn sec full" data-act="claim" data-v="${p.id}" style="text-align:left">${esc(p.name)}${p.uid && p.uid !== UID ? ' <span class="muted">(ใช้อยู่ในเครื่องอื่น)</span>' : ''}</button>`).join('') || '<p class="muted">ยังไม่มีผู้เล่น</p>'}
      </div>
      ${list.length < 10 ? `<div class="card"><h2>＋ ผู้เล่นใหม่</h2><div class="grid2"><div><label class="lb">ชื่อ</label><input id="j_name" placeholder="ชื่อเล่น"></div><div><label class="lb">แต้มต่อ</label><input id="j_hc" type="number" inputmode="numeric" placeholder="ไม่ต่อเว้นว่าง"></div></div>
        <button class="btn full big-btn" data-act="joinnew">เข้าแก๊ง</button></div>` : '<div class="note">แก๊งเต็ม 10 คนแล้ว</div>'}`;
  });
}
async function checkPin() {
  const pin = document.getElementById('j_pin').value.trim();
  if ((await sha(CODE + ':' + pin)) !== UI.joinMeta.pinHash) { toast('PIN ไม่ถูกต้อง'); return; }
  UI.pinOk = true; jset(DEV, 'golf2_pin_' + CODE, pin); render();
}
async function claim(pid, isNew) {
  if (isNew) {
    const name = document.getElementById('j_name').value.trim(); if (!name) return toast('ใส่ชื่อก่อน');
    const ps = await ST.get('games/' + CODE + '/players') || {};
    if (Object.values(ps).some(p => p.name.trim() === name)) return toast('ชื่อนี้มีแล้ว แตะที่ชื่อด้านบนแทน');
    pid = 'p' + Date.now().toString(36);
    await ST.set(`games/${CODE}/players/${pid}`, { name, hc: document.getElementById('j_hc').value.trim(), uid: UID, color: COLORS[Object.keys(ps).length % COLORS.length], joinedAt: Date.now() });
  } else {
    const p = await ST.get(`games/${CODE}/players/${pid}`);
    if (p.uid && p.uid !== UID && !(await ask(`"${p.name}" ใช้อยู่ในเครื่องอื่น ย้ายมาใช้เครื่องนี้แทน?`))) return;
    await ST.update(`games/${CODE}/players/${pid}`, { uid: UID });
  }
  setId(CODE, { pid }); UI.tab = 'hole'; jset(DEV, 'golf2_tab', 'hole'); route();
}

/* ---------- game: hole (จดสกอร์ตัวเอง) ---------- */
const isHost = () => !!G.players?.[ME]?.host || G.meta.host === UID;
function stepper(f, v) { return `<div class="step"><button data-act="dec" data-f="${f}">−</button><span>${v == null ? '–' : v}</span><button data-act="inc" data-f="${f}">＋</button></div>`; }
function rHole() {
  const i = UI.cur, N = K.nHoles(G), pid = UI.editPid || ME, p = G.players[pid] || G.players[ME], e = K.ent(G, pid, i) || {};
  const sc = K.score(G, pid, i), [lb, cl] = K.label(sc, K.par(G, i)), st = K.hStrokes(G, pid, i), pn = K.penOf(e), PL = K.players(G);
  let chips = ''; for (let k = 0; k < N; k++) chips += `<button data-act="jump" data-v="${k}" class="${k === i ? 'cur' : K.holeDone(G, k) ? 'all done' : K.score(G, pid, k) != null ? 'done' : ''}">${k + 1}</button>`;
  const mo = K.holeMoney(G, i), ord = K.holeOrder(G, i), MON = K.moneyOn(G);
  const rows = PL.map(q => ({ q, s: K.score(G, q.id, i), m: K.metric(G, q.id, i) })).sort((a, b) => (a.m ?? 1e9) - (b.m ?? 1e9)).map(x => {
    const r = x.m == null ? '' : ord.filter(y => y.sc < x.m).length + 1, ph = G.pos?.[x.q.id]?.hole;
    return `<tr class="${x.q.id === ME ? 'me' : ''}"><td>${r}</td><td class="l">${esc(x.q.name)}</td><td>${x.s ?? `<span class="muted">${ph != null && ph !== i ? 'H' + (ph + 1) : 'รอ'}</span>`}</td>${K.hasHC(G) ? `<td>${K.net(G, x.q.id, i) ?? ''}</td>` : ''}${MON ? `<td class="pay">${mo.pay[x.q.id] ? mo.pay[x.q.id] + '฿' : ''}</td>` : ''}</tr>`;
  }).join('');
  $app.innerHTML = `
  <div class="card"><div class="holebar"><button data-act="prev" ${i === 0 ? 'disabled' : ''}>◀</button>
    <div class="nm"><div class="muted">หลุมที่</div><b>${i + 1}</b> <span class="muted">/ ${N}</span><div class="parbig">Par ${K.par(G, i)}${G.holes?.[hk(i)]?.si ? ` <span class="muted">· HCP ${esc(G.holes[hk(i)].si)}</span>` : ''}</div></div>
    <button data-act="next" ${i >= N - 1 ? 'disabled' : ''}>▶</button></div><div class="chips">${chips}</div>

    <div class="center" id="gpsd" style="margin-top:8px">${gpsLine()}</div></div>
  ${isHost() && PL.length > 1 ? `<div class="card" style="padding:8px 12px"><label class="lb" style="margin-top:0">จดให้ (เฉพาะคนสร้างแก๊ง)</label><div class="chips" style="padding:0">${PL.map(q => `<button style="width:auto;padding:0 12px;border-radius:16px" class="${q.id === pid ? 'cur' : ''}" data-act="editfor" data-v="${q.id}">${esc(q.name)}</button>`).join('')}</div></div>` : ''}
  <div class="pcard ${sc != null ? 'ok' : ''}"><div class="ptop"><span class="n">${esc(p.name)}${pid === ME ? '' : ' <span class="muted">(จดแทน)</span>'}${st ? ` <span class="muted">+${st} แต้ม</span>` : ''}</span>
      <span>${sc != null ? `<span class="badge ${cl}">${sc} · ${lb}</span>` : ''}${K.gir(G, pid, i) ? '<span class="badge b-gir">GIR</span>' : ''}</span></div>
    <div class="frow"><span class="t">ตีถึงออน</span>${stepper('on', e.on)}</div>
    <div class="frow"><span class="t">พัตต์</span>${stepper('putt', e.putt)}</div>
    <div class="frow"><span class="t">Tee-off</span><div class="seg">
      <button class="l ${e.tee === 'l' ? 'on' : ''}" data-act="tee" data-v="l">⬅ ซ้าย</button><button class="${e.tee === 's' ? 'on' : ''}" data-act="tee" data-v="s">⬆ ตรง</button><button class="r ${e.tee === 'r' ? 'on' : ''}" data-act="tee" data-v="r">ขวา ➡</button></div></div>
    <div class="grid4 pen">${K.PEN.map(([k, ic, nm, pt]) => `<button class="${e[k] ? 'on' : ''} ${pt ? '' : 'sand'}" data-act="pen" data-v="${k}">${ic} ${nm}${e[k] ? `<b>×${e[k]}</b>` : ''}</button>`).join('')}</div>
    ${sc != null ? `<div class="formula">สกอร์ ${sc} = ออน ${e.on} + พัตต์ ${e.putt}${pn ? ` + โทษ ${pn}` : ''}${st ? ` · Net ${sc - st}` : ''}</div>` : ''}</div>
  <div class="card"><div class="ptop"><h2 style="margin:0">🏌️ ช็อตหลุมนี้</h2><span class="muted">${pid === ME ? '' : 'ของ ' + esc(p.name)}</span></div>
    ${shotList(pid, i)}
    <button class="btn full big-btn" data-act="shot">📍 ตีแล้ว · บันทึกช็อต</button>
    </div>
  <div class="card"><h2>👥 หลุมนี้ของแก๊ง ${MON && K.hasHC(G) ? `<span class="muted">(เงินคิดด้วย ${G.meta.moneyBy === 'net' ? 'Net' : 'Gross'})</span>` : ''}</h2>
    <table><tr><th>#</th><th class="l">ผู้เล่น</th><th>Gross</th>${K.hasHC(G) ? '<th>Net</th>' : ''}${MON ? '<th>เสีย</th>' : ''}</tr>${rows}</table>
    ${!MON ? '' : mo.picks ? `<div class="note">🎲 สุ่มได้อันดับ ${mo.picks.join(', ')} → ${K.amounts(G).slice(0, mo.picks.length).join(' / ')} บาท</div>` : ''}</div>
  ${i < N - 1 ? `<button class="btn full big-btn" data-act="next">ไปหลุม ${i + 2} ▶</button>` : `<button class="btn full big-btn" data-act="tab" data-v="sum">ดูสรุปผล 🏁</button>`}`;
}
function shotsOf(pid, i) { return Object.entries(G.shots?.[pid]?.[hk(i)] || {}).map(([k, v]) => ({ k, ...v })).sort((a, b) => a.t - b.t); }
function shotList(pid, i) {
  const s = shotsOf(pid, i), green = geoCache?.holes?.[hk(i)]?.green, u = PREF.unit === 'y' ? 1.09361 : 1, un = PREF.unit === 'y' ? 'หลา' : 'ม.';
  if (!s.length) return '';
  return `<div class="shots">${s.map((x, k) => { const nx = s[k + 1], d = nx && x.lat != null && nx.lat != null ? K.dist([x.lat, x.lng], [nx.lat, nx.lng]) : null;
    const left = !nx && green && x.lat != null ? K.dist([x.lat, x.lng], green) : null;
    return `<span class="shot" data-act="delshot" data-v="${x.k}"><b>${k + 1}</b> ${esc(x.club)}${d ? ` · ${Math.round(d * u)}` : left ? ` · เหลือ ${Math.round(left * u)}` : ''}</span>`; }).join('<i>›</i>')}</div>
    `;
}
async function addShot(pid, i) {
  const club = await chooseClub(); if (!club) return;
  const t = Date.now(), s = { club, t };
  if (gps && pid === ME) { s.lat = +gps.lat.toFixed(6); s.lng = +gps.lng.toFixed(6); s.acc = Math.round(gps.acc || 0); }
  gw(`shots/${pid}/${hk(i)}/s${t}`, s);
  sendLoc(true);
  toast(s.lat != null ? `บันทึก ${club} แล้ว ✓` : `บันทึก ${club} แล้ว (ไม่มีตำแหน่ง GPS)`);
}
function writeEntry(pid, i, e) { e.t = Date.now(); gw(`scores/${pid}/${hk(i)}`, e); if (pid === ME) sendHole(i); }
function sendHole(i) { jset(DEV, 'golf2_cur_' + CODE, i); gw(`pos/${ME}`, { hole: i, t: Date.now() }); }

/* ---------- game: map ---------- */
function rMap() {
  if (mapObj) { mapObj.update(false); return; }
  $app.innerHTML = '<div id="mapwrap"></div>';
  mapObj = createMap(document.getElementById('mapwrap'), {
    G: () => G, code: CODE, me: ME, store: ST, hole: () => UI.cur, N: () => K.nHoles(G),
    setHole: i => { UI.cur = i; sendHole(i); mapObj.update(true); hdr(); },
    gps: () => gps, unit: () => PREF.unit, pref: (k, d) => PREF[k] ?? d, setPref,
    toast, ask, info, choose, chooseClub,
    saveShot: (i, s) => { gw(`shots/${ME}/${hk(i)}/s${s.t}`, s); sendLoc(true); },
    locs: () => LOCS,
    delShot: (i, k) => gw(`shots/${ME}/${hk(i)}/${k}`, null),
    geo: () => geoCache, saveGeo, searchDownload, downloadAt: at => downloadIntoGame(at),
    saveCourseGeo: g => { const cid = G.meta.cid || (G.meta.course ? slug(G.meta.course) : ''); if (!cid) return; if (!G.meta.cid) gw('meta/cid', cid); ST.set('coursegeo/' + cid, { ...g, t: Date.now() }).catch(() => {}); },
  });
}

/* ---------- game: live dashboard ---------- */
function board() {
  const byNet = UI.sortBy === 'net' && K.hasHC(G);
  return K.players(G).map(p => ({ p, s: K.stats(G, p.id), th: K.thru(G, p.id) }))
    .sort((a, b) => { const f = x => x.s.n ? (byNet ? x.s.net : x.s.gross) - x.s.par : 1e9; return f(a) - f(b) || b.th - a.th; });
}
function mountLiveMap() {
  const ph = document.getElementById('livemap'); if (!ph) return;
  if (!liveMap) {
    const el = document.createElement('div'); el.style.cssText = 'position:absolute;inset:0'; ph.appendChild(el);
    const m = L.map(el, { zoomControl: false, maxZoom: 20 }); m.attributionControl.setPrefix(false);
    L.tileLayer(SAT, { maxNativeZoom: 19, maxZoom: 20, attribution: 'Imagery © Esri' }).addTo(m); m.setView([13.75, 100.5], 6);
    liveMap = { el, m, geoL: L.layerGroup().addTo(m), ppl: L.layerGroup().addTo(m), fitted: false, touched: 0 };
    m.on('dragstart', () => { liveMap.touched = Date.now(); });
  } else ph.appendChild(liveMap.el);
  setTimeout(() => { if (liveMap) { liveMap.m.invalidateSize(); updateLiveMap(); } }, 30);
}
function updateLiveMap(refit) {
  if (!liveMap || !G || !document.body.contains(liveMap.el)) return;
  const now = Date.now(), pts = [];
  liveMap.geoL.clearLayers();
  Object.entries(geoCache?.holes || {}).forEach(([h, x]) => { if (!x.green || +h.slice(1) >= K.nHoles(G)) return; pts.push(x.green);
    L.marker(x.green, { interactive: false, icon: L.divIcon({ className: '', iconSize: [0, 0], html: `<span class="mlbl w" style="transform:translate(-50%,-50%);display:inline-block">⛳${+h.slice(1) + 1}</span>` }) }).addTo(liveMap.geoL); });
  liveMap.ppl.clearLayers(); let n = 0;
  K.players(G).forEach(p => { const l = (p.id === ME && gps) ? { lat: gps.lat, lng: gps.lng, gt: now } : LOCS[p.id]; if (!l || l.lat == null || now - (l.gt || 0) > 6 * 3600e3) return; n++;
    const ll = [l.lat, l.lng]; pts.push(ll);
    L.marker(ll, { icon: personIcon(p.name, p.color, G.pos?.[p.id]?.hole, now - l.gt > 3 * 60e3), zIndexOffset: p.id === ME ? 1000 : 0 }).addTo(liveMap.ppl)
      .bindPopup(`<b>${esc(p.name)}</b><br>หลุม ${(G.pos?.[p.id]?.hole ?? 0) + 1} · ${ago(l.gt)}`); });
  const cnt = document.getElementById('livecnt'); if (cnt) cnt.textContent = n ? `เห็นตำแหน่ง ${n}/${K.players(G).length} คน` : 'ยังไม่มีใครเปิด GPS';
  // ถ้ามีคนเดินออกนอกจอ และไม่ได้เลื่อนแผนที่เองใน 30 วิ → ซูมให้เห็นทุกคน
  const out = pts.length && liveMap.fitted && Date.now() - liveMap.touched > 30000 && !pts.every(q => liveMap.m.getBounds().contains(q));
  if ((refit || !liveMap.fitted || out) && pts.length) { liveMap.m.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 18 }); liveMap.fitted = true; }
}
function rLive() {
  const MON = K.moneyOn(G), hc = K.hasHC(G), L = board(), N = K.nHoles(G), now = Date.now();
  const who = L.map(x => { const pos = G.pos?.[x.p.id], h = pos?.hole, fresh = pos && now - (pos.t || 0) < 10 * 60e3;
    return `<div class="wcard" style="border-color:${x.p.color || '#dfe8df'}"><div class="h">${h != null ? 'H' + (h + 1) : '–'}</div><div class="nm">${fresh ? '<span class="live"></span>' : ''}${esc(x.p.name)}</div><div class="muted">${x.th}/${N} หลุม</div></div>`; }).join('');
  let pot = 0; L.forEach(x => pot += x.s.money);
  const rows = L.map((x, k) => { const d = x.s.gross - x.s.par, dn = x.s.net - x.s.par, h = G.pos?.[x.p.id]?.hole;
    return `<tr class="${x.p.id === ME ? 'me' : ''}"><td>${k + 1}</td><td class="l"><b>${esc(x.p.name)}</b></td><td><b class="${d < 0 ? 'sc-u' : 'sc-o'}">${x.s.n ? K.fd(d) : '-'}</b></td>${hc ? `<td class="${dn < 0 ? 'sc-u' : 'sc-o'}">${x.s.n ? K.fd(dn) : '-'}</td>` : ''}<td>${x.th === N ? 'F' : x.th}</td><td>${h != null ? 'H' + (h + 1) : '-'}</td><td>${x.s.n ? x.s.gross : '-'}</td>${MON ? `<td class="pay">${x.s.money || ''}</td>` : ''}</tr>`; }).join('');
  const feed = [];
  Object.entries(G.scores || {}).forEach(([pid, hs]) => Object.entries(hs || {}).forEach(([h, e]) => { const i = +h.slice(1), sc = K.score(G, pid, i); if (sc != null && e.t) feed.push({ t: e.t, pid, i, sc }); }));
  Object.entries(G.draws || {}).forEach(([h, d]) => feed.push({ t: d.t, draw: +h.slice(1) }));
  feed.sort((a, b) => b.t - a.t);
  const P = G.players || {};
  const feedH = feed.slice(0, 10).map(f => f.draw != null ? `<div>🎲 สุ่มเงินหลุม ${f.draw + 1}: อันดับ ${G.draws[hk(f.draw)].picks.join(', ')} <span class="muted">· ${ago(f.t)}</span></div>`
    : `<div><b>${esc(P[f.pid]?.name)}</b> หลุม ${f.i + 1}: <span class="badge ${K.label(f.sc, K.par(G, f.i))[1]}">${f.sc} · ${K.label(f.sc, K.par(G, f.i))[0]}</span> <span class="muted">· ${ago(f.t)}</span></div>`).join('');
  $app.innerHTML = `
  <div class="card"><h2><span class="live"></span>ใครอยู่หลุมไหน</h2><div class="who">${who}</div></div>
  <div class="card" style="padding:0;overflow:hidden"><div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px"><h2 style="margin:0">🗺️ ทุกคนอยู่ตรงไหน</h2><button class="btn sec" style="padding:6px 10px;font-size:14px" data-act="fitlive">ดูทุกคน</button></div>
    <div id="livemap" style="position:relative;height:340px;background:#333"></div><p class="muted" id="livecnt" style="padding:6px 12px;margin:0"></p></div>
  <div class="card"><h2>🏆 Leaderboard สด</h2>
    ${hc ? `<div class="seg" style="margin-bottom:8px"><button data-act="sortBy" data-v="gross" class="${UI.sortBy !== 'net' ? 'on' : ''}">Gross</button><button data-act="sortBy" data-v="net" class="${UI.sortBy === 'net' ? 'on' : ''}">Net</button></div>` : ''}
    <div class="scroll"><table><tr><th>#</th><th class="l">ผู้เล่น</th><th>To Par</th>${hc ? '<th>Net</th>' : ''}<th>Thru</th><th>อยู่</th><th>สกอร์</th>${MON ? '<th>เสีย</th>' : ''}</tr>${rows}</table></div>
    </div>
  <div class="card"><h2>📰 ความเคลื่อนไหวล่าสุด</h2><div class="feed">${feedH || '<p class="muted">ยังไม่มีใครจดสกอร์</p>'}</div></div>
  <div class="card"><h2>📋 สกอร์การ์ดสด</h2><div class="scroll">${scorecard()}</div></div>`;
}
function scorecard() {
  const PL = K.players(G), N = K.nHoles(G), hc = K.hasHC(G), two = N == 18;
  let t = `<table class="sc"><tr><th>H</th><th>Par</th>${PL.map(p => `<th>${esc(p.name)}</th>`).join('')}${K.moneyOn(G) ? '<th>🎲</th>' : ''}</tr>`;
  const tot = (a, b, lab, useNet) => { let pr = 0; for (let i = a; i < b; i++) pr += K.par(G, i);
    return `<tr class="tot"><td><b>${lab}</b></td><td>${pr}</td>${PL.map(p => { let s = 0, c = 0; for (let i = a; i < b; i++) { const v = useNet ? K.net(G, p.id, i) : K.score(G, p.id, i); if (v != null) { s += v; c++; } } return `<td><b>${c ? s : '-'}</b></td>`; }).join('')}<td></td></tr>`; };
  for (let i = 0; i < N; i++) { const mo = K.holeMoney(G, i);
    t += `<tr><td><b>${i + 1}</b></td><td>${K.par(G, i)}</td>${PL.map(p => { const s = K.score(G, p.id, i);
      return `<td class="${s != null && s < K.par(G, i) ? 'sc-u' : ''}">${s ?? '-'}${K.gir(G, p.id, i) ? '<sup>●</sup>' : ''}${mo.pay[p.id] ? `<small>${mo.pay[p.id]}฿</small>` : ''}</td>`; }).join('')}${K.moneyOn(G) ? `<td class="muted">${mo.picks ? mo.picks.join(',') : ''}</td>` : ''}</tr>`;
    if (two && i === 8) t += tot(0, 9, 'OUT'); }
  if (two) t += tot(9, 18, 'IN'); t += tot(0, N, 'รวม'); if (hc) t += tot(0, N, 'Net', true);
  return t + '</table>';
}

/* ---------- game: summary ---------- */
function clubStats() {
  const m = {};
  Object.values(G.shots?.[ME] || {}).forEach(hs => {
    const s = Object.values(hs || {}).sort((a, b) => a.t - b.t);
    s.forEach((x, k) => { const nx = s[k + 1]; const r = (m[x.club] = m[x.club] || { all: 0, d: [] }); r.all++;
      if (!nx || clubCat(x.club) === 'Putter' || x.lat == null || nx.lat == null) return; const d = K.dist([x.lat, x.lng], [nx.lat, nx.lng]); if (d >= 3) r.d.push(d); });
  });
  return Object.entries(m).map(([c, r]) => ({ c, cat: clubCat(c), n: r.all, nd: r.d.length, avg: r.d.length ? r.d.reduce((x, y) => x + y, 0) / r.d.length : null, max: r.d.length ? Math.max(...r.d) : null }));
}
function rSum() {
  const hc = K.hasHC(G), list = board().map(x => ({ ...x, m: K.more(G, x.p.id) })), played = list.filter(x => x.s.n), N = K.nHoles(G), two = N == 18;
  let pot = 0; list.forEach(x => pot += x.s.money);
  const nm = x => `<td class="l"><b>${esc(x.p.name)}</b></td>`;
  const top = list.map((x, k) => { const s = x.s, d = s.gross - s.par, dn = s.net - s.par; return `<tr class="${x.p.id === ME ? 'me' : ''}"><td>${k + 1}</td><td class="l"><b>${esc(x.p.name)}</b><br><span class="muted">${s.n}/${N}${+x.p.hc ? ' · ต่อ ' + esc(x.p.hc) : ''}</span></td>
    <td><b>${s.n ? s.gross : '-'}</b><br><span class="${d < 0 ? 'sc-u' : 'sc-o'}">${s.n ? K.fd(d) : ''}</span></td>${hc ? `<td><b>${s.n ? s.net : '-'}</b><br><span class="${dn < 0 ? 'sc-u' : 'sc-o'}">${s.n ? K.fd(dn) : ''}</span></td>` : ''}
    <td>${s.putts}<br><span class="muted">${s.n ? K.av(s.putts, s.n) + '/หลุม' : ''}</span></td><td>${s.g}/${s.n}<br><span class="muted">${K.pc(s.g, s.n)}</span></td><td class="hcp">${s.hcp ?? '-'}</td><td><b>${s.ch ?? '-'}</b></td></tr>`; }).join('');
  const aw = K.awards(G, list).map(a => `<div class="aw"><span class="ai">${a.icon}</span><div><div class="at">${a.title}</div><b>${a.names.map(esc).join(', ')}</b> <span class="muted">· ${a.v}</span></div></div>`).join('');
  const legend = K.DIST.map(d => `<span class="lg"><i style="background:${d[1]}"></i>${d[0]}</span>`).join('');
  const bars = played.map(x => `<div class="drow"><div class="dn">${esc(x.p.name)}</div><div class="dbar">${x.m.dist.map((c, k) => c ? `<span data-act="tip" data-v="${esc(x.p.name)} · ${K.DIST[k][0]}: ${c} หลุม" style="flex:${c};background:${K.DIST[k][1]};color:${K.DIST[k][2]}">${c / x.s.n >= .08 ? c : ''}</span>` : '').join('')}</div></div>`).join('');
  const ptCell = b => b[0] ? `${K.av(b[1], b[0])}<br><span class="muted">${K.fd((b[1] - b[2]) / b[0])}</span>` : '-';
  const halfCell = h => h[0] ? `${h[1]}<br><span class="muted">${K.fd(h[1] - h[2])}</span>` : '-';
  const hl = o => o ? `H${o.i + 1} <span class="muted">(${o.sc}, ${K.fd(o.d)})</span>` : '-';
  const parT = played.map(x => `<tr>${nm(x)}<td>${ptCell(x.m.pt[3])}</td><td>${ptCell(x.m.pt[4])}</td><td>${ptCell(x.m.pt[5])}</td>${two ? `<td>${halfCell(x.m.out)}</td><td>${halfCell(x.m.inn)}</td>` : ''}<td>${hl(x.m.best)}</td><td>${hl(x.m.worst)}</td></tr>`).join('');
  const shortT = played.map(x => { const s = x.s, m = x.m; return `<tr>${nm(x)}<td>${K.av(s.putts, s.n, 2)}</td><td>${K.av(m.gPutt, s.g, 2)}</td><td>${m.one}</td><td>${m.three}</td><td>${m.chip}</td><td>${K.pc(m.scrO, m.scrN)}</td><td>${K.pc(m.bbO, m.bbN)}</td></tr>`; }).join('');
  const penT = list.map(x => { const m = x.m; return `<tr>${nm(x)}<td>${m.lost || '·'}</td><td>${m.water || '·'}</td><td>${m.ob || '·'}</td><td class="pay">${m.pen ? '+' + m.pen : '·'}</td><td>${m.bunker || '·'}</td><td>${m.sandN ? K.pc(m.sandO, m.sandN) : '-'}</td></tr>`; }).join('');
  const teeT = list.map(x => { const s = x.s, f = x.m.fw, miss = f.n - f.hit; return `<tr>${nm(x)}<td>${s.l}</td><td><b>${s.st}</b></td><td>${s.r}</td><td>${K.pc(f.hit, f.n)}</td><td>${f.hit ? K.fd(f.hitD / f.hit) : '-'}</td><td>${miss ? K.fd(f.missD / miss) : '-'}</td></tr>`; }).join('');
  const bill = +G.meta.lunch || 0, n = list.length, extra = bill > pot && n ? Math.ceil((bill - pot) / n) : 0, left = pot > bill && bill ? pot - bill : 0;
  const moneyT = list.map(x => `<tr>${nm(x)}<td>${x.m.hits}</td><td class="pay">${x.s.money} ฿</td>${bill ? `<td><b>${x.s.money + extra} ฿</b></td>` : ''}</tr>`).join('');
  const cl = clubStats(), u = PREF.unit === 'y' ? 1.09361 : 1, un = PREF.unit === 'y' ? 'หลา' : 'ม.';
  cl.sort((a, b) => CLUB_ORDER.indexOf(a.c) - CLUB_ORDER.indexOf(b.c));
  $app.innerHTML = `
  <div class="card"><h2>🏁 สรุปผล · ${esc(G.meta.course || '')}</h2><p class="muted" style="margin-top:-6px">${thDate(G.meta.date)}${G.meta.tee ? ' · Tee ' + esc(G.meta.tee) : ''}</p>
    ${hc ? `<div class="seg" style="margin-bottom:8px"><button data-act="sortBy" data-v="gross" class="${UI.sortBy !== 'net' ? 'on' : ''}">เรียง Gross</button><button data-act="sortBy" data-v="net" class="${UI.sortBy === 'net' ? 'on' : ''}">เรียง Net</button></div>` : ''}
    <div class="scroll"><table><tr><th>#</th><th class="l">ผู้เล่น</th><th>Gross</th>${hc ? '<th>Net</th>' : ''}<th>พัตต์</th><th>GIR</th><th>HCP</th><th>Course<br>HCP</th></tr>${top}</table></div>
    </div>
  ${aw ? `<div class="card"><h2>🏅 รางวัลประจำรอบ</h2>${aw}</div>` : ''}
  ${!K.moneyOn(G) ? (bill ? `<div class="card"><h2>🍛 ค่ากับข้าว</h2><div class="note">ค่ากับข้าว ${bill} บาท หาร ${n} คน → คนละ <b>${Math.ceil(bill / n)} บาท</b></div></div>` : '') : `<div class="card"><h2>💰 เงิน & ค่ากับข้าว</h2><div class="big">กองกลาง ${pot} บาท</div>
    ${bill ? `<div class="note">ค่ากับข้าว ${bill} บาท → ${extra ? `กองกลางไม่พอ ทุกคนจ่ายเพิ่มคนละ <b>${extra} บาท</b>` : left ? `กองกลางเหลือ <b>${left} บาท</b>` : 'พอดี 👍'}</div>` : ''}
    <div class="scroll"><table><tr><th class="l">ผู้เล่น</th><th>โดนสุ่ม<br>(หลุม)</th><th>เข้ากอง</th>${bill ? '<th>รวมจ่าย<br>ค่าข้าว</th>' : ''}</tr>${moneyT}</table></div></div>`}
  ${bars ? `<div class="card"><h2>📈 การกระจายสกอร์</h2><div class="legend">${legend}</div>${bars}</div>` : ''}
  ${parT ? `<div class="card"><h2>⛳ สกอร์เฉลี่ยตาม Par${two ? ' / หน้า-หลัง' : ''}</h2><div class="scroll"><table><tr><th class="l">ผู้เล่น</th><th>Par 3</th><th>Par 4</th><th>Par 5</th>${two ? '<th>OUT</th><th>IN</th>' : ''}<th>ดีสุด</th><th>แย่สุด</th></tr>${parT}</table></div></div>` : ''}
  ${shortT ? `<div class="card"><h2>🎯 พัตต์ & ลูกสั้น</h2><div class="scroll"><table><tr><th class="l">ผู้เล่น</th><th>พัตต์<br>/หลุม</th><th>พัตต์<br>/GIR</th><th>1 พัตต์</th><th>3 พัตต์+</th><th>ชิปลง</th><th>Scram-<br>bling</th><th>Bounce<br>back</th></tr>${shortT}</table></div></div>` : ''}
  <div class="card"><h2>🚫 ลูกโทษ & บังเกอร์</h2><div class="scroll"><table><tr><th class="l">ผู้เล่น</th><th>🌳</th><th>💧</th><th>🚫 OB</th><th>แต้มโทษ</th><th>🏖️</th><th>Sand save</th></tr>${penT}</table></div></div>
  <div class="card"><h2>🏌️ Tee-off</h2><div class="scroll"><table><tr><th class="l">ผู้เล่น</th><th>⬅</th><th>⬆</th><th>➡</th><th>Fairway<br>Par 4-5</th><th>สกอร์เมื่อ<br>ตีตรง</th><th>เมื่อ<br>ไม่ตรง</th></tr>${teeT}</table></div></div>
  <div class="card"><h2>🏌️‍♂️ ระยะไม้ของฉัน (จากช็อตที่บันทึก)</h2>${cl.length ? `<table><tr><th class="l">ไม้</th><th>ใช้</th><th>เฉลี่ย (${un})</th><th>ไกลสุด</th></tr>${cl.map(c => `<tr><td class="l"><b>${c.c}</b>${c.cat !== c.c ? ` <span class="muted">${c.cat}</span>` : ''}</td><td>${c.n}</td><td><b>${c.avg != null ? Math.round(c.avg * u) : '-'}</b></td><td>${c.max != null ? Math.round(c.max * u) : '-'}</td></tr>`).join('')}</table>
    ` : '<p class="muted">ยังไม่มี · กด "📍 ตีแล้ว · บันทึกช็อต" ตอนยืนที่ลูกทุกช็อต แล้วเลือกไม้ ระบบจะคำนวณระยะแต่ละไม้ให้</p>'}</div>
  <div class="card"><h2>📋 สกอร์การ์ด</h2><div class="scroll">${scorecard()}</div></div>
  <div class="card"><h2>📤 แชร์ & บันทึก</h2>
    <button class="btn full" data-act="img">📷 ส่งรูปสกอร์การ์ด</button>
    <button class="btn full" data-act="copytxt">📋 คัดลอกสรุป (ส่ง LINE)</button>
    <button class="btn sec full" data-act="saveround">💾 ${HIST.some(r => r.rid === CODE) ? 'อัปเดตประวัติรอบนี้' : 'บันทึกรอบนี้ลงประวัติ (เครื่องนี้)'}</button>
    ${isHost() ? `<button class="btn sec full" data-act="savecourse">📍 บันทึกข้อมูลสนามไว้ใช้รอบหน้า</button>` : ''}</div>`;
}
function sumText() {
  const L = board(), hc = K.hasHC(G); let pot = 0; L.forEach(x => pot += x.s.money);
  let t = `⛳ ${G.meta.course || 'รอบกอล์ฟ'} · ${thDate(G.meta.date)}\n`;
  L.forEach((x, k) => { const s = x.s; t += `${k + 1}. ${x.p.name}: ${s.gross} (${K.fd(s.gross - s.par)})${hc ? ` Net ${s.net}` : ''} | พัตต์ ${s.putts} | GIR ${s.g}/${s.n}${K.moneyOn(G) ? ` | เสีย ${s.money}฿` : ''}\n`; });
  const aw = K.awards(G, L.map(x => ({ ...x, m: K.more(G, x.p.id) }))); if (aw.length) { t += '\n🏅 รางวัล\n'; aw.forEach(a => t += `${a.icon} ${a.title}: ${a.names.join(', ')} (${a.v})\n`); }
  const bill = +G.meta.lunch;
  if (!K.moneyOn(G)) { if (bill) t += `\n🍛 ค่ากับข้าว ${bill} บาท → คนละ ${Math.ceil(bill / L.length)} บาท`; return t; }
  t += `\n💰 กองกลาง ${pot} บาท`; if (bill) t += `\n🍛 ค่ากับข้าว ${bill} บาท → ${bill > pot ? `จ่ายเพิ่มคนละ ${Math.ceil((bill - pot) / L.length)} บาท` : pot > bill ? `เหลือ ${pot - bill} บาท` : 'พอดี'}`;
  return t;
}

/* ---------- game: gang (QR / ตั้งค่า / ผู้เล่น) ---------- */
function joinUrl() { const u = new URL(location.href); u.search = ''; u.hash = ''; u.searchParams.set('g', CODE); if (MOCK) u.searchParams.set('mock', '1'); return u.toString(); }
function qrSvg(text) { const q = qrcode(0, 'M'); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 6, margin: 2, scalable: true }); }
function rGang() {
  const host = isHost(), m = G.meta, PL = K.players(G), pin = jget(DEV, 'golf2_pin_' + CODE, null), am = K.amounts(G), dis = host ? '' : 'disabled';
  const inp = (k, v, ph, type = 'text', im = '') => `<input ${dis} type="${type}" ${im ? `inputmode="${im}"` : ''} data-meta="${k}" value="${esc(v)}" placeholder="${ph}">`;
  $app.innerHTML = `
  <div class="card center"><h2>📲 ชวนเพื่อนเข้าแก๊ง</h2><div class="qr">${qrSvg(joinUrl())}</div>
    <div class="code">${CODE}</div>${pin ? `<p>PIN แก๊ง: <b style="font-size:22px;letter-spacing:4px">${esc(pin)}</b></p>` : ''}
    
    <button class="btn sec full" data-act="sharelink">🔗 แชร์ลิงก์เข้าแก๊ง</button></div>
  <div class="card"><h2>👥 ผู้เล่น (${PL.length}/10)</h2>
    ${PL.map(p => `<div class="trow"><span class="av" style="background:${p.color || '#2e7d32'}">${esc(p.name.slice(0, 1))}</span><span style="flex:1"><b>${esc(p.name)}</b>${p.host ? ' 👑' : ''}${p.id === ME ? ' <span class="muted">(ฉัน)</span>' : ''}<br><span class="muted">${p.uid ? 'มีเครื่องจดแล้ว' : 'ยังไม่มีเครื่อง'}</span></span>
      <input ${host || p.id === ME ? '' : 'disabled'} type="number" inputmode="numeric" data-phc="${p.id}" value="${esc(p.hc)}" placeholder="แต้ม" style="width:64px;text-align:center">
      ${host && p.id !== ME ? `<button class="x" data-act="kick" data-v="${p.id}">✕</button>` : ''}</div>`).join('')}
    ${host ? `<div style="display:flex;gap:8px;margin-top:8px"><input id="addname" placeholder="เพิ่มชื่อเพื่อนล่วงหน้า"><button class="btn" data-act="addp" style="flex:none">เพิ่ม</button></div>` : ''}</div>
  <div class="card"><h2>🗺️ แผนที่สนาม</h2>
    ${(() => { const st = geoStat(geoCache); return st.ok ? `<div class="note ok">✅ มีแผนที่แล้ว: ข้อมูลกรีน <b>${st.nh}</b> หลุม · รูปทรง <b>${st.nf}</b> ชิ้น</div>` : ''; })()}
    <button class="btn full" data-act="gsearch">🔎 ค้นหาสนามจากชื่อ & ดาวน์โหลด</button>
    ${geoStat(geoCache).nh < K.nHoles(G) ? `<button class="btn sec full" data-act="gwiz">🛠 ตั้งค่าหลุมเอง (แตะแท่นที/กรีนบนภาพดาวเทียม)</button>` : ''}
    <div class="grid2"><button class="btn sec" data-act="ghere">📍 ใช้ตำแหน่งฉัน</button><button class="btn sec" data-act="tab" data-v="map">🗺️ เปิดแผนที่</button></div>
    </div>
  <div class="card"><h2>📋 Par & HCP ของสนาม</h2>
    <div class="partbl">${[...Array(K.nHoles(G)).keys()].map(i => `<div><b>${i + 1}</b><select ${dis} data-hpar="${i}">${[3, 4, 5, 6].map(v => `<option ${K.par(G, i) === v ? 'selected' : ''}>${v}</option>`).join('')}</select><input ${dis} type="number" inputmode="numeric" data-hsi="${i}" value="${esc(G.holes?.[hk(i)]?.si)}" placeholder="HCP"></div>`).join('')}</div>
    
    ${host ? '<button class="btn sec full" data-act="savecourse">💾 บันทึกเป็นข้อมูลสนาม (รอบหน้า/คนอื่นไม่ต้องตั้งอีก)</button>' : ''}</div>
  <div class="card"><h2>⚙️ ตั้งค่ารอบ</h2>
    <label class="lb">สนาม</label>${inp('course', m.course, 'ชื่อสนาม')}
    <div class="grid2"><div><label class="lb">วันที่</label>${inp('date', m.date, '', 'date')}</div><div><label class="lb">Tee (สีแท่นที)</label>${inp('tee', m.tee, 'เช่น Blue').replace('<input', '<input list="teelist2"')}<datalist id="teelist2">${['Black', 'Gold', 'Blue', 'White', 'Red'].map(t => `<option value="${t}">`).join('')}</datalist></div></div>
    <div class="grid2"><div><label class="lb">Course Rating</label>${inp('cr', m.cr, 'เช่น 72.3', 'number', 'decimal')}</div><div><label class="lb">Slope</label>${inp('slope', m.slope, 'เช่น 128', 'number', 'numeric')}</div></div>
    <label class="lb">จำนวนหลุม</label><div class="seg">${[9, 18].map(v => `<button ${dis} data-act="setmeta" data-k="holes" data-v="${v}" class="${+m.holes === v ? 'on' : ''}">${v} หลุม</button>`).join('')}</div>
    <div class="trow" style="margin-top:10px"><span><b>💰 กินตัง</b></span><button ${dis} class="sw ${K.moneyOn(G) ? 'on' : ''}" data-act="moneytoggle"></button></div>
    <div ${K.moneyOn(G) ? '' : 'hidden'}>
    <label class="lb">💰 เงินสุ่ม 3 อันดับต่อหลุม (บาท)</label><div class="grid3">${[0, 1, 2].map(k => `<input ${dis} type="number" inputmode="numeric" data-amt="${k}" value="${am[k]}">`).join('')}</div>
    <label class="lb">จัดอันดับเงินด้วย</label><div class="seg">${[['gross', 'Gross'], ['net', 'Net']].map(([v, t]) => `<button ${dis} data-act="setmeta" data-k="moneyBy" data-v="${v}" class="${(m.moneyBy || 'gross') === v ? 'on' : ''}">${t}</button>`).join('')}</div>
    <label class="lb">อันดับที่สุ่มได้มีคนเสมอ</label><div class="seg">${[['all', 'เสียทุกคน'], ['putt', 'ตัดด้วยพัตต์'], ['one', 'สุ่ม 1 คน']].map(([v, t]) => `<button ${dis} data-act="setmeta" data-k="tieRule" data-v="${v}" class="${(m.tieRule || 'all') === v ? 'on' : ''}">${t}</button>`).join('')}</div></div>
    <label class="lb">🍛 ค่ากับข้าว (บาท)</label>${inp('lunch', m.lunch, 'ใส่ยอดบิลตอนจบ', 'number', 'numeric')}</div>
  <div class="card"><h2>📱 เครื่องนี้</h2>
    <label class="lb">หน่วยระยะ</label><div class="seg"><button data-act="unit" data-v="y" class="${PREF.unit === 'y' ? 'on' : ''}">หลา</button><button data-act="unit" data-v="m" class="${PREF.unit === 'm' ? 'on' : ''}">เมตร</button></div>
    <div class="trow"><span>โหมดกลางแดด</span><button class="sw ${PREF.sun ? 'on' : ''}" data-act="sun"></button></div>
    <div class="trow"><span>กันจอดับ</span><button class="sw ${PREF.wake ? 'on' : ''}" data-act="wake"></button></div>
    <button class="btn sec full" data-act="home">🏠 กลับหน้าแรก</button>
    <button class="btn red full" data-act="leave">ออกจากแก๊งในเครื่องนี้</button>
    ${host ? '<button class="btn red full" data-act="delgang">🗑 ลบแก๊งนี้ทิ้ง (ข้อมูลทุกคน)</button>' : ''}</div>
  <p class="muted center">Golf Live ${APPVER}${MOCK ? ' · โหมดทดสอบ' : ''}</p>`;
}

/* ---------- history (เก็บในเครื่อง) ---------- */
function saveRound() {
  const r = { rid: CODE, date: G.meta.date, course: G.meta.course, tee: G.meta.tee, holes: K.nHoles(G), cr: G.meta.cr, slope: G.meta.slope, par: K.totalPar(G),
    players: K.players(G).map(p => { const s = K.stats(G, p.id); return { name: p.name.trim(), gross: s.gross, net: s.net, par: s.par, n: s.n, putts: s.putts, g: s.g, money: s.money, diff: s.n === K.nHoles(G) ? s.hcp : null }; }) };
  const k = HIST.findIndex(x => x.rid === r.rid); if (k >= 0) HIST[k] = r; else HIST.push(r);
  HIST.sort((a, b) => a.date < b.date ? -1 : 1); jset(localStorage, 'golf2_hist', HIST); toast('บันทึกลงประวัติแล้ว ✓'); render();
}
async function saveCourse() {
  const m = G.meta; if (!m.course) return toast('ใส่ชื่อสนามในแท็บแก๊งก่อน');
  const cid = m.cid || slug(m.course), pars = {}, sis = {};
  for (let i = 0; i < 18; i++) { pars[hk(i)] = K.par(G, i); sis[hk(i)] = G.holes?.[hk(i)]?.si || ''; }
  await ST.set('courses/' + cid, { name: m.course, holes: K.nHoles(G), tee: m.tee || '', cr: m.cr || '', slope: m.slope || '', pars, si: sis, t: Date.now() });
  const geo = await ST.get('geos/' + CODE); if (geo) await ST.set('coursegeo/' + cid, geo);
  if (m.cid !== cid) ST.update(`games/${CODE}/meta`, { cid });
  toast('บันทึกข้อมูลสนามแล้ว ✓ รอบหน้าเลือกสนามนี้ ข้อมูลจะมาเอง');
}
function rHist() {
  const m = {};
  HIST.forEach(r => r.players.forEach(p => { if (!p.n) return; (m[p.name] = m[p.name] || { name: p.name, rounds: 0, diffs: [] }); m[p.name].rounds++; if (p.diff != null) m[p.name].diffs.push(p.diff); }));
  const ph = Object.values(m).map(x => ({ ...x, hi: K.hIndex(x.diffs), avg: x.diffs.length ? Math.round(x.diffs.reduce((a, b) => a + b, 0) / x.diffs.length * 10) / 10 : null })).sort((a, b) => (a.hi ?? a.avg ?? 99) - (b.hi ?? b.avg ?? 99));
  $app.innerHTML = `
  <div class="card"><h2>🏌️ Handicap Index</h2>${ph.length ? `<table><tr><th class="l">ผู้เล่น</th><th>รอบ</th><th>HI</th></tr>${ph.map(x => `<tr><td class="l"><b>${esc(x.name)}</b></td><td>${x.rounds}</td><td class="hcp">${x.hi ?? (x.avg != null ? '~' + x.avg : '-')}</td></tr>`).join('')}</table>
    ` : '<p class="muted">ยังไม่มีประวัติ จบรอบแล้วกด "บันทึกรอบนี้ลงประวัติ" ในหน้าสรุป</p>'}</div>
  ${[...HIST].reverse().map(r => `<div class="card"><div class="ptop"><span><b>${esc(r.course || 'รอบกอล์ฟ')}</b><br><span class="muted">${thDate(r.date)} · ${r.holes} หลุม · Par ${r.par}</span></span><button class="x" data-act="delround" data-v="${r.rid}">🗑</button></div>
    <table><tr><th class="l">ผู้เล่น</th><th>Gross</th><th>Net</th><th>Diff</th><th>เสีย</th></tr>${r.players.filter(p => p.n).sort((a, b) => (a.gross - a.par) - (b.gross - b.par)).map(p => `<tr><td class="l">${esc(p.name)}</td><td><b>${p.gross}</b></td><td>${p.net}</td><td>${p.diff ?? '-'}</td><td class="pay">${p.money}฿</td></tr>`).join('')}</table></div>`).join('')}
  ${HIST.length ? '<button class="btn red full" data-act="clearhist">🗑 ลบประวัติทั้งหมด</button>' : ''}
  <button class="btn sec full" data-act="home">🏠 กลับหน้าแรก</button>`;
}

/* ---------- scorecard image ---------- */
async function scoreImage() {
  const ps = K.players(G), N = K.nHoles(G), hc = K.hasHC(G), W = 1080, M = 30, RH = 50, NW = 170, SW = 90;
  const blocks = N == 18 ? [[0, 9, 'OUT'], [9, 18, 'IN']] : [[0, N, 'รวม']];
  const H = 150 + blocks.length * ((ps.length + 2) * RH + 30) + (ps.length + 1) * RH + 90;
  const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
  const F = (w, s) => `${w} ${s}px -apple-system,"Noto Sans Thai",Tahoma,sans-serif`;
  x.fillStyle = '#fff'; x.fillRect(0, 0, W, H); x.fillStyle = '#1b5e20'; x.fillRect(0, 0, W, 120);
  x.fillStyle = '#fff'; x.font = F('bold', 40); x.textBaseline = 'middle'; x.fillText('⛳ ' + (G.meta.course || 'สกอร์การ์ด'), M, 48);
  x.font = F('', 26); x.fillText(`${thDate(G.meta.date)} · ${N} หลุม · Par ${K.totalPar(G)}${G.meta.tee ? ' · Tee ' + G.meta.tee : ''}`, M, 92);
  let y = 150; x.textAlign = 'center';
  const cell = (t, cx, cy, o = {}) => { x.font = F(o.b ? 'bold' : '', o.s || 24); x.fillStyle = o.c || '#1c2b1c'; x.fillText(t, cx, cy); };
  blocks.forEach(([a, b, lab]) => { const cw = (W - 2 * M - NW - SW) / (b - a);
    x.fillStyle = '#e8f1e8'; x.fillRect(M, y, W - 2 * M, RH * 2); cell('หลุม', M + NW / 2, y + RH / 2, { b: 1 }); cell('Par', M + NW / 2, y + RH * 1.5, { c: '#556' });
    let tp = 0; for (let i = a; i < b; i++) { const cx = M + NW + cw * (i - a + .5); cell(String(i + 1), cx, y + RH / 2, { b: 1 }); cell(String(K.par(G, i)), cx, y + RH * 1.5, { c: '#556' }); tp += K.par(G, i); }
    cell(lab, W - M - SW / 2, y + RH / 2, { b: 1 }); cell(String(tp), W - M - SW / 2, y + RH * 1.5, { c: '#556' }); y += RH * 2;
    ps.forEach((p, k) => { if (k % 2) { x.fillStyle = '#f7faf7'; x.fillRect(M, y, W - 2 * M, RH); }
      x.textAlign = 'left'; cell(p.name.slice(0, 9), M + 10, y + RH / 2, { b: 1 }); x.textAlign = 'center'; let t = 0, n = 0;
      for (let i = a; i < b; i++) { const sc = K.score(G, p.id, i), cx = M + NW + cw * (i - a + .5), cy = y + RH / 2; if (sc == null) { cell('-', cx, cy, { c: '#aaa' }); continue; }
        t += sc; n++; const d = sc - K.par(G, i);
        if (d < 0) { x.strokeStyle = '#c62828'; x.lineWidth = 2.5; x.beginPath(); x.arc(cx, cy, 18, 0, 7); x.stroke(); if (d < -1) { x.beginPath(); x.arc(cx, cy, 23, 0, 7); x.stroke(); } }
        else if (d > 0) { x.strokeStyle = '#1565c0'; x.lineWidth = 2; x.strokeRect(cx - 17, cy - 17, 34, 34); if (d > 1) x.strokeRect(cx - 22, cy - 22, 44, 44); }
        cell(String(sc), cx, cy + 1, { b: 1, c: d < 0 ? '#c62828' : '#1c2b1c' }); }
      cell(n ? String(t) : '-', W - M - SW / 2, y + RH / 2, { b: 1 }); y += RH; });
    y += 30; });
  const MON = K.moneyOn(G), cols = ['ผู้เล่น', 'Gross', '+/-', ...(hc ? ['Net'] : []), 'พัตต์', 'GIR', ...(MON ? ['เสีย'] : [])], cw2 = (W - 2 * M - 200) / (cols.length - 1);
  x.fillStyle = '#e8f1e8'; x.fillRect(M, y, W - 2 * M, RH); cols.forEach((t, k) => { x.textAlign = k ? 'center' : 'left'; cell(t, k ? M + 200 + cw2 * (k - .5) : M + 10, y + RH / 2, { b: 1 }); }); y += RH;
  board().forEach(({ p, s }, k) => { if (k % 2) { x.fillStyle = '#f7faf7'; x.fillRect(M, y, W - 2 * M, RH); }
    const v = [p.name.slice(0, 12), String(s.gross), K.fd(s.gross - s.par), ...(hc ? [String(s.net)] : []), String(s.putts), s.g + '/' + s.n, ...(MON ? [s.money + '฿'] : [])];
    v.forEach((t, j) => { x.textAlign = j ? 'center' : 'left'; cell(t, j ? M + 200 + cw2 * (j - .5) : M + 10, y + RH / 2, { b: j < 2, c: MON && j === v.length - 1 ? '#c62828' : '#1c2b1c' }); }); y += RH; });
  x.textAlign = 'left'; cell('○ ต่ำกว่า Par   □ เกิน Par   · Golf Live', M, H - 40, { s: 20, c: '#889' });
  const blob = await new Promise(r => c.toBlob(r, 'image/png')), file = new File([blob], `scorecard-${G.meta.date}.png`, { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file] }); return; } catch (e) { if (e?.name === 'AbortError') return; } }
  dlg(`<p>กดค้างที่รูป → บันทึกรูปภาพ</p><img src="${c.toDataURL('image/png')}" style="width:100%;border-radius:8px"><button class="btn full" data-r>ปิด</button>`, d => d.addEventListener('click', e => { if (e.target.closest('[data-r]')) d.remove(); }));
}

/* ---------- events ---------- */
document.addEventListener('click', async e => {
  if (e.target.closest('.dlg') || e.target.closest('#mapwrap')) return;
  const t = e.target.closest('[data-act],[data-tab]'); if (!t || t.disabled) return;
  setTimeout(keepAwake, 0);
  if (t.dataset.tab) { UI.tab = t.dataset.tab; jset(DEV, 'golf2_tab', UI.tab); render(); scrollTo(0, 0); return; }
  const a = t.dataset.act, v = t.dataset.v;
  const pid = UI.editPid || ME, i = UI.cur;
  switch (a) {
    case 'sun': setPref('sun', !PREF.sun); applyPrefs(); render(); return;
    case 'wake': setPref('wake', !PREF.wake); keepAwake(); toast(PREF.wake ? '💡 กันจอดับ: เปิด' : 'กันจอดับ: ปิด'); render(); return;
    case 'home': go(null); return;
    case 'retry': route(); return;
    case 'create': UI.view = 'create'; UI.pendGeo = null; render(); return;
    case 'docreate': t.disabled = true; try { await doCreate(); } catch (er) { toast('สร้างไม่สำเร็จ: ' + er.message); t.disabled = false; } return;
    case 'joincode': { const c = document.getElementById('jcode').value.trim().toUpperCase(); if (c.length === 6) go(c); else toast('รหัสแก๊งมี 6 ตัว'); return; }
    case 'open': go(v); return;
    case 'hist': UI.view = 'hist'; render(); return;
    case 'forget': { const pend = Object.keys(jget(DEV, 'golf2_outbox_' + v, {})).length;
      if (!(await ask(pend ? `แก๊ง ${v} ยังมีข้อมูลรอส่ง ${pend} รายการ ลบออกจากเครื่องนี้เลยไหม?` : `ลบแก๊ง ${v} ออกจากรายการ?`))) return;
      forgetGame(v); render(); return; }
    case 'forgetall': if (!(await ask('ลบรายการแก๊งทั้งหมดในเครื่องนี้?'))) return; myGames().forEach(g => forgetGame(g.code)); render(); return;
    case 'clearhist': if (!(await ask('ลบประวัติทั้งหมด? (Handicap Index จะเริ่มนับใหม่)'))) return; HIST = []; jset(localStorage, 'golf2_hist', HIST); render(); return;
    case 'delgang': { if (!(await ask('ลบแก๊งนี้ทิ้ง? คะแนน แผนที่ และข้อมูลของทุกคนในแก๊งจะหายถาวร'))) return;
      const c = CODE; await Promise.all([ST.set('games/' + c, null), ST.set('geos/' + c, null), ST.set(`locs/${c}/${ME}`, null)]).catch(() => {});
      forgetGame(c); toast('ลบแก๊งแล้ว'); go(null); return; }
    case 'delround': if (await ask('ลบรอบนี้ออกจากประวัติ?')) { HIST = HIST.filter(r => r.rid !== v); jset(localStorage, 'golf2_hist', HIST); render(); } return;
    case 'checkpin': checkPin(); return;
    case 'claim': claim(v, false); return;
    case 'joinnew': claim(null, true); return;
    case 'prev': if (i > 0) { UI.cur--; sendHole(UI.cur); } render(); scrollTo(0, 0); return;
    case 'next': if (i < K.nHoles(G) - 1) { UI.cur++; sendHole(UI.cur); } render(); scrollTo(0, 0); return;
    case 'jump': UI.cur = +v; sendHole(UI.cur); render(); return;
    case 'tab': UI.tab = v; jset(DEV, 'golf2_tab', v); render(); scrollTo(0, 0); return;
    case 'editfor': UI.editPid = v; render(); return;
    case 'par': gw(`holes/${hk(i)}/par`, +v); return;
    case 'inc': case 'dec': { const e0 = { on: null, putt: null, tee: null, lost: 0, water: 0, ob: 0, bunker: 0, ...(K.ent(G, pid, i) || {}) }, f = t.dataset.f;
      if (e0[f] == null) e0[f] = f === 'on' ? Math.max(1, K.par(G, i) - 2) : 2;
      else if (a === 'inc') e0[f] = Math.min(20, e0[f] + 1);
      else { const min = f === 'on' ? 1 : 0; e0[f] = e0[f] <= min ? null : e0[f] - 1; }
      writeEntry(pid, i, e0); return; }
    case 'tee': { const e0 = { on: null, putt: null, lost: 0, water: 0, ob: 0, bunker: 0, ...(K.ent(G, pid, i) || {}) }; e0.tee = e0.tee === v ? null : v; writeEntry(pid, i, e0); return; }
    case 'pen': { const e0 = { on: null, putt: null, tee: null, lost: 0, water: 0, ob: 0, bunker: 0, ...(K.ent(G, pid, i) || {}) }; e0[v] = ((e0[v] || 0) + 1) % 4; writeEntry(pid, i, e0); return; }
    case 'sortBy': UI.sortBy = v; render(); return;
    case 'gsearch': searchDownload(); return;
    case 'gwiz': window.__wiz(); return;
    case 'ghere': if (!gps) { toast('ยังไม่ได้ตำแหน่ง GPS · อนุญาตตำแหน่งให้ Safari/Chrome แล้วลองใหม่'); startGps(); return; } downloadIntoGame({ lat: gps.lat, lng: gps.lng, radius: 2000 }); return;
    case 'csearch': { const q = document.getElementById('c_course').value.trim(); const r = await courseSearchDialog(q); if (!r) return;
      const d = await fetchCourse(r); if (!d) return; const rep = courseReport(d);
      if (!rep.ok) { info('ไม่พบข้อมูลสนาม', rep.html); return; }
      UI.pendGeo = { d, name: r.name }; const inp = document.getElementById('c_course'); inp.value = r.name;
      document.getElementById('c_geo').innerHTML = `<div class="note ok">🗺️ ${rep.html}</div>`; return; }
    case 'shot': addShot(pid, i); return;
    case 'delshot': { const sh = shotsOf(pid, i).find(x => x.k === v); if (sh && await ask(`ลบช็อต ${sh.club}?`)) gw(`shots/${pid}/${hk(i)}/${v}`, null); return; }
    case 'fitlive': updateLiveMap(true); return;
    case 'tip': toast(v); return;
    case 'sharelink': { const url = joinUrl(); if (navigator.share) { try { await navigator.share({ text: `เข้าแก๊งกอล์ฟ ${G.meta.course || ''} (รหัส ${CODE})`, url }); return; } catch (er) { if (er?.name === 'AbortError') return; } }
      try { await navigator.clipboard.writeText(url); toast('คัดลอกลิงก์แล้ว'); } catch (er) { info('ลิงก์เข้าแก๊ง', esc(url)); } return; }
    case 'addp': { const n = document.getElementById('addname').value.trim(); if (!n) return; if (K.players(G).length >= 10) return toast('ครบ 10 คนแล้ว');
      if (K.players(G).some(p => p.name.trim() === n)) return toast('ชื่อซ้ำ');
      gw(`players/p${Date.now().toString(36)}`, { name: n, hc: '', uid: '', color: COLORS[K.players(G).length % COLORS.length], joinedAt: Date.now() }); return; }
    case 'kick': { const p = G.players[v]; if (await ask(`เอา "${p.name}" ออกจากแก๊ง? (คะแนนของคนนี้จะหายด้วย)`)) ['players/', 'scores/', 'pos/', 'shots/'].forEach(k => gw(k + v, null)); return; }
    case 'moneytoggle': { const on = !K.moneyOn(G); if (!on && !(await ask('ปิดกินตัง? (ไม่สุ่มเงินหลุมต่อไป ยอดที่คิดไปแล้วจะไม่แสดง)'))) return; gw('meta/money', on); toast(on ? '💰 เปิดกินตังแล้ว' : 'ปิดกินตังแล้ว'); return; }
    case 'setmeta': gw(`meta/${t.dataset.k}`, t.dataset.k === 'holes' ? +v : v); return;
    case 'unit': setPref('unit', v); render(); return;
    case 'leave': if (Object.keys(OUT).length && !(await ask(`ยังมีข้อมูลรอส่ง ${Object.keys(OUT).length} รายการ (รอเน็ต) ถ้าออกตอนนี้จะหาย ออกเลยไหม?`))) return;
      if (await ask('ออกจากแก๊งในเครื่องนี้? (คะแนนที่ส่งแล้วยังอยู่ เข้าใหม่ได้ด้วย PIN)')) { DEV.removeItem(okey()); DEV.removeItem(ckey()); setId(CODE, null); go(null); } return;
    case 'img': scoreImage(); return;
    case 'copytxt': { const s = sumText(); try { await navigator.clipboard.writeText(s); toast('คัดลอกแล้ว ✓'); } catch (er) { info('สรุป', `<textarea style="height:200px">${esc(s)}</textarea>`); } return; }
    case 'saveround': saveRound(); return;
    case 'savecourse': saveCourse(); return;
  }
});
document.addEventListener('change', e => {
  const t = e.target, d = t.dataset;
  if (d.meta) gw(`meta/${d.meta}`, t.value.trim());
  if (d.amt) { const am = K.amounts(G); am[+d.amt] = +t.value || 0; gw('meta/amounts', am); }
  if (d.phc) gw(`players/${d.phc}/hc`, t.value.trim());
  if (d.hset) gw(`holes/${hk(UI.cur)}/${d.hset}`, t.value.trim());
  if (d.hpar) { gw(`holes/${hk(+d.hpar)}/par`, +t.value); gw('meta/parSrc', 'manual'); }
  if (d.hsi) gw(`holes/${hk(+d.hsi)}/si`, t.value.trim());
});
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'j_pin') checkPin(); if (e.key === 'Enter' && e.target.id === 'jcode') document.querySelector('[data-act=joincode]')?.click(); });
// iPhone: บังคับ focus ช่องกรอกตอนยกนิ้ว
document.addEventListener('touchend', e => { const el = e.target.closest?.('input:not([type=file]):not([disabled]),textarea'); if (el && document.activeElement !== el) el.focus(); }, { passive: true });

setInterval(() => { if (UI.view === 'game' && UI.tab === 'live' && !document.querySelector('.dlg')) render(); }, 30000); // อัปเดตเวลา "x นาทีที่แล้ว"

// อัปเดตแอปอัตโนมัติ: มีเวอร์ชันใหม่ → โหลดใหม่ให้เอง (ข้อมูลทั้งหมดเก็บไว้แล้ว ไม่หาย)
if ('serviceWorker' in navigator && location.protocol.startsWith('http') && (!MOCK || Q.has('sw'))) {
  const had = !!navigator.serviceWorker.controller; let reloading = false;
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(reg => {
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
  }).catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!had || reloading) return;
    const busy = document.querySelector('.dlg') || (document.activeElement && document.activeElement.matches('input,textarea'));
    if (busy) { toast('มีเวอร์ชันใหม่ · ปิดแล้วเปิดแอปใหม่เพื่ออัปเดต'); return; }
    reloading = true; location.reload();
  });
}
boot().catch(e => { $app.innerHTML = `<div class="card">เกิดข้อผิดพลาด: ${esc(e.message)}</div>`; });
