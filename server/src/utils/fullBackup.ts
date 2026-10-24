import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { once } from 'node:events'
import { createGzip } from 'node:zlib'
import mysql from 'mysql2/promise'
import { env } from '../config/env.js'

export const FULL_BACKUP_PREFIX = 'full-'
const ROWS_PER_INSERT = 200
const END_MARKER = '-- END OF DUMP'

const backupsRoot = () => join(process.cwd(), 'backups')

export interface FullBackupResult {
  name: string
  file: string
  manifestFile: string
  sizeBytes: number
  tables: Record<string, number>
  rows: number
}

const sqlName = (name: string) => `\`${name.replace(/`/g, '')}\``

const connect = () =>
  mysql.createConnection({
    uri: env.DATABASE_URL,
    dateStrings: true,
    jsonStrings: true,
    supportBigNumbers: true,
    bigNumberStrings: true,
    charset: 'utf8mb4',
  })

type Connection = Awaited<ReturnType<typeof connect>>

const baseTables = async (connection: Connection): Promise<string[]> => {
  const [rows] = await connection.query("SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'")
  return (rows as Record<string, string>[]).map((row) => Object.values(row)[0] ?? "").filter(Boolean).sort()
}

const write = async (out: NodeJS.WritableStream, text: string) => {
  if (!out.write(text)) await once(out, 'drain')
}

const dumpTable = async (connection: Connection, out: NodeJS.WritableStream, table: string): Promise<number> => {
  const [createRows] = await connection.query(`SHOW CREATE TABLE ${sqlName(table)}`)
  const createText = (createRows as Record<string, string>[])[0]?.['Create Table']
  if (!createText) throw new Error(`Could not read the definition of table ${table}`)
  const createStatement = String(createText).replace(/\s*\n\s*/g, ' ')
  await write(out, `DROP TABLE IF EXISTS ${sqlName(table)};\n${createStatement};\n`)

  let written = 0
  let batch: string[] = []
  const flush = async () => {
    if (!batch.length) return
    await write(out, `INSERT INTO ${sqlName(table)} VALUES ${batch.join(',')};\n`)
    batch = []
  }

  const raw = (connection as unknown as { connection: { query: (sql: string) => { stream: () => AsyncIterable<unknown> } } }).connection
  const stream = raw.query(`SELECT * FROM ${sqlName(table)}`).stream()
  for await (const row of stream) {
    const values = Object.values(row as Record<string, unknown>).map((value) => connection.escape(value))
    batch.push(`(${values.join(',')})`)
    written++
    if (batch.length >= ROWS_PER_INSERT) await flush()
  }
  await flush()
  return written
}

export const runFullBackup = async (prefix = FULL_BACKUP_PREFIX): Promise<FullBackupResult> => {
  await mkdir(backupsRoot(), { recursive: true })
  const name = `${prefix}${new Date().toISOString().replace(/[:.]/g, '-')}`
  const file = join(backupsRoot(), `${name}.sql.gz`)
  const manifestFile = join(backupsRoot(), `${name}.manifest.json`)

  const connection = await connect()
  const gzip = createGzip()
  const sink = createWriteStream(file)
  gzip.pipe(sink)
  const done = new Promise<void>((resolve, reject) => {
    sink.on('finish', resolve)
    sink.on('error', reject)
    gzip.on('error', reject)
  })

  const tables: Record<string, number> = {}
  try {
    await connection.query('SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ')
    await connection.query('START TRANSACTION WITH CONSISTENT SNAPSHOT')
    await write(gzip, `-- KaryaOS full backup ${name}\nSET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS=0;\nSET SQL_MODE='NO_AUTO_VALUE_ON_ZERO';\nSET UNIQUE_CHECKS=0;\n`)
    for (const table of await baseTables(connection)) {
      tables[table] = await dumpTable(connection, gzip, table)
    }
    await write(gzip, `SET FOREIGN_KEY_CHECKS=1;\nSET UNIQUE_CHECKS=1;\n${END_MARKER}\n`)
    await connection.query('COMMIT')
  } catch (err) {
    gzip.destroy()
    sink.destroy()
    await rm(file, { force: true })
    throw err
  } finally {
    await connection.end().catch(() => undefined)
  }

  gzip.end()
  await done

  const sizeBytes = (await stat(file)).size
  const rows = Object.values(tables).reduce((sum, n) => sum + n, 0)
  await writeFile(manifestFile, JSON.stringify({ name, createdAt: new Date().toISOString(), tables, rows, sizeBytes }, null, 2))
  return { name, file, manifestFile, sizeBytes, tables, rows }
}

export const readManifest = async (manifestFile: string): Promise<{ name: string; tables: Record<string, number>; rows: number }> =>
  JSON.parse(await readFile(manifestFile, 'utf8'))

export const pruneFullBackups = async (keep = 14): Promise<number> => {
  let names: string[]
  try {
    names = await readdir(backupsRoot())
  } catch {
    return 0
  }
  const dumps = names.filter((n) => n.startsWith(FULL_BACKUP_PREFIX) && n.endsWith('.sql.gz')).sort()
  const doomed = dumps.slice(0, Math.max(0, dumps.length - keep))
  for (const dump of doomed) {
    await rm(join(backupsRoot(), dump), { force: true })
    await rm(join(backupsRoot(), dump.replace(/\.sql\.gz$/, '.manifest.json')), { force: true })
  }
  return doomed.length
}

export const newestFullBackup = async (): Promise<string | null> => {
  try {
    const dumps = (await readdir(backupsRoot())).filter((n) => n.startsWith(FULL_BACKUP_PREFIX) && n.endsWith('.sql.gz')).sort()
    const newest = dumps.at(-1)
    return newest ? join(backupsRoot(), newest) : null
  } catch {
    return null
  }
}

export const copyFullBackupToS3 = async (backup: FullBackupResult): Promise<boolean> => {
  if (!(env.AWS_S3_BUCKET && env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY)) return false
  const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3')
  const client = new S3Client({
    region: env.AWS_REGION,
    credentials: { accessKeyId: env.AWS_ACCESS_KEY_ID, secretAccessKey: env.AWS_SECRET_ACCESS_KEY },
  })
  try {
    const files: [string, string, string][] = [
      [backup.file, `backups/full/${backup.name}.sql.gz`, 'application/gzip'],
      [backup.manifestFile, `backups/full/${backup.name}.manifest.json`, 'application/json'],
    ]
    for (const [path, key, type] of files) {
      await client.send(new PutObjectCommand({
        Bucket: env.AWS_S3_BUCKET,
        Key: key,
        Body: createReadStream(path),
        ContentLength: (await stat(path)).size,
        ContentType: type,
        ServerSideEncryption: 'AES256',
      }))
    }
  } finally {
    client.destroy()
  }
  return true
}

export const DUMP_END_MARKER = END_MARKER
