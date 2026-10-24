# CI/CD & VPS Deployment

How this app ships to the VPS (CloudPanel-managed), end to end. Written for whoever needs to set
this up or debug a failed deploy — not a decision log, just the current, working setup.

## Architecture

```
karyaos.in         -> CloudPanel Nginx -> static files (client/dist)
api.karyaos.in      -> CloudPanel Nginx -> proxy -> Node (PM2, 127.0.0.1:<App Port>)
                                                        |
                                                        +-- MySQL (CloudPanel-managed, 127.0.0.1:3306)
                                                        +-- Redis   (manually installed, 127.0.0.1:6379)
```

**CloudPanel is already installed on this VPS** (found at `https://<vps-ip>:8443` — this was
discovered mid-setup, not planned for; everything below reflects the actual box, not a bare
Ubuntu VPS). CloudPanel owns Nginx, MySQL, per-site Node.js version management, SSL, per-site SSH
users, and the firewall — none of that is set up by hand or by a script in this repo. The only
thing CloudPanel doesn't bundle is Redis (needed for presence, the query cache, rate limiting, and
the Socket.io adapter once the app runs multi-core) — `deploy/setup-vps.sh` installs just that,
as root, once.

Client and API are two subdomains, not one origin with a path prefix — every server route is
mounted at a bare path (`/tasks`, `/tickets`, `/auth`, ...), the same paths the client's own pages
live at, so a shared origin can't tell "browser navigating to `/tasks`" (serve the SPA) apart from
"the SPA's own `fetch('/tasks')`" (proxy to the API) by path alone. Two subdomains — and so two
separate CloudPanel sites — sidesteps that; see `client/src/api/http.ts`'s `VITE_API_URL`.

The Node app manages its own multi-core scaling internally (`server/server.ts` forks a worker per
CPU core via Node's `cluster` module once `NODE_ENV=production`, fanning Socket.io out over a
Redis adapter). PM2 runs it in plain `fork` mode, one instance — PM2's job is just "keep this one
process alive and give me `pm2 logs`," not a second layer of clustering on top.

## One-time setup

### 1. Install Redis

```bash
bash deploy/setup-vps.sh
```
As root, once. Everything else below is CloudPanel's UI (`https://<vps-ip>:8443`), not a script.

### 2. Create the two CloudPanel sites

- **Add Site → Static Website** — domain `karyaos.in`
- **Add Site → Node.js** — domain `api.karyaos.in`, Node version 22, App Port `5050` (matches
  `PORT` in the server's `.env` below — they must agree, since that's the port CloudPanel's
  auto-generated Nginx vhost proxies to)

Each site gets its own auto-generated, unprivileged SSH user (CloudPanel names them itself —
something like `karyaos-in` and `api-karyaos-in`; check each site's page in the panel for the
exact username). Write both down — they're the `VPS_CLIENT_USER` / `VPS_API_USER` GitHub secrets
below.

### 3. Database

CloudPanel's site page → **Databases → Add Database**. Name it, set a user + password. Note the
host it gives you (almost certainly `localhost`/`127.0.0.1`, CloudPanel's own bundled MySQL) —
this becomes `DATABASE_URL` in the server's `.env`.

### 4. SPA fallback (client site's Vhost Editor)

CloudPanel's default static-site vhost doesn't know this is a client-side-routed React app — a
direct load of e.g. `karyaos.in/tasks` will 404 without this. On the `karyaos.in` site's **Vhost**
tab, add a `try_files` fallback inside the site's `location /` block:

```nginx
location / {
    try_files $uri $uri/ /index.html;
}
```

CloudPanel syntax-checks the vhost before applying it and won't take the site down on a typo.

### 4b. Fast static files (client site's Vhost Editor)

The built app names every file in `/assets/` with a content hash, so those files can be cached for a
year. The HTML, the service worker and the manifest must always be re-checked, or phones keep an old
app after a deploy. Add these blocks next to the `location /` block:

```nginx
location /assets/ {
    expires 1y;
    add_header Cache-Control "public, max-age=31536000, immutable";
    try_files $uri =404;
}
location = /index.html            { add_header Cache-Control "no-cache"; }
location = /sw.js                 { add_header Cache-Control "no-cache"; }
location = /manifest.webmanifest  { add_header Cache-Control "no-cache"; }
```

Turn on gzip or brotli for `text/css`, `application/javascript` and `image/svg+xml` if CloudPanel has not
already (Site → Settings). To put a CDN in front (Cloudflare free plan is enough): point the
`karyaos.in` DNS record through Cloudflare (orange cloud), set SSL mode to Full (strict), and keep
`api.karyaos.in` on DNS only (grey cloud) so WebSockets and uploads are untouched. Do not add a page
rule that caches `/index.html` or `/sw.js`.

### 5. WebSocket headers (API site's Vhost Editor)

Check the `api.karyaos.in` site's Vhost tab for an existing `proxy_set_header Upgrade`/
`Connection "upgrade"` pair (CloudPanel's Node.js template often includes this already). If it's
missing, Socket.io still works (falls back to long-polling) but with more latency — add these to
the proxy block if you want real websockets:

```nginx
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
proxy_read_timeout 90s;
```

### 6. server/.env

SSH in as the API site's user, in `~/htdocs/api.karyaos.in/`, create `.env` from
`server/.env.example`:

- `DATABASE_URL` — from step 3
- `CLIENT_URL=https://karyaos.in`
- `PORT=5050` — must match the App Port from step 2
- `REDIS_URL=redis://localhost:6379`
- `JWT_ACCESS_SECRET` — random string of at least 32 characters (the server refuses to start in production with a shorter one)
- `COOKIE_SECURE=true`
- `CLUSTER_WORKERS` — leave **unset** (see `deploy/ecosystem.config.cjs`'s own comment for why)
- `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` — required in production, because password and sign-in codes are sent by email
- `CRON_TIMEZONE=Asia/Kolkata` — optional, set it if the VPS clock is not on Indian time
- S3 / WhatsApp keys as needed

This file is never touched by CI — edit it directly on the VPS, then `pm2 reload
ecosystem.config.cjs` (or wait for the next deploy, which reloads it too).

### 7. PM2, once by hand

Still SSH'd in as the API site's user:

```bash
npm install -g pm2
```

Everything after this (`npm ci --omit=dev`, running migrations, `pm2 start`/`reload`) is what
`deploy.yml` does on every push — no need to do it by hand again once the first deploy has run.
To survive a VPS reboot (this site user has no sudo, so no systemd `pm2 startup`):

```bash
pm2 save
echo "PATH=$PATH" | crontab -
(crontab -l; echo "@reboot pm2 resurrect &> /dev/null") | crontab -
```

### 8. SSL

Once DNS (below) has propagated, each CloudPanel site's **SSL/TLS** tab has a "New Let's Encrypt
Certificate" action — one click per site, auto-renews.

### 9. DNS

At `karyaos.in`'s DNS provider (wherever it was registered):

```
A   karyaos.in         -> this VPS's IP
A   api.karyaos.in     -> this VPS's IP
```

## GitHub Actions

Two workflows:

- **`.github/workflows/ci.yml`** — every push and every PR. Lints, typechecks, and builds both
  `client/` and `server/`, plus the one existing server test (`server/src/modules/tasks/ai/
  slotFilling.test.ts`, pure logic, no DB needed). Never touches the VPS.
- **`.github/workflows/deploy.yml`** — every push to `main` (or manually, via the Actions tab's
  "Run workflow" button on Deploy). Rebuilds both, uploads the build as an artifact, then rsyncs
  `client/dist` to the static site and `server/dist` + `drizzle/` + `ecosystem.config.cjs` to the
  Node.js site over SSH, installs server production deps there, runs pending DB migrations, and
  does `pm2 reload` (zero-downtime restart) followed by `pm2 save`.

### Required GitHub repo configuration

Settings → Secrets and variables → Actions:

| Kind | Name | Value |
|---|---|---|
| Secret | `VPS_HOST` | the VPS's IP or hostname |
| Secret | `VPS_CLIENT_USER` | the `karyaos.in` site's auto-generated SSH user (step 2) |
| Secret | `VPS_API_USER` | the `api.karyaos.in` site's auto-generated SSH user (step 2) |
| Secret | `VPS_SSH_KEY` | a private key whose public half is in **both** site users' `~/.ssh/authorized_keys` |
| Secret | `VPS_PORT` | only if SSH isn't on port 22 |
| Variable | `VITE_API_URL` | `https://api.karyaos.in` |

Generate the deploy keypair once, on your own machine (not the VPS):
```bash
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ./karya_deploy_key -N ""
```
Append `karya_deploy_key.pub` to `~/.ssh/authorized_keys` for **both** site users (SSH in as each
one, or paste via CloudPanel if it exposes an SSH-keys UI). `VPS_SSH_KEY` is the private half's
full file contents.

Also create a GitHub `production` **Environment** (Settings → Environments) — `deploy.yml`'s
`deploy` job targets it. Nothing requires manual approval today; add a required reviewer on that
environment later if you want deploys to pause for a click before going out.

### What never goes through CI

- `~/htdocs/api.karyaos.in/.env` — created once by hand (step 6), holds real secrets. CI never
  reads or writes it.
- Anything the app writes locally on the API site outside `dist/` — the deploy's
  `rsync --delete` only targets `dist/` and `drizzle/`, never the site root, so `.env` and any
  local file storage survive every deploy untouched.
- The database itself — migrations apply forward automatically on every deploy; nothing ever
  drops or recreates it. CloudPanel also takes its own nightly DB backup (3:15 AM, 7-day
  retention, under `~/backups/` for the DB's site) independent of any of this.

## Rollback

There's no automatic rollback — if a deploy ships something broken:

1. `git revert` the bad commit (or `git reset` to the last good one) and push to `main` — the
   next deploy run ships the reverted code the normal way. This is the preferred path; a DB
   migration that ran as part of the bad deploy stays applied either way (Drizzle migrations are
   forward-only here), so reverting app code is what actually fixes most incidents.
2. For a faster stopgap while you prepare the revert: SSH in as the API site's user and run
   `pm2 restart karya-server` (recovers from a crash-looping process). There's no kept history of
   previous builds on the VPS today — if you want instant rollback later, extend `deploy.yml` to
   rsync into a timestamped release directory and symlink `current` at it (classic
   Capistrano-style releases), instead of deploying in place.

## Operating it

- Logs: `pm2 logs karya-server` (or the raw files, `~/logs/karya-server-{out,error}.log` on the
  API site — see `deploy/ecosystem.config.cjs`).
- Process status/restarts/memory: `pm2 status`, `pm2 monit`.
- Bumping past a single CPU core: set `CLUSTER_WORKERS` in `.env` explicitly, or just leave it
  unset in production — it already defaults to every core the VPS has (see `server/server.ts`).
  Redis is already running and already wired as the Socket.io adapter for `workerCount > 1`, so no
  other change is needed to go multi-worker.
- Nginx/vhost changes: CloudPanel's per-site **Vhost** tab, not raw files on disk — it
  syntax-checks before applying so a bad edit can't take the site down.
