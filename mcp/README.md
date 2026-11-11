# KaryaOS MCP server

Read-only MCP server for KaryaOS. It calls the KaryaOS API as one signed-in person, so every tool shows only what that person's role may see. It never reads the database and has no write tools.

## Tools

| Tool | Answers |
|---|---|
| `get_today_numbers` | Pending, delayed, new and total for delegations, tickets, checklists (today) and your to-dos. `scope`: `mine` or `visible`. |
| `list_tickets` | Tickets you can see. Filter by `status` or `overdue`. |
| `list_pending_approvals` | Tickets, delegations and checklists waiting for your approval, with how many are over 24 hours. |
| `list_team_checklists` | Checklist runs of your team (everyone for Admin and PC). Filter by `status`, `period`, `storeId`, `notStartedOnly`. |

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

- Read-only. Write tools (create, approve, send back) are a separate step and need an explicit decision.
- No bulk export: small row caps, no "dump everything" tool.
- Runs as one person. Their role decides what they see.
- Logs go to stderr only, and never include tokens or passwords.

## Next steps

1. Write tools with explicit inputs, tagged `source: "mcp"` in the audit log.
2. Remote mode over HTTP with sign-in, for the whole team.
3. Prompts such as "morning brief" and "approval triage".
