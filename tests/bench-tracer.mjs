// Shot Tracer benchmark on synthetic clips: node tests/bench-tracer.mjs [count=200] [firstSeed=1]
import { makeClip, score } from './synth-shot.mjs';
import { analyze } from '../practice/tracer.js';

const OPT = process.env.SYNTH ? JSON.parse(process.env.SYNTH) : {};
const N = +process.argv[2] || 200, S0 = +process.argv[3] || 1, verbose = process.argv.includes('-v');
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
    shape50: q(m('shape'), 0.5), shape90: q(m('shape'), 0.9), shapeGood: ok.filter(r => r.sc.shape < 3).length / rows.length, path50: q(m('path'), 0.5), path90: q(m('path'), 0.9), seen50: q(m('seen'), 0.5), land50: q(m('land'), 0.5), carry50: q(m('carry'), 0.5), carry90: q(m('carry'), 0.9), side50: q(m('side'), 0.5), speed50: q(m('speed'), 0.5), rows };
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const r = run(N, S0, verbose), f = x => x.toFixed(1);
  console.log(`clips ${r.n} (+${r.whiffs} whiffs) · found ${f(r.found * 100)}% · good (<5% path error) ${f(r.good * 100)}% · false tracer on whiff ${r.fp}/${r.whiffs} · ${r.ms.toFixed(0)} ms/clip`);
  console.log(`line shape error median ${f(r.shape50)}% / p90 ${f(r.shape90)}% · line within 3%: ${f(r.shapeGood * 100)}% of clips`);
  console.log(`path error median ${f(r.path50)}% / p90 ${f(r.path90)}% of frame height · while visible ${f(r.seen50)}% · landing point ${f(r.land50)}%`);
  console.log(`carry error median ${f(r.carry50)}% / p90 ${f(r.carry90)}% · side ${f(r.side50)} m · ball speed ${f(r.speed50)}%`);
  const by = k => { const g = {}; r.rows.forEach(x => { const v = x.meta[k] ?? x.truth[k]; (g[v] = g[v] || []).push(x); }); return Object.entries(g).map(([v, a]) => `${v}: ${f(a.filter(x => x.res.ok && x.sc.path < 5).length / a.length * 100)}% (${a.length})`).join(' · '); };
  console.log('by light  ', by('light')); console.log('by fps    ', by('fps')); console.log('by club   ', by('club'));
  const why = {}; r.rows.filter(x => !x.res.ok).forEach(x => { why[x.res.why] = (why[x.res.why] || 0) + 1; }); console.log('fail reasons', why);
}
