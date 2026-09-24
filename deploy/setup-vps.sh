#!/usr/bin/env bash
# Supplementary setup for a CloudPanel VPS — everything CloudPanel already owns (Nginx, MySQL,
# Node.js per site, SSL, the firewall, per-site SSH users) is created through CloudPanel itself
# (its UI at https://<vps-ip>:8443, or `clpctl` as the relevant site user), NOT here. Re-running
# apt-get/systemctl for those against a CloudPanel box risks fighting its own management. This
# script only installs the one thing CloudPanel doesn't bundle: Redis.
#
# Run as root, once: `bash deploy/setup-vps.sh`. Safe to re-run.
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Run this as root (or with sudo)." >&2
  exit 1
fi

echo "==> Installing Redis"
apt-get update -y
apt-get install -y redis-server
systemctl enable --now redis-server
redis-cli ping

cat <<'EOF'

========================================================================
Redis installed and running on 127.0.0.1:6379 (default, no auth) — good
enough for this app's own use (presence, query cache, rate limiting,
Socket.io adapter), all of which only ever connect from localhost.

Everything else is CloudPanel's job. See docs/CICD_DEPLOYMENT.md for the
full walkthrough: creating the two sites, the database, SSL, the
GitHub Actions secrets, and the first deploy.
========================================================================
EOF
