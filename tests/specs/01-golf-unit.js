// Pure scoring/money/handicap logic (golf.js) — no browser
const path = require('path'), { pathToFileURL } = require('url');
module.exports = async t => {
  const K = await import(pathToFileURL(path.join(t.root, 'golf.js')));
  const holes = {}; for (let i = 0; i < 18; i++) holes['h' + i] = { par: 4, si: i + 1 };
  const G = { meta: { code: 'T', amounts: [30, 20, 10] }, holes,
    players: { a: { name: 'A', hc: '18', joinedAt: 1 }, b: { name: 'B', hc: '0', joinedAt: 2 }, c: { name: 'C', hc: '', joinedAt: 3 } },
    scores: { a: { h0: { on: 2, putt: 2 } }, b: { h0: { on: 3, putt: 2, water: 1 } }, c: { h0: { on: 2, putt: 1 } } } };
  t.ok('score = on + putt + penalties', K.score(G, 'a', 0) === 4 && K.score(G, 'b', 0) === 6);
  t.ok('GIR when on <= par-2', K.gir(G, 'a', 0) && !K.gir(G, 'b', 0));
  t.ok('handicap 18 → one stroke per hole', K.hStrokes(G, 'a', 0) === 1 && K.net(G, 'a', 0) === 3);
  t.ok('no handicap → no strokes', K.hStrokes(G, 'c', 0) === 0);
  G.players.a.hc = '9';
  t.ok('handicap 9 → strokes only on SI 1–9', K.hStrokes(G, 'a', 0) === 1 && K.hStrokes(G, 'a', 9) === 0);
  t.ok('hole done when everyone scored', K.holeDone(G, 0) && !K.holeDone(G, 1));
  for (let n = 1; n <= 10; n++) { const p = K.makePicks(n); if (p.length !== Math.min(3, n) || new Set(p).size !== p.length || p.some(x => x < 1 || x > n)) { t.ok('makePicks distinct ranks in 1..n', false, { n, p }); break; } if (n === 10) t.ok('makePicks distinct ranks in 1..n', true); }
  G.draws = { h0: { picks: [3, 1, 2] } };
  const m = K.holeMoney(G, 0);  // order: C 3, A 4, B 6 → rank3=B pays 30, rank1=C pays 20, rank2=A pays 10
  t.ok('holeMoney pays the drawn ranks', m.pay.b === 30 && m.pay.c === 20 && m.pay.a === 10, m.pay);
  // last2: last place pays amounts[0], second last amounts[1], drawn rank pays amounts[2] on top (last two included)
  G.meta.moneyMode = 'last2'; G.meta.amounts = [20, 20, 10]; G.draws = { h0: { picks: [3], mode: 'last2' } };
  let m2 = K.holeMoney(G, 0);  // order: C 3, A 4, B 6 → last B 20, second last A 20, drawn rank 3 = B +10
  t.ok('last2: last two pay, drawn rank pays extra even if already last', m2.pay.b === 30 && m2.pay.a === 20 && !m2.pay.c, m2.pay);
  G.draws.h0.picks = [1]; m2 = K.holeMoney(G, 0);
  t.ok('last2: drawn rank 1 (best score) pays too', m2.pay.c === 10 && m2.pay.b === 20 && m2.pay.a === 20, m2.pay);
  t.ok('last2 draws one rank', K.drawPicks(G, 8).length === 1 && K.drawPicks({ meta: {} }, 8).length === 3);
  G.draws.h0 = { picks: [3, 1, 2] };
  t.ok('old draws (3 picks, no mode) keep the old rule after switching', K.holeMoney(G, 0).pay.b === 20 && K.holeMoney(G, 0).mode === 'rand3', K.holeMoney(G, 0));
  G.meta.moneyMode = undefined; G.meta.amounts = [30, 20, 10];
  G.meta.money = false;
  t.ok('money off → no picks', K.holeMoney(G, 0).picks === null);
  t.ok('handicap index needs 3 rounds', K.hIndex([10, 12]) === null && typeof K.hIndex([10, 12, 14]) === 'number');
  const d = K.dist([13, 101], [13.001, 101]);
  t.ok('dist ≈ 111 m per 0.001° lat', Math.abs(d - 110.6) < 1, d);
};
