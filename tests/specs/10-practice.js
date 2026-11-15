// Practice app (/practice/, separate from Golf Live): round log → plan, range log stats, club gaps, setup card, tempo,
// swing camera with a fake camera device
const path = require('path'), { pathToFileURL } = require('url');
const { phone } = require('../helpers');
// open the practice app with clean storage (no service worker in tests)
async function openP(t, p) {
  await p.goto(t.base + 'practice/?nosw=1');
  await p.evaluate(async () => { localStorage.clear(); await new Promise(r => { const q = indexedDB.deleteDatabase('golfpractice-swings'); q.onsuccess = q.onerror = q.onblocked = r; }); });
  await p.reload(); await p.waitForSelector('.ptile');
}
const recorded = q => q.waitForFunction(() => { const v = document.querySelector('#sv'); return v && isFinite(v.duration) && v.duration > 1; }, null, { timeout: 15000 });

module.exports = async t => {
  const P = await import(pathToFileURL(path.join(t.root, 'practice', 'core.js')));
  // ---- pure ----
  const B = (c, q, dir, d, s = 1, sw) => ({ t: 1, s, c, q, dir, d, ...(sw ? { sw } : {}) });
  const balls = [B('7i', 'p', 'C', 140), B('7i', 'p', 'C', 144), B('7i', 'p', 'R', 150), B('7i', 'o', 'L', 120), B('7i', 'fat'), B('7i', 'thin'),
    B('6i', 'p', 'C', 146), B('6i', 'p', 'C', 148), B('6i', 'p', 'C', 150), B('8i', 'p', 'C', 120), B('8i', 'p', 'C', 124), B('8i', 'p', 'C', 122),
    B('PW', 'p', 'C', 60, 1, '9'), B('PW', 'p', 'C', 64, 1, '9'), B('PW', 'p', 'C', 95)];
  const g = P.groupStats(balls.filter(b => b.c === '7i'));
  t.ok('group stats: score, straight %, median carry of pure shots', g.n === 6 && g.score === Math.round(3.5 / 6 * 100) && g.straight === 50 && g.carry === 144, g);
  const rows = P.bagTable(balls, ['6i', '7i', '8i', 'PW']), r7 = rows.find(r => r.c === '7i');
  t.ok('bag table: gap to previous club flagged when too close', r7.gap === 4 && r7.warn === 'close' && rows.find(r => r.c === '8i').gap === 22, rows.map(r => [r.c, r.gap, r.warn]));
  t.ok('bag table: wedge part-swings kept out of full-swing distance', rows.find(r => r.c === 'PW').s.n === 1);
  const wm = P.wedgeMatrix(balls, ['PW']);
  t.ok('wedge matrix: half swing distance', wm[0].c === 'PW' && wm[0].cells[2].carry === 62 && wm[0].cells[0].carry === 95, wm[0].cells.map(c => c.carry));
  t.ok('range tip: repeated fat shots', P.rangeTip(P.groupStats([B('7i', 'fat'), B('7i', 'fat'), B('7i', 'fat'), B('7i', 'p', 'C'), B('7i', 'o', 'C')]))?.[1].includes('ตีดิน'));
  t.ok('tempo from tags (slow-mo factor)', Math.abs(P.tempoOf({ a: 1, top: 4.6, imp: 5.8 }, 4).ratio - 3) < 1e-9 && Math.abs(P.tempoOf({ a: 0, top: 0.9, imp: 1.2 }).bs - 0.9) < 1e-9);
  t.ok('setup key per club', P.setupKey('D') === 'D' && P.setupKey('5W') === 'FW' && P.setupKey('4H') === 'HY' && P.setupKey('5i') === 'LI' && P.setupKey('7i') === 'MI' && P.setupKey('9i') === 'SI' && P.setupKey('56°') === 'W');
  const pl0 = P.planFrom(null);
  t.ok('plan without rounds: estimated, 4 areas ranked by strokes', pl0.est && pl0.areas.length === 4 && pl0.areas[0].gain >= pl0.areas[3].gain && pl0.total > 3, pl0.areas.map(a => [a.k, a.gain.toFixed(1)]));
  const rounds = [1, 2, 3].map(k => ({ id: 'r' + k, date: '2026-10-0' + k, n: 18, gross: 105, par: 72, putts: 31, three: 1, pen: 8, fwN: 14, fwHit: 6, gir: 4, scrN: 14, scrO: 2 }));
  rounds.push({ id: 'r9', date: '2026-10-04', n: 9, gross: 52, par: 36, putts: null, pen: 4 });
  const f = P.formOf(rounds);
  t.ok('form from saved rounds (per 18, blank fields skipped)', f.rounds === 4 && f.pen === 8 && Math.abs(f.fir - 600 / 14) < 1e-9 && f.putts === 31 && Math.abs(f.toPar - (33 * 3 + 16) * 18 / 63) < 1e-9, f);
  const pl = P.planFrom(f);
  t.ok('plan from rounds: many penalties + good putting → tee shots first, putting last', pl.areas[0].k === 'tee' && pl.areas[3].k === 'putt' && !pl.est, pl.areas.map(a => [a.k, a.gain.toFixed(1)]));
  const sp = P.sessionPlan(pl, 60);
  t.ok('session plan fits the time', sp.warm + sp.blocks.reduce((s, b) => s + b.min, 0) <= 65 && sp.blocks[0].min > sp.blocks[3].min, sp);

  // ---- UI ----
  const { ctx, errs, page } = await phone(t); const p = await page();
  await openP(t, p);
  t.ok('practice app opens on its own (8 tools, no Golf Live screens)', (await p.$$('.ptile')).length === 8 && !(await p.$('[data-act=create]')));
  await p.tap('[data-pa=go][data-v=plan]'); await p.waitForSelector('.parea');
  t.ok('plan without rounds uses typical numbers', (await p.textContent('#app')).includes('ยังไม่มีรอบที่บันทึก'));
  await p.tap('[data-pa=go][data-v=rform]'); await p.waitForSelector('#rf_gross');
  await p.tap('[data-pa=rsave]'); t.ok('round form: score required', !!(await p.$('#rf_gross')));
  await p.fill('#rf_gross', '108'); await p.fill('#rf_putts', '38'); await p.fill('#rf_pen', '3'); await p.fill('#rf_fwHit', '5'); await p.fill('#rf_gir', '2'); await p.fill('#rf_scrO', '1');
  await p.tap('[data-pa=rsave]'); await p.waitForSelector('.parea');
  const rr = await p.evaluate(() => JSON.parse(localStorage.getItem('golfpractice')).rounds[0]);
  t.ok('round saved (par/fairway defaults, scramble chances from GIR)', rr.gross === 108 && rr.par === 72 && rr.fwN === 14 && rr.scrN === 16 && rr.three === null, rr);
  const planTxt = await p.textContent('#app');
  t.ok('plan uses the saved round and lists drills', planTxt.includes('1 รอบล่าสุดที่บันทึก') && planTxt.includes('108') && (await p.$$('.drl')).length >= 8, planTxt.slice(0, 200));
  await p.tap('.drl'); await p.waitForSelector('.dlg'); await p.tap('.dlg [data-r=done]');
  await p.waitForSelector('.drl i');
  t.ok('drill marked done this week', (await p.textContent('.drl i')).includes('1'));
  await p.goBack(); await p.waitForSelector('.ptile');
  t.ok('phone back button: plan → menu', true);
  await p.goBack(); await p.waitForTimeout(300);
  t.ok('back on the menu leaves nothing broken', p.url().includes('practice'));
  await p.goto(t.base + 'practice/?nosw=1'); await p.waitForSelector('.ptile');

  await p.tap('[data-pa=go][data-v=range]'); await p.waitForSelector('.rbtn');
  await p.tap('[data-pa=club][data-v="7i"]');
  await p.fill('#pdist', '150');
  await p.tap('[data-pa=hit][data-q=p][data-dir=C]'); await p.tap('[data-pa=hit][data-q=p][data-dir=C]');
  await p.tap('[data-pa=hit][data-q=o][data-dir=R]'); await p.tap('[data-pa=hit][data-q=fat]'); await p.tap('[data-pa=hit][data-q=fat]');
  let fg = await p.$$eval('.fgrid b', e => e.map(x => x.textContent));
  t.ok('range: live stats for the club (5 balls, score, distance)', fg[0] === '5' && fg[1] === '50%' && fg[3] === '150', fg);
  await p.tap('[data-pa=undo]'); fg = await p.$$eval('.fgrid b', e => e.map(x => x.textContent));
  t.ok('range: undo last ball', fg[0] === '4', fg);
  const stored = await p.evaluate(() => JSON.parse(localStorage.getItem('golfpractice')).balls);
  t.ok('range: distance stored in metres (yards entered)', stored.length === 4 && Math.abs(stored[0].d - 150 / 1.09361) < 0.1, stored[0]);
  await p.tap('[data-pa=endsess]'); await p.waitForSelector('table');
  const bagTxt = await p.textContent('#app');
  t.ok('bag view shows 7i distance and session', bagTxt.includes('150') && bagTxt.includes('เซสชันที่ผ่านมา'));
  await p.tap('[data-pa=go][data-v=menu]'); await p.tap('[data-pa=unit][data-v=m]'); await p.tap('[data-pa=go][data-v=bag]');
  t.ok('unit switch: distances shown in metres', (await p.textContent('#app')).includes('137'));
  await p.tap('[data-pa=go][data-v=menu]'); await p.tap('[data-pa=unit][data-v=y]');

  await p.tap('[data-pa=go][data-v=setup]'); await p.waitForSelector('.stance');
  await p.tap('[data-pa=setk][data-v=D]');
  await p.$eval('[data-pi=bp]', e => { e.value = '70'; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); });
  await p.waitForSelector('[data-pa=setreset]');
  await p.fill('[data-pi=note]', 'ทีสูงขึ้น'); await p.$eval('[data-pi=note]', e => e.dispatchEvent(new Event('change', { bubbles: true })));
  const su = await p.evaluate(() => JSON.parse(localStorage.getItem('golfpractice')).setup.D);
  t.ok('setup card: own ball position + note saved', su.bp === 70 && su.note === 'ทีสูงขึ้น', su);
  t.ok('setup card: recommended position shown when changed', (await p.textContent('.stance')).includes('แนะนำ'));

  await p.tap('[data-pa=go][data-v=menu]'); await p.tap('[data-pa=go][data-v=tempo]'); await p.waitForSelector('#tgo');
  await p.tap('[data-pa=tk][data-v="2"]'); await p.tap('#tgo'); await p.waitForTimeout(1400);
  const ph = await p.textContent('#tph'); const x2 = await p.getAttribute('#tclub', 'x2');
  t.ok('tempo trainer runs (club moves)', ph.length > 0 && x2 !== '120', { ph, x2 });
  await p.tap('#tgo'); t.ok('tempo trainer stops', (await p.textContent('#tgo')).includes('เริ่ม'));
  await p.tap('#back'); await p.waitForSelector('.ptile');
  t.ok('header back button returns to menu and hides there', await p.$eval('#back', e => e.hidden));
  // Golf Live is untouched: no practice entry on its home screen
  await p.goto(t.base + '?mock=1'); await p.waitForSelector('[data-act=create]');
  t.ok('Golf Live home has no practice button', !(await p.$('[data-act=practice]')));
  t.ok('no page errors', errs.length === 0, errs);
  await ctx.close();

  // ---- swing camera with a fake camera ----
  const { chromium } = require('playwright');
  const br = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
  const c2 = await br.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, permissions: ['camera', 'microphone'] });
  const e2 = []; const q = await c2.newPage(); q.on('pageerror', e => e2.push(e.message));
  await openP(t, q);
  await q.tap('[data-pa=go][data-v=cam]');
  await q.waitForFunction(() => document.querySelector('#pv')?.videoWidth > 0, null, { timeout: 10000 });
  await q.tap('[data-pa=camcd][data-v="0"]'); await q.tap('[data-pa=camlen][data-v="3"]');
  await q.tap('#recbtn');
  await q.waitForSelector('#sv', { timeout: 15000 });
  await q.waitForFunction(() => document.querySelector('#swh')?.textContent.includes('7i'), null, { timeout: 10000 });
  await recorded(q);
  t.ok('camera: clip recorded, saved and opened for review', true);
  await q.tap('[data-pa=step][data-v="1"]'); await q.tap('[data-pa=step][data-v="1"]'); await q.waitForTimeout(200);
  await q.tap('[data-pa=tag][data-v=a]');
  await q.$eval('#sv', v => { v.currentTime = 0.9; }); await q.waitForTimeout(300); await q.tap('[data-pa=tag][data-v=top]');
  await q.$eval('#sv', v => { v.currentTime = 1.2; }); await q.waitForTimeout(300); await q.tap('[data-pa=tag][data-v=imp]');
  await q.waitForFunction(() => document.querySelector('#tempo')?.textContent.includes(': 1'));
  t.ok('swing review: tags give a tempo ratio', (await q.textContent('#tempo')).includes('จังหวะ'));
  await q.tap('[data-pa=tool][data-v=line]');
  const bx = await q.$eval('#ov', e => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; });
  await q.mouse.move(bx[0] + bx[2] * 0.3, bx[1] + bx[3] * 0.3); await q.mouse.down(); await q.mouse.move(bx[0] + bx[2] * 0.7, bx[1] + bx[3] * 0.7, { steps: 5 }); await q.mouse.up();
  await q.tap('[data-pa=star]'); await q.waitForTimeout(300);
  const meta = await q.evaluate(async () => { const { SW } = await import('./practice.js'); return SW.list(); });
  t.ok('swing saved with tags, drawing and star', meta.length === 1 && meta[0].tags.top === 0.9 && meta[0].draw.length === 1 && meta[0].star, meta[0] && { tags: meta[0].tags, draw: meta[0].draw.length, star: meta[0].star });
  // second clip → compare
  await q.tap('[data-pa=go][data-v=cam]'); await q.waitForFunction(() => document.querySelector('#pv')?.videoWidth > 0, null, { timeout: 10000 });
  await q.tap('[data-pa=camcd][data-v="0"]'); await q.tap('#recbtn'); await q.waitForSelector('#sv', { timeout: 15000 });
  await recorded(q);
  await q.tap('[data-pa=cmp]'); await q.waitForFunction(() => document.querySelectorAll('#cmpwith option').length === 1 && document.querySelector('#c1').readyState >= 1, null, { timeout: 10000 });
  t.ok('compare: picks the starred swing of the same club', (await q.textContent('#l1')).includes('⭐'));
  await q.tap('[data-pa=cstep][data-v="1"]');
  await q.tap('[data-pa=go][data-v=swing]'); await q.tap('[data-pa=go][data-v=swings]'); await q.waitForSelector('.swc');
  t.ok('clip list shows both clips', (await q.$$('.swc')).length === 2);
  t.ok('camera: no page errors', e2.length === 0, e2);
  await br.close();
};
