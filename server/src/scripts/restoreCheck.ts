import 'dotenv/config'
import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'
import { createGunzip } from 'node:zlib'
import { readFile } from 'node:fs/promises'
import mysql from 'mysql2/promise'
import { env } from '../config/env.js'
import { DUMP_END_MARKER, newestFullBackup } from '../utils/fullBackup.js'

const SCRATCH_PREFIX = 'restorecheck_'

const run = async () => {
  const file = process.argv.find((a, i) => i >= 2 && !a.startsWith('--')) ?? (await newestFullBackup())
  if (!file) {
    console.error('No full backup found. Run "npm run backup:full" first, or pass the path to a .sql.gz file.')
    process.exit(1)
  }
  const manifestFile = file.replace(/\.sql\.gz$/, '.manifest.json')
  const manifest = JSON.parse(await readFile(manifestFile, 'utf8')) as { tables: Record<string, number>; rows: number }

  const server = new URL(env.DATABASE_URL)
  const liveName = decodeURIComponent(server.pathname.replace(/^\//, ''))
  server.pathname = ''
  const scratchName = `${SCRATCH_PREFIX}${Date.now()}`
  if (scratchName === liveName || !scratchName.startsWith(SCRATCH_PREFIX)) {
    console.error('Refusing: the scratch database name is not safe.')
    process.exit(1)
  }

  const connection = await mysql.createConnection({ uri: server.toString(), multipleStatements: false, charset: 'utf8mb4' })
  let failed = false
  try {
    await connection.query(`CREATE DATABASE \`${scratchName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)
    await connection.query(`USE \`${scratchName}\``)
    console.log(`Loading ${file} into the throwaway database ${scratchName} ...`)

    let sawEnd = false
    let statements = 0
    const lines = createInterface({ input: createReadStream(file).pipe(createGunzip()), crlfDelay: Infinity })
    for await (const line of lines) {
      if (line === DUMP_END_MARKER) sawEnd = true
      if (!line || line.startsWith('--')) continue
      await connection.query(line)
      statements++
    }
    if (!sawEnd) {
      failed = true
      console.error('FAIL: the dump is cut short (no end marker). It was probably interrupted.')
    }

    console.log(`Ran ${statements} statements. Checking row counts against the backup record:\n`)
    let mismatches = 0
    for (const [table, expected] of Object.entries(manifest.tables)) {
      const [rows] = await connection.query(`SELECT COUNT(*) AS n FROM \`${table}\``)
      const actual = Number((rows as { n: number | string }[])[0]?.n ?? 0)
      const ok = actual === expected
      if (!ok) mismatches++
      console.log(`${ok ? 'ok  ' : 'FAIL'} ${table}: ${actual} of ${expected} rows`)
    }
    if (mismatches) {
      failed = true
      console.error(`\nFAIL: ${mismatches} table(s) do not match the backup record.`)
    } else if (!failed) {
      console.log(`\nPASS: ${Object.keys(manifest.tables).length} tables and ${manifest.rows} rows restored cleanly.`)
      console.log('To restore for real into an EMPTY database, run: gunzip -c <file>.sql.gz | mysql -u <user> -p <database>')
    }
  } catch (err) {
    failed = true
    console.error('FAIL: the restore stopped with an error:', err instanceof Error ? err.message : err)
    console.error('If this says access denied for CREATE, the app user cannot create databases here. Run it as a user that can, or on another machine.')
  } finally {
    if (scratchName.startsWith(SCRATCH_PREFIX)) await connection.query(`DROP DATABASE IF EXISTS \`${scratchName}\``).catch(() => undefined)
    await connection.end().catch(() => undefined)
  }
  process.exit(failed ? 1 : 0)
}

run().catch((err) => {
  console.error('Restore check failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
