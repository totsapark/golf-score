// Shot Tracer benchmark on synthetic clips: node tests/bench-tracer.mjs [count=200] [firstSeed=1]
import { makeClip, score } from './synth-shot.mjs';
import { analyze } from '../practice/tracer.js';

const OPT = process.env.SYNTH ? JSON.parse(process.env.SYNTH) : {};
const N = process.argv[2] != null ? +process.argv[2] : 200, S0 = +process.argv[3] || 1, verbose = process.argv.includes('-v');
export function run(n, s0, log) {
  const rows = []; let fp = 0, whiffs = 0, ms = 0;
  for (let s = s0; s < s0 + n; s++) {
    const { frames, truth, meta } = makeClip(s, OPT), t = Date.now();
    const tc = process.env.TRUECAM ? { cam: { hc: meta.cam.hc, f: meta.cam.f * Math.max(meta.W, meta.H), D: meta.cam.f * Math.max(meta.W, meta.H) * 0.02135 / truth.ball.r } } : {};
    const res = analyze(frames, { club: truth.club, ...tc, ...(process.env.TOPT ? JSON.parse(process.env.TOPT) : {}) }); ms += Date.now() - t; res._W = meta.W; res._H = meta.H;
    if (truth.kind === 'whiff') { whiffs++; if (res.ok) fp++; continue; }
    const sc = score(res, truth, meta.H);
    rows.push({ s, meta, truth, res, sc });
    if (log) console.log(s, meta.light, meta.fps + 'fps', meta.W + 'x' + meta.H, truth.club, truth.kind, res.ok ? `path ${sc.path.toFixed(1)}% seen ${sc.seen.toFixed(1)}% land ${sc.land.toFixed(1)}% carry ${sc.carry.toFixed(0)}% side ${sc.side.toFixed(0)}m n=${res.n}` : 'FAIL ' + res.why);
  }
  const ok = rows.filter(r => r.res.ok), q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN; };
  const m = k => ok.map(r => Math.abs(r.sc[k]));
  return { n: rows.length, found: ok.length / rows.length, good: ok.filter(r => r.sc.path < 5).length / rows.length, fp, whiffs, ms: ms / n,
    shape50: q(m('shape'), 0.5), shape90: q(m('shape'), 0.9), shapeGood: ok.filter(r => r.sc.shape < 3).length / rows.length, wrong: ok.filter(r => r.sc.shape > 6).length / rows.length, path50: q(m('path'), 0.5), path90: q(m('path'), 0.9), seen50: q(m('seen'), 0.5), land50: q(m('land'), 0.5), carry50: q(m('carry'), 0.5), carry90: q(m('carry'), 0.9), side50: q(m('side'), 0.5), speed50: q(m('speed'), 0.5), rows };
}
// parallel: split seeds across worker processes (JOBS=4); each prints its rows as JSON
import { fork } from 'child_process';
const slim = x => ({ s: x.s, meta: x.meta, truth: { club: x.truth.club, kind: x.truth.kind, carry: x.truth.carry }, res: { ok: x.res.ok, why: x.res.why, seen: x.res.seen, n: x.res.n, rms: x.res.rms, diag: x.res.diag, r: x.res.ball?.r }, sc: x.sc });
async function runPar(n, s0, jobs) {
  const per = Math.ceil(n / jobs), parts = await Promise.all(Array.from({ length: jobs }, (_, j) => new Promise(res => {
    const c = fork(process.argv[1], [String(Math.max(0, Math.min(per, n - j * per))), String(s0 + j * per)], { env: { ...process.env, WORKER: '1', JOBS: '1' } }); c.on('message', res); })));
  const rows = parts.flatMap(p => p.rows), ok = rows.filter(r => r.res.ok), q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN; }, m = k => ok.map(r => Math.abs(r.sc[k]));
  return { n: rows.length, found: ok.length / rows.length, good: ok.filter(r => r.sc.path < 5).length / rows.length, fp: parts.reduce((a, p) => a + p.fp, 0), whiffs: parts.reduce((a, p) => a + p.whiffs, 0), ms: parts.reduce((a, p) => a + p.ms, 0) / jobs,
    shape50: q(m('shape'), 0.5), shape90: q(m('shape'), 0.9), shapeGood: ok.filter(r => r.sc.shape < 3).length / rows.length, wrong: ok.filter(r => r.sc.shape > 6).length / rows.length, path50: q(m('path'), 0.5), path90: q(m('path'), 0.9), seen50: q(m('seen'), 0.5), land50: q(m('land'), 0.5), carry50: q(m('carry'), 0.5), carry90: q(m('carry'), 0.9), side50: q(m('side'), 0.5), speed50: q(m('speed'), 0.5), rows };
}
if (process.env.DUMP) process.on('exit', () => {});
if (process.env.WORKER) { const r = run(N, S0, false); process.send({ rows: r.rows.map(slim), fp: r.fp, whiffs: r.whiffs, ms: r.ms }, () => process.exit(0)); }
else if (import.meta.url === `file://${process.argv[1]}`) {
  const jobs = +process.env.JOBS || 4, r = jobs > 1 ? await runPar(N, S0, jobs) : run(N, S0, verbose), f = x => x.toFixed(1);
  console.log(`clips ${r.n} (+${r.whiffs} whiffs) · found ${f(r.found * 100)}% · good (<5% path error) ${f(r.good * 100)}% · false tracer on whiff ${r.fp}/${r.whiffs} · ${r.ms.toFixed(0)} ms/clip`);
  console.log(`line shape error median ${f(r.shape50)}% / p90 ${f(r.shape90)}% · line within 3%: ${f(r.shapeGood * 100)}% of clips · wrong line (>6% off) ${f(r.wrong * 100)}%`);
  console.log(`path error median ${f(r.path50)}% / p90 ${f(r.path90)}% of frame height · while visible ${f(r.seen50)}% · landing point ${f(r.land50)}%`);
  console.log(`carry error median ${f(r.carry50)}% / p90 ${f(r.carry90)}% · side ${f(r.side50)} m · ball speed ${f(r.speed50)}%`);
  const by = k => { if (k === 'cond') { const g = {}; r.rows.forEach(x => ['clouds', 'leaves', 'shake', 'soft'].forEach(c => { if (x.meta[c]) (g[c] = g[c] || []).push(x); })); return Object.entries(g).map(([v, a]) => `${v}: ${f(a.filter(x => x.res.ok && x.sc.shape < 3).length / a.length * 100)}% (${a.length})`).join(' · '); }
     const g = {}; r.rows.forEach(x => { const v = x.meta[k] ?? x.truth[k]; (g[v] = g[v] || []).push(x); }); return Object.entries(g).map(([v, a]) => `${v}: ${f(a.filter(x => x.res.ok && x.sc.path < 5).length / a.length * 100)}% (${a.length})`).join(' · '); };
  if (process.env.DUMP) (await import('fs')).writeFileSync(process.env.DUMP, JSON.stringify(r.rows.map(slim)));
  console.log('line<3% by condition', by('cond')); console.log('by light  ', by('light')); console.log('by fps    ', by('fps')); console.log('by club   ', by('club'));
  const why = {}; r.rows.filter(x => !x.res.ok).forEach(x => { why[x.res.why] = (why[x.res.why] || 0) + 1; }); console.log('fail reasons', why);
}
