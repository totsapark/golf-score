// คำนวณสกอร์ / เงิน / สถิติ จากข้อมูลแก๊ง (G) — ไม่มีการแตะ UI หรือฐานข้อมูล
export const PEN = [['lost', '🌳', 'ป่า/หาย', 1], ['water', '💧', 'ตกน้ำ', 1], ['ob', '🚫', 'OB', 1], ['bunker', '🏖️', 'บังเกอร์', 0]];
export const DIST = [['Eagle+', '#b71c1c', '#fff'], ['Birdie', '#e57373', '#1c2b1c'], ['Par', '#cfd8dc', '#1c2b1c'], ['Bogey', '#90caf9', '#1c2b1c'], ['Double', '#42a5f5', '#1c2b1c'], ['Triple+', '#1565c0', '#fff']];
export const hk = i => 'h' + i;

export function nHoles(G) { return +G.meta?.holes || 18; }
export function players(G) { return Object.entries(G.players || {}).map(([id, p]) => ({ id, ...p })).sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0)); }
export function par(G, i) { return +(G.holes?.[hk(i)]?.par) || 4; }
export function si(G, i) { return +(G.holes?.[hk(i)]?.si) || 0; }
export function totalPar(G) { let t = 0; for (let i = 0; i < nHoles(G); i++) t += par(G, i); return t; }
export function ent(G, pid, i) { return G.scores?.[pid]?.[hk(i)] || null; }
export function penOf(e) { return e ? (e.lost || 0) + (e.water || 0) + (e.ob || 0) : 0; }
export function score(G, pid, i) { const e = ent(G, pid, i); return e && e.on != null && e.putt != null ? e.on + e.putt + penOf(e) : null; }
export function gir(G, pid, i) { const e = ent(G, pid, i); return !!(e && e.on != null && e.on + penOf(e) <= par(G, i) - 2); }
export function hasHC(G) { return players(G).some(p => +p.hc); }
function hcOrder(G) { const a = []; for (let i = 0; i < nHoles(G); i++) a.push(i); return a.sort((x, y) => (si(G, x) || 99) - (si(G, y) || 99) || x - y); }
export function hStrokes(G, pid, i) {
  const hc = Math.max(0, Math.min(54, Math.round(+G.players?.[pid]?.hc || 0))); if (!hc) return 0;
  const N = nHoles(G), rank = hcOrder(G).indexOf(i) + 1; return Math.floor(hc / N) + (rank <= hc % N ? 1 : 0);
}
export function net(G, pid, i) { const s = score(G, pid, i); return s == null ? null : s - hStrokes(G, pid, i); }
export function metric(G, pid, i) { return G.meta?.moneyBy === 'net' && hasHC(G) ? net(G, pid, i) : score(G, pid, i); }
export function holeDone(G, i) { const ps = players(G); return ps.length > 0 && ps.every(p => score(G, p.id, i) != null); }
export function thru(G, pid) { let c = 0; for (let i = 0; i < nHoles(G); i++) if (score(G, pid, i) != null) c++; return c; }
export function label(sc, p) {
  if (sc == null) return ['', '']; if (sc === 1) return ['Hole in One!', 'b-eagle']; const d = sc - p;
  return d <= -3 ? ['Albatross', 'b-eagle'] : d === -2 ? ['Eagle', 'b-eagle'] : d === -1 ? ['Birdie', 'b-birdie'] : d === 0 ? ['Par', 'b-par'] : d === 1 ? ['Bogey', 'b-bogey'] : d === 2 ? ['Double', 'b-dbl'] : ['+' + d, 'b-worse'];
}
export function fd(d) { if (d == null || isNaN(d)) return '-'; const r = Math.round(d * 10) / 10; return r === 0 ? 'E' : (r > 0 ? '+' : '') + r; }
export function pc(a, b) { return b ? Math.round(a / b * 100) + '%' : '-'; }
export function av(a, b, dp = 1) { return b ? (a / b).toFixed(dp) : '-'; }
// เปิด/ปิดกินตัง (ค่าเริ่มต้น: เปิด)
export function moneyOn(G) { return G.meta?.money !== false; }
export function amounts(G) { const a = G.meta?.amounts || [30, 20, 10]; return [0, 1, 2].map(k => +a[k] || 0); }

function hsh(s) { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }
// เรียงอันดับของหลุม (ใช้กติกาเสมอ: all = เสมอเสียทุกคน, putt = ตัดด้วยพัตต์, one = สุ่มคงที่ 1 คน)
export function holeOrder(G, i) {
  const t = G.meta?.tieRule || 'all', code = G.meta?.code || '';
  return players(G).map(p => {
    const sc = metric(G, p.id, i), pt = ent(G, p.id, i)?.putt ?? 0;
    return { id: p.id, sc, k: t === 'putt' ? sc + '|' + pt : t === 'one' ? p.id : String(sc), t: t === 'putt' ? pt : t === 'one' ? hsh(code + i + p.id) : 0 };
  }).filter(x => x.sc != null).sort((a, b) => a.sc - b.sc || a.t - b.t);
}
// สุ่ม 3 อันดับ (ไม่ซ้ำ) จาก 1..n
export function makePicks(n) {
  const k = Math.min(3, n), arr = Array.from({ length: n }, (_, j) => j + 1), out = [];
  const rnd = m => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % m; };
  for (let j = 0; j < k; j++) out.push(arr.splice(rnd(arr.length), 1)[0]);
  return out;
}
// เงินของหลุม: picks[k] = อันดับที่สุ่มได้ครั้งที่ k → จ่าย amounts[k] (คนเดียวโดนหลายครั้ง จ่ายยอดสูงสุดครั้งเดียว)
export function holeMoney(G, i) {
  const res = { pay: {}, hits: [], done: holeDone(G, i), picks: moneyOn(G) ? G.draws?.[hk(i)]?.picks || null : null };
  if (!res.done || !res.picks) return res;
  const ord = holeOrder(G, i), am = amounts(G);
  res.picks.forEach((r, k) => {
    if (r > ord.length) return;
    const key = ord[r - 1].k, who = ord.filter(y => y.k === key).map(y => y.id);
    res.hits.push({ rank: r, amount: am[k], who });
    who.forEach(id => { res.pay[id] = Math.max(res.pay[id] || 0, am[k]); });
  });
  return res;
}

export function stats(G, pid) {
  let gross = 0, pr = 0, putts = 0, n = 0, g = 0, st = 0, l = 0, r = 0, money = 0, ags = 0, nt = 0;
  const N = nHoles(G);
  for (let i = 0; i < N; i++) {
    const sc = score(G, pid, i), e = ent(G, pid, i);
    if (sc != null) { gross += sc; pr += par(G, i); putts += e.putt; n++; nt += net(G, pid, i); if (gir(G, pid, i)) g++; ags += Math.min(sc, par(G, i) + 5); }
    if (e?.tee === 's') st++; if (e?.tee === 'l') l++; if (e?.tee === 'r') r++;
    money += holeMoney(G, i).pay[pid] || 0;
  }
  const tp = totalPar(G), cr0 = +G.meta?.cr, sl = +G.meta?.slope || 113;
  let hcp = null, ch = null;
  if (n) {
    const cr = cr0 ? cr0 * pr / tp : pr;
    let d = (113 / sl) * (ags - cr) * (18 / n); d = Math.max(-10, Math.min(54, d)); hcp = Math.round(d * 10) / 10;
    ch = Math.round(hcp * (N == 9 ? 0.5 : 1) * sl / 113 + ((cr0 || tp) - tp));
  }
  return { gross, par: pr, putts, n, g, st, l, r, money, hcp, ch, net: nt };
}
export function more(G, pid) {
  const o = { dist: [0, 0, 0, 0, 0, 0], pt: { 3: [0, 0, 0], 4: [0, 0, 0], 5: [0, 0, 0] }, out: [0, 0, 0], inn: [0, 0, 0], one: 0, three: 0, chip: 0, gPutt: 0,
    scrO: 0, scrN: 0, bbO: 0, bbN: 0, fw: { n: 0, hit: 0, hitD: 0, missD: 0 }, best: null, worst: null, streak: 0, hits: 0,
    lost: 0, water: 0, ob: 0, bunker: 0, pen: 0, sandN: 0, sandO: 0 };
  let cur = 0, prevBad = false;
  for (let i = 0; i < nHoles(G); i++) {
    if (holeMoney(G, i).pay[pid]) o.hits++;
    const e = ent(G, pid, i);
    if (e) { o.lost += e.lost || 0; o.water += e.water || 0; o.ob += e.ob || 0; o.bunker += e.bunker || 0; o.pen += penOf(e); }
    const sc = score(G, pid, i); if (sc == null) { cur = 0; prevBad = false; continue; }
    const p = par(G, i), d = sc - p;
    o.dist[d <= -2 ? 0 : d === -1 ? 1 : d === 0 ? 2 : d === 1 ? 3 : d === 2 ? 4 : 5]++;
    const b = o.pt[p >= 5 ? 5 : p]; b[0]++; b[1] += sc; b[2] += p;
    const hf = i < 9 ? o.out : o.inn; hf[0]++; hf[1] += sc; hf[2] += p;
    if (e.putt === 1) o.one++; if (e.putt >= 3) o.three++; if (e.putt === 0) o.chip++;
    if (gir(G, pid, i)) o.gPutt += e.putt; else { o.scrN++; if (d <= 0) o.scrO++; }
    if (e.bunker) { o.sandN++; if (d <= 0) o.sandO++; }
    if (prevBad) { o.bbN++; if (d <= 0) o.bbO++; } prevBad = d >= 1;
    if (p >= 4 && e.tee) { o.fw.n++; if (e.tee === 's') { o.fw.hit++; o.fw.hitD += d; } else o.fw.missD += d; }
    cur = d <= 0 ? cur + 1 : 0; o.streak = Math.max(o.streak, cur);
    if (!o.best || d < o.best.d) o.best = { i, d, sc }; if (!o.worst || d > o.worst.d) o.worst = { i, d, sc };
  }
  return o;
}
export function awards(G, list) {
  const L = list.filter(x => x.s.n > 0), A = [];
  function pick(icon, title, val, fmt, better, cond) {
    const c = L.filter(x => cond ? cond(x) : true); if (!c.length) return;
    const vals = c.map(val), bv = better === 'min' ? Math.min(...vals) : Math.max(...vals);
    A.push({ icon, title, names: c.filter((x, k) => vals[k] === bv).map(x => x.p.name), v: fmt(bv) });
  }
  pick('🏆', 'แชมป์ Gross', x => x.s.gross - x.s.par, v => fd(v), 'min');
  if (hasHC(G)) pick('🥇', 'แชมป์ Net', x => x.s.net - x.s.par, v => fd(v), 'min');
  pick('🎯', 'ราชาพัตต์', x => x.s.putts / x.s.n, v => v.toFixed(2) + ' พัตต์/หลุม', 'min');
  pick('🟢', 'เทพ GIR', x => x.s.g / x.s.n, v => Math.round(v * 100) + '%', 'max', x => x.s.g > 0);
  pick('🏌️', 'ไดรฟ์ตรงสุด', x => x.m.fw.hit / x.m.fw.n, v => Math.round(v * 100) + '% ลงแฟร์เวย์', 'max', x => x.m.fw.n > 0 && x.m.fw.hit > 0);
  pick('🐦', 'นักล่าเบอร์ดี้', x => x.m.dist[0] + x.m.dist[1], v => v + ' หลุม', 'max', x => x.m.dist[0] + x.m.dist[1] > 0);
  pick('🔥', 'ฟอร์มนิ่งสุด', x => x.m.streak, v => 'พาร์หรือดีกว่าติดกัน ' + v + ' หลุม', 'max', x => x.m.streak >= 2);
  pick('🛟', 'สายเซฟพาร์', x => x.m.scrO / x.m.scrN, v => 'Scrambling ' + Math.round(v * 100) + '%', 'max', x => x.m.scrN > 0 && x.m.scrO > 0);
  pick('🌳', 'นักสำรวจป่า', x => x.m.lost, v => 'หาลูกไม่เจอ ' + v + ' ครั้ง', 'max', x => x.m.lost > 0);
  pick('💧', 'นักดำน้ำ', x => x.m.water, v => 'ตกน้ำ ' + v + ' ครั้ง', 'max', x => x.m.water > 0);
  pick('🚫', 'ราชา OB', x => x.m.ob, v => 'OB ' + v + ' ครั้ง', 'max', x => x.m.ob > 0);
  pick('🏖️', 'ขาประจำบังเกอร์', x => x.m.bunker, v => v + ' ครั้ง', 'max', x => x.m.bunker > 0);
  pick('🎲', 'ดวงซวยประจำก๊วน', x => x.m.hits, v => 'โดนสุ่ม ' + v + ' หลุม', 'max', x => x.m.hits > 0);
  pick('💸', 'ATM ประจำก๊วน', x => x.s.money, v => v + ' บาท', 'max', x => x.s.money > 0);
  return A;
}

// WHS Handicap Index: จำนวนรอบ → ใช้กี่รอบที่ดีที่สุด, ปรับค่า
const WHS = [[3, 1, -2], [4, 1, -1], [5, 1, 0], [6, 2, -1], [8, 2, 0], [11, 3, 0], [14, 4, 0], [16, 5, 0], [18, 6, 0], [19, 7, 0], [20, 8, 0]];
export function hIndex(diffs) {
  const d = diffs.slice(-20), n = d.length; if (n < 3) return null;
  const row = WHS.find(r => n <= r[0]), best = [...d].sort((a, b) => a - b).slice(0, row[1]);
  return Math.round((best.reduce((a, b) => a + b, 0) / best.length + row[2]) * 10) / 10;
}

// ระยะทางบนพื้นโลก (เมตร)
export function dist(a, b) {
  if (!a || !b) return null;
  const R = 6371000, t = Math.PI / 180, dLat = (b[0] - a[0]) * t, dLng = (b[1] - a[1]) * t;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * t) * Math.cos(b[0] * t) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
