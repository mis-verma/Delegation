# Quotation — Hosting (Managed vs Unmanaged)

**Prepared for:** [Client name]
**Prepared by:** [Your company name]
**Date:** 2026-09-11
**Validity:** 30 days (provider rates change without notice)

## 1. What needs hosting

Node.js/Express API with Socket.io (real-time, needs a persistent long-running server, not pure serverless) + MySQL database + Redis + a React/Vite frontend (static build). File storage already goes to AWS S3.

## 2. Option A — Managed hosting (PaaS)

Provider runs the OS, patching, DB backups, scaling, TLS. You deploy via Git push.

| Provider | App (1 vCPU/2GB) | Managed MySQL | Managed Redis | Est. monthly (app+DB+redis) |
|---|---|---|---|---|
| Render | $25/mo (Standard) | Postgres/Redis only — no managed MySQL | $10/mo+ | ~$35+ (needs Postgres instead of MySQL, or external MySQL) |
| DigitalOcean App Platform | $5–$29/mo per instance | $15/mo+ (managed MySQL available) | $15/mo+ | ~$45–60 |
| Railway | $20/mo plan + usage ($10/GB RAM, $20/vCPU) | Add-on, usage-billed | Add-on, usage-billed | ~$40–70 (usage-based, can spike) |

**Pros:** no server admin, auto TLS/backups, fast to deploy, less risk of downtime from misconfiguration.
**Cons:** higher cost per resource, less control, Socket.io needs "always-on" instance tier (no scale-to-zero), MySQL managed support varies by provider (Render has none — DigitalOcean does).

## 3. Option B — Unmanaged hosting (VPS)

You provision a raw VM and self-manage OS, MySQL, Redis, Nginx, TLS, backups, security patching.

| Provider | 2 vCPU / 4GB VPS | Notes |
|---|---|---|
| Hetzner (CX22-class) | ~$4.50–7/mo | Cheapest by far; EU-based (add latency for India traffic) |
| DigitalOcean Droplet | ~$24/mo | Good India/Bangalore region, better support |
| AWS Lightsail | ~$20–24/mo | Useful if already on AWS (S3 already in use here) |

Run MySQL + Redis + Node on the same VM (or a second small VM for DB) — no extra managed-service fee, but you own uptime, backups, and security.

**Pros:** lowest raw cost (Hetzner especially), full control, no vendor usage caps.
**Cons:** you (or a sysadmin) handle patching, backups, DB tuning, and downtime response — real risk if unmonitored.

## 4. Estimated monthly cost comparison

| | Managed (PaaS) | Unmanaged (VPS) |
|---|---|---|
| DigitalOcean | ~$45–60/mo | ~$24–30/mo (1–2 droplets) |
| Hetzner | — (no PaaS offering) | ~$7–12/mo |
| AWS | Elastic Beanstalk/App Runner ~$40+/mo | Lightsail ~$20–24/mo |
| Render/Railway | ~$35–70/mo | — (PaaS only) |

## 5. Recommendation

- **Budget-first / technical team available:** DigitalOcean Droplet (India region) or Hetzner VPS — lowest cost, acceptable if someone owns basic sysadmin (patching, backups, monitoring).
- **No dedicated sysadmin / prioritize uptime:** DigitalOcean App Platform — only major PaaS here with a real managed-MySQL option matching this project's stack.

## 6. Assumptions

- Excludes AWS S3 (already separately billed, usage-based) and third-party API costs (Gemini, WhatsApp/DoubleTick — see separate quotation).
- Prices are per-provider public list pricing as of September 2026; taxes and bandwidth overage not included.
- "Unmanaged" cost excludes the value of admin time spent on patching/monitoring/incident response.

---
*Cost estimate for planning purposes, not an invoice.*
