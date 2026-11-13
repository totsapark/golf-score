// Golf Live test runner: node tests/run.js [spec ...]
// Serves the app from the repo root, runs each spec in tests/specs (mock store, no real Firebase).
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), PORT = +process.env.PORT || 8790;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.mp4': 'video/mp4' };
const server = http.createServer((q, r) => {
  let f = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname));
  if (!f.startsWith(ROOT)) { r.writeHead(403); return r.end(); }
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' }); r.end(b); });
});
(async () => {
  await new Promise(res => server.listen(PORT, '127.0.0.1', res));
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  const want = process.argv.slice(2);
  const specs = fs.readdirSync(path.join(__dirname, 'specs')).filter(f => f.endsWith('.js')).sort().filter(f => !want.length || want.some(w => f.includes(w)));
  let pass = 0, fail = 0, skip = 0;
  for (const s of specs) {
    console.log(`\n▶ ${s}`);
    const t = {
      browser, base: `http://127.0.0.1:${PORT}/`, root: ROOT,
      ok(name, cond, detail) { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}${detail !== undefined ? ' — ' + JSON.stringify(detail) : ''}`); } },
      skip(why) { skip++; console.log(`  - skipped: ${why}`); },
    };
    try { await require(path.join(__dirname, 'specs', s))(t); } catch (e) { fail++; console.log(`  ✗ crashed: ${e.stack || e}`); }
  }
  await browser.close(); server.close();
  console.log(`\n${pass} passed, ${fail} failed${skip ? `, ${skip} skipped` : ''}`);
  process.exit(fail ? 1 : 0);
})();
