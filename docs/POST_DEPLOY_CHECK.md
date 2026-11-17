# Post-deploy check

Ten minutes in the browser after a deploy goes green. Unit tests cannot see a real database, so
these four areas are checked by hand. Stop at the first failure and report it.

## 1. The deploy itself

- GitHub → Actions → Deploy: the run is green, and the step "Install, migrate, switch and verify
  the server" did not roll back.
- Open the app and hard-refresh. The page loads and no red error banner appears.

## 2. Recurring checklists

- Checklists → My checklists shows today's runs, each one once, with no duplicates.
- Open a weekly or monthly checklist. It appears three days before its date and says when it opens.
- Admin → Recurring checklists: open one, change its name, save, and the live run shows the new
  name.
- A missed run from yesterday still shows for three days on a weekly or monthly checklist.

## 3. Tickets

- Raise a ticket with Auto mode. Type a title and the suggestion appears; using it fills the
  category, subcategory, team, person, priority and due time.
- The ticket lands in the right department, and its head sees it in Team approvals.
- Claim it as the assigned person. The clock starts at claim time.
- Raise one ticket per department at least once, so every department's routing is seen working.

## 4. People and categories

- People & Teams → Ticket categories lists what you expect, with no leftovers.
- Each category shows the right team and person.
- Org structure opens and a person's drawer shows their reporting line.

## 5. Jobs

- Admin → System health: every job shows a recent run with status OK.
- `pm2 logs karya-server --lines 50` on the VPS shows no repeated crash or memory restart.
