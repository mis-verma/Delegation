# Load test

Many fake people fill in today's checklist at the same time. **Run it only against a throwaway
database and a server you can break. Never production.**

## One-time setup

1. Install k6: `winget install k6` (or `choco install k6`), then check with `k6 version`.
2. Create a throwaway database. In MySQL: `CREATE DATABASE taskmatrix_loadtest;`
3. Point your terminal at it (PowerShell), from `server/`:
   ```
   $env:DB_NAME = "taskmatrix_loadtest"
   ```
   If your `.env` has a full `DATABASE_URL`, set that to the loadtest database instead:
   `$env:DATABASE_URL = "mysql://USER:PASS@127.0.0.1:3306/taskmatrix_loadtest"`
4. Build its tables: `npm run db:migrate`
5. Optional but recommended: start Redis (`docker run -d -p 6379:6379 redis`). Without it the test
   does not exercise the auth cache, the shared rate limits or multiple workers.

## Every test run

In the **same terminal** (so `DB_NAME` is still set):

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
