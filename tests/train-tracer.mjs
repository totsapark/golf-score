// Train the Shot Tracer's small models on synthetic clips (tests/synth-shot.mjs) → practice/tracer-model.js
//   node tests/train-tracer.mjs cand  [clips=2000] [firstSeed=20000]   ball-vs-clutter model for moving spots
//   node tests/train-tracer.mjs track [clips=1500] [firstSeed=30000]   "is this traced line trustworthy" model
// Seeds used here are kept apart from the benchmark/hold-out seeds (bench: 1–400, 1000–1399, 3000–3399, 8000+).
import { fork } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { makeClip, score } from './synth-shot.mjs';
import * as T from '../practice/tracer.js';

const here = path.dirname(fileURLToPath(import.meta.url)), OUT = path.join(here, '..', 'practice', 'tracer-model.js');
const [mode = 'cand', nArg, sArg] = process.argv.slice(2), N = +nArg || (mode === 'cand' ? 2000 : 1500), S0 = +sArg || (mode === 'cand' ? 20000 : 30000), JOBS = +process.env.JOBS || 4;
let seed = 12345; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

// ---- one clip → labelled samples ----
function candSamples(s) {
  const { frames, truth, meta } = makeClip(s, { kind: 'normal', hard: s % 3 !== 0 }), { W, H } = meta, out = [];
  const pre = frames.filter(f => f.t >= -0.6 && f.t <= -0.06), post = frames.filter(f => f.t >= 0.15 && f.t <= 0.7), sub = (a, n) => a.length > n ? a.filter((f, i) => i % Math.ceil(a.length / n) === 0) : a;
  const ball = T.findAddress(sub(pre, 8), sub(post, 6)); if (!ball) return out;
  const ti = T.impactTime(frames, ball, pre, post); if (ti == null) return out;
  const P = truth.path, at = t => { for (let i = 1; i < P.length; i++) if (P[i].t >= t) { const a = P[i - 1], b = P[i], f = (t - a.t) / (b.t - a.t); return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }; } return null; };
  const F = frames.map(f => ({ ...f, t: f.t - ti })).filter(f => f.t > -0.08 && f.t < 1.6), dtf = 1 / meta.fps, gap = Math.max(1, Math.round(1 / 45 / dtf));
  for (let k = gap; k < F.length - gap; k++) {
    if (F[k].t < 0.003) continue;
    const c = T.candidates(F[k - gap], F[k], F[k + gap], { yMax: ball.y + ball.r * 2, ballL: ball.L, k: 400 }), q = at(F[k].t + ti);
    const inF = q && q.x > 1 && q.y > 1 && q.x < W - 1, tol = Math.max(2.5, 1.2 * ball.r);
    for (const bl of c.list) {
      const pos = inF && Math.hypot(bl.x - q.x, bl.y - q.y) < tol;
      if (pos || rnd() < 0.05) out.push([pos ? 1 : 0, ...T.candFeat(bl, c.thr, ball, F[k].t, W, H)]);
    }
  }
  return out;
}
function trackSamples(s) {
  const { frames, truth, meta } = makeClip(s, { kind: 'normal', hard: s % 3 !== 0 }), res = T.analyze(frames, { club: truth.club, all: true });
  res._W = meta.W; res._H = meta.H;
  return (res.cands || []).map(c => { const sc = score({ ...res, ok: true, path: c.path, seen: c.seen, est: c.est }, truth, meta.H); return [sc.shape < 3 ? 1 : sc.shape > 6 ? 0 : -1, ...c.feat]; }).filter(r => r[0] >= 0);
}

// ---- tiny MLP trainer (tanh hidden, sigmoid out, Adam, class-balanced) ----
function train(rows, hidden = 16, epochs = 40) {
  const d = rows[0].length - 1, X = rows.map(r => r.slice(1)), Y = rows.map(r => r[0]);
  const mu = Array(d).fill(0), sd = Array(d).fill(0); X.forEach(x => x.forEach((v, i) => { mu[i] += v / X.length; })); X.forEach(x => x.forEach((v, i) => { sd[i] += (v - mu[i]) ** 2 / X.length; }));
  for (let i = 0; i < d; i++) sd[i] = Math.sqrt(sd[i]) || 1;
  const Z = X.map(x => x.map((v, i) => (v - mu[i]) / sd[i])), npos = Y.reduce((a, b) => a + b, 0), wpos = (Y.length - npos) / Math.max(1, npos);
  const g = () => (rnd() - 0.5) * 0.6, W1 = Array.from({ length: hidden }, () => Array.from({ length: d }, g)), b1 = Array(hidden).fill(0), W2 = Array.from({ length: hidden }, g); let b2 = 0;
  const P = [W1, b1, W2], M = new Map(), V = new Map(); let step = 0;
  const adam = (key, arr, i, grad, lr = 0.01) => { const k = key + ':' + i; const m = 0.9 * (M.get(k) || 0) + 0.1 * grad, v = 0.999 * (V.get(k) || 0) + 0.001 * grad * grad; M.set(k, m); V.set(k, v); arr[i] -= lr * (m / (1 - 0.9 ** step)) / (Math.sqrt(v / (1 - 0.999 ** step)) + 1e-8); };
  const idx = Z.map((_, i) => i), split = Math.floor(Z.length * 0.85);
  for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  const tr = idx.slice(0, split), va = idx.slice(split), fwd = x => { const h = W1.map((w, j) => Math.tanh(b1[j] + w.reduce((s, wi, i) => s + wi * x[i], 0))); return { h, p: 1 / (1 + Math.exp(-(b2 + W2.reduce((s, w, j) => s + w * h[j], 0)))) }; };
  const loss = set => { let L = 0; for (const i of set) { const p = Math.min(1 - 1e-7, Math.max(1e-7, fwd(Z[i]).p)); L += Y[i] ? -wpos * Math.log(p) : -Math.log(1 - p); } return L / set.length; };
  for (let ep = 0; ep < epochs; ep++) {
    for (let i = tr.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [tr[i], tr[j]] = [tr[j], tr[i]]; }
    for (let b0 = 0; b0 < tr.length; b0 += 256) {
      const B = tr.slice(b0, b0 + 256), gW1 = W1.map(r => r.map(() => 0)), gb1 = b1.map(() => 0), gW2 = W2.map(() => 0); let gb2 = 0;
      for (const i of B) { const { h, p } = fwd(Z[i]), e = (p - Y[i]) * (Y[i] ? wpos : 1) / B.length; gb2 += e;
        for (let j = 0; j < hidden; j++) { gW2[j] += e * h[j]; const eh = e * W2[j] * (1 - h[j] * h[j]); gb1[j] += eh; for (let k = 0; k < d; k++) gW1[j][k] += eh * Z[i][k]; } }
      step++; for (let j = 0; j < hidden; j++) { for (let k = 0; k < d; k++) adam('W1' + j, W1[j], k, gW1[j][k] + 1e-4 * W1[j][k]); adam('b1', b1, j, gb1[j]); adam('W2', W2, j, gW2[j] + 1e-4 * W2[j]); }
      const bb = [b2]; adam('b2', bb, 0, gb2); b2 = bb[0];
    }
    if (ep % 10 === 9 || ep === epochs - 1) console.log(`  epoch ${ep + 1}: train loss ${loss(tr.slice(0, 20000)).toFixed(4)} · check loss ${loss(va).toFixed(4)}`);
  }
  // check-set ranking quality: how often a ball sample outscores a clutter sample (AUC)
  const ps = va.map(i => [fwd(Z[i]).p, Y[i]]).sort((a, b) => a[0] - b[0]); let r = 0, np = 0, nn = 0; ps.forEach(([, y], k) => { if (y) { r += k; np++; } else nn++; });
  console.log(`  check AUC ${((r - np * (np - 1) / 2) / (np * nn)).toFixed(4)} (${np} ball / ${nn} clutter)`);
  const R = x => +x.toFixed(5);
  return { mu: mu.map(R), sd: sd.map(R), W1: W1.map(r => r.map(R)), b1: b1.map(R), W2: W2.map(R), b2: R(b2) };
}

if (process.env.WORKER) {
  const n = +process.argv[3], s0 = +process.argv[4], rows = [];
  for (let s = s0; s < s0 + n; s++) rows.push(...(mode === 'cand' ? candSamples(s) : trackSamples(s)));
  const f = path.join(process.env.TMPOUT, `${mode}-${s0}.json`); fs.writeFileSync(f, JSON.stringify(rows)); process.send(f, () => process.exit(0));
} else {
  const tmp = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'trtrain-')), per = Math.ceil(N / JOBS), t0 = Date.now();
  console.log(`making ${mode} samples from ${N} synthetic clips (seeds ${S0}–${S0 + N - 1}) on ${JOBS} workers...`);
  const files = await Promise.all(Array.from({ length: JOBS }, (_, j) => new Promise(res => fork(process.argv[1], [mode, String(Math.max(0, Math.min(per, N - j * per))), String(S0 + j * per)], { env: { ...process.env, WORKER: '1', TMPOUT: tmp, TRK: JSON.stringify(mode === 'cand' ? { model: false } : { tmodel: false }) } }).on('message', res))));
  const rows = files.flatMap(f => JSON.parse(fs.readFileSync(f, 'utf8'))); fs.rmSync(tmp, { recursive: true });
  console.log(`${rows.length} samples (${rows.filter(r => r[0]).length} positive) in ${((Date.now() - t0) / 1000).toFixed(0)} s · training...`);
  const model = train(rows, mode === 'cand' ? 16 : 8, mode === 'cand' ? 40 : 120);
  const cur = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8').replace(/^[^{]*/, '').replace(/;\s*$/, '')) : {};
  cur[mode] = { ...model, trainedOn: `${N} synthetic clips, seeds ${S0}–${S0 + N - 1}, ${rows.length} samples` };
  fs.writeFileSync(OUT, `// generated by tests/train-tracer.mjs — small models for practice/tracer.js, trained on synthetic clips only\nexport default ${JSON.stringify(cur)};\n`);
  console.log('saved', path.relative(process.cwd(), OUT));
}
