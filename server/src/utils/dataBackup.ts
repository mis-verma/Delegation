import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { getTableName } from 'drizzle-orm'
import type { AnyMySqlTable } from 'drizzle-orm/mysql-core'
import { db } from '../config/db.js'
import { env } from '../config/env.js'
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

// The one place a data backup is made: the `npm run backup:data` script and the nightly job both call
// this. It dumps every row of the Ticket, Delegation (Task) and recurring Checklist tables to JSON
// under server/backups/<name>/<group>/<table>.json. Read-only: it never changes the database.
// People, departments and stores are not in it, and neither are password hashes or sessions.

// Table lists are heterogeneous mysqlTable shapes, hence AnyMySqlTable: a dump loop, not app logic.
const GROUPS: Record<string, AnyMySqlTable[]> = {
  ticket: [tickets, ticketStatusUpdates, ticketAttachments, ticketComments, checklists, checklistItems, checklistImages, checklistTemplates, checklistTemplateItems],
  delegation: [tasks, taskAdditionalAssignees, taskDependencies, taskTags, taskAttachments, taskChecklists, taskChecklistItems, taskImages, taskComments, taskCommentAttachments],
  checklist: [checklistDefinitions, checklistDefinitionStores, checklistDefinitionAssignees, checklistDefinitionItems, checklistDefinitionItemAuditUsers, checklistInstances, checklistInstanceAssignees, checklistInstanceItems, checklistInstanceItemSubmissions, checklistInstanceItemSubmissionAccessories, checklistInstanceImages, checklistInstanceItemSubmissionImages],
}

/** Folders the nightly job creates start with this, so pruning never touches a backup somebody made by hand. */
export const AUTO_BACKUP_PREFIX = 'auto-'

const backupsRoot = () => join(process.cwd(), 'backups')

export interface BackupResult {
  /** Folder name under server/backups. */
  name: string
  dir: string
  tables: number
  rows: number
  /** Table name and row count, in the order written. */
  detail: { group: string; table: string; rows: number }[]
}

export const runDataBackup = async (prefix = ''): Promise<BackupResult> => {
  const name = `${prefix}${new Date().toISOString().replace(/[:.]/g, '-')}`
  const dir = join(backupsRoot(), name)
  const detail: BackupResult['detail'] = []

  for (const [group, groupTables] of Object.entries(GROUPS)) {
    const groupDir = join(dir, group)
    await mkdir(groupDir, { recursive: true })
    for (const table of groupTables) {
      const rows = await db.select().from(table)
      const tableName = getTableName(table)
      await writeFile(join(groupDir, `${tableName}.json`), JSON.stringify(rows))
      detail.push({ group, table: tableName, rows: rows.length })
    }
  }

  return { name, dir, tables: detail.length, rows: detail.reduce((n, d) => n + d.rows, 0), detail }
}

/** Deletes the oldest automatic backups, keeping the newest `keep`. Returns how many were removed. */
export const pruneAutoBackups = async (keep = 14): Promise<number> => {
  let names: string[]
  try {
    names = await readdir(backupsRoot())
  } catch {
    return 0
  }
  // The ISO stamp sorts the same as time, so a plain sort is oldest first.
  const auto = names.filter((n) => n.startsWith(AUTO_BACKUP_PREFIX)).sort()
  const doomed = auto.slice(0, Math.max(0, auto.length - keep))
  for (const name of doomed) await rm(join(backupsRoot(), name), { recursive: true, force: true })
  return doomed.length
}

export const offsiteConfigured = () => !!(env.AWS_S3_BUCKET && env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY)

/**
 * Copies one backup folder to the S3 bucket under backups/<name>/..., encrypted at rest. Returns how
 * many files were uploaded, or null when no bucket is configured (so the caller can say "local only").
 * Old copies are not deleted here: let a bucket lifecycle rule expire them.
 */
export const copyBackupToS3 = async (backup: BackupResult): Promise<number | null> => {
  if (!offsiteConfigured()) return null
  // Loaded only now: the SDK is big and most runs (and the CLI script) never need it.
  const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3')
  const client = new S3Client({
    region: env.AWS_REGION,
    credentials: { accessKeyId: env.AWS_ACCESS_KEY_ID, secretAccessKey: env.AWS_SECRET_ACCESS_KEY },
  })
  try {
    for (const { group, table } of backup.detail) {
      const body = await readFile(join(backup.dir, group, `${table}.json`))
      await client.send(new PutObjectCommand({
        Bucket: env.AWS_S3_BUCKET,
        Key: `backups/${backup.name}/${group}/${table}.json`,
        Body: body,
        ContentType: 'application/json',
        ServerSideEncryption: 'AES256',
      }))
    }
  } finally {
    client.destroy()
  }
  return backup.detail.length
}
