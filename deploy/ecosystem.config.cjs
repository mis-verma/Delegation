// PM2 process definition for CloudPanel's Node.js site model — CloudPanel gives the "api.karyaos.in"
// site its own unprivileged SSH user with a home directory at ~/htdocs/api.karyaos.in (CloudPanel
// auto-names the user itself, e.g. api-karyaos-in — see docs/CICD_DEPLOYMENT.md). This file
// resolves paths off os.homedir() instead of hardcoding that generated username, so it works
// unchanged for whatever CloudPanel actually calls the account.
//
// Run as that site user (never root — the site user has no sudo, matching CloudPanel's own
// documented PM2 flow): `pm2 start ecosystem.config.cjs` the first time,
// `pm2 reload ecosystem.config.cjs` on every deploy after.
//
// exec_mode is "fork" with a single instance ON PURPOSE, not PM2's "cluster" mode: server.ts
// already forks its own worker pool internally via Node's `cluster` module whenever
// NODE_ENV=production and CLUSTER_WORKERS is left unset (see server/server.ts — it defaults to
// os.cpus().length workers, fanning Socket.io out over the Redis adapter automatically once
// workerCount > 1). Running this under PM2 cluster mode too would be two process managers
// fighting over the same forking job. PM2 here is purely "keep the one process alive, restart it
// if it crashes, give me `pm2 logs`" — the app manages its own multi-core scaling.
const os = require('node:os');
const path = require('node:path');

const siteRoot = path.join(os.homedir(), 'htdocs', 'api.karyaos.in');

module.exports = {
  apps: [
    {
      name: 'karya-server',
      script: 'dist/server.js',
      cwd: siteRoot,
      exec_mode: 'fork',
      instances: 1,
      // <siteRoot>/.env (real secrets — DATABASE_URL from CloudPanel's DB, JWT secret, etc.,
      // created once by hand, never shipped by CI) is loaded by the app itself via
      // `import 'dotenv/config'` in env.ts — nothing extra needed here. PORT in that .env must
      // match the "App Port" chosen when this Node.js site was created in CloudPanel, since
      // that's the port CloudPanel's auto-generated Nginx vhost proxies to.
      env: {
        NODE_ENV: 'production',
      },
      max_memory_restart: '500M',
      kill_timeout: 30000,
      out_file: path.join(os.homedir(), 'logs', 'karya-server-out.log'),
      error_file: path.join(os.homedir(), 'logs', 'karya-server-error.log'),
      time: true,
    },
  ],
};
