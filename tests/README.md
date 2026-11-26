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
| `09-spectators` | join as spectator: live view only, not ranked, not in the money draw, optional lunch share, non-playing organiser |
| `07-db-rules` | `database.rules.json` in the Firebase emulator: players can only edit their own scores/shots/location |
| `08-analysis` | strokes-lost breakdown, HCP level per area, running score, drive dispersion from GPS, multi-round trend |
| `10-practice` | practice app (`/practice/`, separate from Golf Live): round log → plan, range-log stats, club gaps, wedge matrix, practice plan from history, setup card, tempo trainer, swing camera with a fake device (record, tag tempo, draw, star, compare) |
| `11-live-setup` | practice app live setup check: ball + feet found on synthetic top-down scenes (white shoe not mistaken for the ball), green/yellow/red, cm to move, stance width; live screen end-to-end with a fake camera video |
| `12-shot-tracer` | practice app Shot Tracer: ball-flight physics vs tour launch-monitor averages, ball found + tracked + fitted on 40 synthetic down-the-line clips (`synth-shot.mjs`), no tracer on a missed swing, harder clips (moving clouds, leaves, camera shake, soft video; 100 clips) rarely give a wrong line, trained models load and rank, shake measured, impact found without audio; swing screen end-to-end (import a ×4 slow-motion clip → traces by itself → red line drawn → hide/show → export a video with the line burned in) |

Synthetic clips: `synth-shot.mjs` renders down-the-line shots (sky/trees/grass, a swinging golfer and club, birds, people walking, a ball from the next bay, noise, motion blur; by default also moving clouds, leaves in the wind, camera shake, soft video and exposure drift — `{ hard: false }` turns those off) with its own ball physics and a random camera the tracker doesn't know. `node bench-tracer.mjs [count] [firstSeed] [-v]` scores the tracker on them (seeds 1–100, 1000–1399, 3000–3399 and 8000–8399 were used for tuning; report on others, e.g. 9000+). `JOBS=4` (default) runs in parallel, `DUMP=file.json` saves per-clip rows.

Training: `train-tracer.mjs cand|track [clips] [firstSeed]` makes labelled samples from synthetic clips (seeds 20000+ / 30000+) and trains the small models in `practice/tracer-model.js`; `tune-fit.mjs` tunes the flight fit's prior widths (`FIT_HP`) on synthetic trajectories (seeds 40000+).

`07-db-rules` needs Java and the Realtime Database emulator jar
(`npx firebase-tools setup:emulators:database`); it is skipped when either is missing.
Set `RTDB_EMULATOR_JAR=/path/to/jar` to point at a jar elsewhere.

Useful app flags for manual testing: `?mock=1` (local fake database), `&fast=1` (no 20 s wait before
the money draw), and in the console `__mockOffline(true|false)` to simulate losing signal.
