// Slow-motion auto-detect benchmark: clips are shown to the tracker as normal (60 fps), ×4 (120 fps footage) or ×8 (240 fps)
// with clip-time stamps only; analyzeAuto must pick the right speed and still draw a good line.
//   node tests/bench-slowmo.mjs [clips=150] [firstSeed=11000]
import { fork } from 'child_process';
import { makeClip, score } from './synth-shot.mjs';
import { analyzeAuto } from '../practice/tracer.js';
const [nA, sA] = process.argv.slice(2), N = +nA || 150, S0 = +sA || 11000, JOBS = +process.env.JOBS || 4, MODES = [[1, 60], [4, 120], [8, 240]];
function one(s) {
  const [slow, fps] = MODES[s % 3], { frames, truth, meta } = makeClip(s, { kind: 'normal', fps });
  const fr = frames.map(f => ({ g: f.g, W: f.W, H: f.H, c: 3 + f.t * slow })), res = analyzeAuto(fr, 3, { club: truth.club, scales: process.env.KNOWN ? [slow] : [1, 4, 8] });
  res._W = meta.W; res._H = meta.H; const sc = res.ok ? score(res, truth, meta.H) : null;
  return { slow, got: res.slow, ok: res.ok, shape: sc?.shape };
}
if (process.env.WORKER) { const [n, s0] = process.argv.slice(2).map(Number), rows = []; for (let s = s0; s < s0 + n; s++) rows.push(one(s)); process.send(rows, () => process.exit(0)); }
else {
  const per = Math.ceil(N / JOBS), rows = (await Promise.all(Array.from({ length: JOBS }, (_, j) => new Promise(r => fork(process.argv[1], [String(Math.max(0, Math.min(per, N - j * per))), String(S0 + j * per)], { env: { ...process.env, WORKER: '1' } }).on('message', r))))).flat();
  for (const [slow] of MODES) { const g = rows.filter(r => r.slow === slow), ok = g.filter(r => r.ok);
    console.log(`×${slow}: ${g.length} clips · line drawn ${ok.length} · right speed ${ok.filter(r => r.got === slow).length}/${ok.length} · line within 3% ${g.filter(r => r.ok && r.shape < 3).length} · wrong (>6%) ${g.filter(r => r.ok && r.shape > 6).length}`); }
}
