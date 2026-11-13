// Signal lost while scoring → saved locally → delivered when signal returns; survives reload
const { phone, open, createGang, join, record, mockdb } = require('../helpers');
module.exports = async t => {
  const P = await phone(t), H = await P.page(), A = await P.page();
  await open(t, H);
  const code = await createGang(H);
  await join(t, A, code, 'เบิร์ด');
  await A.evaluate(() => window.__mockOffline(true));
  await record(A, 1, 1);
  const pid = await A.evaluate(c => Object.entries(JSON.parse(localStorage.getItem('golf_mockdb')).games[c].players).find(([, p]) => p.name === 'เบิร์ด')[0], code);
  let g = (await mockdb(H)).games[code];
  t.ok('offline score not on server yet', !g.scores?.[pid]?.h0);
  t.ok('offline score still shown on phone', (await A.$eval('#app', e => e.innerText)).includes('4'));
  await A.evaluate(() => window.__mockOffline(false)); await A.waitForTimeout(500);
  g = (await mockdb(H)).games[code];
  t.ok('score delivered after reconnect', g.scores?.[pid]?.h0?.on === 2, g.scores);
  await A.reload(); await A.waitForSelector('[data-act=inc]');
  t.ok('reload resumes the game (no restart)', (await A.$eval('#app', e => e.innerText)).includes('หลุม'));
  t.ok('no page errors', !P.errs.length, P.errs);
  await P.ctx.close();
};
