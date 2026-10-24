import '../config/loadEnv.js'
import { copyFullBackupToS3, pruneFullBackups, runFullBackup } from '../utils/fullBackup.js'

const run = async () => {
  const backup = await runFullBackup()
  for (const [table, rows] of Object.entries(backup.tables)) console.log(`${table}: ${rows} row(s)`)
  console.log(`\nFull backup written to ${backup.file} (${Math.round(backup.sizeBytes / 1024)} KB, ${backup.rows} rows)`)

  if (process.argv.includes('--offsite')) {
    const copied = await copyFullBackupToS3(backup)
    console.log(copied ? `Copied to S3 under backups/full/${backup.name}.sql.gz` : 'No S3 bucket configured (AWS_S3_BUCKET and keys), so nothing was copied off the server.')
  }
  if (process.argv.includes('--prune')) console.log(`${await pruneFullBackups(14)} old full backup(s) removed`)
  process.exit(0)
}

run().catch((err) => {
  console.error('Full backup failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
