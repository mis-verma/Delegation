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

const GROUPS: Record<string, AnyMySqlTable[]> = {
  ticket: [tickets, ticketStatusUpdates, ticketAttachments, ticketComments, checklists, checklistItems, checklistImages, checklistTemplates, checklistTemplateItems],
  delegation: [tasks, taskAdditionalAssignees, taskDependencies, taskTags, taskAttachments, taskChecklists, taskChecklistItems, taskImages, taskComments, taskCommentAttachments],
  checklist: [checklistDefinitions, checklistDefinitionStores, checklistDefinitionAssignees, checklistDefinitionItems, checklistDefinitionItemAuditUsers, checklistInstances, checklistInstanceAssignees, checklistInstanceItems, checklistInstanceItemSubmissions, checklistInstanceItemSubmissionAccessories, checklistInstanceImages, checklistInstanceItemSubmissionImages],
}

export const AUTO_BACKUP_PREFIX = 'auto-'

const backupsRoot = () => join(process.cwd(), 'backups')

export interface BackupResult {
  name: string
  dir: string
  tables: number
  rows: number
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

export const verifyBackup = async (backup: BackupResult): Promise<void> => {
  for (const { group, table, rows } of backup.detail) {
    const file = join(backup.dir, group, `${table}.json`)
    let parsed: unknown
    try {
      parsed = JSON.parse(await readFile(file, 'utf8'))
    } catch {
      throw new Error(`Backup file for ${table} could not be read back.`)
    }
    if (!Array.isArray(parsed) || parsed.length !== rows) {
      throw new Error(`Backup file for ${table} has ${Array.isArray(parsed) ? parsed.length : 'no'} rows, expected ${rows}.`)
    }
  }
}

export const pruneAutoBackups = async (keep = 14): Promise<number> => {
  let names: string[]
  try {
    names = await readdir(backupsRoot())
  } catch {
    return 0
  }
  const auto = names.filter((n) => n.startsWith(AUTO_BACKUP_PREFIX)).sort()
  const doomed = auto.slice(0, Math.max(0, auto.length - keep))
  for (const name of doomed) await rm(join(backupsRoot(), name), { recursive: true, force: true })
  return doomed.length
}

export const offsiteConfigured = () => !!(env.AWS_S3_BUCKET && env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY)

export const copyBackupToS3 = async (backup: BackupResult): Promise<number | null> => {
  if (!offsiteConfigured()) return null
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
