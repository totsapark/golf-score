# Golf Live tests

Browser tests that drive the app with Playwright in **mock mode** (`?mock=1`): data lives in the
browser's localStorage, so nothing touches the real Firebase project. Course data in these tests is
made up (synthetic shapes), not copied from any course database.

```bash
cd tests
npm install            # installs Playwright
npx playwright install chromium
npm test               # all specs
node run.js hazards    # only specs whose file name contains "hazards"
```

| Spec | What it checks |
|---|---|
| `01-golf-unit` | scoring, GIR, handicap strokes, money draw, handicap index, distance (pure `golf.js`) |
| `02-gang-flow` | create gang → join with PIN (wrong PIN rejected) → each records own score → live board + money draw |
| `03-money-off` | money game switched off: no draws, no money column |
| `04-offline` | signal lost: score kept on phone, delivered on reconnect, game resumes after reload |
| `05-battery` | screen-on lock released after idle and re-taken on touch, GPS off in background, battery-saver polling |
| `06-hazards` | course library search by alias, par/SI auto-fill, water/bunker reach & carry distances |
| `07-db-rules` | `database.rules.json` in the Firebase emulator: players can only edit their own scores/shots/location |

`07-db-rules` needs Java and the Realtime Database emulator jar
(`npx firebase-tools setup:emulators:database`); it is skipped when either is missing.
Set `RTDB_EMULATOR_JAR=/path/to/jar` to point at a jar elsewhere.

Useful app flags for manual testing: `?mock=1` (local fake database), `&fast=1` (no 20 s wait before
the money draw), and in the console `__mockOffline(true|false)` to simulate losing signal.
