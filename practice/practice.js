// หน้าจอซ้อมกอล์ฟ: แผนซ้อม · บันทึกรอบ · ซ้อมไดรฟ์ (จดผลรายลูก) · ระยะแต่ละไม้ · จุดตั้งแต่ละไม้ · กล้องวงสวิง · จังหวะสวิง
// ข้อมูลทั้งหมดอยู่ในเครื่องนี้ (localStorage + IndexedDB สำหรับคลิป) ไม่ส่งขึ้นเซิร์ฟเวอร์
import * as P from './core.js';
import * as Vi from './vision.js';
import * as Tr from './tracer.js';

const LS = 'golfpractice', DAY = 864e5, FRAME = 1 / 30;
const load = () => { try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch (e) { return {}; } };
const fmtD = t => { const d = new Date(t); return d.getDate() + '/' + (d.getMonth() + 1) + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
const sec = v => v == null ? '–' : v.toFixed(2);

/* ---------- คลิปวงสวิงใน IndexedDB (meta แยกจากตัวไฟล์ เปิดรายการได้เร็ว) ---------- */
const rq = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const done = t => new Promise((res, rej) => { t.oncomplete = () => res(); t.onerror = t.onabort = () => rej(t.error); });
let dbp = null;
const db = () => dbp || (dbp = new Promise((res, rej) => { const r = indexedDB.open('golfpractice-swings', 1);
  r.onupgradeneeded = () => { r.result.createObjectStore('meta', { keyPath: 'id' }); r.result.createObjectStore('blobs'); };
  r.onsuccess = () => res(r.result); r.onerror = () => { dbp = null; rej(r.error); }; }));
export const SW = {
  async list() { return (await rq((await db()).transaction('meta').objectStore('meta').getAll())).sort((a, b) => b.t - a.t); },
  async get(id) { return rq((await db()).transaction('meta').objectStore('meta').get(id)); },
  async put(m, buf) { const t = (await db()).transaction(['meta', 'blobs'], 'readwrite'); t.objectStore('meta').put(m); if (buf) t.objectStore('blobs').put(buf, m.id); return done(t); },
  async blob(id, type) { const b = await rq((await db()).transaction('blobs').objectStore('blobs').get(id)); return b ? new Blob([b], { type: type || 'video/mp4' }) : null; },
  async del(id) { const t = (await db()).transaction(['meta', 'blobs'], 'readwrite'); t.objectStore('meta').delete(id); t.objectStore('blobs').delete(id); return done(t); },
};

/* ---------- เสียง ---------- */
let AC = null;
const actx = () => { if (!AC) { const C = window.AudioContext || window.webkitAudioContext; if (C) AC = new C(); } if (AC?.state === 'suspended') AC.resume(); return AC; };
function beep(f = 880, d = 0.08, at = 0, vol = 0.5) {
  const c = actx(); if (!c) return; const t = at || c.currentTime, o = c.createOscillator(), g = c.createGain();
  o.frequency.value = f; o.type = 'sine'; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.005); g.gain.exponentialRampToValueAtTime(0.001, t + d);
  o.connect(g).connect(c.destination); o.start(t); o.stop(t + d + 0.02);
}
// หาจังหวะกระทบลูกจากเสียงในคลิป (เสียงดังกระชากที่สุด) — ใช้ไม่ได้ก็ข้าม
async function findImpact(buf) {
  const C = window.AudioContext || window.webkitAudioContext; if (!C) return null; const c = new C();
  try {
    const ab = await new Promise((res, rej) => { const p = c.decodeAudioData(buf.slice(0), res, rej); if (p?.then) p.then(res, rej); });
    const x = ab.getChannelData(0), sr = ab.sampleRate, w = Math.max(1, Math.round(sr * 0.004)), en = [];
    for (let i = 0; i + w <= x.length; i += w) { let s = 0; for (let j = i; j < i + w; j++) s += x[j] * x[j]; en.push(Math.sqrt(s / w)); }
    if (en.length < 20) return null;
    const med = [...en].sort((a, b) => a - b)[en.length >> 1] || 1e-6; let bi = 0; en.forEach((v, i) => { if (v > en[bi]) bi = i; });
    return en[bi] > med * 6 && en[bi] > 0.02 ? bi * w / sr : null;
  } catch (e) { return null; } finally { try { c.close(); } catch (e) {} }
}

export function createPractice(root, ctx) {
  const { esc, toast, ask, dlg } = ctx;
  let D = { height: 170, bag: P.DEF_BAG, balls: [], rounds: [], setup: {}, done: {}, hand: 'R', useDist: true, unit: 'y', tempo: { mode: 'full', k: 1, gap: 5 }, ...load() };
  const save = () => { try { localStorage.setItem(LS, JSON.stringify(D)); } catch (e) { toast('พื้นที่เก็บข้อมูลในเครื่องเต็ม'); } };
  const V = { page: 'menu', club: null, sw: 'full', dist: {}, setupK: 'MI', mins: 60, swId: null, cmpId: null, swFilter: '', trendK: null, tool: 'view', speed: 1, cam: { cd: 5, len: 5, auto: false, grid: true, view: 'face', facing: 'environment' } };
  const yd = () => D.unit !== 'm', U = () => yd() ? P.YD : 1, un = () => yd() ? 'หลา' : 'ม.';
  const toU = m => m == null ? null : Math.round(m * U()), fromU = v => v / U();
  let live = {};   // ของที่ต้องเก็บกวาดตอนออกจากหน้า: stream, recorder, timers, rAF, object URLs, wake lock
  async function wake(on) {
    try { if (on && !live.wl && navigator.wakeLock) live.wl = await navigator.wakeLock.request('screen'); if (!on && live.wl) { const w = live.wl; live.wl = null; await w.release(); } } catch (e) {}
  }
  function stopAll() {
    if (live.rec && live.rec.state !== 'inactive') { live.rec.onstop = null; try { live.rec.stop(); } catch (e) {} }
    live.stream?.getTracks().forEach(t => t.stop()); (live.off || []).forEach(f => f());
    (live.timers || []).forEach(clearTimeout); (live.ivs || []).forEach(clearInterval); if (live.raf) cancelAnimationFrame(live.raf);
    (live.urls || []).forEach(u => URL.revokeObjectURL(u)); wake(false);
    live = { wl: live.wl };
  }
  const later = (fn, ms) => { const t = setTimeout(fn, ms); (live.timers = live.timers || []).push(t); return t; };
  const url = b => { const u = URL.createObjectURL(b); (live.urls = live.urls || []).push(u); return u; };
  function go(page, o) { Object.assign(V, o || {}); V.page = page; render(); scrollTo(0, 0); }
  const PARENT = { rounds: 'menu', rform: 'rounds', plan: 'menu', range: 'menu', bag: 'menu', setup: 'menu', live: 'setup', cam: 'menu', swings: 'menu', tempo: 'menu', swing: 'swings', cmp: 'swing' };
  function back() { if (V.page === 'menu') return false; go(PARENT[V.page] || 'menu'); return true; }

  /* ---------- หน้าเมนู ---------- */
  function curSession() { const c = D.cur; if (c && Date.now() - c.last < 3 * 3600e3) return c.s; return null; }
  function rMenu() {
    const f = P.formOf(D.rounds), plan = P.planFrom(f), today = D.balls.filter(b => b.t > Date.now() - DAY).length;
    const bt = P.bagTable(D.balls, D.bag).filter(r => r.s.carry != null).length;
    const tile = (pg, ic, t, sub) => `<button class="ptile" data-pa="go" data-v="${pg}"><span>${ic}</span><b>${t}</b><small>${sub}</small></button>`;
    return `<div class="card center"><div style="font-size:44px">🏋️</div><h2 style="font-size:20px;margin-bottom:4px">ฝึกซ้อม</h2>
      <p class="muted" style="margin:0">ใช้มือถือช่วยสร้างวงสวิงที่คงที่ หาระยะและจุดตั้งที่พอดีของแต่ละไม้</p></div>
      <div class="ptiles">
        ${tile('plan', '📋', 'แผนซ้อมของฉัน', `<span>ฝึกก่อน</span>: ${plan.areas[0].short}`)}
        ${tile('rounds', '📝', 'บันทึกรอบ', D.rounds.length ? `${D.rounds.length} <span>รอบ</span>` : 'ให้แผนซ้อมตรงกับฟอร์มจริง')}
        ${tile('range', '🎯', 'ซ้อมไดรฟ์', today ? `<span>วันนี้</span> ${today} <span>ลูก</span>` : 'จดผลทีละลูก')}
        ${tile('bag', '📏', 'ระยะแต่ละไม้', bt ? `${bt} <span>ไม้มีระยะแล้ว</span>` : 'ยังไม่มีข้อมูล')}
        ${tile('setup', '🧍', 'จุดตั้งแต่ละไม้', 'ตำแหน่งลูก · ยืน · น้ำหนัก')}
        ${tile('cam', '🎥', 'กล้องวงสวิง', 'อัด · สโลว์ · วาดเส้น')}
        ${tile('swings', '📼', 'คลิปวงสวิงของฉัน', '<span id="swcount">เทียบวงต้นแบบ</span>')}
        ${tile('tempo', '🥁', 'จังหวะสวิง', 'เสียงนำจังหวะ 3:1')}
      </div>
      <div class="card"><h2>🚀 เริ่มแบบนี้ (สัปดาห์แรก)</h2><ol class="plist">
        <li><b>จุดตั้งแต่ละไม้</b> · <span>อ่านท่าตั้งของ 7i, Driver, ชิพ</span></li>
        <li><b>ซ้อมไดรฟ์</b> · <span>ไม้ละ 5-10 ลูก จดผลทุกลูก → ได้ระยะจริงและรู้ว่าพลาดแบบไหน</span></li>
        <li><b>กล้องวงสวิง</b> · <span>อัด 7i หลายวง ติดดาว ⭐ วงที่ดีที่สุดเป็นต้นแบบ</span></li>
        <li><b>จังหวะสวิง</b> · <span>ตีตามเสียงให้จังหวะเดิมทุกไม้</span></li>
        <li><b>บันทึกรอบ</b> · <span>จบรอบแล้วกรอกสกอร์ พัตต์ ลูกโทษ แฟร์เวย์</span> → <b>แผนซ้อมของฉัน</b> <span>บอกว่าควรซ้อมอะไรก่อน สัปดาห์ละ 2 ครั้ง</span></li></ol></div>
      <div class="card"><h2>⚙️ ตั้งค่า</h2><label class="lb" style="margin-top:0">หน่วยระยะ</label><div class="seg"><button data-pa="unit" data-v="y" class="${yd() ? 'on' : ''}">หลา</button><button data-pa="unit" data-v="m" class="${!yd() ? 'on' : ''}">เมตร</button></div></div>
      <p class="muted center" style="margin-top:16px">${ctx.ver ? 'เวอร์ชัน ' + ctx.ver : ''} · ข้อมูลทั้งหมดอยู่ในมือถือเครื่องนี้</p>`;
  }
  async function mountMenu() { try { const n = (await SW.list()).length; const el = root.querySelector('#swcount'); if (el && n) el.textContent = n + ' ' + ctx.tr('คลิป'); } catch (e) {} }

  /* ---------- บันทึกรอบ (ใช้ทำแผนซ้อม) ---------- */
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const glHist = () => { try { return JSON.parse(localStorage.getItem('golf2_hist')) || []; } catch (e) { return []; } };
  function rRounds() {
    const rs = [...D.rounds].sort((a, b) => a.date < b.date ? 1 : -1), gl = glHist().length;
    const cell = (v, suf = '') => v == null ? '<span class="muted">–</span>' : v + suf;
    return `<div class="card"><h2>📝 รอบที่บันทึก</h2>
      ${rs.length ? `<div class="scroll"><table><tr><th class="l">วันที่</th><th>สกอร์</th><th>พัตต์</th><th>โทษ</th><th>FW</th><th>GIR</th><th></th></tr>
        ${rs.map(r => `<tr><td class="l"><b>${esc(r.date.slice(5).split('-').reverse().join('/'))}</b><br><span class="muted">${esc(r.course || '')}${r.n === 9 ? ' · 9 หลุม' : ''}</span></td><td><b>${r.gross}</b><small style="color:#889">${r.gross - r.par > 0 ? '+' : ''}${r.gross - r.par}</small></td>
          <td>${cell(r.putts)}</td><td>${cell(r.pen)}</td><td>${r.fwHit != null && r.fwN ? r.fwHit + '/' + r.fwN : cell(null)}</td><td>${cell(r.gir)}</td><td><button class="x" data-pa="rdel" data-v="${r.id}">🗑</button></td></tr>`).join('')}</table></div>
        <p class="muted" style="font-size:12px;margin:6px 0 0">แผนซ้อมใช้ 5 รอบล่าสุด</p>` : '<p class="muted">ยังไม่มีรอบ · จบรอบแล้วกรอกตัวเลขจากสกอร์การ์ด ใช้เวลาไม่ถึงนาที</p>'}
      <button class="btn full" data-pa="go" data-v="rform">＋ บันทึกรอบใหม่</button>
      ${gl ? '<button class="btn sec full" data-pa="rimport">📥 นำเข้าจาก Golf Live (มือถือเครื่องนี้)</button>' : ''}</div>
    <button class="btn sec full" data-pa="go" data-v="plan">📋 ดูแผนซ้อม</button><button class="btn sec full" data-pa="go" data-v="menu">‹ กลับ</button>`;
  }
  const RF = [['gross', 'สกอร์รวม', 'จำเป็น'], ['par', 'Par สนาม', ''], ['putts', 'พัตต์รวม', ''], ['three', 'หลุมที่ 3 พัตต์ขึ้นไป', ''], ['pen', 'แต้มโทษ (OB/น้ำ/ลูกหาย)', ''],
    ['fwHit', 'ทีช็อตลงแฟร์เวย์ (หลุม Par 4-5)', ''], ['fwN', 'จากหลุม Par 4-5 ทั้งหมด', ''], ['gir', 'ออนกรีนตาม regulation (GIR)', ''], ['scrO', 'ไม่ GIR แต่ยังได้พาร์', '']];
  function rRform() {
    const n = V.rfHoles || 18, F = V.rf || {}, dv = { par: n === 9 ? 36 : 72, fwN: n === 9 ? 7 : 14 };
    return `<div class="card"><h2>📝 บันทึกรอบ</h2>
      <div class="grid2"><div><label class="lb" style="margin-top:0">วันที่</label><input type="date" id="rf_date" value="${esc(F.date || today())}"></div><div><label class="lb" style="margin-top:0">สนาม</label><input id="rf_course" value="${esc(F.course || '')}" placeholder="ไม่ใส่ก็ได้"></div></div>
      <label class="lb">จำนวนหลุม</label><div class="seg"><button data-pa="rholes" data-v="18" class="${n === 18 ? 'on' : ''}">18 หลุม</button><button data-pa="rholes" data-v="9" class="${n === 9 ? 'on' : ''}">9 หลุม</button></div>
      <div class="rform">${RF.map(([k, l, req]) => `<label><span>${l}${req ? ' <b style="color:#c62828">*</b>' : ''}</span><input type="number" inputmode="numeric" id="rf_${k}" value="${F[k] ?? dv[k] ?? ''}" placeholder="–"></label>`).join('')}</div>
      <p class="muted" style="font-size:12px;margin:6px 0 0">ไม่รู้ช่องไหนเว้นว่างได้ · ยิ่งกรอกครบ แผนซ้อมยิ่งแม่น · GIR = ลูกถึงกรีนภายใน Par−2 ครั้ง</p>
      <button class="btn full big-btn" data-pa="rsave">💾 บันทึก</button></div>
    <button class="btn sec full" data-pa="go" data-v="rounds">‹ กลับ</button>`;
  }
  function saveForm() { const F = {}; ['date', 'course', ...RF.map(x => x[0])].forEach(k => { const el = root.querySelector('#rf_' + k); if (el) F[k] = el.value; }); V.rf = F; return F; }
  function saveRound() {
    const F = saveForm(), n = V.rfHoles || 18, num = k => F[k] === '' || F[k] == null || isNaN(+F[k]) ? null : Math.round(+F[k]);
    const r = { id: 'r' + Date.now().toString(36), date: F.date || today(), course: (F.course || '').trim(), n, gross: num('gross'), par: num('par') || (n === 9 ? 36 : 72), putts: num('putts'), three: num('three'), pen: num('pen'), fwHit: num('fwHit'), fwN: num('fwN'), gir: num('gir'), scrO: num('scrO') };
    if (!r.gross || r.gross < n) return toast('ใส่สกอร์รวมก่อน');
    if (r.gir != null) { r.gir = Math.min(r.gir, n); r.scrN = n - r.gir; if (r.scrO != null) r.scrO = Math.min(r.scrO, r.scrN); }
    if (r.fwHit != null && r.fwN != null) r.fwHit = Math.min(r.fwHit, r.fwN);
    D.rounds.push(r); save(); V.rf = null; toast('บันทึกรอบแล้ว ✓'); go('plan');
  }
  // อ่านประวัติของแอป Golf Live บนมือถือเครื่องเดียวกัน (อ่านอย่างเดียว คัดลอกมาเป็นรอบของแอปนี้)
  function importGolfLive() {
    const H = glHist(), c = {}; H.forEach(r => (r.players || []).forEach(p => { if (p.n) c[p.name.trim()] = (c[p.name.trim()] || 0) + 1; }));
    const ns = Object.keys(c).sort((a, b) => c[b] - c[a]); if (!ns.length) return toast('ไม่พบรอบใน Golf Live');
    const doIt = name => { let k = 0; H.forEach(h => { const p = (h.players || []).find(x => x.name.trim() === name && x.n); const id = 'gl_' + h.rid; if (!p || D.rounds.some(r => r.id === id)) return;
      const b = p.bk || {}; D.rounds.push({ id, date: h.date, course: h.course || '', n: p.n, gross: p.gross, par: p.par, putts: p.putts, gir: p.g, scrN: b.scrN ?? null, scrO: b.scrO ?? null, three: b.three ?? null, pen: b.pen ?? null, fwN: b.fwN ?? null, fwHit: b.fwHit ?? null }); k++; });
      save(); toast(`นำเข้า ${k} รอบ`); render(); };
    if (ns.length === 1) return doIt(ns[0]);
    dlg(`<p><b>เลือกชื่อของคุณใน Golf Live</b></p>${ns.map(n => `<button class="btn sec full" data-n="${esc(n)}">${esc(n)} · ${c[n]} รอบ</button>`).join('')}<button class="btn red full" data-n="">ยกเลิก</button>`,
      el => el.addEventListener('click', e => { const b = e.target.closest('[data-n]'); if (!b) return; el.remove(); if (b.dataset.n) doIt(b.dataset.n); }));
  }

  /* ---------- แผนซ้อม ---------- */
  function rPlan() {
    const f = P.formOf(D.rounds), plan = P.planFrom(f), pv = plan.vals, sp = P.sessionPlan(plan, V.mins);
    const max = Math.max(...plan.areas.map(a => a.gain), 0.1), wk = Date.now() - 7 * DAY;
    const cnt = id => (D.done[id] || []).filter(t => t > wk).length;
    const dr = d => `<button class="drl" data-pa="drill" data-v="${d.id}"><span>${d.t}</span><small>${d.goal}</small>${cnt(d.id) ? `<i>✓${cnt(d.id)}</i>` : ''}</button>`;
    const fv = (lab, v, g) => `<div><b>${v}</b><small>${lab}</small>${g ? '<i>*</i>' : ''}</div>`;
    const g = k => plan.guessed.includes(k);
    const tgtScore = Math.round(72 + plan.target / 0.88);
    return `<div class="card"><h2>📋 ฟอร์มของคุณ</h2>
      ${f ? `<div class="muted" style="font-size:12px;margin-bottom:6px"><span>จาก</span> ${f.rounds} <span>รอบล่าสุดที่บันทึก</span></div>`
        : `<div class="note">ยังไม่มีรอบที่บันทึก · ใช้ค่าเฉลี่ยของนักกอล์ฟสกอร์ 100-110 ไปก่อน · บันทึกรอบแล้วแผนจะปรับตามฟอร์มจริงของคุณ</div>`}
      <div class="fgrid">${fv('สกอร์เฉลี่ย', f ? Math.round(f.avgGross) : '~105', !f)}${fv('พัตต์/รอบ', pv.putts.toFixed(1), g('putts'))}${fv('GIR', Math.round(pv.gir) + '%', g('gir'))}
        ${fv('ลูกโทษ/รอบ', pv.pen.toFixed(1), g('pen'))}${fv('ทีช็อตลงแฟร์เวย์', Math.round(pv.fir) + '%', g('fir'))}${fv('เซฟเมื่อไม่ GIR', Math.round(pv.scr) + '%', g('scr'))}</div>
      ${plan.guessed.length && f ? '<p class="muted" style="font-size:11px;margin:4px 0 0">* ยังไม่มีข้อมูลด้านนี้ ใช้ค่าทั่วไป · กรอกให้ครบตอนบันทึกรอบ</p>' : ''}
      <button class="btn sec full" data-pa="go" data-v="${f ? 'rounds' : 'rform'}">📝 ${f ? 'รอบที่บันทึก' : 'บันทึกรอบแรก'}</button></div>
    <div class="card"><h2>🎯 ลดสโตรกตรงไหนได้มากสุด</h2>
      <p style="margin:0 0 8px"><span>เป้าหมายขั้นต่อไป: สกอร์ประมาณ</span> <b class="big">${tgtScore}</b> <span class="muted">(<span>ระดับ HCP</span> ${plan.target})</span><br>
      <span class="muted">ถ้าแต่ละด้านขยับถึงระดับนั้น จะลดได้ราว</span> <b>${plan.total.toFixed(1)}</b> <span class="muted">สโตรก/รอบ</span></p>
      ${plan.areas.map((a, k) => `<div class="parea"><div class="ptop"><b>${k + 1}. ${a.icon} ${a.name}</b><span class="tb">−${a.gain.toFixed(1)}</span></div>
        <div class="pbar"><i style="width:${Math.max(4, a.gain / max * 100)}%;background:${['#c62828', '#ef6c00', '#f9a825', '#9e9d24'][k]}"></i></div>
        <div class="drls">${P.drillsFor(a.k).slice(0, k < 2 ? 3 : 2).map(dr).join('')}</div></div>`).join('')}
      <div class="parea"><div class="ptop"><b>🔁 ความคงที่ของวงสวิง (ทุกไม้)</b></div><div class="drls">${P.drillsFor('all').map(dr).join('')}</div></div></div>
    <div class="card"><h2>⏱️ ซ้อมรอบนี้</h2><div class="seg">${[45, 60, 90].map(m => `<button data-pa="mins" data-v="${m}" class="${V.mins === m ? 'on' : ''}">${m} <span>นาที</span></button>`).join('')}</div>
      <div class="bkrow" style="margin-top:8px"><span>🔥 <span>วอร์มอัพ + จังหวะสวิง (สวิงเปล่าตามเสียง)</span></span><b>${sp.warm}′</b></div>
      ${sp.blocks.map(b => `<div class="bkrow"><span>${b.icon} ${b.short} · <span class="muted">${P.drillsFor(b.k)[0].t}</span></span><b>${b.min}′</b></div>`).join('')}
      <p class="muted" style="font-size:12px;margin:8px 0 0">ซ้อมลูกสั้นและพัตต์ในวันเดียวกันได้ · ตีลูกเต็มวงไม่ควรเกิน 60-80 ลูกต่อครั้ง ตีน้อยแต่ตั้งใจทุกลูกดีกว่า</p></div>
    <div class="card"><h2>📅 ตารางต่อสัปดาห์</h2>
      <div class="bkrow"><span>🏌️ <span>สนามไดรฟ์ (ตามลำดับด้านบน)</span></span><b>1-2 <span>ครั้ง</span></b></div>
      <div class="bkrow"><span>⛳ <span>กรีนซ้อม: พัตต์ + ชิพ 30 นาที</span></span><b>1 <span>ครั้ง</span></b></div>
      <div class="bkrow"><span>🏠 <span>สวิงเปล่าที่บ้าน + กล้อง/จังหวะ</span></span><b>5′ <span>ทุกวัน</span></b></div></div>
    <div class="card"><h2>🧠 เล่นในสนามแบบ Bogey Golf</h2><ul class="plist">
      <li><b>Par ของคุณ = Par + 1</b> · <span>โบกี้ทุกหลุม = 90 · ดับเบิลโบกี้คือสิ่งที่ต้องกำจัด ไม่ใช่โบกี้</span></li>
      <li><b>ไม้ทีที่เข้าเล่นได้</b> · <span>หลุมแคบหรือมี OB/น้ำ ใช้ไฮบริดหรือเหล็กออกที ระยะหายนิดเดียวแต่ไม่เสียลูกโทษ</span></li>
      <li><b>เล็งกลางกรีนเสมอ</b> · <span>ไม่เล็งธงที่อยู่ใกล้บังเกอร์/น้ำ</span></li>
      <li><b>ติดปัญหา → ออกทางที่ง่ายที่สุด</b> · <span>ชิพออกข้างกลับแฟร์เวย์ ไม่เสี่ยงลอดต้นไม้ (เสีย 1 ดีกว่าเสีย 3)</span></li>
      <li><b>วางลูกไว้ที่ระยะเวดจ์ที่ถนัด</b> · <span>ดูจากตารางเวดจ์ใน "ระยะแต่ละไม้"</span></li>
      <li><b>พัตต์ไกล: เป้าคือ 2 พัตต์</b> · <span>คิดถึงน้ำหนัก ให้ลูกหยุดในวง 1 เมตร</span></li></ul></div>
    <div class="card"><h2>🔁 Pre-shot routine (ทุกช็อต)</h2><ol class="plist">${P.DRILLS.find(d => d.id === 'routine').how.slice(0, 4).map(s => `<li>${s}</li>`).join('')}</ol></div>
    <button class="btn sec full" data-pa="go" data-v="menu">‹ กลับ</button>`;
  }
  function drillDlg(id) {
    const d = P.DRILLS.find(x => x.id === id); if (!d) return; const wk = (D.done[id] || []).filter(t => t > Date.now() - 7 * DAY).length;
    const TOOL = { range: ['🎯 เปิดซ้อมไดรฟ์', 'range'], tempo: ['🥁 เปิดจังหวะสวิง', 'tempo'], camera: ['🎥 เปิดกล้อง', 'cam'], setup: ['🧍 ดูจุดตั้ง', 'setup'] }[d.tool];
    dlg(`<h3 style="margin:0 0 8px;color:#1b5e20">${d.t}</h3><div style="text-align:left;font-size:15px;line-height:1.55">
      <p class="muted" style="margin:0 0 8px">${d.why}</p><ol style="padding-left:20px;margin:0 0 8px">${d.how.map(s => `<li>${s}</li>`).join('')}</ol>
      <div class="note ok">🎯 <span>เป้าหมาย</span>: <b>${d.goal}</b>${wk ? ` · <span>สัปดาห์นี้ทำแล้ว</span> ${wk} <span>ครั้ง</span>` : ''}</div></div>
      ${TOOL ? `<button class="btn sec full" data-r="${TOOL[1]}">${TOOL[0]}</button>` : ''}
      <div class="grid2" style="margin-top:8px"><button class="btn sec" data-r="">ปิด</button><button class="btn" data-r="done">✅ ทำแล้ววันนี้</button></div>`,
    el => el.addEventListener('click', e => { const b = e.target.closest('[data-r]'); if (!b) return; el.remove(); const r = b.dataset.r;
      if (r === 'done') { (D.done[id] = D.done[id] || []).push(Date.now()); D.done[id] = D.done[id].slice(-60); save(); toast('บันทึกแล้ว ✓'); render(); }
      else if (r) { if (r === 'setup') V.setupK = 'CHIP'; go(r); } }));
  }

  /* ---------- ซ้อมไดรฟ์ ---------- */
  const bag = () => [...D.bag].sort((a, b) => P.clubIx(a) - P.clubIx(b));
  const curClub = () => V.club && bag().includes(V.club) ? V.club : (bag().includes('7i') ? '7i' : bag()[0]);
  const curKey = () => { const c = curClub(); return P.keyOf({ c, sw: P.isWedge(c) ? V.sw : 'full' }); };
  function distVal() {
    const k = curKey(); if (V.dist[k] != null) return V.dist[k];
    const last = [...D.balls].reverse().find(b => P.keyOf(b) === k && b.d != null);
    if (last) return toU(last.d);
    const c = curClub(), f = { full: 1, 10: 0.8, 9: 0.6, 8: 0.4 }[P.isWedge(c) ? V.sw : 'full'];
    return Math.round(P.typicalYd(c) * f / (yd() ? 1 : P.YD));
  }
  function rRange() {
    const c = curClub(), s = curSession(), k = curKey(), sb = s ? D.balls.filter(b => b.s === s) : [], cb = sb.filter(b => P.keyOf(b) === k), st = P.groupStats(cb), tip = P.rangeTip(st);
    const btn = (q, dir, lab) => `<button class="rbtn q-${q}" data-pa="hit" data-q="${q}" data-dir="${dir || ''}">${lab}</button>`;
    const dots = cb.slice(-16).map(b => `<i style="background:${P.Q[b.q][1]}">${b.dir === 'L' ? '‹' : b.dir === 'R' ? '›' : b.dir === 'C' ? '•' : ''}</i>`).join('');
    return `<div class="card"><div class="ptop"><h2 style="margin:0">🎯 ซ้อมไดรฟ์</h2><span class="muted">${s ? `<span>เซสชันนี้</span> ${sb.length} <span>ลูก</span>` : 'เริ่มเซสชันใหม่'}</span></div>
      <div class="chips cl">${bag().filter(x => x !== 'Putter').map(x => `<button class="${x === c ? 'cur' : ''}" data-pa="club" data-v="${x}" data-notr>${x}</button>`).join('')}<button data-pa="editbag" title="แก้ไม้ในถุง">✏️</button></div>
      ${P.isWedge(c) ? `<label class="lb">วงสวิง (ระบบนาฬิกา)</label><div class="seg">${P.SWINGS.map(([v, l]) => `<button data-pa="sw" data-v="${v}" class="${V.sw === v ? 'on' : ''}">${l}</button>`).join('')}</div>` : ''}
      <div class="trow" style="margin-top:6px"><span><b>ใส่ระยะ</b><br><span class="muted">ระยะลูกตก ดูจากธงบนสนามไดรฟ์</span></span><button class="sw ${D.useDist ? 'on' : ''}" data-pa="usedist"></button></div>
      ${D.useDist ? `<div class="dstep"><button data-pa="dd" data-v="-5">−5</button><button data-pa="dd" data-v="-1">−1</button><input id="pdist" type="number" inputmode="numeric" value="${distVal()}"><span>${un()}</span><button data-pa="dd" data-v="1">+1</button><button data-pa="dd" data-v="5">+5</button></div>` : ''}</div>
    <div class="card rgrid"><div class="rh"><span>↖ ซ้าย</span><span>⬆ ตรง</span><span>↗ ขวา</span></div>
      <div class="rlab">✅ เต็มหน้าไม้</div><div class="grid3">${btn('p', 'L', '‹')}${btn('p', 'C', '●')}${btn('p', 'R', '›')}</div>
      <div class="rlab">👌 พอใช้ (ไม่เต็ม แต่ไปได้)</div><div class="grid3">${btn('o', 'L', '‹')}${btn('o', 'C', '●')}${btn('o', 'R', '›')}</div>
      <div class="rlab">❌ พลาด</div><div class="grid3">${btn('fat', '', '⬇️<small>ตีดิน</small>')}${btn('thin', '', '⬆️<small>ท็อป/บาง</small>')}${btn('wild', '', '🌀<small>หลุดแรง</small>')}</div></div>
    <div class="card"><div class="ptop"><b data-notr>${c}${P.isWedge(c) && V.sw !== 'full' ? ' · ' + ctx.tr(P.swingLabel(V.sw)) : ''}</b>${cb.length ? '<button class="btn sec" style="padding:6px 12px" data-pa="undo">↩︎ ลบลูกล่าสุด</button>' : ''}</div>
      ${cb.length ? `<div class="dots">${dots}</div><div class="fgrid">
        <div><b>${st.n}</b><small>ลูก</small></div><div><b>${st.score}%</b><small>คะแนนคงที่</small></div><div><b>${st.straight ?? '–'}${st.straight != null ? '%' : ''}</b><small>ตรง</small></div>
        <div><b>${st.carry != null ? toU(st.carry) : '–'}</b><small>ระยะ (${un()})</small></div><div><b>${st.lo != null && st.nd >= 3 ? toU(st.hi) - toU(st.lo) : '–'}</b><small>ช่วงระยะ</small></div><div><b>${st.p}</b><small>เต็มหน้าไม้</small></div></div>`
        : '<p class="muted" style="margin:4px 0">กดปุ่มด้านบน 1 ครั้งต่อ 1 ลูก · เลือกช่องตามทิศที่ลูกไป</p>'}
      ${tip ? `<div class="cn"><span>${tip[0]}</span><div><b>${tip[1]}</b><br>${tip[2]}</div></div>` : ''}
      <button class="btn sec full" data-pa="setupof" data-v="${c}">🧍 จุดตั้งของไม้นี้</button></div>
    <div class="grid2"><button class="btn sec" data-pa="go" data-v="bag">📏 ระยะแต่ละไม้</button><button class="btn sec" data-pa="endsess">✅ จบเซสชัน</button></div>
    <button class="btn sec full" data-pa="go" data-v="menu">‹ กลับ</button>`;
  }
  function hit(q, dir) {
    const now = Date.now(); let s = curSession(); if (!s) s = now; D.cur = { s, last: now };
    const c = curClub(), b = { t: now, s, c, q }; if (P.isWedge(c) && V.sw !== 'full') b.sw = V.sw; if (dir) b.dir = dir;
    if (D.useDist && (q === 'p' || q === 'o')) { const v = +(root.querySelector('#pdist')?.value || distVal()); if (v > 0) { b.d = Math.round(fromU(v) * 10) / 10; V.dist[curKey()] = v; } }
    D.balls.push(b); if (D.balls.length > 6000) D.balls = D.balls.slice(-6000); save();
    try { navigator.vibrate?.(15); } catch (e) {}
    render();
  }
  function editBag() {
    let sel = new Set(D.bag);
    const body = () => `<p><b>ไม้ในถุงของฉัน</b></p><div class="bagpick">${P.ALL_CLUBS.map(c => `<button data-c="${c}" class="${sel.has(c) ? 'on' : ''}" data-notr>${c}</button>`).join('')}</div>
      <p class="muted" style="font-size:12px">ปกติไม่เกิน 14 ไม้ · เลือกแล้ว ${sel.size}</p><div class="grid2"><button class="btn sec" data-r="0">ยกเลิก</button><button class="btn" data-r="1">บันทึก</button></div>`;
    dlg(body(), el => el.addEventListener('click', e => {
      const c = e.target.closest('[data-c]'); if (c) { const v = c.dataset.c; sel.has(v) ? sel.delete(v) : sel.add(v); el.querySelector('.dlgbox').innerHTML = body(); return; }
      const r = e.target.closest('[data-r]'); if (!r) return; el.remove(); if (r.dataset.r === '1' && sel.size) { D.bag = [...sel]; save(); render(); }
    }));
  }

  /* ---------- ระยะแต่ละไม้ ---------- */
  function spark(pts, key, fmt) {
    const v = pts.map(p => p[key]).filter(x => x != null); if (v.length < 2) return '';
    const lo = Math.min(...v), hi = Math.max(...v), rg = hi - lo || 1, W = 320, H = 60, X = i => 12 + i * (W - 24) / (v.length - 1), Y = q => 8 + (hi - q) * (H - 18) / rg;
    return `<svg viewBox="0 0 ${W} ${H}" class="chart"><path d="${v.map((q, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(q).toFixed(1)}`).join('')}" fill="none" stroke="#2e7d32" stroke-width="2.5"/>${v.map((q, i) => `<circle cx="${X(i)}" cy="${Y(q)}" r="3.5" fill="#2e7d32"/><text x="${X(i)}" y="${Y(q) - 6}" font-size="10" text-anchor="middle" fill="#556">${fmt(q)}</text>`).join('')}</svg>`;
  }
  function rBag() {
    const rows = P.bagTable(D.balls, D.bag), wm = P.wedgeMatrix(D.balls, D.bag);
    const keys = [...new Set(D.balls.map(P.keyOf))].sort((a, b) => P.clubIx(a.split('|')[0]) - P.clubIx(b.split('|')[0]));
    const tk = keys.includes(V.trendK) ? V.trendK : keys.find(k => k === '7i') || keys[0], tr = tk ? P.clubTrend(D.balls, tk) : [], ss = P.sessions(D.balls);
    const warn = rows.filter(r => r.warn);
    return `<div class="card"><h2>📏 ระยะแต่ละไม้ (วงเต็ม)</h2>
      ${rows.some(r => r.s.n) ? `<div class="scroll"><table><tr><th class="l">ไม้</th><th>ระยะ</th><th>ช่วง 50%</th><th>คงที่</th><th>ตรง</th><th>ลูก</th></tr>
        ${rows.map(r => `<tr><td class="l"><b data-notr>${r.c}</b></td><td><b>${r.s.carry != null ? toU(r.s.carry) : '–'}</b>${r.gap != null ? `<small style="color:${r.warn ? '#c62828' : '#889'}">−${toU(r.gap)}</small>` : ''}</td>
          <td class="muted">${r.s.nd >= 3 ? toU(r.s.lo) + '–' + toU(r.s.hi) : '–'}</td><td>${r.s.score != null ? `<span class="lvl ${r.s.score >= 70 ? 'good' : r.s.score < 45 ? 'bad' : ''}">${r.s.score}%</span>` : '–'}</td>
          <td>${r.s.straight != null ? r.s.straight + '%' : '–'}</td><td class="muted">${r.s.n || ''}</td></tr>`).join('')}</table></div>
        <p class="muted" style="font-size:11px;margin:6px 0 0"><span>หน่วย</span>: ${un()} · <span>ระยะ = มัธยฐานของลูกเต็มหน้าไม้ · ตัวเลขเล็ก = ห่างจากไม้ก่อนหน้า</span></p>
        ${warn.map(r => `<div class="cn"><span>${r.warn === 'close' ? '⚠️' : '↕️'}</span><div><b data-notr>${r.c}</b> ${r.warn === 'close' ? `<span>ระยะใกล้กับไม้ก่อนหน้ามาก (ห่าง</span> ${toU(r.gap)} ${un()}) <span>· ไม้ใดไม้หนึ่งอาจไม่จำเป็น หรือยังตีไม้ยาวไม่เต็ม</span>` : `<span>ห่างจากไม้ก่อนหน้า</span> ${toU(r.gap)} ${un()} <span>· มีช่องว่างระยะ ลองเพิ่มไม้หรือฝึกวง ¾ ของไม้ที่ยาวกว่า</span>`}</div></div>`).join('')}`
        : '<p class="muted">ยังไม่มีข้อมูล · ไปที่ "ซ้อมไดรฟ์" ตีไม้ละ 5-10 ลูกพร้อมใส่ระยะ</p>'}
      <button class="btn sec full" data-pa="editbag">✏️ แก้ไม้ในถุง</button></div>
    ${wm.length ? `<div class="card"><h2>🕘 ตารางระยะเวดจ์ (ระบบนาฬิกา)</h2><div class="scroll"><table><tr><th class="l">เวดจ์</th>${P.SWINGS.map(([, l]) => `<th>${l}</th>`).join('')}</tr>
      ${wm.map(r => `<tr><td class="l"><b data-notr>${r.c}</b></td>${r.cells.map(s => `<td>${s.carry != null ? `<b>${toU(s.carry)}</b>` : '<span class="muted">–</span>'}</td>`).join('')}</tr>`).join('')}</table></div>
      <p class="muted" style="font-size:12px;margin:6px 0 0">จังหวะเท่ากันทุกวง ต่างกันแค่ความยาววง · เติมช่องว่างได้จาก "ซ้อมไดรฟ์" → เลือกเวดจ์ → เลือกวงสวิง</p></div>` : ''}
    ${keys.length ? `<div class="card"><h2>📈 ความคงที่ต่อเซสชัน</h2><div class="chips" style="padding:0 0 6px">${keys.map(k => `<button style="width:auto;padding:0 10px;border-radius:16px" class="${k === tk ? 'cur' : ''}" data-pa="trendk" data-v="${k}" data-notr>${k.replace('|', ' ')}</button>`).join('')}</div>
      ${tr.length >= 2 ? `<div class="muted" style="font-size:12px">คะแนนคงที่ (%)</div>${spark(tr, 'score', v => v)}${tr.some(x => x.carry != null) ? `<div class="muted" style="font-size:12px">ระยะ (${un()})</div>${spark(tr, 'carry', v => toU(v))}` : ''}`
        : '<p class="muted" style="margin:0">ต้องมีอย่างน้อย 2 เซสชันที่ตีไม้นี้ 5 ลูกขึ้นไป</p>'}</div>` : ''}
    ${ss.length ? `<div class="card"><h2>🗓️ เซสชันที่ผ่านมา</h2>${ss.slice(0, 15).map(x => `<div class="trow"><span><b>${fmtD(x.s)}</b> · ${x.n} <span>ลูก</span> · <span>คงที่</span> ${x.st.score}%<br><span class="muted" data-notr>${x.clubs.join(' ')}</span></span><button class="x" data-pa="delsess" data-v="${x.s}">🗑</button></div>`).join('')}</div>` : ''}
    <button class="btn full" data-pa="go" data-v="range">🎯 ไปซ้อมไดรฟ์</button><button class="btn sec full" data-pa="go" data-v="menu">‹ กลับ</button>`;
  }

  /* ---------- จุดตั้งแต่ละไม้ ---------- */
  function setupOf(k) { const d = P.SETUPS.find(s => s.k === k) || P.SETUPS[4]; return { d, m: { bp: d.bp, w: d.w, wt: d.wt, ...(D.setup[k] || {}) } }; }
  function stanceSvg(d, m, hand) {
    const W = 320, cx = 160, sh = 128, gap = m.w * sh, fx = gap / 2 + 14, bx0 = cx - gap / 2, bx = bx0 + m.bp / 100 * gap, rx0 = bx0 + d.bp / 100 * (d.w * sh) + (gap - d.w * sh) / 2;
    const fl = x => hand === 'L' ? W - x : x;
    const foot = (x, rot) => `<ellipse cx="${fl(x)}" cy="62" rx="13" ry="30" transform="rotate(${hand === 'L' ? -rot : rot} ${fl(x)} 62)" fill="#5d4037"/>`;
    const changed = Math.abs(m.bp - d.bp) > 2 || Math.abs(m.w - d.w) > 0.04;
    return `<svg viewBox="0 0 ${W} 200" class="chart stance">
      <rect x="4" y="4" width="${W - 8}" height="192" rx="12" fill="#e8f5e9"/>
      <line x1="${cx}" y1="22" x2="${cx}" y2="178" stroke="#9e9e9e" stroke-dasharray="4 4"/><text x="${cx}" y="18" font-size="10" text-anchor="middle" fill="#889">กลางเท้า</text>
      <line x1="${fl(30)}" y1="186" x2="${fl(290)}" y2="186" stroke="#1b5e20" stroke-width="2"/><path d="M${fl(290)} 186 l${hand === 'L' ? 8 : -8} -5 v10 z" fill="#1b5e20"/>
      <text x="${fl(272)}" y="180" font-size="11" text-anchor="middle" fill="#1b5e20" font-weight="700">เป้า</text>
      ${foot(cx - fx, 6)}${foot(cx + fx, -18)}
      <text x="${fl(cx - fx)}" y="108" font-size="10" text-anchor="middle" fill="#556">เท้าหลัง</text><text x="${fl(cx + fx)}" y="108" font-size="10" text-anchor="middle" fill="#556">เท้าหน้า</text>
      <line x1="${fl(bx0)}" y1="128" x2="${fl(bx0 + gap)}" y2="128" stroke="#a5d6a7" stroke-width="2"/>
      ${changed ? `<circle cx="${fl(rx0)}" cy="146" r="9" fill="none" stroke="#2e7d32" stroke-dasharray="3 3"/><text x="${fl(rx0)}" y="168" font-size="9" text-anchor="middle" fill="#2e7d32">แนะนำ</text>` : ''}
      <line x1="${fl(bx)}" y1="118" x2="${fl(bx)}" y2="140" stroke="#c62828" stroke-width="1.5" stroke-dasharray="2 2"/>
      <circle cx="${fl(bx)}" cy="146" r="8" fill="#fff" stroke="#333" stroke-width="1.5"/></svg>`;
  }
  function rSetup() {
    const k = V.setupK, { d, m } = setupOf(k), wtB = 100 - m.wt;
    return `<div class="card"><h2>🧍 จุดตั้งแต่ละไม้</h2>
      <div class="chips" style="padding:0 0 8px">${P.SETUPS.map(s => `<button style="width:auto;padding:0 11px;border-radius:16px" class="${s.k === k ? 'cur' : ''}" data-pa="setk" data-v="${s.k}">${s.t}</button>`).join('')}</div>
      <div class="seg" style="margin-bottom:6px"><button data-pa="hand" data-v="R" class="${D.hand !== 'L' ? 'on' : ''}">ถนัดขวา</button><button data-pa="hand" data-v="L" class="${D.hand === 'L' ? 'on' : ''}">ถนัดซ้าย</button></div>
      <div id="stsvg">${stanceSvg(d, m, D.hand)}</div>
      <div class="muted center" style="font-size:12px;margin-top:-2px">มองจากด้านบน · ยืนหันหน้าเข้าหาลูก</div>
      <button class="btn full" data-pa="go" data-v="live" style="margin-bottom:4px">📷 เช็คตำแหน่งสดด้วยกล้อง</button>
      <label class="lb"><span>ตำแหน่งลูก</span> · <b id="bpv">${m.bp < 45 ? 'ค่อนเท้าหลัง' : m.bp <= 55 ? 'กลางเท้า' : m.bp >= 88 ? 'ส้นเท้าหน้า' : 'ค่อนเท้าหน้า'}</b></label><input class="rng" type="range" min="0" max="100" value="${m.bp}" data-pi="bp">
      <label class="lb"><span>ความกว้างการยืน</span> · <b>${Math.round(m.w * 100)}%</b> <span>ของความกว้างไหล่</span></label><input class="rng" type="range" min="25" max="130" value="${Math.round(m.w * 100)}" data-pi="w">
      <label class="lb"><span>น้ำหนัก</span> · <span>เท้าหลัง</span> <b>${wtB}%</b> / <span>เท้าหน้า</span> <b>${m.wt}%</b></label><input class="rng" type="range" min="30" max="80" value="${m.wt}" data-pi="wt">
      ${D.setup[k] && (D.setup[k].bp != null || D.setup[k].w != null || D.setup[k].wt != null) ? '<button class="btn sec full" data-pa="setreset">↺ กลับเป็นค่าแนะนำ</button>' : ''}</div>
    <div class="card"><h2>✅ จุดสำคัญ</h2><ul class="plist">${d.pts.map(s => `<li>${s}</li>`).join('')}</ul>
      <div class="cn" style="background:#fff3e0"><span>⚠️</span><div><b>พลาดบ่อย</b>: ${d.miss}</div></div></div>
    <div class="card"><h2>📝 จุดพอดีของฉัน</h2><p class="muted" style="margin:0 0 6px;font-size:13px">ตีดีเมื่อไหร่ จดความรู้สึก/สิ่งที่ทำไว้ เช่น "ลูกซ้ายครึ่งลูก กริปสั้นลง 1 นิ้ว ขึ้น ¾"</p>
      <textarea rows="3" data-pi="note" placeholder="จดสิ่งที่ทำแล้วตีดี...">${esc(D.setup[k]?.note || '')}</textarea></div>
    <div class="grid2"><button class="btn sec" data-pa="go" data-v="cam">🎥 อัดเช็คท่า</button><button class="btn sec" data-pa="go" data-v="range">🎯 ซ้อมไดรฟ์</button></div>
    <button class="btn sec full" data-pa="go" data-v="menu">‹ กลับ</button>`;
  }

  /* ---------- กล้องวงสวิง ---------- */
  function rCam() {
    const c = V.cam, cl = curClub();
    return `<div class="camwrap"><video id="pv" playsinline muted autoplay></video><canvas id="pgrid"></canvas><div class="camst" id="camst">กำลังเปิดกล้อง...</div><div class="cdn" id="cdn"></div></div>
    <div class="card"><div class="grid2"><select data-pi="camclub">${bag().map(x => `<option ${x === cl ? 'selected' : ''}>${x}</option>`).join('')}</select>
      <div class="seg"><button data-pa="camview" data-v="face" class="${c.view === 'face' ? 'on' : ''}">ด้านหน้า</button><button data-pa="camview" data-v="dtl" class="${c.view === 'dtl' ? 'on' : ''}">ด้านหลัง</button></div></div>
      <label class="lb">นับถอยหลังก่อนอัด</label><div class="seg">${[0, 3, 5, 10].map(v => `<button data-pa="camcd" data-v="${v}" class="${c.cd === v ? 'on' : ''}">${v ? v + ' วิ' : 'ทันที'}</button>`).join('')}</div>
      <label class="lb">ความยาวคลิป</label><div class="seg">${[3, 5, 8].map(v => `<button data-pa="camlen" data-v="${v}" class="${c.len === v ? 'on' : ''}">${v} วิ</button>`).join('')}</div>
      <div class="trow"><span><b>อัดวนอัตโนมัติ</b><br><span class="muted">เก็บคลิปแล้วนับถอยหลังใหม่เอง ไม่ต้องเดินมากด</span></span><button class="sw ${c.auto ? 'on' : ''}" data-pa="camauto"></button></div>
      <div class="trow"><span><b>เส้นตาราง</b><br><span class="muted">ช่วยวางกล้องให้ตรงและเช็คท่า</span></span><button class="sw ${c.grid ? 'on' : ''}" data-pa="camgrid"></button></div>
      <button class="btn full big-btn rec" id="recbtn" data-pa="rec">⏺ อัดวงสวิง</button>
      <div class="grid2"><button class="btn sec" data-pa="flip">🔄 สลับกล้อง</button><label class="btn sec">📂 นำเข้าคลิป<input type="file" accept="video/*" id="impvid" hidden></label></div></div>
    <div class="card"><h2>📐 วางมือถือยังไง</h2><ul class="plist">
      <li><b>ด้านหน้า (face-on)</b> · <span>ตรงกลางลำตัว ห่าง 3 เมตร สูงระดับมือ — ดูตำแหน่งลูก การย้ายน้ำหนัก หัวนิ่งไหม</span></li>
      <li><b>ด้านหลัง (down-the-line)</b> · <span>ด้านหลังมือ เล็งขนานแนวเป้า — ดูระนาบวงสวิง แนวไหล่/เท้า มุมก้ม</span></li>
      <li><span>พิงกับถุงกอล์ฟหรือใช้ขาตั้ง ให้เห็นทั้งตัวและหัวไม้ตลอดวง</span></li>
      <li><span>อยากได้สโลว์ชัดกว่า: อัดด้วยกล้องสโลว์โมชันของมือถือ แล้วกด "นำเข้าคลิป"</span></li>
      <li><b>🎯 อยากได้เส้นลูก</b> · <span>เลือก "ด้านหลัง" ถือแนวตั้ง ให้ลูกอยู่ส่วนล่าง ~1/4 ของจอ เห็นฟ้าเยอะๆ · แอปหาลูกและวาดเส้นให้เองหลังอัด</span></li></ul></div>
    <div class="grid2"><button class="btn sec" data-pa="go" data-v="swings">📼 คลิปของฉัน</button><button class="btn sec" data-pa="go" data-v="menu">‹ กลับ</button></div>`;
  }
  function drawGrid(cv, on) {
    const r = cv.parentElement.getBoundingClientRect(), dpr = devicePixelRatio || 1; cv.width = r.width * dpr; cv.height = r.height * dpr;
    const g = cv.getContext('2d'); g.clearRect(0, 0, cv.width, cv.height); if (!on) return;
    g.strokeStyle = 'rgba(255,255,255,.45)'; g.lineWidth = dpr;
    [1 / 3, 2 / 3].forEach(f => { g.beginPath(); g.moveTo(cv.width * f, 0); g.lineTo(cv.width * f, cv.height); g.moveTo(0, cv.height * f); g.lineTo(cv.width, cv.height * f); g.stroke(); });
    g.strokeStyle = 'rgba(255,235,59,.8)'; g.setLineDash([6 * dpr, 6 * dpr]); g.beginPath(); g.moveTo(cv.width / 2, 0); g.lineTo(cv.width / 2, cv.height); g.stroke();
  }
  async function mountCam() {
    const pv = root.querySelector('#pv'), st = root.querySelector('#camst'); drawGrid(root.querySelector('#pgrid'), V.cam.grid);
    root.querySelector('#impvid').addEventListener('change', e => { const f = e.target.files?.[0]; if (f) importClip(f); });
    if (!navigator.mediaDevices?.getUserMedia) { st.textContent = ctx.tr('เบราว์เซอร์นี้เปิดกล้องไม่ได้ · ใช้ "นำเข้าคลิป" แทน'); return; }
    const vc = { facingMode: V.cam.facing, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 60 } };
    let s = null; try { s = await navigator.mediaDevices.getUserMedia({ video: vc, audio: true }); } catch (e) { try { s = await navigator.mediaDevices.getUserMedia({ video: vc, audio: false }); } catch (e2) {} }
    if (V.page !== 'cam' || !root.contains(pv)) { s?.getTracks().forEach(t => t.stop()); return; }
    if (!s) { st.textContent = ctx.tr('เปิดกล้องไม่ได้ · กดอนุญาตให้ใช้กล้อง หรือใช้ "นำเข้าคลิป"'); return; }
    live.stream = s; pv.srcObject = s; pv.play?.().catch(() => {}); st.textContent = ''; wake(true);
  }
  function pickMime() { const M = window.MediaRecorder; if (!M?.isTypeSupported) return ''; return ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(t => M.isTypeSupported(t)) || ''; }
  function startRec() {
    if (!live.stream) return toast('ยังเปิดกล้องไม่ได้');
    if (!window.MediaRecorder) return toast('เบราว์เซอร์นี้อัดวิดีโอไม่ได้ · ใช้ "นำเข้าคลิป" แทน');
    if (live.busy) { // กดซ้ำระหว่างนับ/อัด = ยกเลิก
      live.busy = false; (live.timers || []).forEach(clearTimeout); live.timers = []; if (live.rec?.state === 'recording') { live.rec.onstop = null; live.rec.stop(); }
      setRecUi(''); return; }
    live.busy = true; const cdn = root.querySelector('#cdn'); let n = V.cam.cd;
    const tick = () => { if (!live.busy) return; if (n > 0) { cdn.textContent = n; beep(660, 0.06); n--; later(tick, 1000); return; } cdn.textContent = ''; record(); };
    setRecUi('cd'); tick();
  }
  function setRecUi(s) { const b = root.querySelector('#recbtn'), st = root.querySelector('#camst'); if (!b) return;
    b.textContent = ctx.tr(s === 'rec' ? '⏹ กำลังอัด... (กดเพื่อยกเลิก)' : s === 'cd' ? '✖ ยกเลิก' : '⏺ อัดวงสวิง'); b.classList.toggle('on', !!s);
    if (st) st.innerHTML = s === 'rec' ? '<span class="recdot"></span> REC' : ''; if (!s) { const c = root.querySelector('#cdn'); if (c) c.textContent = ''; } }
  function record() {
    const mime = pickMime(), chunks = []; let rec;
    try { rec = new MediaRecorder(live.stream, mime ? { mimeType: mime } : {}); } catch (e) { live.busy = false; setRecUi(''); return toast('อัดวิดีโอไม่ได้'); }
    live.rec = rec; rec.ondataavailable = e => { if (e.data?.size) chunks.push(e.data); };
    rec.onstop = async () => { beep(1200, 0.12); const type = (rec.mimeType || mime || 'video/mp4').split(';')[0], blob = new Blob(chunks, { type });
      const id = await saveClip(blob, { club: curClub(), view: V.cam.view, audio: live.stream?.getAudioTracks().length > 0 });
      if (!id || V.page !== 'cam') return;
      if (V.cam.auto && live.busy) { toast('เก็บคลิปแล้ว ✓ เตรียมวงต่อไป'); live.busy = false; setRecUi(''); later(startRec, 1500); }
      else { live.busy = false; go('swing', { swId: id }); } };
    rec.start(200); beep(990, 0.1); setRecUi('rec');
    later(() => { if (rec.state === 'recording') rec.stop(); }, V.cam.len * 1000);
  }
  async function thumbOf(blob) {
    return new Promise(res => { const v = document.createElement('video'), u = URL.createObjectURL(blob); let fin = false;
      const end = r => { if (fin) return; fin = true; URL.revokeObjectURL(u); res(r); }; setTimeout(() => end(null), 5000);
      v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = u;
      v.onloadeddata = () => { v.currentTime = Math.min(isFinite(v.duration) ? v.duration * 0.45 : 0.5, 2); };
      v.onseeked = () => { try { const c = document.createElement('canvas'), s = 160 / Math.max(v.videoWidth, v.videoHeight, 1); c.width = v.videoWidth * s; c.height = v.videoHeight * s; c.getContext('2d').drawImage(v, 0, 0, c.width, c.height); end(c.toDataURL('image/jpeg', 0.6)); } catch (e) { end(null); } };
      v.onerror = () => end(null); });
  }
  async function saveClip(blob, o) {
    try {
      const buf = await blob.arrayBuffer(), id = 'sw' + Date.now().toString(36);
      const m = { id, t: Date.now(), club: o.club || '7i', view: o.view || 'face', note: '', star: false, type: blob.type || 'video/mp4', tags: {}, slow: o.slow || 1, draw: [], size: buf.byteLength, thumb: await thumbOf(blob) };
      if (o.audio) { const imp = await findImpact(buf); if (imp != null) { m.tags.imp = imp; m.autoImp = true; } }
      await SW.put(m, buf); return id;
    } catch (e) { toast('บันทึกคลิปไม่ได้ (พื้นที่ในเครื่องอาจเต็ม)'); return null; }
  }
  async function importClip(f) {
    if (f.size > 150e6) return toast('คลิปใหญ่เกิน 150 MB · ตัดให้สั้นลงก่อน');
    toast('กำลังนำเข้า...'); const id = await saveClip(f, { club: curClub(), view: V.cam.view, audio: true });
    if (id) go('swing', { swId: id });
  }

  /* ---------- รายการคลิป ---------- */
  function rSwings() { return `<div class="card"><h2>📼 คลิปวงสวิงของฉัน</h2><div id="swl" class="muted">กำลังโหลด...</div></div>
    <div class="grid2"><button class="btn" data-pa="go" data-v="cam">🎥 อัดใหม่</button><label class="btn sec">📂 นำเข้าคลิป<input type="file" accept="video/*" id="impvid" hidden></label></div>
    <button class="btn sec full" data-pa="go" data-v="menu">‹ กลับ</button>`; }
  async function mountSwings() {
    root.querySelector('#impvid').addEventListener('change', e => { const f = e.target.files?.[0]; if (f) importClip(f); });
    let L = []; try { L = await SW.list(); } catch (e) {}
    const el = root.querySelector('#swl'); if (!el) return;
    if (!L.length) { el.innerHTML = ctx.tr('ยังไม่มีคลิป · อัดวงสวิงหรือนำเข้าคลิปจากกล้องมือถือ'); return; }
    const clubs = [...new Set(L.map(m => m.club))].sort((a, b) => P.clubIx(a) - P.clubIx(b)), f = clubs.includes(V.swFilter) ? V.swFilter : '';
    const sh = L.filter(m => !f || m.club === f), mb = Math.round(L.reduce((s, m) => s + (m.size || 0), 0) / 1e6);
    el.className = ''; el.innerHTML = `<div class="chips" style="padding:0 0 8px"><button style="width:auto;padding:0 12px;border-radius:16px" class="${!f ? 'cur' : ''}" data-pa="swf" data-v="">ทั้งหมด</button>${clubs.map(c => `<button style="width:auto;padding:0 12px;border-radius:16px" class="${c === f ? 'cur' : ''}" data-pa="swf" data-v="${c}" data-notr>${c}</button>`).join('')}</div>
      <div class="swgrid">${sh.map(m => { const tp = P.tempoOf(m.tags, m.slow); return `<button class="swc" data-pa="openswing" data-v="${m.id}">${m.thumb ? `<img src="${m.thumb}" alt="">` : '<div class="nothumb">🎥</div>'}
        <span><b data-notr>${m.club}</b>${m.star ? ' ⭐' : ''}<br><small>${fmtD(m.t)}${tp ? ' · ' + tp.ratio.toFixed(1) + ':1' : ''}${m.trace?.ok ? ' · 🎯 ' + toU(m.trace.est.carry) : ''}</small></span></button>`; }).join('')}</div>
      <p class="muted" style="font-size:12px;margin:8px 0 0">${L.length} <span>คลิป</span> · ${mb} MB <span>ในเครื่องนี้</span></p>`;
  }

  /* ---------- ดูคลิป: สโลว์ · ทีละเฟรม · ป้ายตำแหน่ง · วาดเส้น ---------- */
  const TAGS = [['a', 'ตั้งท่า'], ['top', 'ขึ้นสุด'], ['imp', 'กระทบ'], ['fin', 'จบ']];
  function rSwing() {
    return `<div class="card" style="padding:8px"><div class="ptop" style="padding:0 4px"><b id="swh">…</b><span style="display:flex;gap:6px"><button class="btn sec" style="padding:6px 10px" data-pa="star" id="starb">☆</button><button class="x" data-pa="delswing">🗑</button></span></div>
      <div class="vbox"><video id="sv" playsinline muted preload="auto"></video><canvas id="ov"></canvas></div>
      <input class="rng" type="range" id="scrub" min="0" max="1000" value="0" step="1">
      <div class="vctl"><button data-pa="step" data-v="-1">⏮</button><button data-pa="play" id="playb">▶️</button><button data-pa="step" data-v="1">⏭</button><span id="tnow">0.00</span></div>
      <div class="seg">${[[1, '1×'], [0.5, '½'], [0.25, '¼'], [0.125, '⅛']].map(([v, l]) => `<button data-pa="speed" data-v="${v}" class="${V.speed === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>
    <div class="card"><h2>🎯 เส้นลูก (Shot Tracer)</h2><div id="trbody" class="muted">กำลังโหลด...</div></div>
    <div class="card"><h2>🏷️ ติดป้ายตำแหน่ง (ที่เฟรมปัจจุบัน)</h2><div class="grid4 tagb">${TAGS.map(([k, l]) => `<div><button data-pa="tag" data-v="${k}">${l}</button><button class="tj" data-pa="jump" data-v="${k}" id="tg_${k}">–</button></div>`).join('')}</div>
      <p class="muted" style="font-size:12px;margin:6px 0 0">หยุดภาพที่ตำแหน่งนั้นแล้วกดป้าย · กดเวลาใต้ป้ายเพื่อกลับไปเฟรมนั้น</p><div id="tempo"></div></div>
    <div class="card"><h2>✏️ วาดเส้นเช็คท่า</h2><div class="seg">${[['view', '✋ ดู'], ['line', '／ เส้น'], ['circle', '◯ วงกลม']].map(([v, l]) => `<button data-pa="tool" data-v="${v}" class="${V.tool === v ? 'on' : ''}">${l}</button>`).join('')}<button data-pa="clrdraw">🗑 ล้าง</button></div>
      <p class="muted" style="font-size:12px;margin:6px 0 0">เส้นแนวไม้ตอนตั้งท่า (ระนาบสวิง) · วงกลมรอบศีรษะ (หัวควรนิ่งอยู่ในวง) · เส้นหลังสะโพก</p></div>
    <div class="card"><div class="grid2"><div><label class="lb" style="margin-top:0">ไม้</label><select data-pi="swclub">${P.ALL_CLUBS.map(c => `<option>${c}</option>`).join('')}</select></div>
      <div><label class="lb" style="margin-top:0">คลิปสโลว์โมชัน</label><select data-pi="swslow">${[[1, 'ปกติ'], [4, '×4 (120fps)'], [8, '×8 (240fps)']].map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></div></div>
      <label class="lb">โน้ต</label><textarea rows="2" data-pi="swnote" placeholder="รู้สึกยังไง / ลูกไปทางไหน"></textarea></div>
    <button class="btn full" data-pa="cmp">🆚 เทียบกับวงอื่น</button>
    <div class="grid2"><button class="btn sec" data-pa="go" data-v="swings">📼 คลิปทั้งหมด</button><button class="btn sec" data-pa="go" data-v="cam">🎥 อัดต่อ</button></div>`;
  }
  async function loadVid(v, blob, src) {
    v.src = src || url(blob);
    await new Promise((res, rej) => { v.onloadedmetadata = res; v.onerror = () => rej(new Error('video')); setTimeout(res, 6000); });
    if (!isFinite(v.duration)) await new Promise(res => { const h = () => { if (isFinite(v.duration)) { v.removeEventListener('durationchange', h); res(); } }; v.addEventListener('durationchange', h); v.currentTime = 1e101; setTimeout(res, 3000); });
    v.currentTime = 0.001;
  }
  const dur = v => isFinite(v.duration) ? v.duration : 0;
  function contentRect(v, cv) { const W = cv.width, H = cv.height, vw = v.videoWidth || 9, vh = v.videoHeight || 16, s = Math.min(W / vw, H / vh); return { x: (W - vw * s) / 2, y: (H - vh * s) / 2, w: vw * s, h: vh * s }; }
  function paint(v, cv, shapes, tmp, tOver) {
    const r = cv.getBoundingClientRect(), dpr = devicePixelRatio || 1; if (cv.width !== Math.round(r.width * dpr)) { cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); }
    const g = cv.getContext('2d'), R = contentRect(v, cv), P2 = p => [R.x + p[0] * R.w, R.y + p[1] * R.h];
    g.clearRect(0, 0, cv.width, cv.height); g.lineWidth = 3 * dpr; g.strokeStyle = '#ffeb3b'; g.shadowColor = '#000'; g.shadowBlur = 3 * dpr;
    [...(shapes || []), ...(tmp ? [tmp] : [])].forEach(s => { const a = P2(s.a), b = P2(s.b); g.beginPath();
      if (s.t === 'line') { g.moveTo(...a); g.lineTo(...b); } else g.arc(a[0], a[1], Math.hypot(b[0] - a[0], b[1] - a[1]), 0, 7); g.stroke(); });
    const m = live.m; g.shadowBlur = 0;
    if (cv.id === 'ov' && m?.trace?.ok && !V.trOff) drawTrace(g, R, m.trace, tOver ?? (v.currentTime - m.trace.imp) / (m.slow || 1), R.h / 560, m);
  }
  async function mountSwing() {
    const m = await SW.get(V.swId).catch(() => null); if (V.page !== 'swing') return;
    if (!m) { toast('ไม่พบคลิป'); return go('swings'); }
    const v = root.querySelector('#sv'), cv = root.querySelector('#ov'), sc = root.querySelector('#scrub'); live.m = m;
    root.querySelector('#swh').textContent = `${m.club} · ${fmtD(m.t)}`; root.querySelector('#starb').textContent = m.star ? '⭐' : '☆';
    root.querySelector('[data-pi=swclub]').value = m.club; root.querySelector('[data-pi=swslow]').value = String(m.slow || 1); root.querySelector('[data-pi=swnote]').value = m.note || '';
    const blob = await SW.blob(m.id, m.type); if (!blob) return toast('ไฟล์คลิปหาย');
    try { await loadVid(v, blob); } catch (e) { return toast('เปิดคลิปนี้ไม่ได้'); }
    live.v = v; v.playbackRate = V.speed;
    const sync = () => { const d = dur(v); if (d) sc.value = Math.round(v.currentTime / d * 1000); const tn = root.querySelector('#tnow'); if (tn) tn.textContent = v.currentTime.toFixed(2); paint(v, cv, m.draw); };
    v.addEventListener('timeupdate', sync); v.addEventListener('seeked', sync); v.addEventListener('loadeddata', sync);
    v.addEventListener('play', () => { stopOver(); root.querySelector('#playb').textContent = '⏸'; const f = () => { sync(); live.raf = requestAnimationFrame(f); }; f(); });
    v.addEventListener('pause', () => { root.querySelector('#playb').textContent = '▶️'; cancelAnimationFrame(live.raf); sync(); });
    v.addEventListener('ended', () => { root.querySelector('#playb').textContent = '▶️'; overtime(); });
    sc.addEventListener('input', () => { stopOver(); v.pause(); v.currentTime = sc.value / 1000 * dur(v); });
    // วาดเส้น
    let st = null; const pt = e => { const r = cv.getBoundingClientRect(), dpr = devicePixelRatio || 1, R = contentRect(v, cv); return [((e.clientX - r.left) * dpr - R.x) / R.w, ((e.clientY - r.top) * dpr - R.y) / R.h]; };
    cv.addEventListener('pointerdown', e => { if (V.tool === 'view') return; e.preventDefault(); cv.setPointerCapture(e.pointerId); const p = pt(e); st = { t: V.tool, a: p, b: p }; });
    cv.addEventListener('pointermove', e => { if (!st) return; st.b = pt(e); paint(v, cv, m.draw, st); });
    cv.addEventListener('pointerup', () => { if (!st) return; const s = st; st = null; if (Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]) > 0.02) { m.draw = [...(m.draw || []), s]; SW.put(m); } paint(v, cv, m.draw); });
    cv.style.pointerEvents = V.tool === 'view' ? 'none' : 'auto';
    showTags(); sync();
    trBody(); if (m.view === 'dtl' && !m.trace) runTrace();
  }
  function showTags() {
    const m = live.m; if (!m) return;
    TAGS.forEach(([k]) => { const el = root.querySelector('#tg_' + k); if (el) el.textContent = m.tags?.[k] != null ? m.tags[k].toFixed(2) + (k === 'imp' && m.autoImp ? ' 🔊' : '') : '–'; });
    const tp = P.tempoOf(m.tags, m.slow), el = root.querySelector('#tempo'); if (!el) return;
    if (!tp) { el.innerHTML = `<p class="muted" style="font-size:12px;margin:6px 0 0">${ctx.tr('ติดป้าย ตั้งท่า (เริ่มขึ้นไม้) · ขึ้นสุด · กระทบ เพื่อวัดจังหวะสวิง')}</p>`; return; }
    const ok = tp.ratio >= 2.5 && tp.ratio <= 3.6, nt = P.nearestTempo(tp.bs);
    el.innerHTML = `<div class="cn" style="background:${ok ? '#e8f5e9' : '#fff3e0'}"><span>🥁</span><div>${ctx.tr('จังหวะ')} <b>${tp.ratio.toFixed(1)} : 1</b> · ${ctx.tr('ขึ้น')} ${sec(tp.bs)} ${ctx.tr('วิ')} · ${ctx.tr('ลง')} ${sec(tp.ds)} ${ctx.tr('วิ')}<br>
      <span class="muted">${ctx.tr(ok ? 'อยู่ในช่วงดี (ประมาณ 3:1 เหมือนโปร)' : tp.ratio < 2.5 ? 'ขึ้นไม้เร็วเกินไปเทียบกับลง · ลองขึ้นให้ช้าลง' : 'ลงช้าเทียบกับขึ้น · อาจผ่อนแรงตอนลง')} · ${ctx.tr('เสียงนำที่ใกล้เคียง')}: ${nt[0]}/${nt[1]}</span></div></div>`;
  }
  async function updM(fn) { const m = live.m; if (!m) return; fn(m); await SW.put(m); }

  /* ---------- เส้นลูก (Shot Tracer): หาลูก → ตามลูก → ฟิตวิถีตามฟิสิกส์ → วาดเส้นแดงทับคลิป (อัตโนมัติ ไม่ต้องแตะ) ---------- */
  const TR_WHY = { clip: 'คลิปต้องมีช่วงก่อนตีอย่างน้อย ~0.6 วิ และหลังตีอย่างน้อย ~1 วิ', ball: 'หาลูกที่ตั้งไม่เจอ · ให้เห็นลูกชัด ไม่โดนตัวหรือไม้บัง กล้องห่างลูก 2–4 ม.',
    track: 'ตามลูกที่บินออกไปไม่ได้ · ฉากหลังควรเป็นฟ้าหรือต้นไม้ ไม่มีคนเดินผ่าน ใช้ 60 fps หรือสโลว์โมชัน', fit: 'เห็นลูกสั้นเกินไป · ถอยกล้องให้เห็นฟ้าเยอะขึ้น ถือแนวตั้ง ให้ลูกอยู่ส่วนล่างของจอ' };
  const TR_TIPS = `<ul class="plist" style="margin-top:6px"><li><span>ตั้งมือถือด้านหลังผู้ตี เล็งไปทางเป้า (ปุ่ม "ด้านหลัง" ตอนอัด)</span></li><li><span>ถือแนวตั้ง ลูกอยู่ส่วนล่าง ~1/4 ของจอ เห็นฟ้าเยอะๆ</span></li><li><span>ขาตั้งหรือพิงถุงกอล์ฟให้นิ่ง ห่างลูก 2–4 ม. สูงราวเอว</span></li><li><span>สโลว์โมชัน (120/240 fps) ตามลูกได้ไกลกว่า · นำเข้าแล้วเลือก "คลิปสโลว์โมชัน"</span></li></ul>`;
  function userCarry(club) { const r = P.bagTable(D.balls, D.bag).find(x => x.c === club); return r && r.s.nd >= 3 ? r.s.carry : null; }
  function trBody() {
    const m = live.m, el = root.querySelector('#trbody'); if (!m || !el || live.trBusy) return;
    el.className = '';
    if (m.view !== 'dtl') { el.innerHTML = `<p class="muted" style="margin:0 0 8px">${ctx.tr('เส้นลูกใช้กับคลิปที่ถ่ายจากด้านหลังผู้ตี (down-the-line) เล็งไปทางเป้า')}</p><button class="btn full" data-pa="trdtl">${ctx.tr('🎯 คลิปนี้ถ่ายจากด้านหลัง · หาเส้นลูก')}</button>`; return; }
    const t = m.trace;
    if (!t) { el.innerHTML = `<button class="btn full" data-pa="trrun">${ctx.tr('🎯 หาเส้นลูก')}</button>`; return; }
    if (!t.ok) { el.innerHTML = `<div class="cn" style="background:#fff3e0;margin-top:0"><span>🤔</span><div><b>${ctx.tr('หาเส้นลูกไม่ได้')}</b><br><span class="muted">${ctx.tr(TR_WHY[t.why] || TR_WHY.track)}</span></div></div>${TR_TIPS}<button class="btn sec full" data-pa="trrun">${ctx.tr('🔁 ลองหาใหม่')}</button>`; return; }
    const e = t.est, sh = Tr.shapeOf(e, D.hand === 'L'), lr = x => ctx.tr(x < 0 ? 'ซ้าย' : 'ขวา');
    const out = Math.abs(e.dir) < 1 ? ctx.tr('ตรง') : lr(e.dir) + ' ' + Math.abs(e.dir).toFixed(0) + '°', land = Math.abs(e.side) < 2 ? ctx.tr('กลางแนวเป้า') : lr(e.side) + ' ' + toU(Math.abs(e.side)) + ' ' + ctx.tr(un());
    el.innerHTML = `<div class="trst"><div><b>${Math.round(e.speed * 2.237)}</b><small>${ctx.tr('ความเร็วลูก')} (mph)</small></div><div><b>${toU(e.carry)}</b><small>${ctx.tr('ระยะลอย')} (${ctx.tr(un())})</small></div>
        <div><b>${toU(e.apex)}</b><small>${ctx.tr('สูงสุด')} (${ctx.tr(un())})</small></div><div><b>${e.launch.toFixed(0)}°</b><small>${ctx.tr('มุมออก')}</small></div></div>
      <div class="cn"><span>↪️</span><div><b>${ctx.tr(sh.name)}</b> · ${ctx.tr('ออก')}${out} · ${ctx.tr('ตก')}${land}<br><span class="muted">${ctx.tr('ค่าประมาณจากกล้องมือถือ · เห็นลูกจริง')} ${t.seen.toFixed(2)} ${ctx.tr('วิแรก ที่เหลือคำนวณจากฟิสิกส์ลูกกอล์ฟ')}</span></div></div>
      <div class="grid2"><button class="btn sec" data-pa="trshow">${ctx.tr(V.trOff ? '👁 แสดงเส้น' : '🙈 ซ่อนเส้น')}</button><button class="btn sec" data-pa="trrun">${ctx.tr('🔁 หาใหม่')}</button></div>
      <button class="btn full" data-pa="trexp" style="margin-top:8px" id="trexp">${ctx.tr('💾 บันทึกคลิปพร้อมเส้น')}</button>`;
  }
  // วาดเส้น: เรืองแสงสีแดง บางลงตามระยะ · หัวเส้นเป็นจุดสว่างตอนลูกยังบิน · ลูกตกแล้วแสดงกล่องตัวเลข
  function drawTrace(g, R, tr, t, k, m) {
    const P = tr.path; if (t < 0 || !P?.length) return;
    const pts = []; for (let i = 0; i < P.length; i++) { const p = P[i];
      if (p.t > t) { const q = P[i - 1]; if (q) { const f = (t - q.t) / ((p.t - q.t) || 1); pts.push([R.x + (q.x + (p.x - q.x) * f) * R.w, R.y + (q.y + (p.y - q.y) * f) * R.h, q.z + (p.z - q.z) * f]); } break; }
      pts.push([R.x + p.x * R.w, R.y + p.y * R.h, p.z]); }
    if (pts.length < 2) return;
    const end = P[P.length - 1].t, wd = z => Math.max(1.3, Math.min(6, 26 / Math.max(1, z))) * k;
    g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
    const stroke = (col, mul, blur) => { g.strokeStyle = col; g.shadowColor = '#ff1a1a'; g.shadowBlur = blur * k;
      for (let i = 0; i < pts.length - 1; i += 6) { const j = Math.min(pts.length - 1, i + 6); g.lineWidth = wd(pts[Math.floor((i + j) / 2)][2]) * mul; g.beginPath(); g.moveTo(pts[i][0], pts[i][1]); for (let q = i + 1; q <= j; q++) g.lineTo(pts[q][0], pts[q][1]); g.stroke(); } };
    stroke('rgba(255,40,40,0.35)', 2.6, 14); stroke('#ff2d2d', 1, 6); stroke('rgba(255,220,220,0.9)', 0.35, 0);
    const h = pts[pts.length - 1];
    if (t < end) { g.shadowBlur = 12 * k; g.fillStyle = '#fff'; g.beginPath(); g.arc(h[0], h[1], Math.max(2, wd(h[2]) * 0.9), 0, 7); g.fill(); }
    else if (m) { // ตกแล้ว: จุดตก + กล่องตัวเลขแบบทีวี
      g.shadowBlur = 0; g.strokeStyle = '#fff'; g.lineWidth = 1.5 * k; g.beginPath(); g.ellipse(h[0], h[1], 7 * k, 3 * k, 0, 0, 7); g.stroke();
      const e = tr.est, lines = [[ctx.tr('ความเร็วลูก'), Math.round(e.speed * 2.237) + ' MPH'], [ctx.tr('ระยะลอย'), toU(e.carry) + ' ' + (yd() ? 'YD' : 'M')]];
      g.font = `600 ${Math.round(13 * k)}px system-ui,sans-serif`; const bw = 150 * k, bh = 26 * k * lines.length + 8 * k, bx = R.x + R.w / 2 - bw / 2, by = R.y + R.h - bh - 14 * k;
      g.fillStyle = 'rgba(10,20,15,0.82)'; g.fillRect(bx, by, bw, bh); g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = k; g.strokeRect(bx, by, bw, bh);
      lines.forEach(([a, b], i) => { const y = by + 4 * k + 26 * k * i + 18 * k; g.fillStyle = '#cfd8dc'; g.textAlign = 'left'; g.fillText(a, bx + 8 * k, y); g.fillStyle = '#fff'; g.font = `700 ${Math.round(16 * k)}px system-ui,sans-serif`; g.textAlign = 'right'; g.fillText(b, bx + bw - 8 * k, y); g.font = `600 ${Math.round(13 * k)}px system-ui,sans-serif`; });
    }
    g.restore();
  }
  // คลิปจบก่อนลูกตก: ค้างภาพสุดท้ายแล้ววาดเส้นต่อจนลูกตก
  function stopOver() { if (live.ot) { cancelAnimationFrame(live.ot); live.ot = 0; } }
  function overtime() {
    const v = live.v, m = live.m, cv = root.querySelector('#ov'); if (!v || !m?.trace?.ok || V.trOff || !cv) return;
    const end = m.trace.path[m.trace.path.length - 1].t, t0 = (dur(v) - m.trace.imp) / (m.slow || 1); if (t0 >= end + 0.4) return;
    let last = performance.now(), t = t0; stopOver();
    const f = now => { t += (now - last) / 1000 * V.speed; last = now; paint(v, cv, m.draw, null, t); if (t < end + 0.4) live.ot = requestAnimationFrame(f); else live.ot = 0; };
    live.ot = requestAnimationFrame(f);
  }
  const sameFrame = (a, b) => { let s = 0; for (let i = 0; i < 3000; i++) { const q = (i * 7919) % a.length; s += Math.abs(a[q] - b[q]); } return s / 3000 < 0.6; };
  async function runTrace(force) {
    const m = live.m, v0 = live.v; if (!m || !v0 || live.trBusy) return;
    const L0 = live, alive = () => live === L0 && V.page === 'swing', el = root.querySelector('#trbody');
    L0.trBusy = true; stopOver();
    const prog = (p, msg) => { if (el && alive()) { el.className = ''; el.innerHTML = `<p class="muted" style="margin:0 0 6px">${ctx.tr(msg)}</p><div class="trbar"><i style="width:${Math.round(p * 100)}%"></i></div>`; } };
    prog(0.02, 'กำลังเตรียม...');
    const vid = document.createElement('video'); vid.muted = true; vid.playsInline = true; vid.preload = 'auto';
    let res;
    try {
      await loadVid(vid, null, v0.src);
      const d = dur(vid), slow = m.slow || 1, Wv = vid.videoWidth, Hv = vid.videoHeight; if (!d || !Wv) throw new Error('video');
      const s = 480 / Math.max(Wv, Hv), W = Math.round(Wv * s), H = Math.round(Hv * s), cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      const g = cv.getContext('2d', { willReadFrequently: true });
      const grab = async t => { vid.currentTime = Math.max(0, Math.min(d - 0.001, t)); await new Promise(r => { let ok = false; const h = () => { if (ok) return; ok = true; vid.removeEventListener('seeked', h); r(); }; vid.addEventListener('seeked', h); setTimeout(h, 2000); });
        g.drawImage(vid, 0, 0, W, H); return Tr.toGray(g.getImageData(0, 0, W, H).data, W, H); };
      const coarse = async () => { const N = Math.min(70, Math.max(12, Math.ceil(d * 14))), cf = [];
        for (let k = 0; k < N; k++) { if (!alive()) return null; cf.push({ g: await grab(d * k / (N - 1)), W, H, t: d * k / (N - 1) }); prog(0.04 + 0.2 * k / N, 'กำลังหาจังหวะตีลูก...'); }
        return Tr.coarseImpact(cf); };
      const fine = async imp => {
        const times = []; for (let r = -0.6; r < -0.16; r += 0.05) times.push(r);
        const dtc = slow > 1 ? Math.max(1 / 30, slow / 120) : 1 / 60; for (let c = imp - 0.16 * slow; c <= imp + 1.6 * slow; c += dtc) times.push((c - imp) / slow);
        const frames = []; let prev = null;
        for (let k = 0; k < times.length; k++) { if (!alive()) return null; const c = imp + times[k] * slow; if (c < 0 || c > d) continue;
          const gr = await grab(c); if (prev && times[k] > -0.16 && sameFrame(prev, gr)) continue;   // เฟรมซ้ำ (คลิป 30 fps แต่ดึงทุก 1/60 วิ)
          frames.push({ g: gr, W, H, t: times[k] }); prev = gr; if (k % 4 === 0) prog(0.25 + 0.65 * k / times.length, 'กำลังตามลูก...'); }
        prog(0.93, 'กำลังคำนวณวิถีลูก...'); await new Promise(r => setTimeout(r, 30));
        const r = Tr.analyze(frames, { club: m.club, carry: userCarry(m.club) }); r.imp = imp + (r.ti || 0) * slow; return r; };
      let imp = m.tags?.imp;
      if (imp != null) res = await fine(imp);
      if (alive() && (imp == null || (res && !res.ok && res.why !== 'fit'))) { const ci = await coarse(); if (ci != null && (imp == null || Math.abs(ci - imp) > 0.05 * slow)) res = await fine(ci); else if (!res) res = { ok: false, why: 'ball' }; }
    } catch (e) { res = { ok: false, why: 'clip' }; }
    L0.trBusy = false; vid.removeAttribute('src'); vid.load?.();
    if (!res || !alive()) return;
    const keep = res.ok ? { ok: true, imp: res.imp, est: res.est, path: res.path, track: res.track, seen: res.seen, n: res.n, rms: +res.rms.toFixed(2), club: m.club, at: Date.now() } : { ok: false, why: res.why, at: Date.now() };
    await updM(x => { x.trace = keep; }); trBody(); paint(live.v, root.querySelector('#ov'), m.draw);
    if (keep.ok) { toast(ctx.tr('🎯 เจอเส้นลูกแล้ว · กด ▶️ ดู')); if (force !== false) { live.v.currentTime = Math.max(0, keep.imp - 0.4 * (m.slow || 1)); } }
  }
  // บันทึกคลิปใหม่ที่มีเส้นลูกฝังอยู่ (เล่นคลิป 1 รอบแล้วอัดจาก canvas)
  async function exportTrace() {
    const m = live.m, v0 = live.v, tr = m?.trace; if (!tr?.ok || !v0 || live.exp) return;
    const Rc = window.MediaRecorder, mime = pickMime(); if (!Rc || !HTMLCanvasElement.prototype.captureStream) return toast('เบราว์เซอร์นี้บันทึกวิดีโอไม่ได้');
    const L0 = live, b = root.querySelector('#trexp'); L0.exp = true; if (b) { b.disabled = true; b.textContent = ctx.tr('⏺ กำลังบันทึก... (เล่นคลิป 1 รอบ)'); }
    const vid = document.createElement('video'); vid.muted = true; vid.playsInline = true; vid.preload = 'auto';
    try {
      await loadVid(vid, null, v0.src); const d = dur(vid), slow = m.slow || 1, sc = Math.min(1, 1080 / Math.max(vid.videoWidth, vid.videoHeight));
      const W = Math.round(vid.videoWidth * sc / 2) * 2, H = Math.round(vid.videoHeight * sc / 2) * 2, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      const g = cv.getContext('2d'), R = { x: 0, y: 0, w: W, h: H }, end = tr.path[tr.path.length - 1].t, k = Math.min(W, H) / 400;
      const draw = t => { g.drawImage(vid, 0, 0, W, H); drawTrace(g, R, tr, t, k, m); };
      vid.currentTime = 0; await new Promise(r => { vid.onseeked = r; setTimeout(r, 1500); }); draw(-1);
      const chunks = [], rec = new Rc(cv.captureStream(30), mime ? { mimeType: mime } : {}); rec.ondataavailable = e => { if (e.data?.size) chunks.push(e.data); };
      const stopped = new Promise(r => { rec.onstop = r; }); rec.start(250);
      await vid.play();
      await new Promise(r => { const f = () => { draw((vid.currentTime - tr.imp) / slow); if (vid.ended || live !== L0) return r(); requestAnimationFrame(f); }; f(); });
      const t0 = (d - tr.imp) / slow, s0 = performance.now();
      await new Promise(r => { const f = () => { const t = t0 + (performance.now() - s0) / 1000; draw(t); if (t > Math.max(end, t0) + 1.5 || live !== L0) return r(); requestAnimationFrame(f); }; f(); });
      rec.stop(); await stopped;
      const type = (rec.mimeType || mime || 'video/webm').split(';')[0], blob = new Blob(chunks, { type }), file = new File([blob], `shot-tracer-${m.club}.${type.includes('mp4') ? 'mp4' : 'webm'}`, { type });
      if (live !== L0) return;
      if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: ctx.tr('เส้นลูก') }); } catch (e) {} }
      else { const a = document.createElement('a'), u = URL.createObjectURL(blob); a.href = u; a.download = file.name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 60000); }
      live.lastExport = blob.size; toast(ctx.tr('บันทึกคลิปพร้อมเส้นแล้ว ✓'));
    } catch (e) { toast('บันทึกคลิปไม่ได้'); }
    L0.exp = false; vid.pause(); vid.removeAttribute('src'); if (live === L0) trBody();
  }

  /* ---------- เทียบ 2 คลิป (ซิงค์ที่ป้าย "กระทบ") ---------- */
  function rCmp() {
    return `<div class="card" style="padding:8px"><div class="cmpw"><div class="cv"><video id="c0" playsinline muted preload="auto"></video><canvas></canvas><small id="l0"></small></div>
      <div class="cv"><video id="c1" playsinline muted preload="auto"></video><canvas></canvas><small id="l1"></small></div></div>
      <input class="rng" type="range" id="cscrub" min="0" max="1000" value="0">
      <div class="vctl"><button data-pa="cstep" data-v="-1">⏮</button><button data-pa="cplay" id="cplayb">▶️</button><button data-pa="cstep" data-v="1">⏭</button><span id="csync" class="muted" style="font-size:12px"></span></div>
      <div class="seg">${[[0.5, '½'], [0.25, '¼'], [0.125, '⅛']].map(([v, l]) => `<button data-pa="cspeed" data-v="${v}" class="${(V.cspeed || 0.25) === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>
    <div class="card"><label class="lb" style="margin-top:0">เทียบกับ</label><select data-pi="cmpwith" id="cmpwith"></select>
      <p class="muted" style="font-size:12px;margin:6px 0 0">เทียบวงวันนี้กับวง ⭐ ต้นแบบของไม้เดียวกัน ดูว่าตำแหน่งขึ้นสุด/กระทบต่างกันตรงไหน</p></div>
    <button class="btn sec full" data-pa="go" data-v="swing">‹ กลับ</button>`;
  }
  async function mountCmp() {
    const L = await SW.list().catch(() => []), a = L.find(m => m.id === V.swId); if (V.page !== 'cmp') return; if (!a) return go('swings');
    const others = L.filter(m => m.id !== a.id); if (!others.length) { toast('ต้องมีอย่างน้อย 2 คลิป'); return go('swing'); }
    const b = others.find(m => m.id === V.cmpId) || others.find(m => m.star && m.club === a.club) || others.find(m => m.club === a.club) || others[0]; V.cmpId = b.id;
    const sel = root.querySelector('#cmpwith'); sel.innerHTML = others.map(m => `<option value="${m.id}" ${m.id === b.id ? 'selected' : ''}>${m.club}${m.star ? ' ⭐' : ''} · ${fmtD(m.t)}</option>`).join('');
    const ms = [a, b], vs = [root.querySelector('#c0'), root.querySelector('#c1')], cvs = root.querySelectorAll('.cv canvas');
    root.querySelector('#l0').textContent = `${a.club} · ${fmtD(a.t)}`; root.querySelector('#l1').textContent = `${b.club}${b.star ? ' ⭐' : ''} · ${fmtD(b.t)}`;
    try { for (let k = 0; k < 2; k++) { const bl = await SW.blob(ms[k].id, ms[k].type); await loadVid(vs[k], bl); } } catch (e) { return toast('เปิดคลิปไม่ได้'); }
    if (V.page !== 'cmp') return;
    const synced = ms.every(m => m.tags?.imp != null), base = ms.map(m => synced ? m.tags.imp : 0), sl = ms.map(m => m.slow || 1);
    // เวลาร่วม (วินาทีจริง เทียบกับจังหวะกระทบ) → เวลาในแต่ละคลิป
    const lo = Math.max(...ms.map((m, k) => -base[k] / sl[k])), hi = Math.min(...ms.map((m, k) => (dur(vs[k]) - base[k]) / sl[k]));
    root.querySelector('#csync').textContent = ctx.tr(synced ? 'ซิงค์ที่จังหวะกระทบ' : 'ยังไม่ได้ติดป้าย "กระทบ" ทั้งสองคลิป · เริ่มจากต้นคลิป');
    let rel = synced ? Math.max(lo, -1.2) : lo; const sc = root.querySelector('#cscrub');
    const set = r => { rel = Math.max(lo, Math.min(hi, r)); vs.forEach((v, k) => { v.currentTime = Math.max(0, base[k] + rel * sl[k]); }); sc.value = Math.round((rel - lo) / ((hi - lo) || 1) * 1000); };
    vs.forEach((v, k) => { const p = () => paint(v, cvs[k], ms[k].draw); v.addEventListener('seeked', p); p(); });
    sc.addEventListener('input', () => { stopPlay(); set(lo + sc.value / 1000 * (hi - lo)); });
    let last = 0; const stopPlay = () => { if (live.playing) { live.playing = false; cancelAnimationFrame(live.raf); root.querySelector('#cplayb').textContent = '▶️'; } };
    const loop = t => { if (!live.playing) return; const dt = last ? (t - last) / 1000 : 0; last = t; if (!vs.some(v => v.seeking)) { set(rel + dt * (V.cspeed || 0.25)); if (rel >= hi) { stopPlay(); return; } } live.raf = requestAnimationFrame(loop); };
    live.cmp = { play() { if (live.playing) return stopPlay(); if (rel >= hi - 0.01) set(lo); live.playing = true; last = 0; root.querySelector('#cplayb').textContent = '⏸'; live.raf = requestAnimationFrame(loop); },
      step(d) { stopPlay(); set(rel + d * FRAME); } };
    set(rel);
  }

  /* ---------- จังหวะสวิง ---------- */
  function tempoList() { return D.tempo.mode === 'short' ? P.TEMPOS_SHORT : P.TEMPOS; }
  function rTempo() {
    const T = D.tempo, L = tempoList(), cur = L[Math.min(T.k, L.length - 1)];
    return `<div class="card"><h2>🥁 จังหวะสวิง</h2>
      <div class="seg"><button data-pa="tmode" data-v="full" class="${T.mode !== 'short' ? 'on' : ''}">เต็มวง 3:1</button><button data-pa="tmode" data-v="short" class="${T.mode === 'short' ? 'on' : ''}">ลูกสั้น/พิทช์ 2:1</button></div>
      <div class="tpre">${L.map((x, k) => `<button data-pa="tk" data-v="${k}" class="${x === cur ? 'on' : ''}"><b>${x[0]}/${x[1]}</b><small>${x[2]}</small><small>${(x[0] / 30).toFixed(2)} + ${(x[1] / 30).toFixed(2)} <span>วิ</span></small></button>`).join('')}</div>
      <label class="lb">พักระหว่างวง</label><div class="seg">${[3, 5, 8].map(v => `<button data-pa="tgap" data-v="${v}" class="${T.gap === v ? 'on' : ''}">${v} วิ</button>`).join('')}</div>
      <svg viewBox="0 0 240 200" class="chart tviz"><circle cx="120" cy="96" r="70" fill="none" stroke="#e0e8e0" stroke-width="2"/><circle cx="120" cy="96" r="7" fill="#1b5e20"/>
        <line id="tclub" x1="120" y1="96" x2="120" y2="176" stroke="#1b5e20" stroke-width="6" stroke-linecap="round"/><text id="tph" x="120" y="196" text-anchor="middle" font-size="15" font-weight="700" fill="#1b5e20"></text></svg>
      <button class="btn full big-btn" id="tgo" data-pa="tgo">▶️ เริ่ม</button>
      <p class="muted" style="font-size:13px;margin:8px 0 0">🔈 <b>ติ๊ก 1</b> <span>เริ่มขึ้นไม้</span> · <b>ติ๊ก 2</b> <span>ขึ้นสุด</span> · <b>ติ๊ก 3</b> <span>กระทบลูก</span> · <span>เปิดเสียงมือถือ / ใส่หูฟังได้</span></p></div>
    <div class="card"><h2>💡 ใช้ยังไง</h2><ul class="plist">
      <li><span>เริ่มจากสวิงเปล่าตามเสียง 10 ครั้ง แล้วค่อยตีลูกจริง</span></li>
      <li><span>โปรส่วนใหญ่ใช้เวลาขึ้น : ลง ≈ 3 : 1 ไม่ว่าจะตีเร็วหรือช้า — สิ่งสำคัญคือ "สัดส่วนเดิมทุกวง"</span></li>
      <li><span>เลือกชุดที่รู้สึกเป็นธรรมชาติที่สุด แล้วใช้ชุดเดียวกันทุกไม้ตั้งแต่เวดจ์ถึงไดรเวอร์</span></li>
      <li><span>ลูกสั้น/พิทช์ใช้ 2:1 · วงสั้นลงแต่จังหวะยังเท่าเดิม</span></li></ul><div id="mytempo"></div></div>
    <button class="btn sec full" data-pa="go" data-v="menu">‹ กลับ</button>`;
  }
  async function mountTempo() {
    try { const L = (await SW.list()).map(m => P.tempoOf(m.tags, m.slow)).filter(Boolean); const el = root.querySelector('#mytempo'); if (!el || !L.length) return;
      const bs = L.reduce((s, x) => s + x.bs, 0) / L.length, r = L.reduce((s, x) => s + x.ratio, 0) / L.length, nt = P.nearestTempo(bs);
      el.innerHTML = `<div class="cn"><span>🎥</span><div>${ctx.tr('จังหวะของคุณจากคลิป')} (${L.length}): <b>${r.toFixed(1)} : 1</b> · ${ctx.tr('ขึ้น')} ${sec(bs)} ${ctx.tr('วิ')}<br><span class="muted">${ctx.tr('ชุดที่ใกล้กับวงของคุณ')}: <b>${nt[0]}/${nt[1]}</b></span></div></div>`; } catch (e) {}
  }
  function tempoToggle() {
    if (live.tempo) { live.tempo = false; (live.ivs || []).forEach(clearInterval); live.ivs = []; cancelAnimationFrame(live.raf); wake(false); setTempoUi(false); return; }
    const c = actx(); if (!c) return toast('เครื่องนี้เล่นเสียงไม่ได้');
    const L = tempoList(), x = L[Math.min(D.tempo.k, L.length - 1)], bs = x[0] / 30, ds = x[1] / 30, gap = D.tempo.gap, reps = [];
    let next = c.currentTime + 0.6; live.tempo = true; wake(true); setTempoUi(true);
    const sched = () => { while (next < c.currentTime + 0.4) { beep(620, 0.09, next); beep(620, 0.09, next + bs); beep(1250, 0.14, next + bs + ds, 0.7); reps.push(next); if (reps.length > 4) reps.shift(); next += bs + ds + gap; } };
    sched(); (live.ivs = live.ivs || []).push(setInterval(sched, 60));
    const line = root.querySelector('#tclub'), ph = root.querySelector('#tph'), A0 = 90, ATOP = 330, AFIN = 200;
    const ang = a => { const r = a * Math.PI / 180; line.setAttribute('x2', 120 + 80 * Math.cos(r)); line.setAttribute('y2', 96 + 80 * Math.sin(r)); };
    const f = () => { if (!live.tempo || !line.isConnected) return; const now = c.currentTime, r0 = [...reps].reverse().find(r => r <= now);
      if (r0 == null) { ang(A0); ph.textContent = ctx.tr('เตรียม...'); }
      else { const t = now - r0, ease = q => 0.5 - Math.cos(Math.PI * q) / 2;
        if (t < bs) { ang(A0 + (ATOP - A0) * ease(t / bs)); ph.textContent = ctx.tr('ขึ้น...'); }
        else if (t < bs + ds) { const q = (t - bs) / ds; ang(ATOP - (ATOP - A0) * q * q); ph.textContent = ctx.tr('ลง!'); }
        else if (t < bs + ds + 0.35) { ang(A0 - (A0 - (AFIN - 360)) * ((t - bs - ds) / 0.35)); ph.textContent = ctx.tr('ลง!'); }
        else { ang(AFIN - 360); ph.textContent = ''; } }
      live.raf = requestAnimationFrame(f); };
    f();
  }
  function setTempoUi(on) { const b = root.querySelector('#tgo'); if (b) { b.textContent = ctx.tr(on ? '⏹ หยุด' : '▶️ เริ่ม'); b.classList.toggle('red', on); } }

  /* ---------- เช็คท่าตั้งสดด้วยกล้องหลัง ---------- */
  const lvTargetLeft = () => (D.hand !== 'L') !== !!D.liveFlip;   // ถนัดขวา + หัวมือถือชี้ไปข้างหน้า → เป้าอยู่ซ้ายจอ
  const height = () => +D.height || 170;
  const shoulder = () => D.shoulderManual && +D.shoulder ? +D.shoulder : Vi.shoulderFromHeight(height());
  const bpWord = bp => bp < 45 ? 'ค่อนเท้าหลัง' : bp <= 55 ? 'กลางเท้า' : bp >= 88 ? 'ส้นเท้าหน้า' : 'ค่อนเท้าหน้า';
  function rLive() {
    const k = V.setupK, { m } = setupOf(k);
    return `<div class="livewrap"><video id="lv" playsinline muted autoplay></video><canvas id="lov"></canvas>
        <div class="lban" id="lban">กำลังเปิดกล้อง...</div><div class="lsub" id="lsub" hidden></div></div>
      <div class="card"><div class="chips" style="padding:0 0 6px">${P.SETUPS.filter(s => s.k !== 'PUTT').map(s => `<button style="width:auto;padding:0 11px;border-radius:16px" class="${s.k === k ? 'cur' : ''}" data-pa="lsetk" data-v="${s.k}">${s.t}</button>`).join('')}</div>
        <label class="lb" style="margin-top:2px"><span>ตำแหน่งลูกที่ต้องการ</span> · <b id="lbpv">${bpWord(m.bp)}</b></label><input class="rng" type="range" min="0" max="100" value="${m.bp}" data-pi="bp">
        <label class="lb"><span>ความกว้างการยืน</span> · <b id="lwv">${Math.round(m.w * 100)}%</b> <span>ของไหล่</span> = <b id="lwcm">${Math.round(m.w * shoulder())}</b> <span>ซม.</span></label><input class="rng" type="range" min="25" max="130" value="${Math.round(m.w * 100)}" data-pi="w">
        <div class="trow"><span><b>ส่วนสูงของคุณ (ซม.)</b><br><span class="muted">ใช้ประมาณความกว้างไหล่และระดับถือมือถือ</span></span><input type="number" inputmode="numeric" data-pi="height" value="${height()}" style="width:84px;text-align:center;font-weight:700"></div>
        <div class="trow"><span><b>ความกว้างไหล่</b><br><span class="muted" id="lshn">${D.shoulderManual ? 'ใส่เอง' : 'ประมาณจากส่วนสูง · แก้เองได้'}</span></span><span style="display:flex;gap:6px;align-items:center">${D.shoulderManual ? '<button class="btn sec" style="padding:6px 9px" data-pa="lshauto" title="คำนวณจากส่วนสูง">↺</button>' : ''}<input type="number" inputmode="numeric" data-pi="shoulder" value="${shoulder()}" style="width:84px;text-align:center;font-weight:700"></span></div>
        <div class="trow"><span><b>📏 เทียบกับตลับเมตร</b><br><span class="muted" id="lcaln"></span></span><span style="display:flex;gap:6px;align-items:center"><input type="number" inputmode="decimal" id="lcalv" placeholder="ซม." style="width:70px;text-align:center"><button class="btn sec" style="padding:8px 10px" data-pa="lcal">เทียบ</button></span></div>
        <div id="ltiltrow" class="trow" hidden><span><b>📐 ตัววัดระดับ</b><br><span class="muted">ต้องอนุญาตให้แอปใช้เซนเซอร์เอียงของมือถือ</span></span><button class="btn sec" style="padding:8px 10px" data-pa="ltilt">เปิด</button></div>
        <div class="trow"><span><b>เสียงเมื่อพอดี</b></span><button class="sw ${D.liveBeep !== false ? 'on' : ''}" data-pa="lbeep"></button></div>
        <div class="trow"><span><b>เป้าอยู่ฝั่งไหนของจอ</b><br><span class="muted">ดูลูกศร "เป้า" บนภาพให้ชี้ไปทางเป้าจริง</span></span><button class="btn sec" style="padding:8px 12px" data-pa="lside">${lvTargetLeft() ? '← ซ้าย' : 'ขวา →'}</button></div>
        <div class="trow"><span><b>ดูสิ่งที่กล้องเห็น</b><br><span class="muted">สีแดง = ส่วนที่แอปคิดว่าไม่ใช่พื้น</span></span><button class="sw ${V.ldbg ? 'on' : ''}" data-pa="ldbg"></button></div></div>
      <div class="card"><h2>📱 ถือมือถือยังไง</h2><ul class="plist">
        <li><span>ยืนท่าตั้งตามปกติ ถือมือถือแนวตั้งระดับอก</span> (<span>สูงจากพื้นประมาณ</span> <b id="lchest">${Vi.chestFromHeight(height())}</b> <span>ซม.</span>) <b>ส่องกล้องหลังลงพื้น</b> <span>ให้หัวมือถือชี้ไปทางลูก</span></li>
        <li><span>ให้เห็น</span> <b>ลูก + ปลายเท้าทั้งสองข้าง</b> <span>ในภาพ ลูกอยู่ด้านบน เท้าอยู่ด้านล่าง</span></li>
        <li><b>ถือให้ขนานพื้น</b> · <span>ดูลูกน้ำมุมขวาบน ให้จุดอยู่ในวงกลางเป็นสีเขียว (เอียงไม่เกิน 8°) แอปจะขึ้นเขียวเฉพาะตอนถือขนานพื้นเท่านั้น</span></li>
        <li><span>ให้กล้องอยู่เหนือจุดกึ่งกลางระหว่างลูกกับปลายเท้า · ใช้กล้องปกติ (1x) · ถือนิ่ง 1-2 วินาที</span></li>
        <li><b>มีลูกในภาพได้หลายลูก</b> · <span>แอปเลือกลูกที่อยู่หน้าเท้าเอง แต่ถ้ากันลูกอื่นออกนอกภาพได้จะชัวร์ที่สุด</span></li>
        <li><span>อย่าให้เงาตัวเองพาดลูก/เท้า · แอปใช้ขนาดลูกกอล์ฟ (4.27 ซม.) เป็นไม้บรรทัด</span></li>
        <li><b>ครั้งแรก</b> · <span>วัดระยะด้านในเท้าจริงด้วยตลับเมตร แล้วกด "เทียบ" แอปจะชดเชยให้ทุกครั้ง</span></li>
        <li><span>ใช้ได้ดีบนพรมหญ้าเขียวหรือหญ้าจริง ลูกสีขาว · ถ้ารองเท้าสีเดียวกับพื้นอาจหาเท้าไม่เจอ</span></li>
        <li><span>เขียว = พอดี · เหลือง = ใกล้แล้ว · แดง = ต้องขยับ · เขียวแล้วค่อยเก็บมือถือ จับไม้ ตีได้เลย</span></li></ul></div>
      <button class="btn sec full" data-pa="go" data-v="setup">‹ กลับ</button>`;
  }
  // ตัววัดระดับ: ใช้เซนเซอร์เอียงของมือถือ (iPhone ต้องกดอนุญาต)
  function askTilt(show) {
    const E = window.DeviceOrientationEvent;
    if (E && typeof E.requestPermission === 'function') E.requestPermission().then(r => { D.tiltPerm = r; save(); if (r === 'granted') { listenTilt(); const row = root.querySelector('#ltiltrow'); if (row) row.hidden = true; } else if (show) toast('ไม่ได้รับอนุญาต · เปิดได้ที่ Settings → Safari → Motion & Orientation Access'); }).catch(() => {});
  }
  function listenTilt() {
    if (live.tiltOn) return; live.tiltOn = true;
    const on = e => { if (e.beta == null || e.gamma == null) return; live.tb = e.beta; live.tg = e.gamma; live.tilt = Vi.tiltOf(e.beta, e.gamma); };
    addEventListener('deviceorientation', on); (live.off = live.off || []).push(() => removeEventListener('deviceorientation', on));
    later(() => { if (live.tilt == null) { const row = root.querySelector('#ltiltrow'); if (row && typeof window.DeviceOrientationEvent?.requestPermission === 'function') row.hidden = false; } }, 2500);
  }
  // เทียบกับตลับเมตร: ระยะด้านในเท้าที่วัดจริง ÷ ที่แอปวัดได้ตอนนี้ = ตัวคูณชดเชย
  function calLabel() { const el = root.querySelector('#lcaln'); if (!el) return; const c = D.calib || 1;
    el.innerHTML = Math.abs(c - 1) < 0.005 ? 'วัดระยะด้านในเท้าจริง ใส่ตัวเลขตอนแอปจับเท้าได้' : `ชดเชยแล้ว ×${c.toFixed(2)} · <a href="#" data-pa="lcalreset">ล้าง</a>`; }
  function calibrate() {
    const v = +root.querySelector('#lcalv')?.value; if (!(v >= 10 && v <= 120)) return toast('ใส่ระยะที่วัดจริง (ซม.) ก่อน');
    if (!live.raw || Date.now() - live.rawT > 1500) return toast('ให้แอปจับลูกและเท้าได้ก่อน แล้วกดเทียบ');
    if (live.tilt != null && live.tilt > Vi.TILT_OK) return toast('ถือมือถือให้ขนานพื้นก่อน แล้วกดเทียบ');
    const f = v / live.raw; if (f < 0.7 || f > 1.4) return toast(`ต่างกันมากเกิน (แอปวัดได้ ${Math.round(live.raw)} ซม.) · ลองถือใหม่ให้ขนานพื้น`);
    D.calib = Math.round(f * 1000) / 1000; save(); calLabel(); toast(`เทียบแล้ว ✓ ชดเชย ×${D.calib.toFixed(2)}`);
  }
  async function mountLive() {
    const v = root.querySelector('#lv'), ban = root.querySelector('#lban');
    if (!navigator.mediaDevices?.getUserMedia) { ban.textContent = 'เบราว์เซอร์นี้เปิดกล้องไม่ได้'; return; }
    let s = null; try { s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }); } catch (e) {}
    if (V.page !== 'live' || !root.contains(v)) { s?.getTracks().forEach(t => t.stop()); return; }
    if (!s) { ban.textContent = 'เปิดกล้องไม่ได้ · กดอนุญาตให้ใช้กล้อง'; return; }
    live.stream = s; v.srcObject = s; v.play?.().catch(() => {}); wake(true); listenTilt(); calLabel();
    const off = document.createElement('canvas'), og = off.getContext('2d', { willReadFrequently: true }), cv = root.querySelector('#lov'), sub = root.querySelector('#lsub');
    const S = { lost: 99, g: 0, beeped: false }, ema = (k, x, a = 0.35) => { S[k] = S[k] == null || S.lost > 8 ? x : S[k] + (x - S[k]) * a; return S[k]; };
    const tick = () => {
      if (!v.videoWidth || !cv.isConnected) return;
      const pw = 160, ph = Math.round(pw * v.videoHeight / v.videoWidth); if (off.width !== pw || off.height !== ph) { off.width = pw; off.height = ph; }
      og.drawImage(v, 0, 0, pw, ph); const img = og.getImageData(0, 0, pw, ph), res = Vi.analyze(img, { expR: Vi.expectedBallR(height(), pw) });
      let mres = null;
      if (res.ball && res.feet) {
        S.lost = Math.min(S.lost, 9);
        const sm = { ball: { x: ema('bx', res.ball.x), y: ema('by', res.ball.y), r: ema('br', res.ball.r, 0.2) },
          feet: { ...res.feet, L: { ...res.feet.L, inner: ema('fl', res.feet.L.inner) }, R: { ...res.feet.R, inner: ema('fr', res.feet.R.inner) } } };
        S.lost = 0; mres = Vi.measure(sm, lvTargetLeft(), setupOf(V.setupK).m, shoulder(), D.calib || 1); res.sm = sm; live.raw = mres.stanceCm / (D.calib || 1); live.rawT = Date.now();
      } else S.lost++;
      drawLive(cv, v, img, res, mres);
      // ข้อความ
      let cls = 'n', txt, st = '';
      if (!res.ball) txt = '🔍 หาลูกไม่เจอ · ให้เห็นลูกสีขาวบนพื้นชัดๆ';
      else if (!res.feet) txt = res.ball.size > 1.6 ? '⬆️ ยกมือถือสูงขึ้น ให้เห็นเท้าทั้งสองข้างใต้ลูก' : '🔍 หาเท้าไม่เจอ · ให้เห็นปลายเท้าทั้งสองข้างใต้ลูก';
      else { const lv = Vi.level(mres.errCm, ...Vi.BALL_TOL), cm = Math.abs(mres.errCm).toFixed(mres.errCm > -10 && mres.errCm < 10 ? 1 : 0); cls = lv;
        txt = lv === 'g' ? '✅ ตำแหน่งลูกพอดี' : `${lv === 'y' ? '🟡' : '🔴'} ขยับลูกไปทาง${mres.errCm < 0 ? 'เท้าหน้า' : 'เท้าหลัง'} ${cm} ซม.`;
        const wl = Vi.level(mres.wErr, ...Vi.STANCE_TOL), dcm = Math.abs(mres.stanceCm - mres.wantCm).toFixed(0);
        st = `<i class="lv-${wl}"></i>${wl === 'g' ? 'ความกว้างการยืนพอดี' : mres.stanceCm < mres.wantCm ? `ยืนแคบไป ${dcm} ซม.` : `ยืนกว้างไป ${dcm} ซม.`} <small>(${Math.round(mres.stanceCm)} / ${Math.round(mres.wantCm)} ซม.)</small>`
          + (res.ball.r * 2 < 6 || res.ball.size < 0.5 ? '<br><small>⬇️ ลดมือถือลงอีกนิด ลูกในภาพเล็กไป ตัวเลขจะแม่นขึ้น</small>' : '');
        const tilt = live.tilt;
        if (tilt != null && tilt > Vi.TILT_OK) {   // มือถือเอียง → ตัวเลขไม่น่าเชื่อ ยังไม่ให้เขียว
          st = `<small>${lv === 'g' ? 'ลูกดูพอดีแล้ว' : `ลูก: ขยับไปทาง${mres.errCm < 0 ? 'เท้าหน้า' : 'เท้าหลัง'} ${cm} ซม.`} · ${wl === 'g' ? 'ยืนกว้างพอดี' : `ยืน ${Math.round(mres.stanceCm)} / ${Math.round(mres.wantCm)} ซม.`}</small>`;
          cls = tilt > Vi.TILT_BAD ? 'r' : 'y'; txt = `📐 ถือมือถือให้ขนานพื้น · เอียง ${Math.round(tilt)}°`; S.g = 0;
        } else if (lv === 'g' && wl !== 'r') { S.g++; if (S.g === 4 && !S.beeped && D.liveBeep !== false) { S.beeped = true; beep(1046, 0.12); setTimeout(() => beep(1568, 0.16), 130); try { navigator.vibrate?.(60); } catch (e) {} } }
        else { S.g = 0; if (lv === 'r') S.beeped = false; } }
      ban.className = 'lban lb-' + cls; ban.textContent = txt; sub.hidden = !st; sub.innerHTML = st;
    };
    (live.ivs = live.ivs || []).push(setInterval(tick, 110));
  }
  function drawLive(cv, v, img, res, mm) {
    const r0 = cv.getBoundingClientRect(), dpr = devicePixelRatio || 1; if (cv.width !== Math.round(r0.width * dpr)) { cv.width = Math.round(r0.width * dpr); cv.height = Math.round(r0.height * dpr); }
    const g = cv.getContext('2d'), W = cv.width, H = cv.height, pw = img.width, ph = img.height, sc = Math.min(W / pw, H / ph), ox = (W - pw * sc) / 2, oy = (H - ph * sc) / 2;
    const X = x => ox + x * sc, Y = y => oy + y * sc, COL = { g: '#43a047', y: '#fdd835', r: '#e53935' };
    g.clearRect(0, 0, W, H);
    if (V.ldbg && res.fg) { const md = new ImageData(pw, ph); for (let p = 0; p < pw * ph; p++) if (res.fg[p]) { md.data[p * 4] = 255; md.data[p * 4 + 3] = 110; }
      const t = document.createElement('canvas'); t.width = pw; t.height = ph; t.getContext('2d').putImageData(md, 0, 0); g.imageSmoothingEnabled = false; g.drawImage(t, ox, oy, pw * sc, ph * sc); }
    const tl = lvTargetLeft(); g.font = `700 ${14 * dpr}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    const lab = (t, x, y, bg = '#000000b0') => { const w = g.measureText(t).width + 14 * dpr, h = 24 * dpr; x = Math.max(w / 2 + 4, Math.min(W - w / 2 - 4, x));
      g.fillStyle = bg; g.beginPath(); g.roundRect ? g.roundRect(x - w / 2, y - h / 2, w, h, 8 * dpr) : g.rect(x - w / 2, y - h / 2, w, h); g.fill(); g.fillStyle = '#fff'; g.fillText(t, x, y + dpr); };
    lab(tl ? '← เป้า' : 'เป้า →', tl ? 0 : W, 78 * dpr, '#1b5e20e0');
    const B = res.sm?.ball || res.ball, F = res.sm?.feet || res.feet;
    if (F) { [['L', F.L.inner], ['R', F.R.inner]].forEach(([s2, x]) => { g.strokeStyle = '#fff'; g.lineWidth = 3 * dpr; g.setLineDash([]); g.beginPath(); g.moveTo(X(x), Y(F.toe)); g.lineTo(X(x), Y(F.y1)); g.stroke();
      lab((s2 === 'L') === tl ? 'เท้าหน้า' : 'เท้าหลัง', X(x), Y(F.toe) - 16 * dpr); }); }
    if (B && mm) {
      const y = Y(B.y) + Math.max(B.r * sc * 2.4, 16 * dpr), half = 6 * dpr, zone = (a, b, c) => { g.fillStyle = c; g.fillRect(Math.min(X(a), X(b)), y - half, Math.abs(X(b) - X(a)), half * 2); };
      const lo = Math.min(mm.front, mm.back), hi = Math.max(mm.front, mm.back);
      zone(lo, hi, '#e53935cc'); zone(mm.tx - Vi.BALL_TOL[1] * mm.pxcm, mm.tx + Vi.BALL_TOL[1] * mm.pxcm, '#fdd835dd'); zone(mm.tx - Vi.BALL_TOL[0] * mm.pxcm, mm.tx + Vi.BALL_TOL[0] * mm.pxcm, '#43a047ee');
      g.strokeStyle = '#fff'; g.lineWidth = 2 * dpr; g.beginPath(); g.moveTo(X(mm.tx), y - half - 6 * dpr); g.lineTo(X(mm.tx), y + half + 6 * dpr); g.stroke();
    }
    if (live.tilt != null) {   // ลูกน้ำวัดระดับ (มุมขวาบน ใต้แถบข้อความ)
      const cx = W - 40 * dpr, cy = 92 * dpr, R0 = 24 * dpr, t = live.tilt, col = t <= Vi.TILT_OK ? '#43a047' : t <= Vi.TILT_BAD ? '#fdd835' : '#e53935';
      const k = Math.min(1, t / 25) / Math.max(1e-6, Math.hypot(live.tg || 0, live.tb || 0)), bx = cx - (live.tg || 0) * k * R0, by = cy - (live.tb || 0) * k * R0;
      g.fillStyle = '#000000a0'; g.beginPath(); g.arc(cx, cy, R0 + 4 * dpr, 0, 7); g.fill();
      g.strokeStyle = '#ffffff90'; g.lineWidth = 1.5 * dpr; g.beginPath(); g.arc(cx, cy, R0 * Vi.TILT_OK / 25, 0, 7); g.moveTo(cx - R0, cy); g.lineTo(cx + R0, cy); g.moveTo(cx, cy - R0); g.lineTo(cx, cy + R0); g.stroke();
      g.fillStyle = col; g.beginPath(); g.arc(isFinite(bx) ? bx : cx, isFinite(by) ? by : cy, 7 * dpr, 0, 7); g.fill();
      g.fillStyle = '#fff'; g.font = `700 ${12 * dpr}px sans-serif`; g.fillText(Math.round(t) + '°', cx, cy + R0 + 14 * dpr);
    }
    if (B) { const lv = mm ? Vi.level(mm.errCm, ...Vi.BALL_TOL) : null; g.strokeStyle = lv ? COL[lv] : '#fff'; g.lineWidth = 4 * dpr; g.setLineDash(lv ? [] : [5 * dpr, 4 * dpr]);
      g.beginPath(); g.arc(X(B.x), Y(B.y), Math.max(B.r * sc * 1.6, 12 * dpr), 0, 7); g.stroke(); g.setLineDash([]); }
  }

  /* ---------- render + events ---------- */
  const PAGES = { menu: [rMenu, mountMenu], rounds: [rRounds], rform: [rRform], plan: [rPlan], range: [rRange], bag: [rBag], setup: [rSetup], live: [rLive, mountLive], cam: [rCam, mountCam], swings: [rSwings, mountSwings], swing: [rSwing, mountSwing], cmp: [rCmp, mountCmp], tempo: [rTempo, mountTempo] };
  function render() { stopAll(); const [r, m] = PAGES[V.page] || PAGES.menu; root.innerHTML = r(); if (m) m(); }

  async function onClick(e) {
    const t = e.target.closest('[data-pa]'); if (!t || !root.contains(t)) return;
    const a = t.dataset.pa, v = t.dataset.v;
    switch (a) {
      case 'go': if (v === 'live') askTilt(); go(v); return;
      case 'ltilt': askTilt(true); return;
      case 'lcal': calibrate(); return;
      case 'lcalreset': e.preventDefault(); D.calib = 1; save(); calLabel(); return;
      case 'unit': D.unit = v; save(); V.dist = {}; render(); return;
      case 'rholes': V.rfHoles = +v; { const F = saveForm(); delete F.par; delete F.fwN; } render(); return;
      case 'rsave': saveRound(); return;
      case 'rdel': if (await ask('ลบรอบนี้?')) { D.rounds = D.rounds.filter(r => r.id !== v); save(); render(); } return;
      case 'rimport': importGolfLive(); return;
      case 'drill': drillDlg(v); return;
      case 'mins': V.mins = +v; render(); return;
      case 'club': V.club = v; render(); return;
      case 'sw': V.sw = v; render(); return;
      case 'usedist': D.useDist = !D.useDist; save(); render(); return;
      case 'dd': { const i = root.querySelector('#pdist'); const n = Math.max(1, (+i.value || distVal()) + +v); i.value = n; V.dist[curKey()] = n; return; }
      case 'hit': hit(t.dataset.q, t.dataset.dir); return;
      case 'undo': { const s = curSession(), k = curKey(); for (let j = D.balls.length - 1; j >= 0; j--) if (D.balls[j].s === s && P.keyOf(D.balls[j]) === k) { D.balls.splice(j, 1); break; } save(); render(); return; }
      case 'endsess': { const s = curSession(); D.cur = null; save(); if (s) { const n = D.balls.filter(b => b.s === s).length; toast(ctx.tr('จบเซสชัน') + ` · ${n} ` + ctx.tr('ลูก')); } go('bag'); return; }
      case 'editbag': editBag(); return;
      case 'trendk': V.trendK = v; render(); return;
      case 'delsess': if (await ask('ลบเซสชันนี้?')) { D.balls = D.balls.filter(b => b.s !== +v); if (D.cur?.s === +v) D.cur = null; save(); render(); } return;
      case 'setupof': V.setupK = P.setupKey(v); go('setup'); return;
      case 'setk': V.setupK = v; render(); return;
      case 'lsetk': { V.setupK = v; const { m } = setupOf(v); root.querySelectorAll('[data-pa=lsetk]').forEach(b => b.classList.toggle('cur', b.dataset.v === v));
        root.querySelector('[data-pi=bp]').value = m.bp; root.querySelector('[data-pi=w]').value = Math.round(m.w * 100); liveLabels(); return; }
      case 'lbeep': D.liveBeep = D.liveBeep === false; save(); t.classList.toggle('on', D.liveBeep !== false); return;
      case 'ldbg': V.ldbg = !V.ldbg; t.classList.toggle('on', V.ldbg); return;
      case 'lshauto': D.shoulderManual = false; save(); render(); return;
      case 'lside': D.liveFlip = !D.liveFlip; save(); t.textContent = lvTargetLeft() ? '← ซ้าย' : 'ขวา →'; return;
      case 'hand': D.hand = v; save(); render(); return;
      case 'setreset': { const n = D.setup[V.setupK]?.note; D.setup[V.setupK] = n ? { note: n } : {}; save(); render(); return; }
      case 'camview': V.cam.view = v; root.querySelectorAll('[data-pa=camview]').forEach(b => b.classList.toggle('on', b.dataset.v === v)); return;
      case 'camcd': V.cam.cd = +v; root.querySelectorAll('[data-pa=camcd]').forEach(b => b.classList.toggle('on', b.dataset.v === v)); return;
      case 'camlen': V.cam.len = +v; root.querySelectorAll('[data-pa=camlen]').forEach(b => b.classList.toggle('on', b.dataset.v === v)); return;
      case 'camauto': V.cam.auto = !V.cam.auto; t.classList.toggle('on', V.cam.auto); return;
      case 'camgrid': V.cam.grid = !V.cam.grid; t.classList.toggle('on', V.cam.grid); drawGrid(root.querySelector('#pgrid'), V.cam.grid); return;
      case 'flip': V.cam.facing = V.cam.facing === 'user' ? 'environment' : 'user'; go('cam'); return;
      case 'rec': startRec(); return;
      case 'swf': V.swFilter = v; mountSwings(); return;
      case 'openswing': go('swing', { swId: v }); return;
      case 'play': { const vd = live.v; if (!vd) return; if (vd.paused) { if (vd.ended || vd.currentTime >= dur(vd) - 0.02) vd.currentTime = 0; vd.playbackRate = V.speed; vd.play().catch(() => {}); } else vd.pause(); return; }
      case 'step': { const vd = live.v; if (!vd) return; vd.pause(); vd.currentTime = Math.max(0, Math.min(dur(vd), vd.currentTime + +v * FRAME)); return; }
      case 'speed': V.speed = +v; if (live.v) live.v.playbackRate = V.speed; root.querySelectorAll('[data-pa=speed]').forEach(b => b.classList.toggle('on', b.dataset.v === v)); return;
      case 'tag': { const vd = live.v, m = live.m; if (!vd || !m) return; const now = vd.currentTime, old = m.tags?.[v];
        vd.pause();
        if (old != null && Math.abs(old - now) < FRAME / 2) { if (await ask(ctx.tr('ลบป้าย') + ' "' + ctx.tr(TAGS.find(x => x[0] === v)[1]) + '"?')) await updM(x => { delete x.tags[v]; if (v === 'imp') x.autoImp = false; }); }
        else await updM(x => { x.tags = { ...(x.tags || {}), [v]: Math.round(now * 1000) / 1000 }; if (v === 'imp') x.autoImp = false; });
        showTags(); return; }
      case 'jump': { const vd = live.v, x = live.m?.tags?.[v]; if (!vd || x == null) return; vd.pause(); vd.currentTime = x; return; }
      case 'tool': { V.tool = v; root.querySelectorAll('[data-pa=tool]').forEach(b => b.classList.toggle('on', b.dataset.v === v)); const cv = root.querySelector('#ov'); if (cv) { cv.style.pointerEvents = v === 'view' ? 'none' : 'auto'; if (v !== 'view') cv.scrollIntoView({ block: 'center' }); } return; }
      case 'trrun': runTrace(); return;
      case 'trdtl': await updM(x => { x.view = 'dtl'; delete x.trace; }); runTrace(); return;
      case 'trshow': V.trOff = !V.trOff; stopOver(); trBody(); if (live.v) paint(live.v, root.querySelector('#ov'), live.m?.draw); return;
      case 'trexp': exportTrace(); return;
      case 'clrdraw': await updM(x => { x.draw = []; }); if (live.v) paint(live.v, root.querySelector('#ov'), []); return;
      case 'star': await updM(x => { x.star = !x.star; }); t.textContent = live.m.star ? '⭐' : '☆'; toast(live.m.star ? '⭐ ตั้งเป็นวงต้นแบบของไม้นี้' : 'เอาดาวออกแล้ว'); return;
      case 'delswing': if (await ask('ลบคลิปนี้?')) { await SW.del(V.swId); go('swings'); } return;
      case 'cmp': go('cmp'); return;
      case 'cplay': live.cmp?.play(); return;
      case 'cstep': live.cmp?.step(+v); return;
      case 'cspeed': V.cspeed = +v; root.querySelectorAll('[data-pa=cspeed]').forEach(b => b.classList.toggle('on', b.dataset.v === v)); return;
      case 'tmode': D.tempo.mode = v; D.tempo.k = 1; save(); if (live.tempo) tempoToggle(); render(); return;
      case 'tk': D.tempo.k = +v; save(); if (live.tempo) tempoToggle(); render(); return;
      case 'tgap': D.tempo.gap = +v; save(); if (live.tempo) tempoToggle(); render(); return;
      case 'tgo': tempoToggle(); return;
    }
  }
  function liveLabels() { const { m } = setupOf(V.setupK), q = id => root.querySelector(id); if (!q('#lbpv')) return;
    q('#lbpv').textContent = bpWord(m.bp); q('#lwv').textContent = Math.round(m.w * 100) + '%'; q('#lwcm').textContent = Math.round(m.w * shoulder()); }
  function onInput(e) {
    const t = e.target, k = t.dataset?.pi; if (!k || !root.contains(t)) return;
    if (k === 'bp' || k === 'w' || k === 'wt') {
      const s = (D.setup[V.setupK] = D.setup[V.setupK] || {}); s[k] = k === 'w' ? +t.value / 100 : +t.value;
      if (V.page === 'live') { if (e.type === 'change') save(); liveLabels(); return; }   // หน้ากล้อง: ไม่วาดหน้าใหม่ (กล้องจะดับ)
      if (e.type === 'change') { save(); render(); return; }
      const { d, m } = setupOf(V.setupK); root.querySelector('#stsvg').innerHTML = stanceSvg(d, m, D.hand); return;
    }
    if (k === 'shoulder') { const n = +t.value; if (n >= 25 && n <= 70) { D.shoulder = n; D.shoulderManual = true; if (e.type === 'change') { save(); const h = root.querySelector('#lshn'); if (h) h.textContent = 'ใส่เอง'; } liveLabels(); } return; }
    if (k === 'height') { const n = +t.value; if (n >= 120 && n <= 220) { D.height = n; if (e.type === 'change') save();
      if (!D.shoulderManual) { const si = root.querySelector('[data-pi=shoulder]'); if (si) si.value = shoulder(); }
      const c = root.querySelector('#lchest'); if (c) c.textContent = Vi.chestFromHeight(n); liveLabels(); } return; }
    if (e.type !== 'change') return;
    if (k === 'note') { (D.setup[V.setupK] = D.setup[V.setupK] || {}).note = t.value.trim(); save(); toast('บันทึกแล้ว ✓'); }
    if (k === 'camclub') V.club = t.value;
    if (k === 'swclub') updM(x => { x.club = t.value; }).then(() => { root.querySelector('#swh').textContent = `${t.value} · ${fmtD(live.m.t)}`; if (live.m.trace?.ok) toast(ctx.tr('เปลี่ยนไม้แล้ว · กด 🔁 หาใหม่ เพื่อคำนวณเส้นลูกตามไม้นี้')); });
    if (k === 'swslow') updM(x => { x.slow = +t.value; if (x.trace) delete x.trace; }).then(() => { showTags(); trBody(); if (live.m.view === 'dtl') runTrace(); });
    if (k === 'swnote') updM(x => { x.note = t.value.trim(); });
    if (k === 'cmpwith') { V.cmpId = t.value; go('cmp'); }
  }
  root.addEventListener('click', onClick); root.addEventListener('input', onInput); root.addEventListener('change', onInput);
  function destroy() { stopAll(); root.removeEventListener('click', onClick); root.removeEventListener('input', onInput); root.removeEventListener('change', onInput); }
  return { render, back, destroy, get page() { return V.page; } };
}
