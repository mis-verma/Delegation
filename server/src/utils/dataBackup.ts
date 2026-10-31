import { createReadStream } from 'node:fs'
import { mkdir, readdir, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { getTableColumns, getTableName, gt } from 'drizzle-orm'
import { getTableConfig, type AnyMySqlColumn, type AnyMySqlTable } from 'drizzle-orm/mysql-core'
import { db } from '../config/db.js'
import { env } from '../config/env.js'
import { countJsonArrayRows, openJsonArray } from './jsonArrayFile.js'
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

const PAGE_ROWS = 2000

const keyColumns = (table: AnyMySqlTable): AnyMySqlColumn[] => {
  const config = getTableConfig(table)
  const single = config.columns.filter((column) => column.primary)
  if (single.length > 0) return single
  const composite = config.primaryKeys[0]?.columns
  return composite && composite.length > 0 ? composite : config.columns.slice(0, 1)
}

const exportTable = async (table: AnyMySqlTable, file: string): Promise<number> => {
  const keys = keyColumns(table)
  const keyProp = keys.length === 1 ? Object.entries(getTableColumns(table)).find(([, column]) => column === keys[0])?.[0] : undefined
  const writer = openJsonArray(file)
  try {
    let last: unknown
    let offset = 0
    for (;;) {
      let query = db.select().from(table).$dynamic()
      if (keyProp && last !== undefined) query = query.where(gt(keys[0]!, last))
      query = query.orderBy(...keys).limit(PAGE_ROWS)
      if (!keyProp) query = query.offset(offset)
      const rows = (await query) as Record<string, unknown>[]
      if (rows.length === 0) break
      await writer.write(rows)
      offset += rows.length
      if (keyProp) last = rows[rows.length - 1]?.[keyProp]
      if (rows.length < PAGE_ROWS) break
    }
  } catch (err) {
    await writer.close().catch(() => undefined)
    throw err
  }
  return writer.close()
}

export const runDataBackup = async (prefix = ''): Promise<BackupResult> => {
  const name = `${prefix}${new Date().toISOString().replace(/[:.]/g, '-')}`
  const dir = join(backupsRoot(), name)
  const detail: BackupResult['detail'] = []

  for (const [group, groupTables] of Object.entries(GROUPS)) {
    const groupDir = join(dir, group)
    await mkdir(groupDir, { recursive: true })
    for (const table of groupTables) {
      const tableName = getTableName(table)
      const rows = await exportTable(table, join(groupDir, `${tableName}.json`))
      detail.push({ group, table: tableName, rows })
    }
  }

  return { name, dir, tables: detail.length, rows: detail.reduce((n, d) => n + d.rows, 0), detail }
}

export const verifyBackup = async (backup: BackupResult): Promise<void> => {
  for (const { group, table, rows } of backup.detail) {
    const file = join(backup.dir, group, `${table}.json`)
    let found: number
    try {
      found = await countJsonArrayRows(file)
    } catch {
      throw new Error(`Backup file for ${table} could not be read back.`)
    }
    if (found !== rows) throw new Error(`Backup file for ${table} has ${found} rows, expected ${rows}.`)
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
      const path = join(backup.dir, group, `${table}.json`)
      await client.send(new PutObjectCommand({
        Bucket: env.AWS_S3_BUCKET,
        Key: `backups/${backup.name}/${group}/${table}.json`,
        Body: createReadStream(path),
        ContentLength: (await stat(path)).size,
        ContentType: 'application/json',
        ServerSideEncryption: 'AES256',
      }))
    }
  } finally {
    client.destroy()
  }
  return backup.detail.length
}
