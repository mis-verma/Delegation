// One-off command-line script (run like: `npm run backup:data`) that dumps every row from the
// Ticket, Delegation (Task), and recurring Checklist tables to timestamped JSON files under
// server/backups/<timestamp>/<group>/<table>.json — a local rollback point to take before running
// any destructive script against these domains (see wipeChecklists.ts). Read-only: never deletes
// or modifies anything in the database.
import 'dotenv/config'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { getTableName } from 'drizzle-orm'
import type { AnyMySqlTable } from 'drizzle-orm/mysql-core'
import { connectDB, disconnectDB, db } from '../config/db.js'
import {
  tickets, ticketStatusUpdates, ticketAttachments, ticketComments,
  checklists, checklistItems, checklistImages, checklistTemplates, checklistTemplateItems,
  tasks, taskAdditionalAssignees, taskDependencies, taskTags, taskAttachments,
  taskChecklists, taskChecklistItems, taskImages, taskComments, taskCommentAttachments,
  checklistDefinitions, checklistDefinitionStores, checklistDefinitionAssignees,
  checklistDefinitionItems, checklistDefinitionItemAuditUsers,
  checklistInstances, checklistInstanceAssignees, checklistInstanceItems,
  checklistInstanceItemSubmissions, checklistInstanceItemSubmissionAccessories,
  checklistInstanceImages, checklistInstanceItemSubmissionImages,
} from '../db/schema/index.js'

// Grouped by the same three domains the user asked to back up. Table lists are heterogeneous
// mysqlTable shapes, hence AnyMySqlTable — this is a throwaway dump script, not app code, so a
// loose type here is fine rather than writing a distinct branch per table.
const GROUPS: Record<string, AnyMySqlTable[]> = {
  ticket: [tickets, ticketStatusUpdates, ticketAttachments, ticketComments, checklists, checklistItems, checklistImages, checklistTemplates, checklistTemplateItems],
  delegation: [tasks, taskAdditionalAssignees, taskDependencies, taskTags, taskAttachments, taskChecklists, taskChecklistItems, taskImages, taskComments, taskCommentAttachments],
  checklist: [checklistDefinitions, checklistDefinitionStores, checklistDefinitionAssignees, checklistDefinitionItems, checklistDefinitionItemAuditUsers, checklistInstances, checklistInstanceAssignees, checklistInstanceItems, checklistInstanceItemSubmissions, checklistInstanceItemSubmissionAccessories, checklistInstanceImages, checklistInstanceItemSubmissionImages],
}

const run = async () => {
  await connectDB()

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const outDir = join(process.cwd(), 'backups', stamp)

  for (const [group, groupTables] of Object.entries(GROUPS)) {
    const groupDir = join(outDir, group)
    mkdirSync(groupDir, { recursive: true })
    for (const table of groupTables) {
      const rows = await db.select().from(table)
      const name = getTableName(table)
      writeFileSync(join(groupDir, `${name}.json`), JSON.stringify(rows, null, 2))
      console.log(`${group}/${name}: ${rows.length} row(s)`)
    }
  }

  console.log(`\nBackup written to ${outDir}`)
  await disconnectDB()
  process.exit(0)
}

run().catch(async (err) => {
  console.error('Backup failed:', err)
  await disconnectDB()
  process.exit(1)
})
