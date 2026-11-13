// database.rules.json against the Firebase Realtime Database emulator.
// Needs Java + the emulator jar (npx firebase-tools setup:emulators:database). Skipped otherwise.
const fs = require('fs'), path = require('path'), os = require('os'), { spawn, execSync } = require('child_process');
const PORT = 9123, NS = 'golftest', DB = `http://127.0.0.1:${PORT}`;
function findJar() {
  if (process.env.RTDB_EMULATOR_JAR) return process.env.RTDB_EMULATOR_JAR;
  const d = path.join(os.homedir(), '.cache/firebase/emulators');
  const j = fs.existsSync(d) && fs.readdirSync(d).filter(f => /^firebase-database-emulator-.*\.jar$/.test(f)).sort().pop();
  return j ? path.join(d, j) : null;
}
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const tok = uid => `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: uid, user_id: uid, iat: 1, exp: 9999999999, aud: NS, iss: 'https://securetoken.google.com/' + NS, firebase: { sign_in_provider: 'anonymous' } })}.`;
async function req(method, p, body, uid, owner) {
  const q = `?ns=${NS}${uid ? '&auth=' + tok(uid) : ''}`;
  const r = await fetch(DB + p + '.json' + q, { method, headers: owner ? { Authorization: 'Bearer owner' } : {}, body: body === undefined ? undefined : JSON.stringify(body) });
  return r.status;
}
module.exports = async t => {
  const jar = findJar();
  try { execSync('java -version', { stdio: 'ignore' }); } catch { return t.skip('java not installed'); }
  if (!jar || !fs.existsSync(jar)) return t.skip('RTDB emulator jar not found (run: npx firebase-tools setup:emulators:database)');
  const emu = spawn('java', ['-jar', jar, '--port', String(PORT)], { stdio: 'ignore' });
  try {
    for (let k = 0; k < 40; k++) { try { await fetch(DB + '/.json?ns=' + NS); break; } catch { await new Promise(r => setTimeout(r, 250)); } }
    const rules = fs.readFileSync(path.join(t.root, 'database.rules.json'), 'utf8');
    const lr = await fetch(`${DB}/.settings/rules.json?ns=${NS}`, { method: 'PUT', headers: { Authorization: 'Bearer owner' }, body: rules });
    t.ok('rules load', lr.status === 200, lr.status);
    await req('DELETE', '/', undefined, null, true);
    const H = 'host', A = 'alice', B = 'bob', X = 'stranger';
    const is = async (name, allowed, status) => t.ok(`${allowed ? 'allow' : 'deny '} ${name}`, (await status) === (allowed ? 200 : 401), await status);
    await is('host creates game', true, req('PUT', '/games/T1', { meta: { host: H, hostPid: 'pH' }, players: { pH: { name: 'H', uid: H, host: true }, pA: { name: 'A', uid: A } }, holes: { h0: { par: 4 } } }, H));
    await is('stranger overwrites game', false, req('PUT', '/games/T1', { meta: { host: X } }, X));
    await is('player writes own score', true, req('PUT', '/games/T1/scores/pA/h0', { on: 2, putt: 2 }, A));
    await is("player writes someone else's score", false, req('PUT', '/games/T1/scores/pH/h0', { on: 9, putt: 9 }, A));
    await is("host writes a player's score", true, req('PUT', '/games/T1/scores/pA/h1', { on: 3, putt: 2 }, H));
    await is('player writes own shot', true, req('PUT', '/games/T1/shots/pA/h0/s1', { club: 'D' }, A));
    await is("player writes someone else's shot", false, req('PUT', '/games/T1/shots/pH/h0/s1', { club: 'D' }, A));
    await is('player edits par', true, req('PUT', '/games/T1/holes/h0/par', 5, A));
    await is('player edits game settings', false, req('PUT', '/games/T1/meta/money', false, A));
    await is('host edits game settings', true, req('PUT', '/games/T1/meta/money', false, H));
    await is('new player joins', true, req('PUT', '/games/T1/players/pB', { name: 'B', uid: B }, B));
    await is("player renames someone else", false, req('PUT', '/games/T1/players/pA/name', 'X', B));
    await is('player makes self host', false, req('PUT', '/games/T1/players/pA/host', true, A));
    await is('player grabs meta/host', false, req('PUT', '/games/T1/meta/host', A, A));
    await is('first money draw', true, req('PUT', '/games/T1/draws/h0', { picks: [1, 2, 3] }, A));
    await is('money draw overwrite', false, req('PUT', '/games/T1/draws/h0', { picks: [3, 2, 1] }, B));
    await is('own live location', true, req('PUT', '/locs/T1/pA', { lat: 1 }, A));
    await is("someone else's live location", false, req('PUT', '/locs/T1/pB', { lat: 1 }, A));
    await is('signed-out read', false, req('GET', '/games/T1'));
    await is('host on new phone claims host slot', true, req('PATCH', '/games/T1/players/pH', { uid: 'H2' }, 'H2'));
    await is('host on new phone takes host rights', true, req('PUT', '/games/T1/meta/host', 'H2', 'H2'));
    await is('old host device loses rights', false, req('PUT', '/games/T1/meta/money', true, H));
    await is('player deletes game', false, req('DELETE', '/games/T1', undefined, A));
    await is('host deletes game', true, req('DELETE', '/games/T1', undefined, 'H2'));
  } finally { emu.kill(); }
};
