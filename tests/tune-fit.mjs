// Tune the flight fit's prior widths on thousands of synthetic trajectories (no video needed: the true image
// path is sampled like a tracker would see it — a short visible stretch with pixel noise and a noisy ball size).
//   node tests/tune-fit.mjs [trials=60] [paths=400] [firstSeed=40000]  → prints the best settings (FIT_HP in practice/tracer.js)
import { fork } from 'child_process';
import { makeClip, score } from './synth-shot.mjs';
import * as T from '../practice/tracer.js';

const [trialsA, pathsA, seedA] = process.argv.slice(2), TRIALS = +trialsA || 60, PATHS = +pathsA || 400, S0 = +seedA || 40000, JOBS = +process.env.JOBS || 4;
function sample(s) {   // one trajectory as the tracker would observe it
  const { truth, meta } = makeClip(s, { kind: 'normal', noFrames: true }); if (truth.kind !== 'normal') return null;
  let z = (s * 9301 + 49297) % 233280; const rnd = () => (z = (z * 9301 + 49297) % 233280) / 233280, gs = () => (rnd() + rnd() + rnd() - 1.5) * 2;
  const fps = meta.fps, span = 0.05 + rnd() * rnd() * 0.7, P = truth.path, at = t => { for (let i = 1; i < P.length; i++) if (P[i].t >= t) { const a = P[i - 1], b = P[i], f = (t - a.t) / (b.t - a.t); return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }; } return null; };
  const t0 = truth.impact, obs = [];
  for (let t = 1 / fps; t <= span; t += 1 / fps) { const q = at(t0 + t); if (!q || q.y < 1 || q.x < 1 || q.x > meta.W - 1) break; obs.push({ t: t + gs() * 0.003, x: q.x + gs() * 0.5, y: q.y + gs() * 0.5 }); }
  if (obs.length < 4) return null;
  const ball = { x: truth.ball.x + gs() * 0.3, y: truth.ball.y + gs() * 0.3, r: truth.ball.r * (1 + gs() * 0.15) };
  return { obs, ball, truth: { ...truth, path: P.map(p => ({ ...p, t: p.t - t0 })) }, meta };
}
function evalHp(hp, seeds) {
  globalThis.__TRK = { hp }; let e = 0, n = 0;
  for (const s of seeds) { const c = sample(s); if (!c) continue;
    const fit = T.fitFlight(c.obs, c.ball, c.meta.W, c.meta.H, { club: c.truth.club, dtf: 1 / c.meta.fps });
    const sc = score({ ok: true, path: fit.path, seen: c.obs.at(-1).t, est: { carry: fit.carry, side: fit.side, apex: fit.apex, speed: fit.p.v0 }, _W: c.meta.W, _H: c.meta.H }, c.truth, c.meta.H);
    e += Math.min(20, sc.shape) + 0.5 * Math.min(20, sc.path) + 0.05 * Math.min(100, Math.abs(sc.carry)); n++; }
  return e / n;
}
if (process.env.WORKER) {
  process.on('message', ({ hp, seeds }) => process.send(evalHp(hp, seeds)));
} else {
  const seeds = Array.from({ length: PATHS }, (_, i) => S0 + i), parts = Array.from({ length: JOBS }, (_, j) => seeds.filter((_, i) => i % JOBS === j));
  const ws = parts.map(() => fork(process.argv[1], [], { env: { ...process.env, WORKER: '1' } }));
  const ev = hp => Promise.all(ws.map((w, j) => new Promise(res => { w.once('message', res); w.send({ hp, seeds: parts[j] }); }))).then(a => a.reduce((x, y) => x + y, 0) / a.length);
  let best = { ...T.FIT_HP }, bf = await ev(best); console.log('current', JSON.stringify(best), bf.toFixed(3));
  let z = 7; const rnd = () => (z = (z * 16807) % 2147483647) / 2147483647;
  for (let k = 0; k < TRIALS; k++) {   // random local search (multiplicative steps)
    const hp = { ...best }; for (const key of Object.keys(hp)) if (rnd() < 0.5) hp[key] = +(hp[key] * Math.exp((rnd() - 0.5) * (k < TRIALS / 2 ? 0.8 : 0.4))).toFixed(3);
    const f = await ev(hp); if (f < bf) { bf = f; best = hp; console.log(`trial ${k + 1}: better ${f.toFixed(3)}`, JSON.stringify(hp)); }
  }
  console.log('best', JSON.stringify(best), bf.toFixed(3)); ws.forEach(w => w.kill());
}
