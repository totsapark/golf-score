// แผนที่สนาม: ภาพดาวเทียม + กรีน/บังเกอร์/น้ำจาก OpenStreetMap, ระยะถึงกรีน (GPS), บันทึกช็อต
import { hk, dist, par } from './golf.js';
import { LANG } from './i18n.js';
const L = window.L;
export const SAT = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const STY = {
  course: { color: '#2e6b2b', weight: 1, fillColor: '#4f8f4c', fillOpacity: .9 },
  rough: { color: '#33691e', weight: 0, fillColor: '#558b2f', fillOpacity: .35 },
  trees: { color: '#1e4d1c', weight: 0, fillColor: '#2a5f27', fillOpacity: .9 },
  fairway: { color: '#7cb342', weight: 1, fillColor: '#8bc34a', fillOpacity: .7 },
  tee: { color: '#689f38', weight: 1, fillColor: '#aed581', fillOpacity: .85 },
  water: { color: '#0277bd', weight: 1, fillColor: '#29b6f6', fillOpacity: .85 },
  bunker: { color: '#c9a95c', weight: 1, fillColor: '#f3e2ad', fillOpacity: .95 },
  green: { color: '#1b5e20', weight: 1.5, fillColor: '#43a047', fillOpacity: .9 },
};
const ORDER = ['course', 'rough', 'trees', 'fairway', 'tee', 'water', 'bunker', 'green', 'path'];
// เซิร์ฟเวอร์ Overpass (ตัวหลัก + สำรอง ถ้าตัวไหนล่มจะลองตัวถัดไปเอง)
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];
// ไม้กอล์ฟ: กลุ่มหลัก (กดครั้งเดียว) + ระบุเบอร์ได้ถ้าต้องการ
export const CLUB_MAIN = [['D', 'Driver'], ['FW', 'แฟร์เวย์วู้ด'], ['HY', 'ไฮบริด'], ['Iron', 'เหล็ก'], ['Wedge', 'เวดจ์'], ['Putter', 'พัตเตอร์']];
export const CLUB_SUB = { FW: ['3W', '4W', '5W', '7W', '9W'], HY: ['2H', '3H', '4H', '5H', '6H'], Iron: ['2i', '3i', '4i', '5i', '6i', '7i', '8i', '9i'],
  Wedge: ['PW', 'AW', 'GW', 'SW', 'LW', '48°', '50°', '52°', '54°', '56°', '58°', '60°'] };
export const CLUB_ORDER = ['D', ...['FW', 'HY', 'Iron', 'Wedge'].flatMap(k => [k, ...CLUB_SUB[k]]), 'Putter'];
export function clubCat(c) { if (c === 'D' || c === 'Putter' || CLUB_MAIN.some(m => m[0] === c)) return c; for (const k in CLUB_SUB) if (CLUB_SUB[k].includes(c)) return k; return c; }
// หมุดผู้เล่นบนแผนที่ (สีประจำตัว + ชื่อ + หลุม)
export function personIcon(name, color, hole, stale) {
  return L.divIcon({ className: '', iconSize: [0, 0], html: `<div class="pp ${stale ? 'stale' : ''}" style="--c:${color || '#2e7d32'}"><b>${esc((name || '?').slice(0, 1))}</b><span>${esc(name)}${hole != null ? ' · H' + (hole + 1) : ''}</span></div>` });
}

function pip(pt, poly) { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [yi, xi] = poly[i], [yj, xj] = poly[j]; if (((yi > pt[0]) !== (yj > pt[0])) && (pt[1] < (xj - xi) * (pt[0] - yi) / (yj - yi) + xi)) c = !c; } return c; }
function centroid(poly) { let a = 0, b = 0; poly.forEach(p => { a += p[0]; b += p[1]; }); return [a / poly.length, b / poly.length]; }
const icon = (html, cls = '') => L.divIcon({ html: `<div class="${cls}">${html}</div>`, className: '', iconSize: null });
const lbl = (t, cls = '') => L.divIcon({ html: `<span class="mlbl ${cls}">${t}</span>`, className: '', iconAnchor: [-6, 10] });

export async function importOSM(lat, lng, radius = 2000) {
  const a = `(around:${Math.round(radius)},${lat},${lng})`;
  const q = `[out:json][timeout:40];(way["golf"]${a};relation["golf"]${a};way["natural"="water"]${a};way["leisure"="golf_course"]${a};relation["leisure"="golf_course"]${a};way["natural"="wood"]${a};way["landuse"="forest"]${a};);out geom;`;
  let last;
  for (const url of [...OVERPASS, ...OVERPASS]) { // ไล่ทุกเซิร์ฟเวอร์ 2 รอบ (เซิร์ฟเวอร์ฟรีมักตอบ busy)
    try {
      const ac = new AbortController(), tm = setTimeout(() => ac.abort(), 35000);
      const r = await fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: ac.signal });
      clearTimeout(tm);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const d = clipToCourse(parseOSM(await r.json()), [lat, lng]); d.center = [lat, lng]; return d;
    } catch (e) { last = e; }
  }
  throw new Error('เชื่อมต่อเซิร์ฟเวอร์แผนที่ไม่ได้ (' + (last?.message || '') + ')');
}
// เก็บเฉพาะของที่อยู่ในสนามที่เลือก (กันข้อมูลสนามข้างเคียงปนมา)
function clipToCourse(d, at) {
  const cs = d.features.filter(f => f.k === 'course');
  if (!cs.length) return d;
  const course = cs.find(f => pip(at, f.c)) || cs.map(f => ({ f, d: dist(at, centroid(f.c)) })).sort((a, b) => a.d - b.d)[0].f;
  if (!pip(at, course.c) && dist(at, centroid(course.c)) > 1500) return d;
  const inside = p => pip(p, course.c), mid = c => c[Math.floor(c.length / 2)];
  const features = d.features.filter(f => f === course || (f.k !== 'course' && (f.line ? inside(mid(f.c)) || inside(f.c[0]) : inside(centroid(f.c)))));
  const holes = {}; Object.entries(d.holes).forEach(([h, x]) => { if (inside(x.green) || inside(x.tee)) holes[h] = x; });
  return { ...d, name: course.name || d.name, holes, features, outline: course.c };
}
// ค้นหาสนามกอล์ฟจากชื่อ (OpenStreetMap Nominatim)
export async function searchCourses(q) {
  const go = async s => { const r = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(s)}&countrycodes=th&format=jsonv2&limit=8&accept-language=${LANG === 'en' ? 'en,th' : 'th,en'}`); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); };
  let res = await go(q);
  if (!res.some(r => r.type === 'golf_course') && !/golf|กอล์ฟ/i.test(q)) res = [...(await go(q + ' golf')), ...res];
  const seen = new Set();
  return res.filter(r => { const k = r.osm_type + r.osm_id; if (seen.has(k)) return false; seen.add(k); return true; })
    .map(r => { const b = (r.boundingbox || []).map(Number), c = [+r.lat, +r.lon];
      const rad = b.length === 4 ? Math.max(dist(c, [b[0], b[2]]), dist(c, [b[1], b[3]])) + 250 : 1500;
      return { cid: `osm-${r.osm_type}-${r.osm_id}`, name: r.name || r.display_name.split(',')[0], addr: r.display_name.split(',').slice(1, 4).join(',').trim(), lat: c[0], lng: c[1], radius: Math.min(3000, Math.max(700, rad)), golf: r.type === 'golf_course' }; })
    .sort((a, b) => b.golf - a.golf);
}
export function parseOSM(j) {
  const holes = {}, features = []; let name = '';
  const geo = arr => (arr || []).map(p => [+(+p.lat).toFixed(6), +(+p.lon).toFixed(6)]);
  for (const el of j.elements || []) {
    const t = el.tags || {}, g = geo(el.geometry);
    if (t.leisure === 'golf_course' && t.name) name = t['name:th'] || t.name;
    if (t.golf === 'hole' && g.length >= 2) {
      const n = parseInt(t.ref, 10);
      if (n >= 1 && n <= 18) holes[hk(n - 1)] = { tee: g[0], green: g[g.length - 1], line: g, par: +t.par || null, si: +t.handicap || null };
      continue;
    }
    if ((t.golf === 'cartpath' || t.golf === 'path') && g.length >= 2) { features.push({ k: 'path', c: g, line: 1 }); continue; }
    const k = t.golf === 'green' ? 'green' : t.golf === 'bunker' ? 'bunker' : t.golf === 'fairway' ? 'fairway' : t.golf === 'tee' ? 'tee'
      : (t.golf === 'water_hazard' || t.golf === 'lateral_water_hazard' || t.natural === 'water') ? 'water' : t.golf === 'rough' ? 'rough'
      : t.leisure === 'golf_course' ? 'course' : (t.natural === 'wood' || t.landuse === 'forest') ? 'trees' : null;
    if (!k) continue;
    if (el.type === 'way' && g.length >= 3) features.push(k === 'course' ? { k, c: g, name: t['name:th'] || t.name || '' } : { k, c: g });
    if (el.type === 'relation') (el.members || []).filter(m => m.role === 'outer' && m.geometry).forEach(m => { const c = geo(m.geometry); if (c.length >= 3) features.push({ k, c }); });
  }
  return { name, holes, features };
}

export function createMap(el, ctx) {
  el.innerHTML = `<div id="map"></div>
    <div class="mtop"><div class="mbox mhole"><button data-m="prev">‹</button><div class="center" style="min-width:46px"><b id="mh" style="font-size:20px"></b><div class="muted" id="mp" style="font-size:11px"></div></div><button data-m="next">›</button></div>
      <div class="mbox mdist" id="md"></div></div>
    <div class="mside"><button data-m="loc" title="ตำแหน่งฉัน">🎯</button><button data-m="fit" title="ทั้งหลุม">⛳</button><button data-m="mode" title="ดาวเทียม/กราฟิก">🛰️</button><button data-m="menu" title="ข้อมูลสนาม">⚙️</button></div>
    <div class="mhz" id="mhz" hidden></div>
    <div class="mwiz" id="mwiz" hidden></div>
    <div class="mbot" ${ctx.shotsOn && !ctx.shotsOn() ? 'hidden' : ''}><button class="btn" data-m="shot">📍 บันทึกช็อต</button><button class="btn sec" data-m="shots" id="mshots">ช็อต</button></div>`;
  const map = L.map(el.querySelector('#map'), { zoomControl: false, maxZoom: 21, attributionControl: true, tap: true });
  map.attributionControl.setPrefix(false);
  const sat = L.tileLayer(SAT, { maxNativeZoom: 19, maxZoom: 21, attribution: 'Imagery © Esri, Maxar · Course © OpenStreetMap' });
  const featL = L.layerGroup().addTo(map), holeL = L.layerGroup().addTo(map), shotL = L.layerGroup().addTo(map),
    peopleL = L.layerGroup().addTo(map), meL = L.layerGroup().addTo(map), tgtL = L.layerGroup().addTo(map), hzL = L.layerGroup().addTo(map);
  // ไม่มีเน็ต → ใช้แผนที่กราฟิก (ภาพดาวเทียมโหลดไม่ได้)
  let geo = ctx.geo() || { holes: {}, features: [] }, satOn = navigator.onLine ? ctx.pref('sat', true) : false, setMode = null, target = null, lastHole = -1, wiz = null;
  if (satOn) sat.addTo(map);
  map.setView([13.75, 100.5], 6);
  const U = () => ctx.unit(), fmt = m => m == null ? '–' : Math.round(U() === 'y' ? m * 1.09361 : m), un = () => U() === 'y' ? 'หลา' : 'ม.';

  setTimeout(() => { drawFeatures(); drawHole(true); }, 0);

  function hg(i) { return geo?.holes?.[hk(i)] || {}; }
  // แท่นทีตามสี Tee ที่เลือกในแก๊ง (Black/Gold/Blue/White/Red) ถ้าไม่ระบุใช้ Blue
  function teeOf(h) { const t = h.tees; if (!t) return h.tee; const want = (ctx.G().meta?.tee || '').trim().toLowerCase(), alias = { yellow: 'gold', gold: 'yellow' }; const ks = Object.keys(t); const k = ks.find(x => x.toLowerCase() === want) || ks.find(x => x.toLowerCase() === alias[want]) || (t.Blue ? 'Blue' : ks[0]); return t[k] || h.tee; }
  function greenPoly(i) {
    const g = hg(i).green; if (!g || !geo?.features) return null;
    const greens = geo.features.filter(f => f.k === 'green');
    return greens.find(f => pip(g, f.c)) || greens.map(f => ({ f, d: dist(g, centroid(f.c)) })).filter(x => x.d < 60).sort((a, b) => a.d - b.d)[0]?.f || null;
  }
  function drawFeatures() {
    featL.clearLayers();
    const fo = satOn ? .45 : 1;
    [...(geo?.features || [])].sort((a, b) => ORDER.indexOf(a.k) - ORDER.indexOf(b.k)).forEach(f => {
      if (satOn && ['rough', 'course', 'trees'].includes(f.k)) return;
      if (f.line) { L.polyline(f.c, { color: satOn ? '#eee' : '#d7d2c4', weight: 3, opacity: satOn ? .5 : .9, dashArray: satOn ? '4 6' : null, interactive: false }).addTo(featL); return; }
      const s = { ...STY[f.k] }; s.fillOpacity = Math.min(1, s.fillOpacity * fo);
      L.polygon(f.c, { ...s, interactive: false }).addTo(featL);
    });
    // เลขหลุมที่กรีนทุกหลุม
    Object.entries(geo?.holes || {}).forEach(([h, x]) => { const n = +h.slice(1); if (!x.green || n >= ctx.N()) return;
      L.marker(x.green, { interactive: false, icon: L.divIcon({ className: '', iconSize: [0, 0], html: `<span class="hnum">${n + 1}</span>` }) }).addTo(featL); });
    el.querySelector('#map').style.background = satOn ? '#333' : '#3d7a3a';
  }
  function from() {
    const i = ctx.hole(), g = ctx.gps(), h = hg(i);
    if (g && h.green && dist([g.lat, g.lng], h.green) < 1200) return { p: [g.lat, g.lng], me: true };
    const t = teeOf(h); return t ? { p: t, me: false } : g ? { p: [g.lat, g.lng], me: true } : null;
  }
  // ระยะอุปสรรค (น้ำ/บังเกอร์) ตามแนวตีจากจุดที่ยืน → กรีน: ถึง = ขอบหน้า, ข้าม = ขอบหลัง
  function hazards(i, f) {
    const h = hg(i); if (!h.green || !f || !geo?.features?.length) return [];
    const path = !f.me && h.line && h.line.length > 2 ? [f.p, ...h.line.slice(1)] : [f.p, h.green];
    const la0 = f.p[0], kx = Math.cos(la0 * Math.PI / 180) * 111320, ky = 110540;
    const xy = p => [(p[1] - f.p[1]) * kx, (p[0] - la0) * ky];
    const P = path.map(xy), seg = []; let tot = 0;
    for (let k = 1; k < P.length; k++) { const [ax, ay] = P[k - 1], [bx, by] = P[k], l = Math.hypot(bx - ax, by - ay) || 1e-6; seg.push({ ax, ay, dx: (bx - ax) / l, dy: (by - ay) / l, l, s0: tot }); tot += l; }
    const proj = q => { let best = null; for (const g of seg) { const vx = q[0] - g.ax, vy = q[1] - g.ay, t = Math.max(0, Math.min(g.l, vx * g.dx + vy * g.dy)), lat = g.dx * vy - g.dy * vx, off = Math.hypot(vx - t * g.dx, vy - t * g.dy);
      if (!best || off < best.off) best = { s: g.s0 + t, lat, off }; } return best; };
    const out = [];
    geo.features.forEach(ft => {
      if ((ft.k !== 'water' && ft.k !== 'bunker') || ft.line) return;
      if (dist(f.p, centroid(ft.c)) > tot + 300) return;
      let lo = null, hi = null, side = 0, n = 0;
      for (let k = 0; k < ft.c.length; k++) {                     // เดินรอบขอบทุก ~4 ม.
        const a = ft.c[k], b = ft.c[(k + 1) % ft.c.length], A = xy(a), B = xy(b), m = Math.max(1, Math.ceil(Math.hypot(B[0] - A[0], B[1] - A[1]) / 4));
        for (let j = 0; j < m; j++) { const t = j / m, q = [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t], r = proj(q);
          if (r.off > 35 || r.s < 5 || r.s > tot + 20) continue;
          const ll = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; n++; side += r.lat;
          if (!lo || r.s < lo.s) lo = { s: r.s, ll }; if (!hi || r.s > hi.s) hi = { s: r.s, ll }; }
      }
      if (!n) return;
      const sd = side / n; if (out.some(o => o.k === ft.k && Math.abs(o.reach - lo.s) < 3 && Math.abs(o.carry - hi.s) < 3)) return; // รูปซ้ำในข้อมูล
      out.push({ k: ft.k, reach: lo.s, carry: hi.s, pR: lo.ll, pC: hi.ll, side: sd > 8 ? 'L' : sd < -8 ? 'R' : 'C' });
    });
    return out.sort((a, b) => a.reach - b.reach).slice(0, 5);
  }
  function drawHaz(i, f) {
    hzL.clearLayers(); const box = el.querySelector('#mhz'), hz = hazards(i, f);
    box.hidden = !hz.length; if (!hz.length) { box.innerHTML = ''; return; }
    const SIDE = { L: 'ซ้าย', R: 'ขวา', C: 'ขวางหน้า' };
    box.innerHTML = hz.map(x => `<div><span>${x.k === 'water' ? '💧' : '🏖️'}</span><span class="hs">${SIDE[x.side]}</span><b>${fmt(x.reach)}</b><i>›</i><b>${fmt(x.carry)}</b></div>`).join('');
    hz.forEach(x => {
      const c = x.k === 'water' ? 'hzw' : 'hzb';
      L.marker(x.pR, { icon: L.divIcon({ html: `<span class="mlbl ${c}">${fmt(x.reach)}</span>`, className: '', iconAnchor: [14, 10] }), interactive: false }).addTo(hzL);
      if (x.carry - x.reach > 8) L.marker(x.pC, { icon: L.divIcon({ html: `<span class="mlbl ${c}">${fmt(x.carry)}</span>`, className: '', iconAnchor: [14, 10] }), interactive: false }).addTo(hzL);
    });
  }
  function drawDist() {
    const i = ctx.hole(), h = hg(i), f = from(), md = el.querySelector('#md');
    drawHaz(i, h.green ? f : null);
    if (!h.green) { md.innerHTML = `<div class="muted" style="align-self:center;font-size:13px">ยังไม่มีจุดกรีนของหลุมนี้<br>กด ⚙️ เพื่อโหลดข้อมูลสนามหรือปักเอง</div>`; return; }
    if (!f) { md.innerHTML = `<div class="muted" style="align-self:center">รอ GPS...</div>`; return; }
    const gp = greenPoly(i); let fr = null, bk = null;
    if (gp) { const ds = gp.c.map(p => dist(f.p, p)); fr = Math.min(...ds); bk = Math.max(...ds); }
    else if (h.front && h.back) { fr = dist(f.p, h.front); bk = dist(f.p, h.back); }
    const fb = gp || (h.front && h.back);
    const c = dist(f.p, h.green);
    md.innerHTML = `${fb ? `<div><b style="font-size:18px">${fmt(fr)}</b><small>หน้า</small></div>` : ''}<div><b>${fmt(c)}</b><small>กลางกรีน (${un()})${f.me ? '' : ' จากที'}</small></div>${fb ? `<div><b style="font-size:18px">${fmt(bk)}</b><small>หลัง</small></div>` : ''}`;
  }
  function drawHole(refit) {
    const i = ctx.hole(), G = ctx.G(), h = hg(i);
    el.querySelector('#mh').textContent = 'H' + (i + 1);
    el.querySelector('#mp').textContent = 'Par ' + par(G, i);
    holeL.clearLayers();
    const T = teeOf(h);
    if (T) L.marker(T, { icon: icon('T', 'mlbl w'), interactive: false }).addTo(holeL);
    if (h.green) L.marker(h.green, { icon: L.divIcon({ html: '<div style="font-size:26px;transform:translate(-4px,-26px)">⛳</div>', className: '', iconSize: [0, 0] }), interactive: false }).addTo(holeL);
    if (T && h.green) L.polyline(h.line && h.line.length > 2 ? [T, ...h.line.slice(1)] : [T, h.green], { color: '#fff', weight: 2, dashArray: '6 6', opacity: .9, interactive: false }).addTo(holeL);
    if (refit || i !== lastHole) {
      lastHole = i; target = null; tgtL.clearLayers();
      const pts = [T, h.green, ...(h.line || [])].filter(Boolean);
      if (pts.length >= 2) map.fitBounds(L.latLngBounds(pts), { padding: [70, 70], maxZoom: 19 });
      else if (h.green) map.setView(h.green, 18);
      else if (geo?.features?.length) map.fitBounds(L.latLngBounds(geo.features.flatMap(f => f.c)), { padding: [30, 30] });
      else { const g = ctx.gps(); if (g) map.setView([g.lat, g.lng], 17); }
    }
    drawShots(); drawPeople(); drawMe(); drawDist(); drawTarget();
  }
  function myShots(i) { const s = ctx.G().shots?.[ctx.me]?.[hk(i)] || {}; return Object.entries(s).map(([k, v]) => ({ k, ...v })).filter(x => x.lat != null).sort((a, b) => a.t - b.t); }
  function drawShots() {
    shotL.clearLayers(); const i = ctx.hole(), s = myShots(i), h = hg(i);
    el.querySelector('#mshots').textContent = `ช็อต (${s.length})`;
    if (!s.length) return;
    const pts = s.map(x => [x.lat, x.lng]); if (h.green) pts.push(h.green);
    L.polyline(pts, { color: '#fdd835', weight: 3, opacity: .95, interactive: false }).addTo(shotL);
    s.forEach((x, k) => {
      const nx = s[k + 1] ? [s[k + 1].lat, s[k + 1].lng] : null, d = nx ? dist([x.lat, x.lng], nx) : null;
      L.marker([x.lat, x.lng], { icon: lbl(`${k + 1}. ${x.club}${d ? ' · ' + fmt(d) : ''}`, 'y') }).addTo(shotL)
        .on('click', async ev => { L.DomEvent.stop(ev); if (await ctx.ask(`ลบช็อต ${k + 1} (${x.club})?`)) ctx.delShot(i, x.k); });
    });
  }
  function drawPeople() {
    peopleL.clearLayers(); const G = ctx.G(), now = Date.now();
    Object.entries(ctx.locs() || {}).forEach(([pid, p]) => {
      if (pid === ctx.me || p.lat == null || now - (p.gt || 0) > 30 * 60e3) return;
      const pl = G.players?.[pid]; if (!pl) return;
      L.marker([p.lat, p.lng], { icon: personIcon(pl.name, pl.color, G.pos?.[pid]?.hole, now - p.gt > 3 * 60e3), interactive: false, zIndexOffset: 500 }).addTo(peopleL);
    });
  }
  function drawMe() {
    meL.clearLayers(); const g = ctx.gps(); if (!g) return;
    L.circle([g.lat, g.lng], { radius: g.acc || 10, color: '#1e88e5', weight: 1, fillOpacity: .12, interactive: false }).addTo(meL);
    L.circleMarker([g.lat, g.lng], { radius: 8, color: '#fff', weight: 3, fillColor: '#1e88e5', fillOpacity: 1, interactive: false }).addTo(meL);
  }
  function drawTarget() {
    tgtL.clearLayers(); if (!target) return;
    const f = from(), h = hg(ctx.hole());
    const a = f ? dist(f.p, target) : null, b = h.green ? dist(target, h.green) : null;
    if (f) L.polyline([f.p, target, ...(h.green ? [h.green] : [])], { color: '#fff', weight: 2, opacity: .9, interactive: false }).addTo(tgtL);
    L.circleMarker(target, { radius: 9, color: '#fff', weight: 3, fillColor: '#e53935', fillOpacity: 1, interactive: false }).addTo(tgtL);
    L.marker(target, { icon: lbl(`${a != null ? fmt(a) : '–'}${b != null ? ' → ' + fmt(b) : ''} ${un()}`, 'w'), interactive: false }).addTo(tgtL);
  }
  /* ---------- ตั้งค่าหลุมเอง: แตะแท่นที → แตะกรีน ทีละหลุม ---------- */
  const wizEl = el.querySelector('#mwiz');
  function setPoint(i, m, p) { const g2 = JSON.parse(JSON.stringify(geo || { holes: {}, features: [] })); g2.holes = g2.holes || {}; g2.holes[hk(i)] = { ...(g2.holes[hk(i)] || {}), [m]: p }; delete g2.holes[hk(i)].line; geo = g2; ctx.saveGeo(g2); }
  function wizShow() {
    el.classList.toggle('wiz', !!wiz);
    if (!wiz) { wizEl.hidden = true; return; }
    const i = wiz.i, h = hg(i), G = ctx.G();
    wizEl.hidden = false;
    wizEl.innerHTML = `<div><b>🛠 หลุม ${i + 1} / ${ctx.N()}</b> · Par ${par(G, i)}<br><span style="font-size:17px">${wiz.step === 'tee' ? '👆 แตะที่ <b>แท่นที</b>' : '👆 แตะที่ <b>กลางกรีน</b>'}</span>
</div>
      <div class="grid3" style="margin-top:6px"><button class="btn sec" data-m="wback">‹ ย้อน</button><button class="btn sec" data-m="wskip">ข้าม ›</button><button class="btn" data-m="wdone">เสร็จ</button></div>`;
  }
  function wizGo(i, step = 'tee') {
    const N = ctx.N(); if (i >= N) { wizEnd(true); return; } if (i < 0) i = 0;
    wiz = { i, step }; ctx.setHole(i); const h = hg(i);
    if (h.tee && h.green) map.fitBounds(L.latLngBounds([h.tee, h.green]), { padding: [90, 90], maxZoom: 18 });
    else { const prev = hg(i - 1); if (prev.green) map.setView(prev.green, Math.max(map.getZoom(), 17)); }
    wizShow();
  }
  function wizStart() {
    satOn = true; ctx.setPref('sat', true); sat.addTo(map); drawFeatures();
    if (geo.outline) map.fitBounds(L.latLngBounds(geo.outline), { padding: [20, 20] });
    const first = [...Array(ctx.N()).keys()].find(i => !(hg(i).tee && hg(i).green)) ?? 0;
    wizGo(first);
    ctx.info('🛠 ตั้งค่าหลุมเอง', 'ทำครั้งเดียว ใช้ได้ทั้งแก๊งและรอบหน้า (ประมาณ 5 นาที)<br><br>1. ซูมภาพดาวเทียมหาหลุมนั้น<br>2. แตะที่<b>แท่นที</b><br>3. แตะที่<b>กลางกรีน</b><br>4. แอปไปหลุมถัดไปให้เอง<br><br><span class="muted">ดูลำดับหลุมได้จากป้ายในสนาม หรือแผนผังสนามใน Garmin</span>');
  }
  function wizEnd(all) {
    wiz = null; wizShow();
    const n = Object.values(geo.holes || {}).filter(h => h.tee && h.green).length;
    ctx.saveCourseGeo(geo); drawHole(true);
    ctx.toast(`${all ? 'ครบแล้ว! ' : ''}ตั้งค่าแล้ว ${n} หลุม ✓ บันทึกเป็นแผนที่สนามไว้ใช้รอบหน้า`);
  }
  map.on('click', async e => {
    const p = [+e.latlng.lat.toFixed(6), +e.latlng.lng.toFixed(6)];
    if (wiz) {
      setPoint(wiz.i, wiz.step, p);
      if (wiz.step === 'tee') { wiz.step = 'green'; drawHole(false); wizShow(); }
      else { drawFeatures(); wizGo(wiz.i + 1); }
      return;
    }
    if (setMode) {
      const i = ctx.hole(), m = setMode; setMode = null; el.querySelector('#map').style.cursor = '';
      setPoint(i, m, p); drawHole(false);
      ctx.toast(m === 'tee' ? `ปักแท่นทีหลุม ${i + 1} แล้ว` : `ปักกรีนหลุม ${i + 1} แล้ว`); return;
    }
    target = p; drawTarget();
  });
  el.addEventListener('click', async e => {
    const b = e.target.closest('[data-m]'); if (!b) return; e.stopPropagation();
    const m = b.dataset.m, i = ctx.hole(), N = ctx.N();
    if (m === 'prev' && i > 0) ctx.setHole(i - 1);
    if (m === 'next' && i < N - 1) ctx.setHole(i + 1);
    if (m === 'fit') drawHole(true);
    if (m === 'wback' && wiz) wizGo(wiz.step === 'green' ? wiz.i : wiz.i - 1);
    if (m === 'wskip' && wiz) wizGo(wiz.i + 1);
    if (m === 'wdone' && wiz) wizEnd(false);
    if (m === 'loc') { const g = ctx.gps(); if (g) map.setView([g.lat, g.lng], 18); else ctx.toast('ยังไม่ได้ตำแหน่ง GPS (อนุญาตตำแหน่งให้ Safari ด้วย)'); }
    if (m === 'mode') { satOn = !satOn; ctx.setPref('sat', satOn); if (satOn) sat.addTo(map); else map.removeLayer(sat); drawFeatures(); ctx.toast(satOn ? '🛰️ ภาพดาวเทียม' : '🎨 แบบกราฟิก'); }
    if (m === 'shot') {
      const g = ctx.gps(); if (!g) { ctx.toast('ยังไม่ได้ตำแหน่ง GPS'); return; }
      if (g.acc > 30) ctx.toast(`GPS คลาดเคลื่อน ~${Math.round(g.acc)} ม.`);
      const club = await ctx.chooseClub(); if (!club) return;
      ctx.saveShot(i, { lat: +g.lat.toFixed(6), lng: +g.lng.toFixed(6), club, t: Date.now() });
    }
    if (m === 'shots') {
      const s = myShots(i); if (!s.length) { ctx.toast('ยังไม่มีช็อตในหลุมนี้ กด 📍 บันทึกช็อต ตอนยืนที่ลูก'); return; }
      const h = hg(i);
      ctx.info(`ช็อตหลุม ${i + 1}`, s.map((x, k) => { const nx = s[k + 1] ? [s[k + 1].lat, s[k + 1].lng] : null; const d = nx ? dist([x.lat, x.lng], nx) : null;
        return `${k + 1}. <b>${x.club}</b> ${d ? fmt(d) + ' ' + un() : (h.green ? '(เหลือถึงกรีน ' + fmt(dist([x.lat, x.lng], h.green)) + ')' : '')}`; }).join('<br>') );
    }
    if (m === 'menu') menu();
  });
  async function menu() {
    const r = await ctx.choose('แผนที่สนาม', [
      ['search', '🔎 ค้นหาสนามจากชื่อ แล้วดาวน์โหลด'], ['wiz', '🛠 ตั้งค่าหลุมเอง (แตะแท่นที → กรีน ทีละหลุม)'], ['osm', '📍 ดาวน์โหลดสนามตรงที่แผนที่อยู่ / ตำแหน่งฉัน'],
      ['tee', `🅃 ปักแท่นทีหลุม ${ctx.hole() + 1}`], ['green', `⛳ ปักกรีนหลุม ${ctx.hole() + 1}`], ['clear', '🗑 ล้างแผนที่สนามของแก๊งนี้']]);
    if (r === 'tee' || r === 'green') { setMode = r; ctx.toast(r === 'tee' ? 'แตะบนแผนที่ตรงแท่นที' : 'แตะบนแผนที่ตรงกลางกรีน'); }
    if (r === 'clear' && await ctx.ask('ล้างข้อมูลแผนที่สนามของแก๊งนี้?')) ctx.saveGeo(null);
    if (r === 'search') ctx.searchDownload();
    if (r === 'wiz') wizStart();
    if (r === 'osm') {
      const g = ctx.gps(), c = map.getCenter();
      const at = map.getZoom() >= 14 ? [c.lat, c.lng] : g ? [g.lat, g.lng] : null;
      if (!at) { ctx.toast('เลื่อนแผนที่ไปที่สนาม (ซูมเข้า) หรือเปิด GPS ก่อน'); return; }
      ctx.downloadAt({ lat: at[0], lng: at[1], radius: 2000 });
    }
  }
  setTimeout(() => map.invalidateSize(), 50);
  return {
    update(holeChanged) { drawHole(holeChanged); },
    gps() { drawMe(); drawDist(); drawTarget(); },
    people() { drawPeople(); },
    wizard() { wizStart(); },
    destroy() { map.remove(); },
    setGeo(v) { const had = !!hg(ctx.hole()).green; geo = v || { holes: {}, features: [] }; drawFeatures(); drawHole(!had); },
    geo: () => geo,
  };
}

/* ---------- แผนที่การตีย้อนหลัง ----------
   D = { N, holes:{h0:{tee,green,line}}, pars:{h0:4}, players:[{id,name,color}], shots:{pid:{h0:[{lat,lng,club,t}]}}, scores:{pid:{h0:5}}, unit }
   st = { pid, hole }  (hole = -1 คือดูทุกหลุม) */
export function createReplay(el, D, st, onState) {
  const fmt = m => Math.round(D.unit === 'y' ? m * 1.09361 : m), un = D.unit === 'y' ? 'หลา' : 'ม.';
  const sh = (pid, i) => Object.values(D.shots?.[pid]?.[hk(i)] || {}).filter(x => x && x.lat != null).sort((a, b) => a.t - b.t);
  if (!D.players.some(p => p.id === st.pid)) st.pid = (D.players.find(p => Object.keys(D.shots?.[p.id] || {}).length) || D.players[0])?.id;
  el.innerHTML = `<div class="chips rp-p"></div><div class="chips rp-h"></div><div class="rp-mw"><div class="rp-map"></div><button class="rp-full" data-rp="full">⛶ ดูเต็มจอ</button></div><div class="rp-list"></div>`;
  const map = L.map(el.querySelector('.rp-map'), { zoomControl: false, maxZoom: 21 }); map.attributionControl.setPrefix(false);
  L.tileLayer(SAT, { maxNativeZoom: 19, maxZoom: 21, attribution: 'Imagery © Esri' }).addTo(map);
  const layer = L.layerGroup().addTo(map); map.setView(D.center || [13.75, 100.5], D.center ? 15 : 6);
  const label = (t, cls = 'y') => L.divIcon({ html: `<span class="mlbl ${cls}">${t}</span>`, className: '', iconAnchor: [-6, 10] });
  function draw() {
    const P = D.players.find(p => p.id === st.pid) || D.players[0]; if (!P || !el.isConnected) return;
    el.querySelector('.rp-p').innerHTML = D.players.map(p => `<button style="width:auto;padding:0 12px;border-radius:16px" class="${p.id === P.id ? 'cur' : ''}" data-rp="p" data-v="${p.id}">${esc(p.name)}</button>`).join('');
    let hc = `<button style="width:auto;padding:0 12px;border-radius:16px" class="${st.hole < 0 ? 'cur' : ''}" data-rp="h" data-v="-1">ทั้งหมด</button>`;
    for (let i = 0; i < D.N; i++) hc += `<button class="${st.hole === i ? 'cur' : sh(P.id, i).length ? 'done' : ''}" data-rp="h" data-v="${i}">${i + 1}</button>`;
    el.querySelector('.rp-h').innerHTML = hc;
    layer.clearLayers(); const pts = [], rows = [];
    const holes = st.hole < 0 ? [...Array(D.N).keys()] : [st.hole];
    holes.forEach(i => {
      const g = D.holes?.[hk(i)] || {}, s = sh(P.id, i), one = st.hole >= 0;
      if (g.tee && one) { L.marker(g.tee, { icon: label('T', 'w'), interactive: false }).addTo(layer); pts.push(g.tee); }
      if (g.green) { L.marker(g.green, { interactive: false, icon: L.divIcon({ className: '', iconSize: [0, 0], html: one ? '<div style="font-size:26px;transform:translate(-4px,-26px)">⛳</div>' : `<span class="hnum">${i + 1}</span>` }) }).addTo(layer); if (one || s.length) pts.push(g.green); }
      if (!s.length) return;
      const path = s.map(x => [x.lat, x.lng]); const last = s[s.length - 1];
      if (g.green && last.club !== 'Putter') path.push(g.green);
      L.polyline(path, { color: P.color || '#fdd835', weight: 3, opacity: .95, interactive: false }).addTo(layer);
      const parts = [];
      s.forEach((x, k) => {
        const nx = s[k + 1], d = nx ? dist([x.lat, x.lng], [nx.lat, nx.lng]) : (g.green ? dist([x.lat, x.lng], g.green) : null);
        const txt = nx ? `${x.club} ${fmt(d)}` : `${x.club}${d != null && x.club !== 'Putter' ? ' · เหลือ ' + fmt(d) : ''}`;
        L.circleMarker([x.lat, x.lng], { radius: 6, color: '#fff', weight: 2, fillColor: P.color || '#fdd835', fillOpacity: 1, interactive: false }).addTo(layer);
        if (one) L.marker([x.lat, x.lng], { icon: label(`${k + 1}. ${txt}`), interactive: false }).addTo(layer);
        pts.push([x.lat, x.lng]); parts.push(`<b>${esc(x.club)}</b>${nx ? ' ' + fmt(d) : ''}`);
      });
      const sc = D.scores?.[P.id]?.[hk(i)];
      rows.push(`<div class="rp-row" data-rp="full" data-v="${i}"><b>H${i + 1}</b> <span class="muted">Par ${D.pars?.[hk(i)] || '-'}${sc != null ? ' · ' + sc : ''}</span><br>${parts.join(' › ')}</div>`);
    });
    el.querySelector('.rp-list').innerHTML = rows.join('');
    if (pts.length) map.fitBounds(L.latLngBounds(pts), { paddingTopLeft: [30, 40], paddingBottomRight: [120, 30], maxZoom: st.hole < 0 ? 17 : 19, animate: false });
    onState && onState(st);
  }
  el.addEventListener('click', e => { const b = e.target.closest('[data-rp]'); if (!b) return; e.stopPropagation();
    if (b.dataset.rp === 'full') { const P = D.players.find(p => p.id === st.pid) || D.players[0], h = b.dataset.v != null ? +b.dataset.v : st.hole >= 0 ? st.hole : Math.max(0, [...Array(D.N).keys()].find(i => sh(P.id, i).length) ?? 0);
      createHoleView(D, { pid: P.id, hole: h }); return; }
    if (b.dataset.rp === 'p') st.pid = b.dataset.v; else st.hole = +b.dataset.v; draw(); });
  setTimeout(() => { if (!el.isConnected) return; map.invalidateSize(); draw(); }, 30);
  let alive = true;
  return { destroy() { if (!alive) return; alive = false; try { map.stop(); map.off(); map.remove(); } catch (e) {} } };
}

// มุมมองหลุมเต็มจอ (ดูหลังตีจบ): หมุนให้ทีอยู่ล่าง กรีนอยู่บน · ป้าย "ไม้ | ระยะ" ทุกช็อต · จำนวนพัตต์ที่ธง
const CAT_COLOR = { D: '#ffffff', FW: '#29b6f6', HY: '#26c6da', Iron: '#fdd835', Wedge: '#ab47bc', Putter: '#7e57c2' };
function bearing(a, b) { const t = Math.PI / 180, y = Math.sin((b[1] - a[1]) * t) * Math.cos(b[0] * t), x = Math.cos(a[0] * t) * Math.sin(b[0] * t) - Math.sin(a[0] * t) * Math.cos(b[0] * t) * Math.cos((b[1] - a[1]) * t); return (Math.atan2(y, x) / t + 360) % 360; }
export function createHoleView(D, st) {
  const yd = D.unit === 'y', fmt = m => Math.round(yd ? m * 1.09361 : m), un = yd ? 'หลา' : 'ม.';
  const sh = (pid, i) => Object.values(D.shots?.[pid]?.[hk(i)] || {}).filter(x => x && x.lat != null).sort((a, b) => a.t - b.t);
  const ov = document.createElement('div'); ov.className = 'hview';
  ov.innerHTML = `<div class="hv-wrap"><div class="hv-map"></div></div><div class="hv-empty" hidden>ไม่มีช็อตที่บันทึกในหลุมนี้</div>
    <button class="hv-back" data-hv="close" aria-label="close">‹</button><div class="hv-who"></div>
    <div class="hv-bar"><button data-hv="prev">‹</button><div class="hv-hole"><b class="hv-n"></b><span class="hv-ps"><span class="hv-par"></span><span class="hv-si"></span></span></div><button data-hv="next">›</button><div class="hv-sc"></div></div>`;
  document.body.appendChild(ov);
  const wrap = ov.querySelector('.hv-wrap'), mel = ov.querySelector('.hv-map');
  const map = L.map(mel, { zoomControl: false, attributionControl: false, dragging: false, touchZoom: false, scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false, keyboard: false, zoomSnap: 0, maxZoom: 21 });
  L.tileLayer(SAT, { maxNativeZoom: 19, maxZoom: 21 }).addTo(map);
  const layer = L.layerGroup().addTo(map); map.setView(D.center || [13.75, 100.5], 16);
  let b = 0, size = 0;
  function resize() {
    const W = wrap.clientWidth, H = wrap.clientHeight, d = Math.ceil(Math.hypot(W, H)) + 4;
    Object.assign(mel.style, { width: d + 'px', height: d + 'px', left: (W - d) / 2 + 'px', top: (H - d) / 2 + 'px' });
    if (d !== size) { size = d; map.invalidateSize({ animate: false }); }
  }
  // วางทุกจุดให้พอดีจอ (คิดการหมุนแล้ว) เว้นที่ให้ปุ่มบน/แถบล่าง/ป้ายด้านขวา
  function fit(pts) {
    const W = wrap.clientWidth, H = wrap.clientHeight, pT = 96, pB = 130, pL = 34, pR = 150, aw = W - pL - pR, ah = H - pT - pB;
    const a = -b * Math.PI / 180, R = (x, y, an) => [x * Math.cos(an) - y * Math.sin(an), x * Math.sin(an) + y * Math.cos(an)];
    let z = 19, o, ex;
    for (; z >= 12; z -= 0.25) {
      const P = pts.map(q => map.project(q, z)); o = P[0];
      const r = P.map(p => R(p.x - o.x, p.y - o.y, a)), xs = r.map(v => v[0]), ys = r.map(v => v[1]);
      ex = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
      if (ex[1] - ex[0] <= aw && ex[3] - ex[2] <= ah) break;
    }
    const cr = [(ex[0] + ex[1]) / 2 - (pL + aw / 2 - W / 2), (ex[2] + ex[3]) / 2 - (pT + ah / 2 - H / 2)], c = R(cr[0], cr[1], -a);
    map.setView(map.unproject(L.point(o.x + c[0], o.y + c[1]), z), z, { animate: false });
  }
  const up = html => `<div style="transform:rotate(${b}deg);transform-origin:0 0">${html}</div>`;
  const pin = (ll, html, z = 0) => L.marker(ll, { icon: L.divIcon({ className: '', iconSize: [0, 0], html: up(html) }), interactive: false, zIndexOffset: z }).addTo(layer);
  function draw() {
    const i = st.hole, g = D.holes?.[hk(i)] || {}, P = D.players.find(p => p.id === st.pid) || D.players[0];
    const s = P ? sh(P.id, i) : [], par = D.pars?.[hk(i)], sc = P ? D.scores?.[P.id]?.[hk(i)] : null;
    ov.querySelector('.hv-who').innerHTML = D.players.length > 1 ? D.players.map(p => `<button class="${p.id === P.id ? 'on' : ''}" data-hv="p" data-v="${p.id}">${esc(p.name)}</button>`).join('') : '';
    ov.querySelector('.hv-n').textContent = i + 1;
    ov.querySelector('.hv-par').textContent = par ? 'Par ' + par : '';
    ov.querySelector('.hv-si').textContent = D.si?.[hk(i)] ? 'Hdcp ' + D.si[hk(i)] : '';
    const d = sc != null && par ? sc - par : null;
    ov.querySelector('.hv-sc').innerHTML = sc != null ? `<span class="hsc ${d <= -2 ? 'eg' : d === -1 ? 'bi' : d === 0 ? 'pa' : d === 1 ? 'bo' : 'db'}">${sc}</span>` : '';
    ov.querySelector('.hv-empty').hidden = !!s.length;
    const first = s[0] ? [s[0].lat, s[0].lng] : null, start = g.tee || first, end = g.green;
    b = start && end ? bearing(start, end) : 0;
    resize(); mel.style.transform = `rotate(${-b}deg)`;
    layer.clearLayers();
    const pts = [start, end, ...s.map(x => [x.lat, x.lng])].filter(Boolean);
    if (!pts.length) { map.setView(D.center || [13.75, 100.5], 15, { animate: false }); return; }
    if (g.tee && (!first || dist(g.tee, first) > 15)) pin(g.tee, '<span class="hv-tee">T</span>');
    const putts = s.filter(x => x.club === 'Putter'), path = s.filter(x => x.club !== 'Putter').map(x => [x.lat, x.lng]);
    if (end && path.length) path.push(end);
    if (path.length > 1) { L.polyline(path, { color: '#000', weight: 7, opacity: .25, interactive: false }).addTo(layer); L.polyline(path, { color: '#fff', weight: 4, interactive: false }).addTo(layer); }
    s.forEach((x, k) => {
      const ll = [x.lat, x.lng], cat = clubCat(x.club), nx = s.slice(k + 1).find(y => y.club !== 'Putter' || x.club === 'Putter');
      let txt;
      if (x.club === 'Putter') { if (x !== putts[0] || !end) return; const f = dist(ll, end) * 3.28084; txt = `${Math.round(f)} <small>ฟุต</small>`; }
      else { const to = nx && nx.club !== 'Putter' ? [nx.lat, nx.lng] : end; txt = to ? `${fmt(dist(ll, to))} <small>${un}</small>` : ''; }
      L.circleMarker(ll, { radius: 7, color: '#fff', weight: 2.5, fillColor: CAT_COLOR[cat] || '#fdd835', fillOpacity: 1, interactive: false }).addTo(layer);
      pin(ll, `<span class="pill" style="left:14px;top:-18px"><b>${esc(x.club === 'Putter' ? 'P' : x.club)}</b>${txt ? `<span>${txt}</span>` : ''}</span>`, 100 + k);
    });
    if (end) { const n = putts.length || (sc != null && P ? D.putts?.[P.id]?.[hk(i)] : null);
      pin(end, `<span class="pill flag" style="left:-12px;top:-50px"><b>🚩</b>${n != null && n !== '' ? `<span>${n} <small>พัตต์</small></span>` : ''}</span>`, 500); }
    fit(pts);
  }
  function close() { if (!ov.isConnected) return; try { map.stop(); map.off(); map.remove(); } catch (e) {} ov.remove(); removeEventListener('resize', onR); if (window.__hvClose === close) window.__hvClose = null; }
  const onR = () => { size = 0; draw(); }; addEventListener('resize', onR);
  ov.addEventListener('click', e => { const t = e.target.closest('[data-hv]'); if (!t) return; e.stopPropagation(); const a = t.dataset.hv;
    if (a === 'close') return close();
    if (a === 'prev') st.hole = (st.hole - 1 + D.N) % D.N; else if (a === 'next') st.hole = (st.hole + 1) % D.N; else if (a === 'p') st.pid = t.dataset.v;
    draw(); });
  window.__hvClose = close;
  setTimeout(draw, 0);
  return { close };
}
