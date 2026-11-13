// Money game switched off → no draws, no money column
const { phone, open, createGang, record, mockdb } = require('../helpers');
module.exports = async t => {
  const P = await phone(t), H = await P.page();
  await open(t, H);
  const code = await createGang(H, { money: false });
  await H.fill('#addname', 'เบิร์ด'); await H.tap('[data-act=addp]'); await H.waitForTimeout(300);
  await H.tap('[data-tab=hole]');
  for (const k of [0, 1]) { await H.tap(`[data-act=editfor] >> nth=${k}`); await record(H, 1 + k, 1); }
  await H.waitForTimeout(2500);
  const g = (await mockdb(H)).games[code];
  t.ok('meta.money is false', g.meta.money === false);
  t.ok('no draws', !g.draws, g.draws);
  t.ok('no money column', !(await H.$$eval('table th', ths => ths.some(x => x.textContent === 'เสีย'))));
  t.ok('no page errors', !P.errs.length, P.errs);
  await P.ctx.close();
};
