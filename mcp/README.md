# KaryaOS MCP server

MCP server for KaryaOS. It calls the KaryaOS API as one signed-in person, so every tool shows only what that person's role may see. It never reads the database. Reading is always on. Two write tools exist but stay off unless you turn them on.

## Tools

| Tool | Answers |
|---|---|
| `get_today_numbers` | Pending, delayed, new and total for delegations, tickets, checklists (today) and your to-dos. `scope`: `mine` or `visible`. |
| `list_tickets` | Tickets you can see. Filter by `status` or `overdue`. |
| `list_pending_approvals` | Tickets, delegations and checklists waiting for your approval, with how many are over 24 hours. |
| `list_team_checklists` | Checklist runs of your team (everyone for Admin and PC). Filter by `status`, `period`, `storeId`, `notStartedOnly`. |

### Write tools (off by default)

Set `KARYA_ALLOW_WRITES=1` to add two tools:

| Tool | Does |
|---|---|
| `approve_item` | Approves one ticket, delegation or checklist waiting for you. |
| `send_back_item` | Sends one back for changes. A note of at least 3 characters is required. |

Both need `confirm: true`, so the model must ask the person first. The API still decides if the signed-in role may approve that item; a refusal comes back as an error. Writes show in the audit log as that person's own action with source `MCP` (the server sends an `X-Client-Source: mcp` header).

Every answer is capped at `KARYA_MAX_ROWS` rows (default 25, never more than 50). Emails and phone numbers are never returned.

## Setup

```bash
cd mcp
npm install
npm run build
```

Set these in the MCP client config, not in a file in this repo:

| Variable | Meaning |
|---|---|
| `KARYA_API_URL` | API address, for example `https://api.karyaos.in`. Default `http://localhost:5050`. |
| `KARYA_TOKEN` | A signed-in access token. Short-lived. |
| `KARYA_EMAIL`, `KARYA_PASSWORD` | Or let the server sign in itself, and again when the token expires. Not for accounts that need an email sign-in code (Admin). |
| `KARYA_ALLOW_WRITES` | `1` adds `approve_item` and `send_back_item`. Default off. |
| `KARYA_MAX_ROWS` | Row cap per answer. Default 25. |
| `KARYA_UTC_OFFSET_MINUTES` | Organisation day offset. Default 330 (India). |

### Claude Code

```bash
claude mcp add karyaos --env KARYA_API_URL=https://api.karyaos.in --env KARYA_EMAIL=you@company.in --env KARYA_PASSWORD=... -- node /full/path/to/mcp/dist/index.js
```

### Claude Desktop (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "karyaos": {
      "command": "node",
      "args": ["C:/path/to/tasks.vjsconnect.com/mcp/dist/index.js"],
      "env": {
        "KARYA_API_URL": "https://api.karyaos.in",
        "KARYA_EMAIL": "you@company.in",
        "KARYA_PASSWORD": "..."
      }
    }
  }
}
```

Use a normal staff account, not Admin, for anything that runs unattended.

## Rules this server follows

- Read-only unless `KARYA_ALLOW_WRITES=1`. Writes need `confirm: true` and are limited to approve and send back.
- No bulk export: small row caps, no "dump everything" tool.
- Runs as one person. Their role decides what they see.
- Logs go to stderr only, and never include tokens or passwords.

## Next steps

2. Remote mode over HTTP with sign-in, for the whole team.
3. Prompts such as "morning brief" and "approval triage".

## Prompts

`morning_brief`, `approval_triage`, `unstarted_checklists`. All read-only; they only suggest.

## Remote (HTTP) mode

`npm run build && npm run start:http` serves `POST /mcp` (stateless) and `GET /health`.
Each request must carry `Authorization: Bearer <KaryaOS access token>`; nothing is stored.
Env: `PORT` (default 8787), `HOST` (default 127.0.0.1). Put it behind nginx with TLS before exposing it.
