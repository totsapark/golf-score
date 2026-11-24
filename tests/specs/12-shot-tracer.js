// Practice app: Shot Tracer (practice/tracer.js) on synthetic down-the-line clips + the swing screen end-to-end
// Clips come from tests/synth-shot.mjs (generated, no real footage; its physics and camera differ from the tracker's on purpose).
const path = require('path'), { pathToFileURL } = require('url');

module.exports = async t => {
  const Tr = await import(pathToFileURL(path.join(t.root, 'practice', 'tracer.js')));
  const Sy = await import(pathToFileURL(path.join(t.root, 'tests', 'synth-shot.mjs')));

  // ---- physics: carry / apex against published tour launch-monitor averages ----
  const REF = [['D', 167, 10.9, 2686, 32, 275], ['5i', 132, 12.1, 5361, 31, 194], ['7i', 120, 16.3, 7097, 32, 172], ['PW', 102, 24.2, 9304, 29, 136]];
  const phys = REF.map(([c, mph, la, spin, hy, cy]) => { const s = Tr.simulate({ v0: mph * 0.44704, la, spin, dir: 0, tilt: 0 }); return { c, carry: s.carry / (cy / 1.0936) - 1, apex: s.apex - hy / 1.0936 }; });
  t.ok('ball flight matches tour averages (carry within 6%, apex within 2.5 m)', phys.every(p => Math.abs(p.carry) < 0.06 && Math.abs(p.apex) < 2.5), phys);
  const fade = Tr.simulate({ v0: 59, la: 12, spin: 3000, dir: 0, tilt: 12 }), draw = Tr.simulate({ v0: 59, la: 12, spin: 3000, dir: 0, tilt: -12 });
  t.ok('spin axis tilt curves the ball (+ right, − left)', fade.side > 8 && draw.side < -8, [fade.side, draw.side]);
  const b1 = Tr.carryBand(150, 0.5, false), b2 = Tr.carryBand(150, 0.08, false), b3 = Tr.carryBand(150, 0.08, true);
  t.ok('carry range: wider when the ball was seen briefly, narrow with own club distances', b1.hi - b1.lo < b2.hi - b2.lo && b3.hi - b3.lo < b1.hi - b1.lo && b1.lo < 150 && b1.hi > 150);
  t.ok('shot shape names', Tr.shapeOf({ dir: 0, side: 0, carry: 150 }).name === 'ตรง' && Tr.shapeOf({ dir: 0, side: 12, carry: 150 }).name.includes('เฟด') && Tr.shapeOf({ dir: 0, side: -30, carry: 150 }).name.includes('ฮุก')
    && Tr.shapeOf({ dir: 0, side: 12, carry: 150 }, true).name.includes('ดรอว์'));

  // ---- detection + tracking + fit on synthetic clips (seeds never used for tuning) ----
  const rows = []; let fp = 0;
  for (let s = 5001; s <= 5040; s++) {
    const { frames, truth, meta } = Sy.makeClip(s, { kind: 'normal', hard: false }), res = Tr.analyze(frames, { club: truth.club }); res._W = meta.W; res._H = meta.H;
    rows.push(Sy.score(res, truth, meta.H));
  }
  for (let s = 6001; s <= 6006; s++) { const { frames, truth } = Sy.makeClip(s, { kind: 'whiff' }); if (Tr.analyze(frames, { club: truth.club }).ok) fp++; }
  const ok = rows.filter(Boolean), med = a => [...a].sort((x, y) => x - y)[a.length >> 1];
  t.ok('finds and follows the ball in ≥ 80% of clips', ok.length >= 32, ok.length + '/40');
  t.ok('drawn line within 3% of frame height of the true flight in ≥ 60% of clips', ok.filter(r => r.shape < 3).length >= 24, ok.filter(r => r.shape < 3).length + '/40');
  t.ok('median line error < 2% of frame height', med(ok.map(r => r.shape)) < 2, med(ok.map(r => r.shape)));
  t.ok('while the ball is visible the track is within 2.5% (median)', med(ok.map(r => r.seen)) < 2.5, med(ok.map(r => r.seen)));
  t.ok('no tracer on a missed swing (ball stays on the tee)', fp === 0, fp + '/6');
  // harder clips: moving clouds, leaves in the wind, camera shake, soft video → fewer lines, but almost never a wrong one
  const hard = []; for (let s = 7001; s <= 7040; s++) { const { frames, truth, meta } = Sy.makeClip(s, { kind: 'normal', hard: true }), res = Tr.analyze(frames, { club: truth.club }); res._W = meta.W; res._H = meta.H; hard.push(Sy.score(res, truth, meta.H)); }
  const hok = hard.filter(Boolean);
  t.ok('hard clips: line within 3% in ≥ 45%', hok.filter(r => r.shape < 3).length >= 18, hok.filter(r => r.shape < 3).length + '/40');
  t.ok('hard clips: a wrong line (> 6% off) in ≤ 5%', hok.filter(r => r.shape > 6).length <= 2, hok.filter(r => r.shape > 6).map(r => r.shape.toFixed(1)));
  const fr = Sy.makeClip(7003, { kind: 'normal', hard: true }).frames, a0 = fr[10].g, W0 = fr[10].W, H0 = fr[10].H, moved = new Uint8Array(W0 * H0);
  for (let y = 0; y < H0; y++) for (let x = 0; x < W0; x++) moved[y * W0 + x] = a0[Math.min(H0 - 1, y + 2) * W0 + Math.min(W0 - 1, x + 1)];
  const sh = Tr.shiftOf(a0, moved, W0, H0);
  t.ok('camera shake measured (frame moved by 1, 2 px)', Math.abs(sh[0] + 1) < 0.3 && Math.abs(sh[1] + 2) < 0.3, sh);
  // no sound: impact found by scanning the whole clip for the ball leaving the tee
  const cc = Sy.makeClip(5003, { kind: 'normal', fps: 60 }), cf = cc.frames.filter((f, i) => i % 4 === 0).map(f => ({ ...f, t: f.t + 0.65 }));
  const ci = Tr.coarseImpact(cf);
  t.ok('impact time without audio (coarse scan) within 2 coarse frames', ci != null && Math.abs(ci - 0.65 - cc.truth.impact) < 2 * 4 / 60, [ci, cc.truth.impact + 0.65]);

  // ---- end-to-end: import a synthetic slow-motion clip → tracer runs by itself → red line drawn → export a video ----
  const ctx = await t.browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, acceptDownloads: true });
  const errs = []; const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.goto(t.base + 'practice/?nosw=1');
  await p.evaluate(async () => { localStorage.clear(); await new Promise(r => { const q = indexedDB.deleteDatabase('golfpractice-swings'); q.onsuccess = q.onerror = q.onblocked = r; }); });
  await p.reload(); await p.waitForSelector('.ptile');
  // render the clip in the page (canvas → MediaRecorder): 120 fps frames recorded at 30 fps = ×4 slow motion
  const b64 = await p.evaluate(async () => {
    const { makeClip } = await import('/tests/synth-shot.mjs');
    const { frames, meta } = makeClip(4242, { kind: 'normal', fps: 120, light: 'night', portrait: true, club: '7i', hard: false });
    const cv = document.createElement('canvas'); cv.width = meta.W; cv.height = meta.H; const g = cv.getContext('2d'), img = g.createImageData(meta.W, meta.H);
    const show = f => { for (let q = 0; q < f.g.length; q++) { img.data[q * 4] = img.data[q * 4 + 1] = img.data[q * 4 + 2] = f.g[q]; img.data[q * 4 + 3] = 255; } g.putImageData(img, 0, 0); };
    show(frames[0]); const st = cv.captureStream(30), rec = new MediaRecorder(st, { mimeType: 'video/webm;codecs=vp8', videoBitsPerSecond: 6e6 }), ch = [];
    rec.ondataavailable = e => e.data.size && ch.push(e.data); const done = new Promise(r => { rec.onstop = r; }); rec.start();
    const t0 = performance.now();
    for (let k = 0; k < frames.length; k++) { show(frames[k]); const due = t0 + (k + 1) * 1000 / 30; while (performance.now() < due) await new Promise(r => setTimeout(r, Math.max(0, due - performance.now() - 1))); }
    rec.stop(); await done; const buf = new Uint8Array(await new Blob(ch).arrayBuffer()); let s = ''; for (let i = 0; i < buf.length; i += 32768) s += String.fromCharCode(...buf.subarray(i, i + 32768)); return btoa(s);
  });
  await p.tap('[data-pa=go][data-v=swings]'); await p.waitForSelector('#impvid', { state: 'attached' });
  await p.setInputFiles('#impvid', { name: 'shot.webm', mimeType: 'video/webm', buffer: Buffer.from(b64, 'base64') });
  await p.waitForSelector('#trbody [data-pa=trdtl]', { timeout: 20000 }).catch(() => {});
  t.ok('front-view clip: tracer asks for a down-the-line clip instead of guessing', !!(await p.$('#trbody [data-pa=trdtl]')));
  await p.selectOption('[data-pi=swslow]', '4'); await p.selectOption('[data-pi=swclub]', '7i');
  await p.tap('#trbody [data-pa=trdtl]');
  await p.waitForSelector('#trbody .trbar', { timeout: 10000 }).catch(() => {});
  t.ok('tracer starts by itself with a progress bar (no tapping on the ball)', !!(await p.$('#trbody .trbar')) || !!(await p.$('#trbody .trst')));
  await p.waitForFunction(() => document.querySelector('#trbody .trst') || document.querySelector('#trbody [data-pa=trrun]'), null, { timeout: 120000 }).catch(() => {});
  const st = await p.$$eval('#trbody .trst b', a => a.map(e => e.textContent)).catch(() => []);
  const ct = await p.textContent('#trbody .trcarry').catch(() => '');
  t.ok('carry estimate shown big with a likely range', /~\d+/.test(ct) && /\d+–\d+/.test(ct) && ct.includes('ซ้อมไดรฟ์'), ct);
  t.ok('finds the shot: ball speed, carry, apex, launch shown', st.length === 4 && +st[0] > 50 && +st[1] > 60, [st, await p.textContent('#trbody').catch(() => '')]);
  const meta = await p.evaluate(() => new Promise(res => { const r = indexedDB.open('golfpractice-swings', 1); r.onsuccess = () => { const q = r.result.transaction('meta').objectStore('meta').getAll(); q.onsuccess = () => res(q.result[0]); }; }));
  t.ok('trace saved with the clip (path + estimate, view switched to down-the-line)', meta?.view === 'dtl' && meta?.trace?.ok && meta.trace.path.length > 20 && meta.trace.est.carry > 0, meta?.trace && { ok: meta.trace.ok, n: meta.trace.n, why: meta.trace.why });
  // seek to the end: red tracer drawn over the video
  await p.$eval('#scrub', e => { e.value = 1000; e.dispatchEvent(new Event('input', { bubbles: true })); }); await p.waitForTimeout(800);
  const red = await p.$eval('#ov', cv => { const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] < 110 && d[i + 2] < 110 && d[i + 3] > 150) n++; return n; });
  t.ok('red tracer line drawn on the clip', red > 150, red);
  await p.tap('[data-pa=trshow]'); await p.waitForTimeout(200);
  const red2 = await p.$eval('#ov', cv => { const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] < 110 && d[i + 2] < 110 && d[i + 3] > 150) n++; return n; });
  t.ok('hide tracer button removes the line', red2 === 0, red2); await p.tap('[data-pa=trshow]');
  await p.tap('[data-pa=go][data-v=swings]'); await p.waitForSelector('.swc');
  t.ok('clip list shows the carry with 🎯', (await p.textContent('.swc')).includes('🎯'));
  await p.tap('.swc'); await p.waitForSelector('#trexp', { timeout: 15000 });
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 90000 }).catch(() => null), p.tap('#trexp')]);
  const size = dl ? (await require('fs').promises.stat(await dl.path())).size : 0;
  t.ok('export: new video file with the tracer burned in', size > 20000, size);
  t.ok('no page errors', !errs.length, errs);
  await ctx.close();
};
