// Course library + hazard distances, on a made-up course (synthetic geometry, not real course data)
const { phone, open } = require('../helpers');
const pars = {}, si = {}; for (let i = 0; i < 18; i++) { pars['h' + i] = i % 3 ? 4 : 5; si['h' + i] = i + 1; }
const T = [13.0, 101.0], GR = [13.0036, 101.0];                      // tee → green ≈ 398 m north
const box = (a, b, c, d) => [[a, c], [a, d], [b, d], [b, c]];
const geo = { center: T, holes: { h0: { tee: T, green: GR, par: 5 } },
  features: [{ k: 'water', c: box(13.0018, 13.0022, 100.9995, 101.0005) },    // pond across the line ≈ 199–243 m
             { k: 'bunker', c: box(13.0027, 13.0029, 101.00026, 101.0004) }, // bunker right of the line ≈ 298–321 m
             { k: 'water', c: box(13.0010, 13.0012, 101.002, 101.0025) }] };  // far off the line → ignored
const db = { courses: { 'test-lake': { name: 'Test Lake Golf Club', aliases: ['ทะเลสาบทดสอบ'], holes: 18, pars, si } }, coursegeo: { 'test-lake': geo } };
module.exports = async t => {
  const P = await phone(t), H = await P.page();
  await P.ctx.route(/arcgisonline|nominatim|overpass|mail\.ru/, r => r.abort());
  await open(t, H, db);
  await H.tap('[data-act=create]'); await H.fill('#c_course', 'ทะเลสาบ'); await H.tap('[data-act=csearch]');
  await H.waitForSelector('#cs_res [data-k]', { timeout: 10000 });
  t.ok('library course found by alias', (await H.$eval('#cs_res', e => e.innerText)).includes('Test Lake'));
  await H.tap('#cs_res [data-k="0"]'); await H.waitForSelector('#c_geo .note', { timeout: 15000 });
  await H.fill('#c_name', 'ต้น'); await H.fill('#c_pin', '1234'); await H.tap('[data-act=docreate]'); await H.waitForSelector('.qr svg');
  const code = await H.$eval('.code', e => e.textContent);
  const g = await H.evaluate(c => JSON.parse(localStorage.getItem('golf_mockdb')).games[c], code);
  t.ok('par and stroke index filled from library', g.holes.h0.par === 5 && +g.holes.h3.si === 4, g.holes.h0);
  await H.tap('[data-tab=map]'); await H.waitForTimeout(800);
  const rows = await H.$$eval('#mhz > div', ds => ds.map(d => d.innerText.replace(/\s+/g, ' ').trim()));
  const nums = rows.map(r => (r.match(/\d+/g) || []).map(Number));
  t.ok('two hazards on the line (far pond ignored)', rows.length === 2, rows);
  t.ok('pond across: reach ≈ 218 yd, carry ≈ 266 yd', /ขวางหน้า/.test(rows[0] || '') && Math.abs(nums[0][0] - 218) <= 3 && Math.abs(nums[0][1] - 266) <= 3, rows[0]);
  t.ok('bunker on the right ≈ 326–351 yd', /ขวา/.test(rows[1] || '') && Math.abs(nums[1][0] - 326) <= 4 && Math.abs(nums[1][1] - 351) <= 4, rows[1]);
  t.ok('hazard labels drawn on map', (await H.$$('.mlbl.hzw')).length >= 2 && (await H.$$('.mlbl.hzb')).length >= 1);
  t.ok('no page errors', !P.errs.length, P.errs);
  await P.ctx.close();
};
