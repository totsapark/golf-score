// Practice app: live setup check with the rear camera (vision.js on synthetic top-down scenes + fake camera video)
const path = require('path'), fs = require('fs'), os = require('os'), { pathToFileURL } = require('url');

// Synthetic top-down scene (portrait 360×640): green ground, ball above, two shoes below (left dark, right white), trousers to the bottom.
// Ball diameter 16 px = 4.27 cm → stance inner edges 97 ↔ 262 px = 165 px ≈ 44 cm.
function scene({ ballX = 110, ballY = 230, ball = true, gap = 165, W = 360, H = 640, seed = 1 } = {}) {
  const d = new Uint8ClampedArray(W * H * 4); let s = seed; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const Lin = 180 - gap / 2, Rin = 180 + gap / 2, feet = [[Lin - 22, [50, 50, 58]], [Rin + 22, [228, 228, 232]]];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let c = [60 + rnd() * 18, 128 + rnd() * 18, 58 + rnd() * 18];
    for (const [fx, fc] of feet) { const inShoe = ((x - fx) / 22) ** 2 + ((y - 400) / 55) ** 2 <= 1, inLeg = y > 430 && Math.abs(x - fx) < 20; if (inLeg) c = [40, 50, 90]; if (inShoe) c = fc; }
    if (ball && (x - ballX) ** 2 + (y - ballY) ** 2 <= 64) c = [246, 246, 244];
    const i = (y * W + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
  }
  return { data: d, width: W, height: H };
}
// downscale like the app does (160 px wide, box filter)
function shrink(img, w = 160) {
  const h = Math.round(w * img.height / img.width), o = new Uint8ClampedArray(w * h * 4), kx = img.width / w, ky = img.height / h;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const a = [0, 0, 0]; let n = 0;
    for (let yy = Math.floor(y * ky); yy < Math.floor((y + 1) * ky); yy++) for (let xx = Math.floor(x * kx); xx < Math.floor((x + 1) * kx); xx++) { const i = (yy * img.width + xx) * 4; a[0] += img.data[i]; a[1] += img.data[i + 1]; a[2] += img.data[i + 2]; n++; }
    const j = (y * w + x) * 4; o[j] = a[0] / n; o[j + 1] = a[1] / n; o[j + 2] = a[2] / n; o[j + 3] = 255; }
  return { data: o, width: w, height: h };
}
// write a looping fake-camera file (YUV4MPEG2, 4:2:0)
function y4m(file, img, frames = 6) {
  const { width: W, height: H, data: d } = img, Y = Buffer.alloc(W * H), U = Buffer.alloc(W * H / 4), V = Buffer.alloc(W * H / 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4, r = d[i], g = d[i + 1], b = d[i + 2]; Y[y * W + x] = 0.299 * r + 0.587 * g + 0.114 * b;
    if (!(x % 2) && !(y % 2)) { const k = (y / 2) * (W / 2) + x / 2; U[k] = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b; V[k] = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b; } }
  const parts = [Buffer.from(`YUV4MPEG2 W${W} H${H} F10:1 Ip A1:1 C420jpeg\n`)];
  for (let f = 0; f < frames; f++) parts.push(Buffer.from('FRAME\n'), Y, U, V);
  fs.writeFileSync(file, Buffer.concat(parts));
}

module.exports = async t => {
  const Vi = await import(pathToFileURL(path.join(t.root, 'practice', 'vision.js')));
  const DRIVER = { bp: 92, w: 1.1 };
  const run = o => { const r = Vi.analyze(shrink(scene(o))); return { r, m: Vi.measure(r, true, DRIVER, 40) }; };
  const ok = run({});
  t.ok('finds the ball (not the white shoe)', ok.r.ball && Math.abs(ok.r.ball.x - 110 * 160 / 360) < 1.5 && Math.abs(ok.r.ball.y - 230 * 160 / 360) < 1.5, ok.r.ball);
  t.ok('finds both feet inner edges', ok.r.feet && Math.abs(ok.r.feet.L.inner - 97 * 160 / 360) <= 2 && Math.abs(ok.r.feet.R.inner - 262 * 160 / 360) <= 2, ok.r.feet && [ok.r.feet.L.inner, ok.r.feet.R.inner]);
  t.ok('driver ball inside lead heel → green', ok.m && Vi.level(ok.m.errCm, ...Vi.BALL_TOL) === 'g' && Math.abs(ok.m.bp - 92) < 4, ok.m && { bp: ok.m.bp, err: ok.m.errCm });
  t.ok('stance width measured from ball size (~44 cm)', ok.m && Math.abs(ok.m.stanceCm - 44) < 4 && Vi.level(ok.m.wErr, ...Vi.STANCE_TOL) === 'g', ok.m && ok.m.stanceCm);
  const back = run({ ballX: 180 });
  t.ok('ball in the middle for driver → red, move toward lead foot by ~19 cm', back.m && Vi.level(back.m.errCm, ...Vi.BALL_TOL) === 'r' && back.m.errCm < 0 && Math.abs(Math.abs(back.m.errCm) - 70 * 4.27 / 16) < 3, back.m && back.m.errCm);
  const near = run({ ballX: 125 });
  t.ok('ball 4 cm off → yellow', near.m && Vi.level(near.m.errCm, ...Vi.BALL_TOL) === 'y', near.m && near.m.errCm);
  t.ok('left-handed (target on the right) flips lead/trail', Vi.measure(ok.r, false, { bp: 8, w: 1.1 }, 40) && Math.abs(Vi.measure(ok.r, false, { bp: 8, w: 1.1 }, 40).errCm) < 2.5);
  t.ok('no ball → nothing measured', !run({ ball: false }).r.ball && !run({ ball: false }).m);
  const narrow = run({ gap: 110, ballX: 180 - 55 + 9 });
  t.ok('narrow stance flagged', narrow.m && narrow.m.stanceCm < 33 && Vi.level(narrow.m.wErr, ...Vi.STANCE_TOL) === 'r', narrow.m && narrow.m.stanceCm);

  // ---- the live screen with a fake camera showing the scene ----
  const file = path.join(os.tmpdir(), 'golf-live-setup.y4m'); y4m(file, scene({}));
  const { chromium } = require('playwright');
  const br = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${file}`] });
  const ctx = await br.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, permissions: ['camera'] });
  const errs = []; const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.goto(t.base + 'practice/?nosw=1'); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForSelector('.ptile');
  await p.tap('[data-pa=go][data-v=setup]'); await p.tap('[data-pa=setk][data-v=D]'); await p.tap('[data-pa=go][data-v=live]');
  await p.waitForFunction(() => document.querySelector('#lban')?.className.includes('lb-g'), null, { timeout: 15000 }).catch(() => {});
  const ban = await p.$eval('#lban', e => [e.className, e.textContent]);
  t.ok('live screen: correct driver setup shows green', ban[0].includes('lb-g') && ban[1].includes('พอดี'), ban);
  t.ok('live screen: stance line shown', (await p.textContent('#lsub')).includes('ความกว้างการยืน'));
  // change the target to 7-iron (ball near centre) without leaving the camera → turns red, says move toward the trail foot
  await p.tap('[data-pa=lsetk][data-v=MI]');
  await p.waitForFunction(() => document.querySelector('#lban')?.className.includes('lb-r'), null, { timeout: 5000 }).catch(() => {});
  const ban2 = await p.$eval('#lban', e => [e.className, e.textContent]);
  t.ok('live screen: switching club target updates instantly (red, move toward trail foot)', ban2[0].includes('lb-r') && ban2[1].includes('เท้าหลัง'), ban2);
  // slider still adjusts the target: drag it back to the driver position → green again
  await p.$eval('[data-pi=bp]', e => { e.value = '92'; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); });
  await p.waitForFunction(() => document.querySelector('#lban')?.className.includes('lb-g'), null, { timeout: 5000 }).catch(() => {});
  t.ok('live screen: target slider still adjustable, camera keeps running', (await p.$eval('#lban', e => e.className)).includes('lb-g') && !!(await p.$('#lv')) && await p.$eval('#lv', v => !!v.srcObject));
  t.ok('7-iron target saved from the live screen', (await p.evaluate(() => JSON.parse(localStorage.getItem('golfpractice')).setup.MI.bp)) === 92);
  await p.screenshot({ path: path.join(os.tmpdir(), 'golf-live-setup.png') });
  t.ok('live screen: no page errors', errs.length === 0, errs);
  await br.close(); try { fs.unlinkSync(file); } catch (e) {}
};
