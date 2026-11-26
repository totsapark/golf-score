// Synthetic down-the-line golf shot clips for testing the Shot Tracer (practice/tracer.js).
// Everything here is generated (no real footage). On purpose it does NOT share code with the tracker:
// its own ball physics (different drag/lift curves, spin decay, wind) and a camera the tracker doesn't
// know (random height, lens, pitch, yaw, roll), so a good score can't come from the two models agreeing.
// makeClip(seed) → { frames: [{ g, W, H, t }], truth, meta }   (t = seconds relative to the "audio" impact guess)

const D2R = Math.PI / 180, R = 0.02135, KA = 0.5 * 1.2 * Math.PI * R * R / 0.04593;
const CLUBS = [['D', 59, 12.6, 3275], ['3W', 54, 11.5, 3900], ['5H', 48, 14, 4900], ['5i', 48, 14.5, 5000], ['7i', 46.5, 18.5, 5800], ['9i', 42, 23, 7300], ['PW', 38, 26, 8000], ['SW', 31, 31, 9000]];

function rng(seed) { let s = (seed * 2654435761) % 2147483647 || 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

export function fly(p, wind = [0, 0]) {
  const dt = 0.004, la = p.la * D2R, az = p.dir * D2R, tl = p.tilt * D2R, hx = Math.sin(az), hz = Math.cos(az);
  const ax = [-hz * Math.cos(tl), Math.sin(tl), hx * Math.cos(tl)], w0 = p.spin * Math.PI / 30;
  let pos = [0, 0, 0], vel = [p.v0 * Math.cos(la) * hx, p.v0 * Math.sin(la), p.v0 * Math.cos(la) * hz], t = 0, apex = 0;
  const out = [{ t: 0, P: [0, 0, 0] }];
  while (t < 14) {
    const rv = [vel[0] - wind[0], vel[1], vel[2] - wind[1]], v = Math.hypot(...rv), S = w0 * Math.exp(-t / 25) * R / v;
    const cd = 0.24 + 0.15 * S, cl = Math.min(0.32, 0.55 * Math.sqrt(S));
    const c = [ax[1] * rv[2] - ax[2] * rv[1], ax[2] * rv[0] - ax[0] * rv[2], ax[0] * rv[1] - ax[1] * rv[0]], cn = Math.hypot(...c) || 1;
    const a = [0, 1, 2].map(i => -KA * cd * v * rv[i] + KA * cl * v * v * c[i] / cn - (i === 1 ? 9.81 : 0));
    const py = pos[1]; pos = pos.map((x, i) => x + vel[i] * dt + a[i] * dt * dt / 2); vel = vel.map((x, i) => x + a[i] * dt); t += dt;
    if (pos[1] < 0) { const f = py / (py - pos[1]), L = out[out.length - 1].P; out.push({ t: t - dt + f * dt, P: L.map((x, i) => x + (pos[i] - x) * f).map((x, i) => i === 1 ? 0 : x) }); break; }
    out.push({ t, P: pos.slice() }); apex = Math.max(apex, pos[1]);
  }
  const L = out[out.length - 1];
  return { pts: out, carry: L.P[2], side: L.P[0], apex, time: L.t };
}
const posAt = (fl, t) => { const a = fl.pts; if (t <= 0) return [0, 0, 0]; if (t >= a[a.length - 1].t) return a[a.length - 1].P;
  let k = Math.min(a.length - 2, Math.floor(t / 0.004)); while (k > 0 && a[k].t > t) k--; while (a[k + 1].t < t) k++; const f = (t - a[k].t) / (a[k + 1].t - a[k].t); return a[k].P.map((x, i) => x + (a[k + 1].P[i] - x) * f); };

// pinhole camera with pitch (down), yaw, roll at (cx, hc, -dc) looking toward +z
function cam(o) {
  const { pitch, yaw, roll } = o, cp = Math.cos(pitch), sp = Math.sin(pitch), cy = Math.cos(yaw), sy = Math.sin(yaw), cr = Math.cos(roll), sr = Math.sin(roll);
  const Fw = [sy * cp, -sp, cy * cp], Rt0 = [cy, 0, -sy], Up0 = [sy * sp, cp, cy * sp];
  const Rt = Rt0.map((x, i) => x * cr + Up0[i] * sr), Up = Up0.map((x, i) => x * cr - Rt0[i] * sr);
  return { ...o, proj(X) { const d = [X[0] - o.cx, X[1] - o.hc, X[2] + o.dc], z = d[0] * Fw[0] + d[1] * Fw[1] + d[2] * Fw[2];
    return [o.W / 2 + o.f * (d[0] * Rt[0] + d[1] * Rt[1] + d[2] * Rt[2]) / z, o.H / 2 - o.f * (d[0] * Up[0] + d[1] * Up[1] + d[2] * Up[2]) / z, z]; } };
}

export function makeClip(seed, opt = {}) {
  const r = rng(seed), U = (a, b) => a + (b - a) * r(), pick = a => a[Math.floor(r() * a.length)];
  const portrait = opt.portrait ?? r() < 0.6, long = opt.long || 480, W = portrait ? Math.round(long * 9 / 16) : long, H = portrait ? long : Math.round(long * 9 / 16);
  const fps = opt.fps || pick([30, 60, 60, 120, 120]);
  // camera: retry until the ball sits in the lower-middle of the frame
  let C;
  for (let k = 0; k < 200; k++) {
    C = cam({ W, H, f: U(0.62, 0.85) * Math.max(W, H), hc: U(0.6, 1.5), dc: U(2, 4.5), cx: U(-0.9, 0.4), pitch: U(3, 16) * D2R, yaw: U(-4, 4) * D2R, roll: U(-2, 2) * D2R, ...(opt.cam || {}) });
    const [u, v] = C.proj([0, 0, 0]); if (u > 0.2 * W && u < 0.8 * W && v > 0.5 * H && v < 0.92 * H) break;
  }
  const [bx, by, bz] = C.proj([0, 0, 0]), br = C.f * R / bz;
  // the shot
  const cl = opt.club ? CLUBS.find(c => c[0] === opt.club) : pick(CLUBS), kind = opt.kind || (r() < 0.06 ? 'whiff' : r() < 0.08 ? 'thin' : 'normal');
  const shot = { v0: cl[1] * U(0.78, 1.1), la: cl[2] + U(-4, 4), dir: U(-6, 6), tilt: U(-18, 18), spin: cl[3] * U(0.7, 1.3) };
  if (kind === 'thin') { shot.v0 *= 0.7; shot.la = U(3, 7); shot.spin *= 0.5; }
  const wind = [U(-4, 4), U(-4, 4)], fl = fly(shot, wind);
  // light
  const light = opt.light || pick(['day', 'day', 'overcast', 'night', 'dusk']);
  const sky = { day: [150, 210], overcast: [195, 235], night: [8, 28], dusk: [90, 150] }[light], ballL = light === 'night' ? U(170, 240) : light === 'overcast' ? U(205, 240) : U(225, 252);
  const noise = U(1.5, 5), [, vh] = C.proj([0, 0, 3000]);
  // static background
  const bg = new Float32Array(W * H), treeTop = new Float32Array(W);
  for (let x = 0; x < W; x++) treeTop[x] = vh - H * (0.04 + 0.05 * (0.5 + 0.5 * Math.sin(x * 0.07 + seed) * Math.sin(x * 0.023 + seed * 3)));
  const treeL = light === 'night' ? U(5, 25) : U(35, 85), grass = light === 'night' ? U(40, 80) : U(80, 130);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let v;
    if (y < treeTop[x]) v = sky[0] + (sky[1] - sky[0]) * Math.max(0, Math.min(1, y / Math.max(1, vh)));
    else if (y < vh) v = treeL + 25 * Math.sin(x * 0.9 + y * 1.3) * Math.sin(x * 0.31 - y * 0.7) + 10 * r();
    else v = grass + 12 * Math.sin(x * 0.5 + y * 2.1) + 8 * r() + (y - vh) / H * 20;
    bg[y * W + x] = v;
  }
  // a few distance markers / other balls lying on the range (static white specks)
  for (let k = 0; k < 6; k++) { const x0 = U(0, W), y0 = U(vh + 3, H), rr = U(0.6, 2); for (let y = Math.floor(y0 - rr - 1); y <= y0 + rr + 1; y++) for (let x = Math.floor(x0 - rr - 1); x <= x0 + rr + 1; x++) if (x >= 0 && y >= 0 && x < W && y < H && Math.hypot(x - x0, y - y0) <= rr) bg[y * W + x] = U(200, 245); }
  // golfer standing to the side of the ball (closer to the camera than the ball)
  // occl: golfer stands between the camera and the early flight (real down-the-line footage) → head/arms hide the ball at first
  const r3 = rng(seed * 13 + 5), occl = opt.hard !== false && (opt.occl ?? r3() < 0.4), side = bx < W / 2 ? -1 : (r() < 0.5 ? -1 : 1), gx0 = U(0.12, 0.2), gx = bx + side * (occl ? 0.04 + 0.04 * r3() : gx0) * W, shirt = U(25, 225), pants = U(20, 190), shaftL = U(30, 200), clubL = U(35, 210);
  const sc = br / 4, hip = [gx, by - 55 * sc], sh = [gx, by - 120 * sc];
  const birds = Array.from({ length: Math.floor(U(0, 3.5)) }, () => ({ x: U(0, W), y: U(0, vh * 0.8), vx: U(-80, 80), vy: U(-20, 20), s: U(0.8, 2), L: light === 'night' ? U(40, 90) : U(10, 60) }));
  const walker = r() < 0.3 ? { x: U(0, W), y: vh + U(5, 30), vx: U(-25, 25), h: U(8, 18), L: U(30, 200) } : null;
  const other = r() < 0.25 ? { o: [U(-25, 25), 0, U(-3, 3)], fl: fly({ v0: U(35, 60), la: U(10, 25), dir: U(-5, 5), tilt: U(-10, 10), spin: U(3000, 7000) }), t0: U(-0.4, 0.8) } : null;
  const audioErr = U(-0.02, 0.02), t0 = -0.65, t1 = 1.7, shutter = U(0.3, 1) / fps;
  const nt = new Float32Array(4096); for (let k = 0; k < nt.length; k++) nt[k] = (r() + r() + r() - 1.5) * 2 * noise;
  // harder conditions (own random stream so the base clip for a seed stays the same): moving clouds, leaves
  // shimmering in the wind, camera shake, soft/compressed video, auto-exposure drift
  const r2 = rng(seed * 7 + 3), U2 = (a, b) => a + (b - a) * r2(), hard = opt.hard !== false;
  const clouds = hard && light !== 'night' && r2() < 0.6 ? { a: U2(5, light === 'overcast' ? 14 : 22), vx: U2(-12, 12), k1: U2(0.02, 0.06), k2: U2(0.05, 0.12) } : null;
  const leaves = hard && r2() < 0.5 ? U2(4, 12) : 0, shake = hard && r2() < 0.4 ? U2(0.2, 0.8) : 0, soft = hard && r2() < 0.5 ? U2(0.3, 0.7) : 0, drift = hard ? U2(0, 0.04) : 0, dph = U2(0, 6);
  const isTree = new Uint8Array(W * H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (y >= treeTop[x] && y < vh) isTree[y * W + x] = 1;
  const nt2 = new Float32Array(4096); for (let k = 0; k < nt2.length; k++) nt2[k] = (r2() - 0.5) * 2 * leaves;
  let sx = 0, sy = 0;
  // ลูกที่ลอยอยู่มักดูเป็นจุดเข้มตัดฟ้าสว่าง (ย้อนแสง/ฟ้าครึ้ม) แม้ตอนวางบนหญ้าจะเห็นเป็นสีขาว
  const flyL = hard && light !== 'night' && r2() < (light === 'dusk' ? 0.3 : 0.55) ? U2(55, 150) : ballL;
  const frames = [];
  const disc = (img, x0, y0, rad, L, w = 1) => { // anti-aliased disc with lens blur (energy kept)
    const re = Math.sqrt(rad * rad + 0.36), a = w * (rad * rad) / (re * re), x1 = Math.floor(x0 - re - 1), x2 = Math.ceil(x0 + re + 1), y1 = Math.floor(y0 - re - 1), y2 = Math.ceil(y0 + re + 1);
    for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) { if (x < 0 || y < 0 || x >= W || y >= H) continue; let cov = 0;
      for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) if (Math.hypot(x + (i + 0.5) / 3 - x0, y + (j + 0.5) / 3 - y0) <= re) cov++;
      if (cov) { const q = y * W + x, c = cov / 9 * a; img[q] = img[q] * (1 - c) + L * c; } } };
  const thick = (img, a, b, w, L) => { const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1])) + 1; for (let k = 0; k <= n; k++) { const x = a[0] + (b[0] - a[0]) * k / n, y = a[1] + (b[1] - a[1]) * k / n; for (let yy = Math.floor(y - w); yy <= y + w; yy++) for (let xx = Math.floor(x - w); xx <= x + w; xx++) if (xx >= 0 && yy >= 0 && xx < W && yy < H && Math.hypot(xx - x, yy - y) <= w) img[yy * W + xx] = L; } };
  for (let k = 0; !opt.noFrames; k++) {
    const tt = t0 + k / fps; if (tt > t1) break;
    const img = Float32Array.from(bg);
    if (clouds) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { if (y >= treeTop[x]) continue; const X = x + clouds.vx * tt; img[y * W + x] += clouds.a * Math.sin(X * clouds.k1 + y * 0.03) * Math.sin(X * clouds.k2 * 0.7 - y * clouds.k2); }
    // golfer: legs, torso, head; arms + club swing (club angle from address → top → impact → finish)
    const ph = tt < -0.3 ? (tt + 0.65) / 0.35 * 0.5 : tt < 0 ? 0.5 + (tt + 0.3) / 0.3 * 0.5 : Math.min(2, 1 + tt / 0.35);
    const ang = ph <= 1 ? Math.PI * (1 - Math.cos(ph * Math.PI)) * 0.9 * (ph < 0.5 ? 1 : 1) : 0, armA = ph < 0.5 ? ph * 2 * 2.6 : ph < 1 ? 2.6 * (1 - (ph - 0.5) * 2) : -(ph - 1) * 2.8;
    const twist = Math.sin(armA) * 10 * sc;
    const body = upper => { for (let y = Math.floor(sh[1] - 22 * sc); y < (upper ? hip[1] : by + 8 * sc); y++) for (let x = Math.floor(gx - 30 * sc); x < gx + 30 * sc; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue; const q = y * W + x;
      if (y > hip[1] && Math.abs(x - gx) < 14 * sc && Math.abs(Math.abs(x - gx) - 7 * sc) < 5 * sc) img[q] = pants;
      else if (y <= hip[1] && y > sh[1] && Math.abs(x - gx - twist * (hip[1] - y) / (hip[1] - sh[1])) < 16 * sc) img[q] = shirt;
      else if (Math.hypot(x - gx - twist, y - (sh[1] - 13 * sc)) < 9 * sc) img[q] = 60;
    } }; body(false);
    const hands = [gx + twist - side * 18 * sc * Math.cos(armA), sh[1] + 45 * sc * Math.cos(armA) - 30 * sc * Math.sin(Math.abs(armA))];
    const head = [hands[0] + (bx - hands[0]) * Math.cos(armA) * 1 - side * 40 * sc * Math.sin(armA), hands[1] + (by - hands[1]) * Math.cos(armA) - 60 * sc * Math.abs(Math.sin(armA))];
    thick(img, sh, hands, 4 * sc, shirt); thick(img, hands, head, Math.max(0.6, 0.9 * sc), shaftL); disc(img, head[0], head[1], 9 * sc, clubL);
    // tee stays after the ball leaves
    for (let y = Math.round(by + br * 0.6); y < by + br * 2; y++) for (let x = Math.round(bx - br * 0.25); x <= bx + br * 0.25; x++) if (x >= 0 && y >= 0 && x < W && y < H) img[y * W + x] = 225;
    // ball: on the tee before impact, then flying (motion blur over the shutter time)
    const tr = tt + audioErr;   // true time since impact
    if (tr < 0 || kind === 'whiff') disc(img, bx, by, br, ballL);
    else if (kind === 'unseen') {}   // ball too faint to see in flight (tests the "can't follow" path)
    else { const n = 8; for (let s = 0; s < n; s++) { const ts = Math.max(0, tr - shutter / 2 + shutter * (s + 0.5) / n), [u, v, z] = C.proj(posAt(fl, ts)); if (z > 0.3) disc(img, u, v, C.f * R / z, flyL, 1 / n * (n - s) / (n - s)); } }
    if (occl) { body(true); thick(img, sh, hands, 4 * sc, shirt); }   // golfer in front of the ball
    if (other && tr > other.t0) { const P = posAt(other.fl, tr - other.t0), [u, v, z] = C.proj([P[0] + other.o[0], P[1], P[2] + other.o[2]]); if (z > 0.5) disc(img, u, v, C.f * R / z, ballL * 0.95); }
    for (const b of birds) disc(img, b.x + b.vx * tt, b.y + b.vy * tt + Math.sin(tt * 30) * 1.5, b.s, b.L);
    if (walker) { const x0 = walker.x + walker.vx * tt; for (let y = Math.floor(walker.y - walker.h); y < walker.y; y++) for (let x = Math.floor(x0 - walker.h * 0.18); x < x0 + walker.h * 0.18; x++) if (x >= 0 && y >= 0 && x < W && y < H) img[y * W + x] = walker.L; }
    let fin = img;
    if (soft) { const o = new Float32Array(W * H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const q = y * W + x; if (x === 0 || y === 0 || x === W - 1 || y === H - 1) { o[q] = img[q]; continue; }
      const m = (img[q - W - 1] + img[q - W] + img[q - W + 1] + img[q - 1] + img[q] + img[q + 1] + img[q + W - 1] + img[q + W] + img[q + W + 1]) / 9; o[q] = img[q] * (1 - soft) + m * soft; } fin = o; }
    if (shake) { sx = sx * 0.7 + U2(-1, 1) * shake; sy = sy * 0.7 + U2(-1, 1) * shake; const o = new Float32Array(W * H), fx = sx - Math.floor(sx), fy = sy - Math.floor(sy), ix = Math.floor(sx), iy = Math.floor(sy);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const x0 = Math.min(W - 2, Math.max(0, x + ix)), y0 = Math.min(H - 2, Math.max(0, y + iy)), q = y0 * W + x0;
        o[y * W + x] = (fin[q] * (1 - fx) + fin[q + 1] * fx) * (1 - fy) + (fin[q + W] * (1 - fx) + fin[q + W + 1] * fx) * fy; } fin = o; }
    const gain = 1 + U(-0.015, 0.015) + drift * Math.sin(tt * 2 + dph), g = new Uint8Array(W * H), off = Math.floor(r() * 4096), off2 = Math.floor(r2() * 4096);
    for (let q = 0; q < W * H; q++) { const v = fin[q] * gain + nt[(q * 31 + off) & 4095] + (leaves && isTree[q] ? nt2[(q * 17 + off2) & 4095] : 0); g[q] = v < 0 ? 0 : v > 255 ? 255 : v; }
    frames.push({ g, W, H, t: tt });
  }
  // ground truth (image path until landing, px)
  const path = []; for (let t = 0; t <= fl.time + 1e-9; t += 0.02) { const [u, v] = C.proj(posAt(fl, t)); path.push({ t: t - audioErr, x: u, y: v }); }
  return { frames, truth: { ball: { x: bx, y: by, r: br }, path, carry: fl.carry, side: fl.side, apex: fl.apex, time: fl.time, speed: shot.v0, launch: shot.la, dir: shot.dir, club: cl[0], kind, impact: -audioErr },
    meta: { W, H, fps, light, noise, portrait, birds: birds.length, walker: !!walker, other: !!other, occl, darkBall: flyL !== ballL, clouds: !!clouds, leaves: !!leaves, shake: !!shake, soft: !!soft, cam: { hc: C.hc, f: C.f / Math.max(W, H), dc: C.dc } } };
}

// compare a tracer result with the truth: mean image error along the whole flight (% of frame height), carry/side/apex errors
export function score(res, truth, H) {
  if (!res.ok) return null;
  const pp = res.path, pAt = t => { if (t <= pp[0].t) return pp[0]; for (let k = 1; k < pp.length; k++) if (pp[k].t >= t) { const a = pp[k - 1], b = pp[k], f = (t - a.t) / ((b.t - a.t) || 1); return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }; } return pp[pp.length - 1]; };
  const W = H * (res._W || 1); let e = 0, n = 0, eSeen = 0, nSeen = 0, eEnd = 0;
  for (const q of truth.path) { const p = pAt(q.t), d = Math.hypot(p.x * res._W - q.x, p.y * res._H - q.y); e += d; n++; if (q.t <= res.seen + 0.05) { eSeen += d; nSeen++; } eEnd = d; }
  // shape: how far the drawn line is from the true line, ignoring timing (both directions, so a too-short/too-long line counts)
  const seg = (P, A, B) => { const dx = B.x - A.x, dy = B.y - A.y, L = dx * dx + dy * dy, u = L ? Math.max(0, Math.min(1, ((P.x - A.x) * dx + (P.y - A.y) * dy) / L)) : 0; return Math.hypot(P.x - A.x - u * dx, P.y - A.y - u * dy); };
  const near = (P, line) => { let m = Infinity; for (let k = 1; k < line.length; k++) m = Math.min(m, seg(P, line[k - 1], line[k])); return m; };
  const pl = pp.map(p => ({ x: p.x * res._W, y: p.y * res._H })), tl = truth.path;
  const shape = (tl.reduce((s, q) => s + near(q, pl), 0) / tl.length + pl.reduce((s, q) => s + near(q, tl), 0) / pl.length) / 2 / H * 100;
  return { shape, path: e / n / H * 100, seen: nSeen ? eSeen / nSeen / H * 100 : 0, land: eEnd / H * 100, carry: (res.est.carry - truth.carry) / truth.carry * 100, side: res.est.side - truth.side, apex: (res.est.apex - truth.apex) / truth.apex * 100, speed: (res.est.speed - truth.speed) / truth.speed * 100 };
}
