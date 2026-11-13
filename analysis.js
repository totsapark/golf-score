// วิเคราะห์ฟอร์มหลังจบรอบ — คำนวณล้วน ไม่แตะหน้าจอหรือฐานข้อมูล
import { nHoles, par, ent, score, gir, penOf, players, dist, hk } from './golf.js';

// ค่าเฉลี่ยโดยประมาณของนักกอล์ฟสมัครเล่นแต่ละระดับ HCP (ต่อ 18 หลุม) ใช้เทียบ "ระดับ" ของแต่ละด้าน
export const BENCH = {
  hcp:   [0, 5, 10, 15, 20, 25, 30, 36],
  gir:   [56, 45, 35, 26, 18, 12, 7, 4],          // % GIR
  fir:   [57, 53, 49, 45, 41, 37, 33, 29],        // % ลงแฟร์เวย์ (Par 4-5)
  putts: [30.5, 31.3, 32.2, 33.0, 33.9, 34.8, 35.7, 36.8],
  three: [0.8, 1.2, 1.7, 2.2, 2.8, 3.4, 4.1, 5.0], // 3 พัตต์ขึ้นไป ต่อรอบ
  pen:   [0.4, 0.8, 1.3, 1.9, 2.6, 3.4, 4.3, 5.4], // แต้มโทษ ต่อรอบ
  scr:   [55, 43, 33, 25, 18, 13, 9, 6],          // % Scrambling
};
// ค่าที่วัดได้ → เทียบเป็นระดับ HCP (ประมาณ) ด้วยการเทียบสัดส่วนระหว่างช่วง
export function levelOf(cat, v) {
  const ys = BENCH[cat], xs = BENCH.hcp, up = ys[0] > ys[ys.length - 1]; // up = ยิ่งมากยิ่งเก่ง
  const better = (a, b) => up ? a >= b : a <= b;
  if (better(v, ys[0])) return 0;
  if (!better(v, ys[ys.length - 1])) return 36;
  for (let k = 1; k < ys.length; k++) if (better(v, ys[k])) { const t = (v - ys[k - 1]) / (ys[k] - ys[k - 1]); return Math.round(xs[k - 1] + t * (xs[k] - xs[k - 1])); }
  return 36;
}
export function benchAt(cat, h) {
  const xs = BENCH.hcp, ys = BENCH[cat]; h = Math.max(0, Math.min(36, h));
  for (let k = 1; k < xs.length; k++) if (h <= xs[k]) { const t = (h - xs[k - 1]) / (xs[k] - xs[k - 1]); return ys[k - 1] + t * (ys[k] - ys[k - 1]); }
  return ys[ys.length - 1];
}

// แยกสโตรกที่เกิน Par: ลูกโทษ + ก่อนถึงกรีน (เทียบ on ตาม regulation) + พัตต์ (เทียบ 2 พัตต์) → รวมเท่ากับสกอร์จริงพอดี
export function breakdown(G, pid) {
  const o = { n: 0, over: 0, pen: 0, t2g: 0, putt: 0, fw: { n: 0, t2g: 0 }, miss: { n: 0, t2g: 0 }, g: 0, putts: 0, three: 0, scrN: 0, scrO: 0, fwN: 0, fwHit: 0 };
  for (let i = 0; i < nHoles(G); i++) {
    const sc = score(G, pid, i); if (sc == null) continue;
    const e = ent(G, pid, i), p = par(G, i), pen = penOf(e), t2g = e.on - (p - 2), pu = e.putt - 2;
    o.n++; o.over += sc - p; o.pen += pen; o.t2g += t2g; o.putt += pu; o.putts += e.putt; if (e.putt >= 3) o.three++;
    if (gir(G, pid, i)) o.g++; else { o.scrN++; if (sc <= p) o.scrO++; }
    if (p >= 4 && e.tee) { o.fwN++; const b = e.tee === 's' ? o.fw : o.miss; b.n++; b.t2g += t2g + pen; if (e.tee === 's') o.fwHit++; }
  }
  return o;
}

// ระดับ HCP ของแต่ละด้าน + จุดแข็ง/จุดที่ควรฝึก (ต้องเล่นอย่างน้อย 9 หลุม)
export function coach(G, pid) {
  const b = breakdown(G, pid); if (b.n < 9) return { b, cats: [], strong: null, weak: null };
  const k18 = 18 / b.n, cats = [];
  const add = (key, label, v, fmt, strokes) => cats.push({ key, label, v, fmt, lvl: levelOf(key, v), strokes });
  add('gir', 'ตีเข้ากรีน (GIR)', b.g / b.n * 100, v => Math.round(v) + '%');
  if (b.fwN >= 4) add('fir', 'ทีช็อตลงแฟร์เวย์', b.fwHit / b.fwN * 100, v => Math.round(v) + '%');
  add('putts', 'พัตต์ต่อรอบ', b.putts * k18, v => v.toFixed(1), true);
  add('three', '3 พัตต์ต่อรอบ', b.three * k18, v => v.toFixed(1), true);
  add('pen', 'แต้มโทษต่อรอบ', b.pen * k18, v => v.toFixed(1), true);
  if (b.scrN >= 4) add('scr', 'เซฟพาร์เมื่อไม่ GIR', b.scrO / b.scrN * 100, v => Math.round(v) + '%');
  const sorted = [...cats].sort((a, c) => a.lvl - c.lvl || (a.strokes ? 1 : 0) - (c.strokes ? 1 : 0)), strong = sorted[0], weak = sorted[sorted.length - 1];
  const avgLvl = Math.round(cats.reduce((s, c) => s + c.lvl, 0) / cats.length);
  // ถ้าด้านที่อ่อนสุดขึ้นมาเท่าระดับเฉลี่ยของตัวเอง จะลดได้กี่สโตรก/รอบ (เฉพาะด้านที่นับเป็นสโตรกตรงๆ)
  cats.forEach(c => { if (c.strokes) c.gain = Math.max(0, c.v - benchAt(c.key, avgLvl)); });
  return { b, cats, strong: strong.lvl < weak.lvl ? strong : null, weak: strong.lvl < weak.lvl ? weak : null, avgLvl };
}

// สกอร์สะสม (to par) หลังจบแต่ละหลุม ของทุกคน
export function race(G) {
  return players(G).map(p => { let t = 0, last = 0; const pts = [0];
    for (let i = 0; i < nHoles(G); i++) { const s = score(G, p.id, i); if (s == null) { pts.push(null); continue; } t += s - par(G, i); pts.push(t); last = i + 1; }
    return { id: p.id, name: p.name, color: p.color, pts, last };
  });
}

// ความยากของแต่ละหลุม จากค่าเฉลี่ยของทั้งแก๊ง (เทียบ Par)
export function holeDifficulty(G) {
  const out = [];
  for (let i = 0; i < nHoles(G); i++) {
    const v = players(G).map(p => score(G, p.id, i)).filter(x => x != null);
    if (v.length) out.push({ i, par: par(G, i), n: v.length, avg: v.reduce((a, b) => a + b, 0) / v.length - par(G, i) });
  }
  return out;
}

// ไดรฟ์และลูกเข้ากรีน จากช็อตที่บันทึกพร้อม GPS
// drive: ระยะจากจุดทีถึงจุดช็อตถัดไป + เบี่ยงซ้าย(-)/ขวา(+) จากแนวทีไปเป้า (เมตร)
export function shotAnalysis(G, pid, holes) {
  const drives = [], approach = [];
  for (let i = 0; i < nHoles(G); i++) {
    const s = Object.values(G.shots?.[pid]?.[hk(i)] || {}).filter(x => x.lat != null).sort((a, b) => a.t - b.t);
    const h = holes?.[hk(i)] || {}, p = par(G, i), green = h.green; if (!s.length) continue;
    if (p >= 4 && s.length >= 2 && s[0].club && s[0].club !== 'Putter') {
      const a = [s[0].lat, s[0].lng], b = [s[1].lat, s[1].lng], aim = h.line && h.line.length > 2 ? h.line[1] : green;
      const d = dist(a, b);
      if (d >= 30 && d <= 400) {
        let lat = null;
        if (aim) { const kx = Math.cos(a[0] * Math.PI / 180) * 111320, ky = 110540, ax = (aim[1] - a[1]) * kx, ay = (aim[0] - a[0]) * ky, bx = (b[1] - a[1]) * kx, by = (b[0] - a[0]) * ky, L = Math.hypot(ax, ay) || 1;
          lat = -(ax * by - ay * bx) / L; }                // ขวา = บวก
        drives.push({ i, club: s[0].club, d, lat });
      }
    }
    if (green && score(G, pid, i) != null) {
      const nonPutt = s.filter(x => x.club !== 'Putter');
      const last = (p === 3 ? nonPutt.slice(0, 1) : nonPutt.slice(1)).pop();
      if (last) { const d = dist([last.lat, last.lng], green); if (d >= 10 && d <= 300) approach.push({ i, d, gir: gir(G, pid, i), club: last.club }); }
    }
  }
  return { drives, approach };
}

// แนวโน้มหลายรอบจากประวัติ (ชื่อเดียวกัน) — สกอร์เทียบ Par ต่อ 18 หลุม, พัตต์/หลุม, GIR%
export function trend(hist, name) {
  return hist.map(r => ({ r, p: r.players.find(x => x.name === name && x.n) })).filter(x => x.p)
    .map(({ r, p }) => ({ date: r.date, course: r.course, toPar: Math.round((p.gross - p.par) * 18 / p.n * 10) / 10, putts: p.putts / p.n, gir: p.g / p.n * 100, diff: p.diff }));
}
