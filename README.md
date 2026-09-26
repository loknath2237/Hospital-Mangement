# Real-Time Hospital Bed & ICU Allocation Engine

DAA capstone project — full-stack app: **React frontend + Express backend + SQLite database**,
built around a dynamic priority-queue allocation engine, wrapped in an **admin-first UI** that
hides the algorithm entirely behind a login screen and a plain-language workflow.

This has been run and tested end-to-end (backend API, authentication, database persistence, SSE
live updates, and the frontend talking to it through the real dev workflow below) — not just
written and hoped.

---

## 1. What's actually running here

- **Frontend**: React + Vite, plain hand-written CSS. Login-gated. Sidebar nav: Dashboard,
  **+ New Patient**, **🚨 Emergency Patient**, Patients, Beds & Rooms, Alerts, Resources. Talks
  to the backend over `fetch` + Server-Sent Events, so every connected browser tab sees live
  updates the instant anything changes.
- **Backend**: Node.js + Express. Owns the actual simulation — priority queue, feasibility
  filter, allocation/reallocation logic all run here, not in the browser. Session-cookie
  authentication guards every route except login. Exposes a REST API and an SSE stream
  (`/api/events/stream`) that pushes the full state to every connected, authenticated client.
- **Database**: SQLite via Node's **built-in** `node:sqlite` module (real embedded relational
  database — no npm package, no native compilation, nothing to install). Admin account, patient
  records, the allocation/event audit log, alerts, and FCFS/Static/Dynamic run-history
  comparisons are durably persisted — they survive a server restart. The live in-memory priority
  queue does not (see "Architecture notes" for why).

## 2. Login

Default admin account, seeded automatically on first backend start:

```
Username: admin
Password: admin123
```

Change it via `backend/.env` (`ADMIN_USERNAME`, `ADMIN_PASSWORD`) **before** the first run — the
account is only seeded once, the first time the database is created. To reset it, stop the
server, delete `backend/dev.db`, and start again.

## 3. How to run it

Two terminals (or two VS Code integrated terminals) — one for backend, one for frontend.
Requires **Node.js 22.5 or newer** (`node:sqlite` is built into Node from 22.5 onward — check
your version with `node -v`; if you're older than that, update Node rather than trying to work
around it). Tested on Node 22 and Node 24.

**Terminal 1 — backend:**
```bash
cd backend
npm install
npm run dev
```
You should see `Hospital allocation backend listening on http://localhost:4000` and a line
confirming the seeded admin account. A `dev.db` SQLite file is created automatically on first run.

**Terminal 2 — frontend:**
```bash
cd frontend
npm install
npm run dev
```
Open the URL Vite prints (default `http://localhost:5173`). Log in with the credentials above.
The frontend dev server proxies `/api/*` to the backend on port 4000 (`frontend/vite.config.js`)
— cookies flow through that proxy automatically, no extra config needed.

### Quick sanity check without the UI
Every route except login requires a session cookie, so a plain `curl http://localhost:4000/api/state`
will return `401`. To check the API directly:
```bash
curl -c cookies.txt -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" -d '{"username":"admin","password":"admin123"}'
curl -b cookies.txt http://localhost:4000/api/state
curl -b cookies.txt -X POST "http://localhost:4000/api/patients/quick?emergency=true"
```

### Backend self-test (pure algorithm, no server/DB/auth)
```bash
cd backend
npm run selftest
```

## 3.5. New Patient form: name field + voice input

**Patient name** is now a plain optional text field on the New Patient / Emergency Patient form,
stored and shown alongside the system-generated ID everywhere a patient appears (Patients list,
Beds & Rooms tooltips, reallocation cards). Leave it blank and the patient is just referred to by
ID, same as before — nothing else changes.

**Voice fill** (Chrome/Edge only — uses the browser's built-in Web Speech API, which Firefox and
Safari don't support; the microphone button simply doesn't appear in unsupported browsers). Click
**Voice Fill**, then speak a field name ("age", "severity", "condition", "mobility", "length of
stay", "isolation", "surgery", "emergency", "icu", "equipment", "name", ...) — the matching field
gets outlined — then speak the value ("thirty", "severe", "cardiac event", "bedridden", "yes").
You can also say both in one breath ("age thirty"). Numbers, plain-language scale labels
("severe", "self-care only"), and yes/no answers are all understood; unrecognized input shows a
status message rather than failing silently, and you can always just type instead.

**Being straight about what's actually verified here:** the command-parsing logic (`frontend/src/voice.js`
— matching a spoken field name, parsing numbers/labels/yes-no answers, the two-step and
single-utterance interaction flow) has a full automated test suite and every case in it passes.
The actual browser speech recognition wiring is built correctly against the documented Web Speech
API, but real microphone input in a real browser is something I have no way to test from here —
there's no browser or microphone in this environment. **Try it yourself before relying on it in
front of an audience**, and have the keyboard as your fallback either way.

## 4. Project structure

```
backend/
  schema.sql        # SQLite schema — admins, patients, allocation_events, alerts, run_history
  src/
    engine.js        # Core DAA logic: IndexedPriorityQueue, feasibility filter, ranking,
                      # allocation cycle, reallocation (recommend+confirm / urgent auto-move),
                      # emergency/overflow handling
    auth.js           # Password hashing (scrypt), session tokens, cookie helpers, auth middleware
    db.js              # node:sqlite persistence layer (built into Node — no npm install needed)
    server.js           # Express routes + auth gate + SSE broadcast + server-side auto-run
frontend/
  src/
    App.jsx        # Login gate + sidebar shell + page routing
    api.js          # fetch wrapper for the backend REST API (credentials included)
    lib.js           # Shared plain-language labels (Critical/High/Moderate/Low, never P1-P4)
    voice.js          # Voice-fill command parser (field/value detection) — unit-tested, framework-agnostic
    index.css         # hand-written styling — warm accent (coral/orange) on a cool neutral base
    pages/
      Dashboard.jsx    # Hospital status at a glance
      NewPatient.jsx    # + New Patient AND Emergency Patient (same form, different defaults)
      Patients.jsx       # List + "Update Patient Condition" (plain-language, no raw priority editing)
      BedsRooms.jsx        # Floor-by-floor occupancy grid
      Alerts.jsx             # Active alerts + reallocation Review/Confirm/Dismiss cards
      Resources.jsx            # OT / equipment / isolation capacity
```

## 5. Architecture notes (read this before your viva)

**Why the live queue is in-memory, not read from the database on every operation.**
The priority queue is a binary heap — insert/update/remove are O(log n) *only* if the heap stays
in memory. Round-tripping every heap operation through SQL would throw away the whole point of
using a heap. So the heap and resource/patient working state live in memory in `server.js` for
speed, and get mirrored to SQLite after each event for durability, audit, and reporting.
**A server restart resets the live simulation (and logs you out) but not the patient records,
event log, or run-history in the database.** Persisting and restoring full resource/heap state
across restarts would be the natural next step toward true crash recovery.

**Why sessions are in-memory too.** Same trade-off, smaller stakes: session tokens live in a
`Map` in `auth.js`, not a database table, so a backend restart also logs everyone out. For a
single-admin capstone demo this is a reasonable simplification — the fix (a `sessions` table) is
small if you need it later.

**Admin-first: how the algorithm stays hidden.** The admin never sees a priority score, a queue
position, or the word "heap." `PLAIN_CLASS_LABEL` in `engine.js` maps P1–P4 to Critical/High/
Moderate/Low, and that's the *only* vocabulary the frontend uses. Condition changes go through
`updatePatientCondition` — framed as a normal clinical action ("Update Patient Condition"), not
as touching a priority queue, even though it's the same underlying recalculation.

**Reallocation: recommend-and-confirm, with one exception.** When a resource frees up and moving
an already-admitted patient there would clearly help, the engine does **not** move them
automatically — it creates a pending recommendation, surfaced on the Alerts page with
[Confirm] / [Dismiss]. The one exception: if a patient's condition deteriorates past what their
*current* bed can support, that reallocation happens immediately and automatically, with a
notification — waiting for admin confirmation isn't appropriate when the patient is actively
under-resourced right now. This split lives in `runAllocationCycle` in `engine.js`.

**Why `node:sqlite` and not `better-sqlite3`.** An earlier version of this project used
`better-sqlite3`, a native addon that needs to be compiled per-platform. That's normally invisible
(prebuilt binaries cover most setups), but it breaks hard on any machine without a matching
prebuilt binary and no C++ build toolchain installed — which is exactly what happened on Windows
with a very new Node version. `node:sqlite` sidesteps the whole problem: it ships inside Node
itself, so there is nothing to compile and nothing that can fail to compile. The one honest
trade-off: it's still marked "experimental" by Node (stable API, just not guaranteed to *never*
change), and it requires Node 22.5+. Both are non-issues for a capstone demo; `npm run dev`
suppresses the experimental-feature warning so it doesn't clutter your terminal during a demo.

**Why SQLite, and why not MongoDB.** The domain is relational — patients, resources, floors, and
allocations reference each other, and a core invariant ("a resource can hold at most one patient
at a time") is enforced as a real database constraint (`assignedResourceId UNIQUE` in
`schema.sql`), not just application logic. That's a natural fit for SQL and an awkward one for a
document store like MongoDB, which would need to enforce the same rule manually in code.

**Moving to Postgres / Supabase later.** `schema.sql` is plain, portable SQL. To move to Postgres
(including a hosted Supabase project — Supabase *is* Postgres):
1. Swap `node:sqlite`'s `DatabaseSync` for the `pg` package, and `db.js`'s prepared statements
   for `pg`'s parameterized queries (the SQL itself barely changes).
2. Change `INTEGER PRIMARY KEY AUTOINCREMENT` (used on `admins` and `run_history`) to
   `SERIAL PRIMARY KEY` or `GENERATED ALWAYS AS IDENTITY`. Everything else is standard SQL as-is.
3. Point the connection string at your Supabase project's connection string.
This is a half-day task, not a rewrite — flagging it honestly rather than pretending it's a
one-line change.

## 6. Mapping back to the capstone's DAA phases

- **Priority queue + dynamic adjustment** → `IndexedPriorityQueue` in `engine.js`: a binary heap
  with O(log n) insert/update/remove, ordered by (priority class, intra-class score).
- **Feasibility filtering** → `isResourceFeasibleFor` / `getFeasible` — hard constraints only,
  run before any ranking.
- **Allocation algorithm** → `rankCandidates` (best-fit by monitoring overshoot, with a
  scarcity-conservation tie-break for isolation-capable resources) + `allocate`.
- **Dynamic reallocation** → `pickReallocationCandidate` + `createRecommendation` /
  `confirmReallocation` — benefit-vs-cost threshold, with an urgent bypass (see above).
- **Admission & overflow** → `runAllocationCycle` + `maybeRaiseOverflowAlert`.
- **Database** → `schema.sql` / `db.js`.
- **Backend architecture / auth** → `server.js` / `auth.js`.
- **Admin-first dashboard** → `frontend/`.
- **FCFS vs Static vs Dynamic comparison** — deliberately **not** in the admin UI (see project
  scope doc: the admin should never see algorithm internals). Still available as an API-level
  reporting tool for your project report: `POST /api/mode` with `{"mode":"FCFS"}` (or `STATIC` /
  `DYNAMIC`) resets the simulation under that mode and logs the previous run's metrics to
  `run_history`; `GET /api/history` reads them back for your comparison table/graphs.

## 7. Known limitations, stated plainly

- Single admin account, in-memory sessions — appropriate for a capstone demo, not a real
  multi-user deployment. Change the default password before you present.
- The live simulation (and active sessions) reset on backend restart; database records don't
  (see Architecture notes).
- CORS allows one configurable origin (`CLIENT_ORIGIN`, default the Vite dev server) with
  credentials — fine for local dev, revisit before deploying anywhere public.
- This is a decision-support simulation, not an autonomous clinical tool. All clinical thresholds
  are configurable project assumptions, stated as such in the UI footer.
#   H o s p i t a l - M a n g e m e n t  
 