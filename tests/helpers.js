// Shared helpers for specs
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 };
async function phone(t, init) {
  const ctx = await t.browser.newContext(PHONE); if (init) await ctx.addInitScript(init);
  const errs = []; ctx.on('page', p => p.on('pageerror', e => errs.push(e.message)));
  return { ctx, errs, page: async () => ctx.newPage() };
}
// open the app in mock mode with an optional seeded mock database
async function open(t, p, db, qs = 'mock=1&fast=1') {
  await p.goto(t.base + '?' + qs);
  await p.evaluate(d => { localStorage.clear(); sessionStorage.clear(); if (d) localStorage.setItem('golf_mockdb', JSON.stringify(d)); }, db || null);
  await p.reload(); await p.waitForSelector('[data-act=create]');
}
async function createGang(p, { name = 'ต้น', pin = '1234', course, money = true } = {}) {
  await p.tap('[data-act=create]');
  if (course) await p.fill('#c_course', course);
  if (!money) await p.tap('#c_money');
  await p.fill('#c_name', name); await p.fill('#c_pin', pin);
  await p.tap('[data-act=docreate]'); await p.waitForSelector('.qr svg');
  return p.$eval('.code', e => e.textContent);
}
async function join(t, p, code, name, pin = '1234') {
  await p.goto(`${t.base}?g=${code}&mock=1&fast=1`); await p.waitForSelector('#j_pin');
  await p.fill('#j_pin', pin); await p.tap('[data-act=checkpin]'); await p.waitForSelector('#j_name');
  await p.fill('#j_name', name); await p.tap('[data-act=joinnew]'); await p.waitForSelector('[data-act=inc]');
}
// first tap on "on" sets par-2; extra taps add one; first tap on putt sets 2
async function record(p, onTaps, puttTaps = 1) {
  for (let k = 0; k < onTaps; k++) await p.tap('[data-act=inc][data-f=on]');
  for (let k = 0; k < puttTaps; k++) await p.tap('[data-act=inc][data-f=putt]');
}
const mockdb = p => p.evaluate(() => JSON.parse(localStorage.getItem('golf_mockdb') || '{}'));
// close popups (the money-draw popup reveals its button after a short animation)
async function closeDialogs(p, ms = 8000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (!(await p.$('.dlg'))) return;
    const b = await p.$('.dlg [data-r]'); if (b) { await b.tap().catch(() => {}); }
    await p.waitForTimeout(200);
  }
}
module.exports = { phone, open, createGang, join, record, mockdb, closeDialogs };
