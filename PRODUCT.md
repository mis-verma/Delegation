# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Retail store operations staff, managers, and admins across a multi-store business, working through role-scoped access: ADMIN and PC (people/company-wide admin), SENIOR and MANAGER (store/department leads), and AGENT/USER (front-line staff). They use Karya to assign and track delegated work, resolve issue tickets, and run recurring store checklists/audits — day-to-day store operations, not a general project-management audience.

## Product Purpose

Karya coordinates delegated work, issue resolution, and recurring compliance checklists across a chain of physical stores, and gives admins/managers a real, org-wide view of who's doing what and whether stores are actually following procedure — not just a task list, but auditable proof of on-the-ground execution.

## Positioning

Work can originate from a WhatsApp message — an AI-assisted "Smart Task" flow (via a DoubleTick/Meta WhatsApp webhook) parses a forwarded message into a delegation or ticket — and the same system enforces photo-evidence checklist compliance (LIVE-capture vs. gallery-upload distinguished and tracked) plus SLA/TAT tracking on tickets, with org-wide audit/compliance reporting (on-time %, checklist completion, overdue counts) rolled up by store and department. A generic task/helpdesk tool tracks that work was logged; Karya is built to also prove it was actually done, on-site, on time.

## Operating Context

- Multi-store retail operation: each user belongs to a Store and/or Department; work (tasks/delegations, tickets, checklists) is scoped and reported on by that structure.
- Two parallel work types: **Tasks** (delegations and internal issues, kanban-style board with due dates/priority) and **Tickets** (structured issue tracking with TAT/SLA, verification workflow, checklists attached).
- **Checklists** exist in two forms: one-off templates applied by hand to a single task/ticket, and recurring, store-scheduled checklist definitions that auto-generate instances on a cadence and require photo evidence per item.
- WhatsApp is a real intake channel, not just a notification channel: staff can message a WhatsApp number and have it parsed into a delegation via AI, with a slot-filling conversation for missing fields (assignee, department, due date, priority).
- Verification/approval workflow: a non-verifier role moves a ticket/checklist forward with a mandatory remark; a verifier (PC/ADMIN) approves or rejects with a note, closing the loop with an auditable trail (status-update history) rather than silent status changes.
- Admin/analytics surface (org overview, store/department performance rankings, team leaderboard, audit/compliance reports) is used by ADMIN/PC/MANAGER/SENIOR to see cross-store performance, not just their own queue.

## Capabilities and Constraints

- Roles: `ADMIN`, `PC`, `SENIOR`, `MANAGER`, `AGENT`, `USER` — each with a different visibility scope (own tasks, own store, own department, or org-wide).
- Real-time updates via Socket.IO for tickets, tasks, checklists, and notifications.
- Photo evidence capture is a first-class, tracked concept: `LIVE` (in-app camera capture) vs. `GALLERY` (picked from device), with checklist items able to require a minimum photo count and/or live-only capture.
- CSV/Excel bulk import exists for tasks, tickets, and checklists.
- Labels/tags are shared across tasks and tickets via one underlying `tags` table.
- Redis-backed query caching and a Socket.IO layer are present in the server; MariaDB 10.11 is the actual production database target (not vanilla MySQL — this constrains some SQL, e.g. no LATERAL joins).

## Brand Commitments

- Product name: **Karya** (confirmed in the app's own page title).

## Evidence on Hand

- Real store names appear in the codebase/screenshots from this session (e.g. "Karol Bagh", "Chandni Chowk" — Delhi retail market areas), consistent with a real, already-operating multi-store deployment rather than a demo/seed-only dataset.
- Whether this is built for one specific retail business (vs. a product intended for multiple retail clients) was not confirmed — do not assert a specific company name as a binding brand fact without asking again.

## Product Principles

1. Compliance must be provable, not just claimed — photo evidence, TAT/SLA tracking, and status-update audit trails exist because "someone said it's done" isn't good enough for a physical, multi-store operation.
2. Meet staff where they already are — WhatsApp as a real work-intake channel, not an afterthought integration.
3. Visibility scopes to role and structure (store/department), not a flat everyone-sees-everything model — a MANAGER's or SENIOR's view is their own store/department; org-wide rollups are an ADMIN/PC-level capability.
4. Delegation and issue-tracking are related but distinct concepts (Tasks vs. Tickets) and stay modeled separately rather than collapsed into one generic "item" type.
