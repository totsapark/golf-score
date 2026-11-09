// แผนที่สนาม: ภาพดาวเทียม + กรีน/บังเกอร์/น้ำจาก OpenStreetMap, ระยะถึงกรีน (GPS), บันทึกช็อต
import { hk, dist, par } from './golf.js';
const L = window.L;
export const SAT = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const STY = {
  rough: { color: '#33691e', weight: 0, fillColor: '#558b2f', fillOpacity: .35 },
  fairway: { color: '#7cb342', weight: 1, fillColor: '#8bc34a', fillOpacity: .7 },
  tee: { color: '#689f38', weight: 1, fillColor: '#aed581', fillOpacity: .85 },
  water: { color: '#0277bd', weight: 1, fillColor: '#29b6f6', fillOpacity: .85 },
  bunker: { color: '#c9a95c', weight: 1, fillColor: '#f3e2ad', fillOpacity: .95 },
  green: { color: '#1b5e20', weight: 1.5, fillColor: '#43a047', fillOpacity: .9 },
};
const ORDER = ['rough', 'fairway', 'tee', 'water', 'bunker', 'green'];
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

export async function importOSM(lat, lng) {
  const q = `[out:json][timeout:30];(way["golf"](around:2000,${lat},${lng});relation["golf"](around:2000,${lat},${lng});way["natural"="water"](around:2000,${lat},${lng});way["leisure"="golf_course"](around:2000,${lat},${lng}););out geom;`;
  const r = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  if (!r.ok) throw new Error('Overpass ' + r.status);
  return parseOSM(await r.json());
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
    const k = t.golf === 'green' ? 'green' : t.golf === 'bunker' ? 'bunker' : t.golf === 'fairway' ? 'fairway' : t.golf === 'tee' ? 'tee'
      : (t.golf === 'water_hazard' || t.golf === 'lateral_water_hazard' || t.natural === 'water') ? 'water' : t.golf === 'rough' ? 'rough' : null;
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
  let geo = null, satOn = ctx.pref('sat', true), setMode = null, target = null, lastHole = -1, unsubGeo = null;
  if (satOn) sat.addTo(map);
  map.setView([13.75, 100.5], 6);
  const U = () => ctx.unit(), fmt = m => m == null ? '–' : Math.round(U() === 'y' ? m * 1.09361 : m), un = () => U() === 'y' ? 'หลา' : 'ม.';

  unsubGeo = ctx.store.on('geos/' + ctx.code, v => { geo = v || { holes: {}, features: [] }; drawFeatures(); drawHole(true); });

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
      const s = { ...STY[f.k] }; s.fillOpacity = Math.min(1, s.fillOpacity * fo); if (satOn && f.k === 'rough') return;
      L.polygon(f.c, { ...s, interactive: false }).addTo(featL);
    });
    el.querySelector('#map').style.background = satOn ? '#333' : '#4f8f4c';
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
      await ctx.store.set(`geos/${ctx.code}/holes/${hk(i)}/${m}`, p);
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
    const r = await ctx.choose('ข้อมูลสนาม', [
      ['osm', '⬇️ ดาวน์โหลดข้อมูลสนาม (OpenStreetMap)'], ['tee', `🅃 ปักแท่นทีหลุม ${ctx.hole() + 1}`], ['green', `⛳ ปักกรีนหลุม ${ctx.hole() + 1}`], ['clear', '🗑 ล้างข้อมูลสนามของแก๊งนี้']]);
    if (r === 'tee' || r === 'green') { setMode = r; ctx.toast(r === 'tee' ? 'แตะบนแผนที่ตรงแท่นที' : 'แตะบนแผนที่ตรงกลางกรีน'); }
    if (r === 'clear' && await ctx.ask('ล้างข้อมูลแผนที่สนามของแก๊งนี้?')) await ctx.store.set('geos/' + ctx.code, null);
    if (r === 'osm') {
      const g = ctx.gps(), c = map.getCenter(), useMap = !g || map.getZoom() >= 14;
      const at = useMap && map.getZoom() >= 14 ? [c.lat, c.lng] : g ? [g.lat, g.lng] : null;
      if (!at) { ctx.toast('เลื่อนแผนที่ไปที่สนาม (ซูมเข้า) หรือเปิด GPS ก่อน'); return; }
      ctx.toast('กำลังดาวน์โหลดข้อมูลสนาม...');
      try {
        const d = await importOSM(at[0], at[1]), nh = Object.keys(d.holes).length;
        if (!nh && !d.features.length) { ctx.info('ไม่พบข้อมูลสนาม', 'OpenStreetMap ยังไม่มีข้อมูลสนามแถวนี้<br>ปักแท่นที/กรีนเองได้จากเมนู ⚙️ (ปักครั้งเดียว ใช้ได้ทั้งแก๊ง)'); return; }
        const merged = { holes: { ...(geo?.holes || {}), ...d.holes }, features: d.features.length ? d.features : (geo?.features || []) };
        await ctx.store.set('geos/' + ctx.code, merged);
        ctx.applyCourse(d);
        ctx.info('ดาวน์โหลดแล้ว ✓', `${d.name ? '<b>' + d.name + '</b><br>' : ''}ข้อมูลหลุม ${nh} หลุม · รูปทรงกรีน/บังเกอร์/น้ำ ${d.features.length} ชิ้น${nh < ctx.N() ? '<br><span class="muted">หลุมที่ไม่มีข้อมูล ปักแท่นที/กรีนเองได้</span>' : ''}`);
      } catch (e) { ctx.info('ดาวน์โหลดไม่สำเร็จ', 'ต้องมีอินเทอร์เน็ต ลองใหม่อีกครั้ง<br><span class="muted">' + e.message + '</span>'); }
    }
  }
  setTimeout(() => map.invalidateSize(), 50);
  return {
    update(holeChanged) { drawHole(holeChanged); },
    gps() { drawMe(); drawDist(); drawTarget(); },
    people() { drawPeople(); },
    destroy() { unsubGeo && unsubGeo(); map.remove(); },
    geo: () => geo,
  };
}
