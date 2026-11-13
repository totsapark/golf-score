// Post-round analysis (analysis.js) + summary/history cards, on a made-up round
const path = require('path'), { pathToFileURL } = require('url');
const { phone, open, createGang } = require('../helpers');
const PARS = [4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4];
const KY = 110540, KX = 111320 * Math.cos(13 * Math.PI / 180);
// tee at lng offset per hole, green due north; drive lands at (dist, lateral) metres
function shotsFor(drives) {
  const holes = {}, shots = {};
  PARS.forEach((p, i) => {
    const lng = 101 + i * 0.004, tee = [13, lng], len = p === 3 ? 150 : p === 4 ? 360 : 470, green = [13 + len / KY, lng];
    holes['h' + i] = { tee, green, par: p };
    let t = 1e12 + i * 1e6; const s = {};
    if (p >= 4) { const [d, lat] = drives[i % drives.length]; s['s' + t] = { club: 'D', lat: 13, lng, t: t++ }; s['s' + t] = { club: '7i', lat: 13 + d / KY, lng: lng + lat / KX, t: t++ }; }
    else s['s' + t] = { club: '8i', lat: 13, lng, t: t++ };
    s['s' + t] = { club: 'Putter', lat: green[0], lng, t: t++ }; shots['h' + i] = s;
  });
  return { holes, shots };
}
module.exports = async t => {
  const A = await import(pathToFileURL(path.join(t.root, 'analysis.js')));
  const holes = {}; PARS.forEach((p, i) => { holes['h' + i] = { par: p, si: i + 1 }; });
  const sc = {}; PARS.forEach((p, i) => { sc['h' + i] = { on: p - 2 + (i % 3 === 0 ? 1 : 0), putt: i % 5 === 0 ? 3 : 2, tee: p >= 4 ? (i % 2 ? 's' : 'r') : undefined, ...(i === 7 ? { ob: 1 } : {}) }; });
  const G = { meta: {}, holes, players: { a: { name: 'A', joinedAt: 1 } }, scores: { a: JSON.parse(JSON.stringify(sc)) } };
  const b = A.breakdown(G, 'a');
  t.ok('breakdown parts add up to score vs par', b.pen + b.t2g + b.putt === b.over && b.over === 6 + 4 + 1, b);
  t.ok('levelOf: better stat → lower HCP level', A.levelOf('gir', 50) < A.levelOf('gir', 20) && A.levelOf('putts', 30) === 0 && A.levelOf('pen', 9) === 36);
  const c = A.coach(G, 'a');
  t.ok('coach names a strength and a weakness', c.strong && c.weak && c.strong.lvl < c.weak.lvl, { s: c.strong?.key, w: c.weak?.key });
  const R = A.race(G)[0];
  t.ok('race ends at total vs par', R.pts[18] === b.over && R.last === 18);
  const { holes: gh, shots } = shotsFor([[230, -25], [250, 20], [240, 0]]);
  const S = A.shotAnalysis({ ...G, shots: { a: shots } }, 'a', gh);
  const left = S.drives.find(d => d.lat < -15), right = S.drives.find(d => d.lat > 15);
  t.ok('drive distance and left/right from GPS', S.drives.length === PARS.filter(p => p >= 4).length && left && Math.abs(left.lat + 25) < 1 && right && Math.abs(right.lat - 20) < 1 && Math.abs(left.d - Math.hypot(230, 25)) < 2, S.drives.slice(0, 3));
  const tr = A.trend([{ date: '1', players: [{ name: 'A', gross: 90, par: 72, n: 18, putts: 36, g: 3 }] }, { date: '2', players: [{ name: 'A', gross: 43, par: 36, n: 9, putts: 16, g: 3 }] }], 'A');
  t.ok('trend normalises 9-hole rounds to 18', tr.length === 2 && tr[0].toPar === 18 && tr[1].toPar === 14, tr);

  // UI: summary cards + history trend
  const P = await phone(t), H = await P.page();
  await P.ctx.route(/arcgisonline|nominatim|overpass|mail\.ru/, r => r.abort());
  await open(t, H); const code = await createGang(H, { money: false });
  await H.evaluate(({ code, sc, PARS, gh, shots }) => {
    const db = JSON.parse(localStorage.getItem('golf_mockdb')), g = db.games[code], me = Object.keys(g.players)[0];
    PARS.forEach((p, i) => { g.holes['h' + i] = { par: p, si: i + 1 }; });
    g.players.pB = { name: 'เบิร์ด', hc: '', uid: '', color: '#1565c0', joinedAt: Date.now() + 1 };
    g.scores = { [me]: sc, pB: sc }; g.shots = { [me]: shots };
    db.geos = { [code]: { holes: gh, features: [], t: Date.now() } };
    localStorage.setItem('golf_mockdb', JSON.stringify(db));
    localStorage.setItem('golf2_hist', JSON.stringify([1, 2].map(k => ({ rid: 'R' + k, date: '2026-11-0' + k, course: 'X', holes: 18, par: 72, players: [{ name: 'ต้น', gross: 90 - k, net: 0, par: 72, n: 18, putts: 34, g: 4, money: 0, diff: 15 }] }))));
  }, { code, sc, PARS, gh, shots });
  await H.reload(); await H.waitForTimeout(600); await H.tap('[data-tab=sum]'); await H.waitForTimeout(600);
  const titles = await H.$$eval('.card h2', hs => hs.map(h => h.textContent).join('|'));
  for (const k of ['วิเคราะห์ฟอร์ม', 'สกอร์สะสมรายหลุม', 'หลุมยาก', 'ไดรฟ์ & ลูกเข้ากรีน']) t.ok(`summary shows "${k}"`, titles.includes(k), titles);
  t.ok('breakdown total shown', (await H.$eval('.bkrow.tot', e => e.innerText)).includes('+11'));
  await H.tap('[data-tab=gang]'); await H.tap('[data-act=home]'); await H.tap('[data-act=hist]'); await H.waitForTimeout(300);
  t.ok('history shows trend card', (await H.$$eval('.card h2', hs => hs.map(h => h.textContent).join('|'))).includes('แนวโน้มหลายรอบ'));
  t.ok('no page errors', !P.errs.length, P.errs);
  await P.ctx.close();
};
