// Create gang → friends join with PIN → each records own score → live board + money draw
const { phone, open, createGang, join, record, mockdb, closeDialogs } = require('../helpers');
module.exports = async t => {
  const P = await phone(t), H = await P.page(), A = await P.page();
  await open(t, H);
  const code = await createGang(H, { course: 'Test Park' });
  t.ok('gang code shown', /^[A-Z0-9]{6}$/.test(code), code);
  await A.goto(`${t.base}?g=${code}&mock=1&fast=1`); await A.waitForSelector('#j_pin');
  await A.fill('#j_pin', '9999'); await A.tap('[data-act=checkpin]'); await A.waitForTimeout(300);
  t.ok('wrong PIN rejected', !!(await A.$('#j_pin')));
  await join(t, A, code, 'เบิร์ด');
  await H.tap('[data-tab=hole]'); await H.waitForSelector('[data-act=inc]');
  await record(H, 1, 1); // 2 + 2 = par
  await record(A, 2, 1); // 3 + 2 = bogey
  await H.waitForSelector('.dlg .pick', { timeout: 5000 }).catch(() => {}); await H.waitForTimeout(300);
  const db = (await mockdb(H)).games[code];
  t.ok('host score saved', db.scores && Object.values(db.scores).some(s => s.h0 && s.h0.on === 2 && s.h0.putt === 2), db.scores);
  t.ok('both players present', Object.keys(db.players).length === 2);
  t.ok('money drawn for hole 1 (default: last 2 pay + 1 random rank)', db.draws && db.draws.h0 && db.draws.h0.mode === 'last2' && db.draws.h0.picks.length === 1, db.draws);
  const pop = await H.$eval('.dlg', e => e.innerText).catch(() => '');
  t.ok('draw popup lists last place, second last and the random rank', /อันดับสุดท้าย/.test(pop) && /รองสุดท้าย/.test(pop) && /สุ่มได้อันดับ/.test(pop), pop);
  await closeDialogs(H); await closeDialogs(A);
  await H.tap('[data-tab=live]'); await H.waitForTimeout(300);
  const board = await H.$eval('table', e => e.innerText);
  t.ok('live board lists both players', board.includes('ต้น') && board.includes('เบิร์ด'), board);
  t.ok('no page errors', !P.errs.length, P.errs);
  await P.ctx.close();
};
