// Shot Tracer (เส้นลูก) — คำนวณล้วน ไม่แตะหน้าจอ
// ลำดับ: หาลูกที่ตั้งอยู่ → หาจังหวะกระทบ (ลูกหายจากจุดตั้ง) → หาจุดเล็กๆ ที่ขยับในแต่ละเฟรม → ต่อเป็นเส้นทางลูก
//        → ฟิตวิถีลูกตามฟิสิกส์ (แรงต้าน + แรงยกจากสปิน) → ได้เส้นเต็มจนลูกตก แม้ช่วงที่กล้องมองไม่เห็นลูกแล้ว
// ภาพ = { g: Uint8Array (ความสว่าง 0–255), W, H, t (วินาทีจริง เทียบจังหวะกระทบโดยประมาณ) }
// กล้องอยู่ด้านหลังผู้ตี เล็งขนานแนวเป้า (down-the-line) · หน่วยโลก: เมตร x = ขวา, y = ขึ้น, z = ไปทางเป้า · ลูกเริ่มที่ (0,0,0)
import M0 from './tracer-model.js';
const D2R = Math.PI / 180, K = globalThis.__TRK || (typeof process !== 'undefined' && process.env?.TRK ? JSON.parse(process.env.TRK) : {});   // K: ค่าทดลองตอนปรับจูน (ใช้เฉพาะในเทสต์)
export const BALL_R = 0.02135;
const MASS = 0.04593, KA = 0.5 * 1.2 * Math.PI * BALL_R ** 2 / MASS, G = 9.81, SPIN_TAU = 20;

export function toGray(d, W, H) { const g = new Uint8Array(W * H); for (let p = 0, i = 0; p < W * H; p++, i += 4) g[p] = (77 * d[i] + 150 * d[i + 1] + 29 * d[i + 2]) >> 8; return g; }

/* ---------- ฟิสิกส์ลูกกอล์ฟ ---------- */
// p = { v0 (m/s), la (องศา มุมออก), dir (องศา + = ขวา), spin (rpm แบ็กสปิน), tilt (องศา แกนสปินเอียง + = โค้งขวา) }
export function simulate(p, o = {}) {
  const dt = o.dt || 0.01, tmax = o.tmax || 12, la = p.la * D2R, az = p.dir * D2R, tl = (p.tilt || 0) * D2R;
  const hx = Math.sin(az), hz = Math.cos(az), ax = -hz * Math.cos(tl), ay = Math.sin(tl), az2 = hx * Math.cos(tl), w0 = p.spin * Math.PI / 30;
  let x = 0, y = 0, z = 0, vx = p.v0 * Math.cos(la) * hx, vy = p.v0 * Math.sin(la), vz = p.v0 * Math.cos(la) * hz, t = 0, apex = 0;
  const T = [0], X = [0], Y = [0], Z = [0];
  const acc = (vx, vy, vz, t, out) => {
    const v = Math.hypot(vx, vy, vz) || 1e-6, S = w0 * Math.exp(-t / SPIN_TAU) * BALL_R / v;
    const cd = 0.21 + 0.3 * S, cl = 0.34 * (1 - Math.exp(-S / 0.15));   // ปรับให้ตรงค่าเฉลี่ยจาก launch monitor (ระยะ/ความสูงทุกไม้ คลาด ≤ ~4%)
    const cx = ay * vz - az2 * vy, cy = az2 * vx - ax * vz, cz = ax * vy - ay * vx, cn = Math.hypot(cx, cy, cz) || 1e-9, kd = KA * v * cd, kl = KA * v * v * cl / cn;
    out[0] = -kd * vx + kl * cx; out[1] = -kd * vy + kl * cy - G; out[2] = -kd * vz + kl * cz;
  };
  const a1 = [0, 0, 0], a2 = [0, 0, 0]; let land = null;
  while (t < tmax) {
    acc(vx, vy, vz, t, a1);
    const mx = vx + a1[0] * dt / 2, my = vy + a1[1] * dt / 2, mz = vz + a1[2] * dt / 2;
    acc(mx, my, mz, t + dt / 2, a2);
    const py = y; x += mx * dt; y += my * dt; z += mz * dt; vx += a2[0] * dt; vy += a2[1] * dt; vz += a2[2] * dt; t += dt;
    if (y < 0 && t > 0.05) { const f = py / (py - y), lt = t - dt + f * dt, lx = X[X.length - 1] + (x - X[X.length - 1]) * f, lz = Z[Z.length - 1] + (z - Z[Z.length - 1]) * f;
      T.push(lt); X.push(lx); Y.push(0); Z.push(lz); land = { t: lt, x: lx, z: lz }; break; }
    T.push(t); X.push(x); Y.push(y); Z.push(z); if (y > apex) apex = y;
  }
  const L = land || { t, x, z };
  return { T, X, Y, Z, dt, apex, landed: !!land, time: L.t, carry: L.z, side: L.x };
}
// ตำแหน่งที่เวลา t (เส้นตรงระหว่างจุดคำนวณ)
export function at(sim, t) {
  if (t <= 0) return [0, 0, 0]; const n = sim.T.length - 1; let k = Math.min(n - 1, Math.floor(t / sim.dt));
  while (k > 0 && sim.T[k] > t) k--; while (k < n - 1 && sim.T[k + 1] < t) k++;
  const f = Math.max(0, Math.min(1, (t - sim.T[k]) / ((sim.T[k + 1] - sim.T[k]) || 1)));
  return [sim.X[k] + (sim.X[k + 1] - sim.X[k]) * f, sim.Y[k] + (sim.Y[k + 1] - sim.Y[k]) * f, sim.Z[k] + (sim.Z[k + 1] - sim.Z[k]) * f];
}

/* ---------- กล้อง ---------- */
// ระยะกล้องถึงลูกได้จากขนานลูกในภาพ (ลูกจริง 4.27 ซม.) · ความสูงกล้องสมมติ ~1 ม. (ขาตั้ง/พิงถุงกอล์ฟ)
// มุมก้มกับระยะเยื้องด้านข้างคำนวณจากตำแหน่งลูกในภาพ
export function camera(ball, W, H, o = {}) {
  const f = o.f || 0.73 * Math.max(W, H), hc = o.hc || 1.0;
  const D = Math.max(1.2, Math.min(12, (o.D || f * BALL_R / Math.max(0.6, ball.r)) * Math.exp(o.ds || 0)));
  let cx = 0, dc = Math.sqrt(Math.max(0.25, D * D - hc * hc)), th = 0;
  for (let k = 0; k < 4; k++) {
    const a = (ball.y - H / 2) / f; th = Math.atan((hc - a * dc) / (dc + a * hc));
    const zc = hc * Math.sin(th) + dc * Math.cos(th); cx = -(ball.x - W / 2) * zc / f; dc = Math.sqrt(Math.max(0.25, D * D - hc * hc - cx * cx));
  }
  return { f, hc, cx, dc, th, s: Math.sin(th), c: Math.cos(th), W, H, D };
}
export function project(cam, X, Y, Z) {
  const dx = X - cam.cx, dy = Y - cam.hc, dz = Z + cam.dc, zc = Math.max(0.05, dz * cam.c - dy * cam.s), yc = -(dy * cam.c + dz * cam.s);
  return [cam.W / 2 + cam.f * dx / zc, cam.H / 2 + cam.f * yc / zc, zc];
}

/* ---------- ค่าตั้งต้นแต่ละไม้ (มือสมัครเล่นทั่วไป) [ความเร็วลูก m/s, มุมออก, สปิน rpm] ---------- */
const PRI = [['D', 59, 12.6, 3275], ['3W', 54, 11.5, 3900], ['5W', 52, 12.5, 4400], ['7W', 50, 13.5, 4700], ['3H', 50, 13, 4500], ['4H', 49, 13.5, 4700], ['5H', 48, 14, 4900],
  ['4i', 51, 13.5, 4600], ['5i', 49.5, 14.5, 5000], ['6i', 47, 16, 5400], ['7i', 46.5, 18.5, 5800], ['8i', 45, 20.5, 6500], ['9i', 42, 23, 7300], ['PW', 38, 26, 8000],
  ['AW', 35, 28, 8500], ['GW', 35, 28, 8500], ['50°', 35, 28, 8500], ['52°', 34, 29, 8700], ['SW', 31, 31, 9000], ['54°', 32, 30, 8900], ['56°', 31, 31, 9000], ['58°', 29, 33, 9200], ['LW', 28, 34, 9300], ['60°', 28, 34, 9300]];
export function prior(club) { const r = PRI.find(x => x[0] === club) || PRI.find(x => x[0] === '7i'); return { v0: r[1], la: r[2], spin: r[3] }; }

/* ---------- ก้อนพิกเซล ---------- */
// mask: Uint8Array 0/1 · val: น้ำหนัก (ความต่างความสว่าง) · คืนก้อนพร้อมจุดศูนย์ถ่วง ขนาด และแกนยาว/สั้น
function blobs(mask, val, W, H, maxN) {
  const seen = new Uint8Array(W * H), out = [], st = new Int32Array(W * H);
  for (let s0 = 0; s0 < W * H; s0++) {
    if (!mask[s0] || seen[s0]) continue;
    let sp = 0, n = 0, sw = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, big = false, pk = 0; st[sp++] = s0; seen[s0] = 1;
    while (sp) {
      const p = st[--sp], x = p % W, y = (p - x) / W, w = val[p]; n++; if (w > pk) pk = w;
      if (!big) { sw += w; sx += w * x; sy += w * y; sxx += w * x * x; syy += w * y * y; sxy += w * x * y; if (n > maxN) big = true; }
      if (x > 0 && mask[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; st[sp++] = p - 1; }
      if (x < W - 1 && mask[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; st[sp++] = p + 1; }
      if (y > 0 && mask[p - W] && !seen[p - W]) { seen[p - W] = 1; st[sp++] = p - W; }
      if (y < H - 1 && mask[p + W] && !seen[p + W]) { seen[p + W] = 1; st[sp++] = p + W; }
    }
    if (big || !sw) continue;
    const cx = sx / sw, cy = sy / sw, a = sxx / sw - cx * cx, b = syy / sw - cy * cy, c = sxy / sw - cx * cy, tr = (a + b) / 2, dd = Math.sqrt(Math.max(0, tr * tr - (a * b - c * c)));
    out.push({ x: cx + 0.5, y: cy + 0.5, n, s: sw, pk, major: 4 * Math.sqrt(Math.max(0, tr + dd)), minor: 4 * Math.sqrt(Math.max(0, tr - dd)) });
  }
  return out;
}

/* ---------- 1) ลูกที่ตั้งอยู่: สว่างและนิ่งในทุกเฟรมช่วงดาวน์สวิง แล้วหายไปหลังกระทบ ---------- */
export function findAddress(pre, post, o = {}) {
  const { W, H } = pre[0], N = W * H, S = new Uint8Array(N), m = new Uint8Array(N);
  const mn = new Uint8Array(pre[0].g), mx = new Uint8Array(post[0].g);
  for (const f of pre) { const g = f.g; for (let p = 0; p < N; p++) if (g[p] < mn[p]) mn[p] = g[p]; }
  for (const f of post) { const g = f.g; for (let p = 0; p < N; p++) if (g[p] > mx[p]) mx[p] = g[p]; }
  let top = 0; const y0 = Math.round(H * (o.yMin ?? 0.2));
  for (let p = y0 * W; p < N; p++) { const d = mn[p] - mx[p]; S[p] = d > 0 ? d : 0; if (S[p] > top) top = S[p]; }
  if (top < 18) return null;
  const thr = Math.max(14, top * 0.4); for (let p = 0; p < N; p++) m[p] = S[p] > thr ? 1 : 0;
  const maxN = Math.max(30, (0.06 * Math.min(W, H)) ** 2 * 3.2);
  let best = null;
  for (const b of blobs(m, S, W, H, maxN)) {
    const round = b.major ? Math.min(1, (b.minor + 1) / (b.major + 1)) : 1; if (round < 0.45) continue;
    const low = 0.5 + 0.5 * Math.min(1, b.y / (H * 0.6)), sc = b.s * round * round * low;
    if (!best || sc > best.sc) best = { ...b, sc };
  }
  if (!best) return null;
  // รัศมี: นับพิกเซลที่สว่างกว่ากึ่งกลางระหว่างลูกกับพื้นรอบๆ ในภาพก่อนตี
  const cx = Math.floor(best.x), cy = Math.floor(best.y), R = Math.ceil(Math.sqrt(best.n) * 1.5) + 2;
  let ring = [], peak = 0;
  for (let y = cy - R; y <= cy + R; y++) for (let x = cx - R; x <= cx + R; x++) { if (x < 0 || y < 0 || x >= W || y >= H) continue; const d = Math.hypot(x - cx, y - cy), v = mn[y * W + x]; if (d >= R - 1) ring.push(v); if (d <= 1.5 && v > peak) peak = v; }
  ring.sort((a, b) => a - b); const bg = ring[ring.length >> 1] ?? 0, half = (peak + bg) / 2; let area = 0, br = 0;
  for (let y = cy - R; y <= cy + R; y++) for (let x = cx - R; x <= cx + R; x++) { if (x < 0 || y < 0 || x >= W || y >= H || Math.hypot(x - cx, y - cy) > R - 1) continue; const v = mn[y * W + x]; if (v > half) area++; br += Math.max(0, Math.min(1, (v - bg) / ((peak - bg) || 1))); }
  const r = Math.max(0.8, Math.min(Math.sqrt(best.n / Math.PI) * 1.3, Math.sqrt(Math.max(area, br) / Math.PI)));
  // ลูกจริง: สว่างกว่าพื้นรอบๆ ชัดเจน และขนาดสมเหตุผล (กล้องห่าง ~1.5–8 ม.)
  const L = Math.max(W, H); if (peak - bg < 28 || r > 0.03 * L || r < 0.0012 * L) return null;
  return { x: best.x, y: best.y, r, c: peak - bg, L: peak };
}

// 2) จังหวะกระทบ: เฟรมแรกที่จุดตั้งลูกเปลี่ยนไป (หัวไม้มาถึงหรือลูกออกไป) และไม่กลับมาเหมือนเดิมอีก
function leaveTime(frames, ball, pre, post) {
  const { W } = frames[0], R = Math.max(1, ball.r * 0.8), pts = [];
  for (let y = Math.floor(ball.y - R); y <= Math.ceil(ball.y + R); y++) for (let x = Math.floor(ball.x - R); x <= Math.ceil(ball.x + R); x++) if (Math.hypot(x + 0.5 - ball.x, y + 0.5 - ball.y) <= R) pts.push(y * W + x);
  if (!pts.length) return null;
  const mean = f => pts.reduce((s, p) => s + f.g[p], 0) / pts.length, avg = a => a.reduce((s, f) => s + mean(f), 0) / a.length;
  const a = avg(pre), b = avg(post); if (Math.abs(a - b) < 8) return null;
  const dev = frames.map(f => Math.abs(mean(f) - a) / Math.abs(a - b));
  let k0 = -1; for (let k = frames.length - 1; k >= 0; k--) { if (dev[k] < 0.5) break; k0 = k; }
  if (k0 <= 0) return null;
  return (frames[k0 - 1].t + frames[k0].t) / 2;
}
export function impactTime(frames, ball, pre, post) { return leaveTime(frames.filter(f => f.t > -0.25 && f.t < 0.3), ball, pre, post); }
const sub = (a, n) => a.length > n ? a.filter((f, i) => i % Math.ceil(a.length / n) === 0) : a;
// ไม่มีจังหวะกระทบจากเสียง: กวาดทั้งคลิปแบบหยาบ (t = วินาทีในคลิป) → ลูกที่อยู่ตอนต้นแล้วหายไปตอนท้าย → เวลาที่หาย
export function coarseImpact(frames) {
  const n = frames.length; if (n < 8) return null;
  const pre = frames.slice(0, Math.max(2, Math.floor(n * 0.3))), post = frames.slice(Math.ceil(n * 0.8));
  const ball = findAddress(sub(pre, 8), sub(post, 6)); if (!ball) return null;
  return leaveTime(frames, ball, pre, post);
}

// กล้องขยับ (มือสั่น/ลมโยกขาตั้ง): หาการเลื่อนทั้งภาพ (ทศนิยมพิกเซล) ที่ทำให้ b ตรงกับ a → b(x+dx, y+dy) ≈ a(x, y)
export function shiftOf(a, b, W, H, R = 3) {
  const pts = []; for (let y = R + 2; y < H - R - 2; y += 3) for (let x = R + 2; x < W - R - 2; x += 3) { const q = y * W + x, gx = a[q + 1] - a[q - 1], gy = a[q + W] - a[q - W]; if (gx * gx + gy * gy > 300) pts.push(q); }
  if (pts.length < 60) return [0, 0];
  const st = Math.max(1, Math.floor(pts.length / 2500)), S = {};
  const sad = (dx, dy) => { const k = dy * W + dx; let s = 0; for (let i = 0; i < pts.length; i += st) { const d = Math.abs(a[pts[i]] - b[pts[i] + k]); s += d < 30 ? d : 30; } return s; };
  let bx = 0, by = 0, bv = Infinity; for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) { const v = S[dx + ',' + dy] = sad(dx, dy); if (v < bv) { bv = v; bx = dx; by = dy; } }
  const sub = (m, c, p) => { const den = m - 2 * c + p; return den > 0 ? Math.max(-0.5, Math.min(0.5, (m - p) / (2 * den))) : 0; };
  const fx = Math.abs(bx) < R ? sub(S[(bx - 1) + ',' + by], bv, S[(bx + 1) + ',' + by]) : 0, fy = Math.abs(by) < R ? sub(S[bx + ',' + (by - 1)], bv, S[bx + ',' + (by + 1)]) : 0;
  return [bx + fx, by + fy];
}
function warp(b, W, H, dx, dy) {
  const o = new Uint8Array(W * H), ix = Math.floor(dx), iy = Math.floor(dy), fx = dx - ix, fy = dy - iy;
  for (let y = 0; y < H; y++) { const y0 = Math.min(H - 2, Math.max(0, y + iy)); for (let x = 0; x < W; x++) { const x0 = Math.min(W - 2, Math.max(0, x + ix)), q = y0 * W + x0;
    o[y * W + x] = (b[q] * (1 - fx) + b[q + 1] * fx) * (1 - fy) + (b[q + W] * (1 - fx) + b[q + W + 1] * fx) * fy + 0.5; } }
  return o;
}

// ---- โมเดลเล็กที่ฝึกจากคลิปจำลอง (tests/train-tracer.mjs → tracer-model.js) ----
let MODEL = M0 || {};
export function setModel(m) { MODEL = m || {}; }
// ลักษณะของจุดที่ขยับ (ไม่ขึ้นกับขนาดภาพ): ความแรงเทียบเกณฑ์ ขนาด/ความยาวเทียบลูก ทิศความสว่างเทียบสีลูก ตำแหน่งเทียบลูกที่ตั้ง เวลา
export function candFeat(c, thr, ball, t, W, H) {
  const r = Math.max(1, ball.r), d2 = 2 * r + 1, ex = (ball.L ?? 230) - c.bg, pol = Math.sign(ex || 1) * c.dv / thr;
  return [Math.log1p(c.s / thr), Math.log1p(c.n), c.major / d2, c.minor / d2, Math.log1p(c.n / (Math.PI * (r + 1) ** 2)), Math.max(-5, Math.min(5, pol)),
    c.bg / 255, ex / 255, (ball.y - c.y) / H, (c.x - ball.x) / W, Math.min(t ?? 0.3, 1.6), r / (0.01 * Math.max(W, H)), (c.pk || 0) / thr, thr / 40];
}
export function mlp(m, f) {   // f → (มาตรฐาน) → tanh hidden → sigmoid
  const x = f.map((v, i) => (v - m.mu[i]) / m.sd[i]); let z = m.b2;
  for (let j = 0; j < m.b1.length; j++) { let h = m.b1[j]; const w = m.W1[j]; for (let i = 0; i < x.length; i++) h += w[i] * x[i]; z += m.W2[j] * Math.tanh(h); }
  return 1 / (1 + Math.exp(-z));
}

// 3) จุดที่ขยับ: พิกเซลที่ต่างจากทั้งเฟรมก่อนและเฟรมหลัง (ทิศเดียวกัน) = ของที่อยู่ตรงนั้นแค่เฟรมนี้
export function candidates(p, c, n, o = {}) {
  const { W, H } = c, N = W * H, g = c.g, val = new Uint8Array(N), m = new Uint8Array(N);
  let a = p.g, b = n.g;
  if (o.stab !== false) {   // ชดเชยกล้องขยับก่อนหักลบภาพ
    const s1 = shiftOf(g, a, W, H), s2 = shiftOf(g, b, W, H);
    if (Math.hypot(...s1) > 0.15) a = warp(a, W, H, ...s1); if (Math.hypot(...s2) > 0.15) b = warp(b, W, H, ...s2);
  }
  const smp = []; for (let k = 0; k < 1500; k++) { const q = (k * 7919 + 13) % N; smp.push(Math.abs(g[q] - a[q])); }
  smp.sort((x, y) => x - y); const thr = Math.max(o.minT || 9, (K.tf ?? 3.2) * smp[smp.length >> 1] + 6);
  const y1 = o.yMax != null ? Math.min(H, Math.ceil(o.yMax)) : H;
  for (let q = 0; q < y1 * W; q++) {
    const d1 = g[q] - a[q], d2 = g[q] - b[q];
    const d = d1 > 0 && d2 > 0 ? Math.min(d1, d2) : d1 < 0 && d2 < 0 ? Math.min(-d1, -d2) * 0.8 : 0;
    if (d > thr * 0.6) { val[q] = Math.min(255, d); m[q] = d > thr ? 1 : 3; }
  }
  // ขยายก้อนให้รวมขอบจางของลูกเล็กๆ (เกณฑ์ต่ำ) แต่เริ่มจากพิกเซลที่ชัดเท่านั้น
  for (let q = 0; q < N; q++) if (m[q] === 3 && ((q % W > 0 && m[q - 1] === 1) || (q >= W && m[q - W] === 1))) m[q] = 2;
  for (let q = 0; q < N; q++) m[q] = m[q] === 1 || m[q] === 2 ? 1 : 0;
  const maxN = o.maxN || Math.max(40, 0.0025 * N), maxW = o.maxW || Math.max(5, 0.035 * Math.min(W, H));
  let out = blobs(m, val, W, H, maxN).filter(bl => bl.minor <= maxW && bl.major <= Math.max(maxW * 6, 0.25 * H));
  // ลูกสีขาว: ตรงที่ลูกผ่าน ความสว่างต้องเปลี่ยนไปทางสีลูก (พื้นมืดกว่าลูก → ต้องสว่างขึ้น) ของมืดที่ผ่านพื้นมืดจึงไม่ใช่ลูก
  for (const bl of out) { const q = Math.min(H - 1, Math.floor(bl.y)) * W + Math.min(W - 1, Math.floor(bl.x)); bl.bg = (a[q] + b[q]) / 2; bl.dv = g[q] - bl.bg; }
  if (o.ballL != null) out = out.filter(bl => { const ex = o.ballL - bl.bg; return !(Math.abs(ex) > 25 && bl.dv * ex < 0 && Math.abs(bl.dv) > thr * 0.6); });
  // จัดอันดับ: โมเดลที่ฝึกจากคลิปจำลอง (ลูก vs สิ่งรบกวน) ถ้ามี · ไม่งั้นใช้ความแรงของจุด
  if (o.ball && MODEL.cand && K.model !== false) { for (const bl of out) bl.p = mlp(MODEL.cand, candFeat(bl, thr, o.ball, o.t, W, H)); out.sort((x, y) => y.p - x.p); }
  else out.sort((x, y) => y.s - x.s);
  return { thr, list: out.slice(0, o.k || (K.k ?? 20)) };
}

/* ---------- 4) ต่อจุดเป็นเส้นทางลูก (เก็บหลายสมมติฐาน เลือกเส้นที่ต่อเนื่องที่สุด) ---------- */
// ทำนายตำแหน่งถัดไป · ช่วงแรก (< 0.4 วิ) ใช้แบบจำลองมุมมอง: ลูกพุ่งออกห่างกล้อง → ในภาพเคลื่อนช้าลงเรื่อยๆ
//   x(t) = x0 + a·t/(1+Bt) + c·t²/(1+Bt)   (B ≈ ความเร็วพุ่งออก ÷ ระยะกล้อง) · หลังจากนั้นใช้พหุนามดีกรี 2 ของจุดล่าสุด
function solve3(M, R) { const det = m => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const D = det(M); if (Math.abs(D) < 1e-18) return null; return [0, 1, 2].map(j => det(M.map((r, i) => r.map((x, k) => k === j ? R[i] : x))) / D); }
function persp(pts, B) {   // least squares a, c (x และ y) ผ่านจุดเริ่ม (ลูกที่ตั้ง) พอดี
  const o = pts[0]; let s11 = 0, s12 = 0, s22 = 0, rx1 = 0, rx2 = 0, ry1 = 0, ry2 = 0;
  for (let i = 1; i < pts.length; i++) { const p = pts[i], q = 1 + B * p.t, f1 = p.t / q, f2 = p.t * p.t / q, w = 1;
    s11 += w * f1 * f1; s12 += w * f1 * f2; s22 += w * f2 * f2; rx1 += w * f1 * (p.x - o.x); rx2 += w * f2 * (p.x - o.x); ry1 += w * f1 * (p.y - o.y); ry2 += w * f2 * (p.y - o.y); }
  const n = pts.length - 1, reg = 1e-9 + (n < 3 ? 1e3 * s22 : 0), D = s11 * (s22 + reg) - s12 * s12; if (Math.abs(D) < 1e-30) return null;
  const ax = (rx1 * (s22 + reg) - rx2 * s12) / D, cx = (s11 * rx2 - s12 * rx1) / D, ay = (ry1 * (s22 + reg) - ry2 * s12) / D, cy = (s11 * ry2 - s12 * ry1) / D;
  let e = 0; for (let i = 1; i < pts.length; i++) { const p = pts[i], q = 1 + B * p.t; e += (o.x + ax * p.t / q + cx * p.t * p.t / q - p.x) ** 2 + (o.y + ay * p.t / q + cy * p.t * p.t / q - p.y) ** 2; }
  return { e, at: t => { const q = 1 + B * t; return [o.x + ax * t / q + cx * t * t / q, o.y + ay * t / q + cy * t * t / q]; } };
}
function predict(pts, t, B0 = 12) {
  const n = pts.length; if (n === 1) return null;
  if (pts[0].o && t < 0.4) {
    let best = null;
    if (n >= 4) { for (const B of [0, 2, 4, 6, 8, 11, 14, 18, 23, 30, 40, 55]) { const m = persp(pts, B); if (m && (!best || m.e < best.e)) best = m; } }
    else best = persp(pts, B0);
    if (best) return best.at(t);
  }
  const q = pts.slice(-5), k = q.length, t0 = q[k - 1].t;
  if (k === 2) { const [A, Bp] = q, f = (t - Bp.t) / (Bp.t - A.t); return [Bp.x + (Bp.x - A.x) * f, Bp.y + (Bp.y - A.y) * f]; }
  const S = [0, 0, 0, 0, 0], Rx = [0, 0, 0], Ry = [0, 0, 0];
  q.forEach((p, i) => { const w = 1 + i, u = p.t - t0; let up = 1; for (let j = 0; j < 5; j++) { S[j] += w * up; if (j < 3) { Rx[j] += w * p.x * up; Ry[j] += w * p.y * up; } up *= u; } });
  const M = [[S[0], S[1], S[2]], [S[1], S[2], S[3]], [S[2], S[3], S[4]]], cx = solve3(M, Rx), cy = solve3(M, Ry), u = t - t0;
  if (!cx || !cy) return predict(pts.slice(-2), t);
  return [cx[0] + cx[1] * u + cx[2] * u * u, cy[0] + cy[1] * u + cy[2] * u * u];
}
export function link(frames, ball, o = {}) {
  const B = o.beam || (K.B ?? 150), H = o.H, maxGap = o.maxGap || 0.13, r = Math.max(1, ball.r), fam = o.family || (K.fam ?? 5), gs = K.gs ?? 0.2;
  const ballA = Math.PI * (r + 1) ** 2;
  let hyps = [{ pts: [{ t: 0, x: ball.x, y: ball.y, s: 0, o: true }], sc: 0, miss: 0, f: -1 }], done = [], nf = 0;
  for (const fr of frames) {
    if (fr.t <= 0.002) continue;
    const next = [];
    for (const h of hyps) {
      const L = h.pts[h.pts.length - 1];
      if (fr.t - L.t > maxGap) { if (h.pts.length > 1) done.push(h); continue; }
      const pr = predict(h.pts, fr.t, o.B0), n = h.pts.length;
      if (pr && (pr[0] < -3 || pr[0] > o.W + 3 || pr[1] < -3)) { done.push({ ...h, out: true }); continue; }   // ลูกออกนอกจอ
      next.push({ ...h, miss: h.miss + 1, sc: h.sc - 0.2 });
      for (const c of fr.list) {
        // ลูกเป็นก้อนเล็ก: กว้างไม่เกินขนาดลูก (ยาวได้ถ้าเบลอ) · หัวไม้/ก้านไม้/คนใหญ่กว่า
        const wide = Math.max(0, c.minor - (2 * r + 1.5)) / (r + 1), big = Math.max(0, c.n / (ballA * (1 + c.major / (2 * r + 1))) - 1.5);
        let pen = c.p != null && !K.pen ? 0 : 0.6 * wide + 0.4 * big;
        if (c.p != null) pen -= (K.pw ?? 4) * (c.p - 0.5);   // คะแนนจากโมเดล: ดูเหมือนลูกแค่ไหน
        if (n === 1) {   // จุดแรกหลังกระทบ: ต้องอยู่เหนือลูก ในกรวยแนวเป้า ไม่ไกลเกิน และไม่ช้าเกินลูกจริง
          const dy = c.y - ball.y, dx = c.x - ball.x, d = Math.hypot(dx, dy);
          if (dy > -0.6 * r || Math.abs(dx) > 0.7 * -dy + 3 * r || d > 0.6 * H || fr.t > 0.12) continue;
          if (d / fr.t < r * 200) continue;   // ลูกออกเร็วมาก (หัวไม้หลังกระทบช้ากว่าในภาพ)
        } else {
          const step = Math.hypot(pr[0] - L.x, pr[1] - L.y), gate = 3 + 1.5 * r + gs * step + 1.5 * h.miss, e = Math.hypot(c.x - pr[0], c.y - pr[1]);
          if (e > gate) continue;
          if (n <= 3 && c.y > L.y + 2 + r) continue;   // ช่วงแรกลูกต้องขึ้น
          { const P = h.pts[n - 2], vx = L.x - P.x, vy = L.y - P.y, sx = c.x - L.x, sy = c.y - L.y, vm = Math.hypot(vx, vy);
            if (vm > 3 && (vx * sx + vy * sy) < -0.3 * vm * Math.hypot(sx, sy)) continue; }   // ลูกไม่กลับทางกะทันหัน
          pen += (e / gate) ** 2 * 0.8;
        }
        const f = n === 1 ? nf++ : h.f;
        next.push({ pts: [...h.pts, { t: fr.t, x: c.x, y: c.y, s: c.s, w: c.minor, p: c.p }], sc: h.sc + 1 + 0.25 * Math.min(1, c.s / (fr.thr * ballA)) - pen, miss: 0, f });
      }
    }
    // ตัดเส้นซ้ำ (จบที่จุดเดียวกัน) · จำกัดจำนวนต่อ "ตระกูล" (จุดแรกเดียวกัน) ให้มีหลายทางเลือกเหลือไว้ฟิต
    next.sort((a, b) => b.sc - a.sc); const seen = new Set(), per = {}; hyps = [];
    for (const h of next) {
      const L = h.pts[h.pts.length - 1], k = h.pts.length > 1 ? `${L.t.toFixed(4)}:${L.x.toFixed(1)}:${L.y.toFixed(1)}:${h.miss}` : 'o' + h.miss;
      if (seen.has(k) || (per[h.f] || 0) >= fam) continue; seen.add(k); per[h.f] = (per[h.f] || 0) + 1; hyps.push(h); if (hyps.length >= B) break;
    }
  }
  done.push(...hyps.filter(h => h.pts.length > 1));
  // เส้นที่ดีที่สุดของแต่ละตระกูล
  const best = {}; for (const h of done) if (h.pts.length >= 4 && (!best[h.f] || h.sc > best[h.f].sc)) best[h.f] = h;
  return Object.values(best).sort((a, b) => b.sc - a.sc);
}

/* ---------- 5) ฟิตวิถีลูก (Nelder–Mead) ---------- */
function nm(f, x0, step, it = 400) {
  const n = x0.length; let P = [x0.slice()]; for (let i = 0; i < n; i++) { const x = x0.slice(); x[i] += step[i]; P.push(x); }
  let F = P.map(f);
  for (let k = 0; k < it; k++) {
    const ix = F.map((v, i) => i).sort((a, b) => F[a] - F[b]); P = ix.map(i => P[i]); F = ix.map(i => F[i]);
    if (Math.abs(F[n] - F[0]) < 1e-6 * (1 + Math.abs(F[0])) && k > 40) break;
    const c = Array(n).fill(0); for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) c[j] += P[i][j] / n;
    const mv = (a, s) => c.map((v, j) => v + s * (a[j] - v)), xr = mv(P[n], -1), fr = f(xr);
    if (fr < F[0]) { const xe = mv(P[n], -2), fe = f(xe); if (fe < fr) { P[n] = xe; F[n] = fe; } else { P[n] = xr; F[n] = fr; } }
    else if (fr < F[n - 1]) { P[n] = xr; F[n] = fr; }
    else { const xc = mv(P[n], 0.5), fc = f(xc); if (fc < F[n]) { P[n] = xc; F[n] = fc; } else { for (let i = 1; i <= n; i++) { P[i] = P[i].map((v, j) => P[0][j] + 0.5 * (v - P[0][j])); F[i] = f(P[i]); } } }
  }
  const b = F.indexOf(Math.min(...F)); return { x: P[b], f: F[b] };
}
export const FIT_HP = { v: 0.25, la: 7, dir: 9, spin: 0.35, tilt: 16, t0: 0.8, dsk: 1, s0: 1.2, s1: 0.25 };
export function fitFlight(obs, ball, W, H, o = {}) {
  // ความกว้างของค่าตั้งต้น (prior) แต่ละตัว · ปรับจูนบนวิถีจำลองหลายพันเส้น (tests/tune-fit.mjs)
  const hp = { ...FIT_HP, ...(K.hp || {}) };
  const pr = o.prior || prior(o.club), dtf = o.dtf || 1 / 60, sig = o.sigma || hp.s0 + hp.s1 * ball.r, sdD = (ball.r >= 3 ? 0.18 : ball.r >= 1.8 ? 0.28 : 0.4) * hp.dsk;
  const tLast = Math.max(...obs.map(p => p.t)) + 0.05, carry = o.carry;
  const dec = q => ({ v0: Math.exp(q[0]), la: q[1], dir: q[2], spin: Math.exp(q[3]), tilt: q[4], t0: q[5] * dtf, ds: q[6] });
  const cost = q => {
    const p = dec(q); if (p.v0 < 8 || p.v0 > 90 || p.la < 1 || p.la > 60 || Math.abs(p.dir) > 30 || p.spin < 500 || p.spin > 13000 || Math.abs(p.tilt) > 50 || Math.abs(q[5]) > 2.5 || Math.abs(p.ds) > 1.2) return 1e9;
    const cam = camera(ball, W, H, { ...o.cam, ds: p.ds }), sim = simulate(p, { tmax: carry ? 12 : tLast, dt: 0.01 });
    let e = 0;
    for (const ob of obs) { const [X, Y, Z] = at(sim, ob.t - p.t0), [u, v] = project(cam, X, Y, Z), r2 = ((u - ob.x) ** 2 + (v - ob.y) ** 2) / sig ** 2; e += 9 * Math.log(1 + r2 / 9); }
    e += ((q[0] - Math.log(pr.v0)) / hp.v) ** 2 + ((p.la - pr.la) / hp.la) ** 2 + (p.dir / hp.dir) ** 2 + ((q[3] - Math.log(pr.spin)) / hp.spin) ** 2 + (p.tilt / hp.tilt) ** 2 + (q[5] / hp.t0) ** 2 + (p.ds / sdD) ** 2;
    if (carry) e += ((sim.carry - carry) / (0.15 * carry)) ** 2;
    // ลูกออกนอกจอ: หลังจากนั้นช่วงสั้นๆ เส้นต้องยังอยู่นอกจอ (ไม่งั้นกล้องต้องเห็นลูก)
    if (o.exit) for (let tt = o.exit + 0.03; tt < o.exit + 0.3; tt += 0.03) { const [X, Y, Z] = at(sim, tt - p.t0), [u, v] = project(cam, X, Y, Z), inside = Math.min(v, u, W - u);
      if (inside > 0) e += 0.5 * (inside / sig) ** 2; }
    return e;
  };
  // ทิศออกเริ่มต้นจากจุดแรกๆ
  const q0 = [Math.log(pr.v0), pr.la, 0, Math.log(pr.spin), 0, 0, 0], step = [0.15, 4, 3, 0.25, 8, 0.6, 0.15];
  const starts = [q0, [q0[0], pr.la - 5, -4, q0[3], -10, 0, -0.15], [q0[0] + 0.1, pr.la + 5, 4, q0[3], 10, 0, 0.15]];
  let best = null; for (const s of starts) { const r1 = nm(cost, s, step, 350); if (!best || r1.f < best.f) best = r1; }
  best = nm(cost, best.x, step.map(v => v * 0.3), 300);
  const p = dec(best.x), cam = camera(ball, W, H, { ...o.cam, ds: p.ds }), sim = simulate(p, { tmax: 12, dt: 0.01 });
  let se = 0, fd = 0; const res = obs.map(ob => { const [X, Y, Z] = at(sim, ob.t - p.t0), [u, v] = project(cam, X, Y, Z), e = Math.hypot(u - ob.x, v - ob.y); se += e * e; fd += 9 * Math.log(1 + e * e / sig ** 2 / 9); return e; });
  const path = []; for (let k = 0; k < sim.T.length; k += 2) { const [u, v, z] = project(cam, sim.X[k], sim.Y[k], sim.Z[k]); path.push({ t: sim.T[k] + p.t0, x: u / W, y: v / H, z }); }
  { const k = sim.T.length - 1, [u, v, z] = project(cam, sim.X[k], sim.Y[k], sim.Z[k]); if (path[path.length - 1].t !== sim.T[k] + p.t0) path.push({ t: sim.T[k] + p.t0, x: u / W, y: v / H, z }); }
  return { p, cam, sim, path, f: best.f, fd, fp: best.f - fd, rms: Math.sqrt(se / obs.length), res, carry: sim.carry, side: sim.side, apex: sim.apex, time: sim.time };
}

/* ---------- ทั้งหมดในครั้งเดียว ---------- */
// frames: เรียงตามเวลา, t = วินาทีจริงเทียบจังหวะกระทบโดยประมาณ (จากเสียง) · o.club, o.carry (ระยะของไม้นี้จากบันทึกซ้อม ม.)
export function analyze(frames, o = {}) {
  if (frames.length < 6) return { ok: false, why: 'clip' };
  const { W, H } = frames[0];
  const pre = frames.filter(f => f.t >= -0.6 && f.t <= -0.06), post = frames.filter(f => f.t >= 0.15 && f.t <= 0.7);
  if (pre.length < 2 || post.length < 2) return { ok: false, why: 'clip' };
  const ball = o.ball || findAddress(sub(pre, 8), sub(post, 6));
  if (!ball) return { ok: false, why: 'ball' };
  const ti = impactTime(frames, ball, pre, post);
  if (ti == null) return { ok: false, why: 'ball' };
  const F = frames.map(f => ({ ...f, t: f.t - ti })).filter(f => f.t > -0.08 && f.t < (o.tMax || 1.6));
  // fps จริงของภาพ → ระยะห่างเฟรมเพื่อนบ้านที่ใช้หาจุดขยับ (ห่าง ≥ ~1/45 วิ ไม่งั้นลูกที่อยู่ไกลขยับน้อยจนหักลบกันหมด)
  const dts = []; for (let k = 1; k < F.length; k++) dts.push(F[k].t - F[k - 1].t); dts.sort((a, b) => a - b);
  const dtf = Math.max(1 / 500, dts[dts.length >> 1] || 1 / 30), gap = Math.max(1, Math.round(1 / 45 / dtf));
  const C = [];
  for (let k = gap; k < F.length - gap; k++) {
    if (F[k].t < 0.003) continue;
    const c = candidates(F[k - gap], F[k], F[k + gap], { yMax: ball.y + ball.r * 2, ballL: ball.L, ball, t: F[k].t });
    C.push({ t: F[k].t, thr: c.thr, list: c.list });
  }
  const hyps = link(C, ball, { W, H, maxGap: Math.max(0.1, 3.5 * dtf * gap), B0: 40 * ball.r / (0.73 * Math.max(W, H) * BALL_R) });
  if (!hyps.length) return { ok: false, why: 'track', ball, ti };
  let best = null;
  const allc = [];
  for (const h of hyps.slice(0, K.nfit ?? 12)) {
    let obs = h.pts.filter(p => !p.o), out = h.out;
    if (obs.length < 3) continue;
    let fit = fitFlight(obs, ball, W, H, { club: o.club, carry: o.carry, dtf, cam: o.cam, exit: out ? obs[obs.length - 1].t : null });
    // ลูกหายไปแล้วเส้นยังต่อไปเก็บจุดมั่ว: ตัดตั้งแต่จุดที่เริ่มไม่เข้ากับวิถีที่ฟิตได้ แล้วฟิตใหม่
    for (let it = 0; it < 2 && K.trim !== false; it++) {
      const lim = Math.max(2.5, 1.5 + 0.8 * ball.r) * 1.5; let cut = -1;
      for (let i = 3; i < obs.length - 1; i++) if (fit.res[i] > lim && fit.res[i + 1] > lim) { cut = i; break; }
      if (cut < 0 && obs.length > 4 && fit.res[obs.length - 1] > lim * 1.5) cut = obs.length - 1;
      if (cut < 4) break;
      obs = obs.slice(0, cut); out = false; fit = fitFlight(obs, ball, W, H, { club: o.club, carry: o.carry, dtf, cam: o.cam });
    }
    // วิถีที่ฟิตต้องเข้ากับจุดที่เห็นดี และมุมออกไม่ต่ำผิดปกติสำหรับไม้นี้ (กันเส้นมั่วจากจุดรบกวน)
    const pr0 = o.prior || prior(o.club), span0 = obs[obs.length - 1].t - obs[0].t, rr = fit.rms / (1.5 + 0.6 * ball.r);
    const feat = [Math.log1p(obs.length), span0, rr, Math.log1p(fit.fd / obs.length), Math.log1p(fit.fp), fit.p.la - pr0.la, Math.log(fit.p.v0 / pr0.v0), fit.p.ds, (h.pts.length - 1 - obs.length) / (h.pts.length - 1),
      obs.reduce((a, q) => a + (q.p ?? 0.5), 0) / obs.length, Math.min(...obs.map(q => q.p ?? 0.5)), h.out ? 1 : 0, ball.r, Math.log(dtf), Math.log1p(hyps.length), obs[0].t, fit.p.dir / 10, fit.p.tilt / 20];
    // เส้นนี้น่าเชื่อไหม: โมเดลที่ฝึกจากคลิปจำลอง (ถ้ามี) · ไม่งั้นกฎตายตัว (ฟิตเข้ากับจุดที่เห็น + มุมออกไม่ต่ำผิดปกติ)
    const plaus0 = fit.fd / obs.length <= (K.fmax ?? 1.2) && fit.fp <= (K.pmax ?? 25) && fit.p.la - pr0.la >= -20, pm = MODEL.track && K.tmodel !== false ? mlp(MODEL.track, feat) : null;
    const tm = K.tmode ?? 'or', plaus = pm == null ? plaus0 : tm === 'select' ? plaus0 : tm === 'or' ? plaus0 || pm >= (K.tau ?? 0.99) : tm === 'and' ? plaus0 && pm >= (K.tau ?? 0.3) : pm >= (K.tau ?? 0.5);
    const q = fit.rms / (1.5 + ball.r * 0.5), sc = (pm != null ? pm * 100 : obs.length / (1 + q * q)) + (plaus ? 1000 : 0);
    if (o.all) allc.push({ feat, path: fit.path.map(p => ({ t: p.t, x: p.x, y: p.y, z: p.z })), seen: span0, est: { carry: fit.carry, side: fit.side, apex: fit.apex, speed: fit.p.v0 } });
    if (!best || sc > best.sc) best = { sc, fit, obs, h, plaus, pm };
  }
  if (o.all) return { ok: false, why: 'all', cands: allc };
  if (!best) return { ok: false, why: 'track', ball, ti };
  const { fit, obs } = best, span = obs[obs.length - 1].t - obs[0].t;
  const dg = { n: obs.length, f: fit.fd / obs.length, fp: fit.fp, la: fit.p.la - (o.prior || prior(o.club)).la, pm: best.pm, span, rr: fit.rms / (1.5 + 0.6 * ball.r) };
  if (!best.plaus) return { ok: false, why: 'fit', ball, ti, rms: fit.rms, diag: dg };
  if ((best.pm == null && fit.rms > (1.5 + 0.6 * ball.r) * (obs.length >= 10 ? 1.6 : 1)) || span < 0.03 || obs.length < (K.nmin ?? 4)) return { ok: false, why: 'fit2', ball, ti, rms: fit.rms, diag: dg };
  return {
    ok: true, ball: { x: ball.x / W, y: ball.y / H, r: ball.r / W }, ti, dtf,
    track: obs.map(p => ({ t: +p.t.toFixed(4), x: +(p.x / W).toFixed(4), y: +(p.y / H).toFixed(4) })),
    path: fit.path.map(p => ({ t: +p.t.toFixed(3), x: +p.x.toFixed(4), y: +p.y.toFixed(4), z: +p.z.toFixed(1) })),
    est: { speed: fit.p.v0, launch: fit.p.la, dir: fit.p.dir, spin: fit.p.spin, tilt: fit.p.tilt, carry: fit.carry, side: fit.side, apex: fit.apex, time: fit.time },
    seen: span, rms: fit.rms, n: obs.length, diag: { f: fit.f / obs.length, raw: best.h.pts.length - 1, la: fit.p.la - (o.prior || prior(o.club)).la, v: fit.p.v0 / (o.prior || prior(o.club)).v0, ds: fit.p.ds, alt: hyps.length, pm: best.pm },
  };
}

// ช่วงระยะลอย (carry) ที่น่าจะเป็น: กว้างตามเวลาที่กล้องเห็นลูกจริง · แคบลงมากถ้ามีระยะของไม้นี้จากบันทึกซ้อม
// (วัดจากคลิปจำลองที่ไม่ได้ใช้ปรับค่า: ค่าคลาด 80% ของคลิปอยู่ในช่วงนี้)
export function carryBand(carry, seen, own) {
  const pct = own ? (seen < 0.35 ? 0.13 : 0.11) : seen < 0.1 ? 0.4 : seen < 0.35 ? 0.3 : 0.19;
  return { lo: carry * (1 - pct), hi: carry * (1 + pct), pct, sure: pct <= 0.2 };
}

// รูปทรงลูก (ถนัดขวา): ทิศออก + ความโค้ง → ชื่อเรียก
export function shapeOf(est, lefty) {
  const s = lefty ? -1 : 1, d = est.dir * s, curve = (est.side - Math.tan(est.dir * D2R) * est.carry) * s;
  const start = d < -2.5 ? 'L' : d > 2.5 ? 'R' : 'C', bend = curve < -6 ? 'L' : curve > 6 ? 'R' : 'C';
  const big = Math.abs(curve) > 18;
  const name = start === 'C' && bend === 'C' ? 'ตรง' : bend === 'C' ? (start === 'L' ? 'ดึงซ้าย (pull)' : 'ผลักขวา (push)')
    : bend === 'R' ? (big ? 'สไลซ์ (slice)' : 'เฟด (fade)') : (big ? 'ฮุก (hook)' : 'ดรอว์ (draw)');
  return { start, bend, curve: curve * s, name };
}
