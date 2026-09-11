// One-off command-line script (run like: `npm run wipe:checklists`) that deletes every recurring
// checklist definition — and, via ON DELETE CASCADE, every instance/item/submission/image
// generated under it — emptying the Checklist feature (Definitions, Instances, Compliance board,
// My Checklists) completely. Does NOT touch the separate ticket-linked checklist tables
// (Checklist/ChecklistItem/ChecklistTemplate in ticket.ts) — those are a different feature and
// weren't part of what this was asked to clear.
import 'dotenv/config'
import { connectDB, disconnectDB, db } from '../config/db.js'
import { checklistDefinitions } from '../db/schema/index.js'
import { env } from '../config/env.js'

// Unconditional and irreversible (no confirmation, no dry-run) — a mistaken `.env` pointed at the
// real database, or a copy-pasted command run in the wrong terminal, wipes the entire recurring-
// checklist feature with no way back. Requires both an explicit --yes flag and, in production,
// an explicit override on top of that, so it can never fire from muscle-memory alone.
const confirmed = process.argv.includes('--yes')
const productionOverride = process.argv.includes('--allow-production')

const run = async () => {
  if (!confirmed) {
    console.error('Refusing to run: pass --yes to confirm you want to permanently delete every checklist definition (and all its instances/items/submissions/images).')
    process.exit(1)
  }
  if (env.NODE_ENV === 'production' && !productionOverride) {
    console.error('Refusing to run against NODE_ENV=production. Pass --allow-production as well if you really mean to wipe the production database.')
    process.exit(1)
  }

  await connectDB()

  const deleted = await db.delete(checklistDefinitions)
  console.log(`Deleted ${deleted[0].affectedRows} checklist definition(s) (cascaded to all instances/items/submissions/images).`)

  await disconnectDB()
  process.exit(0)
}

run().catch(async (err) => {
  console.error('Wipe failed:', err)
  await disconnectDB()
  process.exit(1)
})
