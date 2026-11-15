// หาลูกกอล์ฟและเท้าสองข้างจากภาพกล้องที่ส่องลงพื้น (คำนวณล้วน ไม่แตะหน้าจอ)
// ภาพ = { data: RGBA, width, height } ขนาดเล็ก (กว้าง ~160 px) · มือถือถือแนวตั้ง หัวมือถือชี้ไปข้างหน้า (ฝั่งลูก)
// → ลูกอยู่ด้านบนของภาพ เท้าอยู่ด้านล่าง แนวเป้าวิ่งซ้าย-ขวา
export const BALL_CM = 4.27;
// สัดส่วนร่างกายโดยประมาณจากส่วนสูง (ซม.) — ใช้เป็นค่าตั้งต้นเท่านั้น ผู้ใช้แก้เองได้
export const shoulderFromHeight = h => Math.round(h * 0.245);   // ความกว้างไหล่
export const chestFromHeight = h => Math.round(h * 0.62);       // ระดับอกตอนก้มตั้งท่า (ความสูงมือถือจากพื้น)
// ขนาดลูกที่ควรเห็นในภาพ (รัศมี px ในภาพกว้าง pw) ถ้าถือมือถือที่ระดับอก · กล้องหลังมุมด้านแคบ (แนวตั้ง) ≈ 43°
export const expectedBallR = (h, pw, fovDeg = 43) => pw * BALL_CM / (2 * chestFromHeight(h) * Math.tan(fovDeg * Math.PI / 360)) / 2;

const lum = (d, i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
const median = a => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };

// สีพื้น = ค่ามัธยฐานของขอบบน + ขอบซ้าย/ขวาครึ่งบน (บริเวณที่ไม่ค่อยมีเท้า/ขา)
export function background(img) {
  const { data: d, width: W, height: H } = img, R = [], G = [], B = [];
  const add = (x, y) => { const i = (y * W + x) * 4; R.push(d[i]); G.push(d[i + 1]); B.push(d[i + 2]); };
  for (let y = 0; y < Math.round(H * 0.12); y += 2) for (let x = 0; x < W; x += 2) add(x, y);
  for (let y = Math.round(H * 0.12); y < Math.round(H * 0.55); y += 2) for (let x = 0; x < Math.round(W * 0.08); x += 2) { add(x, y); add(W - 1 - x, y); }
  return [median(R), median(G), median(B)];
}

function components(mask, W, H) {
  const lab = new Int32Array(W * H).fill(-1), out = [], st = [];
  for (let s = 0; s < W * H; s++) {
    if (!mask[s] || lab[s] >= 0) continue;
    const c = { id: out.length, n: 0, sx: 0, sy: 0, x0: W, x1: 0, y0: H, y1: 0 }; lab[s] = c.id; st.push(s);
    while (st.length) { const p = st.pop(), x = p % W, y = (p - x) / W; c.n++; c.sx += x; c.sy += y;
      if (x < c.x0) c.x0 = x; if (x > c.x1) c.x1 = x; if (y < c.y0) c.y0 = y; if (y > c.y1) c.y1 = y;
      if (x > 0 && mask[p - 1] && lab[p - 1] < 0) { lab[p - 1] = c.id; st.push(p - 1); }
      if (x < W - 1 && mask[p + 1] && lab[p + 1] < 0) { lab[p + 1] = c.id; st.push(p + 1); }
      if (y > 0 && mask[p - W] && lab[p - W] < 0) { lab[p - W] = c.id; st.push(p - W); }
      if (y < H - 1 && mask[p + W] && lab[p + W] < 0) { lab[p + W] = c.id; st.push(p + W); } }
    c.cx = c.sx / c.n; c.cy = c.sy / c.n; out.push(c);
  }
  return { lab, comps: out };
}

// opt.thr = ระยะสีที่ถือว่า "ไม่ใช่พื้น"
export function analyze(img, opt = {}) {
  const { data: d, width: W, height: H } = img, N = W * H, bg = opt.bg || background(img), thr = opt.thr || 60;
  const fg = new Uint8Array(N), white = new Uint8Array(N);
  const bgL = 0.299 * bg[0] + 0.587 * bg[1] + 0.114 * bg[2];
  for (let p = 0, i = 0; p < N; p++, i += 4) {
    const dr = d[i] - bg[0], dg = d[i + 1] - bg[1], db = d[i + 2] - bg[2];
    if (dr * dr + dg * dg + db * db > thr * thr) fg[p] = 1;
    const L = lum(d, i), mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]);
    if (L > Math.max(165, bgL + 55) && mx - mn < 70) white[p] = 1;
  }
  // ---- ลูก: ก้อนสีขาว กลม ขนาดพอดี รอบๆ เป็นพื้น ----
  let ball = null, best = 0;
  const { lab: wl, comps: wc } = components(white, W, H);
  for (const c of wc) {
    if (c.n < 5 || c.n > N * 0.03) continue;
    const bw = c.x1 - c.x0 + 1, bh = c.y1 - c.y0 + 1, asp = Math.min(bw, bh) / Math.max(bw, bh), r = Math.sqrt(c.n / Math.PI), fill = c.n / (Math.PI * (Math.max(bw, bh) / 2) ** 2);
    if (asp < 0.55 || fill < 0.5) continue;
    let ring = 0, tot = 0;
    for (let k = 0; k < 20; k++) { const a = k / 20 * 2 * Math.PI, x = Math.round(c.cx + Math.cos(a) * r * 1.9), y = Math.round(c.cy + Math.sin(a) * r * 1.9);
      if (x < 0 || y < 0 || x >= W || y >= H) continue; tot++; if (!fg[y * W + x]) ring++; }
    const ringBg = tot ? ring / tot : 0; if (ringBg < 0.5) continue;
    // ขนาดใกล้ที่คาดจากส่วนสูง = คะแนนดีกว่า (นุ่มนวล เพราะกล้องแต่ละรุ่นมุมไม่เท่ากัน)
    const size = opt.expR ? Math.exp(-(Math.log(r / opt.expR) ** 2) / (2 * 0.55 ** 2)) : 1;
    const sc = asp * Math.min(1, fill) * ringBg * size; if (sc > best) { best = sc; ball = { x: c.cx, y: c.cy, r, id: c.id }; }
  }
  // ---- เท้า: ส่วนที่ไม่ใช่พื้น ใต้ลูกลงมา · ฉายแนวตั้งในแถบความยาวรองเท้า → 2 ยอด ----
  const r = ball ? ball.r : W * 0.03, y0 = ball ? Math.min(H - 1, Math.round(ball.y + r * 2.2)) : Math.round(H * 0.35);
  const isFg = (x, y) => { const p = y * W + x; return fg[p] && !(ball && wl[p] === ball.id); };
  let toe = -1;
  for (let y = y0; y < H && toe < 0; y++) { let n = 0; for (let x = 0; x < W; x++) n += isFg(x, y); if (n >= Math.max(3, r * 1.5)) toe = y; }
  let feet = null;
  if (toe >= 0) {
    const y1 = Math.min(H, toe + Math.round(r * 2 * 7)), proj = new Float32Array(W);
    for (let y = toe; y < y1; y++) for (let x = 0; x < W; x++) proj[x] += isFg(x, y);
    const k = Math.max(1, Math.round(r * 0.6)), sm = new Float32Array(W);
    for (let x = 0; x < W; x++) { let s = 0, n = 0; for (let j = x - k; j <= x + k; j++) if (j >= 0 && j < W) { s += proj[j]; n++; } sm[x] = s / n; }
    let a = 0; for (let x = 1; x < W; x++) if (sm[x] > sm[a]) a = x;
    const sep = Math.max(4 * r, W * 0.12); let b = -1;
    for (let x = 0; x < W; x++) if (Math.abs(x - a) >= sep && (b < 0 || sm[x] > sm[b])) b = x;
    const minH = Math.max(3, r * 2);
    if (b >= 0 && sm[a] >= minH && sm[b] >= minH) {
      const [l, rr] = a < b ? [a, b] : [b, a]; let valley = Infinity; for (let x = l; x <= rr; x++) valley = Math.min(valley, sm[x]);
      if (valley < 0.5 * Math.min(sm[l], sm[rr])) {
        const edge = (pk, dir) => { const t = sm[pk] * 0.35; let x = pk; while (x + dir >= 0 && x + dir < W && sm[x + dir] > t) x += dir; return x; };
        const L = { inner: edge(l, 1), outer: edge(l, -1), peak: l }, R = { inner: edge(rr, -1), outer: edge(rr, 1), peak: rr };
        if (R.inner - L.inner > 2 * r && L.inner - L.outer >= r * 1.2 && R.outer - R.inner >= r * 1.2) feet = { L, R, toe, y1 };
      }
    }
  }
  return { bg, ball: ball && { x: ball.x, y: ball.y, r: ball.r, size: opt.expR ? ball.r / opt.expR : null }, feet, fg };
}

// ผลการวัด: ตำแหน่งลูก 0 (ด้านในเท้าหลัง) → 100 (ด้านในเท้าหน้า), ความกว้างยืน (ซม.), ระยะที่ต้องขยับ (ซม.)
// targetLeft = เป้าอยู่ด้านซ้ายของภาพ (ถนัดขวา หัวมือถือชี้ไปข้างหน้า)
export function measure(res, targetLeft, setup, shoulderCm) {
  const { ball, feet } = res; if (!ball || !feet) return null;
  const front = targetLeft ? feet.L.inner : feet.R.inner, back = targetLeft ? feet.R.inner : feet.L.inner;
  const span = back - front, pxcm = ball.r * 2 / BALL_CM;
  const bp = (back - ball.x) / span * 100, tx = back - setup.bp / 100 * span;
  const errCm = (ball.x - tx) / pxcm * (targetLeft ? -1 : 1);   // + = ลูกค่อนไปทางเท้าหน้ามากเกิน
  const stanceCm = Math.abs(span) / pxcm, wantCm = setup.w * shoulderCm;
  return { bp, errCm, tx, front, back, pxcm, stanceCm, wantCm, wErr: (stanceCm - wantCm) / wantCm };
}
export const level = (v, g, y) => Math.abs(v) <= g ? 'g' : Math.abs(v) <= y ? 'y' : 'r';
export const BALL_TOL = [2.5, 6], STANCE_TOL = [0.12, 0.25];   // ซม. / สัดส่วน
