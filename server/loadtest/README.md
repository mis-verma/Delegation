# Load test

Many fake people fill in today's checklist at the same time. **Run it only against a throwaway
database and a server you can break. Never production.**

## One-time setup

1. Install k6: `winget install k6` (or `choco install k6`), then check with `k6 version`.
2. Point your terminal at a throwaway database (PowerShell, from `server/`). One variable swaps only
   the database name and keeps the app's own user, password and host, so you never type or see a
   password:
   ```
   $env:DB_NAME_OVERRIDE = "taskmatrix_loadtest"
   ```
   Everything below (create, migrate, seed, the server itself) uses it, as long as you stay in this
   terminal. Close it and the variable is gone, so a later `npm run dev` hits your normal database.
3. Create it: `npm run loadtest:createdb`. It refuses unless the name contains `loadtest` and the
   database host is this machine. If it says access denied for CREATE, the app's MySQL user is not
   allowed to create databases: create `taskmatrix_loadtest` once as root (Workbench) and carry on.
4. Build its tables: `npm run db:migrate`
5. Optional but recommended: start Redis (`docker run -d -p 6379:6379 redis`). Without it the test
   does not exercise the auth cache, the shared rate limits or multiple workers.

## Every test run

In the **same terminal** (so `DB_NAME_OVERRIDE` is still set):

1. Fill the database with fake people and unanswered checklists (rebuilds today's runs each time):
   ```
   npm run seed:loadtest -- --users=1000
   ```
   The script refuses to run unless the database name contains `loadtest`.
2. Start the server the way production runs it:
   ```
   $env:NODE_ENV = "production"; $env:COOKIE_SECURE = "true"; $env:CLUSTER_WORKERS = "4"; $env:DB_CONNECTION_LIMIT = "30"
   npm run build; npm start
   ```
   (`COOKIE_SECURE` is only there to satisfy the production check; k6 does not use cookies.)
   Check it: `curl.exe http://localhost:5050/health`
3. In a second terminal, from the repo root, a quick smoke test first:
   ```
   k6 run -e BASE_URL=http://localhost:5050 -e PEAK_USERS=20 -e RAMP_UP=20s -e HOLD=30s server/loadtest/checklist.k6.js
   ```
4. Then the real one:
   ```
   k6 run -e BASE_URL=http://localhost:5050 server/loadtest/checklist.k6.js
   ```
   About 7 minutes, ramping to 1000 people. Re-run step 1 (the seed) before each repeat, otherwise
   every question is already answered and nothing is written.

## Reading the result

- **PASS** needs: under 1 % failed requests, p95 under 800 ms, **zero** 429s.
- Any 429 means a rate limit blocked a fake person. Note which request (`name` tag) and check
  `server/src/middleware/rateLimiter/rateLimiter.ts`. All fake people share one IP, so IP-based limits
  (login, refresh) look worse here than in real life; `LOGIN_SPREAD` staggers the sign-ins.
- 5xx errors: check the server terminal for the stack trace.
- A slow `PATCH /checklist-instance-items/:id` points at the tick path. It runs about a dozen separate
  queries and one audit write per tap.

## Knobs

`PEAK_USERS` (1000), `RAMP_UP` (3m), `HOLD` (3m), `RAMP_DOWN` (30s), `LOGIN_SPREAD` seconds (60),
`THINK` seconds between taps (2), `PASSWORD`, `BASE_URL`.

## What this does not cover

Photo uploads, the verification queue, reports and exports, and sockets. Add scenarios for those if
they matter to you.
