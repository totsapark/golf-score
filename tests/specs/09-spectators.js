// Spectators: join without playing → see live scores, not ranked, never in the money draw, can share lunch
const { phone, open, createGang, join, record, mockdb, closeDialogs } = require('../helpers');
module.exports = async t => {
  const P = await phone(t), H = await P.page(), A = await P.page(), W = await P.page();
  await open(t, H);
  const code = await createGang(H);
  await join(t, A, code, 'เบิร์ด');
  await W.goto(`${t.base}?g=${code}&mock=1&fast=1`); await W.waitForSelector('#j_pin');
  await W.fill('#j_pin', '1234'); await W.tap('[data-act=checkpin]'); await W.waitForSelector('#j_name');
  await W.fill('#j_name', 'พลอย'); await W.tap('[data-act=joinwatch]'); await W.waitForSelector('nav [data-tab=live]');
  await W.waitForTimeout(400);
  let g = (await mockdb(H)).games[code];
  const wid = Object.keys(g.players).find(k => g.players[k].name === 'พลอย');
  t.ok('spectator saved with role watch + lunch', g.players[wid].role === 'watch' && g.players[wid].lunch === true, g.players[wid]);
  t.ok('spectator lands on the live tab', await W.$eval('nav [data-tab=live]', e => e.classList.contains('on')).catch(() => false) || (await W.$eval('#app', e => e.innerText)).includes('ใครอยู่หลุมไหน'));
  t.ok('live tab lists the spectator as watching', (await W.$eval('#app', e => e.innerText)).includes('กำลังลุ้นอยู่'));
  t.ok('spectator sends no hole position', !g.pos?.[wid]);
  await W.tap('[data-tab=hole]'); await W.waitForTimeout(300);
  t.ok('spectator hole tab: no score steppers, spectator note', !(await W.$('[data-act=inc]')) && (await W.$eval('#app', e => e.innerText)).includes('คุณเข้าแก๊งแบบผู้ชม'));
  // players finish hole 1 → draw among 2 players only
  await H.tap('[data-tab=hole]'); await H.waitForSelector('[data-act=inc]');
  await record(H, 1, 1); await record(A, 2, 1);
  await W.waitForSelector('.dlg .pick', { timeout: 8000 }).catch(() => {}); await W.waitForTimeout(1600);
  g = (await mockdb(H)).games[code];
  t.ok('draw ranks only the 2 players', g.draws?.h0 && g.draws.h0.picks.every(r => r >= 1 && r <= 2), g.draws);
  t.ok('spectator popup says just watching', (await W.$eval('.dlg', e => e.innerText).catch(() => '')).includes('ลุ้นอย่างเดียว'));
  await closeDialogs(W); await closeDialogs(H); await closeDialogs(A);
  await W.tap('[data-tab=live]'); await W.waitForTimeout(300);
  const board = await W.$eval('table', e => e.innerText);
  t.ok('leaderboard has the players, not the spectator', board.includes('ต้น') && board.includes('เบิร์ด') && !board.includes('พลอย'), board);
  // lunch: bill 1000, pot 50 (20+20+10) → split over 2 players + 1 spectator = 317 each
  await H.tap('[data-tab=gang]'); await H.fill('[data-meta=lunch]', '1000'); await H.press('[data-meta=lunch]', 'Tab'); await H.waitForTimeout(300);
  t.ok('gang tab lists spectators', (await H.$eval('#app', e => e.innerText)).includes('ผู้ชม (1)'));
  await H.tap('[data-tab=sum]'); await H.waitForTimeout(400);
  const money = await H.$eval('.card:has(h2:text("ค่ากับข้าว"))', e => e.innerText);
  t.ok('lunch split includes the spectator', /317/.test(money) && money.includes('พลอย'), money);
  await H.tap('[data-tab=gang]'); await H.tap(`[data-act=lunchw][data-v=${wid}]`); await H.waitForTimeout(200);
  await H.tap('[data-tab=sum]'); await H.waitForTimeout(300);
  t.ok('spectator out of lunch → split over players only (475)', /475/.test(await H.$eval('.card:has(h2:text("ค่ากับข้าว"))', e => e.innerText)));
  await H.tap('[data-tab=gang]'); await H.tap(`[data-act=setrole][data-v=${wid}]`); await H.waitForTimeout(300);
  g = (await mockdb(H)).games[code];
  t.ok('host can turn a spectator into a player', !g.players[wid].role, g.players[wid]);
  t.ok('no page errors', !P.errs.length, P.errs);
  await P.ctx.close();

  // organiser who does not play
  const Q = await phone(t), O = await Q.page();
  await open(t, O);
  await O.tap('[data-act=create]'); await O.fill('#c_name', 'หมูกี้'); await O.tap('#c_role [data-v=watch]'); await O.fill('#c_pin', '1234');
  await O.tap('[data-act=docreate]'); await O.waitForSelector('.qr svg');
  const c2 = await O.$eval('.code', e => e.textContent);
  g = (await mockdb(O)).games[c2];
  t.ok('non-playing organiser: host + spectator', Object.values(g.players)[0].role === 'watch' && Object.values(g.players)[0].host === true);
  await O.fill('#addname', 'Not'); await O.tap('[data-act=addp]'); await O.waitForTimeout(200);
  await O.tap('[data-tab=hole]'); await O.waitForTimeout(300);
  t.ok('non-playing organiser can still record for players', (await O.$eval('#app', e => e.innerText)).includes('Not') && !!(await O.$('[data-act=inc]')));
  await record(O, 1, 1); await O.waitForTimeout(200);
  g = (await mockdb(O)).games[c2];
  const notId = Object.keys(g.players).find(k => g.players[k].name === 'Not');
  t.ok('score recorded for the player, not the organiser', g.scores?.[notId]?.h0?.on === 2 && Object.keys(g.scores).length === 1, g.scores);
  t.ok('no page errors (organiser)', !Q.errs.length, Q.errs);
  await Q.ctx.close();
};
