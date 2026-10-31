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

Photo uploads, the verification queue, exports and sockets. Add scenarios for those if
they matter to you.

## Second test: Home, PC desk and Scores (the read paths)

`dashboard.k6.js` is what happens after everyone opens the app in the morning and leaves Home open:
each fake person signs in, opens Home (summaries, My focus, tasks, tickets, notifications), then
re-checks summaries, My focus and notifications about every 45 seconds. Optionally, a few PC or
Admin accounts also load the heavy oversight pages (exceptions, attention people, approvals, org
counts and the Scores explorer) in a loop.

Use the same one-time setup and the same seeded fake people as above (`npm run seed:loadtest`), the
same production-style server, and run it **in the same throwaway terminal**.

1. Smoke test first (about 1 minute):
   ```
   k6 run -e BASE_URL=http://localhost:5050 -e PEAK_USERS=20 -e RAMP_UP=15s -e HOLD=30s -e LOGIN_SPREAD=5 server/loadtest/dashboard.k6.js
   ```
   Every line in "Per endpoint" must show requests. If one says "no requests" or the run reports
   failures, fix that first.
2. The real run (about 7.5 minutes, ramping to 1000 people):
   ```
   k6 run -e BASE_URL=http://localhost:5050 server/loadtest/dashboard.k6.js
   ```
3. Add PC or Admin oversight traffic. Create one PC or Admin account in the **throwaway** database
   only (through the app, or `npm run seed:admin` there), then:
   ```
   k6 run -e BASE_URL=http://localhost:5050 -e OVERSIGHT_EMAIL=pc@loadtest.local -e OVERSIGHT_PASSWORD=YourTestPassword1 -e OVERSIGHT_USERS=5 server/loadtest/dashboard.k6.js
   ```
   All oversight users share one account, so keep `OVERSIGHT_USERS` small (the per-person limit is
   300 requests a minute). If you see 429s from the oversight calls only, that is the shared account,
   not a real problem.

### Reading this result

- **PASS** needs: under 1 % failed requests, p95 under 1500 ms, zero 429s, zero 5xx.
- Look at the per-endpoint table first. The ones to watch are `GET /checklist-instances/mine/focus`,
  `GET /dashboard/summaries`, `GET /scores/explorer` and `GET /tasks (home)`.
- While it runs, watch the server terminal for `[slow]` lines (any request over 1.5 seconds) and
  `DB pool:` lines. Many `[slow]` lines for one route is your next thing to fix.
- Run it three times and compare: the first run warms the caches, the next two show the steady state.

### What the numbers mean for real users

`PEAK_USERS` is people **at the same moment**, not people in total. Most apps see roughly 5 to 15 %
of their daily users online at the busiest minute. So 1000 people at once is about 7,000 to 20,000
people in total. Find the highest `PEAK_USERS` that still passes, and divide that by 0.05 to 0.15 to
get a safe total-user number. One machine and one database will not reach a million people. The test
shows which part runs out first (database connections, one worker's CPU, or the disk), and that
decides whether the next step is a read replica, more workers, or object storage.
