// แผนที่สนาม: ภาพดาวเทียม + กรีน/บังเกอร์/น้ำจาก OpenStreetMap, ระยะถึงกรีน (GPS), บันทึกช็อต
import { hk, dist, par } from './golf.js';
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
  for (const url of OVERPASS) {
    try {
      const ac = new AbortController(), tm = setTimeout(() => ac.abort(), 35000);
      const r = await fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: ac.signal });
      clearTimeout(tm);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const d = parseOSM(await r.json()); d.center = [lat, lng]; return d;
    } catch (e) { last = e; }
  }
  throw new Error('เชื่อมต่อเซิร์ฟเวอร์แผนที่ไม่ได้ (' + (last?.message || '') + ')');
}
// ค้นหาสนามกอล์ฟจากชื่อ (OpenStreetMap Nominatim)
export async function searchCourses(q) {
  const go = async s => { const r = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(s)}&countrycodes=th&format=jsonv2&limit=8&accept-language=th,en`); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); };
  let res = await go(q);
  if (!res.some(r => r.type === 'golf_course') && !/golf|กอล์ฟ/i.test(q)) res = [...(await go(q + ' golf')), ...res];
  const seen = new Set();
  return res.filter(r => { const k = r.osm_type + r.osm_id; if (seen.has(k)) return false; seen.add(k); return true; })
    .map(r => { const b = (r.boundingbox || []).map(Number), c = [+r.lat, +r.lon];
      const rad = b.length === 4 ? Math.max(dist(c, [b[0], b[2]]), dist(c, [b[1], b[3]])) + 250 : 1500;
      return { name: r.name || r.display_name.split(',')[0], addr: r.display_name.split(',').slice(1, 4).join(',').trim(), lat: c[0], lng: c[1], radius: Math.min(3000, Math.max(700, rad)), golf: r.type === 'golf_course' }; })
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
    if (el.type === 'way' && g.length >= 3) features.push({ k, c: g });
    if (el.type === 'relation') (el.members || []).filter(m => m.role === 'outer' && m.geometry).forEach(m => { const c = geo(m.geometry); if (c.length >= 3) features.push({ k, c }); });
  }
  return { name, holes, features };
}

export function createMap(el, ctx) {
  el.innerHTML = `<div id="map"></div>
    <div class="mtop"><div class="mbox mhole"><button data-m="prev">‹</button><div class="center" style="min-width:46px"><b id="mh" style="font-size:20px"></b><div class="muted" id="mp" style="font-size:11px"></div></div><button data-m="next">›</button></div>
      <div class="mbox mdist" id="md"></div></div>
    <div class="mside"><button data-m="loc" title="ตำแหน่งฉัน">🎯</button><button data-m="fit" title="ทั้งหลุม">⛳</button><button data-m="mode" title="ดาวเทียม/กราฟิก">🛰️</button><button data-m="menu" title="ข้อมูลสนาม">⚙️</button></div>
    <div class="mbot"><button class="btn" data-m="shot">📍 บันทึกช็อต</button><button class="btn sec" data-m="shots" id="mshots">ช็อต</button></div>`;
  const map = L.map(el.querySelector('#map'), { zoomControl: false, maxZoom: 21, attributionControl: true, tap: true });
  map.attributionControl.setPrefix(false);
  const sat = L.tileLayer(SAT, { maxNativeZoom: 19, maxZoom: 21, attribution: 'Imagery © Esri, Maxar · Course © OpenStreetMap' });
  const featL = L.layerGroup().addTo(map), holeL = L.layerGroup().addTo(map), shotL = L.layerGroup().addTo(map),
    peopleL = L.layerGroup().addTo(map), meL = L.layerGroup().addTo(map), tgtL = L.layerGroup().addTo(map);
  // ไม่มีเน็ต → ใช้แผนที่กราฟิก (ภาพดาวเทียมโหลดไม่ได้)
  let geo = ctx.geo() || { holes: {}, features: [] }, satOn = navigator.onLine ? ctx.pref('sat', true) : false, setMode = null, target = null, lastHole = -1;
  if (satOn) sat.addTo(map);
  map.setView([13.75, 100.5], 6);
  const U = () => ctx.unit(), fmt = m => m == null ? '–' : Math.round(U() === 'y' ? m * 1.09361 : m), un = () => U() === 'y' ? 'หลา' : 'ม.';

  setTimeout(() => { drawFeatures(); drawHole(true); }, 0);

  function hg(i) { return geo?.holes?.[hk(i)] || {}; }
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
    return h.tee ? { p: h.tee, me: false } : g ? { p: [g.lat, g.lng], me: true } : null;
  }
  function drawDist() {
    const i = ctx.hole(), h = hg(i), f = from(), md = el.querySelector('#md');
    if (!h.green) { md.innerHTML = `<div class="muted" style="align-self:center;font-size:13px">ยังไม่มีจุดกรีนของหลุมนี้<br>กด ⚙️ เพื่อโหลดข้อมูลสนามหรือปักเอง</div>`; return; }
    if (!f) { md.innerHTML = `<div class="muted" style="align-self:center">รอ GPS...</div>`; return; }
    const gp = greenPoly(i); let fr = null, bk = null;
    if (gp) { const ds = gp.c.map(p => dist(f.p, p)); fr = Math.min(...ds); bk = Math.max(...ds); }
    const c = dist(f.p, h.green);
    md.innerHTML = `${gp ? `<div><b style="font-size:18px">${fmt(fr)}</b><small>หน้า</small></div>` : ''}<div><b>${fmt(c)}</b><small>กลางกรีน (${un()})${f.me ? '' : ' จากที'}</small></div>${gp ? `<div><b style="font-size:18px">${fmt(bk)}</b><small>หลัง</small></div>` : ''}`;
  }
  function drawHole(refit) {
    const i = ctx.hole(), G = ctx.G(), h = hg(i);
    el.querySelector('#mh').textContent = 'H' + (i + 1);
    el.querySelector('#mp').textContent = 'Par ' + par(G, i);
    holeL.clearLayers();
    if (h.tee) L.marker(h.tee, { icon: icon('T', 'mlbl w'), interactive: false }).addTo(holeL);
    if (h.green) L.marker(h.green, { icon: L.divIcon({ html: '<div style="font-size:26px;transform:translate(-4px,-26px)">⛳</div>', className: '', iconSize: [0, 0] }), interactive: false }).addTo(holeL);
    if (h.tee && h.green) L.polyline(h.line && h.line.length > 2 ? h.line : [h.tee, h.green], { color: '#fff', weight: 2, dashArray: '6 6', opacity: .9, interactive: false }).addTo(holeL);
    if (refit || i !== lastHole) {
      lastHole = i; target = null; tgtL.clearLayers();
      const pts = [h.tee, h.green, ...(h.line || [])].filter(Boolean);
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
  map.on('click', async e => {
    const p = [+e.latlng.lat.toFixed(6), +e.latlng.lng.toFixed(6)];
    if (setMode) {
      const i = ctx.hole(), m = setMode; setMode = null; el.querySelector('#map').style.cursor = '';
      const g2 = JSON.parse(JSON.stringify(geo || { holes: {}, features: [] })); g2.holes = g2.holes || {}; g2.holes[hk(i)] = { ...(g2.holes[hk(i)] || {}), [m]: p };
      ctx.saveGeo(g2);
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
        return `${k + 1}. <b>${x.club}</b> ${d ? fmt(d) + ' ' + un() : (h.green ? '(เหลือถึงกรีน ' + fmt(dist([x.lat, x.lng], h.green)) + ')' : '')}`; }).join('<br>') + '<p class="muted">แตะที่ป้ายช็อตบนแผนที่เพื่อลบ</p>');
    }
    if (m === 'menu') menu();
  });
  async function menu() {
    const r = await ctx.choose('แผนที่สนาม', [
      ['search', '🔎 ค้นหาสนามจากชื่อ แล้วดาวน์โหลด'], ['osm', '📍 ดาวน์โหลดสนามตรงที่แผนที่อยู่ / ตำแหน่งฉัน'],
      ['tee', `🅃 ปักแท่นทีหลุม ${ctx.hole() + 1}`], ['green', `⛳ ปักกรีนหลุม ${ctx.hole() + 1}`], ['clear', '🗑 ล้างแผนที่สนามของแก๊งนี้']]);
    if (r === 'tee' || r === 'green') { setMode = r; ctx.toast(r === 'tee' ? 'แตะบนแผนที่ตรงแท่นที' : 'แตะบนแผนที่ตรงกลางกรีน'); }
    if (r === 'clear' && await ctx.ask('ล้างข้อมูลแผนที่สนามของแก๊งนี้?')) ctx.saveGeo(null);
    if (r === 'search') ctx.searchDownload();
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
    destroy() { map.remove(); },
    setGeo(v) { const had = !!hg(ctx.hole()).green; geo = v || { holes: {}, features: [] }; drawFeatures(); drawHole(!had); },
    geo: () => geo,
  };
}
